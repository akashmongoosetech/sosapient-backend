// Public entry point for the email templates.
//
// The implementation lives in ./email so that the shell (theme, primitives,
// layout) can be reused by each message without a single 400-line file. This
// module keeps the original require path and export names, so utils/emailService
// and the controllers need no changes.

const { BRAND, COMPANY, FONT } = require('./email/theme');
const { escapeHtml, escapeMultiline, formatIst } = require('./email/primitives');
const { contactVisitorEmail } = require('./email/contactVisitor');
const { contactAdminEmail } = require('./email/contactAdmin');
const { careerVisitorEmail } = require('./email/careerApplicant');
const { careerAdminEmail } = require('./email/careerAdmin');

module.exports = {
  BRAND,
  COMPANY,
  FONT,
  escapeHtml,
  escapeMultiline,
  formatIst,
  contactVisitorEmail,
  contactAdminEmail,
  careerVisitorEmail,
  careerAdminEmail
};
