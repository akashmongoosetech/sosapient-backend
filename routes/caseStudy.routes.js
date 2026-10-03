const express = require('express');
const router = express.Router();
const {
  createCaseStudy,
  getCaseStudies,
  getCaseStudyCategories,
  getPublishedCaseStudies,
  getPublishedCategories,
  getPublishedCaseStudyBySlug,
  getCaseStudyById,
  updateCaseStudy,
  deleteCaseStudy
} = require('../controllers/caseStudy.controller');
const { authenticateUser, requireAdmin } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');

// Public read-only endpoints (published === true enforced in controller)
router.get('/public', getPublishedCaseStudies);
router.get('/public/categories', getPublishedCategories);
router.get('/public/:slug', getPublishedCaseStudyBySlug);

// Admin-only CRUD
router.post('/', authenticateUser, requireAdmin, rateLimit({ windowMs: 60000, max: 20 }), createCaseStudy);
router.get('/categories', authenticateUser, requireAdmin, getCaseStudyCategories);
router.get('/', authenticateUser, requireAdmin, getCaseStudies);
router.get('/:id', authenticateUser, requireAdmin, getCaseStudyById);
router.put('/:id', authenticateUser, requireAdmin, rateLimit({ windowMs: 60000, max: 20 }), updateCaseStudy);
router.delete('/:id', authenticateUser, requireAdmin, deleteCaseStudy);

module.exports = router;
