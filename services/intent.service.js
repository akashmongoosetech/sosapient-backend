// Intent + slot classifier for the website assistant.
// Primary: tiny LLM call returning strict JSON. Fallback: existing regex
// detector when the LLM is unavailable (never blocks the chat).
const gemini = require('./gemini.service');
const legacy = require('./chatbot.service');

const INTENTS = [
  'greeting',
  'pricing',
  'quote_request',
  'contact_request',
  'lead',
  'services',
  'industries',
  'jobs',
  'blog',
  'case-studies',
  'about',
  'navigation',
  'technical',
  'general_ai',
  'thanks',
  'goodbye',
  'human_handoff',
  'unknown'
];

const CLASSIFIER_PROMPT = `You classify a website visitor's message for the SoSapient company assistant (web/mobile dev, AI, CRM/ERP, marketing; Ujjain, India).
Reply with ONLY a JSON object, no other text:
{"intent": "<one of: ${INTENTS.join(', ')}>", "confidence": <0-1>, "slots": {"project": "", "industry": "", "budget": "", "timeline": "", "service": ""}, "needs_quote": <true|false>}
Rules: pricing/quote_request when they ask cost or want an estimate; contact_request/lead/human_handoff when they want to talk, hire, or share details; jobs only for careers/hiring questions; navigation when asking where a page/form is; technical for how-to/dev questions answerable with general knowledge; general_ai for non-company general questions; unknown only when truly unclassifiable. Fill slots only with values stated or clearly implied (project: website|app|chatbot|crm|erp|automation|marketing|other; keep values short).`;

function sanitizeSlots(slots) {
  const clean = { project: '', industry: '', budget: '', timeline: '', service: '' };
  if (!slots || typeof slots !== 'object') return clean;
  for (const k of Object.keys(clean)) {
    clean[k] = String(slots[k] || '').trim().slice(0, 120);
  }
  return clean;
}

// Map legacy regex intents onto the extended set (fallback path).
function mapLegacyIntent(name) {
  switch (name) {
    case 'greeting': return 'greeting';
    case 'pricing': return 'pricing';
    case 'contact': return 'contact_request';
    case 'case-studies': return 'case-studies';
    case 'services': return 'services';
    case 'blog': return 'blog';
    case 'thanks': return 'thanks';
    case 'goodbye': return 'goodbye';
    case 'about': return 'about';
    default: return 'unknown';
  }
}

function regexFallback(message) {
  const t = String(message || '').toLowerCase();
  const has = (...ws) => ws.flat().some((w) => t.includes(w));
  // Specific checks first: legacy keyword lists are broad ('develop' would
  // otherwise swallow "are you hiring developers" into contact_request).
  if (has(['job', 'career', 'hiring', 'vacancy', 'apply', 'salary', 'intern', 'opening', 'position'])) {
    return { intent: 'jobs', confidence: 'medium', slots: sanitizeSlots({}), needs_quote: false, source: 'regex' };
  }
  if (has(['talk to a person', 'talk to a human', 'real person', 'speak with someone', 'human'])) {
    return { intent: 'human_handoff', confidence: 'medium', slots: sanitizeSlots({}), needs_quote: false, source: 'regex' };
  }
  if (has(['where is', 'where can i', 'navigate', 'find the'])) {
    return { intent: 'navigation', confidence: 'medium', slots: sanitizeSlots({}), needs_quote: false, source: 'regex' };
  }
  const { intent, confidence } = legacy.detectIntent(message);
  let mapped = mapLegacyIntent(intent);
  if (mapped === 'unknown') {
    if (has(['where', 'how do i', 'link', 'page'])) mapped = 'navigation';
    else if (has([' vs ', 'versus', 'difference between', 'what is', 'how does', 'how can', 'which technology', 'should i use'])) mapped = 'technical';
  }
  const slots = sanitizeSlots({
    project: has(['website', 'site']) ? 'website'
      : has(['mobile app', 'android app', 'ios app']) ? 'app'
      : has(['chatbot', 'chat bot']) ? 'chatbot'
      : has(['crm']) ? 'crm' : has(['erp']) ? 'erp'
      : has(['automat']) ? 'automation'
      : has(['marketing', 'seo']) ? 'marketing' : ''
  });
  return { intent: mapped, confidence: confidence || 'low', slots, needs_quote: mapped === 'pricing', source: 'regex' };
}

async function classify(message, recentTurns = []) {
  const text = String(message || '').trim().slice(0, 2000);
  if (!text) return { intent: 'unknown', confidence: 'low', slots: sanitizeSlots({}), needs_quote: false, source: 'regex' };
  if (!gemini.isConfigured()) return regexFallback(text);
  try {
    const historyLine = (Array.isArray(recentTurns) ? recentTurns.slice(-4) : [])
      .map((t) => `${t.role === 'user' ? 'Visitor' : 'Assistant'}: ${String(t.text || '').slice(0, 300)}`)
      .join('\n');
    const reply = await gemini.chat(
      [
        { role: 'user', text: CLASSIFIER_PROMPT },
        ...(historyLine ? [{ role: 'user', text: `Conversation so far:\n${historyLine}` }] : []),
        { role: 'user', text: `Visitor message: ${text}` }
      ],
      { maxTokens: 200, temperature: 0 }
    );
    const match = String(reply || '').match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in classifier reply');
    const parsed = JSON.parse(match[0]);
    const intent = INTENTS.includes(parsed.intent) ? parsed.intent : 'unknown';
    return {
      intent,
      confidence: typeof parsed.confidence === 'number' ? Math.min(Math.max(parsed.confidence, 0), 1) : 'medium',
      slots: sanitizeSlots(parsed.slots),
      needs_quote: Boolean(parsed.needs_quote) || intent === 'pricing' || intent === 'quote_request',
      source: 'llm'
    };
  } catch (e) {
    return regexFallback(text);
  }
}

module.exports = { classify, regexFallback, sanitizeSlots, INTENTS };
