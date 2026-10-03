// Usage: ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='StrongPass123!' node seeders/adminSeeder.js
// Creates or upgrades the ADMIN user. Safe to re-run (upsert by email).
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

async function main() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '');
  const username = String(process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
  const mobile = String(process.env.ADMIN_MOBILE || '9876543210').trim();
  const firstName = String(process.env.ADMIN_FIRST_NAME || 'Admin').trim();
  const lastName = String(process.env.ADMIN_LAST_NAME || 'User').trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('ADMIN_EMAIL must be a valid email address');
    process.exit(1);
  }
  if (!password || password.length < 8) {
    console.error('ADMIN_PASSWORD must be at least 8 characters');
    process.exit(1);
  }
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await User.findOne({ email });
  if (existing) {
    existing.firstName = firstName;
    existing.lastName = lastName;
    existing.passwordHash = passwordHash;
    existing.role = 'ADMIN';
    await existing.save();
    console.log(`Upgraded existing user ${email} to ADMIN`);
  } else {
    await User.create({
      firstName,
      lastName,
      username,
      email,
      mobile,
      profilePic: '',
      passwordHash,
      role: 'ADMIN'
    });
    console.log(`Created ADMIN user ${email}`);
  }
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}

module.exports = main;
