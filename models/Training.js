const mongoose = require('mongoose');

const curriculumModuleSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Module title is required'],
    trim: true,
    maxlength: [120, 'Module title must be at most 120 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Module description must be at most 1000 characters'],
    default: ''
  },
  hours: {
    type: Number,
    min: [0, 'Hours must be non-negative'],
    default: 0
  }
}, { _id: false });

const faqSchema = new mongoose.Schema({
  question: {
    type: String,
    required: [true, 'FAQ question is required'],
    trim: true,
    maxlength: [300, 'FAQ question must be at most 300 characters']
  },
  answer: {
    type: String,
    required: [true, 'FAQ answer is required'],
    trim: true,
    maxlength: [2000, 'FAQ answer must be at most 2000 characters']
  }
}, { _id: false });

const trainerSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
    maxlength: [120, 'Trainer name must be at most 120 characters'],
    default: ''
  },
  designation: {
    type: String,
    trim: true,
    maxlength: [120, 'Trainer designation must be at most 120 characters'],
    default: ''
  },
  image: {
    type: String,
    trim: true,
    maxlength: [2000, 'Trainer image URL is too long'],
    default: ''
  },
  bio: {
    type: String,
    trim: true,
    maxlength: [2000, 'Trainer bio must be at most 2000 characters'],
    default: ''
  }
}, { _id: false });

const certificationSchema = new mongoose.Schema({
  provided: {
    type: Boolean,
    default: false
  },
  name: {
    type: String,
    trim: true,
    maxlength: [160, 'Certification name must be at most 160 characters'],
    default: ''
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Certification description must be at most 1000 characters'],
    default: ''
  }
}, { _id: false });

const seoSchema = new mongoose.Schema({
  metaTitle: { type: String, trim: true, maxlength: [60, 'Meta title must be at most 60 characters'], default: '' },
  metaDescription: { type: String, trim: true, maxlength: [160, 'Meta description must be at most 160 characters'], default: '' },
  metaKeywords: { type: String, trim: true, maxlength: [200, 'Meta keywords must be at most 200 characters'], default: '' }
}, { _id: false });

const trainingSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [160, 'Title must be at most 160 characters']
  },
  slug: {
    type: String,
    required: [true, 'Slug is required'],
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: [160, 'Slug must be at most 160 characters']
  },
  shortDescription: {
    type: String,
    required: [true, 'Short description is required'],
    trim: true,
    maxlength: [500, 'Short description must be at most 500 characters']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    maxlength: [10000, 'Description must be at most 10000 characters']
  },
  featuredImage: {
    type: String,
    trim: true,
    maxlength: [2000, 'Featured image URL is too long'],
    default: ''
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    trim: true,
    maxlength: [80, 'Category must be at most 80 characters']
  },
  duration: {
    type: String,
    required: [true, 'Duration is required'],
    trim: true,
    maxlength: [40, 'Duration must be at most 40 characters']
  },
  trainingMode: {
    type: String,
    enum: ['Online', 'Offline', 'Hybrid'],
    required: [true, 'Training mode is required'],
    default: 'Online'
  },
  level: {
    type: String,
    enum: ['Beginner', 'Intermediate', 'Advanced'],
    required: [true, 'Level is required'],
    default: 'Beginner'
  },
  technologies: [{
    type: String,
    trim: true,
    maxlength: [60, 'Technology must be at most 60 characters']
  }],
  price: {
    type: Number,
    min: [0, 'Price must be non-negative'],
    default: 0
  },
  paymentType: {
    type: String,
    enum: ['Free', 'Paid'],
    default: 'Free'
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
  startDate: {
    type: Date
  },
  endDate: {
    type: Date
  },
  isFree: {
    type: Boolean,
    default: false
  },
  prerequisites: [{
    type: String,
    trim: true,
    maxlength: [200, 'Prerequisite must be at most 200 characters']
  }],
  targetAudience: [{
    type: String,
    trim: true,
    maxlength: [200, 'Target audience item must be at most 200 characters']
  }],
  learningOutcomes: [{
    type: String,
    trim: true,
    maxlength: [200, 'Learning outcome must be at most 200 characters']
  }],
  curriculum: [curriculumModuleSchema],
  trainer: trainerSchema,
  certification: certificationSchema,
  faqs: [faqSchema],
  status: {
    type: String,
    enum: ['draft', 'published', 'inactive'],
    default: 'draft',
    index: true
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  displayOrder: {
    type: Number,
    default: 0
  },
  seo: seoSchema
}, { timestamps: true });

trainingSchema.index({ slug: 1 }, { unique: true });
trainingSchema.index({ status: 1, createdAt: -1 });
trainingSchema.index({ category: 1, status: 1 });
trainingSchema.index({ title: 'text', shortDescription: 'text', description: 'text', category: 'text', technologies: 'text' });

module.exports = mongoose.model('Training', trainingSchema);
