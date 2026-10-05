const express = require('express');
const { authenticateUser, requireAdmin } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const {
  getLeads,
  getFilterOptions,
  getStats,
  getLeadById,
  createLead,
  updateLead,
  setLeadStatus,
  deleteLead,
  previewImport,
  importLeads,
} = require('../controllers/lead.controller');

const router = express.Router();

// Imports carry large JSON bodies — scoped limit (global is 1mb).
router.use(express.json({ limit: '10mb' }));

router.use(authenticateUser, requireAdmin);

router.get('/filter-options', getFilterOptions);
router.get('/stats', getStats);
router.post('/import/preview', rateLimit({ windowMs: 60000, max: 20 }), previewImport);
router.post('/import', rateLimit({ windowMs: 60000, max: 10 }), importLeads);
router.get('/', getLeads);
router.post('/', rateLimit({ windowMs: 60000, max: 60 }), createLead);
router.get('/:id', getLeadById);
router.put('/:id', rateLimit({ windowMs: 60000, max: 60 }), updateLead);
router.patch('/:id/status', setLeadStatus);
router.delete('/:id', deleteLead);

module.exports = router;
