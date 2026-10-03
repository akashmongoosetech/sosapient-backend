const Contact = require('../models/contact.model');
const { sendContactEmail } = require('../utils/emailService');

function errDetail(error) {
  return process.env.NODE_ENV === 'production' ? undefined : error.message;
}
const CONTACT_FIELDS = ['name', 'email', 'company', 'phone', 'subject', 'message', 'budget', 'timeline'];
function pickContact(body = {}) {
  const out = {};
  for (const k of CONTACT_FIELDS) {
    if (body[k] !== undefined && body[k] !== '') out[k] = body[k];
  }
  return out;
}

// Create new contact submission
exports.createContact = async (req, res) => {
  try {
    const contact = new Contact(pickContact(req.body));
    await contact.save();

    // Try to send email notification (don't fail if email fails)
    let emailSent = false;
    try {
      await sendContactEmail(contact);
      emailSent = true;
    } catch (emailError) {
      console.error('Email notification failed');
      // Continue without failing the request
    }

    res.status(201).json({
      success: true,
      message: emailSent
        ? 'Contact form submitted successfully and email notification sent'
        : 'Contact form submitted successfully (email notification failed)',
      data: contact
    });
  } catch (error) {
    res.status(400).json({
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
    const contacts = await Contact.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit);
    res.status(200).json({
      success: true,
      data: contacts,
      pagination: { page, limit }
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