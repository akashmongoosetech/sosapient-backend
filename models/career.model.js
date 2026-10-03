const mongoose = require('mongoose');

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
    required: [true, 'Current company is required']
  },
  expectedSalary: {
    type: String,
    required: [true, 'Expected salary is required']
  },
  noticePeriod: {
    type: String,
    required: [true, 'Notice period is required']
  },
  status: {
    type: String,
    enum: ['pending', 'reviewed', 'shortlisted', 'rejected'],
    default: 'pending'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Career', careerSchema); 