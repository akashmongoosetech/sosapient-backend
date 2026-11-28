const mongoose = require('mongoose');
const Enrollment = require('../models/Enrollment');
const Payment = require('../models/Payment');
const Training = require('../models/Training');
const { escapeRegExp } = require('../utils/slug');

function clampInt(value, fallback, min, max) {
  const v = parseInt(String(value || fallback), 10);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(Math.max(v, min), max);
}

// GET /api/admin/candidates — list enrolled candidates with filters & pagination
async function listCandidates(req, res) {
  try {
    const page = clampInt(req.query.page, 1, 1, 1000);
    const limit = clampInt(req.query.limit, 20, 1, 100);
    const filter = {};

    // Payment status filter
    if (req.query.paymentStatus && ['pending', 'paid', 'failed', 'cancelled'].includes(String(req.query.paymentStatus))) {
      filter.paymentStatus = String(req.query.paymentStatus);
    }

    // Enrollment status filter
    if (req.query.enrollmentStatus && ['pending', 'confirmed', 'cancelled'].includes(String(req.query.enrollmentStatus))) {
      filter.enrollmentStatus = String(req.query.enrollmentStatus);
    }

    // Payment type filter (Free / Paid)
    if (req.query.paymentType && ['Free', 'Paid'].includes(String(req.query.paymentType))) {
      filter.paymentType = String(req.query.paymentType);
    }

    // Course filter
    if (req.query.trainingId && /^[0-9a-fA-F]{24}$/.test(String(req.query.trainingId))) {
      filter.trainingId = String(req.query.trainingId);
    }

    // Search by name, email, mobile, or course title
    if (req.query.search && String(req.query.search).trim() !== '') {
      const q = escapeRegExp(String(req.query.search).trim().slice(0, 100));
      const rx = new RegExp(q, 'i');
      filter.$or = [{ candidateName: rx }, { email: rx }, { mobile: rx }, { courseTitleSnapshot: rx }];
    }

    // Date range filter
    if (req.query.fromDate || req.query.toDate) {
      filter.enrolledAt = {};
      if (req.query.fromDate) filter.enrolledAt.$gte = new Date(String(req.query.fromDate));
      if (req.query.toDate) filter.enrolledAt.$lte = new Date(String(req.query.toDate));
    }

    const total = await Enrollment.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const items = await Enrollment.find(filter)
      .select('-accessToken -confirmationEmailSentAt')
      .populate('trainingId', 'title slug amount currency paymentType duration category')
      .sort({ enrolledAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return res.json({
      success: true,
      data: items,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: total,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('[candidates] list error:', error);
    return res.status(500).json({ success: false, message: 'Error fetching candidates' });
  }
}

// GET /api/admin/candidates/:id — full candidate, enrollment & payment details
async function getCandidateById(req, res) {
  try {
    const { id } = req.params;
    if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json({ success: false, message: 'Invalid candidate ID' });
    }

    const enrollment = await Enrollment.findById(id)
      .populate('trainingId', 'title slug featuredImage category duration trainingMode level technologies price paymentType amount currency isFree startDate endDate trainer certification description shortDescription')
      .lean();

    if (!enrollment) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    // Fetch related payment record for Razorpay transaction details
    const payment = await Payment.findOne({ enrollmentId: enrollment._id })
      .select('razorpayOrderId razorpayPaymentId razorpaySignatureVerified paymentMethod paymentStatus failureReason paidAt transactionId createdAt updatedAt')
      .lean();

    const training = enrollment.trainingId && typeof enrollment.trainingId === 'object'
      ? enrollment.trainingId
      : null;

    const { accessToken, confirmationEmailSentAt, ...safe } = enrollment;

    return res.json({
      success: true,
      data: {
        ...safe,
        trainingId: training ? training._id : safe.trainingId,
        training,
        payment: payment || null
      }
    });
  } catch (error) {
    console.error('[candidates] detail error:', error);
    return res.status(500).json({ success: false, message: 'Error fetching candidate details' });
  }
}

module.exports = { listCandidates, getCandidateById };
