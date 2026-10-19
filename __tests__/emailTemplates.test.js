// Design and compatibility checks for the email templates.
//
// These are the things that can be verified without a mail client: colour
// contrast, markup validity, absence of constructs that email clients drop, and
// the rules that protect the visitor from seeing internal information.
//
// What is NOT verified here, and must not be claimed: rendering in Gmail,
// Outlook, Apple Mail or an Android client. That needs a human with those
// clients open.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const templates = require('../utils/emailTemplates');
const { BRAND, COMPANY } = templates;

const ADMIN_EMAIL = 'admin@sosapient.in';

const CONTACT = {
  name: 'Asha Verma',
  email: 'asha@example.com',
  phone: '+91 90000 00000',
  company: 'Acme Pvt Ltd',
  subject: 'Website redesign',
  message: 'Line one\nLine two',
  budget: '25k-50k',
  timeline: '1-3-months',
  source: 'general',
  createdAt: new Date('2026-10-19T06:30:00Z')
};

const CAREER = {
  name: 'Rahul Sharma',
  email: 'rahul@example.com',
  phone: '+91 91111 11111',
  position: 'Frontend Developer',
  experience: '4',
  currentCompany: 'Old Co',
  coverLetter: 'I would love to join.',
  resume: { filename: 'rahul-cv.pdf' },
  createdAt: new Date('2026-10-19T06:30:00Z')
};

const ALL = [
  ['contact visitor', () => templates.contactVisitorEmail(CONTACT)],
  ['contact admin', () => templates.contactAdminEmail(CONTACT)],
  ['career applicant', () => templates.careerVisitorEmail(CAREER)],
  ['career admin', () => templates.careerAdminEmail(CAREER)]
];

// --- WCAG contrast ---------------------------------------------------------

function channel(value) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex) {
  const clean = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  const light = Math.max(a, b);
  const dark = Math.min(a, b);
  return (light + 0.05) / (dark + 0.05);
}

function atLeast(foreground, background, minimum, label) {
  const ratio = contrast(foreground, background);
  assert.ok(
    ratio >= minimum,
    `${label}: ${foreground} on ${background} is ${ratio.toFixed(2)}:1, needs ${minimum}:1`
  );
}

test('every text/surface pair meets WCAG AA, and body text meets AAA', () => {
  atLeast(BRAND.ink, BRAND.card, 7, 'body text on the content card');
  atLeast(BRAND.ink, BRAND.banner, 7, 'body text on the banner');
  atLeast(BRAND.ink, BRAND.panel, 7, 'body text on a panel');
  atLeast(BRAND.muted, BRAND.card, 4.5, 'secondary text on the card');
  atLeast(BRAND.bannerText, BRAND.banner, 4.5, 'banner supporting text');
  atLeast(BRAND.footerText, BRAND.footer, 4.5, 'footer text');
  atLeast(BRAND.primaryDark, BRAND.card, 4.5, 'links on the card');
  atLeast(BRAND.primaryDark, BRAND.panel, 4.5, 'links on a panel');
  atLeast('#FFFFFF', BRAND.secondary, 7, 'the CTA label');
});

test('the header stays light enough for the dark logo wordmark', () => {
  // The previous design put the logo on #39269B. These two assertions are the
  // reason the header is white: the old pairing hid the logo almost entirely.
  atLeast(COMPANY.logoInk, BRAND.card, 7, 'logo wordmark on the header');
  assert.ok(
    contrast(COMPANY.logoInk, BRAND.secondary) < 3,
    'a brand-coloured header would drop the logo below legible contrast'
  );
});

test('every surface is light and no two surfaces share a colour', () => {
  const surfaces = [BRAND.card, BRAND.banner, BRAND.social, BRAND.footer, BRAND.canvas];
  for (const surface of surfaces) {
    assert.ok(luminance(surface) > 0.75, `${surface} is not a light surface`);
  }
  assert.equal(new Set(surfaces).size, surfaces.length, 'surfaces must be distinguishable');
});

// --- markup validity -------------------------------------------------------

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr'
]);

// Comments and the style block are removed first: the Outlook conditional
// comments deliberately contain table markup, and CSS is not HTML.
function scannable(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '').replace(/<style[\s\S]*?<\/style>/gi, '');
}

function tagsOf(html) {
  return scannable(html).match(/<\/?[a-zA-Z][^>]*>/g) || [];
}

function assertBalanced(html, label) {
  const stack = [];
  for (const tag of tagsOf(html)) {
    const name = tag.match(/^<\/?\s*([a-zA-Z][a-zA-Z0-9]*)/)[1].toLowerCase();
    if (VOID_TAGS.has(name) || /\/>$/.test(tag)) continue;
    if (tag.startsWith('</')) {
      const open = stack.pop();
      assert.equal(open, name, `${label}: closing </${name}> does not match <${open}>`);
    } else {
      stack.push(name);
    }
  }
  assert.deepEqual(stack, [], `${label}: unclosed tags remain`);
}

function assertNoEventHandlers(html, label) {
  for (const tag of tagsOf(html)) {
    assert.equal(
      /\son[a-z]+\s*=/i.test(tag),
      false,
      `${label}: event handler found in ${tag.slice(0, 80)}`
    );
  }
}

for (const [label, render] of ALL) {
  test(`${label} email is well-formed, script-free email HTML`, () => {
    const { subject, html, text } = render();

    assert.ok(subject && subject.trim().length > 0, 'subject is required');
    assert.ok(html.startsWith('<!DOCTYPE html>'), 'doctype is required');
    assert.equal(/<script/i.test(html), false, 'no scripts');
    assert.equal(/<link\s/i.test(html), false, 'no external stylesheet');
    assert.equal(/@import/i.test(html), false, 'no CSS imports');
    assert.equal(/javascript:/i.test(html), false, 'no javascript: URLs');
    assert.equal(/http:\/\//i.test(html), false, 'every external URL must be https');
    assert.equal(html.includes('undefined'), false, 'no literal undefined');
    assert.equal(text.includes('undefined'), false, 'no literal undefined in plain text');

    assertBalanced(html, label);
    assertNoEventHandlers(html, label);

    assert.ok(text.trim().length > 0, 'a plain-text alternative is required');
    assert.ok(text.includes(COMPANY.website), 'plain text keeps a working website URL');
  });

  test(`${label} email keeps every image explicit and labelled`, () => {
    const { html } = render();
    const images = tagsOf(html).filter((tag) => /^<img/i.test(tag));

    assert.ok(images.length >= 1, 'the brand header carries the logo');
    for (const image of images) {
      assert.match(image, /\swidth="\d+"/, 'image needs an explicit width');
      assert.match(image, /\sheight="\d+"/, 'image needs an explicit height');
      assert.match(image, /\salt="[^"]+"/, 'image needs alt text');
    }
  });

  test(`${label} email only links to https, mailto or tel targets`, () => {
    const { html } = render();
    for (const tag of tagsOf(html)) {
      for (const attribute of ['href', 'src']) {
        const match = tag.match(new RegExp(`\\s${attribute}="([^"]*)"`));
        if (!match) continue;
        const target = match[1];
        assert.ok(
          /^(https:\/\/|mailto:|tel:)/.test(target),
          `${label}: unsafe ${attribute} target ${target}`
        );
      }
    }
  });

  test(`${label} email carries the full branded shell`, () => {
    const { html } = render();

    assert.ok(html.includes(COMPANY.logoUrl), 'branded header logo');
    assert.ok(html.includes('Connect with us'), 'social section');
    assert.ok(html.includes('All rights reserved'), 'footer copyright');
    assert.ok(html.includes(`bgcolor="${BRAND.banner}"`), 'banner band');
    assert.ok(html.includes(`bgcolor="${BRAND.social}"`), 'social band');
    assert.ok(html.includes(`bgcolor="${BRAND.footer}"`), 'footer band');
    assert.ok(html.includes('@media only screen'), 'mobile media query');
  });
}

// --- content rules ---------------------------------------------------------

test('plain-text versions keep paragraph breaks instead of collapsing', () => {
  for (const [label, render] of ALL) {
    const { text } = render();
    assert.ok(text.includes('\n\n'), `${label}: plain text should keep paragraph breaks`);
  }
});

test('all four verified social profiles are linked in every email', () => {
  for (const [label, render] of ALL) {
    const { html, text } = render();
    for (const profile of COMPANY.social) {
      assert.ok(html.includes(profile.url), `${label}: ${profile.label} link missing from HTML`);
      assert.ok(text.includes(profile.url), `${label}: ${profile.label} link missing from text`);
      assert.ok(html.includes(profile.label), `${label}: ${profile.label} label missing`);
    }
  }
});

test('visitor-facing emails never publish the internal mailbox', () => {
  const visitorFacing = [
    templates.contactVisitorEmail(CONTACT),
    templates.careerVisitorEmail(CAREER)
  ];
  for (const { html, text } of visitorFacing) {
    assert.equal(html.includes(ADMIN_EMAIL), false);
    assert.equal(text.includes(ADMIN_EMAIL), false);
  }
});

test('internal notifications do publish the mailbox so staff can reply from it', () => {
  for (const { html, text } of [templates.contactAdminEmail(CONTACT), templates.careerAdminEmail(CAREER)]) {
    assert.ok(html.includes(ADMIN_EMAIL));
    assert.ok(text.includes(ADMIN_EMAIL));
  }
});

test('the visitor email greets by name, quotes the subject and never the whole message', () => {
  const { html, text } = templates.contactVisitorEmail(CONTACT);

  assert.ok(html.includes('Hi Asha Verma,'));
  assert.ok(html.includes('Website redesign'), 'the subject is echoed for context');
  assert.equal(html.includes('Line one'), false, 'the submitted message is not echoed back');
  assert.equal(text.includes('Line two'), false);
});

test('an unparseable address is not turned into a mailto link', () => {
  const { html } = templates.contactAdminEmail({
    ...CONTACT,
    email: '"><script>alert(1)</script>'
  });

  assert.equal(/mailto:[^"]*script/i.test(html), false);
  assert.equal(/<script/i.test(html), false);
  assertBalanced(html, 'admin email with a hostile address');
  assertNoEventHandlers(html, 'admin email with a hostile address');
});

test('long values wrap instead of forcing the layout wide', () => {
  const longWord = 'a'.repeat(180);
  const { html } = templates.contactAdminEmail({
    ...CONTACT,
    email: `${longWord}@example.com`,
    message: longWord
  });

  assert.ok(html.includes('word-break:break-word'), 'detail cells must allow breaking');
  assert.ok(html.includes('overflow-wrap:break-word'));
  assert.equal(html.includes('undefined'), false);
});

test('optional fields are dropped from the detail card, not rendered blank', () => {
  const { html } = templates.contactAdminEmail({
    name: 'Minimal',
    email: 'minimal@example.com',
    subject: 'Hi',
    message: 'Body'
  });

  assert.equal(html.includes('>Phone<'), false);
  assert.equal(html.includes('>Budget<'), false);
  assert.equal(html.includes('>Timeline<'), false);
  assert.ok(html.includes('Minimal'));
  assert.equal(html.includes('No message was included.'), false, 'a message was supplied');
});
