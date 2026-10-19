// Brevo transactional email client — the only place this app talks to an email
// provider.
//
// Why the HTTP API rather than SMTP: this is a plain Express server, so one
// authenticated POST is much easier to reason about than a pooled SMTP
// connection that needs its own timeouts, reconnects and TLS handling. Brevo
// accepts the same message either way.
//
// Important: a successful call only means Brevo ACCEPTED the message for
// delivery. It does not mean the message reached the recipient's inbox.
// Bounces, spam placement and blocklisting all happen after this returns.

const { fetchWithTimeout } = require('./http');

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [500, 1500];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Raised when Brevo is not configured. Distinct from a send failure so callers
// can tell "we could not even try" apart from "Brevo refused the message".
class EmailConfigError extends Error {
  constructor(message = 'Transactional email is not configured') {
    super(message);
    this.name = 'EmailConfigError';
    this.status = 503;
    this.code = 'not-configured';
  }
}

class EmailSendError extends Error {
  constructor(message, { status = 502, retryable = false, code = 'send-failed' } = {}) {
    super(message);
    this.name = 'EmailSendError';
    this.status = status;
    this.retryable = retryable;
    this.code = code;
  }
}

function senderConfig() {
  const email = String(process.env.BREVO_SENDER_EMAIL || '').trim();
  const name = String(process.env.BREVO_SENDER_NAME || '').trim() || 'SoSapient';
  return { email, name };
}

function isBrevoConfigured() {
  const apiKey = String(process.env.BREVO_API_KEY || '').trim();
  const { email } = senderConfig();
  return apiKey.length > 0 && EMAIL_PATTERN.test(email);
}

// Setup guidance is emitted once, never per request, and never contains the
// key itself or any message content.
let configWarningEmitted = false;
function warnIfNotConfigured() {
  if (isBrevoConfigured() || configWarningEmitted) return;
  configWarningEmitted = true;

  const missing = [];
  if (!String(process.env.BREVO_API_KEY || '').trim()) missing.push('BREVO_API_KEY');
  if (!senderConfig().email) missing.push('BREVO_SENDER_EMAIL');

  console.warn(
    `[email] Brevo is not configured, so transactional email is disabled. ` +
      `Missing: ${missing.join(', ')}. ` +
      `Create an API key at https://app.brevo.com/settings/keys/api, add and verify the ` +
      `sender/domain at https://app.brevo.com/senders, then set BREVO_API_KEY and ` +
      `BREVO_SENDER_EMAIL in the hosting environment.`
  );
}

function timeoutMs() {
  const parsed = parseInt(process.env.BREVO_TIMEOUT_MS, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function sleep(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (timer.unref) timer.unref();
  });
}

// 429 and 5xx (plus our own network/timeout failures) are worth another attempt.
// Every other 4xx is a permanent rejection — a bad recipient, a revoked key or
// a malformed payload — and retrying would only reproduce the same failure.
function isRetryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

async function postOnce(payload, apiKey) {
  let res;
  try {
    res = await fetchWithTimeout(
      BREVO_ENDPOINT,
      {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'content-type': 'application/json',
          accept: 'application/json'
        },
        body: JSON.stringify(payload)
      },
      timeoutMs()
    );
  } catch (error) {
    const timedOut = error && error.name === 'AbortError';
    return { ok: false, retryable: true, status: 0, code: timedOut ? 'timeout' : 'network' };
  }

  if (res.ok) {
    let messageId = '';
    try {
      const body = await res.json();
      messageId = (body && body.messageId) || '';
    } catch {
      // A 2xx with an unreadable body still means Brevo accepted the message.
    }
    return { ok: true, messageId };
  }

  // Read Brevo's error code for diagnostics, but never log or forward the raw
  // provider text (it can echo the payload back).
  let providerCode = '';
  try {
    const body = await res.json();
    providerCode = (body && body.code) || '';
  } catch {
    /* unreadable error body */
  }

  return {
    ok: false,
    status: res.status,
    retryable: isRetryableStatus(res.status),
    code: providerCode || `http-${res.status}`
  };
}

/**
 * Send one transactional email through Brevo.
 *
 * @param {{ to: string, toName?: string, subject: string, html: string,
 *           text?: string, replyTo?: string }} message
 * @returns {Promise<{ messageId: string }>}
 * @throws {EmailConfigError} when Brevo is not configured.
 * @throws {EmailSendError} when Brevo rejects the message or all retries fail.
 */
async function sendTransactionalEmail(message) {
  if (!isBrevoConfigured()) {
    warnIfNotConfigured();
    throw new EmailConfigError();
  }

  const to = String(message.to || '').trim();
  if (!EMAIL_PATTERN.test(to)) {
    throw new EmailSendError('Recipient address is not deliverable', {
      status: 400,
      retryable: false,
      code: 'invalid-recipient'
    });
  }

  const { email: senderEmail, name: senderName } = senderConfig();

  const payload = {
    sender: { email: senderEmail, name: senderName },
    to: [message.toName ? { email: to, name: String(message.toName) } : { email: to }],
    subject: String(message.subject || '').slice(0, 200),
    htmlContent: String(message.html || '')
  };
  if (message.text) payload.textContent = String(message.text);

  // Reply-to is only ever set from an address we already validated server-side.
  const replyTo = String(message.replyTo || '').trim();
  if (EMAIL_PATTERN.test(replyTo)) payload.replyTo = { email: replyTo };

  const apiKey = String(process.env.BREVO_API_KEY).trim();

  let last = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    last = await postOnce(payload, apiKey);
    if (last.ok) return { messageId: last.messageId || '' };
    if (!last.retryable || attempt === MAX_ATTEMPTS) break;
    await sleep(RETRY_BACKOFF_MS[attempt - 1] || RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1]);
  }

  throw new EmailSendError('Brevo could not accept the message', {
    status: last && last.status === 429 ? 429 : 502,
    retryable: Boolean(last && last.retryable),
    code: (last && last.code) || 'send-failed'
  });
}

module.exports = {
  BREVO_ENDPOINT,
  MAX_ATTEMPTS,
  EmailConfigError,
  EmailSendError,
  isBrevoConfigured,
  warnIfNotConfigured,
  sendTransactionalEmail
};
