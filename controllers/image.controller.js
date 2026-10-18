const mongoose = require('mongoose');
const ImageAsset = require('../models/imageAsset.model');

// Serve a stored image by id.
//
// Asset ids are content-addressed in practice: replacing an image creates a new
// document, so a given id always maps to the same bytes. That makes it safe to
// cache aggressively. The bytes never pass through the JSON API responses.
const getImageById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ success: false, message: 'Image not found' });
    }

    const asset = await ImageAsset.findById(id).select('data contentType');
    if (!asset || !asset.data) {
      return res.status(404).json({ success: false, message: 'Image not found' });
    }

    const raw = asset.data;
    const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw.buffer || raw);

    res.set('Content-Type', asset.contentType || 'application/octet-stream');
    res.set('Content-Length', String(buffer.length));
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('X-Content-Type-Options', 'nosniff');
    return res.send(buffer);
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error loading image' });
  }
};

module.exports = { getImageById };
