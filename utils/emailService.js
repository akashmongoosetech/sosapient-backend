// Email orchestration: turns a stored inquiry or application into the messages
// that get sent through Brevo.
//
// Delivery rules that matter:
//   - The two messages are independent. One failing must never block, retry or
//     duplicate the other.
//   - A send is only reported as "sent" once Brevo has accepted it. Acceptance
//     is still not inbox placement — see utils/brevo.js.
//   - Provider errors are reduced to a short code. Raw provider text and
//     message bodies never reach the logs or the client.

const { sendTransactionalEmail, EmailConfigError, warnIfMisconfigured } = require('./brevo');
const templates = require('./emailTemplates');

const STATUS_SENT = 'sent';
const STATUS_FAILED = 'failed';
const STATUS_SKIPPED = 'skipped';
const NO_RECIPIENT = 'no-admin-recipient';

const DEFAULT_SENDER_NAME = 'SoSapient';

function defaultSender() {
  return {
    email: String(process.env.BREVO_SENDER_EMAIL || '').trim(),
    name: String(process.env.BREVO_SENDER_NAME || '').trim() || DEFAULT_SENDER_NAME
  };
}

// Contact mail uses the long-standing shared sender.
function contactSender() {
  return defaultSender();
}

// Career mail can come from a separate mailbox (usually hrd@) so a candidate's
// reply reaches the people who hire. Unset, it falls back rather than failing,
// which keeps an un-updated deployment working.
function careerSender() {
  const sender = defaultSender();
  const configured = String(process.env.CAREER_SENDER_EMAIL || '').trim();
  return configured ? { ...sender, email: configured } : sender;
}

// Fixed, server-configured recipient. The client can never influence this.
// Contact: CONTACT_ADMIN_EMAIL, then ADMIN_EMAIL.
// Career:  CAREER_ADMIN_EMAIL, then CONTACT_ADMIN_EMAIL, then ADMIN_EMAIL.
function resolveAdminRecipient(flow = 'contact') {
  const specific = flow === 'career' ? 'CAREER_ADMIN_EMAIL' : 'CONTACT_ADMIN_EMAIL';
  const configured = String(process.env[specific] || '').trim();
  if (configured) return configured;

  if (flow === 'career') {
    const shared = String(process.env.CONTACT_ADMIN_EMAIL || '').trim();
    if (shared) return shared;
  }

  return String(process.env.ADMIN_EMAIL || '').trim();
}

function failureCode(error) {
  if (error instanceof EmailConfigError) return error.code || 'not-configured';
  return (error && error.code) || 'send-failed';
}

// One message, one attempt-set. Never throws: the caller needs the outcome of
// each message independently. `label` only shapes the log line, so a failure
// says which recipient it belonged to instead of logging an identical line twice.
async function attempt(label, message) {
  try {
    const { messageId } = await sendTransactionalEmail(message);
    return { status: STATUS_SENT, messageId: messageId || '', at: new Date() };
  } catch (error) {
    const code = failureCode(error);
    // Log the label and code only — never the provider's raw response or the
    // email body, both of which carry addresses and message content.
    console.error(`[email] ${label} send failed (${code})`);
    return { status: STATUS_FAILED, code, at: new Date() };
  }
}

function buildMessage(template, to, replyTo, sender) {
  return {
    to,
    toName: template.toName,
    subject: template.subject,
    html: template.html,
    text: template.text,
    replyTo,
    sender
  };
}

function missingRecipient() {
  return Promise.resolve({ status: STATUS_FAILED, code: NO_RECIPIENT, at: new Date() });
}

function summarise(delivery) {
  return {
    visitor: delivery.visitor.status,
    admin: delivery.admin.status
  };
}

// Store only the schema fields — provider message ids are useful in logs but
// are not persisted.
function deliveryEntry(entry) {
  return { status: entry.status, code: entry.code || '', at: entry.at || null };
}

/**
 * Best-effort persistence of a delivery outcome onto the stored document.
 * Bookkeeping must never fail the caller's request, so this never throws.
 *
 * @returns {Promise<boolean>} true when the status was saved.
 */
async function persistDelivery(doc, delivery) {
  try {
    doc.emailDelivery = {
      visitor: deliveryEntry(delivery.visitor),
      admin: deliveryEntry(delivery.admin)
    };
    await doc.save();
    return true;
  } catch {
    console.error('[email] could not persist delivery status');
    return false;
  }
}

/**
 * Send the visitor confirmation and the administrator notification for a
 * contact-form inquiry.
 *
 * The chatbot reuses this with `notifyVisitor: false` to keep its existing
 * admin-only behaviour.
 *
 * @param {object} contact Stored Contact document.
 * @param {{ notifyVisitor?: boolean }} [options]
 * @returns {Promise<{visitor: object, admin: object}>}
 */
async function sendContactEmails(contact, options = {}) {
  const notifyVisitor = options.notifyVisitor !== false;
  warnIfMisconfigured();

  const sender = contactSender();
  const adminTo = resolveAdminRecipient('contact');
  if (!adminTo) console.error('[email] CONTACT_ADMIN_EMAIL is not set; admin notification cannot be sent');

  // The administrator can reply straight to the visitor.
  const adminReplyTo = String(contact.email || '').trim();

  const [adminResult, visitorResult] = await Promise.all([
    adminTo
      ? attempt(
          'contact-admin',
          buildMessage(
            templates.contactAdminEmail(contact, { mailbox: sender.email }),
            adminTo,
            adminReplyTo,
            sender
          )
        )
      : missingRecipient(),
    notifyVisitor
      ? attempt(
          'contact-visitor',
          buildMessage(templates.contactVisitorEmail(contact), contact.email, '', sender)
        )
      : Promise.resolve({ status: STATUS_SKIPPED, at: new Date() })
  ]);

  return { admin: adminResult, visitor: visitorResult };
}

/**
 * Send the applicant confirmation and the administrator notification for a job
 * application.
 *
 * @param {object} career Stored Career document.
 * @returns {Promise<{visitor: object, admin: object}>}
 */
async function sendCareerEmails(career) {
  warnIfMisconfigured();

  const sender = careerSender();
  const adminTo = resolveAdminRecipient('career');
  if (!adminTo) console.error('[email] CAREER_ADMIN_EMAIL is not set; career notification cannot be sent');

  const adminReplyTo = String(career.email || '').trim();

  const [adminResult, visitorResult] = await Promise.all([
    adminTo
      ? attempt(
          'career-admin',
          buildMessage(
            templates.careerAdminEmail(career, { mailbox: sender.email }),
            adminTo,
            adminReplyTo,
            sender
          )
        )
      : missingRecipient(),
    attempt(
      'career-visitor',
      buildMessage(templates.careerVisitorEmail(career), career.email, '', sender)
    )
  ]);

  return { admin: adminResult, visitor: visitorResult };
}

module.exports = {
  resolveAdminRecipient,
  summarise,
  persistDelivery,
  sendContactEmails,
  sendCareerEmails
};
