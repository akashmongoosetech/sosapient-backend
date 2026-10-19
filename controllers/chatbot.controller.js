const crypto = require('crypto');
const Contact = require('../models/contact.model');
const ChatSession = require('../models/ChatSession');
const { sendContactEmails, persistDelivery } = require('../utils/emailService');
const { isHoneypotFilled } = require('../utils/honeypot');
const chatbot = require('../services/chatbot.service');
const intentSvc = require('../services/intent.service');
const rag = require('../services/rag.service');
const contextBuilder = require('../services/contextBuilder.service');

function errDetail(error) {
  return process.env.NODE_ENV === 'production' ? undefined : error.message;
}

function escapeRegExp(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clampHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => m && typeof m.text === 'string')
    .slice(-6)
    .map((m) => ({ isUser: Boolean(m.isUser), text: m.text.slice(0, 1000) }));
}

// ---- Observability (in-memory; resets on restart — see GET /stats) ----
const stats = {
  requests: 0,
  byIntent: {},
  bySource: {},
  fallbacks: 0,
  leadSubmits: 0,
  duplicates: 0,
  errors: 0,
  totalLatencyMs: 0
};
function recordStat(intent, source, latencyMs) {
  stats.requests += 1;
  stats.totalLatencyMs += latencyMs;
  stats.byIntent[intent] = (stats.byIntent[intent] || 0) + 1;
  stats.bySource[source] = (stats.bySource[source] || 0) + 1;
  if (source === 'fallback') stats.fallbacks += 1;
}

// ---- Global daily ceiling on chatbot calls (LLM cost-abuse guard) ----
// Per-instance; resets at UTC midnight. Set CHATBOT_DAILY_MAX=0 to disable.
const dailyBudget = { day: new Date().toISOString().slice(0, 10), count: 0 };
function dailyCapReached() {
  const max = parseInt(process.env.CHATBOT_DAILY_MAX, 10);
  if (!Number.isFinite(max) || max <= 0) return false;
  const today = new Date().toISOString().slice(0, 10);
  if (dailyBudget.day !== today) {
    dailyBudget.day = today;
    dailyBudget.count = 0;
  }
  if (dailyBudget.count >= max) return true;
  dailyBudget.count += 1;
  return false;
}

// ---- Sessions (server-side short-term memory, 24h TTL) ----
function acceptSessionId(raw) {
  const v = String(raw || '').trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null;
}

async function loadSession(rawId) {
  let sessionId = acceptSessionId(rawId);
  if (!sessionId) {
    sessionId = `sess_${crypto.randomBytes(12).toString('hex')}`;
  }
  let session = await ChatSession.findOne({ sessionId });
  if (!session) {
    session = new ChatSession({ sessionId, turns: [], slots: {} });
  }
  return session;
}

function mergeSlots(session, incoming) {
  let changed = false;
  for (const [k, v] of Object.entries(incoming || {})) {
    if (v && !session.slots[k]) {
      session.slots[k] = String(v).slice(0, 120);
      changed = true;
    }
  }
  return changed;
}

function slotsLine(session) {
  const s = session.slots || {};
  const parts = ['project', 'industry', 'budget', 'timeline', 'service']
    .filter((k) => s[k])
    .map((k) => `${k}=${s[k]}`);
  return parts.length > 0 ? `Known from this conversation: ${parts.join(', ')}.` : '';
}

// ---- Intent → retrieval + actions ----
const INTENT_SOURCES = {
  services: ['service'],
  industries: ['industry'],
  jobs: ['job'],
  blog: ['blog'],
  'case-studies': ['case-study'],
  about: ['business', 'business-info', 'faq'],
  navigation: ['faq', 'business'],
  pricing: ['service', 'faq', 'business'],
  quote_request: ['service', 'faq', 'business'],
  contact_request: ['business', 'service', 'faq'],
  lead: ['business', 'service', 'faq'],
  human_handoff: ['business'],
  technical: null,
  general_ai: null,
  greeting: [],
  thanks: [],
  goodbye: [],
  unknown: null
};

const NAV_ROUTES = [
  { match: ['service', 'services', 'offer', 'provide'], label: 'Explore Services', url: '/services' },
  { match: ['industry', 'industries', 'sector', 'healthcare', 'ecommerce', 'retail'], label: 'Explore Industries', url: '/industries' },
  { match: ['blog', 'article', 'post', 'tutorial'], label: 'Read the Blog', url: '/blog' },
  { match: ['case stud', 'portfolio', 'past work', 'client work'], label: 'View Case Studies', url: '/case-studies' },
  { match: ['career', 'job', 'hiring', 'vacancy', 'apply', 'intern'], label: 'View Open Roles', url: '/careers' },
  { match: ['contact', 'quote', 'hire', 'talk', 'call', 'discuss', 'reach', 'consult'], label: 'Contact Us', url: '/contact' },
  { match: ['about', 'company', 'team', 'who are you'], label: 'About Us', url: '/about' },
  { match: ['certificate', 'verify', 'internship proof'], label: 'Verify Certificate', url: '/verify' },
  { match: ['privacy'], label: 'Privacy Policy', url: '/privacy' }
];

const INTENT_ACTIONS = {
  pricing: [{ label: 'Get a Quote', url: '/contact' }],
  quote_request: [{ label: 'Get a Quote', url: '/contact' }],
  contact_request: [{ label: 'Contact Us', url: '/contact' }],
  lead: [{ label: 'Contact Us', url: '/contact' }],
  human_handoff: [
    { label: 'Contact Us', url: '/contact' },
    { label: 'Call Support', url: 'tel:+919685533878' }
  ],
  services: [{ label: 'Explore Services', url: '/services' }],
  industries: [{ label: 'Explore Industries', url: '/industries' }],
  jobs: [{ label: 'View Open Roles', url: '/careers' }],
  blog: [{ label: 'Read the Blog', url: '/blog' }],
  'case-studies': [{ label: 'View Case Studies', url: '/case-studies' }]
};

function actionsFor(intent, text) {
  if (intent === 'navigation') {
    const t = String(text || '').toLowerCase();
    for (const r of NAV_ROUTES) {
      if (r.match.some((w) => t.includes(w))) return [{ label: r.label, url: r.url }];
    }
    return [{ label: 'Contact Us', url: '/contact' }];
  }
  return (INTENT_ACTIONS[intent] || []).slice(0, 2);
}

// ---- Output validator: never leak prices, internals, or secrets ----
const PRICE_RE = /(₹|\$|USD|INR)\s?[\d,]+|\bRs\.?\s?[\d,]+/i;
const LEAK_RE = /\/admin\/|process\.env|sk-[A-Za-z0-9]|GEMINI_API_KEY|MONGODB_URI|BEGIN [A-Z ]*PRIVATE KEY/i;

function sanitizeReply(reply, intent) {
  let out = String(reply || '').trim();
  if (LEAK_RE.test(out)) {
    return {
      text: "I can't share internal details, but I can help with our services or connect you with the team. What are you looking for?",
      flagged: 'leak'
    };
  }
  if (PRICE_RE.test(out) && intent !== 'unknown') {
    return {
      text: 'Pricing depends on your requirements and scope — share a few details through our quote form and the team will prepare an estimate. Would you like to start?',
      flagged: 'price'
    };
  }
  return { text: out, flagged: null };
}

// POST /api/chatbot/message { conversationId?, message, history? }
async function message(req, res) {
  const t0 = Date.now();
  try {
    const { conversationId = null, message, history = [] } = req.body || {};
    const raw = typeof message === 'string' ? message : '';
    if (!raw.trim() || raw.length > 2000) {
      return res.status(400).json({ success: false, message: 'Message is required (1-2000 chars)' });
    }
    // Reject early (before any LLM call) once the daily ceiling is hit.
    if (dailyCapReached()) {
      return res.status(429).json({
        success: false,
        message: "I've reached my daily limit for now. Please try again later or use our contact form."
      });
    }
    const text = chatbot.normalizeQuery(raw);
    const cleanHistory = clampHistory(history);

    // Session memory (server-side; client history still accepted for continuity)
    const session = await loadSession(conversationId);
    const sessionId = session.sessionId;
    const recentTurns = session.turns.slice(-6).map((t) => ({ role: t.role, text: t.text }));

    // Intent + slots (LLM classifier, regex fallback keeps us online)
    const cls = await intentSvc.classify(text, recentTurns);
    mergeSlots(session, cls.slots);

    const finish = async (replyText, source, sources = [], extra = {}) => {
      const checked = sanitizeReply(replyText, cls.intent);
      session.turns.push({ role: 'user', text: text.slice(0, 2000), at: new Date() });
      session.turns.push({ role: 'assistant', text: checked.text.slice(0, 2000), at: new Date() });
      if (session.turns.length > 20) session.turns = session.turns.slice(-20);
      session.messageCount += 1;
      await session.save().catch(() => {});
      recordStat(cls.intent, checked.flagged ? 'validator' : source, Date.now() - t0);
      return res.json({
        success: true,
        conversationId: sessionId,
        message: checked.text,
        sources,
        actions: actionsFor(cls.intent, text),
        intent: cls.intent,
        source: checked.flagged ? 'validator' : source,
        ...extra
      });
    };

    // Short-circuit social intents (no retrieval needed)
    if (cls.intent === 'greeting' || cls.intent === 'thanks' || cls.intent === 'goodbye') {
      const { reply, source } = await chatbot.generateReply({
        message: text, history: [...recentTurns, ...cleanHistory], context: '', intent: cls.intent
      });
      return finish(reply, source, []);
    }

    // Structured retrieval for list-type intents
    let structured = [];
    if (cls.intent === 'services') {
      const services = await chatbot.getPublishedServices(17);
      structured = services.map((s) => `${s.title} — ${s.url}`);
    } else if (cls.intent === 'case-studies') {
      const cases = await chatbot.getPublishedCaseStudies({ limit: 5 });
      structured = cases.map((c) => {
        const results = (c.results || []).map((r) => `${r.label}: ${r.value}`).join('; ');
        return `${c.title} (${c.category})${results ? ` — ${results}` : ''} — ${c.url}`;
      });
    } else if (cls.intent === 'blog') {
      const posts = await chatbot.getPublishedBlogPosts({ limit: 5 });
      structured = posts.map((p) => `${p.title} (${p.category}) — ${p.url}`);
    } else if (cls.intent === 'jobs') {
      const jobs = await chatbot.getOpenJobs(5);
      structured = jobs.length > 0
        ? jobs.map((j) => `${j.title} (${j.department || ''} ${j.location || ''}) — ${j.url}`)
        : ['No open roles right now — check back soon or contact the team.'];
    } else if (cls.intent === 'contact_request' || cls.intent === 'about' || cls.intent === 'lead' || cls.intent === 'human_handoff') {
      const info = chatbot.getBusinessContactInformation();
      structured = [
        `Contact page: ${info.contactPage}`,
        `Email: ${info.email}`,
        `Support: ${info.supportPhone}, HR: ${info.hrPhone}`,
        `Address: ${info.address}`,
        `Hours: ${info.hours}`
      ];
    }

    // Hybrid RAG retrieval with quality gate
    const ragTypes = INTENT_SOURCES[cls.intent] !== undefined ? INTENT_SOURCES[cls.intent] : null;
    const chunks = ragTypes && ragTypes.length === 0
      ? []
      : await rag.searchRelevant(text, { topK: 6, sourceTypes: ragTypes, minScore: 0.12 });
    const built = contextBuilder.build({ chunks, structured });

    const slotLine = slotsLine(session);
    const generalKnowledge = cls.intent === 'technical' || cls.intent === 'general_ai';
    const extraRules = generalKnowledge
      ? 'For general technical questions you may use your own knowledge, but any company-specific claim (services, prices, people, contact details) must come ONLY from the context — never invent it. '
      : '';
    const context = [slotLine, built.context].filter(Boolean).join('\n\n');
    const factLines = [
      ...structured,
      ...built.sources.map((s) => `${s.title}: ${s.url}`)
    ];
    const { reply, source } = await chatbot.generateReply({
      message: `${extraRules}${text}`,
      history: [...recentTurns, ...cleanHistory].slice(-6),
      context,
      intent: cls.intent,
      facts: factLines
    });

    return finish(reply, source, built.sources);
  } catch (error) {
    stats.errors += 1;
    console.error('Chatbot message error');
    return res.status(500).json({
      success: false,
      message: "I'm having trouble responding right now. Please try again or use our contact form.",
      error: errDetail(error)
    });
  }
}

// POST /api/chatbot/contact — idempotent lead capture into Contact (source AI_CHATBOT)
async function submitContact(req, res) {
  try {
    if (isHoneypotFilled(req.body)) {
      return res.status(201).json({
        success: true,
        message: "Thanks! I've received your details. We'll use this information to follow up regarding your project."
      });
    }
    const {
      conversationId = null,
      name, email, phone, company = '',
      service = '', message
    } = req.body || {};

    const fields = { name, email, phone, company, service, message };
    for (const [field, value] of Object.entries(fields)) {
      if (field === 'company' && !String(value || '').trim()) continue;
      if (field === 'service' && !String(value || '').trim()) continue;
      const problem = chatbot.validateLeadField(field, value);
      if (problem) {
        return res.status(400).json({ success: false, message: problem, field });
      }
    }

    // Idempotency: same conversation + email => update, never duplicate
    const cleanEmail = String(email).trim().toLowerCase();
    const safeConv = escapeRegExp(String(conversationId || '').slice(0, 64));
    const existing = conversationId
      ? await Contact.findOne({ email: cleanEmail, message: new RegExp(`^\\[AI Chatbot ${safeConv.slice(0, 24)}\\]`) })
      : await Contact.findOne({ email: cleanEmail, source: 'AI_CHATBOT', createdAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) } });
    if (existing) {
      stats.duplicates += 1;
      return res.json({ success: true, message: "Thanks! I've received your details. We'll use this information to follow up regarding your project.", duplicate: true });
    }

    const tag = conversationId ? `[AI Chatbot ${String(conversationId).slice(0, 24)}] ` : '[AI Chatbot] ';
    const contact = new Contact({
      name: String(name).trim(),
      email: cleanEmail,
      company: String(company || '').trim(),
      phone: String(phone).trim(),
      subject: `Chatbot lead${service ? `: ${String(service).slice(0, 80)}` : ''}`,
      message: `${tag}${String(message).trim()}`,
      source: 'AI_CHATBOT'
    });
    await contact.save();
    stats.leadSubmits += 1;

    // Admin-only notification, matching the chatbot's existing behaviour: the
    // chat already thanks the visitor, so no confirmation email is sent.
    // Delivery status is recorded so a failure stays visible.
    await persistDelivery(contact, await sendContactEmails(contact, { notifyVisitor: false }));

    return res.status(201).json({
      success: true,
      message: "Thanks! I've received your details. We'll use this information to follow up regarding your project."
    });
  } catch (error) {
    console.error('Chatbot contact error');
    return res.status(500).json({
      success: false,
      message: 'Something went wrong saving your details. Please try again or use our contact form.',
      error: errDetail(error)
    });
  }
}

function getStats() {
  return {
    ...stats,
    avgLatencyMs: stats.requests > 0 ? Math.round(stats.totalLatencyMs / stats.requests) : 0
  };
}

module.exports = { message, submitContact, getStats, actionsFor, sanitizeReply };
