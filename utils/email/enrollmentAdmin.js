// Course enrollment — the notification an administrator receives when a
// candidate enrolls (paid or free). Contains all details needed for follow-up.

const { BRAND, COMPANY } = require('./theme');
const { escapeHtml, paragraph, greeting, sectionLabel, button, panel, detailRows, toText, formatIst } = require('./primitives');
const { renderLayout, textContactLines, textSocialLines } = require('./layout');

function enrollmentAdminEmail(enrollment, training, mailbox) {
  const source = training || {};
  const name = toText(enrollment.candidateName);
  const title = toText(enrollment.courseTitleSnapshot);
  const amount = enrollment.amount > 0 ? `₹${enrollment.amount.toLocaleString()}` : 'Free';
  const paidAt = enrollment.paidAt ? formatIst(enrollment.paidAt) : '—';
  const enrolledAt = formatIst(enrollment.enrolledAt);
  const startDate = source.startDate ? formatIst(source.startDate) : '—';
  const mode = source.trainingMode || '—';

  const details = detailRows([
    ['Candidate', name],
    ['Email', enrollment.email],
    ['Mobile', enrollment.mobile],
    ['Qualification', enrollment.qualification || '—'],
    ['Organization', enrollment.organization || '—'],
    ['Message', enrollment.message || '—'],
    ['Course', title],
    ['Amount', amount],
    ['Payment Type', enrollment.paymentType || 'Free'],
    ['Enrollment Status', enrollment.enrollmentStatus],
    ['Payment Status', enrollment.paymentStatus],
    ['Transaction ID', enrollment.transactionId || '—'],
    [enrollment.razorpayPaymentId ? 'Razorpay Payment ID' : null, enrollment.razorpayPaymentId || null],
    ['Enrollment Date', enrolledAt],
    ['Payment Date', paidAt],
    ['Course Start Date', startDate],
    ['Course Mode', mode]
  ].filter((row) => row[0] !== null));

  const bodyHtml = [
    paragraph(
      `A new course enrollment has been recorded for <strong>${escapeHtml(title)}</strong>.`
    ),
    sectionLabel('Enrollment details'),
    details,
    panel(
      paragraph(
        `You can review and manage all enrollments from the admin panel. Do not manually mark a payment as successful without verified payment evidence.`,
        { margin: '18px 0 16px' }
      )
    ),
    button('View enrollments', `${COMPANY.website}/admin/trainings/enrollments`)
  ].join('');

  const text = [
    `Hi ${COMPANY.name} Admin,`,
    '',
    `A new course enrollment has been recorded for ${title}.`,
    '',
    'Enrollment details:',
    `Candidate: ${name}`,
    `Email: ${enrollment.email}`,
    `Mobile: ${enrollment.mobile}`,
    `Qualification: ${enrollment.qualification || '—'}`,
    `Organization: ${enrollment.organization || '—'}`,
    `Message: ${enrollment.message || '—'}`,
    `Course: ${title}`,
    `Amount: ${amount}`,
    `Payment Type: ${enrollment.paymentType || 'Free'}`,
    `Enrollment Status: ${enrollment.enrollmentStatus}`,
    `Payment Status: ${enrollment.paymentStatus}`,
    `Transaction ID: ${enrollment.transactionId || '—'}`,
    enrollment.razorpayPaymentId ? `Razorpay Payment ID: ${enrollment.razorpayPaymentId}` : '',
    `Enrollment Date: ${enrolledAt}`,
    `Payment Date: ${paidAt}`,
    `Course Start Date: ${startDate}`,
    `Course Mode: ${mode}`,
    '',
    `View and manage enrollments: ${COMPANY.website}/admin/trainings/enrollments`,
    '',
    '—',
    `The ${COMPANY.name} System`,
    '',
    ...textContactLines(false),
    '',
    'Follow us',
    ...textSocialLines()
  ].join('\n');

  return {
    subject: `New Course Enrollment — ${title} — ${COMPANY.name}`,
    toName: 'Administrator',
    html: renderLayout({
      docTitle: `New course enrollment — ${COMPANY.name}`,
      preheader: 'A new course enrollment has been recorded.',
      eyebrow: 'New enrollment',
      bannerHeading: 'New Enrollment',
      bannerText: `${name} enrolled in ${title}.`,
      introHtml: greeting('Administrator'),
      bodyHtml,
      signature: { closing: '—', name: `The ${COMPANY.name} System` },
      showMailbox: true,
      mailbox
    }),
    text
  };
}

module.exports = { enrollmentAdminEmail };
