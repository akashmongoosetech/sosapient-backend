const Job = require('../models/job.model');
const { sanitizeRichField } = require('../utils/sanitizeRichHtml');

// Rich-text job fields: sanitize untrusted editor HTML before persistence.
const RICH_FIELDS = ['description', 'requirements', 'responsibilities', 'benefits'];

function sanitizeJobFields(picked) {
  for (const key of RICH_FIELDS) {
    if (picked[key] !== undefined) picked[key] = sanitizeRichField(picked[key]);
  }
  return picked;
}

function errMessage(error, fallback) {
  return process.env.NODE_ENV === 'production' ? fallback : (error.message || fallback);
}

const JOB_FIELDS = ['title', 'department', 'location', 'type', 'experience', 'description', 'salary', 'requirements', 'responsibilities', 'benefits', 'status'];
function pickJob(body = {}) {
  const out = {};
  for (const k of JOB_FIELDS) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  return out;
}

// Create a new job posting
const createJob = async (req, res) => {
  try {
    const job = await Job.create(sanitizeJobFields(pickJob(req.body)));
    res.status(201).json({ success: true, data: job });
  } catch (error) {
    res.status(400).json({ success: false, message: errMessage(error, 'Error creating job') });
  }
};

// Get all job postings
const getAllJobs = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status === 'open' || status === 'closed') filter.status = status;
    const page = Math.min(Math.max(parseInt(req.query.page, 10) || 1, 1), 1000);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const jobs = await Job.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit);
    res.json({ success: true, data: jobs, pagination: { page, limit } });
  } catch (error) {
    res.status(500).json({ success: false, message: errMessage(error, 'Error fetching jobs') });
  }
};

// Get single job
const getJobById = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
    res.json({ success: true, data: job });
  } catch (error) {
    res.status(500).json({ success: false, message: errMessage(error, 'Error fetching job') });
  }
};

// Update job
const updateJob = async (req, res) => {
  try {
    const job = await Job.findByIdAndUpdate(req.params.id, sanitizeJobFields(pickJob(req.body)), { new: true, runValidators: true });
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
    res.json({ success: true, data: job });
  } catch (error) {
    res.status(400).json({ success: false, message: errMessage(error, 'Error updating job') });
  }
};

// Delete job
const deleteJob = async (req, res) => {
  try {
    const job = await Job.findByIdAndDelete(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: errMessage(error, 'Error deleting job') });
  }
};

module.exports = { createJob, getAllJobs, getJobById, updateJob, deleteJob };


