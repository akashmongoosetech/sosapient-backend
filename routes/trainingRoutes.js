const express = require('express');
const router = express.Router();
const {
  createTraining,
  getTrainings,
  getPublishedTrainings,
  getPublishedCategories,
  getPublishedTrainingBySlug,
  getPublishedTrainingById,
  getTrainingById,
  updateTraining,
  deleteTraining,
  updateTrainingStatus
} = require('../controllers/trainingController');
const { authenticateUser, requireAdmin } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');

// Public read-only endpoints (published === true enforced in controller)
router.get('/public', getPublishedTrainings);
router.get('/public/categories', getPublishedCategories);
router.get('/public/id/:id', getPublishedTrainingById);
router.get('/public/:slug', getPublishedTrainingBySlug);

// Admin-only CRUD
router.post('/', authenticateUser, requireAdmin, rateLimit({ windowMs: 60000, max: 20 }), createTraining);
router.get('/', authenticateUser, requireAdmin, getTrainings);
router.get('/:id', authenticateUser, requireAdmin, getTrainingById);
router.put('/:id', authenticateUser, requireAdmin, rateLimit({ windowMs: 60000, max: 20 }), updateTraining);
router.delete('/:id', authenticateUser, requireAdmin, deleteTraining);
router.patch('/:id/status', authenticateUser, requireAdmin, updateTrainingStatus);

module.exports = router;
