const Razorpay = require('razorpay');
const crypto = require('crypto');
const Training = require('../models/Training');
const Enrollment = require('../models/Enrollment');
const Payment = require('../models/Payment');
const { sendEnrollmentEmails } = require('../utils/emailService');
const { escapeRegExp } = require('../utils/slug');

function errDetail(error) {
  return process.env.NODE_ENV === 'production' ? undefined : (error ? error.message : undefined);
}

function sendError(res, status, message, error) {
  return res.status(status).json({
    success: false,
    message,
    error: errDetail(error)
  });
}

function clampInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function generateTransactionId() {
  return `TXN_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

// Opaque per-enrollment capability token. The candidate is not logged in, so
// this is what proves they own the enrollment they are paying for / viewing.
function generateAccessToken() {
  return crypto.randomBytes(24).toString('hex');
}

function tokensMatch(expected, provided) {
  const a = Buffer.from(String(expected || ''));
  const b = Buffer.from(String(provided || ''));
  if (!a.length || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function signaturesMatch(expected, provided) {
  const a = Buffer.from(String(expected || ''), 'utf8');
  const b = Buffer.from(String(provided || ''), 'utf8');
  if (!a.length || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// verify + webhook can both fire for one payment. Claim the send slot atomically
// so the candidate and the admin inbox receive exactly one confirmation.
async function sendConfirmationOnce(enrollmentId, training) {
  try {
    const claimed = await Enrollment.findOneAndUpdate(
      { _id: enrollmentId, confirmationEmailSentAt: { $exists: false } },
      { $set: { confirmationEmailSentAt: new Date() } },
      { new: true }
    ).lean();
    if (!claimed) return;
    await sendEnrollmentEmails(claimed, training);
  } catch (emailErr) {
    console.error('[email] enrollment confirmation send failed:', emailErr.message);
  }
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''));
}

function isValidMobile(value) {
  return /^\+?[\d\s\-()]{7,20}$/.test(String(value || ''));
}

let razorpayInstance = null;

function getRazorpay() {
  if (!razorpayInstance) {
    razorpayInstance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
  }
  return razorpayInstance;
}

// Validate enrollment form data
function validateEnrollment(body) {
  const fail = (message) => ({ status: 400, message });

  if (!body.candidateName || !String(body.candidateName).trim()) {
    return fail('Candidate name is required');
  }
  if (String(body.candidateName).trim().length > 160) {
    return fail('Candidate name must be at most 160 characters');
  }
  if (!isValidEmail(body.email)) {
    return fail('Please enter a valid email address');
  }
  if (!isValidMobile(body.mobile)) {
    return fail('Please enter a valid mobile number');
  }
  if (body.qualification !== undefined && String(body.qualification).length > 200) {
    return fail('Qualification must be at most 200 characters');
  }
  if (body.organization !== undefined && String(body.organization).length > 200) {
    return fail('Organization must be at most 200 characters');
  }
  if (body.message !== undefined && String(body.message).length > 1000) {
    return fail('Message must be at most 1000 characters');
  }
  return null;
}

// POST /api/training/enroll — create enrollment (free or pending payment)
async function enroll(req, res) {
  try {
    const {
      candidateName, email, mobile, qualification, organization,
      message, trainingId
    } = req.body || {};

    const invalid = validateEnrollment(req.body);
    if (invalid) return sendError(res, invalid.status, invalid.message);

    if (!trainingId || !/^[0-9a-fA-F]{24}$/.test(trainingId)) {
      return sendError(res, 400, 'Invalid training ID');
    }

    // Fetch training from DB — never trust frontend for price/course data
    const training = await Training.findById(trainingId).lean();
    if (!training) {
      return sendError(res, 404, 'Training not found');
    }
    if (training.status !== 'published') {
      return sendError(res, 403, 'Only published courses are open for enrollment');
    }

    // Prevent duplicate successful enrollments for same candidate + course
    const existingConfirmed = await Enrollment.findOne({
      email: String(email).trim().toLowerCase(),
      trainingId,
      enrollmentStatus: 'confirmed'
    });
    if (existingConfirmed) {
      return sendError(res, 409, 'You are already enrolled in this course.');
    }

    // If a pending enrollment already exists for this candidate + course,
    // return it so the candidate can continue to payment instead of erroring.
    const existingPending = await Enrollment.findOne({
      email: String(email).trim().toLowerCase(),
      trainingId,
      enrollmentStatus: 'pending'
    });
    if (existingPending) {
      const paymentRequired = existingPending.paymentType === 'Paid';
      // Legacy rows created before capability tokens existed need one minted
      // now, otherwise their payment link would never be authorised.
      let token = existingPending.accessToken;
      if (!token) {
        token = generateAccessToken();
        existingPending.accessToken = token;
        await existingPending.save();
      }
      return res.status(200).json({
        success: true,
        message: paymentRequired
          ? 'Payment pending. Complete payment to confirm enrollment.'
          : 'Enrollment already confirmed.',
        data: {
          enrollmentId: existingPending._id,
          transactionId: existingPending.transactionId,
          accessToken: token,
          paymentStatus: existingPending.paymentStatus,
          enrollmentStatus: existingPending.enrollmentStatus,
          amount: existingPending.amount,
          currency: existingPending.currency,
          paymentRequired,
          redirectUrl: `/training/payment/${existingPending._id}?status=${paymentRequired ? 'pending' : 'success'}&token=${encodeURIComponent(token)}`
        }
      });
    }

    const paymentType = training.paymentType || 'Free';
    const amount = paymentType === 'Paid' ? (training.amount || 0) : 0;
    const currency = training.currency || 'INR';
    const accessToken = generateAccessToken();

    const enrollment = await Enrollment.create({
      candidateName: String(candidateName).trim(),
      email: String(email).trim().toLowerCase(),
      mobile: String(mobile).trim(),
      qualification: String(qualification || '').trim(),
      organization: String(organization || '').trim(),
      message: String(message || '').trim(),
      trainingId,
      courseTitleSnapshot: training.title,
      amount,
      currency,
      paymentType,
      enrollmentStatus: paymentType === 'Paid' ? 'pending' : 'confirmed',
      paymentStatus: paymentType === 'Paid' ? 'pending' : 'paid',
      transactionId: generateTransactionId(),
      accessToken
    });

    // Free course: confirm immediately and send emails
    if (paymentType === 'Free') {
      enrollment.enrollmentStatus = 'confirmed';
      enrollment.paymentStatus = 'paid';
      enrollment.paidAt = new Date();
      await enrollment.save();

      let payment = null;
      try {
        payment = await Payment.create({
          enrollmentId: enrollment._id,
          trainingId,
          candidateEmail: enrollment.email,
          amount: 0,
          currency,
          razorpayOrderId: '',
          razorpaySignature: '',
          razorpaySignatureVerified: true,
          transactionId: enrollment.transactionId,
          paymentStatus: 'paid',
          paymentMethod: 'free'
        });
      } catch (bookkeepingError) {
        // The enrollment is already confirmed; a ledger failure must not turn
        // a successful free enrollment into a 500 for the candidate.
        console.error('[payment] free enrollment ledger write failed:', bookkeepingError.message);
      }
      void payment;

      await sendConfirmationOnce(enrollment._id, training);

      return res.status(201).json({
        success: true,
        message: 'Enrollment confirmed for free course',
        data: {
          enrollmentId: enrollment._id,
          transactionId: enrollment.transactionId,
          accessToken,
          paymentStatus: 'paid',
          enrollmentStatus: 'confirmed',
          amount: 0,
          currency,
          paymentRequired: false,
          redirectUrl: `/training/payment/${enrollment._id}?status=success&token=${encodeURIComponent(accessToken)}`
        }
      });
    }

    // Paid course: create pending enrollment, then create Razorpay order
    return res.status(201).json({
      success: true,
      message: 'Enrollment created. Payment required.',
      data: {
        enrollmentId: enrollment._id,
        transactionId: enrollment.transactionId,
        accessToken,
        paymentStatus: 'pending',
        enrollmentStatus: 'pending',
        amount,
        currency,
        paymentRequired: true,
        redirectUrl: `/training/payment/${enrollment._id}?status=pending&token=${encodeURIComponent(accessToken)}`
      }
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return sendError(res, 409, 'You are already enrolled in this course.');
    }
    return sendError(res, 500, 'Error creating enrollment', error);
  }
}

// POST /api/training/payment/create-order — create Razorpay order for pending enrollment
async function createOrder(req, res) {
  try {
    const { enrollmentId, token } = req.body || {};

    if (!enrollmentId || !/^[0-9a-fA-F]{24}$/.test(enrollmentId)) {
      return sendError(res, 400, 'Invalid enrollment ID');
    }

    const enrollment = await Enrollment.findById(enrollmentId);
    if (!enrollment) {
      return sendError(res, 404, 'Enrollment not found');
    }
    if (!tokensMatch(enrollment.accessToken, token)) {
      return sendError(res, 403, 'This payment link is no longer valid. Please enroll again.');
    }
    if (enrollment.paymentType !== 'Paid') {
      return sendError(res, 400, 'This enrollment does not require payment');
    }
    if (enrollment.paymentStatus === 'paid') {
      return sendError(res, 409, 'Payment already completed for this enrollment');
    }
    if (enrollment.enrollmentStatus === 'cancelled') {
      return sendError(res, 409, 'This enrollment was cancelled. Please enroll again.');
    }

    // Re-verify the course is still published before creating a payment order.
    const training = await Training.findById(enrollment.trainingId).lean();
    if (!training) {
      return sendError(res, 404, 'Training not found');
    }
    if (training.status !== 'published') {
      return sendError(res, 403, 'This course is no longer available for enrollment.');
    }
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return sendError(res, 500, 'Payment gateway is not configured');
    }

    // The amount was snapshotted on the server at enrollment time. It must not
    // change if an admin edits the course while the candidate is paying.
    const amount = Number(enrollment.amount) || 0;
    const currency = enrollment.currency || 'INR';
    const amountInPaise = Math.round(amount * 100);

    if (amountInPaise <= 0) {
      return sendError(res, 400, 'Invalid course amount');
    }

    // Check for existing pending payment for this enrollment
    const existingPayment = await Payment.findOne({
      enrollmentId,
      paymentStatus: 'pending'
    });
    if (existingPayment && existingPayment.razorpayOrderId) {
      // Return existing order details for retry
      return res.json({
        success: true,
        data: {
          orderId: existingPayment.razorpayOrderId,
          amount: existingPayment.amount,
          currency: existingPayment.currency,
          keyId: process.env.RAZORPAY_KEY_ID,
          enrollmentId: enrollment._id,
          transactionId: enrollment.transactionId
        }
      });
    }

    // Create Razorpay order
    const order = await getRazorpay().orders.create({
      amount: amountInPaise,
      currency,
      receipt: `enroll_${enrollment._id}`,
      notes: {
        enrollmentId: enrollment._id.toString(),
        candidateEmail: enrollment.email,
        courseTitle: enrollment.courseTitleSnapshot
      }
    });

    // Save payment record as pending. `razorpayPaymentId` stays unset until the
    // gateway returns a real id — writing '' used to break the unique index.
    await Payment.create({
      enrollmentId: enrollment._id,
      trainingId: enrollment.trainingId,
      candidateEmail: enrollment.email,
      amount,
      currency,
      razorpayOrderId: order.id,
      razorpaySignature: '',
      razorpaySignatureVerified: false,
      transactionId: enrollment.transactionId,
      paymentStatus: 'pending',
      paymentMethod: ''
    });

    return res.json({
      success: true,
      data: {
        orderId: order.id,
        amount,
        currency,
        keyId: process.env.RAZORPAY_KEY_ID,
        enrollmentId: enrollment._id,
        transactionId: enrollment.transactionId
      }
    });
  } catch (error) {
    return sendError(res, 500, 'Error creating payment order', error);
  }
}

// POST /api/training/payment/verify — verify Razorpay payment signature
async function verifyPayment(req, res) {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      enrollmentId,
      token
    } = req.body || {};

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !enrollmentId) {
      return sendError(res, 400, 'Missing payment verification details');
    }

    if (!/^[0-9a-fA-F]{24}$/.test(enrollmentId)) {
      return sendError(res, 400, 'Invalid enrollment ID');
    }

    const enrollment = await Enrollment.findById(enrollmentId);
    if (!enrollment) {
      return sendError(res, 404, 'Enrollment not found');
    }
    if (!tokensMatch(enrollment.accessToken, token)) {
      return sendError(res, 403, 'This payment link is no longer valid. Please enroll again.');
    }

    // Idempotency: if already paid, return success without reprocessing
    if (enrollment.paymentStatus === 'paid') {
      return res.json({
        success: true,
        message: 'Payment already verified',
        data: {
          enrollmentId: enrollment._id,
          paymentStatus: 'paid',
          enrollmentStatus: 'confirmed',
          transactionId: enrollment.transactionId
        }
      });
    }

    // Verify signature using HMAC SHA256
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
      .update(body)
      .digest('hex');

    if (!signaturesMatch(expectedSignature, razorpay_signature)) {
      // Record the failure against a known order only (never upsert from a
      // signature we have not verified).
      await Payment.findOneAndUpdate(
        { razorpayOrderId: razorpay_order_id, enrollmentId: enrollment._id },
        {
          paymentStatus: 'failed',
          razorpayPaymentId: razorpay_payment_id,
          razorpaySignature,
          razorpaySignatureVerified: false,
          failureReason: 'Signature verification failed'
        }
      );
      return sendError(res, 400, 'Payment signature verification failed');
    }

    // Fetch payment record to validate amount and order ownership
    const payment = await Payment.findOne({ razorpayOrderId: razorpay_order_id });
    if (!payment) {
      return sendError(res, 404, 'Payment order not found');
    }
    if (String(payment.enrollmentId) !== String(enrollment._id)) {
      return sendError(res, 403, 'Payment order does not belong to this enrollment');
    }

    // The amount is the server-side snapshot taken at enrollment time; the
    // gateway order was created from the same value, so they must agree.
    if (Number(payment.amount) !== Number(enrollment.amount)) {
      return sendError(res, 400, 'Payment amount does not match the enrollment amount');
    }

    const training = await Training.findById(enrollment.trainingId).lean();
    if (!training) {
      return sendError(res, 404, 'Training not found');
    }

    // Fetch payment details from Razorpay to confirm the payment is actually
    // captured (not merely authorized) and to get the payment method.
    let paymentMethod = '';
    let razorpayStatus = '';
    try {
      const rzPayment = await getRazorpay().payments.fetch(razorpay_payment_id);
      paymentMethod = rzPayment.method || '';
      razorpayStatus = rzPayment.status || '';
    } catch {
      // Ignore fetch errors — signature is already verified, but we cannot
      // confirm capture without Razorpay's status.
    }

    // Only a captured payment may confirm an enrollment. Authorized/pending/
    // failed payments must not move the enrollment to paid/confirmed.
    if (razorpayStatus !== 'captured') {
      await Payment.findOneAndUpdate(
        { razorpayOrderId: razorpay_order_id, enrollmentId: enrollment._id },
        {
          paymentStatus: 'failed',
          razorpayPaymentId: razorpay_payment_id,
          razorpaySignature,
          razorpaySignatureVerified: false,
          failureReason: `Razorpay payment not captured (status: ${razorpayStatus || 'unknown'})`
        }
      );
      return sendError(res, 400, 'Payment not captured by Razorpay');
    }

    // Update payment record as verified/paid
    try {
      payment.razorpayPaymentId = razorpay_payment_id;
      payment.razorpaySignature = razorpay_signature;
      payment.razorpaySignatureVerified = true;
      payment.paymentStatus = 'paid';
      payment.paymentMethod = paymentMethod;
      await payment.save();
    } catch (saveError) {
      return sendError(res, 500, 'Error saving payment record');
    }

    // Update enrollment as confirmed/paid
    try {
      enrollment.paymentStatus = 'paid';
      enrollment.enrollmentStatus = 'confirmed';
      enrollment.razorpayOrderId = razorpay_order_id;
      enrollment.razorpayPaymentId = razorpay_payment_id;
      enrollment.paidAt = new Date();
      await enrollment.save();
    } catch (saveError) {
      return sendError(res, 500, 'Error updating enrollment record');
    }

    // Send confirmation emails (only after successful verification, at most once).
    // Email failures do not reverse the verified payment.
    try {
      await sendConfirmationOnce(enrollment._id, training);
    } catch (emailError) {
      console.error('[email] enrollment confirmation send failed:', emailError.message);
    }

    return res.json({
      success: true,
      message: 'Payment verified successfully',
      data: {
        enrollmentId: enrollment._id,
        transactionId: enrollment.transactionId,
        razorpayPaymentId,
        paymentStatus: 'paid',
        enrollmentStatus: 'confirmed',
        amount: payment.amount,
        currency: payment.currency
      }
    });
  } catch (error) {
    return sendError(res, 500, 'Error verifying payment');
  }
}

// POST /api/training/payment/webhook — Razorpay webhook (idempotent)
// NOTE: mounted in server.js BEFORE express.json() so `req.body` is the raw
// Buffer. The HMAC must be computed over the exact bytes Razorpay signed.
async function webhook(req, res) {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];

    if (!secret || !signature) {
      return res.status(401).json({ success: false, message: 'Webhook secret not configured or missing signature' });
    }

    const raw = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}), 'utf8');

    const digest = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    if (!signaturesMatch(digest, signature)) {
      return res.status(401).json({ success: false, message: 'Invalid webhook signature' });
    }

    let parsed;
    try {
      parsed = JSON.parse(raw.toString('utf8'));
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid webhook payload' });
    }

    const { payload } = parsed || {};
    const paymentEntity = payload && payload.payment && payload.payment.entity;

    if (!paymentEntity) {
      return res.status(200).json({ success: true, message: 'Webhook received' });
    }

    // Razorpay webhook entities use `id` / `order_id` / `status`; the
    // `razorpay_*` names only appear in the checkout handler payload.
    const razorpay_order_id = paymentEntity.order_id;
    const razorpay_payment_id = paymentEntity.id;
    const status = paymentEntity.status;

    if (!razorpay_order_id || !razorpay_payment_id) {
      return res.status(200).json({ success: true, message: 'Webhook received' });
    }

    // Find payment by Razorpay order ID
    const payment = await Payment.findOne({ razorpayOrderId: razorpay_order_id });
    if (!payment) {
      return res.status(200).json({ success: true, message: 'Payment not tracked locally' });
    }

    // Idempotency: already captured/confirmed — nothing to do.
    if (payment.paymentStatus === 'paid') {
      return res.status(200).json({ success: true, message: 'Already processed' });
    }

    const enrollment = await Enrollment.findById(payment.enrollmentId);
    if (!enrollment) {
      return res.status(200).json({ success: true, message: 'Enrollment not found' });
    }

    const training = await Training.findById(enrollment.trainingId).lean();
    if (!training) {
      return res.status(200).json({ success: true, message: 'Training not found' });
    }

    // Validate the gateway amount (paise) against the order amount we created.
    const amountFromRazorpay = Number(paymentEntity.amount) || 0;
    const expectedAmountPaise = Math.round((Number(payment.amount) || 0) * 100);
    if (amountFromRazorpay !== expectedAmountPaise) {
      return res.status(200).json({ success: true, message: 'Amount mismatch' });
    }

    if (status === 'captured') {
      payment.razorpayPaymentId = razorpay_payment_id;
      payment.paymentStatus = 'paid';
      payment.razorpaySignatureVerified = true;
      payment.paymentMethod = paymentEntity.method || payment.paymentMethod || '';
      await payment.save();

      enrollment.paymentStatus = 'paid';
      enrollment.enrollmentStatus = 'confirmed';
      enrollment.razorpayOrderId = razorpay_order_id;
      enrollment.razorpayPaymentId = razorpay_payment_id;
      enrollment.paidAt = enrollment.paidAt || new Date();
      await enrollment.save();

      await sendConfirmationOnce(enrollment._id, training);
    } else if (status === 'failed') {
      payment.paymentStatus = 'failed';
      payment.failureReason = 'Razorpay payment failed';
      await payment.save();

      // Keep the enrollment 'pending' (not cancelled) so the candidate can
      // retry the payment from the same page.
      enrollment.paymentStatus = 'failed';
      await enrollment.save();
    }

    return res.status(200).json({ success: true, message: 'Webhook processed' });
  } catch (error) {
    console.error('[webhook] error:', errDetail(error));
    return res.status(500).json({ success: false, message: 'Webhook processing error' });
  }
}

// GET /api/training/enrollment/:id — get enrollment details (token-gated)
async function getEnrollment(req, res) {
  try {
    const { id } = req.params;
    if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
      return sendError(res, 400, 'Invalid enrollment ID');
    }
    const enrollment = await Enrollment.findById(id)
      .populate('trainingId', 'title slug featuredImage category duration trainingMode level technologies price paymentType amount currency isFree startDate endDate trainer certification')
      .lean();
    if (!enrollment) {
      return sendError(res, 404, 'Enrollment not found');
    }
    if (!tokensMatch(enrollment.accessToken, req.query.token)) {
      return sendError(res, 403, 'This enrollment link is no longer valid. Please enroll again.');
    }

    const training = enrollment.trainingId && typeof enrollment.trainingId === 'object'
      ? enrollment.trainingId
      : null;
    const { accessToken, ...safe } = enrollment;

    return res.json({
      success: true,
      data: {
        ...safe,
        trainingId: training ? training._id : safe.trainingId,
        training
      }
    });
  } catch (error) {
    return sendError(res, 500, 'Error fetching enrollment', error);
  }
}

// GET /api/training/payment/:id/status — get payment status (token-gated)
async function getPaymentStatus(req, res) {
  try {
    const { id } = req.params;
    if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
      return sendError(res, 400, 'Invalid payment ID');
    }
    const payment = await Payment.findById(id).lean();
    if (!payment) {
      return sendError(res, 404, 'Payment not found');
    }
    const enrollment = await Enrollment.findById(payment.enrollmentId).select('accessToken').lean();
    if (!enrollment || !tokensMatch(enrollment.accessToken, req.query.token)) {
      return sendError(res, 403, 'This payment link is no longer valid.');
    }
    return res.json({
      success: true,
      data: {
        _id: payment._id,
        enrollmentId: payment.enrollmentId,
        paymentStatus: payment.paymentStatus,
        amount: payment.amount,
        currency: payment.currency,
        transactionId: payment.transactionId,
        razorpayOrderId: payment.razorpayOrderId,
        razorpayPaymentId: payment.razorpayPaymentId || '',
        updatedAt: payment.updatedAt
      }
    });
  } catch (error) {
    return sendError(res, 500, 'Error fetching payment status', error);
  }
}

// GET /api/training/admin/enrollments — list enrollments with filters (admin)
async function listEnrollments(req, res) {
  try {
    const page = clampInt(req.query.page, 1, 1, 1000);
    const limit = clampInt(req.query.limit, 20, 1, 100);
    const filter = {};

    if (req.query.paymentStatus && ['pending', 'paid', 'failed', 'cancelled'].includes(String(req.query.paymentStatus))) {
      filter.paymentStatus = String(req.query.paymentStatus);
    }

    if (req.query.enrollmentStatus && ['pending', 'confirmed', 'cancelled'].includes(String(req.query.enrollmentStatus))) {
      filter.enrollmentStatus = String(req.query.enrollmentStatus);
    }

    if (req.query.paymentType && ['Free', 'Paid'].includes(String(req.query.paymentType))) {
      filter.paymentType = String(req.query.paymentType);
    }

    if (req.query.trainingId && /^[0-9a-fA-F]{24}$/.test(String(req.query.trainingId))) {
      filter.trainingId = String(req.query.trainingId);
    }

    if (req.query.search && String(req.query.search).trim() !== '') {
      const q = escapeRegExp(String(req.query.search).trim().slice(0, 100));
      const rx = new RegExp(q, 'i');
      filter.$or = [{ candidateName: rx }, { email: rx }, { mobile: rx }, { courseTitleSnapshot: rx }];
    }

    if (req.query.fromDate || req.query.toDate) {
      filter.enrolledAt = {};
      if (req.query.fromDate) filter.enrolledAt.$gte = new Date(String(req.query.fromDate));
      if (req.query.toDate) filter.enrolledAt.$lte = new Date(String(req.query.toDate));
    }

    const total = await Enrollment.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const items = await Enrollment.find(filter)
      .select('-accessToken')
      .populate('trainingId', 'title slug amount currency paymentType')
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
    return sendError(res, 500, 'Error fetching enrollments', error);
  }
}

// GET /api/training/admin/enrollments/stats — enrollment statistics (admin)
async function getEnrollmentStats(req, res) {
  try {
    const totalEnrollments = await Enrollment.countDocuments();
    const totalSuccessfulPayments = await Enrollment.countDocuments({ paymentStatus: 'paid' });
    const totalPendingPayments = await Enrollment.countDocuments({ paymentStatus: 'pending' });
    const totalRevenue = await Enrollment.aggregate([
      { $match: { paymentStatus: 'paid' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const courseWiseCount = await Enrollment.aggregate([
      { $group: { _id: '$courseTitleSnapshot', count: { $sum: 1 } } },
    ]);

    return res.json({
      success: true,
      data: {
        totalEnrollments,
        totalRevenue: totalRevenue.length > 0 ? totalRevenue[0].total : 0,
        totalSuccessfulPayments,
        totalPendingPayments,
        courseWiseCount: courseWiseCount.map((c) => ({ course: c._id, count: c.count }))
      }
    });
  } catch (error) {
    return sendError(res, 500, 'Error fetching enrollment stats', error);
  }
}

// GET /api/training/admin/enrollments/export — export enrollments to CSV (admin)
async function exportEnrollments(req, res) {
  try {
    const filter = {};

    if (req.query.paymentStatus && ['pending', 'paid', 'failed', 'cancelled'].includes(String(req.query.paymentStatus))) {
      filter.paymentStatus = String(req.query.paymentStatus);
    }
    if (req.query.enrollmentStatus && ['pending', 'confirmed', 'cancelled'].includes(String(req.query.enrollmentStatus))) {
      filter.enrollmentStatus = String(req.query.enrollmentStatus);
    }
    if (req.query.paymentType && ['Free', 'Paid'].includes(String(req.query.paymentType))) {
      filter.paymentType = String(req.query.paymentType);
    }
    if (req.query.trainingId && /^[0-9a-fA-F]{24}$/.test(String(req.query.trainingId))) {
      filter.trainingId = String(req.query.trainingId);
    }
    if (req.query.search && String(req.query.search).trim() !== '') {
      const q = escapeRegExp(String(req.query.search).trim().slice(0, 100));
      const rx = new RegExp(q, 'i');
      filter.$or = [{ candidateName: rx }, { email: rx }, { mobile: rx }, { courseTitleSnapshot: rx }];
    }
    if (req.query.fromDate || req.query.toDate) {
      filter.enrolledAt = {};
      if (req.query.fromDate) filter.enrolledAt.$gte = new Date(String(req.query.fromDate));
      if (req.query.toDate) filter.enrolledAt.$lte = new Date(String(req.query.toDate));
    }

    const items = await Enrollment.find(filter)
      .populate('trainingId', 'title')
      .sort({ enrolledAt: -1 })
      .lean();

    const headers = [
      'Enrollment ID', 'Candidate Name', 'Email', 'Mobile', 'Qualification',
      'Organization', 'Message', 'Course', 'Amount', 'Currency', 'Payment Type',
      'Enrollment Status', 'Payment Status', 'Transaction ID',
      'Razorpay Order ID', 'Razorpay Payment ID', 'Enrolled At', 'Paid At'
    ];

    const rows = items.map((e) => [
      e._id,
      e.candidateName,
      e.email,
      e.mobile,
      e.qualification || '',
      e.organization || '',
      e.message || '',
      e.courseTitleSnapshot,
      e.amount,
      e.currency,
      e.paymentType,
      e.enrollmentStatus,
      e.paymentStatus,
      e.transactionId || '',
      e.razorpayOrderId || '',
      e.razorpayPaymentId || '',
      new Date(e.enrolledAt).toISOString(),
      e.paidAt ? new Date(e.paidAt).toISOString() : ''
    ]);

    // Escape CSV + neutralise spreadsheet formula injection (=, +, -, @).
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => {
        let s = String(cell == null ? '' : cell);
        if (/^[=+\-@]/.test(s)) s = `'${s}`;
        if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      }).join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=enrollments.csv');
    return res.send(csv);
  } catch (error) {
    return sendError(res, 500, 'Error exporting enrollments', error);
  }
}

module.exports = {
  enroll,
  createOrder,
  verifyPayment,
  webhook,
  getEnrollment,
  getPaymentStatus,
  listEnrollments,
  getEnrollmentStats,
  exportEnrollments
};
