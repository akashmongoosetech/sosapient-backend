const mongoose = require('mongoose');
const Lead = require('../models/lead.model');
const { convertLeadToDeal } = require('../utils/dealConversion');
const {
  LEAD_STATUSES,
  pickLead,
  validateLead,
  buildKeys,
  isValidWebsite,
} = require('../utils/lead');

function errDetail(error) {
  if (!error) return undefined;
  return process.env.NODE_ENV === 'production' ? undefined : error.message;
}

function sendError(res, status, message, error) {
  return res.status(status).json({ success: false, message, error: errDetail(error) });
}

function clampInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 100);
}

function isValidId(id) {
  return mongoose.isValidObjectId(id);
}

const SORT_FIELDS = {
  createdAt: 'createdAt',
  title: 'title',
  city: 'city',
  status: 'status',
};

function publicDoc(doc) {
  const o = doc && typeof doc.toObject === 'function' ? doc.toObject() : doc;
  if (!o) return o;
  delete o.phoneKey;
  delete o.websiteKey;
  delete o.titleCityKey;
  delete o.__v;
  return o;
}

function withKeys(data) {
  const keys = buildKeys(data);
  return { ...data, ...keys };
}

// GET /api/leads?page&limit&search&status&city&category&hasMobile&hasWebsite&sortBy&sortOrder
async function getLeads(req, res) {
  try {
    const page = clampInt(req.query.page, 1, 1, 10000);
    const limit = clampInt(req.query.limit, 25, 1, 200);
    const filter = {};

    const explicitStatus = req.query.status && LEAD_STATUSES.includes(String(req.query.status));
    if (explicitStatus) {
      filter.status = String(req.query.status);
    }
    // Visibility rule (backend-enforced): successfully moved leads live in
    // Deals, not here. Excludes Converted leads that HAVE a deal. Converted
    // leads WITHOUT a deal failed conversion and stay visible/retryable.
    // Explicit ?status= or ?includeConverted=true opts out of the exclusion.
    if (!explicitStatus && req.query.includeConverted !== 'true') {
      filter.$and = (filter.$and || []).concat([
        { $or: [{ status: { $ne: 'Converted' } }, { dealId: null }, { dealId: { $exists: false } }] },
      ]);
    }
    if (req.query.city && String(req.query.city).trim() !== '') {
      filter.city = new RegExp(`^${escapeRegExp(String(req.query.city).trim())}$`, 'i');
    }
    if (req.query.category && String(req.query.category).trim() !== '') {
      filter.categoryName = new RegExp(`^${escapeRegExp(String(req.query.category).trim())}$`, 'i');
    }
    if (req.query.hasMobile === 'true') {
      filter.$and = (filter.$and || []).concat([
        { $or: [{ phone: { $nin: ['', null] } }, { phoneUnformatted: { $nin: ['', null] } }] },
      ]);
    } else if (req.query.hasMobile === 'false') {
      filter.$and = (filter.$and || []).concat([
        { $or: [{ phone: { $in: ['', null] } }, { phone: { $exists: false } }] },
        { $or: [{ phoneUnformatted: { $in: ['', null] } }, { phoneUnformatted: { $exists: false } }] },
      ]);
    }
    if (req.query.hasWebsite === 'true') {
      filter.$and = (filter.$and || []).concat([{ website: { $nin: ['', null] } }]);
    } else if (req.query.hasWebsite === 'false') {
      filter.$and = (filter.$and || []).concat([
        { $or: [{ website: { $in: ['', null] } }, { website: { $exists: false } }] },
      ]);
    }
    if (req.query.search && String(req.query.search).trim() !== '') {
      const q = escapeRegExp(String(req.query.search).trim());
      const rx = new RegExp(q, 'i');
      filter.$or = [
        { title: rx },
        { categoryName: rx },
        { address: rx },
        { city: rx },
        { website: rx },
        { phone: rx },
        { phoneUnformatted: rx },
      ];
    }

    const sortField = SORT_FIELDS[String(req.query.sortBy)] || 'createdAt';
    const sortOrder = String(req.query.sortOrder).toLowerCase() === 'asc' ? 1 : -1;

    const total = await Lead.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const items = await Lead.find(filter)
      .sort({ [sortField]: sortOrder, _id: sortOrder })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    return res.json({
      success: true,
      data: items.map(publicDoc),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    return sendError(res, 500, 'Failed to load leads.', error);
  }
}

// GET /api/leads/filter-options — distinct cities + categories.
// Scoped to visible leads (moved Converted rows excluded) unless
// ?includeConverted=true.
async function getFilterOptions(req, res) {
  try {
    const scope =
      req.query.includeConverted === 'true'
        ? {}
        : { $or: [{ status: { $ne: 'Converted' } }, { dealId: null }, { dealId: { $exists: false } }] };
    const [cities, categories] = await Promise.all([
      Lead.distinct('city', scope),
      Lead.distinct('categoryName', scope),
    ]);
    const clean = (arr) =>
      arr
        .filter((v) => typeof v === 'string' && v.trim() !== '')
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 500);
    return res.json({ success: true, data: { cities: clean(cities), categories: clean(categories) } });
  } catch (error) {
    return sendError(res, 500, 'Failed to load filter options.', error);
  }
}

// GET /api/leads/stats — counts over visible leads (moved Converted rows
// excluded) unless ?includeConverted=true. byStatus omits Converted unless
// opted in; movedToDeals reports how many converted leads have deals.
async function getStats(req, res) {
  try {
    const includeConverted = req.query.includeConverted === 'true';
    const scope = includeConverted
      ? {}
      : { $or: [{ status: { $ne: 'Converted' } }, { dealId: null }, { dealId: { $exists: false } }] };
    const matchScope = (extra) => (Object.keys(scope).length > 0 ? { $and: [scope, extra] } : extra);
    const [total, byStatus, withMobile, withWebsite, movedToDeals] = await Promise.all([
      Lead.countDocuments(scope),
      Lead.aggregate([{ $match: scope }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Lead.countDocuments(
        matchScope({ $or: [{ phone: { $nin: ['', null] } }, { phoneUnformatted: { $nin: ['', null] } }] })
      ),
      Lead.countDocuments(matchScope({ website: { $nin: ['', null] } })),
      Lead.countDocuments({ status: 'Converted', dealId: { $ne: null } }),
    ]);
    const statusCounts = {};
    for (const s of LEAD_STATUSES) statusCounts[s] = 0;
    for (const row of byStatus) {
      if (row._id && statusCounts[row._id] !== undefined) statusCounts[row._id] = row.count;
    }
    return res.json({ success: true, data: { total, byStatus: statusCounts, withMobile, withWebsite, movedToDeals } });
  } catch (error) {
    return sendError(res, 500, 'Failed to load lead statistics.', error);
  }
}

// GET /api/leads/:id
async function getLeadById(req, res) {
  try {
    const id = String(req.params.id || '');
    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid lead ID' });
    }
    const doc = await Lead.findById(id).lean();
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }
    return res.json({ success: true, data: publicDoc(doc) });
  } catch (error) {
    return sendError(res, 500, 'Failed to load lead.', error);
  }
}

// POST /api/leads
async function createLead(req, res) {
  try {
    const picked = pickLead(req.body);
    const errorMessage = validateLead(picked, { requireIdentity: true });
    if (errorMessage) {
      return res.status(400).json({ success: false, message: errorMessage });
    }
    if (picked.website && !isValidWebsite(picked.website)) {
      return res.status(400).json({ success: false, message: 'Website must be a valid http(s) URL' });
    }
    const doc = await Lead.create(withKeys({ ...picked, status: picked.status || 'New' }));
    return res.status(201).json({ success: true, message: 'Lead created successfully', data: publicDoc(doc) });
  } catch (error) {
    if (error && error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: 'Validation failed', error: errDetail(error) });
    }
    return sendError(res, 500, 'Failed to create lead.', error);
  }
}

// PUT /api/leads/:id
async function updateLead(req, res) {
  try {
    const id = String(req.params.id || '');
    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid lead ID' });
    }
    const existing = await Lead.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }
    const picked = pickLead(req.body);
    const errorMessage = validateLead(picked, { requireIdentity: false });
    if (errorMessage) {
      return res.status(400).json({ success: false, message: errorMessage });
    }
    if (picked.website !== undefined && picked.website !== '' && !isValidWebsite(picked.website)) {
      return res.status(400).json({ success: false, message: 'Website must be a valid http(s) URL' });
    }
    const doc = await Lead.findByIdAndUpdate(id, withKeys(picked), { new: true, runValidators: true }).lean();
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }
    // Same backend-driven conversion as the status endpoint: a PUT that
    // lands the lead on Converted must also ensure its deal exists.
    if (doc.status === 'Converted' && !doc.dealId) {
      try {
        const { deal, created } = await convertLeadToDeal(doc);
        doc.dealId = deal._id;
        return res.json({
          success: true,
          message: created ? 'Lead updated and converted successfully. Deal created.' : 'Lead updated successfully.',
          data: publicDoc(doc),
          deal,
        });
      } catch (conversionError) {
        return res.status(200).json({
          success: true,
          message: 'Lead updated successfully.',
          data: publicDoc(doc),
          dealError: 'Deal could not be created automatically. Please retry conversion.',
          error: errDetail(conversionError),
        });
      }
    }
    return res.json({ success: true, message: 'Lead updated successfully', data: publicDoc(doc) });
  } catch (error) {
    if (error && error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: 'Validation failed', error: errDetail(error) });
    }
    return sendError(res, 500, 'Failed to update lead.', error);
  }
}

// PATCH /api/leads/:id/status
async function setLeadStatus(req, res) {
  try {
    const id = String(req.params.id || '');
    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid lead ID' });
    }
    const status = typeof req.body?.status === 'string' ? req.body.status.trim() : '';
    if (!LEAD_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be one of: New, Message, WhatsApp, Call, Converted' });
    }
    const doc = await Lead.findByIdAndUpdate(id, { status }, { new: true, runValidators: true }).lean();
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }
    // Automatic Lead -> Deal conversion, controlled by the backend.
    // The lead update above has already succeeded; if deal creation fails
    // the lead is kept safely and the error is surfaced for retry.
    if (status === 'Converted') {
      try {
        const { deal, created } = await convertLeadToDeal(doc);
        doc.dealId = deal._id;
        return res.json({
          success: true,
          message: created ? 'Lead converted successfully. Deal created.' : 'Lead converted successfully.',
          data: publicDoc(doc),
          deal,
        });
      } catch (conversionError) {
        return res.status(200).json({
          success: true,
          message: 'Lead status set to Converted.',
          data: publicDoc(doc),
          dealError: 'Deal could not be created automatically. Please retry conversion.',
          error: errDetail(conversionError),
        });
      }
    }
    return res.json({ success: true, message: `Lead status set to ${status}`, data: publicDoc(doc) });
  } catch (error) {
    return sendError(res, 500, 'Failed to update lead status.', error);
  }
}

// POST /api/leads/:id/convert — explicit (re)try of Lead -> Deal conversion.
// Idempotent: returns the existing deal when one already references the lead.
async function convertLead(req, res) {
  try {
    const id = String(req.params.id || '');
    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid lead ID' });
    }
    const doc = await Lead.findById(id).lean();
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }
    try {
      const { deal, created } = await convertLeadToDeal(doc);
      doc.dealId = deal._id;
      return res.json({
        success: true,
        message: created ? 'Deal created successfully.' : 'Deal already exists for this lead.',
        data: publicDoc(doc),
        deal,
      });
    } catch (conversionError) {
      return sendError(res, 500, 'Deal could not be created. Please try again.', conversionError);
    }
  } catch (error) {
    return sendError(res, 500, 'Failed to convert lead.', error);
  }
}

// DELETE /api/leads/:id
async function deleteLead(req, res) {
  try {
    const id = String(req.params.id || '');
    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid lead ID' });
    }
    const doc = await Lead.findByIdAndDelete(id).lean();
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }
    return res.json({ success: true, message: 'Lead deleted successfully' });
  } catch (error) {
    return sendError(res, 500, 'Failed to delete lead.', error);
  }
}

const MAX_BULK_DELETE = 200;

// POST /api/leads/bulk-delete — body { ids: [...] }.
// Deletes ONLY the explicitly listed IDs (page-scoped by the frontend).
// Individual delete has no hooks/cleanup/audit, so a single deleteMany
// bypasses no business logic.
async function bulkDeleteLeads(req, res) {
  try {
    const ids = req.body && req.body.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Provide a non-empty array of lead IDs' });
    }
    if (ids.length > MAX_BULK_DELETE) {
      return res.status(400).json({ success: false, message: `Too many IDs. Maximum ${MAX_BULK_DELETE} per request.` });
    }
    const unique = [...new Set(ids.filter((v) => typeof v === 'string' && isValidId(v)))];
    if (unique.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid lead IDs provided' });
    }
    const result = await Lead.deleteMany({ _id: { $in: unique } });
    const deletedCount = typeof result.deletedCount === 'number' ? result.deletedCount : 0;
    return res.json({
      success: true,
      message: deletedCount === 1 ? '1 lead deleted successfully' : `${deletedCount} leads deleted successfully`,
      deletedCount,
    });
  } catch (error) {
    return sendError(res, 500, 'Failed to delete leads.', error);
  }
}

const MAX_IMPORT_RECORDS = 5000;
const PREVIEW_ROW_CAP = 200;

function isEmptyRecord(picked) {
  return ['title', 'categoryName', 'address', 'city', 'website', 'phone', 'phoneUnformatted'].every(
    (k) => !picked[k] || picked[k].trim() === ''
  );
}

function recordKey(keys) {
  if (keys.phoneKey) return `phone:${keys.phoneKey}`;
  if (keys.websiteKey) return `web:${keys.websiteKey}`;
  if (keys.titleCityKey) return `name:${keys.titleCityKey}`;
  return '';
}

// Shared classification used by preview AND import (never trust client verdicts).
async function classifyRecords(rawRecords) {
  const normalized = rawRecords.map((r) => {
    const picked = pickLead(r);
    return { picked, keys: buildKeys(picked), empty: isEmptyRecord(picked) };
  });

  // In-file duplicates (first occurrence wins).
  const seen = new Map();
  const inFileDup = new Set();
  normalized.forEach((rec, i) => {
    if (rec.empty) return;
    const key = recordKey(rec.keys);
    if (!key) return;
    if (seen.has(key)) {
      inFileDup.add(i);
    } else {
      seen.set(key, i);
    }
  });

  // Single batched DB lookup across all identity keys.
  const phones = [...new Set(normalized.filter((r) => !r.empty && r.keys.phoneKey).map((r) => r.keys.phoneKey))];
  const webs = [...new Set(normalized.filter((r) => !r.empty && r.keys.websiteKey).map((r) => r.keys.websiteKey))];
  const names = [...new Set(normalized.filter((r) => !r.empty && r.keys.titleCityKey).map((r) => r.keys.titleCityKey))];
  const or = [];
  if (phones.length > 0) or.push({ phoneKey: { $in: phones } });
  if (webs.length > 0) or.push({ websiteKey: { $in: webs } });
  if (names.length > 0) or.push({ titleCityKey: { $in: names } });
  const dbPhones = new Set();
  const dbWebs = new Set();
  const dbNames = new Set();
  if (or.length > 0) {
    const existing = await Lead.find({ $or: or })
      .select('phoneKey websiteKey titleCityKey')
      .lean();
    for (const doc of existing) {
      if (doc.phoneKey) dbPhones.add(doc.phoneKey);
      if (doc.websiteKey) dbWebs.add(doc.websiteKey);
      if (doc.titleCityKey) dbNames.add(doc.titleCityKey);
    }
  }

  const rows = normalized.map((rec, i) => {
    let verdict = 'new';
    let reason = 'Ready to import';
    if (rec.empty) {
      verdict = 'invalid';
      reason = 'Record has no usable data';
    } else if (inFileDup.has(i)) {
      verdict = 'in-file-duplicate';
      reason = 'Same business already appears earlier in this file';
    } else if (
      (rec.keys.phoneKey && dbPhones.has(rec.keys.phoneKey)) ||
      (rec.keys.websiteKey && dbWebs.has(rec.keys.websiteKey))
    ) {
      verdict = 'exists-db';
      reason = 'Same phone or website already exists in database';
    } else if (rec.keys.titleCityKey && dbNames.has(rec.keys.titleCityKey)) {
      verdict = 'possible';
      reason = 'Same name and city found, but phone/website differ';
    }
    return { index: i, lead: rec.picked, verdict, reason };
  });

  const summary = {
    total: rows.length,
    new: 0,
    inFileDuplicate: 0,
    existsDb: 0,
    possible: 0,
    invalid: 0,
  };
  for (const r of rows) {
    if (r.verdict === 'new') summary.new += 1;
    else if (r.verdict === 'in-file-duplicate') summary.inFileDuplicate += 1;
    else if (r.verdict === 'exists-db') summary.existsDb += 1;
    else if (r.verdict === 'possible') summary.possible += 1;
    else summary.invalid += 1;
  }
  return { rows, summary };
}

function coerceImportRecords(body) {
  const payload = body && typeof body === 'object' ? body.records ?? body.data ?? body.leads : undefined;
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') return [payload];
  return null;
}

// POST /api/leads/import/preview — body { records: [...] }
async function previewImport(req, res) {
  try {
    const raw = coerceImportRecords(req.body);
    if (!raw) {
      return res.status(400).json({ success: false, message: 'Provide records as a JSON array or a single object' });
    }
    if (raw.length === 0) {
      return res.json({
        success: true,
        summary: { total: 0, new: 0, inFileDuplicate: 0, existsDb: 0, possible: 0, invalid: 0 },
        rows: [],
      });
    }
    if (raw.length > MAX_IMPORT_RECORDS) {
      return res.status(400).json({ success: false, message: `Too many records. Maximum ${MAX_IMPORT_RECORDS} per import.` });
    }
    const { rows, summary } = await classifyRecords(raw);
    return res.json({ success: true, summary, rows: rows.slice(0, PREVIEW_ROW_CAP), truncated: rows.length > PREVIEW_ROW_CAP });
  } catch (error) {
    return sendError(res, 500, 'Unable to analyze import file.', error);
  }
}

// POST /api/leads/import — body { records: [...], mode: 'new-only' | 'all' }
async function importLeads(req, res) {
  try {
    const raw = coerceImportRecords(req.body);
    if (!raw) {
      return res.status(400).json({ success: false, message: 'Provide records as a JSON array or a single object' });
    }
    if (raw.length === 0) {
      return res.status(400).json({ success: false, message: 'No records to import' });
    }
    if (raw.length > MAX_IMPORT_RECORDS) {
      return res.status(400).json({ success: false, message: `Too many records. Maximum ${MAX_IMPORT_RECORDS} per import.` });
    }
    const mode = req.body && req.body.mode === 'all' ? 'all' : 'new-only';
    const { rows } = await classifyRecords(raw);

    const selected = rows.filter((r) =>
      mode === 'all' ? r.verdict !== 'invalid' : r.verdict === 'new'
    );
    const skipped = rows.length - selected.length;

    let imported = 0;
    const errorDetails = [];
    const CHUNK = 500;
    for (let i = 0; i < selected.length; i += CHUNK) {
      const chunk = selected.slice(i, i + CHUNK).map((r) => {
        const status = r.lead.status && LEAD_STATUSES.includes(r.lead.status) ? r.lead.status : 'New';
        return withKeys({ ...r.lead, status });
      });
      try {
        const inserted = await Lead.insertMany(chunk, { ordered: false });
        imported += inserted.length;
      } catch (error) {
        // insertMany ordered:false throws on partial failure; count what succeeded.
        const ok = error && typeof error.insertedCount === 'number' ? error.insertedCount : 0;
        imported += ok;
        const failures = error && Array.isArray(error.writeErrors) ? error.writeErrors : [];
        for (const f of failures.slice(0, 20 - errorDetails.length)) {
          errorDetails.push({
            index: f?.index ?? -1,
            message: (f?.err?.errmsg || f?.errmsg || 'Insert failed').slice(0, 200),
          });
        }
        if (failures.length === 0 && errorDetails.length < 20) {
          errorDetails.push({ index: -1, message: String((error && error.message) || 'Insert failed').slice(0, 200) });
        }
      }
    }

    const duplicates =
      mode === 'all'
        ? rows.filter((r) => ['in-file-duplicate', 'exists-db', 'possible'].includes(r.verdict)).length
        : rows.filter((r) => r.verdict !== 'new' && r.verdict !== 'invalid').length;

    return res.json({
      success: true,
      message: `Import completed: ${imported} imported`,
      processed: rows.length,
      imported,
      skipped,
      duplicates,
      errors: errorDetails.length,
      errorDetails,
      mode,
    });
  } catch (error) {
    return sendError(res, 500, 'Unable to complete import.', error);
  }
}

module.exports = {
  getLeads,
  getFilterOptions,
  getStats,
  getLeadById,
  createLead,
  updateLead,
  setLeadStatus,
  convertLead,
  deleteLead,
  bulkDeleteLeads,
  previewImport,
  importLeads,
};
