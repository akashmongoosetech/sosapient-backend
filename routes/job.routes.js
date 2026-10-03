const express = require('express');
const router = express.Router();
const { createJob, getAllJobs, getJobById, updateJob, deleteJob } = require('../controllers/job.controller');
const { authenticateUser, requireAdmin } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');

router.get('/', getAllJobs);
router.get('/:id', getJobById);
// Writes are ADMIN-only (public job board stays readable)
router.post('/', authenticateUser, requireAdmin, rateLimit({ windowMs: 60000, max: 20 }), createJob);
router.patch('/:id', authenticateUser, requireAdmin, updateJob);
router.delete('/:id', authenticateUser, requireAdmin, deleteJob);

module.exports = router;
