// Server-to-server authentication middleware for career sync.
// Validates the X-Career-Sync-Api-Key header against CAREER_SYNC_API_KEY
// using a timing-safe comparison. Never logs or exposes the API key.
const crypto = require('crypto');

function apiKeyAuth(req, res, next) {
  const providedKey = req.headers['x-career-sync-api-key'];
  const expectedKey = process.env.CAREER_SYNC_API_KEY;

  if (!expectedKey) {
    return res.status(500).json({ success: false, message: 'Server configuration error' });
  }

  if (!providedKey || typeof providedKey !== 'string') {
    return res.status(401).json({ success: false, message: 'Unauthorized: synchronization API key required' });
  }

  try {
    const expectedBuf = Buffer.from(expectedKey, 'utf8');
    const providedBuf = Buffer.from(providedKey, 'utf8');
    if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
      return res.status(401).json({ success: false, message: 'Unauthorized: invalid synchronization API key' });
    }
  } catch {
    return res.status(401).json({ success: false, message: 'Unauthorized: invalid synchronization API key' });
  }

  req.isApiKeyAuth = true;
  next();
}

module.exports = { apiKeyAuth };
