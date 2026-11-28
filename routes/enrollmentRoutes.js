const express = require('express');
const router = express.Router();
const {
  enroll,
  createOrder,
  verifyPayment,
  getEnrollment,
  getPaymentStatus,
  listEnrollments,
  getEnrollmentStats,
  exportEnrollments
} = require('../controllers/enrollmentController');
const { authenticateUser, requireAdmin } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');

// NOTE: the Razorpay webhook is NOT registered here. It is mounted directly in
// server.js before express.json() so the handler receives the raw request body
// it needs to verify the HMAC signature.

// Public enrollment (no auth required). The access token returned by /enroll
// is what authorises the candidate for the routes below.
router.post('/enroll', rateLimit({ windowMs: 60 * 1000, max: 10 }), enroll);
router.post('/payment/create-order', rateLimit({ windowMs: 60 * 1000, max: 20 }), createOrder);
router.post('/payment/verify', rateLimit({ windowMs: 60 * 1000, max: 20 }), verifyPayment);
router.get('/enrollment/:id', getEnrollment);
router.get('/payment/:id/status', getPaymentStatus);

// Admin enrollment management (authenticated + admin)
router.get('/admin/enrollments', authenticateUser, requireAdmin, listEnrollments);
router.get('/admin/enrollments/stats', authenticateUser, requireAdmin, getEnrollmentStats);
router.get('/admin/enrollments/export', authenticateUser, requireAdmin, exportEnrollments);

module.exports = router;
