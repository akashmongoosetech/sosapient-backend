const mongoose = require('mongoose');

const enrollmentSchema = new mongoose.Schema({
  candidateName: {
    type: String,
    required: [true, 'Candidate name is required'],
    trim: true,
    maxlength: [160, 'Candidate name must be at most 160 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    lowercase: true,
    maxlength: [160, 'Email is too long'],
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email address']
  },
  mobile: {
    type: String,
    required: [true, 'Mobile number is required'],
    trim: true,
    maxlength: [20, 'Mobile number is too long']
  },
  qualification: {
    type: String,
    trim: true,
    maxlength: [200, 'Qualification must be at most 200 characters'],
    default: ''
  },
  organization: {
    type: String,
    trim: true,
    maxlength: [200, 'Organization must be at most 200 characters'],
    default: ''
  },
  message: {
    type: String,
    trim: true,
    maxlength: [1000, 'Message must be at most 1000 characters'],
    default: ''
  },
  trainingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Training',
    required: [true, 'Training ID is required'],
    index: true
  },
  courseTitleSnapshot: {
    type: String,
    required: [true, 'Course title snapshot is required'],
    trim: true,
    maxlength: [160, 'Course title snapshot must be at most 160 characters']
  },
  amount: {
    type: Number,
    min: [0, 'Amount must be non-negative'],
    default: 0
  },
  currency: {
    type: String,
    trim: true,
    maxlength: [10, 'Currency must be at most 10 characters'],
    default: 'INR'
  },
  paymentType: {
    type: String,
    enum: ['Free', 'Paid'],
    default: 'Free',
    index: true
  },
  enrollmentStatus: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled'],
    default: 'pending',
    index: true
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'cancelled'],
    default: 'pending',
    index: true
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
    maxlength: [100, 'Razorpay payment ID is too long'],
    default: ''
  },
  transactionId: {
    type: String,
    trim: true,
    maxlength: [100, 'Transaction ID is too long'],
    unique: true,
    sparse: true,
    index: true
  },
  // Opaque token that lets the (unauthenticated) candidate read + pay for their
  // own enrollment without exposing every enrollment to anyone who guesses an id.
  accessToken: {
    type: String,
    trim: true,
    maxlength: [128, 'Access token is too long'],
    default: ''
  },
  // Guard so verify + webhook cannot both send the confirmation email.
  confirmationEmailSentAt: {
    type: Date
  },
  enrolledAt: {
    type: Date,
    default: Date.now
  },
  paidAt: {
    type: Date
  }
}, { timestamps: true });

// Prevent duplicate successful enrollments for same candidate + course
enrollmentSchema.index(
  { email: 1, trainingId: 1 },
  {
    unique: true,
    partialFilterExpression: { enrollmentStatus: 'confirmed' }
  }
);

module.exports = mongoose.model('Enrollment', enrollmentSchema);
