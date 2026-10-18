const jwt = require('jsonwebtoken');
const User = require('../models/User');

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

// Authentication: valid JWT + user still exists. Attaches req.user. 401 otherwise.
async function authenticateUser(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ success: false, message: 'Unauthorized: authentication required' });
    }
    const secret = process.env.JWT_SECRET;
    if (!secret || secret === 'your-jwt-secret-key-here') {
      return res.status(500).json({ success: false, message: 'Authentication is not configured' });
    }
    let payload;
    try {
      payload = jwt.verify(token, secret);
    } catch (e) {
      return res.status(401).json({ success: false, message: 'Unauthorized: invalid or expired token' });
    }
    const userId = payload.sub || payload.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized: invalid token' });
    }
    // Only access tokens may authenticate requests. Refresh tokens, and any
    // pre-rotation legacy token that lacks a `type`/`tv` claim, are rejected so
    // that revocation via tokenVersion can never be bypassed by an old token.
    if (payload.type !== 'access' || payload.tv === undefined) {
      return res.status(401).json({ success: false, message: 'Unauthorized: invalid token type' });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized: user not found' });
    }
    // Token version check: bumped on password change / reuse detection.
    if ((user.tokenVersion || 0) !== payload.tv) {
      return res.status(401).json({ success: false, message: 'Unauthorized: session revoked' });
    }
    req.user = user;
    req.auth = { userId: String(user._id), role: user.role };
    return next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Unauthorized: authentication required' });
  }
}

// Authorization: requires ADMIN role. Assumes authenticateUser ran first.
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Unauthorized: authentication required' });
  }
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Forbidden: admin access required' });
  }
  return next();
}

// Optional authentication: attaches req.user/req.auth when a valid access token
// is present, but NEVER rejects the request. Used by public endpoints that still
// want to attribute the action to a signed-in user (e.g. blog comments).
async function optionalAuth(req, res, next) {
  const token = getBearerToken(req);
  if (!token) return next();
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret === 'your-jwt-secret-key-here') return next();
    const payload = jwt.verify(token, secret);
    if (payload.type !== 'access' || payload.tv === undefined) return next();
    const userId = payload.sub || payload.userId;
    if (!userId) return next();
    const user = await User.findById(userId);
    if (!user) return next();
    if ((user.tokenVersion || 0) !== payload.tv) return next();
    req.user = user;
    req.auth = { userId: String(user._id), role: user.role };
  } catch {
    // Invalid/expired token → treat as anonymous; do not block the request.
  }
  return next();
}

module.exports = { authenticateUser, requireAdmin, optionalAuth };
