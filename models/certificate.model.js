const mongoose = require('mongoose');

const certificateSchema = new mongoose.Schema({
  certificateId: {
    type: String,
    required: [true, 'Certificate ID is required'],
    unique: true,
    trim: true,
    uppercase: true,
    maxlength: [32, 'Certificate ID must be at most 32 characters']
  },
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [100, 'First name must be at most 100 characters']
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [100, 'Last name must be at most 100 characters']
  },
  college: {
    type: String,
    trim: true,
    maxlength: [200, 'College must be at most 200 characters'],
    default: ''
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    maxlength: [160, 'Email is too long'],
    default: '',
    validate: {
      validator: (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      message: 'Please enter a valid email address'
    }
  },
  mobileNumber: {
    type: String,
    trim: true,
    maxlength: [20, 'Mobile number is too long'],
    default: ''
  },
  course: {
    type: String,
    trim: true,
    maxlength: [160, 'Course must be at most 160 characters'],
    default: ''
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required']
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required']
  },
  internshipTrainingCourse: {
    type: String,
    required: [true, 'Internship training course is required'],
    trim: true,
    maxlength: [160, 'Internship training course must be at most 160 characters']
  },
  durationMonths: {
    type: Number,
    required: true,
    min: [0, 'Duration cannot be negative']
  },
  durationDays: {
    type: Number,
    required: true,
    min: [0, 'Duration days cannot be negative']
  },
  durationText: {
    type: String,
    required: true,
    trim: true,
    maxlength: [40, 'Duration text must be at most 40 characters']
  },
  hrHeadName: {
    type: String,
    required: true,
    trim: true,
    maxlength: [100, 'HR head name must be at most 100 characters']
  },
  hrHeadDesignation: {
    type: String,
    required: true,
    trim: true,
    maxlength: [60, 'HR head designation must be at most 60 characters']
  },
  hrHeadSignature: {
    type: String,
    trim: true,
    maxlength: [204800, 'HR head signature is too long'],
    default: ''
  },
  managerName: {
    type: String,
    required: true,
    trim: true,
    maxlength: [100, 'Manager name must be at most 100 characters']
  },
  managerDesignation: {
    type: String,
    required: true,
    trim: true,
    maxlength: [60, 'Manager designation must be at most 60 characters']
  },
  managerSignature: {
    type: String,
    trim: true,
    maxlength: [204800, 'Manager signature is too long'],
    default: ''
  },
  verificationSlug: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    maxlength: [160, 'Verification slug must be at most 160 characters']
  },
  status: {
    type: String,
    enum: ['valid', 'revoked'],
    default: 'valid'
  }
}, {
  timestamps: true
});

certificateSchema.index({ certificateId: 1 }, { unique: true });
certificateSchema.index({ verificationSlug: 1 });
certificateSchema.index({ email: 1 });

module.exports = mongoose.model('Certificate', certificateSchema);
