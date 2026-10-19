// Career application — the internal notification for a new applicant.
//
// Same information-first treatment as the contact notice: the fields a recruiter
// screens on, the cover letter when one was written, and a note about the CV
// that lives in the admin dashboard rather than in the mail.

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

function careerAdminEmail(career, options = {}) {
  // The recruiter mailbox shown in the footer belongs to the career flow, not
  // the general contact address. emailService passes the configured sender.
  const mailbox = String(options.mailbox || '').trim();
  const source = career || {};
  const name = toText(source.name);
  const email = toText(source.email);
  const position = toText(source.position);
  const coverLetter = toText(source.coverLetter);
  const resumeName = source.resume && source.resume.filename ? toText(source.resume.filename) : '';

  const details = detailRows([
    ['Position', position],
    ['Name', name],
    ['Email', emailLink(email), { html: true }],
    ['Phone', source.phone],
    ['Experience', source.experience],
    ['Current company', source.currentCompany],
    ['Expected salary', source.expectedSalary],
    ['Notice period', source.noticePeriod],
    ['Submitted', source.createdAt ? formatIst(source.createdAt) : '']
  ]);

  const bodyHtml = [
    paragraph(`A new job application was submitted on the ${escapeHtml(COMPANY.name)} website.`),
    sectionLabel('Applicant details'),
    details,
    coverLetter ? sectionLabel('Cover letter') : '',
    coverLetter ? panel(escapeMultiline(coverLetter)) : '',
    sectionLabel('Resume'),
    panel(
      resumeName
        ? `Attached file: <strong>${escapeHtml(resumeName)}</strong>. Download it from the admin dashboard.`
        : 'No resume file name was recorded. Check the admin dashboard.'
    ),
    isEmail(email) ? button(`Reply to ${name || 'the applicant'}`, `mailto:${email}`) : ''
  ].join('');

  const textLines = [
    `A new job application was submitted on the ${COMPANY.name} website.`,
    '',
    'Applicant details',
    `Position:        ${position}`,
    `Name:            ${name}`,
    `Email:           ${email}`,
    `Phone:           ${toText(source.phone)}`,
    `Experience:      ${toText(source.experience)}`,
    `Current company: ${toText(source.currentCompany)}`,
    `Expected salary: ${toText(source.expectedSalary)}`,
    `Notice period:   ${toText(source.noticePeriod)}`,
    `Submitted:       ${source.createdAt ? formatIst(source.createdAt) : ''}`
  ];

  if (coverLetter) {
    textLines.push('', 'Cover letter:', coverLetter);
  }

  textLines.push(
    '',
    `Resume: ${resumeName || 'see the admin dashboard'}`,
    '',
    'Reply to this email to answer the applicant directly.',
    '',
    'Regards,',
    `The ${COMPANY.name} Team`,
    '',
    ...textContactLines(true, mailbox),
    '',
    'Follow us',
    ...textSocialLines()
  );

  const text = textLines.join('\n');

  return {
    subject: `New Job Application — ${COMPANY.name}`,
    html: renderLayout({
      docTitle: `New Job Application — ${COMPANY.name}`,
      preheader: `New application from ${name || 'a candidate'}.`,
      eyebrow: 'New applicant',
      bannerHeading: 'New Job Application',
      bannerText: 'A candidate has applied through the careers page.',
      bodyHtml,
      signature: { closing: 'Regards,', name: `The ${COMPANY.name} Team` },
      showMailbox: true,
      mailbox
    }),
    text
  };
}

module.exports = { careerAdminEmail };
