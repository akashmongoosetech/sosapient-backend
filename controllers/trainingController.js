const Training = require('../models/Training');
const Enrollment = require('../models/Enrollment');
const Payment = require('../models/Payment');
const { buildSlug, isValidSlug, ensureUniqueSlug } = require('../utils/slug');

function errDetail(error) {
  return process.env.NODE_ENV === 'production' ? undefined : (error ? error.message : undefined);
}

function clampInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function isValidUrl(value) {
  if (!value || typeof value !== 'string') return false;
  try {
    const u = new URL(value.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeStringArray(input) {
  if (!input) return [];
  const arr = Array.isArray(input) ? input : String(input).split(',');
  return [...new Set(
    arr.map((v) => (v == null ? '' : String(v).trim())).filter((v) => v.length > 0)
  )];
}

function pickTraining(body = {}) {
  const out = {};
  const strings = [
    'title', 'slug', 'shortDescription', 'description', 'featuredImage',
    'category', 'duration', 'trainingMode', 'level', 'price',
    'paymentType', 'amount', 'currency', 'startDate', 'endDate',
    'prerequisites', 'targetAudience', 'learningOutcomes', 'trainer', 'certification', 'curriculum', 'faqs'
  ];
  for (const k of strings) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  if (body.technologies !== undefined) out.technologies = body.technologies;
  if (body.status !== undefined) out.status = body.status;
  if (body.isFree !== undefined) out.isFree = body.isFree;
  if (body.isFeatured !== undefined) out.isFeatured = body.isFeatured;
  if (body.displayOrder !== undefined) out.displayOrder = body.displayOrder;
  if (body.seo !== undefined) out.seo = body.seo;
  return out;
}

function validateCommon(data, isUpdate) {
  const fail = (message) => ({ status: 400, message });
  const str = (v) => (typeof v === 'string' ? v : '');

  if (!isUpdate || data.title !== undefined) {
    if (!str(data.title).trim() || str(data.title).trim().length > 160) {
      return fail('Title is required (max 160 characters)');
    }
  }
  if (data.slug !== undefined && String(data.slug).trim() !== '' && !isValidSlug(String(data.slug).trim().toLowerCase())) {
    return fail('Slug may contain lowercase letters, numbers and single hyphens only (max 160 characters)');
  }
  if (!isUpdate || data.shortDescription !== undefined) {
    if (!str(data.shortDescription).trim() || str(data.shortDescription).trim().length > 500) {
      return fail('Short description is required (max 500 characters)');
    }
  }
  if (!isUpdate || data.description !== undefined) {
    if (!str(data.description).trim() || str(data.description).length > 10000) {
      return fail('Description is required (max 10000 characters)');
    }
  }
  if (!isUpdate || data.category !== undefined) {
    if (!str(data.category).trim() || str(data.category).trim().length > 80) {
      return fail('Category is required (max 80 characters)');
    }
  }
  if (!isUpdate || data.duration !== undefined) {
    if (!str(data.duration).trim() || str(data.duration).trim().length > 40) {
      return fail('Duration is required (max 40 characters)');
    }
  }
  if (data.trainingMode !== undefined && !['Online', 'Offline', 'Hybrid'].includes(data.trainingMode)) {
    return fail('Training mode must be Online, Offline or Hybrid');
  }
  if (data.level !== undefined && !['Beginner', 'Intermediate', 'Advanced'].includes(data.level)) {
    return fail('Level must be Beginner, Intermediate or Advanced');
  }
  if (data.featuredImage !== undefined && String(data.featuredImage).trim() !== '' && !isValidUrl(data.featuredImage)) {
    return fail('Featured image must be a valid http(s) URL');
  }
  if (data.technologies !== undefined && !Array.isArray(data.technologies) && typeof data.technologies !== 'string') {
    return fail('Technologies must be an array or comma-separated string');
  }
  if (data.price !== undefined && (typeof data.price !== 'number' || isNaN(data.price) || data.price < 0)) {
    return fail('Price must be a non-negative number');
  }
  if (data.paymentType !== undefined && !['Free', 'Paid'].includes(data.paymentType)) {
    return fail('Payment type must be Free or Paid');
  }
  if (data.amount !== undefined && (typeof data.amount !== 'number' || isNaN(data.amount) || data.amount < 0)) {
    return fail('Amount must be a non-negative number');
  }
  if (data.currency !== undefined && typeof data.currency !== 'string') {
    return fail('Currency must be a string');
  }
  if (data.startDate !== undefined && data.startDate !== null && !(data.startDate instanceof Date) && isNaN(Date.parse(data.startDate))) {
    return fail('Start date must be a valid date');
  }
  if (data.endDate !== undefined && data.endDate !== null && !(data.endDate instanceof Date) && isNaN(Date.parse(data.endDate))) {
    return fail('End date must be a valid date');
  }
  if (data.isFree !== undefined && typeof data.isFree !== 'boolean') {
    return fail('isFree must be a boolean');
  }
  if (data.prerequisites !== undefined && !Array.isArray(data.prerequisites) && typeof data.prerequisites !== 'string') {
    return fail('Prerequisites must be an array or comma-separated string');
  }
  if (data.targetAudience !== undefined && !Array.isArray(data.targetAudience) && typeof data.targetAudience !== 'string') {
    return fail('Target audience must be an array or comma-separated string');
  }
  if (data.learningOutcomes !== undefined && !Array.isArray(data.learningOutcomes) && typeof data.learningOutcomes !== 'string') {
    return fail('Learning outcomes must be an array or comma-separated string');
  }
  if (data.curriculum !== undefined && !Array.isArray(data.curriculum)) {
    return fail('Curriculum must be an array');
  }
  if (data.trainer !== undefined && (typeof data.trainer !== 'object' || data.trainer === null || Array.isArray(data.trainer))) {
    return fail('Trainer must be an object');
  }
  if (data.certification !== undefined && (typeof data.certification !== 'object' || data.certification === null || Array.isArray(data.certification))) {
    return fail('Certification must be an object');
  }
  if (data.faqs !== undefined && !Array.isArray(data.faqs)) {
    return fail('FAQs must be an array');
  }
  if (data.status !== undefined && !['draft', 'published', 'inactive'].includes(data.status)) {
    return fail('Status must be draft, published or inactive');
  }
  if (data.isFeatured !== undefined && typeof data.isFeatured !== 'boolean') {
    return fail('isFeatured must be a boolean');
  }
  if (data.displayOrder !== undefined && (typeof data.displayOrder !== 'number' || isNaN(data.displayOrder))) {
    return fail('displayOrder must be a number');
  }
  if (data.seo !== undefined && (typeof data.seo !== 'object' || data.seo === null || Array.isArray(data.seo))) {
    return fail('SEO settings must be an object');
  }
  return null;
}

function normalizeWrite(data, options = {}) {
  const isCreate = options.isCreate === true;
  const out = { ...data };
  for (const k of ['title', 'category', 'duration', 'trainingMode', 'level']) {
    if (typeof out[k] === 'string') out[k] = out[k].trim();
  }
  if (typeof out.shortDescription === 'string') out.shortDescription = out.shortDescription.trim();
  if (typeof out.description === 'string') out.description = out.description.trim();
  if (typeof out.slug === 'string') out.slug = out.slug.trim().toLowerCase();
  if (typeof out.featuredImage === 'string') out.featuredImage = out.featuredImage.trim();
  if (typeof out.currency === 'string') out.currency = out.currency.trim().toUpperCase();

  // ── Pricing: one source of truth ──────────────────────────────────────────
  // `amount` is what Razorpay charges, `price` is the display value, and
  // `isFree` mirrors `paymentType`. Keep all three in lockstep so the catalogue
  // can never advertise ₹5,000 while the enrollment is treated as free.
  if (out.amount === undefined && typeof out.price === 'number') out.amount = out.price;
  if (typeof out.price === 'number') out.price = Math.max(0, out.price);
  if (typeof out.amount === 'number') out.amount = Math.max(0, out.amount);

  if (out.paymentType !== undefined) {
    out.paymentType = out.paymentType === 'Paid' ? 'Paid' : 'Free';
  } else if (out.isFree !== undefined) {
    out.paymentType = out.isFree ? 'Free' : 'Paid';
  } else if (isCreate && typeof out.amount === 'number' && out.amount > 0) {
    out.paymentType = 'Paid';
  } else if (isCreate) {
    out.paymentType = 'Free';
  }

  if (out.paymentType === 'Paid') {
    out.isFree = false;
    if (typeof out.amount === 'number') out.price = out.amount;
  } else if (out.paymentType === 'Free') {
    out.isFree = true;
    out.amount = 0;
    out.price = 0;
  } else if (typeof out.amount === 'number') {
    // Update that only touched the amount: keep the displayed price aligned.
    out.price = out.amount;
  }

  if (out.startDate !== undefined && out.startDate !== null) {
    out.startDate = new Date(out.startDate);
    if (isNaN(out.startDate.getTime())) delete out.startDate;
  }
  if (out.endDate !== undefined && out.endDate !== null) {
    out.endDate = new Date(out.endDate);
    if (isNaN(out.endDate.getTime())) delete out.endDate;
  }
  if (typeof out.isFree === 'boolean') out.isFree = out.isFree;
  if (typeof out.isFeatured === 'boolean') out.isFeatured = out.isFeatured;
  if (typeof out.displayOrder === 'number') out.displayOrder = out.displayOrder;
  if (typeof out.status === 'string') out.status = out.status;
  if (out.technologies !== undefined) {
    out.technologies = normalizeStringArray(out.technologies).slice(0, 50);
  }
  if (out.prerequisites !== undefined) {
    out.prerequisites = normalizeStringArray(out.prerequisites).slice(0, 30);
  }
  if (out.targetAudience !== undefined) {
    out.targetAudience = normalizeStringArray(out.targetAudience).slice(0, 30);
  }
  if (out.learningOutcomes !== undefined) {
    out.learningOutcomes = normalizeStringArray(out.learningOutcomes).slice(0, 30);
  }
  if (out.curriculum !== undefined) {
    out.curriculum = out.curriculum.map((m) => ({
      title: String(m.title || '').trim(),
      description: String(m.description || '').trim(),
      hours: typeof m.hours === 'number' && !isNaN(m.hours) ? Math.max(0, m.hours) : 0
    })).filter((m) => m.title.length > 0);
  }
  if (out.trainer !== undefined) {
    const t = out.trainer;
    out.trainer = {
      name: typeof t.name === 'string' ? t.name.trim() : '',
      designation: typeof t.designation === 'string' ? t.designation.trim() : '',
      image: typeof t.image === 'string' ? t.image.trim() : '',
      bio: typeof t.bio === 'string' ? t.bio.trim() : ''
    };
  }
  if (out.certification !== undefined) {
    const c = out.certification;
    out.certification = {
      provided: typeof c.provided === 'boolean' ? c.provided : false,
      name: typeof c.name === 'string' ? c.name.trim() : '',
      description: typeof c.description === 'string' ? c.description.trim() : ''
    };
  }
  if (out.faqs !== undefined) {
    out.faqs = out.faqs
      .filter((f) => f && typeof f.question === 'string' && f.question.trim().length > 0 && typeof f.answer === 'string' && f.answer.trim().length > 0)
      .map((f) => ({
        question: f.question.trim(),
        answer: f.answer.trim()
      }));
  }
  if (out.seo !== undefined) {
    const seo = out.seo;
    out.seo = {
      metaTitle: typeof seo.metaTitle === 'string' ? seo.metaTitle.trim().slice(0, 60) : '',
      metaDescription: typeof seo.metaDescription === 'string' ? seo.metaDescription.trim().slice(0, 160) : '',
      metaKeywords: typeof seo.metaKeywords === 'string' ? seo.metaKeywords.trim().slice(0, 200) : ''
    };
  }
  return out;
}

function sendError(res, status, message, error) {
  return res.status(status).json({
    success: false,
    message,
    error: errDetail(error)
  });
}

// POST /api/trainings (admin) — create a training
async function createTraining(req, res) {
  try {
    const picked = pickTraining(req.body);
    const invalid = validateCommon(picked, false);
    if (invalid) return sendError(res, invalid.status, invalid.message);

    const data = normalizeWrite(picked, { isCreate: true });
    if (data.paymentType === 'Paid' && !(Number(data.amount) > 0)) {
      return res.status(400).json({ success: false, message: 'Paid trainings require an amount greater than 0' });
    }
    if (picked.slug !== undefined && String(picked.slug).trim() !== '') {
      const clean = buildSlug(picked.slug);
      const taken = await Training.findOne({ slug: clean }).select('_id');
      if (taken) {
        return res.status(409).json({ success: false, message: 'This slug is already in use. Please choose another slug.' });
      }
      data.slug = clean;
    } else {
      data.slug = await ensureUniqueSlug(Training, data.title);
    }

    const doc = new Training(data);
    try {
      await doc.save();
    } catch (saveError) {
      if (saveError && saveError.code === 11000) {
        data.slug = await ensureUniqueSlug(Training, `${data.slug}-${Date.now().toString(36)}`);
        doc.slug = data.slug;
        await doc.save();
      } else {
        throw saveError;
      }
    }
    return res.status(201).json({ success: true, message: 'Training created successfully', data: doc });
  } catch (error) {
    if (error && error.status) return sendError(res, error.status, error.message, error);
    if (error && error.code === 11000) {
      return res.status(409).json({ success: false, message: 'This slug is already in use. Please choose another slug.' });
    }
    if (error && error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: 'Validation failed', error: errDetail(error) });
    }
    return sendError(res, 400, 'Error creating training', error);
  }
}

// GET /api/trainings (admin) — list all trainings (any status)
async function getTrainings(req, res) {
  try {
    const page = clampInt(req.query.page, 1, 1, 1000);
    const limit = clampInt(req.query.limit, 20, 1, 50);
    const filter = {};

    if (req.query.status && ['draft', 'published', 'inactive'].includes(String(req.query.status))) {
      filter.status = String(req.query.status);
    }

    if (req.query.category && String(req.query.category).trim() !== '' && String(req.query.category) !== 'all') {
      filter.category = String(req.query.category).trim();
    }

    if (req.query.search && String(req.query.search).trim() !== '') {
      const q = escapeRegExp(String(req.query.search).trim().slice(0, 100));
      const rx = new RegExp(q, 'i');
      filter.$or = [{ title: rx }, { shortDescription: rx }, { category: rx }, { slug: rx }, { technologies: rx }];
    }

    const total = await Training.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const items = await Training.find(filter)
      .sort({ displayOrder: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return res.json({
      success: true,
      data: items,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: total,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    return sendError(res, 500, 'Error fetching trainings', error);
  }
}

// GET /api/trainings/public (public) — list published trainings
async function getPublishedTrainings(req, res) {
  try {
    const page = clampInt(req.query.page, 1, 1, 1000);
    const limit = clampInt(req.query.limit, 12, 1, 50);
    const filter = { status: 'published' };

    if (req.query.category && String(req.query.category).trim() !== '' && String(req.query.category) !== 'all') {
      filter.category = String(req.query.category).trim();
    }

    if (req.query.search && String(req.query.search).trim() !== '') {
      const q = escapeRegExp(String(req.query.search).trim().slice(0, 100));
      const rx = new RegExp(q, 'i');
      filter.$or = [{ title: rx }, { shortDescription: rx }, { category: rx }, { slug: rx }, { technologies: rx }];
    }

    const total = await Training.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const items = await Training.find(filter)
      .select('title slug shortDescription featuredImage category duration trainingMode level technologies price paymentType amount currency isFree trainer certification createdAt')
      .sort({ displayOrder: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return res.json({
      success: true,
      data: items,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: total,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    return sendError(res, 500, 'Error fetching trainings', error);
  }
}

// GET /api/trainings/public/categories (public) — distinct published categories
async function getPublishedCategories(req, res) {
  try {
    const categories = await Training.distinct('category', { status: 'published' });
    return res.json({ success: true, data: categories.filter(Boolean).sort() });
  } catch (error) {
    return sendError(res, 500, 'Error fetching categories', error);
  }
}

// GET /api/trainings/public/:slug (public) — single published training by slug
async function getPublishedTrainingBySlug(req, res) {
  try {
    const slug = String(req.params.slug || '').toLowerCase();
    const doc = await Training.findOne({ slug, status: 'published' });
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Training not found' });
    }
    return res.json({ success: true, data: doc });
  } catch (error) {
    return sendError(res, 500, 'Error fetching training', error);
  }
}

// GET /api/trainings/public/id/:id — get published training by ObjectId (public)
async function getPublishedTrainingById(req, res) {
  try {
    const { id } = req.params;
    if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json({ success: false, message: 'Invalid training ID format' });
    }
    const doc = await Training.findOne({ _id: id, status: 'published' });
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Training not found' });
    }
    return res.json({ success: true, data: doc });
  } catch (error) {
    return sendError(res, 500, 'Error fetching training', error);
  }
}

// GET /api/trainings/:id (admin) — training by id (any status)
async function getTrainingById(req, res) {
  try {
    const { id } = req.params;
    if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json({ success: false, message: 'Invalid training ID format' });
    }
    const doc = await Training.findById(id);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Training not found' });
    }
    return res.json({ success: true, data: doc });
  } catch (error) {
    return sendError(res, 500, 'Error fetching training', error);
  }
}

// PUT /api/trainings/:id (admin) — update a training
async function updateTraining(req, res) {
  try {
    const { id } = req.params;
    if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json({ success: false, message: 'Invalid training ID format' });
    }
    const existing = await Training.findById(id).select('_id slug paymentType amount price currency isFree').lean();
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Training not found' });
    }

    const picked = pickTraining(req.body);
    const invalid = validateCommon(picked, true);
    if (invalid) return sendError(res, invalid.status, invalid.message);

    // Merge pricing with the stored document first so a partial update (say,
    // only `paymentType: 'Paid'`) is validated against the effective result,
    // not against the handful of fields the admin happened to send.
    const pricingIn = {};
    if (picked.paymentType !== undefined) pricingIn.paymentType = picked.paymentType;
    if (picked.amount !== undefined) pricingIn.amount = picked.amount;
    if (picked.price !== undefined) pricingIn.price = picked.price;
    if (picked.currency !== undefined) pricingIn.currency = picked.currency;
    if (picked.isFree !== undefined) pricingIn.isFree = picked.isFree;

    const merged = normalizeWrite({
      paymentType: existing.paymentType || 'Free',
      amount: existing.amount ?? existing.price ?? 0,
      price: existing.price ?? existing.amount ?? 0,
      currency: existing.currency || 'INR',
      isFree: existing.isFree,
      ...pricingIn
    });
    if (merged.paymentType === 'Paid' && !(Number(merged.amount) > 0)) {
      return res.status(400).json({ success: false, message: 'Paid trainings require an amount greater than 0' });
    }

    const data = normalizeWrite(picked);
    // Only touch pricing fields when the request actually changed something,
    // so unrelated edits can never silently rewrite the amount.
    if (Object.keys(pricingIn).length > 0) {
      Object.assign(data, {
        paymentType: merged.paymentType,
        amount: merged.amount,
        price: merged.price,
        currency: merged.currency,
        isFree: merged.isFree
      });
    }
    if (data.slug !== undefined) {
      if (data.slug.trim() === '') {
        delete data.slug;
      } else {
        const clean = buildSlug(data.slug);
        if (clean !== existing.slug) {
          const taken = await Training.findOne({ slug: clean, _id: { $ne: id } }).select('_id');
          if (taken) {
            return res.status(409).json({ success: false, message: 'This slug is already in use. Please choose another slug.' });
          }
          data.slug = clean;
        } else {
          delete data.slug;
        }
      }
    }

    const doc = await Training.findByIdAndUpdate(id, data, { new: true, runValidators: true });
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Training not found' });
    }
    return res.json({ success: true, message: 'Training updated successfully', data: doc });
  } catch (error) {
    if (error && error.status) return sendError(res, error.status, error.message, error);
    if (error && error.code === 11000) {
      return res.status(409).json({ success: false, message: 'This slug is already in use. Please choose another slug.' });
    }
    if (error && error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: 'Validation failed', error: errDetail(error) });
    }
    if (error && error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid training ID', error: errDetail(error) });
    }
    return sendError(res, 400, 'Error updating training', error);
  }
}

// DELETE /api/trainings/:id (admin) — delete a training
async function deleteTraining(req, res) {
  try {
    const { id } = req.params;
    if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json({ success: false, message: 'Invalid training ID format' });
    }
    // Referential integrity: refuse deletion if enrollments or payment
    // records reference this course. Historical records must be preserved.
    const enrollmentCount = await Enrollment.countDocuments({ trainingId: id });
    if (enrollmentCount > 0) {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete this course: it has existing enrollments. Unpublish or archive it instead.'
      });
    }
    const paymentCount = await Payment.countDocuments({ trainingId: id });
    if (paymentCount > 0) {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete this course: it has existing payment records. Unpublish or archive it instead.'
      });
    }
    const doc = await Training.findByIdAndDelete(id);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Training not found' });
    }
    return res.json({ success: true, message: 'Training deleted successfully' });
  } catch (error) {
    return sendError(res, 500, 'Error deleting training', error);
  }
}

// PATCH /api/trainings/:id/status (admin) — update training status
async function updateTrainingStatus(req, res) {
  try {
    const { id } = req.params;
    if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json({ success: false, message: 'Invalid training ID format' });
    }
    const { status } = req.body;
    if (!status || !['draft', 'published', 'inactive'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be draft, published or inactive' });
    }
    const doc = await Training.findByIdAndUpdate(id, { status }, { new: true });
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Training not found' });
    }
    return res.json({ success: true, message: `Training status updated to ${status}`, data: doc });
  } catch (error) {
    return sendError(res, 500, 'Error updating training status', error);
  }
}

module.exports = {
  createTraining,
  getTrainings,
  getPublishedTrainings,
  getPublishedCategories,
  getPublishedTrainingBySlug,
  getPublishedTrainingById,
  getTrainingById,
  updateTraining,
  deleteTraining,
  updateTrainingStatus
};
