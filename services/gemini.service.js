// Gemini API service: chat completions + text embeddings for the RAG chatbot.
// All keys stay server-side. Nothing here is exposed to the frontend.
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
const TIMEOUT_MS = 12000;

function apiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY is not configured');
  }
  return key;
}

async function fetchWithTimeout(url, options = {}, ms = TIMEOUT_MS) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retry on 429/5xx with exponential backoff, honoring Retry-After.
async function fetchWithRetry(url, options = {}, { attempts = 4, baseDelayMs = 1000 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const res = await fetchWithTimeout(url, options);
    if (res.status !== 429 && (res.status < 500 || res.status > 599)) {
      return res;
    }
    lastError = new Error(`Gemini request failed with status ${res.status}`);
    try {
      await res.text().catch(() => {});
    } catch (e) {
      // drain only
    }
    if (attempt < attempts - 1) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 30000)
        : Math.min(baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 500), 15000);
      await sleep(delay);
    }
  }
  throw lastError;
}

function isConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

// Generate a grounded chat reply. Retrieved context is passed as DATA,
// never as instructions (see system prompt delimiters in chatbot.service.js).
async function chat(messages) {
  const res = await fetchWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: String(m.text || '').slice(0, 6000) }]
        })),
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 600
        }
      })
    }
  );
  if (!res.ok) {
    throw new Error(`Gemini chat failed with status ${res.status}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts
    ?.map((p) => p.text || '')
    .join('')
    .trim();
  if (!text) {
    throw new Error('Gemini returned an empty response');
  }
  return text.slice(0, 2000);
}

// Generate a single embedding vector for retrieval.
async function embed(text) {
  const res = await fetchWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent`,
    {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: { parts: [{ text: String(text || '').slice(0, 8000) }] }
      })
    }
  );
  if (!res.ok) {
    throw new Error(`Gemini embedding failed with status ${res.status}`);
  }
  const data = await res.json();
  const values = data?.embedding?.values;
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('Gemini returned an empty embedding');
  }
  return values;
}

module.exports = { chat, embed, isConfigured, MODEL, EMBEDDING_MODEL };
