const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

function signToken(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === 'your-jwt-secret-key-here') {
    throw new Error('JWT_SECRET is not configured securely');
  }
  return jwt.sign(
    { sub: String(user._id), role: user.role },
    secret,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function isValidUrl(value) {
  if (!value) return true;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

function normalizeMobile(value) {
  return String(value || '').trim().replace(/[\s-]/g, '');
}

function isValidMobile(value) {
  const v = normalizeMobile(value);
  if (/^\+[1-9]\d{7,14}$/.test(v)) return true;
  if (/^[6-9]\d{9}$/.test(v)) return true;
  return false;
}

function safeUser(user) {
  return user.toSafeJSON();
}

// POST /api/auth/signup — always creates USER; role in body is ignored
async function signup(req, res) {
  try {
    const { firstName, lastName, username, email, mobile, profilePic, password, confirmPassword } = req.body || {};

    if (!firstName || !String(firstName).trim() || String(firstName).trim().length < 2 || String(firstName).trim().length > 50) {
      return res.status(400).json({ success: false, message: 'First name is required (2-50 characters)' });
    }
    if (!lastName || !String(lastName).trim() || String(lastName).trim().length < 2 || String(lastName).trim().length > 50) {
      return res.status(400).json({ success: false, message: 'Last name is required (2-50 characters)' });
    }
    const uname = String(username || '').trim().toLowerCase();
    if (!/^[a-z0-9_.]{3,30}$/.test(uname)) {
      return res.status(400).json({ success: false, message: 'Username is required (3-30 chars: letters, numbers, dot, underscore)' });
    }
    const mail = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail) || mail.length > 160) {
      return res.status(400).json({ success: false, message: 'A valid email address is required' });
    }
    const mob = normalizeMobile(mobile);
    if (!isValidMobile(mob)) {
      return res.status(400).json({ success: false, message: 'A valid mobile number is required' });
    }
    if (profilePic && String(profilePic).trim() !== '' && !isValidUrl(String(profilePic).trim())) {
      return res.status(400).json({ success: false, message: 'Invalid profile picture URL' });
    }
    if (!password || String(password).length < 8 || String(password).length > 128) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }

    const bcryptRounds = process.env.NODE_ENV === 'production' ? 12 : 10;
    const t0 = Date.now();
    const passwordHash = await bcrypt.hash(String(password), bcryptRounds);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`auth signup hash took ${Date.now() - t0}ms`);
    }
    const user = new User({
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      username: uname,
      email: mail,
      mobile: mob,
      profilePic: profilePic ? String(profilePic).trim() : '',
      passwordHash,
      role: 'USER'
    });
    await user.save();
    const token = signToken(user);
    return res.status(201).json({ success: true, message: 'Signup successful', token, user: safeUser(user) });
  } catch (error) {
    if (error && error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || 'field';
      return res.status(409).json({ success: false, message: `${field} already exists` });
    }
    if (error && error.message === 'JWT_SECRET is not configured securely') {
      return res.status(500).json({ success: false, message: 'Authentication is not configured' });
    }
    if (error && error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: 'Validation failed' });
    }
    return res.status(500).json({ success: false, message: process.env.NODE_ENV === 'production' ? 'Error during signup' : (error.message || 'Error during signup') });
  }
}

// POST /api/auth/login — identifier may be email | username | mobile
async function login(req, res) {
  try {
    const { identifier, password } = req.body || {};
    if (!identifier || !String(identifier).trim() || !password) {
      return res.status(400).json({ success: false, message: 'Identifier and password are required' });
    }
    const raw = String(identifier).trim();
    const mob = normalizeMobile(raw);
    const or = [];
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
      or.push({ email: raw.toLowerCase() });
    }
    if (/^[a-z0-9_.]{3,30}$/i.test(raw)) {
      or.push({ username: raw.toLowerCase() });
    }
    if (isValidMobile(mob)) {
      or.push({ mobile: mob });
    }
    if (or.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const t0 = Date.now();
    const user = await User.findOne({ $or: or }).select('+passwordHash');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`auth login lookup+compare took ${Date.now() - t0}ms`);
    }
    if (!ok) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const token = signToken(user);
    const safe = user.toSafeJSON();
    return res.json({ success: true, message: 'Login successful', token, user: safe });
  } catch (error) {
    if (error && error.message === 'JWT_SECRET is not configured securely') {
      return res.status(500).json({ success: false, message: 'Authentication is not configured' });
    }
    return res.status(500).json({ success: false, message: process.env.NODE_ENV === 'production' ? 'Error during login' : (error.message || 'Error during login') });
  }
}

async function me(req, res) {
  return res.json({ success: true, user: req.user.toSafeJSON() });
}

async function logout(req, res) {
  return res.json({ success: true, message: 'Logged out successfully' });
}

// PUT /api/auth/me — self profile update. Only profile fields are writable;
// role, passwordHash and any other field in the body are ignored.
async function updateMe(req, res) {
  try {
    const user = await User.findById(req.auth.userId);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized: user not found' });
    }
    const body = req.body || {};
    if (body.firstName !== undefined) {
      const v = String(body.firstName).trim();
      if (v.length < 2 || v.length > 50) {
        return res.status(400).json({ success: false, message: 'First name is required (2-50 characters)' });
      }
      user.firstName = v;
    }
    if (body.lastName !== undefined) {
      const v = String(body.lastName).trim();
      if (v.length < 2 || v.length > 50) {
        return res.status(400).json({ success: false, message: 'Last name is required (2-50 characters)' });
      }
      user.lastName = v;
    }
    if (body.username !== undefined) {
      const v = String(body.username).trim().toLowerCase();
      if (!/^[a-z0-9_.]{3,30}$/.test(v)) {
        return res.status(400).json({ success: false, message: 'Username is required (3-30 chars: letters, numbers, dot, underscore)' });
      }
      user.username = v;
    }
    if (body.email !== undefined) {
      const v = String(body.email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || v.length > 160) {
        return res.status(400).json({ success: false, message: 'A valid email address is required' });
      }
      user.email = v;
    }
    if (body.mobile !== undefined) {
      const v = normalizeMobile(body.mobile);
      if (!isValidMobile(v)) {
        return res.status(400).json({ success: false, message: 'A valid mobile number is required' });
      }
      user.mobile = v;
    }
    if (body.profilePic !== undefined) {
      const v = String(body.profilePic).trim();
      if (v !== '' && !isValidUrl(v)) {
        return res.status(400).json({ success: false, message: 'Invalid profile picture URL' });
      }
      user.profilePic = v;
    }
    await user.save();
    return res.json({ success: true, message: 'Profile updated successfully', user: safeUser(user) });
  } catch (error) {
    if (error && error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || 'field';
      return res.status(409).json({ success: false, message: `${field} already exists` });
    }
    if (error && error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: 'Validation failed' });
    }
    return res.status(500).json({ success: false, message: 'Error updating profile' });
  }
}

// PUT /api/auth/password — self password change. Verifies the current
// password, then hashes and stores the new one. Existing JWTs stay valid
// until expiry (stateless auth, same as logout).
async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body || {};
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'Current, new and confirm passwords are required' });
    }
    const user = await User.findById(req.auth.userId).select('+passwordHash');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized: user not found' });
    }
    const ok = await bcrypt.compare(String(currentPassword), user.passwordHash);
    if (!ok) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }
    if (String(newPassword).length < 8 || String(newPassword).length > 128) {
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'New passwords do not match' });
    }
    const same = await bcrypt.compare(String(newPassword), user.passwordHash);
    if (same) {
      return res.status(400).json({ success: false, message: 'New password must be different from the current password' });
    }
    const bcryptRounds = process.env.NODE_ENV === 'production' ? 12 : 10;
    user.passwordHash = await bcrypt.hash(String(newPassword), bcryptRounds);
    await user.save();
    return res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error changing password' });
  }
}

module.exports = { signup, login, me, logout, updateMe, changePassword };
