// Template B — the internal notification for a new contact-form inquiry.
//
// This one is optimised for information density rather than marketing: every
// field the form actually collects, in the order a person triages them, with a
// reply action that reaches the visitor. The recipient is fixed in
// utils/emailService.js and can never be influenced by the submission.
//
// Every user-supplied value is escaped before it reaches the markup, and only a
// value that already looks like a valid address is turned into a mailto: link,
// so a crafted value cannot break out of an href.

const { COMPANY } = require('./theme');
const {
  escapeHtml,
  escapeMultiline,
  isEmail,
  toText,
  paragraph,
  sectionLabel,
  button,
  panel,
  detailRows,
  emailLink,
  formatIst
} = require('./primitives');
const { renderLayout, textContactLines, textSocialLines } = require('./layout');

function contactAdminEmail(contact, options = {}) {
  // The footer mailbox follows the configured contact sender, so it never
  // advertises an address the message was not actually sent from.
  const mailbox = String(options.mailbox || '').trim();
  const source = contact || {};
  const name = toText(source.name);
  const email = toText(source.email);
  const message = toText(source.message);

  const details = detailRows([
    ['Name', name],
    ['Email', emailLink(email), { html: true }],
    ['Phone', source.phone],
    ['Company', source.company],
    ['Subject', source.subject],
    ['Budget', source.budget],
    ['Timeline', source.timeline],
    ['Received', source.createdAt ? formatIst(source.createdAt) : ''],
    ['Source', source.source]
  ]);

  const bodyHtml = [
    paragraph(
      `A new visitor has submitted the contact form on the ${escapeHtml(
        COMPANY.name
      )} website. Review the details below and follow up as appropriate.`
    ),
    sectionLabel('Inquiry details'),
    details,
    sectionLabel('Message'),
    panel(message ? escapeMultiline(message) : '<em>No message was included.</em>'),
    isEmail(email) ? button(`Reply to ${name || 'the visitor'}`, `mailto:${email}`) : ''
  ].join('');

  const text = [
    `A new visitor has submitted the contact form on the ${COMPANY.name} website.`,
    'Review the details below and follow up as appropriate.',
    '',
    'Inquiry details',
    `Name:      ${name}`,
    `Email:     ${email}`,
    `Phone:     ${toText(source.phone)}`,
    `Company:   ${toText(source.company)}`,
    `Subject:   ${toText(source.subject)}`,
    `Budget:    ${toText(source.budget)}`,
    `Timeline:  ${toText(source.timeline)}`,
    `Received:  ${source.createdAt ? formatIst(source.createdAt) : ''}`,
    `Source:    ${toText(source.source)}`,
    '',
    'Message:',
    message,
    '',
    'Reply to this email to answer the visitor directly.',
    '',
    'Regards,',
    `The ${COMPANY.name} Team`,
    '',
    ...textContactLines(true, mailbox),
    '',
    'Follow us',
    ...textSocialLines()
  ].join('\n');

  return {
    subject: `New Contact Form Inquiry — ${COMPANY.name}`,
    html: renderLayout({
      docTitle: `New Contact Form Inquiry — ${COMPANY.name}`,
      preheader: `New inquiry from ${name || 'a website visitor'}.`,
      eyebrow: 'New inquiry',
      bannerHeading: 'You Have a New Inquiry',
      bannerText: 'A new visitor has submitted the contact form on the website.',
      bodyHtml,
      signature: { closing: 'Regards,', name: `The ${COMPANY.name} Team` },
      showMailbox: true,
      mailbox
    }),
    text
  };
}

module.exports = { contactAdminEmail };
