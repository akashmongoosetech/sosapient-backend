// Honeypot spam trap shared by public forms. Frontend renders a hidden
// `website` input humans never fill; bots that fill it get a fake success
// response (no DB write, no email) so they cannot probe for validation.
function isHoneypotFilled(body) {
  if (!body || typeof body !== 'object') return false;
  const v = body.website;
  return typeof v === 'string' && v.trim() !== '';
}

module.exports = { isHoneypotFilled };
