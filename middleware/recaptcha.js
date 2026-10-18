// Mandatory reCAPTCHA verification middleware for public write endpoints.
//
// Runs AFTER multer has parsed the multipart body (the token arrives as a form
// field) but BEFORE the controller, so no database write, email or file
// persistence happens for an unverified submission. Multer uses memoryStorage,
// so unverified uploads are only buffered in RAM and never written to disk.
//
// Fails closed: if anything is ambiguous, the request is rejected.

const { isRecaptchaConfigured, verifyRecaptchaToken } = require('../utils/recaptcha');

// Accept the field name used by the frontend plus the standard Google field.
function extractToken(req) {
  const body = (req && req.body) || {};
  return body.recaptchaToken || body['g-recaptcha-response'] || body.recaptchaResponse || '';
}

// Trusted client IP. `app.set('trust proxy', 1)` makes req.ip reflect the
// forwarding proxy (Render) rather than the raw socket.
function clientIp(req) {
  return (req && (req.ip || (req.socket && req.socket.remoteAddress))) || '';
}

async function verifyRecaptcha(req, res, next) {
  // 1. Secret must be configured — never bypass, not even in development.
  if (!isRecaptchaConfigured()) {
    return res.status(500).json({
      success: false,
      message: 'Server configuration error: CAPTCHA is not configured'
    });
  }

  // 2. Token must be present.
  const token = extractToken(req);
  if (!token) {
    return res.status(400).json({
      success: false,
      message: 'Please complete the reCAPTCHA challenge'
    });
  }

  // 3. Verify with Google.
  let result;
  try {
    result = await verifyRecaptchaToken(token, clientIp(req));
  } catch {
    return res.status(503).json({
      success: false,
      message: 'CAPTCHA verification is temporarily unavailable. Please try again shortly.'
    });
  }

  if (result.ok) return next();

  switch (result.reason) {
    case 'expired-or-duplicate':
      return res.status(403).json({
        success: false,
        captchaExpired: true,
        message: 'Your CAPTCHA expired. Please complete it again.'
      });
    case 'unavailable':
    case 'malformed':
      return res.status(503).json({
        success: false,
        message: 'CAPTCHA verification is temporarily unavailable. Please try again shortly.'
      });
    case 'secret-missing':
      return res.status(500).json({
        success: false,
        message: 'Server configuration error: CAPTCHA is not configured'
      });
    case 'hostname-mismatch':
    case 'rejected':
    case 'missing':
    default:
      return res.status(403).json({
        success: false,
        message: 'CAPTCHA verification failed. Please try again.'
      });
  }
}

module.exports = { verifyRecaptcha };
