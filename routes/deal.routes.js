const express = require('express');
const { authenticateUser, requireAdmin } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { dealUpload, handleMulterError } = require('../middleware/upload');
const {
  getDeals,
  getDealByLead,
  getDealById,
  createDeal,
  updateDeal,
  deleteDeal,
  addRequirement,
  updateRequirement,
  deleteRequirement,
  getReports,
  addReport,
  updateReport,
  deleteReport,
  addRequirementAttachments,
  deleteRequirementAttachment,
  addReportAttachments,
  deleteReportAttachment,
  streamAttachment,
} = require('../controllers/deal.controller');

const router = express.Router();

router.use(authenticateUser, requireAdmin);

// Static paths before :id so they are never captured as IDs.
router.get('/by-lead/:leadId', getDealByLead);
router.get('/attachment/:attId', streamAttachment);
router.get('/', getDeals);
router.post('/', rateLimit({ windowMs: 60000, max: 20 }), createDeal);
router.get('/:id', getDealById);
router.put('/:id', rateLimit({ windowMs: 60000, max: 60 }), updateDeal);
router.delete('/:id', deleteDeal);

router.get('/:id/reports', getReports);
router.post('/:id/reports', rateLimit({ windowMs: 60000, max: 60 }), addReport);
router.put('/:id/reports/:reportId', rateLimit({ windowMs: 60000, max: 60 }), updateReport);
router.delete('/:id/reports/:reportId', deleteReport);

router.post('/:id/requirements', rateLimit({ windowMs: 60000, max: 60 }), addRequirement);
router.put('/:id/requirements/:reqId', rateLimit({ windowMs: 60000, max: 60 }), updateRequirement);
router.delete('/:id/requirements/:reqId', deleteRequirement);

const attachFiles = dealUpload.array('files', 5);
router.post(
  '/:id/requirements/:reqId/attachments',
  rateLimit({ windowMs: 60000, max: 20 }),
  attachFiles,
  handleMulterError,
  addRequirementAttachments
);
router.delete('/:id/requirements/:reqId/attachments/:attId', deleteRequirementAttachment);
router.post(
  '/:id/reports/:reportId/attachments',
  rateLimit({ windowMs: 60000, max: 20 }),
  attachFiles,
  handleMulterError,
  addReportAttachments
);
router.delete('/:id/reports/:reportId/attachments/:attId', deleteReportAttachment);

module.exports = router;
