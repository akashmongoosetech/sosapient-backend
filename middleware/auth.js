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
    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized: user not found' });
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

module.exports = { authenticateUser, requireAdmin };
