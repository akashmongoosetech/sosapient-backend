// Template A — the thank-you a visitor receives after submitting the contact
// form.
//
// Nothing administrator-only appears here: no internal mailbox, no delivery
// metadata, and no full copy of the submitted message. The only submitted value
// it echoes back is the subject line.

const { BRAND, COMPANY } = require('./theme');
const { escapeHtml, paragraph, greeting, sectionLabel, button, panel, steps, toText } = require('./primitives');
const { renderLayout, textContactLines, textSocialLines } = require('./layout');

const STEPS = [
  'We review your enquiry and work out the best-fit approach.',
  'You get a personal reply from our team.',
  'We arrange a free consultation call at a time that suits you.'
];

function contactVisitorEmail(contact) {
  const source = contact || {};
  const name = toText(source.name);
  const subject = toText(source.subject);
  const quoted = subject ? ` &mdash; &ldquo;${escapeHtml(subject.slice(0, 120))}&rdquo;` : '';

  const bodyHtml = [
    paragraph(
      `Thank you for getting in touch with ${escapeHtml(
        COMPANY.name
      )}. <strong>We have received your message</strong>${quoted} and appreciate your interest in our services.`
    ),
    paragraph('Our team will review your inquiry and get back to you as appropriate.'),
    sectionLabel('What happens next'),
    panel(steps(STEPS)),
    paragraph(escapeHtml(COMPANY.responseTime), { size: 14, color: BRAND.muted }),
    button('Visit our website', COMPANY.website),
    paragraph('Need to add something? Just reply to this email.', { size: 14, color: BRAND.muted, margin: '0' })
  ].join('');

  const text = [
    `Hi ${name || 'there'},`,
    '',
    `Thank you for getting in touch with ${COMPANY.name}. We have received your message${
      subject ? ` — "${subject.slice(0, 120)}"` : ''
    } and appreciate your interest in our services.`,
    'Our team will review your inquiry and get back to you as appropriate.',
    '',
    'What happens next',
    ...STEPS.map((step, index) => `${index + 1}. ${step}`),
    '',
    COMPANY.responseTime,
    '',
    `Visit our website: ${COMPANY.website}`,
    '',
    'Need to add something? Just reply to this email.',
    '',
    'Warm regards,',
    `The ${COMPANY.name} Team`,
    '',
    ...textContactLines(false),
    '',
    'Follow us',
    ...textSocialLines()
  ].join('\n');

  return {
    subject: `Thank You for Contacting ${COMPANY.name}`,
    toName: name,
    html: renderLayout({
      docTitle: `Thank You for Contacting ${COMPANY.name}`,
      preheader: `We have received your message and our team will be in touch.`,
      eyebrow: 'Message received',
      bannerHeading: 'Thank You for Reaching Out!',
      bannerText: 'Your enquiry has reached our team, and we will take it from here.',
      introHtml: greeting(name),
      bodyHtml,
      signature: { closing: 'Warm regards,', name: `The ${COMPANY.name} Team` },
      showMailbox: false
    }),
    text
  };
}

module.exports = { contactVisitorEmail };
