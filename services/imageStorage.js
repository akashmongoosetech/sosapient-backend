// Durable storage for user-uploaded images (blog featured images, comment avatars).
//
// Why this exists: uploads used to be written to the app server's local disk and
// only a relative "/uploads/..." path was persisted. On hosts with an ephemeral
// filesystem (Render, Heroku, most container platforms) every deploy/restart
// wipes those files while the database keeps pointing at them, so the images
// 404 forever.
//
// Images are now stored as documents in MongoDB and served back by the API, so
// they live in the same durable place as the records that reference them. No
// external service and no server disk involved.

const path = require('path');
const mongoose = require('mongoose');
const ImageAsset = require('../models/imageAsset.model');

const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
};
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

class ImageStorageError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = 'ImageStorageError';
    this.status = status;
  }
}

// URL for a stored asset. Deliberately relative: it resolves correctly on any
// origin (localhost, staging, production) via the frontend's API base URL.
function imageUrlForId(id) {
  return `/api/images/${id}`;
}

function isStoredImageUrl(value) {
  return typeof value === 'string' && /^\/api\/images\/[0-9a-f]{24}$/i.test(value);
}

function isLocalUploadPath(value) {
  return typeof value === 'string' && value.startsWith('/uploads/');
}

function isDataImageUrl(value) {
  return typeof value === 'string' && /^data:image\/[a-z0-9.+-]+;base64,/i.test(value);
}

// Decode a `data:image/*;base64,...` URL. Returns null when malformed.
function decodeDataImageUrl(value) {
  if (!isDataImageUrl(value)) return null;
  const match = String(value).match(/^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) return null;
  try {
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length === 0) return null;
    return { buffer, mimeType: match[1].toLowerCase() };
  } catch {
    return null;
  }
}

// Map a persisted "/uploads/..." path to an absolute path on this server.
function localPathForUploadUrl(value) {
  if (!isLocalUploadPath(value)) return null;
  const relative = value.replace(/^\/+/, '');
  const resolved = path.resolve(__dirname, '..', relative);
  const uploadsRoot = path.resolve(__dirname, '..', 'uploads');
  // Guard against traversal in a stored value.
  if (!resolved.startsWith(uploadsRoot)) return null;
  return resolved;
}

// Trust the declared MIME type first, then the file extension, then fall back.
function normalizeContentType(mimeType, originalName) {
  const mime = String(mimeType || '').toLowerCase();
  if (mime === 'image/jpg') return 'image/jpeg';
  if (ALLOWED_MIME.includes(mime)) return mime;
  const ext = String(path.extname(originalName || '')).toLowerCase();
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

/**
 * Persist an uploaded image and return where it now lives.
 *
 * @param {Buffer} buffer Raw image bytes.
 * @param {{ mimeType?: string, originalName?: string, folder?: string }} [opts]
 * @returns {Promise<{url: string, fileId: string, provider: 'mongo'}>}
 * @throws {ImageStorageError} when the image could not be stored.
 */
async function storeImage(buffer, opts = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new ImageStorageError('No image data received.', 400);
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new ImageStorageError('Image is too large.', 413);
  }

  let asset;
  try {
    asset = await ImageAsset.create({
      data: buffer,
      contentType: normalizeContentType(opts.mimeType, opts.originalName),
      size: buffer.length,
      folder: String(opts.folder || 'misc')
    });
  } catch (err) {
    // Do not surface driver internals to the client.
    throw new ImageStorageError('Could not store the image. Please try again.', 503);
  }

  return { url: imageUrlForId(asset._id), fileId: String(asset._id), provider: 'mongo' };
}

// Best-effort removal of a previously stored image. Never throws.
async function deleteStoredImage(fileId) {
  if (!fileId || !mongoose.Types.ObjectId.isValid(String(fileId))) return false;
  try {
    await ImageAsset.findByIdAndDelete(fileId);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  ImageStorageError,
  imageUrlForId,
  isStoredImageUrl,
  isLocalUploadPath,
  isDataImageUrl,
  decodeDataImageUrl,
  localPathForUploadUrl,
  normalizeContentType,
  storeImage,
  deleteStoredImage,
  MAX_IMAGE_BYTES
};
