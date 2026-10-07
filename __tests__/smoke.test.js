const { test } = require('node:test');
const assert = require('node:assert/strict');

test('http.fetchWithTimeout resolves fast requests', async () => {
  const { fetchWithTimeout } = require('../utils/http');
  // data: URL avoids network; fetch supports it in Node 18+
  const res = await fetchWithTimeout('data:text/plain,hello', {}, 2000);
  assert.equal(res.status, 200);
});

test('lead pickAllowlist only allows known fields', () => {
  const { pickLead } = require('../utils/lead');
  const out = pickLead({ title: 'T', role: 'ADMIN', __v: 1 });
  assert.equal(out.role, undefined);
  assert.equal(out.title, 'T');
});
