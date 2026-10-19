// Controller-level tests for POST /api/career.
//
// Same approach as the contact endpoint tests: the real model module and the
// real emailService helpers (summarise, persistDelivery) are used, while
// Career.create and sendCareerEmails are stubbed. That keeps the assertions
// honest about what a candidate submission actually triggers — and about what
// it must never return to the browser.
//
// The two messages themselves (recipients, subjects, reply-to, HTML) are
// covered in contactEmail.test.js via the real sendCareerEmails.

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const Career = require('../models/career.model');
const emailService = require('../utils/emailService');

const ORIGINAL_CREATE = Career.create;
const ORIGINAL_SEND_CAREER_EMAILS = emailService.sendCareerEmails;

const VALID_BODY = {
  name: 'Rahul Sharma',
  email: 'rahul@example.com',
  phone: '+91 91111 11111',
  position: 'Frontend Developer',
  experience: '4',
  currentCompany: 'Old Co',
  expectedSalary: 'INR 18L',
  noticePeriod: '60 days',
  coverLetter: 'I would love to join.'
};

const RESUME_TEXT = 'SECRET-RESUME-BYTES';
const FILE = {
  buffer: Buffer.from(RESUME_TEXT),
  mimetype: 'application/pdf',
  originalname: 'rahul-cv.pdf'
};

let created;
let sentCalls;

// Stubs must be installed BEFORE the controller is required, because it
// destructures these functions at require time.
function installStubs({ delivery } = {}) {
  created = [];
  sentCalls = [];

  Career.create = async (data) => {
    const doc = {
      ...data,
      _id: 'career-1',
      createdAt: new Date('2026-10-19T06:30:00Z'),
      emailDelivery: {},
      toObject() {
        const { toObject, save, ...rest } = this;
        return rest;
      },
      async save() {
        return this;
      }
    };
    created.push(doc);
    return doc;
  };

  emailService.sendCareerEmails = async (career) => {
    sentCalls.push(career);
    if (delivery) return delivery;
    return {
      visitor: { status: 'sent', messageId: 'msg-visitor', at: new Date() },
      admin: { status: 'sent', messageId: 'msg-admin', at: new Date() }
    };
  };
}

function loadController() {
  delete require.cache[require.resolve('../controllers/career.controller')];
  return require('../controllers/career.controller');
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

async function submit({ body = VALID_BODY, file = FILE } = {}) {
  const res = makeRes();
  await loadController().createCareer({ body, file }, res);
  return res;
}

beforeEach(() => {
  installStubs();
});

afterEach(() => {
  Career.create = ORIGINAL_CREATE;
  emailService.sendCareerEmails = ORIGINAL_SEND_CAREER_EMAILS;
});

// --- success path ----------------------------------------------------------

test('a valid application is stored and triggers both emails', async () => {
  const res = await submit();

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.delivery, { visitor: 'sent', admin: 'sent' });

  assert.equal(created.length, 1, 'the application is persisted');
  assert.equal(sentCalls.length, 1, 'one send call covers the applicant and the admin');
  assert.equal(sentCalls[0], created[0], 'the emails are built from the stored application');
});

test('the stored resume is handed to the model and kept out of the response', async () => {
  const res = await submit();

  assert.equal(created[0].resume.filename, 'rahul-cv.pdf');
  assert.equal(created[0].resume.contentType, 'application/pdf');
  assert.ok(Buffer.isBuffer(created[0].resume.data));

  const serialised = JSON.stringify(res.body);
  assert.equal(serialised.includes(RESUME_TEXT), false, 'resume bytes must not be returned');
  assert.deepEqual(res.body.data.resume, { filename: 'rahul-cv.pdf', contentType: 'application/pdf' });
});

test('the response carries no delivery record or provider identifiers', async () => {
  const res = await submit();

  const serialised = JSON.stringify(res.body);
  assert.equal(serialised.includes('emailDelivery'), false);
  assert.equal(serialised.includes('msg-visitor'), false);
  assert.equal(serialised.includes('msg-admin'), false);
  assert.equal(serialised.includes('admin@sosapient.in'), false);
  assert.equal(res.body.data.status, 'pending');
});

test('the delivery outcome is persisted on the application', async () => {
  await submit();

  assert.equal(created[0].emailDelivery.visitor.status, 'sent');
  assert.equal(created[0].emailDelivery.admin.status, 'sent');
});

test('an email failure still reports a successful application', async () => {
  installStubs({
    delivery: {
      visitor: { status: 'failed', code: 'http-500', at: new Date() },
      admin: { status: 'sent', at: new Date() }
    }
  });

  const res = await submit();

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.delivery, { visitor: 'failed', admin: 'sent' });
  assert.equal(JSON.stringify(res.body).includes('http-500'), false);
  assert.equal(created.length, 1, 'the application is still stored');
});

// --- input hardening -------------------------------------------------------

test('a missing resume is rejected before anything is stored or sent', async () => {
  const res = await submit({ file: null });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.message, 'Resume file is required');
  assert.equal(created.length, 0);
  assert.equal(sentCalls.length, 0);
});

test('the honeypot returns a fake success without storing or emailing', async () => {
  const res = await submit({ body: { ...VALID_BODY, website: 'http://spam.example' } });

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data, undefined, 'a bot gets no data back');
  assert.equal(created.length, 0, 'no database write for a bot');
  assert.equal(sentCalls.length, 0, 'no email for a bot');
});

test('only the documented fields are stored, and status is forced to pending', async () => {
  await submit({
    body: {
      ...VALID_BODY,
      recaptchaToken: 'token-should-not-be-stored',
      status: 'shortlisted',
      role: 'ADMIN',
      _id: 'attacker-chosen',
      __v: 99
    }
  });

  assert.equal(created[0].recaptchaToken, undefined);
  assert.equal(created[0].role, undefined);
  assert.equal(created[0].__v, undefined);
  assert.equal(created[0]._id, 'career-1', 'the database assigns the id');
  assert.equal(created[0].status, 'pending', 'the client cannot set the review status');
});

// --- failure paths ---------------------------------------------------------

test('a validation failure is reported as a bad request with a safe message', async () => {
  Career.create = async () => {
    const error = new Error('Career validation failed: email: Path `email` is required.');
    error.name = 'ValidationError';
    throw error;
  };

  const res = await submit();

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.message, 'Please check the form and try again.');
  assert.equal(JSON.stringify(res.body).includes('Career validation failed'), false);
});

test('a storage failure is reported as a server error, not a bad request', async () => {
  Career.create = async () => {
    const error = new Error('connection lost');
    error.name = 'MongoServerError';
    throw error;
  };

  const res = await submit();

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.success, false);
  assert.equal(sentCalls.length, 0);
});
