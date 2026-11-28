const express = require('express');
const router = express.Router();
const { listCandidates, getCandidateById } = require('../controllers/candidatesController');
const { authenticateUser, requireAdmin } = require('../middleware/auth');

// All candidates routes require admin authentication + ADMIN role
router.get('/', authenticateUser, requireAdmin, listCandidates);
router.get('/:id', authenticateUser, requireAdmin, getCandidateById);

module.exports = router;
