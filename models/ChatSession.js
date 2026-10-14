const mongoose = require('mongoose');

// Short-term conversation memory for the website assistant.
// Keyed by server-accepted session id; auto-expires after inactivity.
const turnSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    text: { type: String, required: true, maxlength: 2000 },
    at: { type: Date, default: Date.now }
  },
  { _id: false }
);

const chatSessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: [64, 'Session id is too long']
    },
    turns: { type: [turnSchema], default: [] },
    slots: {
      project: { type: String, default: '', maxlength: 120 },
      industry: { type: String, default: '', maxlength: 120 },
      budget: { type: String, default: '', maxlength: 40 },
      timeline: { type: String, default: '', maxlength: 40 },
      service: { type: String, default: '', maxlength: 120 }
    },
    leadOffered: { type: Boolean, default: false },
    messageCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

// Auto-expire idle sessions 24h after last update.
chatSessionSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

module.exports = mongoose.models.ChatSession || mongoose.model('ChatSession', chatSessionSchema);
