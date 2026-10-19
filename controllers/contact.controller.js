const Contact = require('../models/contact.model');
const { sendContactEmails, summarise, persistDelivery } = require('../utils/emailService');
const { isHoneypotFilled } = require('../utils/honeypot');

function errDetail(error) {
  return process.env.NODE_ENV === 'production' ? undefined : error.message;
}

const CONTACT_FIELDS = ['name', 'email', 'company', 'phone', 'subject', 'message', 'budget', 'timeline'];
const CONTACT_MAX = { name: 100, email: 160, company: 160, phone: 40, subject: 200, message: 5000 };
const CONTACT_BUDGET = ['under-10k', '10k-25k', '25k-50k', '50k-100k', 'over-100k'];
const CONTACT_TIMELINE = ['asap', '1-3-months', '3-6-months', '6-12-months', 'flexible'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Single-line fields: collapse every control character (including newlines) so
// nothing can smuggle a line break into a mail header.
function cleanLine(value, max) {
  const s = String(value).replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim();
  return max ? s.slice(0, max) : s;
}

// Multi-line fields (the message): keep line breaks, drop everything else that
// has no business being in the document.
function cleanBlock(value, max) {
  const s = String(value)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
  return max ? s.slice(0, max) : s;
}

// Whitelist the known fields only. Anything else in the body (honeypot,
// reCAPTCHA token, stray keys) is dropped before it can reach the database.
function pickContact(body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
  const out = {};
  for (const key of CONTACT_FIELDS) {
    const raw = body[key];
    if (raw === undefined || raw === null || raw === '') continue;
    if (typeof raw !== 'string') continue;
    out[key] = key === 'message' ? cleanBlock(raw, CONTACT_MAX.message) : cleanLine(raw, CONTACT_MAX[key]);
  }
  if (out.email) out.email = out.email.toLowerCase();
  return out;
}

// Server-side validation. The frontend validates too, but the API never trusts it.
function validateContact(data) {
  if (!data.name) return 'Name is required';
  if (!data.email) return 'Email is required';
  if (!EMAIL_PATTERN.test(data.email)) return 'Please enter a valid email address';
  if (!data.subject) return 'Subject is required';
  if (!data.message) return 'Message is required';
  if (data.budget !== undefined && !CONTACT_BUDGET.includes(data.budget)) {
    return 'Please choose a valid budget range';
  }
  if (data.timeline !== undefined && !CONTACT_TIMELINE.includes(data.timeline)) {
    return 'Please choose a valid timeline';
  }
  return '';
}

// The stored document goes back to the client without its delivery record: the
// per-recipient status is returned in `delivery`, while the provider error codes
// inside the document are operational detail that stays server-side.
function publicContact(contact) {
  const obj = contact.toObject();
  delete obj.emailDelivery;
  return obj;
}

// Create new contact submission
exports.createContact = async (req, res) => {
  try {
    if (isHoneypotFilled(req.body)) {
      // Fake success: bots must not learn they were detected.
      return res.status(201).json({ success: true, message: 'Contact form submitted successfully' });
    }

    const picked = pickContact(req.body);
    const problem = validateContact(picked);
    if (problem) {
      return res.status(400).json({ success: false, message: problem });
    }

    const contact = await Contact.create(picked);

    // The enquiry is stored at this point. Email is best-effort and a delivery
    // problem must never undo the saved enquiry, be retried into a duplicate, or
    // be reported to the visitor as a submission failure.
    const delivery = await sendContactEmails(contact);
    await persistDelivery(contact, delivery);

    res.status(201).json({
      success: true,
      message: 'Contact form submitted successfully',
      data: publicContact(contact),
      // Statuses only — never the administrator address or any provider detail.
      delivery: summarise(delivery)
    });
  } catch (error) {
    if (error && error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Please check the form and try again.',
        error: errDetail(error)
      });
    }
    console.error('[contact] submit failed');
    res.status(500).json({
      success: false,
      message: 'Error submitting contact form',
      error: errDetail(error)
    });
  }
};

// Get all contact submissions
exports.getAllContacts = async (req, res) => {
  try {
    const page = Math.min(Math.max(parseInt(req.query.page, 10) || 1, 1), 1000);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const [contacts, total] = await Promise.all([
      Contact.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      Contact.countDocuments()
    ]);
    res.status(200).json({
      success: true,
      data: contacts,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching contacts',
      error: errDetail(error)
    });
  }
};

// Get single contact submission
exports.getContact = async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }
    res.status(200).json({
      success: true,
      data: contact
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching contact',
      error: errDetail(error)
    });
  }
};

// Update contact status
exports.updateContact = async (req, res) => {
  try {
    const allowedStatus = ['new', 'read', 'replied', 'archived'];
    if (req.body.status && !allowedStatus.includes(req.body.status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value' });
    }
    const contact = await Contact.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true, runValidators: true }
    );
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }
    res.status(200).json({
      success: true,
      data: contact
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating contact',
      error: errDetail(error)
    });
  }
};

// Delete contact submission
exports.deleteContact = async (req, res) => {
  try {
    const contact = await Contact.findByIdAndDelete(req.params.id);
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }
    res.status(200).json({
      success: true,
      message: 'Contact deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting contact',
      error: errDetail(error)
    });
  }
}; 