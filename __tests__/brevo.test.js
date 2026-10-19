const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  sendTransactionalEmail,
  isBrevoConfigured,
  apiKeyProblem,
  EmailConfigError,
  EmailSendError,
  BREVO_ENDPOINT,
  MAX_ATTEMPTS
} = require('../utils/brevo');

const ORIGINAL_FETCH = global.fetch;

// Minimal Response stand-in — the client only reads ok, status and json().
function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  };
}

const MESSAGE = {
  to: 'visitor@example.com',
  toName: 'Visitor Name',
  subject: 'Hello there',
  html: '<p>Hi</p>',
  text: 'Hi'
};

beforeEach(() => {
  process.env.BREVO_API_KEY = 'test-api-key';
  process.env.BREVO_SENDER_EMAIL = 'admin@sosapient.in';
  process.env.BREVO_SENDER_NAME = 'SoSapient';
  delete process.env.BREVO_TIMEOUT_MS;
});

afterEach(() => {
  delete process.env.BREVO_API_KEY;
  delete process.env.BREVO_SENDER_EMAIL;
  delete process.env.BREVO_SENDER_NAME;
  delete process.env.BREVO_TIMEOUT_MS;
  global.fetch = ORIGINAL_FETCH;
});

// --- configuration ---------------------------------------------------------

test('isBrevoConfigured needs both an API key and a usable sender address', () => {
  assert.equal(isBrevoConfigured(), true);

  process.env.BREVO_API_KEY = '';
  assert.equal(isBrevoConfigured(), false);

  process.env.BREVO_API_KEY = 'test-api-key';
  process.env.BREVO_SENDER_EMAIL = 'not-an-address';
  assert.equal(isBrevoConfigured(), false);
});

test('isBrevoConfigured can judge a flow-specific sender', () => {
  assert.equal(isBrevoConfigured({ email: 'hrd@sosapient.in' }), true);
  assert.equal(isBrevoConfigured({ email: '' }), false);
  assert.equal(isBrevoConfigured({ email: 'not-an-address' }), false);
});

test('apiKeyProblem reports missing, smtp-key, or nothing', () => {
  delete process.env.BREVO_API_KEY;
  assert.equal(apiKeyProblem(), 'missing');

  process.env.BREVO_API_KEY = 'xkeysib-' + 'a'.repeat(64) + '-' + 'b'.repeat(16);
  assert.equal(apiKeyProblem(), '');

  process.env.BREVO_API_KEY = 'something-else-entirely';
  assert.equal(apiKeyProblem(), '', 'unknown formats are left for Brevo to judge');
});

test('an SMTP key is rejected as the wrong kind of credential', async () => {
  // Real SMTP keys start with xsmtpsib- and only work on the SMTP relay. Brevo
  // answers the HTTP API with a bare "unauthorized", so we name the problem
  // ourselves instead of spending a round trip on a credential that cannot work.
  process.env.BREVO_API_KEY = 'xsmtpsib-' + 'a'.repeat(64) + '-' + 'b'.repeat(16);

  assert.equal(apiKeyProblem(), 'smtp-key');
  assert.equal(isBrevoConfigured(), false);

  let called = false;
  global.fetch = async () => {
    called = true;
    return jsonResponse(201, {});
  };

  await assert.rejects(
    () => sendTransactionalEmail(MESSAGE),
    (err) =>
      err instanceof EmailConfigError && err.code === 'smtp-key-not-api-key' && err.status === 503
  );
  assert.equal(called, false, 'must not waste a round trip on a known-bad credential');
});

test('sendTransactionalEmail fails closed when Brevo is not configured', async () => {
  delete process.env.BREVO_API_KEY;
  let called = false;
  global.fetch = async () => {
    called = true;
    return jsonResponse(201, {});
  };

  await assert.rejects(
    () => sendTransactionalEmail(MESSAGE),
    (err) => err instanceof EmailConfigError && err.status === 503 && err.code === 'not-configured'
  );
  assert.equal(called, false, 'must not call Brevo without configuration');
});

// --- validation ------------------------------------------------------------

test('sendTransactionalEmail rejects an undeliverable recipient without calling Brevo', async () => {
  let called = false;
  global.fetch = async () => {
    called = true;
    return jsonResponse(201, {});
  };

  await assert.rejects(
    () => sendTransactionalEmail({ ...MESSAGE, to: 'nope' }),
    (err) => err instanceof EmailSendError && err.code === 'invalid-recipient' && err.retryable === false
  );
  assert.equal(called, false);
});

// --- happy path ------------------------------------------------------------

test('sendTransactionalEmail posts the message to Brevo and returns its id', async () => {
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse(201, { messageId: 'abc-123' });
  };

  const result = await sendTransactionalEmail(MESSAGE);

  assert.equal(result.messageId, 'abc-123');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, BREVO_ENDPOINT);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['api-key'], 'test-api-key');

  const payload = JSON.parse(calls[0].init.body);
  assert.deepEqual(payload.sender, { email: 'admin@sosapient.in', name: 'SoSapient' });
  assert.deepEqual(payload.to, [{ email: 'visitor@example.com', name: 'Visitor Name' }]);
  assert.equal(payload.subject, 'Hello there');
  assert.equal(payload.htmlContent, '<p>Hi</p>');
  assert.equal(payload.textContent, 'Hi');
});

test('a message can carry its own sender without changing the default', async () => {
  const bodies = [];
  global.fetch = async (url, init) => {
    bodies.push(JSON.parse(init.body));
    return jsonResponse(201, { messageId: 'x' });
  };

  await sendTransactionalEmail({ ...MESSAGE, sender: { email: 'hrd@sosapient.in' } });
  await sendTransactionalEmail(MESSAGE);

  assert.deepEqual(bodies[0].sender, { email: 'hrd@sosapient.in', name: 'SoSapient' });
  assert.deepEqual(bodies[1].sender, { email: 'admin@sosapient.in', name: 'SoSapient' });
});

test('an unusable per-message sender fails before the network is touched', async () => {
  let called = false;
  global.fetch = async () => {
    called = true;
    return jsonResponse(201, {});
  };

  for (const sender of [{ email: '' }, { email: 'not-an-address' }]) {
    await assert.rejects(
      () => sendTransactionalEmail({ ...MESSAGE, sender }),
      (err) =>
        err instanceof EmailConfigError && err.status === 503 && err.code === 'sender-not-configured'
    );
  }

  assert.equal(called, false, 'a broken sender must not spend a round trip');
});

test('sendTransactionalEmail sets reply-to only from an already-valid address', async () => {
  const bodies = [];
  global.fetch = async (url, init) => {
    bodies.push(JSON.parse(init.body));
    return jsonResponse(201, { messageId: 'x' });
  };

  await sendTransactionalEmail({ ...MESSAGE, replyTo: 'visitor@example.com' });
  await sendTransactionalEmail({ ...MESSAGE, replyTo: 'not-an-address' });

  assert.deepEqual(bodies[0].replyTo, { email: 'visitor@example.com' });
  assert.equal(bodies[1].replyTo, undefined, 'invalid reply-to must be dropped, not sent');
});

// --- retry behaviour -------------------------------------------------------

test('sendTransactionalEmail retries a 429 and succeeds', async () => {
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return calls === 1
      ? jsonResponse(429, { code: 'too_many_requests' })
      : jsonResponse(201, { messageId: 'ok' });
  };

  const result = await sendTransactionalEmail(MESSAGE);

  assert.equal(result.messageId, 'ok');
  assert.equal(calls, 2);
});

test('sendTransactionalEmail gives up after the retry budget on server errors', async () => {
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return jsonResponse(500, { code: 'server_error' });
  };

  await assert.rejects(
    () => sendTransactionalEmail(MESSAGE),
    (err) => err instanceof EmailSendError && err.code === 'server_error' && err.retryable === true
  );
  assert.equal(calls, MAX_ATTEMPTS);
});

test('sendTransactionalEmail does not retry a permanent 4xx rejection', async () => {
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return jsonResponse(400, { code: 'invalid_parameter' });
  };

  await assert.rejects(
    () => sendTransactionalEmail(MESSAGE),
    (err) => err instanceof EmailSendError && err.code === 'invalid_parameter' && err.retryable === false
  );
  assert.equal(calls, 1, 'a permanent rejection must be attempted exactly once');
});

test('sendTransactionalEmail retries network and timeout failures', async () => {
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    const error = new Error('aborted');
    error.name = 'AbortError';
    throw error;
  };

  await assert.rejects(
    () => sendTransactionalEmail(MESSAGE),
    (err) => err instanceof EmailSendError && err.code === 'timeout'
  );
  assert.equal(calls, MAX_ATTEMPTS);
});

test('a failed send never leaks the API key or provider text', async () => {
  process.env.BREVO_API_KEY = 'super-secret-key';
  global.fetch = async () => jsonResponse(500, { code: 'server_error', message: 'internal detail' });

  await assert.rejects(
    () => sendTransactionalEmail(MESSAGE),
    (err) => {
      assert.equal(String(err.message).includes('super-secret-key'), false);
      assert.equal(String(err.message).includes('internal detail'), false);
      return true;
    }
  );
});
