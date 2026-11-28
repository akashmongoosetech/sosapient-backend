// Course enrollment — the confirmation a candidate receives after payment
// succeeds (or immediately for a free course). Never sent for pending, failed
// or cancelled payments.

const { BRAND, COMPANY } = require('./theme');
const { escapeHtml, paragraph, greeting, sectionLabel, button, panel, detailRows, toText, formatIst } = require('./primitives');
const { renderLayout, textContactLines, textSocialLines } = require('./layout');

function enrollmentCandidateEmail(enrollment, training) {
  const source = training || {};
  const name = toText(enrollment.candidateName);
  const title = toText(enrollment.courseTitleSnapshot);
  const amount = enrollment.amount > 0 ? `₹${enrollment.amount.toLocaleString()}` : 'Free';
  const paidAt = enrollment.paidAt ? formatIst(enrollment.paidAt) : '';
  const startDate = source.startDate ? formatIst(source.startDate) : '—';
  const endDate = source.endDate ? formatIst(source.endDate) : '—';
  const mode = source.trainingMode || '—';
  const duration = source.duration || '—';

  const details = detailRows([
    ['Course', title],
    ['Candidate', name],
    ['Email', enrollment.email],
    ['Mobile', enrollment.mobile],
    ['Amount', amount],
    ['Transaction ID', enrollment.transactionId || '—'],
    [enrollment.razorpayPaymentId ? 'Razorpay Payment ID' : null, enrollment.razorpayPaymentId || null],
    ['Enrollment ID', enrollment._id || '—'],
    ['Payment Date', paidAt || '—'],
    ['Course Start Date', startDate],
    ['Course End Date', endDate],
    ['Course Mode', mode],
    ['Duration', duration]
  ].filter((row) => row[0] !== null));

  const bodyHtml = [
    paragraph(
      `Your enrollment for <strong>${escapeHtml(title)}</strong> is confirmed. Thank you for choosing ${COMPANY.name}.`
    ),
    sectionLabel('Enrollment details'),
    details,
    panel(
      paragraph(
        `You are all set. If your course includes live sessions, you will receive joining details closer to the start date. For any questions about your enrollment, reply to this email or contact us at ${escapeHtml(COMPANY.email)}.`,
        { margin: '18px 0 16px' }
      )
    ),
    button('Visit our website', COMPANY.website)
  ].join('');

  const text = [
    `Hi ${name || 'there'},`,
    '',
    `Your enrollment for ${title} at ${COMPANY.name} is confirmed.`,
    '',
    'Enrollment details:',
    `Course: ${title}`,
    `Candidate: ${name}`,
    `Email: ${enrollment.email}`,
    `Mobile: ${enrollment.mobile}`,
    `Amount: ${amount}`,
    `Transaction ID: ${enrollment.transactionId || '—'}`,
    enrollment.razorpayPaymentId ? `Razorpay Payment ID: ${enrollment.razorpayPaymentId}` : '',
    `Enrollment ID: ${enrollment._id || '—'}`,
    `Payment Date: ${paidAt || '—'}`,
    `Course Start Date: ${startDate}`,
    `Course End Date: ${endDate}`,
    `Course Mode: ${mode}`,
    `Duration: ${duration}`,
    '',
    `Questions? Reply to this email or contact us at ${COMPANY.email}.`,
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
    subject: `Course Enrollment Confirmed — ${COMPANY.name}`,
    toName: name,
    html: renderLayout({
      docTitle: `Course enrollment confirmed — ${COMPANY.name}`,
      preheader: 'Your course enrollment is confirmed.',
      eyebrow: 'Enrollment confirmed',
      bannerHeading: 'Enrollment Confirmed',
      bannerText: `Your spot in ${title} is secured.`,
      introHtml: greeting(name),
      bodyHtml,
      signature: { closing: 'Warm regards,', name: `The ${COMPANY.name} Team` },
      showMailbox: false
    }),
    text
  };
}

module.exports = { enrollmentCandidateEmail };
