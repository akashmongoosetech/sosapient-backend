// Small, email-safe building blocks shared by every template.
//
// Everything here emits table-based markup with inline styles: no JavaScript,
// no external stylesheet, no web font, and no CSS feature that a mail client is
// known to drop. Anything that came from a form is escaped before it reaches
// the markup.

const { BRAND, FONT } = require('./theme');

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Multi-line user input (the message body, a cover letter) keeps its line breaks
// but is escaped first, so a pasted <script> is rendered as text.
function escapeMultiline(value) {
  return escapeHtml(value).replace(/\r?\n/g, '<br />');
}

function toText(value) {
  return String(value == null ? '' : value).trim();
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

// Deliberately conservative: good enough to reject anything that could break a
// mailto: link or be used for header injection, without pretending to validate
// deliverability (Brevo does its own check before accepting a recipient).
const EMAIL_PATTERN = /^[^<>\s"',;:@\\]+@[^<>\s"',;:@\\]+\.[^<>\s"',;:@\\]+$/;

function isEmail(value) {
  return EMAIL_PATTERN.test(toText(value));
}

// Only ever turns a value we consider a valid address into a link; anything else
// stays as plain escaped text, so a crafted value cannot escape the href.
function emailLink(value) {
  const email = toText(value);
  if (!isEmail(email)) return escapeHtml(email);
  return `<a href="mailto:${escapeHtml(email)}" style="color:${BRAND.primaryDark};text-decoration:none;">${escapeHtml(
    email
  )}</a>`;
}

function paragraph(html, options = {}) {
  const size = options.size || 15;
  const color = options.color || BRAND.ink;
  const margin = options.margin || '0 0 16px';
  const weight = options.bold ? 'font-weight:bold;' : '';
  return `<p style="margin:${margin};font-family:${FONT};font-size:${size}px;line-height:1.65;color:${color};${weight}">${html}</p>`;
}

function greeting(name) {
  const safe = escapeHtml(toText(name));
  return paragraph(safe ? `Hi ${safe},` : 'Hi there,');
}

// Small uppercase eyebrow used above a block of content.
function sectionLabel(text) {
  return `<p style="margin:26px 0 10px;font-family:${FONT};font-size:11px;font-weight:bold;letter-spacing:.08em;text-transform:uppercase;color:${BRAND.muted};">${escapeHtml(
    text
  )}</p>`;
}

// Padding lives on the cell, not the anchor: Outlook ignores padding on <a>, so
// a cell-padded button keeps its size there. It renders square in Outlook
// because that engine has no border-radius — an accepted, harmless degradation.
function button(label, url) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:24px 0 6px;">
    <tr>
      <td align="center" bgcolor="${BRAND.secondary}" style="border-radius:8px;padding:14px 28px;mso-padding-alt:14px 28px;">
        <a href="${escapeHtml(url)}" style="display:inline-block;font-family:${FONT};font-size:15px;font-weight:bold;line-height:1.2;color:#FFFFFF;text-decoration:none;">${escapeHtml(
    label
          )}</a>
      </td>
    </tr>
  </table>`;
}

// A soft card used for the "what happens next" steps and for free-text blocks.
function panel(html) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;background-color:${BRAND.panel};border:1px solid ${BRAND.border};border-radius:10px;">
    <tr>
      <td style="padding:16px 18px;font-family:${FONT};font-size:14px;line-height:1.7;color:${BRAND.ink};word-break:break-word;overflow-wrap:break-word;">${html}</td>
    </tr>
  </table>`;
}

function steps(items) {
  const rows = items
    .map(
      (item, index) => `<tr>
        <td width="24" valign="top" style="padding:0 8px 10px 0;font-family:${FONT};font-size:13px;font-weight:bold;color:${BRAND.primary};">${
        index + 1
      }</td>
        <td valign="top" style="padding:0 0 10px;font-family:${FONT};font-size:14px;line-height:1.6;color:${BRAND.ink};">${escapeHtml(
        item
      )}</td>
      </tr>`
    )
    .join('');
  const last = items.length ? `<tr><td colspan="2" style="font-size:0;line-height:0;">&nbsp;</td></tr>` : '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">${rows}${last}</table>`;
}

// Label/value rows. Optional fields are dropped rather than rendered empty, so
// an unfinished submission does not show a wall of blank labels.
//
// A pair is [label, value, multiline] where multiline may also be an options
// object: { multiline: true } keeps line breaks, { html: true } passes the
// value through unchanged (used for the pre-escaped mailto link).
function detailRows(pairs) {
  const normalised = pairs.map(([label, value, options]) => {
    const opts = typeof options === 'boolean' ? { multiline: options } : options || {};
    return { label, value, opts };
  });

  const visible = normalised.filter((row) => {
    if (row.opts.html) return toText(row.value).replace(/<[^>]*>/g, '') !== '';
    return toText(row.value) !== '';
  });
  if (visible.length === 0) return '';

  const rows = visible
    .map(({ label, value, opts }, index) => {
      const hairline = index === visible.length - 1 ? '' : `border-bottom:1px solid ${BRAND.border};`;
      const rendered = opts.html
        ? String(value)
        : opts.multiline
          ? escapeMultiline(value)
          : escapeHtml(value);
      return `<tr>
        <td class="detail-label" width="36%" valign="top" style="padding:11px 14px;${hairline}font-family:${FONT};font-size:11px;font-weight:bold;letter-spacing:.06em;text-transform:uppercase;color:${BRAND.muted};">${escapeHtml(
        label
      )}</td>
        <td class="detail-value" valign="top" style="padding:11px 14px;${hairline}font-family:${FONT};font-size:14px;line-height:1.6;color:${BRAND.ink};word-break:break-word;overflow-wrap:break-word;">${rendered}</td>
      </tr>`;
    })
    .join('');

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;background-color:${BRAND.panel};border:1px solid ${BRAND.border};border-radius:10px;">
    ${rows}
  </table>`;
}

module.exports = {
  EMAIL_PATTERN,
  escapeHtml,
  escapeMultiline,
  formatIst,
  isEmail,
  toText,
  emailLink,
  paragraph,
  greeting,
  sectionLabel,
  button,
  panel,
  steps,
  detailRows
};
