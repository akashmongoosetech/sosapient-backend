const mongoose = require('mongoose');
const Deal = require('../models/deal.model');
const Lead = require('../models/lead.model');
const { convertLeadToDeal } = require('../utils/dealConversion');
const { sanitizeRichHtml } = require('../utils/sanitizeRichHtml');
const { safeAttachmentName } = require('../middleware/upload');

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

function cleanText(value, max) {
  if (typeof value !== 'string') return undefined;
  const v = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return v.slice(0, max);
}

function isValidEmail(value) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function toDateOrNull(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Strip attachment bytes from API responses (metadata only).
function stripAttachmentData(doc) {
  const o = doc && typeof doc.toObject === 'function' ? doc.toObject() : doc;
  if (!o) return o;
  for (const section of ['requirements', 'reports']) {
    if (Array.isArray(o[section])) {
      for (const item of o[section]) {
        if (Array.isArray(item.attachments)) {
          for (const a of item.attachments) delete a.data;
        }
      }
    }
  }
  delete o.__v;
  return o;
}

const DEAL_SELECT_NO_BYTES =
  '-requirements.attachments.data -reports.attachments.data';

const SORT_FIELDS = {
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  projectReceivedDate: 'projectReceivedDate',
};

// GET /api/deals?search&city&category&dateFrom&dateTo&sortBy&sortOrder&page&limit
async function getDeals(req, res) {
  try {
    const page = clampInt(req.query.page, 1, 1, 10000);
    const limit = clampInt(req.query.limit, 25, 1, 200);
    const filter = {};
    if (req.query.city && String(req.query.city).trim() !== '') {
      const rx = new RegExp(`^${escapeRegExp(String(req.query.city).trim())}$`, 'i');
      filter.$or = [{ 'leadSnapshot.city': rx }, { 'client.city': rx }];
    }
    if (req.query.category && String(req.query.category).trim() !== '') {
      filter['leadSnapshot.categoryName'] = new RegExp(`^${escapeRegExp(String(req.query.category).trim())}$`, 'i');
    }
    if (req.query.search && String(req.query.search).trim() !== '') {
      const rx = new RegExp(escapeRegExp(String(req.query.search).trim()), 'i');
      filter.$and = (filter.$and || []).concat([
        {
          $or: [
            { 'leadSnapshot.title': rx },
            { 'client.name': rx },
            { 'leadSnapshot.city': rx },
            { 'client.city': rx },
            { 'leadSnapshot.categoryName': rx },
          ],
        },
      ]);
    }
    const from = req.query.dateFrom ? new Date(req.query.dateFrom) : null;
    const to = req.query.dateTo ? new Date(req.query.dateTo) : null;
    if ((req.query.dateFrom && (!from || Number.isNaN(from.getTime()))) ||
        (req.query.dateTo && (!to || Number.isNaN(to.getTime())))) {
      return res.status(400).json({ success: false, message: 'Invalid date filter' });
    }
    if (from || to) {
      filter.projectReceivedDate = {};
      if (from) filter.projectReceivedDate.$gte = from;
      if (to) filter.projectReceivedDate.$lte = to;
    }
    const sortField = SORT_FIELDS[String(req.query.sortBy)] || 'createdAt';
    const sortOrder = String(req.query.sortOrder).toLowerCase() === 'asc' ? 1 : -1;

    const total = await Deal.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const items = await Deal.find(filter)
      .select(DEAL_SELECT_NO_BYTES)
      .sort({ [sortField]: sortOrder, _id: sortOrder })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    return res.json({
      success: true,
      data: items.map(stripAttachmentData),
      pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    });
  } catch (error) {
    return sendError(res, 500, 'Failed to load deals.', error);
  }
}

// GET /api/deals/by-lead/:leadId
async function getDealByLead(req, res) {
  try {
    const leadId = String(req.params.leadId || '');
    if (!isValidId(leadId)) {
      return res.status(400).json({ success: false, message: 'Invalid lead ID' });
    }
    const doc = await Deal.findOne({ sourceLeadId: leadId }).select(DEAL_SELECT_NO_BYTES).lean();
    if (!doc) {
      return res.status(404).json({ success: false, message: 'No deal found for this lead' });
    }
    return res.json({ success: true, data: stripAttachmentData(doc) });
  } catch (error) {
    return sendError(res, 500, 'Failed to load deal.', error);
  }
}

// GET /api/deals/:id
async function getDealById(req, res) {
  try {
    const id = String(req.params.id || '');
    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid deal ID' });
    }
    const doc = await Deal.findById(id)
      .select(DEAL_SELECT_NO_BYTES)
      .populate('sourceLeadId', 'title status city')
      .lean();
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Deal not found' });
    }
    return res.json({ success: true, data: stripAttachmentData(doc) });
  } catch (error) {
    return sendError(res, 500, 'Failed to load deal.', error);
  }
}

// POST /api/deals — body { sourceLeadId }. Manual creation always routes
// through the same idempotent conversion (no orphan deals).
async function createDeal(req, res) {
  try {
    const leadId = req.body && req.body.sourceLeadId;
    if (typeof leadId !== 'string' || !isValidId(leadId)) {
      return res.status(400).json({ success: false, message: 'Provide a valid sourceLeadId' });
    }
    const lead = await Lead.findById(leadId).lean();
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }
    try {
      const { deal, created } = await convertLeadToDeal(lead);
      return res.status(created ? 201 : 200).json({
        success: true,
        message: created ? 'Deal created successfully.' : 'Deal already exists for this lead.',
        data: stripAttachmentData(deal),
      });
    } catch (conversionError) {
      return sendError(res, 500, 'Deal could not be created. Please try again.', conversionError);
    }
  } catch (error) {
    return sendError(res, 500, 'Failed to create deal.', error);
  }
}

const CLIENT_FIELDS = ['name', 'mobileNumber1', 'mobileNumber2', 'email1', 'email2', 'address', 'city', 'state', 'pincode'];
const CLIENT_MAX = { name: 200, mobileNumber1: 40, mobileNumber2: 40, email1: 160, email2: 160, address: 500, city: 100, state: 100, pincode: 20 };

// PUT /api/deals/:id — client + projectReceivedDate. Status/source are immutable.
async function updateDeal(req, res) {
  try {
    const id = String(req.params.id || '');
    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid deal ID' });
    }
    if (req.body && req.body.status !== undefined && req.body.status !== 'Converted') {
      return res.status(400).json({ success: false, message: 'Deal status cannot be changed' });
    }
    const update = {};
    if (req.body && typeof req.body.client === 'object' && req.body.client !== null) {
      const client = {};
      for (const key of CLIENT_FIELDS) {
        if (req.body.client[key] === undefined) continue;
        const v = cleanText(req.body.client[key], CLIENT_MAX[key]);
        if (v !== undefined) client[key] = key.startsWith('email') ? v.toLowerCase() : v;
      }
      if (client.email1 !== undefined && !isValidEmail(client.email1)) {
        return res.status(400).json({ success: false, message: 'Email 1 must be a valid email address' });
      }
      if (client.email2 !== undefined && !isValidEmail(client.email2)) {
        return res.status(400).json({ success: false, message: 'Email 2 must be a valid email address' });
      }
      update.client = client;
    }
    if (req.body && req.body.projectReceivedDate !== undefined) {
      if (req.body.projectReceivedDate === '' || req.body.projectReceivedDate === null) {
        update.$unset = { projectReceivedDate: 1 };
      } else {
        const d = toDateOrNull(req.body.projectReceivedDate);
        if (!d) {
          return res.status(400).json({ success: false, message: 'Invalid project received date' });
        }
        update.projectReceivedDate = d;
      }
    }
    if (Object.keys(update).length === 0 && !update.$unset) {
      return res.status(400).json({ success: false, message: 'Nothing to update' });
    }
    const doc = await Deal.findByIdAndUpdate(id, update, { new: true, runValidators: true })
      .select(DEAL_SELECT_NO_BYTES)
      .lean();
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Deal not found' });
    }
    return res.json({ success: true, message: 'Deal updated successfully', data: stripAttachmentData(doc) });
  } catch (error) {
    if (error && error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: 'Validation failed', error: errDetail(error) });
    }
    return sendError(res, 500, 'Failed to update deal.', error);
  }
}

// DELETE /api/deals/:id — removes the deal only; the source lead is kept.
async function deleteDeal(req, res) {
  try {
    const id = String(req.params.id || '');
    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid deal ID' });
    }
    const doc = await Deal.findByIdAndDelete(id).lean();
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Deal not found' });
    }
    return res.json({ success: true, message: 'Deal deleted successfully' });
  } catch (error) {
    return sendError(res, 500, 'Failed to delete deal.', error);
  }
}

function findSubdoc(deal, section, itemId) {
  if (!deal || !Array.isArray(deal[section])) return null;
  return deal[section].find((r) => String(r._id) === String(itemId)) || null;
}

// POST /api/deals/:id/requirements — { title, description (rich HTML) }
async function addRequirement(req, res) {
  try {
    const id = String(req.params.id || '');
    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid deal ID' });
    }
    const title = cleanText(req.body && req.body.title, 200);
    if (!title) {
      return res.status(400).json({ success: false, message: 'Requirement title is required' });
    }
    const description = sanitizeRichHtml(typeof (req.body && req.body.description) === 'string' ? req.body.description : '');
    const doc = await Deal.findById(id);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Deal not found' });
    }
    if (doc.requirements.length >= 100) {
      return res.status(400).json({ success: false, message: 'Too many requirements on this deal' });
    }
    doc.requirements.push({ title, description });
    await doc.save();
    const fresh = await Deal.findById(id).select(DEAL_SELECT_NO_BYTES).lean();
    return res.status(201).json({ success: true, message: 'Requirement added', data: stripAttachmentData(fresh) });
  } catch (error) {
    if (error && error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: 'Validation failed', error: errDetail(error) });
    }
    return sendError(res, 500, 'Failed to add requirement.', error);
  }
}

// PUT /api/deals/:id/requirements/:reqId
async function updateRequirement(req, res) {
  try {
    const id = String(req.params.id || '');
    const reqId = String(req.params.reqId || '');
    if (!isValidId(id) || !isValidId(reqId)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    const doc = await Deal.findById(id);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Deal not found' });
    }
    const item = findSubdoc(doc, 'requirements', reqId);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Requirement not found' });
    }
    if (req.body && req.body.title !== undefined) {
      const title = cleanText(req.body.title, 200);
      if (!title) {
        return res.status(400).json({ success: false, message: 'Requirement title is required' });
      }
      item.title = title;
    }
    if (req.body && req.body.description !== undefined) {
      if (typeof req.body.description !== 'string') {
        return res.status(400).json({ success: false, message: 'Invalid description' });
      }
      item.description = sanitizeRichHtml(req.body.description);
    }
    await doc.save();
    const fresh = await Deal.findById(id).select(DEAL_SELECT_NO_BYTES).lean();
    return res.json({ success: true, message: 'Requirement updated', data: stripAttachmentData(fresh) });
  } catch (error) {
    return sendError(res, 500, 'Failed to update requirement.', error);
  }
}

// DELETE /api/deals/:id/requirements/:reqId
async function deleteRequirement(req, res) {
  try {
    const id = String(req.params.id || '');
    const reqId = String(req.params.reqId || '');
    if (!isValidId(id) || !isValidId(reqId)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    const doc = await Deal.findByIdAndUpdate(
      id,
      { $pull: { requirements: { _id: reqId } } },
      { new: true }
    ).select(DEAL_SELECT_NO_BYTES).lean();
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Deal not found' });
    }
    return res.json({ success: true, message: 'Requirement deleted', data: stripAttachmentData(doc) });
  } catch (error) {
    return sendError(res, 500, 'Failed to delete requirement.', error);
  }
}

// GET /api/deals/:id/reports?page&limit — date-wise entries, newest first
async function getReports(req, res) {
  try {
    const id = String(req.params.id || '');
    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid deal ID' });
    }
    const page = clampInt(req.query.page, 1, 1, 1000);
    const limit = clampInt(req.query.limit, 20, 1, 100);
    const doc = await Deal.findById(id).select('reports').lean();
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Deal not found' });
    }
    const sorted = [...(doc.reports || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const slice = sorted.slice((page - 1) * limit, page * limit).map((r) => {
      const copy = { ...r };
      if (Array.isArray(copy.attachments)) {
        copy.attachments = copy.attachments.map((a) => {
          const c = { ...a };
          delete c.data;
          return c;
        });
      }
      return copy;
    });
    return res.json({
      success: true,
      data: slice,
      pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    });
  } catch (error) {
    return sendError(res, 500, 'Failed to load reports.', error);
  }
}

// POST /api/deals/:id/reports — { date, workCompleted, comment?, nextPlan? }
async function addReport(req, res) {
  try {
    const id = String(req.params.id || '');
    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid deal ID' });
    }
    const date = toDateOrNull(req.body && req.body.date);
    if (!date) {
      return res.status(400).json({ success: false, message: 'A valid report date is required' });
    }
    const workCompleted = cleanText(req.body && req.body.workCompleted, 10000);
    if (!workCompleted) {
      return res.status(400).json({ success: false, message: 'Work completed is required' });
    }
    const doc = await Deal.findById(id);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Deal not found' });
    }
    if (doc.reports.length >= 500) {
      return res.status(400).json({ success: false, message: 'Too many reports on this deal' });
    }
    const createdBy = (req.auth && req.auth.userId) || '';
    doc.reports.push({
      date,
      workCompleted,
      comment: cleanText(req.body && req.body.comment, 10000) || '',
      nextPlan: cleanText(req.body && req.body.nextPlan, 10000) || '',
      createdBy,
    });
    await doc.save();
    const fresh = await Deal.findById(id).select(DEAL_SELECT_NO_BYTES).lean();
    return res.status(201).json({ success: true, message: 'Report added', data: stripAttachmentData(fresh) });
  } catch (error) {
    if (error && error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: 'Validation failed', error: errDetail(error) });
    }
    return sendError(res, 500, 'Failed to add report.', error);
  }
}

// PUT /api/deals/:id/reports/:reportId — date/workCompleted/comment/nextPlan.
// Attachments, createdAt and createdBy are preserved.
async function updateReport(req, res) {
  try {
    const id = String(req.params.id || '');
    const reportId = String(req.params.reportId || '');
    if (!isValidId(id) || !isValidId(reportId)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    const doc = await Deal.findById(id);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Deal not found' });
    }
    const item = findSubdoc(doc, 'reports', reportId);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }
    if (req.body && req.body.date !== undefined) {
      const date = toDateOrNull(req.body.date);
      if (!date) {
        return res.status(400).json({ success: false, message: 'Invalid report date' });
      }
      item.date = date;
    }
    if (req.body && req.body.workCompleted !== undefined) {
      const workCompleted = cleanText(req.body.workCompleted, 10000);
      if (!workCompleted) {
        return res.status(400).json({ success: false, message: 'Work completed is required' });
      }
      item.workCompleted = workCompleted;
    }
    if (req.body && req.body.comment !== undefined) {
      if (typeof req.body.comment !== 'string') {
        return res.status(400).json({ success: false, message: 'Invalid comment' });
      }
      item.comment = cleanText(req.body.comment, 10000) || '';
    }
    if (req.body && req.body.nextPlan !== undefined) {
      if (typeof req.body.nextPlan !== 'string') {
        return res.status(400).json({ success: false, message: 'Invalid next plan' });
      }
      item.nextPlan = cleanText(req.body.nextPlan, 10000) || '';
    }
    await doc.save();
    const fresh = await Deal.findById(id).select(DEAL_SELECT_NO_BYTES).lean();
    return res.json({ success: true, message: 'Report updated', data: stripAttachmentData(fresh) });
  } catch (error) {
    return sendError(res, 500, 'Failed to update report.', error);
  }
}

// DELETE /api/deals/:id/reports/:reportId — removes only that report.
async function deleteReport(req, res) {
  try {
    const id = String(req.params.id || '');
    const reportId = String(req.params.reportId || '');
    if (!isValidId(id) || !isValidId(reportId)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    const doc = await Deal.findByIdAndUpdate(
      id,
      { $pull: { reports: { _id: reportId } } },
      { new: true }
    ).select(DEAL_SELECT_NO_BYTES).lean();
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Deal not found' });
    }
    return res.json({ success: true, message: 'Report deleted', data: stripAttachmentData(doc) });
  } catch (error) {
    return sendError(res, 500, 'Failed to delete report.', error);
  }
}

const MAX_ATTACHMENTS = 10;

function toAttachmentMeta(file, uploadedBy) {
  return {
    filename: safeAttachmentName(file.originalname, 'file'),
    contentType: file.mimetype,
    size: file.size,
    data: file.buffer,
    uploadedBy: uploadedBy || '',
    uploadedAt: new Date(),
  };
}

function attachTarget(doc, section, itemId) {
  const item = findSubdoc(doc, section, itemId);
  if (!item) return null;
  if (!Array.isArray(item.attachments)) item.attachments = [];
  return item;
}

// POST /api/deals/:id/requirements/:reqId/attachments (multipart files[])
async function addRequirementAttachments(req, res) {
  try {
    const id = String(req.params.id || '');
    const reqId = String(req.params.reqId || '');
    if (!isValidId(id) || !isValidId(reqId)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files uploaded' });
    }
    const doc = await Deal.findById(id);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Deal not found' });
    }
    const item = attachTarget(doc, 'requirements', reqId);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Requirement not found' });
    }
    if (item.attachments.length + files.length > MAX_ATTACHMENTS) {
      return res.status(400).json({ success: false, message: `Too many attachments (max ${MAX_ATTACHMENTS})` });
    }
    const uploadedBy = (req.auth && req.auth.userId) || '';
    for (const file of files) item.attachments.push(toAttachmentMeta(file, uploadedBy));
    await doc.save();
    const fresh = await Deal.findById(id).select(DEAL_SELECT_NO_BYTES).lean();
    return res.status(201).json({ success: true, message: 'Attachments uploaded', data: stripAttachmentData(fresh) });
  } catch (error) {
    return sendError(res, 500, 'Failed to upload attachments.', error);
  }
}

// DELETE /api/deals/:id/requirements/:reqId/attachments/:attId
async function deleteRequirementAttachment(req, res) {
  try {
    const ids = [req.params.id, req.params.reqId, req.params.attId].map((v) => String(v || ''));
    if (ids.some((v) => !isValidId(v))) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    const doc = await Deal.findByIdAndUpdate(
      ids[0],
      { $pull: { 'requirements.$[r].attachments': { _id: ids[2] } } },
      { arrayFilters: [{ 'r._id': ids[1] }], new: true }
    ).select(DEAL_SELECT_NO_BYTES).lean();
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Deal not found' });
    }
    return res.json({ success: true, message: 'Attachment removed', data: stripAttachmentData(doc) });
  } catch (error) {
    return sendError(res, 500, 'Failed to remove attachment.', error);
  }
}

// POST /api/deals/:id/reports/:reportId/attachments (multipart files[])
async function addReportAttachments(req, res) {
  try {
    const id = String(req.params.id || '');
    const reportId = String(req.params.reportId || '');
    if (!isValidId(id) || !isValidId(reportId)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files uploaded' });
    }
    const doc = await Deal.findById(id);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Deal not found' });
    }
    const item = attachTarget(doc, 'reports', reportId);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }
    if (item.attachments.length + files.length > MAX_ATTACHMENTS) {
      return res.status(400).json({ success: false, message: `Too many attachments (max ${MAX_ATTACHMENTS})` });
    }
    const uploadedBy = (req.auth && req.auth.userId) || '';
    for (const file of files) item.attachments.push(toAttachmentMeta(file, uploadedBy));
    await doc.save();
    const fresh = await Deal.findById(id).select(DEAL_SELECT_NO_BYTES).lean();
    return res.status(201).json({ success: true, message: 'Attachments uploaded', data: stripAttachmentData(fresh) });
  } catch (error) {
    return sendError(res, 500, 'Failed to upload attachments.', error);
  }
}

// DELETE /api/deals/:id/reports/:reportId/attachments/:attId
async function deleteReportAttachment(req, res) {
  try {
    const ids = [req.params.id, req.params.reportId, req.params.attId].map((v) => String(v || ''));
    if (ids.some((v) => !isValidId(v))) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    const doc = await Deal.findByIdAndUpdate(
      ids[0],
      { $pull: { 'reports.$[r].attachments': { _id: ids[2] } } },
      { arrayFilters: [{ 'r._id': ids[1] }], new: true }
    ).select(DEAL_SELECT_NO_BYTES).lean();
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Deal not found' });
    }
    return res.json({ success: true, message: 'Attachment removed', data: stripAttachmentData(doc) });
  } catch (error) {
    return sendError(res, 500, 'Failed to remove attachment.', error);
  }
}

// Coerces any stored binary shape (Buffer, Uint8Array, BSON Binary) into a
// real Node Buffer for res.send(). Never returns encoded text.
function toResponseBytes(data) {
  if (!data) return null;
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (data && data.buffer instanceof Uint8Array) {
    const len = typeof data.position === 'number' ? data.position : data.buffer.byteLength;
    return Buffer.from(data.buffer.buffer || data.buffer, data.buffer.byteOffset || 0, len);
  }
  return null;
}

// GET /api/deals/attachment/:attId — streams file bytes (inline for preview).
async function streamAttachment(req, res) {
  try {
    const attId = String(req.params.attId || '');
    if (!isValidId(attId)) {
      return res.status(400).json({ success: false, message: 'Invalid attachment ID' });
    }
    // NOTE: no .lean() here on purpose. Lean queries return BSON Binary
    // objects for Buffer paths, which Express JSON-serializes (base64 text)
    // instead of sending raw bytes. Hydrated docs give real Buffers.
    const byReq = await Deal.findOne(
      { 'requirements.attachments._id': attId },
      { 'requirements.attachments.$': 1 }
    );
    const byRep = byReq
      ? null
      : await Deal.findOne(
          { 'reports.attachments._id': attId },
          { 'reports.attachments.$': 1 }
        );
    const holder = byReq
      ? (byReq.requirements || [])[0]
      : byRep
        ? (byRep.reports || [])[0]
        : null;
    const file = holder && Array.isArray(holder.attachments) ? holder.attachments[0] : null;
    const bytes = toResponseBytes(file && file.data);
    if (!file || !bytes || bytes.length === 0) {
      return res.status(404).json({ success: false, message: 'Attachment not found' });
    }
    const safeName = safeAttachmentName(file.filename, 'file').replace(/"/g, '');
    res.set('Content-Type', file.contentType || 'application/octet-stream');
    res.set('Content-Disposition', `inline; filename="${safeName}"`);
    res.set('Content-Length', String(bytes.length));
    return res.send(bytes);
  } catch (error) {
    return sendError(res, 500, 'Failed to load attachment.', error);
  }
}

module.exports = {
  getDeals,
  getDealByLead,
  getDealById,
  createDeal,
  updateDeal,
  deleteDeal,
  addRequirement,
  updateRequirement,
  deleteRequirement,
  getReports,
  addReport,
  updateReport,
  deleteReport,
  addRequirementAttachments,
  deleteRequirementAttachment,
  addReportAttachments,
  deleteReportAttachment,
  streamAttachment,
};
