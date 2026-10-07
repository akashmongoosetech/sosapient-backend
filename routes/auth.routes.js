const express = require('express');
const router = express.Router();
const { signup, login, me, logout, refresh, updateMe, changePassword } = require('../controllers/auth.controller');
const { authenticateUser } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');

router.post('/signup', rateLimit({ windowMs: 60000, max: 10 }), signup);
router.post('/login', rateLimit({ windowMs: 60000, max: 10 }), login);
router.post('/refresh', rateLimit({ windowMs: 60000, max: 20 }), refresh);
router.get('/me', authenticateUser, me);
router.put('/me', authenticateUser, rateLimit({ windowMs: 60000, max: 20 }), updateMe);
router.put('/password', authenticateUser, rateLimit({ windowMs: 60000, max: 10 }), changePassword);
router.post('/logout', authenticateUser, logout);

module.exports = router;
