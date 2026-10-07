const Contact = require('../models/contact.model');
const { sendContactEmail } = require('../utils/emailService');
const { isHoneypotFilled } = require('../utils/honeypot');
const chatbot = require('../services/chatbot.service');
const rag = require('../services/rag.service');

function errDetail(error) {
  return process.env.NODE_ENV === 'production' ? undefined : error.message;
}

function clampHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => m && typeof m.text === 'string')
    .slice(-6)
    .map((m) => ({ isUser: Boolean(m.isUser), text: m.text.slice(0, 1000) }));
}

// POST /api/chatbot/message { conversationId?, message, history? }
async function message(req, res) {
  try {
    const { conversationId = null, message, history = [] } = req.body || {};
    const raw = typeof message === 'string' ? message : '';
    if (!raw.trim() || raw.length > 2000) {
      return res.status(400).json({ success: false, message: 'Message is required (1-2000 chars)' });
    }
    const text = chatbot.normalizeQuery(raw);
    const cleanHistory = clampHistory(history);
    const { intent } = chatbot.detectIntent(text);

    // Structured retrieval for list-type intents (no LLM needed for facts)
    let structured = [];
    let ragTypes = null;
    if (intent === 'services') {
      const services = await chatbot.getPublishedServices(17);
      structured = services.map((s) => `${s.title} — ${s.url}`);
    } else if (intent === 'case-studies') {
      const cases = await chatbot.getPublishedCaseStudies({ limit: 5 });
      structured = cases.map((c) => {
        const res = (c.results || []).map((r) => `${r.label}: ${r.value}`).join('; ');
        return `${c.title} (${c.category})${res ? ` — ${res}` : ''} — ${c.url}`;
      });
    } else if (intent === 'blog') {
      const posts = await chatbot.getPublishedBlogPosts({ limit: 5 });
      structured = posts.map((p) => `${p.title} (${p.category}) — ${p.url}`);
    } else if (intent === 'contact' || intent === 'about') {
      const info = chatbot.getBusinessContactInformation();
      structured = [`Contact page: ${info.contactPage}`, `Email: ${info.email}`];
    } else if (intent === 'greeting' || intent === 'thanks' || intent === 'goodbye') {
      const { reply, source } = await chatbot.generateReply({ message: text, history: cleanHistory, context: '', intent });
      return res.json({ success: true, conversationId, message: reply, sources: [], source });
    }

    // RAG retrieval for grounded context
    const chunks = await rag.searchRelevant(text, { topK: 4, sourceTypes: ragTypes });
    const context = rag.buildContext(chunks);
    const factLines = [
      ...structured,
      ...chunks.slice(0, 3).map((c) => `${c.metadata?.title || c.source}: ${(c.metadata?.url || '')}`)
    ];
    const { reply, source } = await chatbot.generateReply({
      message: text,
      history: cleanHistory,
      context: [structured.map((s) => `Fact: ${s}`).join('\n'), context].filter(Boolean).join('\n\n'),
      intent,
      facts: factLines
    });

    const sources = [];
    const seen = new Set();
    for (const c of chunks.slice(0, 3)) {
      const url = c.metadata?.url;
      const title = c.metadata?.title || c.source;
      if (url && !seen.has(url) && url.startsWith('/')) {
        seen.add(url);
        sources.push({ title, url });
      }
      if (sources.length >= 3) break;
    }

    return res.json({ success: true, conversationId, message: reply, sources, source });
  } catch (error) {
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
    const existing = conversationId
      ? await Contact.findOne({ email: cleanEmail, message: new RegExp(`^\\[AI Chatbot ${String(conversationId).slice(0, 24)}\\]`) })
      : await Contact.findOne({ email: cleanEmail, source: 'AI_CHATBOT', createdAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) } });
    if (existing) {
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

    try {
      await sendContactEmail(contact);
    } catch (emailError) {
      console.error('Chatbot lead email failed');
    }

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

module.exports = { message, submitContact };
