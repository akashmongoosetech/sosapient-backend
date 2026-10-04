const express = require('express');
const router = express.Router();
const {
  createCertificate,
  getCertificates,
  getCertificateById,
  updateCertificate,
  deleteCertificate,
  setCertificateStatus,
  verifyCertificate
} = require('../controllers/certificate.controller');
const { authenticateUser, requireAdmin } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');

// Public verification (no auth) — read-only, safe projection only
router.get('/verify/:certificateId', verifyCertificate);

// Admin CRUD + status control
router.post('/', authenticateUser, requireAdmin, rateLimit({ windowMs: 60000, max: 20 }), createCertificate);
router.get('/', authenticateUser, requireAdmin, getCertificates);
router.get('/:certificateId', authenticateUser, requireAdmin, getCertificateById);
router.put('/:certificateId', authenticateUser, requireAdmin, rateLimit({ windowMs: 60000, max: 20 }), updateCertificate);
router.patch('/:certificateId/revoke', authenticateUser, requireAdmin, setCertificateStatus);
router.delete('/:certificateId', authenticateUser, requireAdmin, deleteCertificate);

module.exports = router;
