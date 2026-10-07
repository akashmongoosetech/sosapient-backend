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
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
  slug: { type: String, trim: true, lowercase: true, maxlength: [160, 'Slug is too long'] }
}, { timestamps: true });

jobSchema.index({ status: 1, createdAt: -1 });
jobSchema.index({ slug: 1 }, { unique: true, sparse: true });

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'role';
}

jobSchema.pre('validate', function (next) {
  if (!this.slug && this.title) this.slug = slugify(this.title);
  else if (this.slug) this.slug = slugify(this.slug);
  next();
});

module.exports = mongoose.model('Job', jobSchema);


