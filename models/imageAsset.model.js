const mongoose = require('mongoose');

// Uploaded image bytes, kept in MongoDB so they survive redeploys.
//
// The app server's local disk is ephemeral on most hosts (Render wipes it on
// every deploy), which is why uploaded images used to vanish while the database
// kept pointing at them. Storing the bytes alongside the data that references
// them removes that failure mode with no external service.
//
// Bytes live in their own collection — never embedded in the blog document — so
// list/detail API responses stay small.
const imageAssetSchema = new mongoose.Schema({
  data: {
    type: Buffer,
    required: true
  },
  contentType: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  folder: {
    type: String,
    default: 'misc'
  },
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true
  }
}, { versionKey: false });

imageAssetSchema.index({ createdAt: -1 });

module.exports = mongoose.model('ImageAsset', imageAssetSchema);
