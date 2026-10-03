const mongoose = require('mongoose');

const resultSchema = new mongoose.Schema({
  icon: {
    type: String,
    required: [true, 'Result icon is required'],
    trim: true,
    maxlength: [40, 'Result icon must be at most 40 characters']
  },
  label: {
    type: String,
    required: [true, 'Result label is required'],
    trim: true,
    maxlength: [60, 'Result label must be at most 60 characters']
  },
  value: {
    type: String,
    required: [true, 'Result value is required'],
    trim: true,
    maxlength: [40, 'Result value must be at most 40 characters']
  }
}, { _id: false });

const caseStudySchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [100, 'Title must be at most 100 characters']
  },
  slug: {
    type: String,
    required: [true, 'Slug is required'],
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: [160, 'Slug must be at most 160 characters']
  },
  client: {
    type: String,
    required: [true, 'Client is required'],
    trim: true,
    maxlength: [100, 'Client must be at most 100 characters']
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
  icon: {
    type: String,
    required: [true, 'Icon is required'],
    trim: true,
    maxlength: [40, 'Icon must be at most 40 characters']
  },
  color: {
    type: String,
    required: [true, 'Color is required'],
    trim: true,
    maxlength: [120, 'Color must be at most 120 characters']
  },
  thumbnailImageUrl: {
    type: String,
    required: [true, 'Thumbnail image URL is required'],
    trim: true,
    maxlength: [2000, 'Thumbnail image URL is too long']
  },
  overview: {
    type: String,
    required: [true, 'Overview is required'],
    maxlength: [3000, 'Overview must be at most 3000 characters']
  },
  challenge: {
    type: String,
    default: '',
    maxlength: [5000, 'Challenge must be at most 5000 characters']
  },
  solution: {
    type: String,
    default: '',
    maxlength: [5000, 'Solution must be at most 5000 characters']
  },
  results: {
    type: [resultSchema],
    default: [],
    validate: {
      validator: (v) => Array.isArray(v) && v.length <= 4,
      message: 'Results must contain at most 4 items'
    }
  },
  technologies: [{
    type: String,
    trim: true
  }],
  seo: {
    metaTitle: { type: String, trim: true, maxlength: [60, 'Meta title must be at most 60 characters'], default: '' },
    metaDescription: { type: String, trim: true, maxlength: [160, 'Meta description must be at most 160 characters'], default: '' },
    keywords: [{ type: String, trim: true }]
  },
  published: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

caseStudySchema.index({ slug: 1 }, { unique: true });
caseStudySchema.index({ title: 'text', client: 'text', category: 'text' });
caseStudySchema.index({ category: 1, published: 1 });
caseStudySchema.index({ published: -1, createdAt: -1 });

module.exports = mongoose.model('CaseStudy', caseStudySchema);
