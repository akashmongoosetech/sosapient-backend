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

// Create a new contact submission (public, rate-limited)
router.post('/', rateLimit({ windowMs: 60000, max: 10 }), createContact);

// Get all contact submissions (ADMIN only)
router.get('/', authenticateUser, requireAdmin, getAllContacts);

// Get a single contact submission (ADMIN only)
router.get('/:id', authenticateUser, requireAdmin, getContact);

// Update a contact submission (ADMIN only)
router.patch('/:id', authenticateUser, requireAdmin, updateContact);

// Delete a contact submission (ADMIN only)
router.delete('/:id', authenticateUser, requireAdmin, deleteContact);

module.exports = router;
