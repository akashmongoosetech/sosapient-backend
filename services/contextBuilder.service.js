// Context builder: ranks, dedupes, and caps retrieved chunks before LLM use.
// Priority: business facts > service > industry > faq > job > blog > case-study.
// Never sends the whole index — only relevant, scored context.
const rag = require('./rag.service');

// Source priority weights (higher = more trusted for company facts).
const SOURCE_WEIGHTS = {
  business: 1.5,
  'business-info': 1.4,
  service: 1.3,
  industry: 1.2,
  faq: 1.1,
  job: 1.0,
  blog: 0.9,
  'case-study': 0.8
};

const MIN_SCORE = 0.15;
const MAX_CHARS = 2500;
const MAX_SOURCES = 3;

function contentKey(c) {
  const t = String(c.content || '').slice(0, 120).replace(/\s+/g, ' ');
  return `${c.sourceType || ''}:${c.sourceId || ''}:${t}`;
}

function rankChunks(chunks, { minScore = MIN_SCORE } = {}) {
  const seen = new Set();
  const out = [];
  for (const c of chunks || []) {
    const key = contentKey(c);
    if (seen.has(key)) continue;
    seen.add(key);
    const base = typeof c._score === 'number' ? c._score : 0;
    const weight = SOURCE_WEIGHTS[c.sourceType] || 1;
    const score = base * weight;
    if (score < minScore && base < minScore) continue;
    out.push({ ...c, _rank: score });
  }
  out.sort((a, b) => b._rank - a._rank);
  return out;
}

function build({ chunks = [], structured = [], maxChars = MAX_CHARS } = {}) {
  const ranked = rankChunks(chunks);
  const parts = [];
  if (structured.length > 0) {
    parts.push(structured.map((s) => `Fact: ${s}`).join('\n'));
  }
  let used = 0;
  const usedTypes = new Set();
  for (const c of ranked) {
    const label = c.metadata?.title
      ? `${c.metadata.title}${c.metadata.category ? ` (${c.metadata.category})` : ''}`
      : c.source;
    const block = `[${label}]\n${c.content}`;
    if (used + block.length > maxChars) break;
    parts.push(block);
    used += block.length;
    if (c.sourceType) usedTypes.add(c.sourceType);
  }
  const sources = [];
  const seenUrl = new Set();
  for (const c of ranked) {
    const url = c.metadata?.url;
    const title = c.metadata?.title || c.source;
    if (url && !seenUrl.has(url) && url.startsWith('/')) {
      seenUrl.add(url);
      sources.push({ title, url });
    }
    if (sources.length >= MAX_SOURCES) break;
  }
  return {
    context: parts.filter(Boolean).join('\n\n'),
    sources,
    usedTypes: [...usedTypes],
    kept: ranked.length,
    dropped: (chunks || []).length - ranked.length
  };
}

module.exports = { build, rankChunks, SOURCE_WEIGHTS, MIN_SCORE, MAX_CHARS, MAX_SOURCES };
