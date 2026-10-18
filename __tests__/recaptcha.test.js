const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { verifyRecaptchaToken, isRecaptchaConfigured } = require('../utils/recaptcha');
const { verifyRecaptcha } = require('../middleware/recaptcha');

const ENV_SECRET = process.env.RECAPTCHA_SECRET_KEY;
const ENV_HOSTS = process.env.RECAPTCHA_ALLOWED_HOSTNAMES;
const ORIGINAL_FETCH = global.fetch;

beforeEach(() => {
  process.env.RECAPTCHA_SECRET_KEY = 'test-secret';
  process.env.RECAPTCHA_ALLOWED_HOSTNAMES = 'sosapient.in,www.sosapient.in,localhost';
  global.fetch = ORIGINAL_FETCH;
});

afterEach(() => {
  if (ENV_SECRET === undefined) delete process.env.RECAPTCHA_SECRET_KEY;
  else process.env.RECAPTCHA_SECRET_KEY = ENV_SECRET;
  if (ENV_HOSTS === undefined) delete process.env.RECAPTCHA_ALLOWED_HOSTNAMES;
  else process.env.RECAPTCHA_ALLOWED_HOSTNAMES = ENV_HOSTS;
  global.fetch = ORIGINAL_FETCH;
});

// --- helpers ---------------------------------------------------------------

function jsonResponse(payload, ok = true) {
  return { ok, json: async () => payload };
}

function withFetch(impl) {
  global.fetch = impl;
}

function fakeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function fakeReq(body, ip = '203.0.113.7') {
  return { body, ip, socket: { remoteAddress: ip } };
}

// --- service: configuration / input ---------------------------------------

test('verifyRecaptchaToken fails closed when secret is not configured', async () => {
  process.env.RECAPTCHA_SECRET_KEY = '';
  assert.equal(isRecaptchaConfigured(), false);
  let called = false;
  withFetch(async () => {
    called = true;
    return jsonResponse({ success: true, hostname: 'sosapient.in' });
  });
  const result = await verifyRecaptchaToken('token');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'secret-missing');
  assert.equal(called, false, 'must not call Google when unconfigured');
});

test('verifyRecaptchaToken rejects a missing token without calling Google', async () => {
  let called = false;
  withFetch(async () => {
    called = true;
    return jsonResponse({ success: true, hostname: 'sosapient.in' });
  });
  const result = await verifyRecaptchaToken('');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing');
  assert.equal(called, false);
});

// --- service: verification outcomes ----------------------------------------

test('verifyRecaptchaToken accepts a valid response on an allowed hostname', async () => {
  withFetch(async () => jsonResponse({ success: true, hostname: 'sosapient.in' }));
  const result = await verifyRecaptchaToken('good-token', '203.0.113.7');
  assert.deepEqual(result, { ok: true, reason: 'ok' });
});

test('verifyRecaptchaToken sends the secret and token in the request body', async () => {
  let captured;
  withFetch(async (url, options) => {
    captured = { url, options };
    return jsonResponse({ success: true, hostname: 'sosapient.in' });
  });
  await verifyRecaptchaToken('abc123', '203.0.113.7');

  assert.equal(captured.url, 'https://www.google.com/recaptcha/api/siteverify');
  assert.equal(captured.options.method, 'POST');
  const params = new URLSearchParams(captured.options.body);
  assert.equal(params.get('secret'), 'test-secret');
  assert.equal(params.get('response'), 'abc123');
  assert.equal(params.get('remoteip'), '203.0.113.7');
});

test('verifyRecaptchaToken rejects a success response from an unexpected hostname', async () => {
  withFetch(async () => jsonResponse({ success: true, hostname: 'evil.example.com' }));
  const result = await verifyRecaptchaToken('token');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'hostname-mismatch');
});

test('verifyRecaptchaToken maps invalid-input-response to rejected', async () => {
  withFetch(async () => jsonResponse({ success: false, 'error-codes': ['invalid-input-response'] }));
  const result = await verifyRecaptchaToken('token');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'rejected');
});

test('verifyRecaptchaToken flags reused/expired tokens', async () => {
  withFetch(async () => jsonResponse({ success: false, 'error-codes': ['timeout-or-duplicate'] }));
  const result = await verifyRecaptchaToken('token');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'expired-or-duplicate');
});

test('verifyRecaptchaToken reports Google-side secret problems', async () => {
  withFetch(async () => jsonResponse({ success: false, 'error-codes': ['invalid-input-secret'] }));
  const result = await verifyRecaptchaToken('token');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'secret-missing');
});

test('verifyRecaptchaToken fails closed on a network error', async () => {
  withFetch(async () => {
    throw new Error('network down');
  });
  const result = await verifyRecaptchaToken('token');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unavailable');
});

test('verifyRecaptchaToken fails closed on a non-2xx HTTP response', async () => {
  withFetch(async () => jsonResponse({ success: true, hostname: 'sosapient.in' }, false));
  const result = await verifyRecaptchaToken('token');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unavailable');
});

test('verifyRecaptchaToken fails closed on a malformed JSON body', async () => {
  withFetch(async () => ({
    ok: true,
    json: async () => {
      throw new Error('bad json');
    },
  }));
  const result = await verifyRecaptchaToken('token');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'malformed');
});

// --- middleware: HTTP contract ---------------------------------------------

test('middleware returns 500 when the secret is not configured (no bypass)', async () => {
  process.env.RECAPTCHA_SECRET_KEY = '';
  const res = fakeRes();
  let nextCalled = false;
  await verifyRecaptcha(fakeReq({ recaptchaToken: 'token' }), res, () => {
    nextCalled = true;
  });
  assert.equal(res.statusCode, 500);
  assert.equal(nextCalled, false);
});

test('middleware returns 400 when the token is missing', async () => {
  const res = fakeRes();
  let nextCalled = false;
  await verifyRecaptcha(fakeReq({}), res, () => {
    nextCalled = true;
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.equal(nextCalled, false);
});

test('middleware calls next() and writes nothing on successful verification', async () => {
  withFetch(async () => jsonResponse({ success: true, hostname: 'sosapient.in' }));
  const res = fakeRes();
  let nextCalled = false;
  await verifyRecaptcha(fakeReq({ recaptchaToken: 'token' }), res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, undefined);
});

test('middleware accepts the standard g-recaptcha-response field', async () => {
  withFetch(async () => jsonResponse({ success: true, hostname: 'sosapient.in' }));
  const res = fakeRes();
  let nextCalled = false;
  await verifyRecaptcha(fakeReq({ 'g-recaptcha-response': 'token' }), res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});

test('middleware returns 403 with captchaExpired on a reused token', async () => {
  withFetch(async () => jsonResponse({ success: false, 'error-codes': ['timeout-or-duplicate'] }));
  const res = fakeRes();
  let nextCalled = false;
  await verifyRecaptcha(fakeReq({ recaptchaToken: 'token' }), res, () => {
    nextCalled = true;
  });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.captchaExpired, true);
  assert.equal(nextCalled, false);
});

test('middleware returns 503 when Google is unavailable (fail closed)', async () => {
  withFetch(async () => {
    throw new Error('timeout');
  });
  const res = fakeRes();
  let nextCalled = false;
  await verifyRecaptcha(fakeReq({ recaptchaToken: 'token' }), res, () => {
    nextCalled = true;
  });
  assert.equal(res.statusCode, 503);
  assert.equal(nextCalled, false);
});

test('middleware returns 403 when Google rejects the token', async () => {
  withFetch(async () => jsonResponse({ success: false, 'error-codes': ['invalid-input-response'] }));
  const res = fakeRes();
  let nextCalled = false;
  await verifyRecaptcha(fakeReq({ recaptchaToken: 'token' }), res, () => {
    nextCalled = true;
  });
  assert.equal(res.statusCode, 403);
  assert.equal(nextCalled, false);
});
