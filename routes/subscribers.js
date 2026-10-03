const express = require('express');
const router = express.Router();
const Subscriber = require('../models/Subscriber');
const { authenticateUser, requireAdmin } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Subscribe to newsletter (public, rate-limited)
router.post('/subscribe', rateLimit({ windowMs: 60000, max: 10 }), async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !EMAIL_RE.test(String(email).slice(0, 160))) {
      return res.status(400).json({ success: false, message: 'Valid email is required' });
    }
    const normalized = String(email).trim().toLowerCase();

    // Check if email already exists
    const existingSubscriber = await Subscriber.findOne({ email: normalized });
    if (existingSubscriber) {
      return res.status(400).json({ success: false, message: 'Email already subscribed' });
    }

    // Create new subscriber
    const subscriber = new Subscriber({ email: normalized });
    await subscriber.save();

    res.status(201).json({
      success: true,
      message: 'Successfully subscribed to newsletter',
      subscriber
    });
  } catch (error) {
    console.error('Subscription error');
    res.status(500).json({ success: false, message: 'Error subscribing to newsletter' });
  }
});

// Get all subscribers (ADMIN only)
router.get('/subscribers', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const page = Math.min(Math.max(parseInt(req.query.page, 10) || 1, 1), 1000);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const subscribers = await Subscriber.find().sort({ subscribedAt: -1 }).skip((page - 1) * limit).limit(limit);
    res.json({ success: true, data: subscribers, pagination: { page, limit } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching subscribers' });
  }
});

// Delete subscriber (ADMIN only)
router.delete('/subscribers/:id', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const subscriber = await Subscriber.findByIdAndDelete(req.params.id);
    if (!subscriber) {
      return res.status(404).json({ success: false, message: 'Subscriber not found' });
    }
    res.json({ success: true, message: 'Subscriber deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error deleting subscriber' });
  }
});

// Unsubscribe (public, rate-limited)
router.post('/unsubscribe', rateLimit({ windowMs: 60000, max: 10 }), async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }
    const subscriber = await Subscriber.findOne({ email: String(email).trim().toLowerCase() });

    if (!subscriber) {
      return res.status(404).json({ success: false, message: 'Subscriber not found' });
    }

    subscriber.status = 'unsubscribed';
    await subscriber.save();

    res.json({ success: true, message: 'Successfully unsubscribed' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error unsubscribing' });
  }
});

module.exports = router;
