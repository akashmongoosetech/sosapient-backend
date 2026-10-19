// The shared email shell: canvas, branded header, hero banner, content card,
// signature, social section and footer.
//
// Layout is table-based throughout and every style is inline. The embedded
// <style> block only carries mobile media queries — clients that ignore it
// (Outlook desktop) still get a correct, if slightly less airy, layout.

const { BRAND, COMPANY, FONT } = require('./theme');
const { escapeHtml } = require('./primitives');

// Four text chips rather than icon images. There are no icon assets anywhere in
// the project and the backend has no image tooling, and text keeps working when
// images are blocked — which is a real failure mode, not a hypothetical one.
function socialChips() {
  return COMPANY.social
    .map(
      (profile) =>
        `<a href="${escapeHtml(profile.url)}" style="display:inline-block;margin:0 3px 6px;padding:8px 12px;background-color:#FFFFFF;border:1px solid ${BRAND.border};border-radius:99px;font-family:${FONT};font-size:12px;font-weight:bold;color:${BRAND.primaryDark};text-decoration:none;">${escapeHtml(
          profile.label
        )}</a>`
    )
    .join('');
}

// Decorative only — three dots in the banner. Outlook renders them as squares,
// which is fine because they carry no meaning.
function bannerDots() {
  const shades = [BRAND.lavender, '#B7A3D7', '#9B81C7'];
  const dots = shades
    .map(
      (shade, index) =>
        `${index ? `<td width="6" style="font-size:0;line-height:0;">&nbsp;</td>` : ''}<td width="8" height="8" bgcolor="${shade}" style="border-radius:50%;font-size:0;line-height:0;">&nbsp;</td>`
    )
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${dots}</tr></table>`;
}

function signature({ closing, name }) {
  const tel = COMPANY.phone.replace(/[^\d+]/g, '');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:28px 0 0;border-top:1px solid ${BRAND.border};">
    <tr>
      <td style="padding:20px 0 0;font-family:${FONT};font-size:14px;line-height:1.7;color:${BRAND.muted};">
        <p style="margin:0 0 2px;">${escapeHtml(closing)}</p>
        <p style="margin:0 0 12px;font-family:${FONT};font-size:16px;font-weight:bold;line-height:1.4;color:${BRAND.ink};">${escapeHtml(
    name
  )}</p>
        <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.9;color:${BRAND.muted};">
          <a href="${escapeHtml(COMPANY.website)}" style="color:${BRAND.primaryDark};text-decoration:none;font-weight:bold;">${escapeHtml(
    COMPANY.website.replace(/^https?:\/\//, '')
  )}</a>
          &nbsp;&middot;&nbsp;
          <a href="tel:${escapeHtml(tel)}" style="color:${BRAND.primaryDark};text-decoration:none;">${escapeHtml(
    COMPANY.phone
  )}</a>
        </p>
      </td>
    </tr>
  </table>`;
}

function footerCell(showMailbox, mailbox) {
  const address = String(mailbox || '').trim() || COMPANY.email;
  const mailboxLine = showMailbox
    ? `<a href="mailto:${escapeHtml(address)}" style="color:${BRAND.primaryDark};text-decoration:none;">${escapeHtml(
        address
      )}</a><br />`
    : '';
  return `<tr>
    <td bgcolor="${BRAND.footer}" align="center" class="px" style="padding:24px 24px 26px;border-top:1px solid ${BRAND.border};">
      <p style="margin:0 0 8px;font-family:${FONT};font-size:13px;font-weight:bold;letter-spacing:.02em;color:${BRAND.ink};">${escapeHtml(
    COMPANY.name
  )}</p>
      <p style="margin:0 0 12px;font-family:${FONT};font-size:12px;line-height:1.8;color:${BRAND.footerText};">
        <a href="${escapeHtml(COMPANY.website)}" style="color:${BRAND.primaryDark};text-decoration:none;">${escapeHtml(
    COMPANY.website.replace(/^https?:\/\//, '')
  )}</a><br />
        ${mailboxLine}${escapeHtml(COMPANY.phone)}<br />
        ${escapeHtml(COMPANY.address)}
      </p>
      <p style="margin:0;font-family:${FONT};font-size:11px;line-height:1.7;color:${BRAND.footerText};">
        &copy; ${new Date().getFullYear()} ${escapeHtml(COMPANY.name)}. All rights reserved.<br />
        Thoughtful digital products, built from India.
      </p>
    </td>
  </tr>`;
}

function renderLayout({
  docTitle = '',
  preheader = '',
  eyebrow = '',
  bannerHeading = '',
  bannerText = '',
  introHtml = '',
  bodyHtml = '',
  signature: signatureOptions = { closing: 'Warm regards,', name: `The ${COMPANY.name} Team` },
  showMailbox = true,
  mailbox = COMPANY.email
} = {}) {
  const social = socialChips();
  const footer = footerCell(showMailbox, mailbox);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<meta name="x-apple-disable-message-reformatting" />
<title>${escapeHtml(docTitle)}</title>
<style type="text/css">
  body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
  table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
  img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none;}
  @media only screen and (max-width:620px){
    .card{width:100% !important;}
    .px{padding-left:20px !important;padding-right:20px !important;}
    .banner-heading{font-size:21px !important;}
    .detail-label,.detail-value{display:block !important;width:100% !important;padding:9px 14px !important;}
    .detail-label{padding-bottom:0 !important;}
  }
</style>
</head>
<body style="margin:0;padding:0;width:100%;background-color:${BRAND.canvas};">
<div style="display:none;font-size:1px;color:${BRAND.canvas};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(
    preheader
  )}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${BRAND.canvas};">
  <tr>
    <td align="center" style="padding:28px 12px;">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
      <table role="presentation" class="card" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;max-width:600px;background-color:${BRAND.card};border:1px solid ${BRAND.border};border-radius:14px;overflow:hidden;">
        <tr>
          <td align="center" bgcolor="${BRAND.card}" class="px" style="padding:26px 24px;border-bottom:1px solid ${BRAND.divider};">
            <img src="${escapeHtml(COMPANY.logoUrl)}" alt="${escapeHtml(
    COMPANY.name
  )} logo" width="${COMPANY.logoWidth}" height="${COMPANY.logoHeight}" style="display:block;width:${COMPANY.logoWidth}px;max-width:100%;height:auto;border:0;" />
          </td>
        </tr>
        <tr>
          <td bgcolor="${BRAND.banner}" style="padding:0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td height="4" bgcolor="${BRAND.primary}" style="font-size:0;line-height:0;height:4px;">&nbsp;</td>
              </tr>
              <tr>
                <td class="px" style="padding:26px 28px 26px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td align="left" valign="middle">
                        <span style="display:inline-block;padding:6px 13px;background-color:#FFFFFF;border-radius:99px;font-family:${FONT};font-size:11px;font-weight:bold;letter-spacing:.09em;text-transform:uppercase;color:${BRAND.primaryDark};">${escapeHtml(
    eyebrow
  )}</span>
                      </td>
                      <td align="right" valign="middle" width="64">${bannerDots()}</td>
                    </tr>
                  </table>
                  <h1 class="banner-heading" style="margin:16px 0 0;font-family:${FONT};font-size:24px;line-height:1.3;font-weight:bold;color:${BRAND.ink};">${escapeHtml(
    bannerHeading
  )}</h1>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:16px 0 0;">
                    <tr>
                      <td width="44" height="3" bgcolor="${BRAND.primary}" style="border-radius:2px;font-size:0;line-height:0;height:3px;">&nbsp;</td>
                    </tr>
                  </table>
                  <p style="margin:12px 0 0;font-family:${FONT};font-size:14px;line-height:1.65;color:${BRAND.bannerText};">${escapeHtml(
    bannerText
  )}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td bgcolor="${BRAND.card}" class="px" style="padding:30px 28px 32px;">
            ${introHtml}
            ${bodyHtml}
            ${signature(signatureOptions)}
          </td>
        </tr>
        <tr>
          <td bgcolor="${BRAND.social}" align="center" class="px" style="padding:22px 24px;border-top:1px solid ${BRAND.border};">
            <p style="margin:0 0 12px;font-family:${FONT};font-size:11px;font-weight:bold;letter-spacing:.08em;text-transform:uppercase;color:${BRAND.muted};">Connect with us</p>
            <p style="margin:0;line-height:1.9;">${social}</p>
          </td>
        </tr>
        ${footer}
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
</body>
</html>`;
}

// --- plain-text counterparts ------------------------------------------------
//
// Every message ships a text alternative. These helpers keep the contact block
// and the social list identical across the four templates.

function textContactLines(showMailbox, mailbox) {
  const lines = [COMPANY.name, COMPANY.website];
  if (showMailbox) lines.push(String(mailbox || '').trim() || COMPANY.email);
  lines.push(COMPANY.phone, COMPANY.address);
  return lines;
}

function textSocialLines() {
  return COMPANY.social.map((profile) => `${profile.label}: ${profile.url}`);
}

module.exports = {
  renderLayout,
  textContactLines,
  textSocialLines
};
