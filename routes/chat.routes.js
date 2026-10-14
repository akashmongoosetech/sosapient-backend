// LEGACY (deprecated): ungrounded DialoGPT answers removed.
// Use POST /api/chatbot/message (Gemini + RAG, intent-aware) instead.
// This stub preserves the route so old clients get a clear migration error.
const express = require('express');
const router = express.Router();
const { rateLimit } = require('../middleware/rateLimit');

router.post('/ai-chat', rateLimit({ windowMs: 60000, max: 15 }), (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'This endpoint is deprecated. Use POST /api/chatbot/message instead.'
  });
});

module.exports = router;
