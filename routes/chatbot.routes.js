const express = require('express');
const router = express.Router();
const { message, submitContact } = require('../controllers/chatbot.controller');
const { authenticateUser, requireAdmin } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');

// Public conversational endpoints (strict validation + rate limits inside handlers)
router.post('/message', rateLimit({ windowMs: 60000, max: 15 }), message);
router.post('/contact', rateLimit({ windowMs: 60000, max: 5 }), submitContact);

// Admin-only full reindex of public RAG knowledge (runs in background)
let reindexRunning = false;
router.post('/reindex', authenticateUser, requireAdmin, async (req, res) => {
  if (reindexRunning) {
    return res.status(409).json({ success: false, message: 'A reindex is already running' });
  }
  reindexRunning = true;
  setImmediate(async () => {
    try {
      const RagDocument = require('../models/RagDocument');
      await RagDocument.deleteMany({});
      const rebuild = require('../scripts/index-rag');
      await rebuild({ skipClear: true });
    } catch (error) {
      console.error('RAG reindex failed');
    } finally {
      reindexRunning = false;
    }
  });
  return res.status(202).json({ success: true, message: 'Reindex started in the background' });
});

module.exports = router;
