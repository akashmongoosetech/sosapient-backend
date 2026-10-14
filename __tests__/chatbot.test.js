const { test } = require('node:test');
const assert = require('node:assert/strict');

test('intent regexFallback maps sales/pricing/jobs/navigation without LLM', () => {
  const { regexFallback } = require('../services/intent.service');
  assert.equal(regexFallback('how much does a website cost').intent, 'pricing');
  assert.equal(regexFallback('are you hiring developers').intent, 'jobs');
  assert.equal(regexFallback('where is your contact page').intent, 'navigation');
  assert.equal(regexFallback('I need a website for my shop').intent, 'contact_request');
  const r = regexFallback('I need a website');
  assert.equal(r.slots.project, 'website');
});

test('intent sanitizeSlots drops unknown keys and caps length', () => {
  const { sanitizeSlots } = require('../services/intent.service');
  const s = sanitizeSlots({ project: 'website', evil: 'x'.repeat(500), industry: '  Retail ' });
  assert.equal(s.project, 'website');
  assert.equal(s.evil, undefined);
  assert.equal(s.industry, 'Retail');
});

test('contextBuilder dedupes, weights business first, caps output', () => {
  const { build } = require('../services/contextBuilder.service');
  const chunks = [
    { content: 'same text here', sourceType: 'blog', sourceId: 'a', metadata: { title: 'B', url: '/blog/a' }, _score: 5 },
    { content: 'same text here', sourceType: 'blog', sourceId: 'a', metadata: { title: 'B', url: '/blog/a' }, _score: 5 },
    { content: 'contact info here', sourceType: 'business', sourceId: 'b', metadata: { title: 'Contact', url: '/contact' }, _score: 0.2 }
  ];
  const out = build({ chunks, structured: ['Fact: x — /contact'], maxChars: 5000 });
  assert.equal(out.dropped, 1);
  assert.ok(out.usedTypes.includes('business'));
  assert.equal(out.sources.length, 2);
  assert.ok(out.sources[0].url === '/contact' || out.sources[1].url === '/contact');
});

test('contextBuilder drops low-score noise (quality gate)', () => {
  const { build } = require('../services/contextBuilder.service');
  const out = build({
    chunks: [{ content: 'unrelated filler', sourceType: 'blog', sourceId: 'z', metadata: {}, _score: 0.01 }]
  });
  assert.equal(out.sources.length, 0);
  assert.equal(out.context, '');
});

test('sanitizeReply blocks prices and internal leaks', () => {
  const { sanitizeReply } = require('../controllers/chatbot.controller');
  assert.equal(sanitizeReply('It costs $500 total.', 'services').flagged, 'price');
  assert.equal(sanitizeReply('Check /admin/dashboard now.', 'general').flagged, 'leak');
  assert.equal(sanitizeReply('We build MERN apps for startups.', 'services').flagged, null);
});

test('actionsFor only returns allowlisted site routes', () => {
  const { actionsFor } = require('../controllers/chatbot.controller');
  for (const [intent, text] of [['pricing', ''], ['jobs', ''], ['navigation', 'where is the blog'], ['technical', '']]) {
    for (const a of actionsFor(intent, text)) {
      assert.match(a.url, /^(\/(contact|services|industries|blog|case-studies|careers|about|verify|privacy)|tel:\+91\d+)$/);
    }
  }
  assert.deepEqual(actionsFor('technical', 'what is react'), []);
});
