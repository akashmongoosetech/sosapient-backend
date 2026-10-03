const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  department: { type: String, required: true, trim: true },
  location: { type: String, required: true, trim: true },
  type: { type: String, required: true, trim: true },
  salary: { type: String, required: false, trim: true },
  experience: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  requirements: [{ type: String, trim: true }],
  responsibilities: [{ type: String, trim: true }],
  benefits: [{ type: String, trim: true }],
  status: { type: String, enum: ['open', 'closed'], default: 'open' }
}, { timestamps: true });

module.exports = mongoose.model('Job', jobSchema);


