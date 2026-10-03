const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    lowercase: true,
    match: [/^\S+@\S+$/, 'Please enter a valid email']
  },
  company: {
    type: String,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  subject: {
    type: String,
    required: [true, 'Subject is required'],
    trim: true
  },
  message: {
    type: String,
    required: [true, 'Message is required'],
    trim: true
  },
  budget: {
    type: String,
    enum: ['under-10k', '10k-25k', '25k-50k', '50k-100k', 'over-100k'],
    default: undefined
  },
  timeline: {
    type: String,
    enum: ['asap', '1-3-months', '3-6-months', '6-12-months', 'flexible'],
    default: undefined
  },
  status: {
    type: String,
    enum: ['new', 'read', 'replied', 'archived'],
    default: 'new'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Contact', contactSchema); 