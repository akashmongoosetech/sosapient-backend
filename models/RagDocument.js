const mongoose = require('mongoose');

const ragDocumentSchema = new mongoose.Schema({
  content: {
    type: String,
    required: [true, 'Content is required'],
    maxlength: [4000, 'Chunk content must be at most 4000 characters']
  },
  embedding: {
    type: [Number],
    default: [],
    select: false
  },
  source: {
    type: String,
    required: true,
    trim: true,
    maxlength: [40, 'Source must be at most 40 characters']
  },
  sourceId: {
    type: String,
    required: true,
    trim: true,
    maxlength: [120, 'Source ID must be at most 120 characters']
  },
  sourceType: {
    type: String,
    required: true,
    enum: ['blog', 'case-study', 'service', 'business-info']
  },
  metadata: {
    title: { type: String, trim: true, maxlength: [200], default: '' },
    slug: { type: String, trim: true, maxlength: [200], default: '' },
    url: { type: String, trim: true, maxlength: [500], default: '' },
    category: { type: String, trim: true, maxlength: [120], default: '' }
  },
  published: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true
});

ragDocumentSchema.index({ published: 1, sourceType: 1 });
ragDocumentSchema.index({ sourceType: 1, sourceId: 1 });

module.exports = mongoose.model('RagDocument', ragDocumentSchema);
