const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const ImageAsset = require('../models/imageAsset.model');
const { getImageById } = require('../controllers/image.controller');

const ORIGINAL_FIND = ImageAsset.findById;

beforeEach(() => {
  ImageAsset.findById = ORIGINAL_FIND;
});

afterEach(() => {
  ImageAsset.findById = ORIGINAL_FIND;
});

function fakeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    set(key, value) {
      this.headers[key] = value;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    }
  };
}

// The controller chains .select() onto findById, so the stub returns the chain.
function stubFind(asset) {
  ImageAsset.findById = () => ({ select: async () => asset });
}

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

test('getImageById rejects a malformed id without querying', async () => {
  let queried = false;
  ImageAsset.findById = () => {
    queried = true;
    return { select: async () => null };
  };

  const res = fakeRes();
  await getImageById({ params: { id: 'not-an-object-id' } }, res);

  assert.equal(res.statusCode, 404);
  assert.equal(queried, false);
});

test('getImageById returns 404 for a missing asset', async () => {
  stubFind(null);

  const res = fakeRes();
  await getImageById({ params: { id: String(new mongoose.Types.ObjectId()) } }, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.success, false);
});

test('getImageById serves the bytes with long-lived cross-origin caching', async () => {
  stubFind({ data: PNG, contentType: 'image/png' });

  const res = fakeRes();
  await getImageById({ params: { id: String(new mongoose.Types.ObjectId()) } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, PNG);
  assert.equal(res.headers['Content-Type'], 'image/png');
  assert.equal(res.headers['Content-Length'], String(PNG.length));
  assert.equal(res.headers['Cross-Origin-Resource-Policy'], 'cross-origin');
  assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
  assert.match(res.headers['Cache-Control'], /immutable/);
});

test('getImageById falls back to a safe content type', async () => {
  stubFind({ data: PNG, contentType: '' });

  const res = fakeRes();
  await getImageById({ params: { id: String(new mongoose.Types.ObjectId()) } }, res);

  assert.equal(res.headers['Content-Type'], 'application/octet-stream');
});

test('getImageById returns 500 when the lookup fails', async () => {
  ImageAsset.findById = () => ({
    select: async () => {
      throw new Error('MongoServerSelectionError');
    }
  });

  const res = fakeRes();
  await getImageById({ params: { id: String(new mongoose.Types.ObjectId()) } }, res);

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.success, false);
});
