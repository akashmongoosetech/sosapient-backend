const mongoose = require('mongoose');
const { emailDeliverySchema } = require('./emailDelivery.schema');

const careerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required']
  },
  resume: {
    data: Buffer,
    contentType: String,
    filename: String
  },
  coverLetter: {
    type: String
  },
  position: {
    type: String,
    required: [true, 'Position is required']
  },
  experience: {
    type: String,
    required: [true, 'Experience is required']
  },
  currentCompany: {
    type: String,
    trim: true,
    default: ''
  },
  expectedSalary: {
    type: String,
    trim: true,
    default: ''
  },
  noticePeriod: {
    type: String,
    trim: true,
    default: ''
  },
  // Where the candidate currently lives. Optional in the schema on purpose: the
  // form requires them, but making them required here would reject applications
  // from the previously deployed frontend during a staggered rollout.
  currentAddress: {
    type: String,
    trim: true,
    default: ''
  },
  city: {
    type: String,
    trim: true,
    default: ''
  },
  state: {
    type: String,
    trim: true,
    default: ''
  },
  country: {
    type: String,
    trim: true,
    default: ''
  },
  status: {
    type: String,
    enum: ['pending', 'reviewed', 'shortlisted', 'rejected'],
    default: 'pending'
  },
  emailDelivery: {
    type: emailDeliverySchema,
    default: () => ({})
  }
}, {
  timestamps: true
});

careerSchema.index({ status: 1, createdAt: -1 });
careerSchema.index({ email: 1 });

module.exports = mongoose.model('Career', careerSchema); 