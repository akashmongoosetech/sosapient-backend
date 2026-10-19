const mongoose = require('mongoose');

// Per-recipient delivery outcome, persisted so a failed send is diagnosable
// from the admin dashboard instead of only existing in the logs.
//
// "sent" means Brevo ACCEPTED the message — it is not a guarantee of inbox
// placement. "failed" carries a short code (not-configured, invalid-recipient,
// timeout, network, http-429, ...) which is never surfaced to visitors.
const deliveryEntrySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['sent', 'failed', 'skipped'],
      default: 'skipped'
    },
    code: {
      type: String,
      default: ''
    },
    at: {
      type: Date,
      default: null
    }
  },
  { _id: false }
);

const emailDeliverySchema = new mongoose.Schema(
  {
    visitor: { type: deliveryEntrySchema, default: () => ({}) },
    admin: { type: deliveryEntrySchema, default: () => ({}) }
  },
  { _id: false }
);

module.exports = { emailDeliverySchema };
