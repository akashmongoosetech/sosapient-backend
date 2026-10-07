// Shared fetch-with-timeout helper (consolidates chat/copilotkit/gemini callers).
async function fetchWithTimeout(url, options = {}, ms = 12000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  if (t.unref) t.unref();
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

module.exports = { fetchWithTimeout };
