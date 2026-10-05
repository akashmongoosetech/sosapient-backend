const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  department: { type: String, required: true, trim: true },
  location: { type: String, required: true, trim: true },
  type: { type: String, required: true, trim: true },
  salary: { type: String, required: false, trim: true },
  experience: { type: String, required: true, trim: true },
  description: { type: String, required: true, maxlength: [50000, 'Description is too long'] },
  requirements: [{ type: String, trim: true, maxlength: [10000, 'Requirement item is too long'] }],
  responsibilities: [{ type: String, trim: true, maxlength: [10000, 'Responsibility item is too long'] }],
  benefits: [{ type: String, trim: true, maxlength: [10000, 'Benefit item is too long'] }],
  status: { type: String, enum: ['open', 'closed'], default: 'open' }
}, { timestamps: true });

module.exports = mongoose.model('Job', jobSchema);


