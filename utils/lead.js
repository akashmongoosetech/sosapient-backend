const { LEAD_STATUSES } = require('../models/lead.model');

// Fields accepted from clients/imports. Everything else is dropped.
const LEAD_FIELDS = [
  'title',
  'categoryName',
  'address',
  'city',
  'website',
  'phone',
  'phoneUnformatted',
  'status',
];

const MAX_LENGTHS = {
  title: 200,
  categoryName: 160,
  address: 500,
  city: 100,
  website: 500,
  phone: 40,
  phoneUnformatted: 40,
};

function asText(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function collapseWhitespace(value) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Digits-only comparison key. Meaningful when >= 7 digits.
function normalizePhone(value) {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '');
  // Strip common trunk prefix artifacts conservatively: keep full digits.
  return digits.length >= 7 ? digits : '';
}

// Lowercase host + path without protocol/www/trailing slash for comparison.
function normalizeWebsite(value) {
  if (!value) return '';
  let v = String(value).trim().toLowerCase();
  if (!v) return '';
  v = v.replace(/^(https?:\/\/)?(www\.)?/, '');
  v = v.replace(/\/+$/, '');
  if (!v || v.length > 500 || /[\s<>"]/.test(v)) return '';
  return v;
}

function normalizeText(value) {
  return collapseWhitespace(value).toLowerCase();
}

function isValidWebsite(value) {
  if (!value) return true;
  try {
    const u = new URL(String(value).trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// Normalized identity keys for one record (display values untouched).
function buildKeys(record) {
  const phoneKey = normalizePhone(record.phoneUnformatted || record.phone);
  const websiteKey = normalizeWebsite(record.website);
  const title = normalizeText(record.title);
  const city = normalizeText(record.city);
  const titleCityKey = title && city ? `${title}|||${city}` : '';
  return { phoneKey, websiteKey, titleCityKey };
}

function hasContact(record, kind) {
  if (kind === 'mobile') {
    return Boolean(normalizePhone(record.phoneUnformatted || record.phone));
  }
  if (kind === 'website') {
    return Boolean(normalizeWebsite(record.website));
  }
  return false;
}

// Pick only supported fields, sanitize types/lengths. Never stores raw input.
function pickLead(input) {
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const out = {};
  for (const key of LEAD_FIELDS) {
    if (src[key] === undefined || src[key] === null) continue;
    if (key === 'status') {
      if (typeof src[key] === 'string' && LEAD_STATUSES.includes(src[key].trim())) {
        out.status = src[key].trim();
      }
      continue;
    }
    const text = collapseWhitespace(asText(src[key])).slice(0, MAX_LENGTHS[key]);
    out[key] = text;
  }
  return out;
}

// Validation for manual create/update. Imports are lenient (see import flow).
// Returns error message string or null.
function validateLead(data, { requireIdentity = true } = {}) {
  if (data.status !== undefined && !LEAD_STATUSES.includes(data.status)) {
    return 'Status must be one of: New, Message, WhatsApp, Call, Converted';
  }
  if (data.website !== undefined && data.website !== '' && !isValidWebsite(data.website)) {
    return 'Website must be a valid http(s) URL';
  }
  if (requireIdentity) {
    const hasTitle = Boolean(data.title && data.title.trim());
    const hasPhone =
      Boolean(data.phone && data.phone.trim()) ||
      Boolean(data.phoneUnformatted && data.phoneUnformatted.trim());
    const hasWebsite = Boolean(data.website && data.website.trim());
    if (!hasTitle && !hasPhone && !hasWebsite) {
      return 'Provide at least a title, phone number or website';
    }
  }
  return null;
}

module.exports = {
  LEAD_FIELDS,
  LEAD_STATUSES,
  asText,
  collapseWhitespace,
  normalizePhone,
  normalizeWebsite,
  normalizeText,
  isValidWebsite,
  buildKeys,
  hasContact,
  pickLead,
  validateLead,
};
