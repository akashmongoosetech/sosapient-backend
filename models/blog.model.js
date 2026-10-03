const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500 // Increased from 200 to 500 characters
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: 160
  },
  previousSlugs: [{
    type: String,
    lowercase: true,
    trim: true
  }],
  excerpt: {
    type: String,
    required: true,
    maxlength: 1000 // Increased from 300 to 1000 characters
  },
  content: {
    type: String,
    required: false
  },
  sections: [{
    heading: { type: String },
    content: { type: String },
    image: { type: String },
    imageAlt: { type: String, trim: true, maxlength: 200 }
  }],
  image: {
    type: String,
    required: true
  },
  imageAlt: {
    type: String,
    trim: true,
    maxlength: 200,
    default: ''
  },
  author: {
    name: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true
    },
    image: {
      type: String,
      default: 'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&dpr=1'
    }
  },
  category: {
    type: String,
    required: true,
    enum: ['Technology', 'Design', 'Mobile Development', 'Web Development', 'AI/ML', 'Cybersecurity', 'Business', 'Tutorial']
  },
  tags: [{
    type: String,
    trim: true
  }],
  readTime: {
    type: String,
    default: function() {
      // Calculate read time based on content length (average 200 words per minute)
      const contentText = typeof this.content === 'string' ? this.content : '';
      const wordCount = contentText.trim().length > 0 ? contentText.split(/\s+/).length : 0;
      const minutes = Math.max(1, Math.ceil(wordCount / 200));
      return `${minutes} min read`;
    }
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft'
  },
  views: {
    type: Number,
    default: 0
  },
  likes: {
    type: Number,
    default: 0
  },
  featured: {
    type: Boolean,
    default: false
  },
  publishedAt: {
    type: Date
  },
  seo: {
    metaTitle: { type: String, trim: true, maxlength: 120 },
    metaDescription: { type: String, trim: true, maxlength: 400 },
    keywords: [String],
    canonicalUrl: { type: String, trim: true, maxlength: 500 },
    ogTitle: { type: String, trim: true, maxlength: 120 },
    ogDescription: { type: String, trim: true, maxlength: 400 },
    ogImage: { type: String, trim: true, maxlength: 2000 },
    twitterTitle: { type: String, trim: true, maxlength: 120 },
    twitterDescription: { type: String, trim: true, maxlength: 400 },
    twitterImage: { type: String, trim: true, maxlength: 2000 }
  },
  comments: [
    {
      name: { type: String, required: true, trim: true, maxlength: 100 },
      email: { type: String, required: true, trim: true, lowercase: true },
      comment: { type: String, required: true, maxlength: 5000 }, // Increased from 2000 to 5000 characters
      avatar: { type: String },
      userId: { type: String }, // Add userId to track comment ownership
      likeCount: { type: Number, default: 0 },
      dislikeCount: { type: Number, default: 0 },
      likedBy: [{ type: String }],
      dislikedBy: [{ type: String }],
      approved: { type: Boolean, default: true },
      createdAt: { type: Date, default: Date.now, immutable: true },
      updatedAt: { type: Date } // Add updatedAt for tracking edits
    }
  ]
}, {
  timestamps: true
});

// Set publishedAt when status changes to published
blogSchema.pre('save', function(next) {
  // Set publishedAt when status changes to published
  if (this.isModified('status') && this.status === 'published' && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  
  next();
});

// Index for better search performance
blogSchema.index({ title: 'text', excerpt: 'text', content: 'text' });
blogSchema.index({ category: 1, status: 1 });
blogSchema.index({ publishedAt: -1 });
blogSchema.index({ slug: 1 });
blogSchema.index({ previousSlugs: 1 });
blogSchema.index({ status: 1, featured: 1, publishedAt: -1 });

module.exports = mongoose.model('Blog', blogSchema);
