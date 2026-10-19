// Branded HTML + plain-text email templates.
//
// Email clients are not browsers: everything is table-based with inline styles,
// there is no JavaScript, no external stylesheet and no web font. Values that
// came from a form are always escaped before they reach the markup.
//
// Brand palette mirrors the website's tailwind tokens (primary #7F5FA8,
// secondary #39269B) and the logo is the same asset the site serves publicly.

const BRAND = {
  primary: '#7F5FA8',
  primaryDark: '#5a3f7a',
  secondary: '#39269B',
  ink: '#1f2937',
  muted: '#6b7280',
  border: '#e5e7eb',
  page: '#f3f4f6',
  card: '#ffffff',
  panel: '#f9fafb'
};

// Verified public company details (taken from the live contact page — not invented).
const COMPANY = {
  name: 'SoSapient',
  website: 'https://sosapient.in',
  email: 'admin@sosapient.in',
  phone: '+91-9685533878',
  address: 'Anand Nagar, Vasant Vihar, Ujjain (M.P.) 456010, India',
  logoUrl: 'https://sosapient.in/logo/Dlogo.png',
  // Existing site copy — reused rather than inventing a new commitment.
  responseTime: 'We typically respond to all inquiries within 24 hours during business days.',
  social: [
    { label: 'Facebook', url: 'https://www.facebook.com/profile.php?id=61553017931533' },
    { label: 'X', url: 'https://x.com/SoSapient_tech' },
    { label: 'LinkedIn', url: 'https://www.linkedin.com/company/100043699/' },
    { label: 'Instagram', url: 'https://www.instagram.com/sosapient/' }
  ]
};

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Multi-line user input (the message body) keeps its line breaks but is escaped
// first, so a pasted <script> is rendered as text.
function escapeMultiline(value) {
  return escapeHtml(value).replace(/\r?\n/g, '<br />');
}

// Unambiguous, human-readable timestamp in the company's timezone.
function formatIst(date) {
  const d = date instanceof Date ? date : new Date(date || Date.now());
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
    .formatToParts(d)
    .reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
  return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute} IST`;
}

function button(label, url) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
    <tr>
      <td align="center" bgcolor="${BRAND.secondary}" style="border-radius:8px;">
        <a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(
          label
        )}</a>
      </td>
    </tr>
  </table>`;
}

// Label/value rows, skipping anything the visitor did not fill in.
function detailRows(pairs) {
  const visible = pairs.filter(([, value]) => String(value == null ? '' : value).trim() !== '');
  if (visible.length === 0) return '';

  const rows = visible
    .map(
      ([label, value, multiline]) => `<tr>
        <td style="padding:10px 14px;border-bottom:1px solid ${BRAND.border};font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:${BRAND.muted};width:34%;vertical-align:top;white-space:nowrap;">${escapeHtml(
          label
        )}</td>
        <td style="padding:10px 14px;border-bottom:1px solid ${BRAND.border};font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${BRAND.ink};vertical-align:top;">${
          multiline ? escapeMultiline(value) : escapeHtml(value)
        }</td>
      </tr>`
    )
    .join('');

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:${BRAND.panel};border:1px solid ${BRAND.border};border-radius:8px;overflow:hidden;">
    ${rows}
  </table>`;
}

// Single responsive shell reused by every message.
//
// `showMailbox` is off for visitor-facing mail: the internal contact mailbox is
// not a channel we want to publish in a confirmation email.
function renderLayout({ preheader = '', heading, introHtml = '', bodyHtml = '', showMailbox = true }) {
  const social = COMPANY.social
    .map(
      (s) =>
        `<a href="${escapeHtml(s.url)}" style="display:inline-block;margin:0 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${BRAND.primaryDark};text-decoration:none;">${escapeHtml(
          s.label
        )}</a>`
    )
    .join(' &middot; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.page};">
<div style="display:none;font-size:1px;color:${BRAND.page};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(
    preheader
  )}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${BRAND.page};padding:24px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;background-color:${BRAND.card};border-radius:12px;overflow:hidden;border:1px solid ${BRAND.border};">
        <tr>
          <td align="center" bgcolor="${BRAND.secondary}" style="padding:26px 24px;">
            <img src="${escapeHtml(COMPANY.logoUrl)}" alt="${escapeHtml(
    COMPANY.name
  )}" width="150" style="display:block;max-width:150px;height:auto;border:0;" />
          </td>
        </tr>
        <tr>
          <td style="padding:32px 28px;">
            <h1 style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3;color:${BRAND.ink};">${escapeHtml(
    heading
          )}</h1>
            ${introHtml}
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:22px 28px;background-color:${BRAND.panel};border-top:1px solid ${BRAND.border};">
            <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:${BRAND.ink};">${escapeHtml(
    COMPANY.name
  )}</p>
            <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${BRAND.muted};">
              ${escapeHtml(COMPANY.address)}<br />
              ${
                showMailbox
                  ? `<a href="mailto:${escapeHtml(COMPANY.email)}" style="color:${BRAND.primaryDark};text-decoration:none;">${escapeHtml(
                      COMPANY.email
                    )}</a> &middot; `
                  : ''
              }${escapeHtml(COMPANY.phone)}<br />
              <a href="${escapeHtml(COMPANY.website)}" style="color:${BRAND.primaryDark};text-decoration:none;">${escapeHtml(
    COMPANY.website.replace(/^https?:\/\//, '')
  )}</a>
            </p>
            <p style="margin:10px 0 0;">${social}</p>
          </td>
        </tr>
      </table>
      <p style="margin:14px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${BRAND.muted};">
        &copy; ${new Date().getFullYear()} ${escapeHtml(COMPANY.name)}. All rights reserved.
      </p>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function paragraph(textHtml) {
  return `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.ink};">${textHtml}</p>`;
}

function greeting(name) {
  const safe = escapeHtml(String(name || '').trim());
  return paragraph(safe ? `Hi ${safe},` : 'Hi there,');
}

// --- Contact form: visitor confirmation -----------------------------------

function contactVisitorEmail(contact) {
  const heading = `Thank you for contacting ${COMPANY.name}`;
  const subject = `Thank You for Contacting ${COMPANY.name}`;

  const bodyHtml = [
    paragraph(
      `Thanks for getting in touch. We have received your message<span style="color:${
        BRAND.muted
      };"> &ldquo;${escapeHtml(String(contact.subject || '').slice(0, 120))}&rdquo;</span> and it is now with our team.`
    ),
    paragraph(
      'A member of our team will review your requirements and reply to this address. If your enquiry is urgent, you can reach us directly using the details below.'
    ),
    paragraph(
      `<strong>What happens next</strong><br />1. We review your enquiry and work out the best-fit approach.<br />2. You get a personal reply from our team.<br />3. We arrange a free consultation call at a time that suits you.`
    ),
    paragraph(escapeHtml(COMPANY.responseTime)),
    button('Visit our website', COMPANY.website),
    `<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:${BRAND.muted};">Need to add something? Just reply to this email.</p>`
  ].join('');

  const text = [
    `Hi ${String(contact.name || '').trim() || 'there'},`,
    '',
    `Thank you for contacting ${COMPANY.name}.`,
    '',
    `We have received your message${contact.subject ? ` ("${String(contact.subject).slice(0, 120)}")` : ''} and it is now with our team.`,
    'A member of our team will review your requirements and reply to this address.',
    '',
    'What happens next',
    '1. We review your enquiry and work out the best-fit approach.',
    '2. You get a personal reply from our team.',
    '3. We arrange a free consultation call at a time that suits you.',
    '',
    COMPANY.responseTime,
    '',
    'Need to add something? Just reply to this email.',
    '',
    `${COMPANY.name}`,
    COMPANY.website,
    COMPANY.phone,
    COMPANY.address
  ].join('\n');

  return { subject, html: renderLayout({ preheader: 'We have received your message.', heading, introHtml: greeting(contact.name), bodyHtml, showMailbox: false }), text };
}

// --- Contact form: administrator notification ------------------------------

function contactAdminEmail(contact) {
  const heading = 'New contact form inquiry';
  const subject = `New Contact Form Inquiry — ${COMPANY.name}`;

  const details = detailRows([
    ['Name', contact.name],
    ['Email', contact.email],
    ['Phone', contact.phone],
    ['Company', contact.company],
    ['Subject', contact.subject],
    ['Budget', contact.budget],
    ['Timeline', contact.timeline],
    ['Received', formatIst(contact.createdAt)],
    ['Source', contact.source]
  ]);

  const bodyHtml = [
    paragraph(`A new inquiry was submitted on the website. Reply directly to this email to answer it.`),
    details,
    `<p style="margin:24px 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:${BRAND.muted};text-transform:uppercase;letter-spacing:0.06em;">Message</p>
     <div style="padding:16px;background:${BRAND.panel};border:1px solid ${BRAND.border};border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:${BRAND.ink};">${escapeMultiline(
      contact.message
    )}</div>`
  ].join('');

  const text = [
    'A new inquiry was submitted on the website.',
    '',
    'Name:      ' + (contact.name || ''),
    'Email:     ' + (contact.email || ''),
    'Phone:     ' + (contact.phone || ''),
    'Company:   ' + (contact.company || ''),
    'Subject:   ' + (contact.subject || ''),
    'Budget:    ' + (contact.budget || ''),
    'Timeline:  ' + (contact.timeline || ''),
    'Received:  ' + formatIst(contact.createdAt),
    'Source:    ' + (contact.source || ''),
    '',
    'Message:',
    String(contact.message || ''),
    '',
    'Reply to this email to answer the visitor directly.'
  ]
    .join('\n');

  return { subject, html: renderLayout({ preheader: `New inquiry from ${contact.name || 'a website visitor'}.`, heading, bodyHtml }), text };
}

// --- Career application: applicant confirmation ----------------------------

function careerVisitorEmail(career) {
  const heading = `Thank you for applying to ${COMPANY.name}`;
  const subject = `Thank you for your application - ${COMPANY.name}`;

  const details = detailRows([
    ['Position', career.position],
    ['Name', career.name],
    ['Email', career.email],
    ['Phone', career.phone],
    ['Experience', career.experience],
    ['Notice period', career.noticePeriod]
  ]);

  const bodyHtml = [
    paragraph(
      `We have received your application for the <strong>${escapeHtml(
        String(career.position || '')
      )}</strong> position. Thank you for taking the time to apply.`
    ),
    details,
    paragraph('Our team will review your profile and contact you if your experience matches what we are looking for.'),
    paragraph('If you have any questions in the meantime, just reply to this email.')
  ].join('');

  const text = [
    `Hi ${String(career.name || '').trim() || 'there'},`,
    '',
    `Thank you for applying to ${COMPANY.name}.`,
    '',
    `We have received your application for the ${career.position || ''} position.`,
    'Our team will review your profile and contact you if your experience matches what we are looking for.',
    '',
    'Questions? Just reply to this email.',
    '',
    COMPANY.name,
    COMPANY.website
  ].join('\n');

  return { subject, html: renderLayout({ preheader: 'We have received your application.', heading, introHtml: greeting(career.name), bodyHtml, showMailbox: false }), text };
}

// --- Career application: administrator notification ------------------------

function careerAdminEmail(career) {
  const heading = 'New job application';
  const subject = `New Job Application — ${COMPANY.name}`;

  const details = detailRows([
    ['Position', career.position],
    ['Name', career.name],
    ['Email', career.email],
    ['Phone', career.phone],
    ['Experience', career.experience],
    ['Current company', career.currentCompany],
    ['Expected salary', career.expectedSalary],
    ['Notice period', career.noticePeriod],
    ['Submitted', formatIst(career.createdAt)]
  ]);

  const resumeNote = career.resume && career.resume.filename
    ? paragraph(`Attached resume: <strong>${escapeHtml(career.resume.filename)}</strong>. Download it from the admin dashboard.`)
    : paragraph('No resume file name was recorded. Check the admin dashboard.');

  const bodyHtml = [
    paragraph('A new job application was submitted on the website.'),
    details,
    career.coverLetter
      ? `<p style="margin:24px 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:${BRAND.muted};text-transform:uppercase;letter-spacing:0.06em;">Cover letter</p>
         <div style="padding:16px;background:${BRAND.panel};border:1px solid ${BRAND.border};border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:${BRAND.ink};">${escapeMultiline(
        career.coverLetter
      )}</div>`
      : '',
    resumeNote
  ].join('');

  const text = [
    'A new job application was submitted on the website.',
    [
      'Position:        ' + (career.position || ''),
      'Name:            ' + (career.name || ''),
      'Email:           ' + (career.email || ''),
      'Phone:           ' + (career.phone || ''),
      'Experience:      ' + (career.experience || ''),
      'Current company: ' + (career.currentCompany || ''),
      'Expected salary: ' + (career.expectedSalary || ''),
      'Notice period:   ' + (career.noticePeriod || ''),
      'Submitted:       ' + formatIst(career.createdAt)
    ].join('\n'),
    career.coverLetter ? `Cover letter:\n${career.coverLetter}` : '',
    `Resume: ${(career.resume && career.resume.filename) || 'see the admin dashboard'}`
  ]
    .filter(Boolean)
    .join('\n\n');

  return { subject, html: renderLayout({ preheader: `New application from ${career.name || 'a candidate'}.`, heading, bodyHtml }), text };
}

module.exports = {
  BRAND,
  COMPANY,
  escapeHtml,
  escapeMultiline,
  formatIst,
  contactVisitorEmail,
  contactAdminEmail,
  careerVisitorEmail,
  careerAdminEmail
};
