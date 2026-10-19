// Controller-level tests for POST /api/contact.
//
// The real Mongoose model and the real emailService helpers (summarise,
// persistDelivery) are used; only Contact.create and sendContactEmails are
// stubbed. That keeps the assertions honest about what the endpoint actually
// returns — and, importantly, about what it must never return.

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const Contact = require('../models/contact.model');
const emailService = require('../utils/emailService');

const ORIGINAL_CREATE = Contact.create;
const ORIGINAL_SEND_CONTACT_EMAILS = emailService.sendContactEmails;

const VALID_BODY = {
  name: 'Asha Verma',
  email: 'a@example.com',
  subject: 'Website redesign',
  message: 'Hello there'
};

let created;
let sentCalls;

// Stubs must be installed BEFORE the controller is required, because the
// controller destructures these functions at require time.
function installStubs({ delivery } = {}) {
  created = [];
  sentCalls = [];

  Contact.create = async (data) => {
    const doc = {
      ...data,
      _id: 'contact-1',
      source: 'general',
      createdAt: new Date('2026-10-19T06:30:00Z'),
      emailDelivery: {},
      toObject() {
        const { toObject, ...rest } = this;
        return rest;
      },
      async save() {
        return this;
      }
    };
    created.push(doc);
    return doc;
  };

  emailService.sendContactEmails = async (contact, options) => {
    sentCalls.push({ contact, options });
    if (delivery) return delivery;
    return {
      visitor: { status: 'sent', messageId: 'msg-1', at: new Date() },
      admin: { status: 'failed', code: 'invalid_parameter', at: new Date() }
    };
  };
}

function loadController() {
  delete require.cache[require.resolve('../controllers/contact.controller')];
  return require('../controllers/contact.controller');
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

async function submit(body) {
  const res = makeRes();
  await loadController().createContact({ body }, res);
  return res;
}

beforeEach(() => {
  installStubs();
});

afterEach(() => {
  Contact.create = ORIGINAL_CREATE;
  emailService.sendContactEmails = ORIGINAL_SEND_CONTACT_EMAILS;
});

// --- success path ----------------------------------------------------------

test('a valid submission returns 201 with the agreed contract', async () => {
  const res = await submit({
    ...VALID_BODY,
    phone: '+91 90000 00000',
    company: 'Acme',
    budget: '25k-50k',
    timeline: '1-3-months'
  });

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.message, 'Contact form submitted successfully');
  assert.deepEqual(res.body.delivery, { visitor: 'sent', admin: 'failed' });
});

test('the stored document is returned without the delivery record or provider codes', async () => {
  const res = await submit(VALID_BODY);

  const serialised = JSON.stringify(res.body);
  assert.equal(serialised.includes('emailDelivery'), false);
  assert.equal(serialised.includes('invalid_parameter'), false, 'provider code must stay server-side');
  assert.equal(serialised.includes('msg-1'), false, 'provider message id must stay server-side');
  assert.equal(serialised.includes('admin@sosapient.in'), false);
});

test('an email failure still reports a successful submission', async () => {
  installStubs({
    delivery: {
      visitor: { status: 'failed', code: 'http-500', at: new Date() },
      admin: { status: 'failed', code: 'http-500', at: new Date() }
    }
  });

  const res = await submit(VALID_BODY);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.delivery, { visitor: 'failed', admin: 'failed' });
  assert.equal(JSON.stringify(res.body).includes('http-500'), false);
});

// --- input hardening -------------------------------------------------------

test('the honeypot returns a fake success without storing or emailing', async () => {
  const res = await submit({ ...VALID_BODY, website: 'http://spam.example' });

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.success, true);
  assert.equal(created.length, 0, 'no database write for a bot');
  assert.equal(sentCalls.length, 0, 'no email for a bot');
});

test('invalid submissions are rejected before anything is stored or sent', async () => {
  const cases = [
    [{ ...VALID_BODY, name: '' }, 'Name is required'],
    [{ ...VALID_BODY, name: '   ' }, 'Name is required'],
    [{ ...VALID_BODY, email: 'not-an-address' }, 'Please enter a valid email address'],
    [{ ...VALID_BODY, email: '' }, 'Email is required'],
    [{ ...VALID_BODY, subject: '' }, 'Subject is required'],
    [{ ...VALID_BODY, message: '    ' }, 'Message is required'],
    [{ ...VALID_BODY, budget: 'free' }, 'Please choose a valid budget range'],
    [{ ...VALID_BODY, timeline: 'yesterday' }, 'Please choose a valid timeline']
  ];

  for (const [body, message] of cases) {
    const res = await submit(body);
    assert.equal(res.statusCode, 400, `expected 400 for ${JSON.stringify(body)}`);
    assert.equal(res.body.message, message);
    assert.equal(res.body.success, false);
  }

  assert.equal(created.length, 0);
  assert.equal(sentCalls.length, 0);
});

test('the email address is normalised before storage', async () => {
  await submit({ ...VALID_BODY, email: '  ASHA@Example.COM ' });

  assert.equal(created[0].email, 'asha@example.com');
});

test('newlines are stripped from header-bound fields but kept in the message', async () => {
  await submit({
    ...VALID_BODY,
    name: 'Header\r\nInjection',
    subject: 'Subject\r\nBcc: victim@example.com',
    message: 'Line one\nLine two'
  });

  assert.equal(created[0].name, 'Header Injection');
  assert.equal(created[0].subject, 'Subject Bcc: victim@example.com');
  assert.equal(created[0].message, 'Line one\nLine two');
});

test('an oversized message is capped at the documented limit', async () => {
  await submit({ ...VALID_BODY, message: 'x'.repeat(6000) });

  assert.equal(created[0].message.length, 5000);
});

test('unknown fields, including the captcha token, are never persisted', async () => {
  await submit({
    ...VALID_BODY,
    recaptchaToken: 'token-should-not-be-stored',
    role: 'ADMIN',
    status: 'reviewed',
    __v: 99
  });

  assert.equal(created[0].recaptchaToken, undefined);
  assert.equal(created[0].role, undefined);
  assert.equal(created[0].status, undefined);
  assert.equal(created[0].__v, undefined);
  assert.equal(sentCalls[0].contact.recaptchaToken, undefined);
});

// --- failure paths ---------------------------------------------------------

test('a mongoose validation error is reported as a bad request', async () => {
  Contact.create = async () => {
    const error = new Error('Contact validation failed');
    error.name = 'ValidationError';
    throw error;
  };

  const res = await submit(VALID_BODY);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.message, 'Please check the form and try again.');
});

test('a storage failure is reported as a server error, not a bad request', async () => {
  Contact.create = async () => {
    const error = new Error('connection lost');
    error.name = 'MongoServerError';
    throw error;
  };

  const res = await submit(VALID_BODY);

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.success, false);
});
