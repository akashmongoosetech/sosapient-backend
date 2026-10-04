// RAG service: chunking, indexing, cosine retrieval over Mongo-stored embeddings.
// Works on local mongod and Atlas alike (no $vectorSearch dependency).
const RagDocument = require('../models/RagDocument');
const gemini = require('./gemini.service');

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 60;
const TOP_K = 4;

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// Sentence-aware chunking: never splits mid-sentence unless forced by size.
function chunkText(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const clean = stripHtml(text);
  if (!clean) return [];
  if (clean.length <= chunkSize) return [clean];
  const sentences = clean.match(/[^.!?]+[.!?]+["']?\s*|[^.!?]+$/g) || [clean];
  const chunks = [];
  let current = '';
  for (const s of sentences) {
    const piece = s.trim();
    if (!piece) continue;
    const candidate = current ? `${current} ${piece}` : piece;
    if (candidate.length > chunkSize && current) {
      chunks.push(current);
      const tail = current.slice(-overlap);
      current = `${tail} ${piece}`.trim();
      if (current.length > chunkSize * 2) {
        chunks.push(current.slice(0, chunkSize));
        current = current.slice(chunkSize - overlap);
      }
    } else if (candidate.length > chunkSize * 2) {
      if (current) chunks.push(current);
      chunks.push(candidate.slice(0, chunkSize));
      current = candidate.slice(chunkSize - overlap);
    } else {
      current = candidate;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) {
    return -1;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return -1;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Replace all chunks for a source document (unpublish/delete call with published=false or remove).
async function indexDocument({ source, sourceId, sourceType, metadata = {}, sections = [], published = true }) {
  await RagDocument.deleteMany({ source, sourceId });
  if (!published) return { indexed: 0, removed: true };
  const docs = [];
  for (const section of sections) {
    const chunks = chunkText(section.text || '');
    for (const chunk of chunks) {
      docs.push({
        content: `[${section.label || sourceType}] ${chunk}`.slice(0, 4000),
        source,
        sourceId: String(sourceId),
        sourceType,
        metadata: {
          title: String(metadata.title || '').slice(0, 200),
          slug: String(metadata.slug || '').slice(0, 200),
          url: String(metadata.url || '').slice(0, 500),
          category: String(metadata.category || '').slice(0, 120)
        },
        published: true
      });
    }
  }
  if (docs.length === 0) return { indexed: 0, removed: true };
  for (const doc of docs) {
    const record = new RagDocument({ ...doc, embedding: [] });
    await record.save();
    try {
      const vector = await gemini.embed(doc.content);
      record.embedding = vector;
      await record.save();
    } catch (e) {
      // Embedding failed: keep text-only chunk (keyword fallback still works)
      console.error('RAG embedding failed for chunk:', e && e.message);
    }
    // Gentle pacing to stay under free-tier RPM limits
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return { indexed: docs.length, removed: false };
}

async function removeDocument(source, sourceId) {
  await RagDocument.deleteMany({ source, sourceId: String(sourceId) });
}

// Keyword prefilter narrows candidates; cosine ranks when vectors exist.
async function searchRelevant(query, { topK = TOP_K, sourceTypes = null } = {}) {
  const filter = { published: true };
  if (Array.isArray(sourceTypes) && sourceTypes.length > 0) {
    filter.sourceType = { $in: sourceTypes };
  }
  const words = String(query || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 12);
  let candidates = [];
  if (words.length > 0) {
    const or = words.map((w) => ({ content: new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }));
    candidates = await RagDocument.find({ ...filter, $or: or })
      .select('content source sourceId sourceType metadata updatedAt')
      .limit(60)
      .lean();
  }
  if (candidates.length === 0) {
    candidates = await RagDocument.find(filter)
      .select('content source sourceId sourceType metadata updatedAt')
      .sort({ updatedAt: -1 })
      .limit(20)
      .lean();
  }

  let queryVector = null;
  try {
    if (gemini.isConfigured()) {
      queryVector = await gemini.embed(query);
    }
  } catch (e) {
    queryVector = null;
  }

  if (queryVector) {
    const withVectors = await RagDocument.find({
      _id: { $in: candidates.map((c) => c._id) },
      embedding: { $exists: true, $not: { $size: 0 } }
    })
      .select('embedding')
      .lean();
    const vecById = new Map(withVectors.map((v) => [String(v._id), v.embedding]));
    candidates = candidates
      .map((c) => {
        const vec = vecById.get(String(c._id));
        const sim = vec ? cosineSimilarity(queryVector, vec) : -1;
        const textHits = words.reduce((n, w) => (c.content.toLowerCase().includes(w) ? n + 1 : n), 0);
        return { ...c, _score: sim >= 0 ? sim + textHits * 0.05 : textHits * 0.05 };
      })
      .sort((a, b) => b._score - a._score);
  }

  return candidates.slice(0, topK);
}

function buildContext(chunks) {
  if (!chunks || chunks.length === 0) return '';
  return chunks
    .map((c, i) => {
      const meta = c.metadata || {};
      const label = meta.title ? `${meta.title}${meta.category ? ` (${meta.category})` : ''}` : c.source;
      return `[Source ${i + 1}: ${label}]\n${c.content}`;
    })
    .join('\n\n');
}

module.exports = {
  chunkText,
  stripHtml,
  cosineSimilarity,
  indexDocument,
  removeDocument,
  searchRelevant,
  buildContext,
  TOP_K
};
