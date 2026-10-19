// Career application — the confirmation an applicant receives.
//
// Deliberately no promises about outcome or timing, and no administrator-only
// information: the internal mailbox stays out.

const { BRAND, COMPANY } = require('./theme');
const { escapeHtml, paragraph, greeting, sectionLabel, button, panel, detailRows, toText } = require('./primitives');
const { renderLayout, textContactLines, textSocialLines } = require('./layout');

function careerVisitorEmail(career) {
  const source = career || {};
  const name = toText(source.name);
  const position = toText(source.position);

  const details = detailRows([
    ['Position', position],
    ['Name', name],
    ['Email', source.email],
    ['Phone', source.phone],
    ['Experience', source.experience],
    ['Notice period', source.noticePeriod]
  ]);

  const bodyHtml = [
    paragraph(
      `We have received your application for the <strong>${escapeHtml(
        position
      )}</strong> position. Thank you for taking the time to apply.`
    ),
    sectionLabel('Your application'),
    details,
    paragraph('Our team will review your profile and contact you if your experience matches what we are looking for.'),
    paragraph('If you have any questions in the meantime, just reply to this email.', { size: 14, color: BRAND.muted }),
    button('Visit our website', COMPANY.website)
  ].join('');

  const text = [
    `Hi ${name || 'there'},`,
    '',
    `Thank you for applying to ${COMPANY.name}.`,
    '',
    `We have received your application for the ${position} position.`,
    'Our team will review your profile and contact you if your experience matches what we are looking for.',
    '',
    'Questions? Just reply to this email.',
    '',
    `Visit our website: ${COMPANY.website}`,
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
    subject: `Thank you for your application - ${COMPANY.name}`,
    toName: name,
    html: renderLayout({
      docTitle: `Thank you for applying to ${COMPANY.name}`,
      preheader: 'We have received your application.',
      eyebrow: 'Application received',
      bannerHeading: 'Thanks for Applying',
      bannerText: 'Your application is with our team and we will review it carefully.',
      introHtml: greeting(name),
      bodyHtml,
      signature: { closing: 'Warm regards,', name: `The ${COMPANY.name} Team` },
      showMailbox: false
    }),
    text
  };
}

module.exports = { careerVisitorEmail };
