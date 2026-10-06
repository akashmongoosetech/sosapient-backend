const multer = require('multer');

// Configure memory storage
const storage = multer.memoryStorage();

// File filter (mimetype + extension; mimetype alone is client-controlled)
const path = require('path');
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  const allowedExt = ['.pdf', '.doc', '.docx'];
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (allowedTypes.includes(file.mimetype) && allowedExt.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF and Word documents are allowed.'), false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Error handling middleware (no sensitive logging)
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum size is 5MB.'
      });
    }
    return res.status(400).json({
      success: false,
      message: `Upload error: ${err.message}`
    });
  }
  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  next();
};

// Deal attachments: images + PDF stored as MongoDB Buffers (durable across
// deploys, same pattern as career resumes). Filenames are never trusted:
// extension + mimetype must both match, path parts are stripped.
const dealFileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
  ];
  const allowedExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf'];
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (allowedTypes.includes(file.mimetype) && allowedExt.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPG, PNG, WEBP, GIF images and PDF files are allowed.'), false);
  }
};

const dealUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: dealFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file
    files: 5,
  },
});

function safeAttachmentName(originalname, fallback) {
  const base = path.basename(String(originalname || fallback || 'file')).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 255);
  return base || fallback || 'file';
}

module.exports = { upload, handleMulterError, dealUpload, safeAttachmentName }; 