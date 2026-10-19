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

// Brevo issues two different credentials from the same "SMTP & API" page, and
// they are not interchangeable: the SMTP key only works on the SMTP relay, while
// the HTTP API requires a v3 API key. Pasting the wrong one is an easy mistake,
// and all Brevo says is "unauthorized", so we name the problem ourselves.
const SMTP_KEY_PREFIX = 'xsmtpsib-';

// Raised when Brevo is not configured. Distinct from a send failure so callers
// can tell "we could not even try" apart from "Brevo refused the message".
class EmailConfigError extends Error {
  constructor(message = 'Transactional email is not configured', code = 'not-configured') {
    super(message);
    this.name = 'EmailConfigError';
    this.status = 503;
    this.code = code;
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

// Returns '' when the key looks usable, otherwise the reason it does not.
// Only the definitively-wrong SMTP prefix is rejected: an unrecognised format is
// left for Brevo to judge rather than second-guessed here.
function apiKeyProblem() {
  const key = String(process.env.BREVO_API_KEY || '').trim();
  if (!key) return 'missing';
  if (key.startsWith(SMTP_KEY_PREFIX)) return 'smtp-key';
  return '';
}

function isBrevoConfigured() {
  return apiKeyProblem() === '' && EMAIL_PATTERN.test(senderConfig().email);
}

// Configuration guidance is emitted once, never per request, and never contains
// the key itself or any message content.
let configWarningEmitted = false;
function warnIfMisconfigured() {
  if (isBrevoConfigured() || configWarningEmitted) return;
  configWarningEmitted = true;

  const problem = apiKeyProblem();
  const reasons = [];

  if (problem === 'missing') {
    reasons.push('BREVO_API_KEY is not set.');
  } else if (problem === 'smtp-key') {
    reasons.push(
      'BREVO_API_KEY is an SMTP key (prefix "xsmtpsib-"), which the HTTP API does not accept. ' +
        'Generate a v3 API key on the "API Keys" tab of https://app.brevo.com/settings/keys/api ' +
        '(the "SMTP" tab holds a different credential).'
    );
  }

  if (!senderConfig().email) {
    reasons.push('BREVO_SENDER_EMAIL is not set, or is not a valid email address.');
  }

  console.error(
    `[email] Brevo is not configured, so transactional email is disabled. ${reasons.join(' ')} ` +
      'Submissions are still saved and still show as successful; only the email is skipped.'
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
    warnIfMisconfigured();
    const problem = apiKeyProblem();
    throw new EmailConfigError(
      problem === 'smtp-key'
        ? 'BREVO_API_KEY is an SMTP key, not a v3 API key'
        : 'Transactional email is not configured',
      problem === 'smtp-key' ? 'smtp-key-not-api-key' : 'not-configured'
    );
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
  apiKeyProblem,
  isBrevoConfigured,
  warnIfMisconfigured,
  sendTransactionalEmail
};
