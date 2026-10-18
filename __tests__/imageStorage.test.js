const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const mongoose = require('mongoose');

const ImageAsset = require('../models/imageAsset.model');
const {
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
} = require('../services/imageStorage');

const ORIGINAL_CREATE = ImageAsset.create;
const ORIGINAL_DELETE = ImageAsset.findByIdAndDelete;

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

beforeEach(() => {
  ImageAsset.create = ORIGINAL_CREATE;
  ImageAsset.findByIdAndDelete = ORIGINAL_DELETE;
});

afterEach(() => {
  ImageAsset.create = ORIGINAL_CREATE;
  ImageAsset.findByIdAndDelete = ORIGINAL_DELETE;
});

// Stub the model's persistence so these tests never touch a database.
function stubCreate(impl) {
  ImageAsset.create = impl;
}

// --- helpers ---------------------------------------------------------------

test('imageUrlForId builds a relative API path', () => {
  assert.equal(imageUrlForId('abc123'), '/api/images/abc123');
});

test('isStoredImageUrl only matches stored asset paths', () => {
  assert.equal(isStoredImageUrl(`/api/images/${new mongoose.Types.ObjectId()}`), true);
  assert.equal(isStoredImageUrl('/api/images/not-an-id'), false);
  assert.equal(isStoredImageUrl('/uploads/blog-images/a.png'), false);
  assert.equal(isStoredImageUrl('https://example.com/a.png'), false);
  assert.equal(isStoredImageUrl(undefined), false);
});

test('isLocalUploadPath only matches site-relative upload paths', () => {
  assert.equal(isLocalUploadPath('/uploads/blog-images/a.png'), true);
  assert.equal(isLocalUploadPath('/api/images/abc'), false);
  assert.equal(isLocalUploadPath('/images/a.png'), false);
  assert.equal(isLocalUploadPath(undefined), false);
});

test('isDataImageUrl only matches base64 image data URLs', () => {
  assert.equal(isDataImageUrl('data:image/png;base64,AAAA'), true);
  assert.equal(isDataImageUrl('data:text/html;base64,AAAA'), false);
  assert.equal(isDataImageUrl('https://x/y.png'), false);
});

test('decodeDataImageUrl round-trips the bytes and MIME type', () => {
  const decoded = decodeDataImageUrl(`data:image/png;base64,${PNG.toString('base64')}`);
  assert.equal(decoded.mimeType, 'image/png');
  assert.deepEqual(decoded.buffer, PNG);
});

test('decodeDataImageUrl rejects malformed input', () => {
  assert.equal(decodeDataImageUrl('data:image/png;base64,!!!'), null);
  assert.equal(decodeDataImageUrl('data:image/png;base64,'), null);
  assert.equal(decodeDataImageUrl('https://x/y.png'), null);
});

test('localPathForUploadUrl refuses to escape the uploads directory', () => {
  const ok = localPathForUploadUrl('/uploads/blog-images/a.png');
  assert.ok(ok && ok.startsWith(path.join(__dirname, '..', 'uploads')));
  assert.equal(localPathForUploadUrl('/uploads/../../etc/passwd'), null);
  assert.equal(localPathForUploadUrl('https://x/y.png'), null);
});

test('normalizeContentType trusts the MIME type, then the extension', () => {
  assert.equal(normalizeContentType('image/png', 'x.php'), 'image/png');
  assert.equal(normalizeContentType('image/jpg', 'x.jpg'), 'image/jpeg');
  assert.equal(normalizeContentType('', 'photo.WEBP'), 'image/webp');
  assert.equal(normalizeContentType('', 'photo.jpeg'), 'image/jpeg');
  assert.equal(normalizeContentType('application/zip', 'payload.zip'), 'application/octet-stream');
  assert.equal(normalizeContentType('', 'noext'), 'application/octet-stream');
});

// --- validation ------------------------------------------------------------

test('storeImage rejects an empty or non-buffer payload', async () => {
  await assert.rejects(
    () => storeImage(Buffer.alloc(0)),
    (err) => err instanceof ImageStorageError && err.status === 400
  );
  await assert.rejects(
    () => storeImage('not-a-buffer'),
    (err) => err instanceof ImageStorageError && err.status === 400
  );
});

test('storeImage rejects an oversized payload before touching the database', async () => {
  let called = false;
  stubCreate(async () => {
    called = true;
    return { _id: new mongoose.Types.ObjectId() };
  });

  await assert.rejects(
    () => storeImage(Buffer.alloc(MAX_IMAGE_BYTES + 1)),
    (err) => err instanceof ImageStorageError && err.status === 413
  );
  assert.equal(called, false);
});

// --- persistence -----------------------------------------------------------

test('storeImage saves the bytes and returns a servable URL', async () => {
  const id = new mongoose.Types.ObjectId();
  let saved;
  stubCreate(async (doc) => {
    saved = doc;
    return { _id: id };
  });

  const result = await storeImage(PNG, { mimeType: 'image/png', folder: 'blog-images' });

  assert.equal(result.provider, 'mongo');
  assert.equal(result.url, `/api/images/${id}`);
  assert.equal(result.fileId, String(id));
  assert.deepEqual(saved.data, PNG);
  assert.equal(saved.contentType, 'image/png');
  assert.equal(saved.size, PNG.length);
  assert.equal(saved.folder, 'blog-images');
});

test('storeImage defaults the folder when none is given', async () => {
  let saved;
  stubCreate(async (doc) => {
    saved = doc;
    return { _id: new mongoose.Types.ObjectId() };
  });

  await storeImage(PNG, { mimeType: 'image/png' });
  assert.equal(saved.folder, 'misc');
});

test('storeImage surfaces a storage failure as temporarily unavailable', async () => {
  stubCreate(async () => {
    throw new Error('MongoServerSelectionError: connection refused');
  });

  await assert.rejects(
    () => storeImage(PNG, { mimeType: 'image/png' }),
    (err) => err instanceof ImageStorageError && err.status === 503 && !/MongoServerSelection/.test(err.message)
  );
});

test('deleteStoredImage ignores a missing or malformed id', async () => {
  let called = false;
  ImageAsset.findByIdAndDelete = async () => {
    called = true;
    return null;
  };

  assert.equal(await deleteStoredImage(null), false);
  assert.equal(await deleteStoredImage(''), false);
  assert.equal(await deleteStoredImage('not-an-object-id'), false);
  assert.equal(called, false);
});

test('deleteStoredImage removes a valid asset', async () => {
  let deleted = null;
  ImageAsset.findByIdAndDelete = async (id) => {
    deleted = id;
    return { _id: id };
  };

  const id = String(new mongoose.Types.ObjectId());
  assert.equal(await deleteStoredImage(id), true);
  assert.equal(deleted, id);
});

test('deleteStoredImage never throws when the database fails', async () => {
  ImageAsset.findByIdAndDelete = async () => {
    throw new Error('boom');
  };
  assert.equal(await deleteStoredImage(String(new mongoose.Types.ObjectId())), false);
});
