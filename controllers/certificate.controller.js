const Certificate = require('../models/certificate.model');
const {
  CONFIG,
  generateCertificateId,
  calcDuration,
  durationText,
  candidateSlug,
  isValidMobile,
  isValidUrl
} = require('../utils/certificate');

function errDetail(error) {
  if (!error) return undefined;
  return process.env.NODE_ENV === 'production' ? undefined : error.message;
}

function clampInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function sendError(res, status, message, error) {
  return res.status(status).json({
    success: false,
    message,
    error: errDetail(error)
  });
}

const WRITE_FIELDS = [
  'firstName', 'lastName', 'college', 'email', 'mobileNumber', 'course',
  'internshipTrainingCourse', 'startDate', 'endDate',
  'hrHeadName', 'hrHeadDesignation', 'hrHeadSignature',
  'managerName', 'managerDesignation', 'managerSignature', 'status'
];

function pickCertificate(body = {}) {
  const out = {};
  for (const k of WRITE_FIELDS) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  return out;
}

function validateCommon(data, isUpdate) {
  const fail = (message) => ({ status: 400, message });
  const str = (v) => (typeof v === 'string' ? v : '');

  if (!isUpdate || data.firstName !== undefined) {
    if (!str(data.firstName).trim()) {
      return fail('First name is required.');
    }
    if (str(data.firstName).trim().length > 100) {
      return fail('First name must be at most 100 characters');
    }
  }
  if (!isUpdate || data.lastName !== undefined) {
    if (!str(data.lastName).trim()) {
      return fail('Last name is required.');
    }
    if (str(data.lastName).trim().length > 100) {
      return fail('Last name must be at most 100 characters');
    }
  }
  if (data.college !== undefined && str(data.college).trim().length > 200) {
    return fail('College must be at most 200 characters');
  }
  if (data.email !== undefined && str(data.email).trim() !== '' &&
      (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(data.email).trim()) || str(data.email).trim().length > 160)) {
    return fail('Please enter a valid email address');
  }
  if (data.mobileNumber !== undefined && str(data.mobileNumber).trim() !== '' && !isValidMobile(data.mobileNumber)) {
    return fail('Please enter a valid mobile number');
  }
  if (data.course !== undefined && str(data.course).trim().length > 160) {
    return fail('Course must be at most 160 characters');
  }
  if (!isUpdate || data.internshipTrainingCourse !== undefined) {
    if (!str(data.internshipTrainingCourse).trim() || str(data.internshipTrainingCourse).trim().length > 160) {
      return fail('Internship Training Course is required (max 160 characters)');
    }
  }
  if ((!isUpdate && (data.startDate === undefined || data.endDate === undefined)) ||
      (data.startDate !== undefined && Number.isNaN(new Date(data.startDate).getTime())) ||
      (data.endDate !== undefined && Number.isNaN(new Date(data.endDate).getTime()))) {
    return fail('Course duration is required: select a start date and an end date');
  }
  if (data.status !== undefined && !['valid', 'revoked'].includes(data.status)) {
    return fail('Status must be valid or revoked');
  }
  for (const k of ['hrHeadSignature', 'managerSignature']) {
    if (data[k] !== undefined && data[k] !== '' && !isValidUrl(data[k]) && !String(data[k]).startsWith('data:image/')) {
      return fail('Signatures must be valid image URLs or uploads');
    }
    if (typeof data[k] === 'string' && data[k].length > 204800) {
      return fail('Signature image is too large (max 200KB). Please use a smaller PNG or JPEG file.');
    }
  }
  return null;
}

function normalizeWrite(data, existing) {
  const out = { ...data };
  for (const k of ['firstName', 'lastName', 'college', 'course', 'internshipTrainingCourse', 'hrHeadName', 'hrHeadDesignation', 'managerName', 'managerDesignation']) {
    if (typeof out[k] === 'string') out[k] = out[k].trim();
  }
  if (typeof out.email === 'string') out.email = out.email.trim().toLowerCase();
  if (typeof out.mobileNumber === 'string') out.mobileNumber = out.mobileNumber.trim().replace(/[\s-]/g, '');
  if (typeof out.hrHeadSignature === 'string') out.hrHeadSignature = out.hrHeadSignature.trim();
  if (typeof out.managerSignature === 'string') out.managerSignature = out.managerSignature.trim();

  const start = out.startDate !== undefined ? out.startDate : existing?.startDate;
  const end = out.endDate !== undefined ? out.endDate : existing?.endDate;
  if (start !== undefined && end !== undefined) {
    const span = calcDuration(start, end);
    out.startDate = new Date(start);
    out.endDate = new Date(end);
    out.durationMonths = span.months;
    out.durationDays = span.days;
    out.durationText = durationText(span);
  }

  const first = out.firstName !== undefined ? out.firstName : existing?.firstName || '';
  const last = out.lastName !== undefined ? out.lastName : existing?.lastName || '';
  out.verificationSlug = candidateSlug(first, last);
  return out;
}

function applyAuthorityDefaults(data) {
  if (data.hrHeadName === undefined || String(data.hrHeadName).trim() === '') {
    data.hrHeadName = CONFIG.hrHeadName;
  }
  if (data.hrHeadDesignation === undefined || String(data.hrHeadDesignation).trim() === '') {
    data.hrHeadDesignation = CONFIG.hrHeadDesignation;
  }
  if (data.hrHeadSignature === undefined) data.hrHeadSignature = CONFIG.hrHeadSignature;
  if (data.managerName === undefined || String(data.managerName).trim() === '') {
    data.managerName = CONFIG.managerName;
  }
  if (data.managerDesignation === undefined || String(data.managerDesignation).trim() === '') {
    data.managerDesignation = CONFIG.managerDesignation;
  }
  if (data.managerSignature === undefined) data.managerSignature = CONFIG.managerSignature;
  return data;
}

// Public-safe projection (no internal notes/ids beyond necessity)
function publicView(doc) {
  return {
    certificateId: doc.certificateId,
    firstName: doc.firstName,
    lastName: doc.lastName,
    college: doc.college,
    email: doc.email,
    mobileNumber: doc.mobileNumber,
    course: doc.course,
    internshipTrainingCourse: doc.internshipTrainingCourse,
    startDate: doc.startDate,
    endDate: doc.endDate,
    durationMonths: doc.durationMonths,
    durationDays: doc.durationDays,
    durationText: doc.durationText,
    hrHeadName: doc.hrHeadName,
    hrHeadDesignation: doc.hrHeadDesignation,
    hrHeadSignature: doc.hrHeadSignature,
    managerName: doc.managerName,
    managerDesignation: doc.managerDesignation,
    managerSignature: doc.managerSignature,
    verificationSlug: doc.verificationSlug,
    status: doc.status,
    createdAt: doc.createdAt
  };
}

// POST /api/certificates (admin)
async function createCertificate(req, res) {
  try {
    const picked = pickCertificate(req.body);
    const invalid = validateCommon(picked, false);
    if (invalid) return sendError(res, invalid.status, invalid.message);

    const data = applyAuthorityDefaults(normalizeWrite(picked, null));
    // Unique ID with collision retry
    for (let attempt = 0; attempt < 5; attempt++) {
      data.certificateId = generateCertificateId();
      try {
        const doc = new Certificate(data);
        await doc.save();
        return res.status(201).json({ success: true, message: 'Certificate created successfully', data: doc });
      } catch (saveError) {
        if (saveError && saveError.code === 11000 && attempt < 4) continue;
        throw saveError;
      }
    }
    return sendError(res, 500, 'Could not generate a unique certificate ID, please try again');
  } catch (error) {
    if (error && error.status) return sendError(res, error.status, error.message, error);
    if (error && error.code === 11000) {
      return res.status(409).json({ success: false, message: 'This certificate ID is already in use.' });
    }
    if (error && error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: 'Validation failed', error: errDetail(error) });
    }
    return sendError(res, 400, 'Error creating certificate', error);
  }
}

// GET /api/certificates?search=&status=&page=&limit= (admin)
async function getCertificates(req, res) {
  try {
    const page = clampInt(req.query.page, 1, 1, 1000);
    const limit = clampInt(req.query.limit, 20, 1, 50);
    const filter = {};

    if (req.query.status === 'valid' || req.query.status === 'revoked') {
      filter.status = req.query.status;
    }

    if (req.query.search && String(req.query.search).trim() !== '') {
      const q = String(req.query.search).trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(q, 'i');
      filter.$or = [
        { firstName: rx }, { lastName: rx }, { certificateId: rx },
        { email: rx }, { college: rx }, { course: rx }
      ];
    }

    const total = await Certificate.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const items = await Certificate.find(filter)
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
    return sendError(res, 500, 'Error fetching certificates', error);
  }
}

// GET /api/certificates/:certificateId (admin)
async function getCertificateById(req, res) {
  try {
    const id = String(req.params.certificateId || '').trim().toUpperCase();
    const doc = await Certificate.findOne({ certificateId: id });
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Certificate not found' });
    }
    return res.json({ success: true, data: doc });
  } catch (error) {
    return sendError(res, 500, 'Error fetching certificate', error);
  }
}

// PUT /api/certificates/:certificateId (admin)
async function updateCertificate(req, res) {
  try {
    const id = String(req.params.certificateId || '').trim().toUpperCase();
    const existing = await Certificate.findOne({ certificateId: id });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Certificate not found' });
    }
    const picked = pickCertificate(req.body);
    const invalid = validateCommon(picked, true);
    if (invalid) return sendError(res, invalid.status, invalid.message);

    const data = normalizeWrite(picked, existing.toObject());
    delete data.certificateId;
    const doc = await Certificate.findOneAndUpdate(
      { certificateId: id },
      data,
      { new: true, runValidators: true }
    );
    return res.json({ success: true, message: 'Certificate updated successfully', data: doc });
  } catch (error) {
    if (error && error.status) return sendError(res, error.status, error.message, error);
    if (error && error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: 'Validation failed', error: errDetail(error) });
    }
    return sendError(res, 400, 'Error updating certificate', error);
  }
}

// DELETE /api/certificates/:certificateId (admin)
async function deleteCertificate(req, res) {
  try {
    const id = String(req.params.certificateId || '').trim().toUpperCase();
    const doc = await Certificate.findOneAndDelete({ certificateId: id });
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Certificate not found' });
    }
    return res.json({ success: true, message: 'Certificate deleted successfully' });
  } catch (error) {
    return sendError(res, 500, 'Error deleting certificate', error);
  }
}

// PATCH /api/certificates/:certificateId/revoke (admin) — body { status: 'revoked' | 'valid' }
async function setCertificateStatus(req, res) {
  try {
    const id = String(req.params.certificateId || '').trim().toUpperCase();
    const status = req.body && req.body.status;
    if (status !== 'valid' && status !== 'revoked') {
      return res.status(400).json({ success: false, message: 'Status must be valid or revoked' });
    }
    const doc = await Certificate.findOneAndUpdate(
      { certificateId: id },
      { status },
      { new: true, runValidators: true }
    );
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Certificate not found' });
    }
    return res.json({ success: true, message: `Certificate ${status === 'revoked' ? 'revoked' : 'restored'} successfully`, data: doc });
  } catch (error) {
    return sendError(res, 500, 'Error updating certificate status', error);
  }
}

// GET /api/certificates/verify/:certificateId (PUBLIC — no auth)
async function verifyCertificate(req, res) {
  try {
    const id = String(req.params.certificateId || '').trim().toUpperCase();
    if (!id) {
      return res.status(400).json({ success: false, message: 'Certificate ID is required' });
    }
    const doc = await Certificate.findOne({ certificateId: id }).lean();
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Certificate Not Found. We could not verify this certificate. Please check the Certificate ID and try again.' });
    }
    if (doc.status === 'revoked') {
      return res.status(410).json({ success: false, revoked: true, message: 'This certificate has been revoked and is no longer considered valid.' });
    }
    return res.json({ success: true, verified: true, data: publicView(doc) });
  } catch (error) {
    return sendError(res, 500, 'Unable to verify certificate. Please try again later.', error);
  }
}

module.exports = {
  createCertificate,
  getCertificates,
  getCertificateById,
  updateCertificate,
  deleteCertificate,
  setCertificateStatus,
  verifyCertificate
};
