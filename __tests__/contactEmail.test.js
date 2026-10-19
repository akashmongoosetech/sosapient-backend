const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const templates = require('../utils/emailTemplates');
const { sendContactEmails, sendCareerEmails, resolveAdminRecipient, summarise } = require('../utils/emailService');

const ORIGINAL_FETCH = global.fetch;
const ADMIN_EMAIL = 'admin@sosapient.in';
const ADMIN_NAME = 'Akash Raikwar';
const HR_EMAIL = 'hrd@sosapient.in';
const HR_NAME = 'Ritu Chouhan';
const VISITOR_EMAIL = 'asha@example.com';

const CONTACT = {
  name: 'Asha Verma',
  email: VISITOR_EMAIL,
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

beforeEach(() => {
  process.env.BREVO_API_KEY = 'test-api-key';
  process.env.BREVO_SENDER_EMAIL = ADMIN_EMAIL;
  process.env.BREVO_SENDER_NAME = ADMIN_NAME;
  process.env.CONTACT_ADMIN_EMAIL = ADMIN_EMAIL;
});

afterEach(() => {
  delete process.env.BREVO_API_KEY;
  delete process.env.BREVO_SENDER_EMAIL;
  delete process.env.BREVO_SENDER_NAME;
  delete process.env.CONTACT_ADMIN_EMAIL;
  delete process.env.CAREER_SENDER_EMAIL;
  delete process.env.CAREER_SENDER_NAME;
  delete process.env.CAREER_ADMIN_EMAIL;
  global.fetch = ORIGINAL_FETCH;
});

// Captures every message Brevo "receives" and lets a test fail a chosen
// recipient. 400 is used for failures so no retry backoff is incurred.
function stubBrevo({ failFor = () => false } = {}) {
  const sent = [];
  global.fetch = async (url, init) => {
    const payload = JSON.parse(init.body);
    sent.push(payload);
    if (failFor(payload.to[0].email)) {
      return { ok: false, status: 400, json: async () => ({ code: 'invalid_parameter' }) };
    }
    return { ok: true, status: 201, json: async () => ({ messageId: `id-${sent.length}` }) };
  };
  return sent;
}

// --- template content ------------------------------------------------------

test('contact visitor email escapes injected markup in every field', () => {
  const { html, text } = templates.contactVisitorEmail({
    ...CONTACT,
    name: '<script>alert(1)</script>',
    subject: '</title><img src=x onerror=alert(2)>',
    message: '<b>bold</b>'
  });

  assert.equal(html.includes('<script>alert(1)</script>'), false);
  assert.equal(html.includes('<img src=x onerror'), false);
  assert.equal(html.includes('<b>bold</b>'), false);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(2)&gt;'), 'the tag is neutralised into text');
  assert.ok(text.includes('<script>alert(1)</script>'), 'plain text is not markup, so it stays literal');
});

test('contact visitor email greets by name and states the enquiry was received', () => {
  const { subject, html, text } = templates.contactVisitorEmail(CONTACT);

  assert.equal(subject, 'Thank You for Contacting SoSapient');
  assert.ok(html.includes('Hi Asha Verma,'));
  assert.ok(text.includes('We have received your message'));
  assert.ok(html.includes('We have received your message'));
});

test('contact visitor email never publishes the internal mailbox', () => {
  const { html, text } = templates.contactVisitorEmail(CONTACT);

  assert.equal(html.includes(ADMIN_EMAIL), false);
  assert.equal(text.includes(ADMIN_EMAIL), false);
  assert.ok(html.includes('sosapient.in'), 'the website is still linked');
});

test('contact admin email carries the submitted fields and a timestamp', () => {
  const { subject, html, text } = templates.contactAdminEmail(CONTACT);

  assert.equal(subject, 'New Contact Form Inquiry — SoSapient');
  for (const value of [
    CONTACT.name,
    CONTACT.email,
    CONTACT.phone,
    CONTACT.company,
    CONTACT.subject,
    CONTACT.budget,
    CONTACT.timeline
  ]) {
    assert.ok(html.includes(value), `admin email should include ${value}`);
  }
  assert.ok(html.includes('19 Oct 2026'), 'timestamp should be rendered in IST');
  assert.ok(text.includes('Line one'));
  assert.ok(html.includes('Line one<br />Line two'), 'message line breaks are preserved');
});

test('optional fields are omitted rather than rendered empty', () => {
  const { html } = templates.contactAdminEmail({
    name: 'Minimal',
    email: 'minimal@example.com',
    subject: 'Hi',
    message: 'Body',
    createdAt: new Date()
  });

  assert.equal(html.includes('Phone'), false);
  assert.equal(html.includes('Budget'), false);
  assert.ok(html.includes('Minimal'));
});

test('career applicant email avoids the internal mailbox too', () => {
  const { html, text } = templates.careerVisitorEmail(CAREER);

  assert.equal(html.includes(ADMIN_EMAIL), false);
  assert.equal(text.includes(ADMIN_EMAIL), false);
  assert.ok(html.includes('Frontend Developer'));
});

test('no template leaks a literal "undefined" into the rendered output', () => {
  const minimalContact = { name: 'A', email: 'a@example.com', subject: 'S', message: 'M' };
  const minimalCareer = { name: 'B', email: 'b@example.com', position: 'P', experience: '1' };

  const rendered = [
    templates.contactVisitorEmail(minimalContact),
    templates.contactAdminEmail(minimalContact),
    templates.careerVisitorEmail(minimalCareer),
    templates.careerAdminEmail(minimalCareer)
  ];

  for (const { html, text } of rendered) {
    assert.equal(html.includes('undefined'), false);
    assert.equal(text.includes('undefined'), false);
  }
});

test('every message ships a plain-text alternative alongside the HTML', () => {
  const rendered = [
    templates.contactVisitorEmail(CONTACT),
    templates.contactAdminEmail(CONTACT),
    templates.careerVisitorEmail(CAREER),
    templates.careerAdminEmail(CAREER)
  ];

  for (const { subject, html, text } of rendered) {
    assert.ok(subject && subject.length > 0);
    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(text && text.trim().length > 0);
  }
});

// --- recipient handling ----------------------------------------------------

test('resolveAdminRecipient prefers CONTACT_ADMIN_EMAIL and falls back to ADMIN_EMAIL', () => {
  assert.equal(resolveAdminRecipient(), ADMIN_EMAIL);

  delete process.env.CONTACT_ADMIN_EMAIL;
  process.env.ADMIN_EMAIL = 'fallback@sosapient.in';
  assert.equal(resolveAdminRecipient(), 'fallback@sosapient.in');

  delete process.env.ADMIN_EMAIL;
  assert.equal(resolveAdminRecipient(), '');
});

test('resolveAdminRecipient sends career notices to CAREER_ADMIN_EMAIL first', () => {
  process.env.CAREER_ADMIN_EMAIL = HR_EMAIL;

  assert.equal(resolveAdminRecipient('career'), HR_EMAIL);
  assert.equal(resolveAdminRecipient('contact'), ADMIN_EMAIL, 'contact is unaffected');

  delete process.env.CAREER_ADMIN_EMAIL;
  assert.equal(resolveAdminRecipient('career'), ADMIN_EMAIL, 'falls back to the shared address');
});

// --- delivery outcomes -----------------------------------------------------

test('a valid submission sends a confirmation to the visitor and a notice to the admin', async () => {
  const sent = stubBrevo();

  const delivery = await sendContactEmails(CONTACT);

  assert.deepEqual(summarise(delivery), { visitor: 'sent', admin: 'sent' });
  assert.equal(sent.length, 2);

  const visitorMail = sent.find((m) => m.to[0].email === VISITOR_EMAIL);
  const adminMail = sent.find((m) => m.to[0].email === ADMIN_EMAIL);

  assert.equal(visitorMail.replyTo, undefined, 'the visitor is not replying to themselves');
  assert.equal(adminMail.replyTo.email, VISITOR_EMAIL, 'replying to the notice reaches the visitor');
  assert.equal(adminMail.sender.email, ADMIN_EMAIL);
});

test('a failed admin notice does not affect the visitor confirmation', async () => {
  const sent = stubBrevo({ failFor: (to) => to === ADMIN_EMAIL });

  const delivery = await sendContactEmails(CONTACT);

  assert.deepEqual(summarise(delivery), { visitor: 'sent', admin: 'failed' });
  assert.equal(delivery.admin.code, 'invalid_parameter');
  assert.equal(sent.filter((m) => m.to[0].email === VISITOR_EMAIL).length, 1);
});

test('a failed visitor confirmation does not affect the admin notice', async () => {
  const sent = stubBrevo({ failFor: (to) => to === VISITOR_EMAIL });

  const delivery = await sendContactEmails(CONTACT);

  assert.deepEqual(summarise(delivery), { visitor: 'failed', admin: 'sent' });
  assert.equal(sent.filter((m) => m.to[0].email === ADMIN_EMAIL).length, 1);
});

test('when both sends fail neither is retried into a duplicate', async () => {
  const sent = stubBrevo({ failFor: () => true });

  const delivery = await sendContactEmails(CONTACT);

  assert.deepEqual(summarise(delivery), { visitor: 'failed', admin: 'failed' });
  assert.equal(sent.length, 2, 'three attempts per message would mean 6 for a retryable failure');
});

test('missing Brevo configuration fails both sends without calling the network', async () => {
  delete process.env.BREVO_API_KEY;
  let called = false;
  global.fetch = async () => {
    called = true;
    return { ok: true, status: 201, json: async () => ({ messageId: 'x' }) };
  };

  const delivery = await sendContactEmails(CONTACT);

  assert.deepEqual(summarise(delivery), { visitor: 'failed', admin: 'failed' });
  assert.equal(delivery.visitor.code, 'not-configured');
  assert.equal(delivery.admin.code, 'not-configured');
  assert.equal(called, false);
});

test('an SMTP key is recorded with a distinct, actionable failure code', async () => {
  // This is the exact mistake that produced a bare "unauthorized" on the HTTP
  // API: an SMTP key pasted into BREVO_API_KEY.
  process.env.BREVO_API_KEY = 'xsmtpsib-' + 'a'.repeat(64) + '-' + 'b'.repeat(16);
  let called = false;
  global.fetch = async () => {
    called = true;
    return { ok: true, status: 201, json: async () => ({ messageId: 'x' }) };
  };

  const delivery = await sendContactEmails(CONTACT);

  assert.deepEqual(summarise(delivery), { visitor: 'failed', admin: 'failed' });
  assert.equal(delivery.admin.code, 'smtp-key-not-api-key');
  assert.equal(delivery.visitor.code, 'smtp-key-not-api-key');
  assert.equal(called, false);
});

test('a missing admin recipient fails only the admin notice', async () => {
  delete process.env.CONTACT_ADMIN_EMAIL;
  delete process.env.ADMIN_EMAIL;
  const sent = stubBrevo();

  const delivery = await sendContactEmails(CONTACT);

  assert.deepEqual(summarise(delivery), { visitor: 'sent', admin: 'failed' });
  assert.equal(delivery.admin.code, 'no-admin-recipient');
  assert.equal(sent.length, 1);
});

test('the chatbot path keeps its admin-only behaviour', async () => {
  const sent = stubBrevo();

  const delivery = await sendContactEmails({ ...CONTACT, source: 'AI_CHATBOT' }, { notifyVisitor: false });

  assert.deepEqual(summarise(delivery), { visitor: 'skipped', admin: 'sent' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to[0].email, ADMIN_EMAIL);
});

test('career applications send both messages and reply to the applicant', async () => {
  process.env.CAREER_SENDER_EMAIL = HR_EMAIL;
  process.env.CAREER_SENDER_NAME = HR_NAME;
  process.env.CAREER_ADMIN_EMAIL = HR_EMAIL;
  const sent = stubBrevo();

  const delivery = await sendCareerEmails(CAREER);

  assert.deepEqual(summarise(delivery), { visitor: 'sent', admin: 'sent' });

  const adminMail = sent.find((m) => m.to[0].email === HR_EMAIL);
  assert.equal(adminMail.replyTo.email, 'rahul@example.com');
  assert.equal(adminMail.sender.email, HR_EMAIL, 'career mail is sent from the HR mailbox');
});

test('contact and career mail use different senders and recipients', async () => {
  process.env.CAREER_SENDER_EMAIL = HR_EMAIL;
  process.env.CAREER_SENDER_NAME = HR_NAME;
  process.env.CAREER_ADMIN_EMAIL = HR_EMAIL;
  const sent = stubBrevo();

  const contact = await sendContactEmails(CONTACT);
  const career = await sendCareerEmails(CAREER);

  assert.deepEqual(summarise(contact), { visitor: 'sent', admin: 'sent' });
  assert.deepEqual(summarise(career), { visitor: 'sent', admin: 'sent' });

  const contactMail = sent.filter((m) => [ADMIN_EMAIL, VISITOR_EMAIL].includes(m.to[0].email));
  assert.equal(contactMail.length, 2);
  for (const mail of contactMail) {
    assert.equal(mail.sender.email, ADMIN_EMAIL);
    assert.equal(mail.sender.name, ADMIN_NAME);
  }

  const careerMail = sent.filter((m) => [HR_EMAIL, CAREER.email].includes(m.to[0].email));
  assert.equal(careerMail.length, 2);
  for (const mail of careerMail) {
    assert.equal(mail.sender.email, HR_EMAIL);
    assert.equal(mail.sender.name, HR_NAME, 'career mail is sent under the recruiter name');
  }

  assert.equal(sent.length, 4, 'no message is duplicated across the two flows');
});

test('the recruiter notice advertises the HR mailbox, not the general inbox', async () => {
  process.env.CAREER_SENDER_EMAIL = HR_EMAIL;
  process.env.CAREER_SENDER_NAME = HR_NAME;
  process.env.CAREER_ADMIN_EMAIL = HR_EMAIL;
  const sent = stubBrevo();

  await sendCareerEmails(CAREER);

  const adminMail = sent.find((m) => m.to[0].email === HR_EMAIL);
  assert.ok(adminMail.htmlContent.includes(HR_EMAIL));
  assert.ok(adminMail.textContent.includes(HR_EMAIL));
  assert.equal(adminMail.htmlContent.includes(ADMIN_EMAIL), false);
});

test('the applicant confirmation publishes neither mailbox', async () => {
  process.env.CAREER_SENDER_EMAIL = HR_EMAIL;
  process.env.CAREER_SENDER_NAME = HR_NAME;
  process.env.CAREER_ADMIN_EMAIL = HR_EMAIL;
  const sent = stubBrevo();

  await sendCareerEmails(CAREER);

  const applicantMail = sent.find((m) => m.to[0].email === CAREER.email);
  assert.equal(applicantMail.sender.email, HR_EMAIL, 'it is still sent from HR');
  assert.equal(applicantMail.htmlContent.includes(HR_EMAIL), false);
  assert.equal(applicantMail.htmlContent.includes(ADMIN_EMAIL), false);
  assert.equal(applicantMail.textContent.includes(HR_EMAIL), false);
});

test('career mail falls back to the contact mailbox when nothing else is set', async () => {
  const sent = stubBrevo();

  const delivery = await sendCareerEmails(CAREER);

  assert.deepEqual(summarise(delivery), { visitor: 'sent', admin: 'sent' });
  assert.equal(sent.length, 2);
  for (const mail of sent) {
    assert.equal(mail.sender.email, ADMIN_EMAIL);
    assert.equal(mail.sender.name, ADMIN_NAME);
  }
  assert.ok(sent.some((m) => m.to[0].email === ADMIN_EMAIL));
});

test('a career address without its own name uses the contact display name', async () => {
  process.env.CAREER_SENDER_EMAIL = HR_EMAIL;
  const sent = stubBrevo();

  await sendCareerEmails(CAREER);

  for (const mail of sent) {
    assert.equal(mail.sender.email, HR_EMAIL);
    assert.equal(mail.sender.name, ADMIN_NAME);
  }
});
