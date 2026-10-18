// Google reCAPTCHA v2 server-side verification.
//
// Security posture: FAIL CLOSED. Any ambiguity (missing secret, network error,
// timeout, malformed response, unexpected hostname) means "not verified".
// The secret key and the applicant token are never logged.
//
// Uses the platform global `fetch` (Node 18+); no third-party HTTP client.

const SITEVERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';
const DEFAULT_TIMEOUT_MS = 5000;

function isRecaptchaConfigured() {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  return typeof secret === 'string' && secret.trim().length > 0;
}

// Hostnames the widget is allowed to be solved on. Defaults to the production
// site (both apex and www) plus the local dev hosts.
function allowedHostnames() {
  const raw = process.env.RECAPTCHA_ALLOWED_HOSTNAMES || 'sosapient.in,www.sosapient.in,localhost,127.0.0.1';
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function hostnameAllowed(hostname) {
  const h = String(hostname || '').trim().toLowerCase();
  if (!h) return false;
  return allowedHostnames().includes(h);
}

/**
 * Verify a reCAPTCHA token with Google's siteverify endpoint.
 *
 * @param {string} token    The `g-recaptcha-response` value from the client.
 * @param {string} [remoteIp] Optional applicant IP (only pass a trusted value).
 * @returns {Promise<{ok: boolean, reason: string}>}
 *   reason ∈ ok | missing | secret-missing | expired-or-duplicate |
 *            hostname-mismatch | rejected | unavailable | malformed
 */
async function verifyRecaptchaToken(token, remoteIp) {
  if (!isRecaptchaConfigured()) return { ok: false, reason: 'secret-missing' };
  if (!token || typeof token !== 'string' || !token.trim()) return { ok: false, reason: 'missing' };
  if (typeof fetch !== 'function') return { ok: false, reason: 'unavailable' };

  const params = new URLSearchParams();
  params.set('secret', process.env.RECAPTCHA_SECRET_KEY);
  params.set('response', token);
  if (remoteIp) params.set('remoteip', String(remoteIp));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: controller.signal
    });
  } catch {
    // Network failure or timeout (AbortError) — treat as temporarily unavailable.
    return { ok: false, reason: 'unavailable' };
  } finally {
    clearTimeout(timer);
  }

  if (!res || !res.ok) return { ok: false, reason: 'unavailable' };

  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!data || typeof data !== 'object') return { ok: false, reason: 'malformed' };

  if (data.success === true) {
    if (!hostnameAllowed(data.hostname)) return { ok: false, reason: 'hostname-mismatch' };
    return { ok: true, reason: 'ok' };
  }

  const codes = Array.isArray(data['error-codes']) ? data['error-codes'] : [];
  if (codes.includes('timeout-or-duplicate')) return { ok: false, reason: 'expired-or-duplicate' };
  if (codes.includes('missing-input-secret') || codes.includes('invalid-input-secret')) {
    return { ok: false, reason: 'secret-missing' };
  }
  return { ok: false, reason: 'rejected' };
}

module.exports = {
  SITEVERIFY_URL,
  isRecaptchaConfigured,
  allowedHostnames,
  hostnameAllowed,
  verifyRecaptchaToken
};
