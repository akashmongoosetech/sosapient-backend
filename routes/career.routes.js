const express = require('express');
const router = express.Router();
const {
  createCareer,
  getAllCareers,
  getCareer,
  updateCareer,
  deleteCareer
} = require('../controllers/career.controller');
const { upload, handleMulterError } = require('../middleware/upload');
const { authenticateUser, requireAdmin } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { sanitizeFilename } = require('../utils/sanitize');
const Career = require('../models/career.model');

// Create new career application (public, rate-limited)
router.post('/', rateLimit({ windowMs: 60000, max: 10 }), upload.single('resume'), handleMulterError, createCareer);

// Get all career applications (ADMIN only)
router.get('/', authenticateUser, requireAdmin, getAllCareers);

// Get single career application (ADMIN only)
router.get('/:id', authenticateUser, requireAdmin, getCareer);

// Get resume file (ADMIN only)
router.get('/:id/resume', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const career = await Career.findById(req.params.id);
    if (!career) {
      return res.status(404).json({
        success: false,
        message: 'Career application not found'
      });
    }

    if (!career.resume || !career.resume.data) {
      return res.status(404).json({
        success: false,
        message: 'Resume not found'
      });
    }

    res.set('Content-Type', 'application/octet-stream');
    res.set('Content-Disposition', `attachment; filename="${sanitizeFilename(career.resume.filename, 'resume.pdf')}"`);
    res.send(career.resume.data);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'production' ? 'Error fetching resume' : error.message
    });
  }
});

// Update career application status (ADMIN only)
router.patch('/:id', authenticateUser, requireAdmin, updateCareer);

// Delete career application (ADMIN only)
router.delete('/:id', authenticateUser, requireAdmin, deleteCareer);

module.exports = router;
