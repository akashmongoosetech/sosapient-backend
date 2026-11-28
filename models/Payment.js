const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  enrollmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Enrollment',
    required: [true, 'Enrollment ID is required'],
    index: true
  },
  trainingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Training',
    required: [true, 'Training ID is required'],
    index: true
  },
  candidateEmail: {
    type: String,
    required: [true, 'Candidate email is required'],
    trim: true,
    lowercase: true
  },
  amount: {
    type: Number,
    min: [0, 'Amount must be non-negative'],
    required: [true, 'Amount is required']
  },
  currency: {
    type: String,
    trim: true,
    maxlength: [10, 'Currency must be at most 10 characters'],
    default: 'INR'
  },
  razorpayOrderId: {
    type: String,
    trim: true,
    maxlength: [100, 'Razorpay order ID is too long'],
    default: ''
  },
  razorpayPaymentId: {
    type: String,
    trim: true,
    maxlength: [100, 'Razorpay payment ID is too long']
  },
  razorpaySignature: {
    type: String,
    trim: true,
    maxlength: [200, 'Razorpay signature is too long'],
    default: ''
  },
  razorpaySignatureVerified: {
    type: Boolean,
    default: false
  },
  transactionId: {
    type: String,
    trim: true,
    maxlength: [100, 'Transaction ID is too long'],
    index: true
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'cancelled'],
    default: 'pending',
    index: true
  },
  paymentMethod: {
    type: String,
    trim: true,
    maxlength: [50, 'Payment method is too long'],
    default: ''
  },
  failureReason: {
    type: String,
    trim: true,
    maxlength: [500, 'Failure reason is too long'],
    default: ''
  }
}, { timestamps: true });

// Prevent duplicate payment processing for the same Razorpay payment ID.
// Empty/missing ids must never be indexed: pending payments do not have one yet.
paymentSchema.index(
  { razorpayPaymentId: 1 },
  {
    unique: true,
    partialFilterExpression: { razorpayPaymentId: { $gt: '' } }
  }
);

// One pending payment per enrollment at a time
paymentSchema.index(
  { enrollmentId: 1 },
  {
    unique: true,
    name: 'enrollmentId_pending_unique',
    partialFilterExpression: { paymentStatus: 'pending' }
  }
);

// Index razorpayOrderId for webhook lookups (non-unique: order ids are unique
// in practice but we do not enforce at DB level to avoid edge-case conflicts).
paymentSchema.index({ razorpayOrderId: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
