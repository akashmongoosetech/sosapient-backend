const CaseStudy = require('../models/caseStudy.model');
const { buildSlug, isValidSlug, ensureUniqueSlug, escapeRegExp } = require('../utils/slug');

function errDetail(error) {
  return process.env.NODE_ENV === 'production' ? undefined : error.message;
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

function normalizeStringArray(input) {
  if (!input) return [];
  const arr = Array.isArray(input) ? input : String(input).split(',');
  return [...new Set(
    arr.map((v) => (v == null ? '' : String(v).trim())).filter((v) => v.length > 0)
  )];
}

function sanitizeResults(input) {
  if (input === undefined || input === null) return undefined;
  if (!Array.isArray(input)) {
    throw { status: 400, message: 'Results must be an array' };
  }
  if (input.length > 4) {
    throw { status: 400, message: 'Results must contain at most 4 items' };
  }
  return input.map((r, i) => {
    if (!r || typeof r !== 'object') {
      throw { status: 400, message: `Result ${i + 1} must be an object` };
    }
    const icon = String(r.icon || '').trim();
    const label = String(r.label || '').trim();
    const value = String(r.value || '').trim();
    if (!icon || !label || !value) {
      throw { status: 400, message: `Result ${i + 1} requires icon, label and value` };
    }
    if (label.length > 60 || value.length > 40 || icon.length > 40) {
      throw { status: 400, message: `Result ${i + 1} exceeds field limits (label 60, value 40, icon 40)` };
    }
    return { icon, label, value };
  });
}

function pickCaseStudy(body = {}) {
  const out = {};
  const strings = ['title', 'slug', 'client', 'category', 'duration', 'icon', 'color', 'thumbnailImageUrl', 'overview', 'challenge', 'solution'];
  for (const k of strings) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  if (body.published !== undefined) out.published = body.published;
  if (body.technologies !== undefined) out.technologies = body.technologies;
  if (body.results !== undefined) out.results = body.results;
  if (body.seo !== undefined) out.seo = body.seo;
  return out;
}

function validateCommon(data, isUpdate) {
  const fail = (message) => ({ status: 400, message });
  const str = (v) => (typeof v === 'string' ? v : '');

  if (!isUpdate || data.title !== undefined) {
    if (!str(data.title).trim() || str(data.title).trim().length > 100) {
      return fail('Title is required (max 100 characters)');
    }
  }
  if (data.slug !== undefined && String(data.slug).trim() !== '' && !isValidSlug(String(data.slug).trim().toLowerCase())) {
    return fail('Slug may contain lowercase letters, numbers and single hyphens only (max 160 characters)');
  }
  if (!isUpdate || data.client !== undefined) {
    if (!str(data.client).trim() || str(data.client).trim().length > 100) {
      return fail('Client is required (max 100 characters)');
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
  if (!isUpdate || data.icon !== undefined) {
    if (!str(data.icon).trim() || str(data.icon).trim().length > 40) {
      return fail('Icon is required (max 40 characters)');
    }
  }
  if (!isUpdate || data.color !== undefined) {
    if (!str(data.color).trim() || str(data.color).trim().length > 120) {
      return fail('Color is required');
    }
  }
  if (!isUpdate || data.thumbnailImageUrl !== undefined) {
    if (!isValidUrl(data.thumbnailImageUrl)) {
      return fail('Thumbnail image URL must be a valid http(s) URL');
    }
  }
  if (!isUpdate || data.overview !== undefined) {
    if (!str(data.overview).trim() || str(data.overview).length > 3000) {
      return fail('Overview is required (max 3000 characters)');
    }
  }
  if (data.challenge !== undefined && str(data.challenge).length > 5000) {
    return fail('Challenge must be at most 5000 characters');
  }
  if (data.solution !== undefined && str(data.solution).length > 5000) {
    return fail('Solution must be at most 5000 characters');
  }
  if (data.technologies !== undefined && !Array.isArray(data.technologies) && typeof data.technologies !== 'string') {
    return fail('Technologies must be an array or comma-separated string');
  }
  if (data.seo !== undefined && (typeof data.seo !== 'object' || data.seo === null || Array.isArray(data.seo))) {
    return fail('SEO settings must be an object');
  }
  if (data.seo && typeof data.seo === 'object') {
    if (typeof data.seo.metaTitle === 'string' && data.seo.metaTitle.trim().length > 60) {
      return fail('Meta title must be at most 60 characters');
    }
    if (typeof data.seo.metaDescription === 'string' && data.seo.metaDescription.trim().length > 160) {
      return fail('Meta description must be at most 160 characters');
    }
    const kw = Array.isArray(data.seo.keywords) ? data.seo.keywords : String(data.seo.keywords || '').split(',');
    if (kw.map((k) => String(k).trim()).filter(Boolean).join(', ').length > 200) {
      return fail('SEO keywords must fit within 200 characters');
    }
  }
  return null;
}

function normalizeWrite(data) {
  const out = { ...data };
  for (const k of ['title', 'client', 'category', 'duration', 'icon', 'color']) {
    if (typeof out[k] === 'string') out[k] = out[k].trim();
  }
  if (typeof out.slug === 'string') out.slug = out.slug.trim().toLowerCase();
  if (typeof out.thumbnailImageUrl === 'string') out.thumbnailImageUrl = out.thumbnailImageUrl.trim();
  if (out.published !== undefined) out.published = out.published === true || out.published === 'true';
  if (out.technologies !== undefined) {
    out.technologies = normalizeStringArray(out.technologies).slice(0, 30);
  }
  if (out.seo !== undefined) {
    const seo = out.seo;
    const metaTitle = typeof seo.metaTitle === 'string' ? seo.metaTitle.trim().slice(0, 60) : '';
    const metaDescription = typeof seo.metaDescription === 'string' ? seo.metaDescription.trim().slice(0, 160) : '';
    let keywords = Array.isArray(seo.keywords) ? seo.keywords : normalizeStringArray(seo.keywords);
    keywords = [...new Set(keywords.map((k) => String(k).trim()).filter(Boolean))];
    if (keywords.join(', ').length > 200) {
      throw { status: 400, message: 'SEO keywords must fit within 200 characters' };
    }
    out.seo = { metaTitle, metaDescription, keywords };
  }
  if (out.results !== undefined) {
    out.results = sanitizeResults(out.results);
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

// POST /api/case-studies (admin)
async function createCaseStudy(req, res) {
  try {
    const picked = pickCaseStudy(req.body);
    const invalid = validateCommon(picked, false);
    if (invalid) return sendError(res, invalid.status, invalid.message);

    const data = normalizeWrite(picked);
    if (picked.slug !== undefined && String(picked.slug).trim() !== '') {
      // Explicit slug: reject duplicates with a clear error instead of silent rename
      const clean = buildSlug(picked.slug);
      const taken = await CaseStudy.findOne({ slug: clean }).select('_id');
      if (taken) {
        return res.status(409).json({ success: false, message: 'This slug is already in use. Please choose another slug.' });
      }
      data.slug = clean;
    } else {
      data.slug = await ensureUniqueSlug(CaseStudy, data.title);
    }
    if (data.results === undefined) data.results = [];

    const doc = new CaseStudy(data);
    try {
      await doc.save();
    } catch (saveError) {
      if (saveError && saveError.code === 11000) {
        data.slug = await ensureUniqueSlug(CaseStudy, `${data.slug}-${Date.now().toString(36)}`);
        doc.slug = data.slug;
        await doc.save();
      } else {
        throw saveError;
      }
    }
    return res.status(201).json({ success: true, message: 'Case study created successfully', data: doc });
  } catch (error) {
    if (error && error.status) return sendError(res, error.status, error.message, error);
    if (error && error.code === 11000) {
      return res.status(409).json({ success: false, message: 'This slug is already in use. Please choose another slug.' });
    }
    if (error && error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: 'Validation failed', error: errDetail(error) });
    }
    return sendError(res, 400, 'Error creating case study', error);
  }
}

// GET /api/case-studies?search=&category=&published=&page=&limit= (admin)
async function getCaseStudies(req, res) {
  try {
    const page = clampInt(req.query.page, 1, 1, 1000);
    const limit = clampInt(req.query.limit, 20, 1, 50);
    const filter = {};

    if (req.query.published === 'true') filter.published = true;
    else if (req.query.published === 'false') filter.published = false;

    if (req.query.category && String(req.query.category).trim() !== '' && String(req.query.category) !== 'all') {
      filter.category = String(req.query.category).trim();
    }

    if (req.query.search && String(req.query.search).trim() !== '') {
      const q = escapeRegExp(String(req.query.search).trim().slice(0, 100));
      const rx = new RegExp(q, 'i');
      filter.$or = [{ title: rx }, { client: rx }, { category: rx }, { slug: rx }, { technologies: rx }];
    }

    const total = await CaseStudy.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const items = await CaseStudy.find(filter)
      .sort({ createdAt: -1 })
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
    return sendError(res, 500, 'Error fetching case studies', error);
  }
}

// GET /api/case-studies/public?search=&category=&page=&limit= (public, published only)
async function getPublishedCaseStudies(req, res) {
  try {
    const page = clampInt(req.query.page, 1, 1, 1000);
    const limit = clampInt(req.query.limit, 12, 1, 50);
    const filter = { published: true };

    if (req.query.category && String(req.query.category).trim() !== '' && String(req.query.category) !== 'all') {
      filter.category = String(req.query.category).trim();
    }

    if (req.query.search && String(req.query.search).trim() !== '') {
      const q = escapeRegExp(String(req.query.search).trim().slice(0, 100));
      const rx = new RegExp(q, 'i');
      filter.$or = [{ title: rx }, { client: rx }, { category: rx }, { slug: rx }, { technologies: rx }];
    }

    const total = await CaseStudy.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const items = await CaseStudy.find(filter)
      .select('title slug client category duration icon color thumbnailImageUrl overview results technologies published createdAt')
      .sort({ createdAt: -1 })
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
    return sendError(res, 500, 'Error fetching case studies', error);
  }
}

// GET /api/case-studies/public/categories (public, published only)
async function getPublishedCategories(req, res) {
  try {
    const categories = await CaseStudy.distinct('category', { published: true });
    return res.json({ success: true, data: categories.filter(Boolean).sort() });
  } catch (error) {
    return sendError(res, 500, 'Error fetching categories', error);
  }
}

// GET /api/case-studies/public/:slug (public, published only — drafts 404)
async function getPublishedCaseStudyBySlug(req, res) {
  try {
    const slug = String(req.params.slug || '').toLowerCase();
    const doc = await CaseStudy.findOne({ slug, published: true });
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Case study not found' });
    }
    return res.json({ success: true, data: doc });
  } catch (error) {
    return sendError(res, 500, 'Error fetching case study', error);
  }
}

// GET /api/case-studies/categories (admin)
async function getCaseStudyCategories(req, res) {
  try {
    const categories = await CaseStudy.distinct('category');
    return res.json({ success: true, data: categories.filter(Boolean).sort() });
  } catch (error) {
    return sendError(res, 500, 'Error fetching categories', error);
  }
}

// GET /api/case-studies/:id (admin)
async function getCaseStudyById(req, res) {
  try {
    const { id } = req.params;
    if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json({ success: false, message: 'Invalid case study ID format' });
    }
    const doc = await CaseStudy.findById(id);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Case study not found' });
    }
    return res.json({ success: true, data: doc });
  } catch (error) {
    return sendError(res, 500, 'Error fetching case study', error);
  }
}

// PUT /api/case-studies/:id (admin)
async function updateCaseStudy(req, res) {
  try {
    const { id } = req.params;
    if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json({ success: false, message: 'Invalid case study ID format' });
    }
    const existing = await CaseStudy.findById(id).select('_id slug');
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Case study not found' });
    }

    const picked = pickCaseStudy(req.body);
    const invalid = validateCommon(picked, true);
    if (invalid) return sendError(res, invalid.status, invalid.message);

    const data = normalizeWrite(picked);
    if (data.slug !== undefined) {
      if (data.slug.trim() === '') {
        delete data.slug;
      } else {
        const clean = buildSlug(data.slug);
        if (clean !== existing.slug) {
          const taken = await CaseStudy.findOne({ slug: clean, _id: { $ne: id } }).select('_id');
          if (taken) {
            return res.status(409).json({ success: false, message: 'This slug is already in use. Please choose another slug.' });
          }
          data.slug = clean;
        } else {
          delete data.slug;
        }
      }
    }

    const doc = await CaseStudy.findByIdAndUpdate(id, data, { new: true, runValidators: true });
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Case study not found' });
    }
    return res.json({ success: true, message: 'Case study updated successfully', data: doc });
  } catch (error) {
    if (error && error.status) return sendError(res, error.status, error.message, error);
    if (error && error.code === 11000) {
      return res.status(409).json({ success: false, message: 'This slug is already in use. Please choose another slug.' });
    }
    if (error && error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: 'Validation failed', error: errDetail(error) });
    }
    if (error && error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid case study ID', error: errDetail(error) });
    }
    return sendError(res, 400, 'Error updating case study', error);
  }
}

// DELETE /api/case-studies/:id (admin)
async function deleteCaseStudy(req, res) {
  try {
    const { id } = req.params;
    if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json({ success: false, message: 'Invalid case study ID format' });
    }
    const doc = await CaseStudy.findByIdAndDelete(id);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Case study not found' });
    }
    return res.json({ success: true, message: 'Case study deleted successfully' });
  } catch (error) {
    return sendError(res, 500, 'Error deleting case study', error);
  }
}

module.exports = {
  createCaseStudy,
  getCaseStudies,
  getCaseStudyCategories,
  getPublishedCaseStudies,
  getPublishedCategories,
  getPublishedCaseStudyBySlug,
  getCaseStudyById,
  updateCaseStudy,
  deleteCaseStudy
};
