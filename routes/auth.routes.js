const express = require('express');
const router = express.Router();
const { signup, login, me, logout } = require('../controllers/auth.controller');
const { authenticateUser } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');

router.post('/signup', rateLimit({ windowMs: 60000, max: 10 }), signup);
router.post('/login', rateLimit({ windowMs: 60000, max: 10 }), login);
router.get('/me', authenticateUser, me);
router.post('/logout', authenticateUser, logout);

module.exports = router;
