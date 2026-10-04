const crypto = require('crypto');
const { buildSlug } = require('./slug');

// Central certificate authority configuration (mirrors frontend src/config/certificate.ts).
const CONFIG = {
  hrHeadName: 'Ritu Chouhan',
  hrHeadDesignation: 'HR HEAD',
  hrHeadSignature: '',
  managerName: 'Prakash Bankhede',
  managerDesignation: 'Manager',
  managerSignature: ''
};

// Unambiguous alphabet (no 0/O, 1/I/L) for readable IDs.
const ID_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateCertificateId() {
  // NOTE: Buffer.map returns a Buffer (bytes), so spread to an array first —
  // otherwise character results coerce to 0 and every ID looks like SS000000.
  const rand = [...crypto.randomBytes(8)]
    .map((b) => ID_ALPHABET[b % ID_ALPHABET.length])
    .join('');
  return `SS${rand}`;
}

// Duration calculation: full calendar months + leftover days.
//   02 Oct 2026 -> 25 Dec 2026 = 2 Months 23 Days
//   02 Oct 2026 -> 02 Jan 2027 = 3 Months
//   02 Oct 2026 -> 03 Oct 2026 = 1 Day
// End date must be strictly after the start date. Zero units are omitted
// from the display text ("1 Day", not "0 Months 1 Day").
function calcDuration(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
    throw { status: 400, message: 'Start date and end date must be valid dates' };
  }
  if (!(e > s)) {
    throw { status: 400, message: 'End date must be after the start date.' };
  }
  let months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  const anchor = new Date(s);
  anchor.setMonth(anchor.getMonth() + months);
  if (anchor > e) {
    months -= 1;
    anchor.setMonth(anchor.getMonth() - 1);
  }
  const days = Math.round((e - anchor) / 86400000);
  return { months, days };
}

// Backwards-compatible helper (months only).
function calcDurationMonths(start, end) {
  return calcDuration(start, end).months;
}

function unitText(value, singular, plural) {
  return value === 1 ? `1 ${singular}` : `${value} ${plural}`;
}

function durationText(months, days) {
  if (typeof months === 'object' && months !== null) {
    days = months.days;
    months = months.months;
  }
  const parts = [];
  if (months > 0) parts.push(unitText(months, 'Month', 'Months'));
  if (days > 0) parts.push(unitText(days, 'Day', 'Days'));
  return parts.length > 0 ? parts.join(' ') : '1 Day';
}

function candidateSlug(firstName, lastName) {
  return buildSlug(`${firstName || ''} ${lastName || ''}`) || 'candidate';
}

function isValidMobile(value) {
  const v = String(value || '').trim().replace(/[\s-]/g, '');
  if (/^\+[1-9]\d{7,14}$/.test(v)) return true;
  if (/^[6-9]\d{9}$/.test(v)) return true;
  return false;
}

function isValidUrl(value) {
  if (!value) return true;
  try {
    const u = new URL(String(value).trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

module.exports = {
  CONFIG,
  generateCertificateId,
  calcDuration,
  calcDurationMonths,
  durationText,
  candidateSlug,
  isValidMobile,
  isValidUrl
};
