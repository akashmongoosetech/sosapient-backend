const express = require('express');
const router = express.Router();
const {
  getAllBlogs,
  getAllBlogsAdmin,
  getBlogBySlug,
  getBlogByIdAdmin,
  createBlog,
  updateBlog,
  deleteBlog,
  getCategories,
  getFeaturedBlogs,
  likeBlog,
  getBlogStats,
  fixPlaceholderImages,
  migrateEmbeddedImages,
  upload,
  getCommentsBySlug,
  addCommentById,
  editCommentById,
  deleteCommentById,
  commentAvatarUpload,
  voteOnComment,
  likeComment
} = require('../controllers/blog.controller');
const { authenticateUser, requireAdmin, optionalAuth } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');

function handleUploadError(err, req, res, next) {
  if (!err) return next();
  const isProd = process.env.NODE_ENV === 'production';
  return res.status(400).json({
    success: false,
    message: isProd ? 'File upload failed' : (err.message || 'File upload failed')
  });
}

// Public routes
router.get('/', getAllBlogs);
router.get('/categories', getCategories);
router.get('/featured', getFeaturedBlogs);
router.get('/stats', authenticateUser, requireAdmin, getBlogStats);
router.post('/:id/like', rateLimit({ windowMs: 60000, max: 20 }), likeBlog);
router.get('/:slug/comments', getCommentsBySlug);
router.post('/:id/comments', rateLimit({ windowMs: 60000, max: 15 }), optionalAuth, commentAvatarUpload.single('avatar'), handleUploadError, addCommentById);

// Comment edit/delete/vote/like - identity comes from JWT, never the body
router.put('/:blogId/comments/:commentId', authenticateUser, rateLimit({ windowMs: 60000, max: 15 }), editCommentById);
router.delete('/:blogId/comments/:commentId', authenticateUser, rateLimit({ windowMs: 60000, max: 15 }), deleteCommentById);

router.post('/:blogId/comments/:commentId/vote', authenticateUser, rateLimit({ windowMs: 60000, max: 30 }), voteOnComment);
router.post('/:blogId/comments/:commentId/like', authenticateUser, rateLimit({ windowMs: 60000, max: 30 }), likeComment);

// Admin routes (JWT + ADMIN role)
router.get('/admin', authenticateUser, requireAdmin, getAllBlogsAdmin);
// Full document for the edit form (must precede /:slug to avoid slug capture)
router.get('/admin/:id', authenticateUser, requireAdmin, getBlogByIdAdmin);
router.post('/', authenticateUser, requireAdmin, rateLimit({ windowMs: 60000, max: 20 }), upload.single('image'), handleUploadError, createBlog);
router.put('/:id', authenticateUser, requireAdmin, upload.single('image'), handleUploadError, updateBlog);
router.delete('/:id', authenticateUser, requireAdmin, deleteBlog);
router.post('/fix-placeholders', authenticateUser, requireAdmin, fixPlaceholderImages);
router.post('/migrate-images', authenticateUser, requireAdmin, migrateEmbeddedImages);

// This route should be last as it's most generic
router.get('/:slug', getBlogBySlug);

module.exports = router;
