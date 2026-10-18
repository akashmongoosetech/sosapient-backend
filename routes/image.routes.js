const express = require('express');
const router = express.Router();
const { getImageById } = require('../controllers/image.controller');

// Public: uploaded images are embedded by <img> tags on the public site.
router.get('/:id', getImageById);

module.exports = router;
