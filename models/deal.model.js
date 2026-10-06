const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true, trim: true, maxlength: [255, 'Filename is too long'] },
    contentType: { type: String, required: true, trim: true, maxlength: [100, 'Content type is too long'] },
    size: { type: Number, required: true, min: [0, 'Invalid file size'] },
    data: { type: Buffer, required: true },
    uploadedBy: { type: String, trim: true, default: '' },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const requirementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: [200, 'Requirement title is too long'] },
    description: { type: String, trim: true, default: '', maxlength: [50000, 'Requirement description is too long'] },
    attachments: { type: [attachmentSchema], default: [] },
  },
  { timestamps: true }
);

const reportSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    workCompleted: { type: String, required: true, trim: true, maxlength: [10000, 'Work report is too long'] },
    comment: { type: String, trim: true, default: '', maxlength: [10000, 'Comment is too long'] },
    nextPlan: { type: String, trim: true, default: '', maxlength: [10000, 'Next plan is too long'] },
    attachments: { type: [attachmentSchema], default: [] },
    createdBy: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

const clientSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '', maxlength: [200, 'Client name is too long'] },
    mobileNumber1: { type: String, trim: true, default: '', maxlength: [40, 'Mobile number is too long'] },
    mobileNumber2: { type: String, trim: true, default: '', maxlength: [40, 'Mobile number is too long'] },
    email1: {
      type: String, trim: true, lowercase: true, default: '', maxlength: [160, 'Email is too long'],
      validate: {
        validator: (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        message: 'Email 1 must be a valid email address',
      },
    },
    email2: {
      type: String, trim: true, lowercase: true, default: '', maxlength: [160, 'Email is too long'],
      validate: {
        validator: (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        message: 'Email 2 must be a valid email address',
      },
    },
    address: { type: String, trim: true, default: '', maxlength: [500, 'Address is too long'] },
    city: { type: String, trim: true, default: '', maxlength: [100, 'City is too long'] },
    state: { type: String, trim: true, default: '', maxlength: [100, 'State is too long'] },
    pincode: { type: String, trim: true, default: '', maxlength: [20, 'Pincode is too long'] },
  },
  { _id: false }
);

const dealSchema = new mongoose.Schema(
  {
    // Permanent relationship to the converted lead. Unique: one deal per lead.
    sourceLeadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      required: true,
      unique: true,
      index: true,
    },
    // Snapshot of lead fields at conversion time (source of display truth
    // even if the lead is later edited or removed).
    leadSnapshot: {
      title: { type: String, trim: true, default: '' },
      categoryName: { type: String, trim: true, default: '' },
      address: { type: String, trim: true, default: '' },
      city: { type: String, trim: true, default: '' },
      website: { type: String, trim: true, default: '' },
      phone: { type: String, trim: true, default: '' },
      phoneUnformatted: { type: String, trim: true, default: '' },
      leadCreatedAt: { type: Date },
      leadUpdatedAt: { type: Date },
    },
    // Immutable: deals are always Converted. Controller strips/blocks changes.
    status: { type: String, enum: ['Converted'], default: 'Converted', index: true },
    projectReceivedDate: { type: Date, index: true },
    client: { type: clientSchema, default: () => ({}) },
    requirements: { type: [requirementSchema], default: [] },
    reports: { type: [reportSchema], default: [] },
  },
  { timestamps: true }
);

dealSchema.index({ createdAt: -1 });
dealSchema.index({ 'client.email1': 1 });
dealSchema.index({ 'client.mobileNumber1': 1 });
dealSchema.index({ 'leadSnapshot.city': 1 });

module.exports = mongoose.model('Deal', dealSchema);
