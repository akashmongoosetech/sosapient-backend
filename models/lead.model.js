const mongoose = require('mongoose');

const LEAD_STATUSES = ['New', 'Message', 'WhatsApp', 'Call', 'Converted'];

const leadSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, maxlength: [200, 'Title must be at most 200 characters'], default: '' },
    categoryName: { type: String, trim: true, maxlength: [160, 'Category must be at most 160 characters'], default: '' },
    address: { type: String, trim: true, maxlength: [500, 'Address must be at most 500 characters'], default: '' },
    city: { type: String, trim: true, maxlength: [100, 'City must be at most 100 characters'], default: '' },
    website: { type: String, trim: true, maxlength: [500, 'Website must be at most 500 characters'], default: '' },
    phone: { type: String, trim: true, maxlength: [40, 'Phone must be at most 40 characters'], default: '' },
    phoneUnformatted: { type: String, trim: true, maxlength: [40, 'Phone must be at most 40 characters'], default: '' },
    status: { type: String, enum: LEAD_STATUSES, default: 'New', index: true },
    // Set when this lead was successfully moved to Deals. A Converted lead
    // WITHOUT a dealId failed conversion and must stay visible/retryable.
    dealId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Deal',
      default: null,
      index: true,
    },
    // Internal normalized keys for duplicate detection. Never exposed via API.
    phoneKey: { type: String, trim: true, default: '', select: false, index: true },
    websiteKey: { type: String, trim: true, default: '', select: false, index: true },
    titleCityKey: { type: String, trim: true, default: '', select: false, index: true },
  },
  { timestamps: true }
);

leadSchema.index({ status: 1 });
leadSchema.index({ city: 1 });
leadSchema.index({ categoryName: 1 });
leadSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Lead', leadSchema);
module.exports.LEAD_STATUSES = LEAD_STATUSES;
