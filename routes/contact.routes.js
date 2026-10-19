const express = require('express');
const router = express.Router();
const {
  createContact,
  getAllContacts,
  getContact,
  updateContact,
  deleteContact
} = require('../controllers/contact.controller');
const { authenticateUser, requireAdmin } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { verifyRecaptcha } = require('../middleware/recaptcha');

// Create a new contact submission (public).
// Order matters: rate-limit -> CAPTCHA verify -> controller (DB insert + email).
// The CAPTCHA check always precedes the database write and any email, and it
// fails closed, so an unverified submission has no side effects.
router.post('/', rateLimit({ windowMs: 60000, max: 10 }), verifyRecaptcha, createContact);

// Get all contact submissions (ADMIN only)
router.get('/', authenticateUser, requireAdmin, getAllContacts);

// Get a single contact submission (ADMIN only)
router.get('/:id', authenticateUser, requireAdmin, getContact);

// Update a contact submission (ADMIN only)
router.patch('/:id', authenticateUser, requireAdmin, updateContact);

// Delete a contact submission (ADMIN only)
router.delete('/:id', authenticateUser, requireAdmin, deleteContact);

module.exports = router;
