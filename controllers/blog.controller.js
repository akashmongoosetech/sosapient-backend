const mongoose = require('mongoose');
const Blog = require('../models/blog.model');
const multer = require('multer');
const path = require('path');

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 100);
}
function clampInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}
function errDetail(error) {
  return process.env.NODE_ENV === 'production' ? undefined : error.message;
}

// SEO-friendly slug: lowercase, diacritics stripped, non-alphanumerics
// become single hyphens, trimmed, capped at 160 chars.
function buildSlug(value) {
  const base = String(value || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160)
    .replace(/-+$/g, '');
  return base;
}

async function ensureUniqueSlug(base, excludeId) {
  const clean = buildSlug(base) || 'post';
  let slug = clean;
  let counter = 1;
  const filter = (s) => (excludeId ? { slug: s, _id: { $ne: excludeId } } : { slug: s });
  while (await Blog.findOne(filter(slug)).select('_id')) {
    counter += 1;
    const suffix = `-${counter}`;
    slug = `${clean.slice(0, 160 - suffix.length)}${suffix}`;
  }
  return slug;
}

const SEO_STRING_FIELDS = ['metaTitle', 'metaDescription', 'canonicalUrl', 'ogTitle', 'ogDescription', 'ogImage', 'twitterTitle', 'twitterDescription', 'twitterImage'];
const SEO_MAX = { metaTitle: 120, metaDescription: 400, canonicalUrl: 500, ogTitle: 120, ogDescription: 400, ogImage: 2000, twitterTitle: 120, twitterDescription: 400, twitterImage: 2000 };

function sanitizeSeo(input) {
  const out = { metaTitle: '', metaDescription: '', keywords: [] };
  if (!input || typeof input !== 'object') return out;
  for (const k of SEO_STRING_FIELDS) {
    if (typeof input[k] === 'string') {
      out[k] = input[k].trim().slice(0, SEO_MAX[k]);
    }
  }
  return out;
}

// Helper to normalize any input into an array of trimmed strings
function normalizeStringArray(input) {
  if (!input) return [];
  let arr = [];
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed)) arr = parsed;
      else arr = String(input).split(',');
    } catch {
      arr = String(input).split(',');
    }
  } else if (Array.isArray(input)) {
    arr = input;
  } else if (typeof input === 'object') {
    // Convert object values to array if needed
    arr = Object.values(input);
  }
  return arr
    .map(v => (v == null ? '' : String(v)))
    .map(v => v.trim())
    .filter(v => v.length > 0);
}

// Configure multer for image uploads (random hex names; ext allowlisted, never trusted as executable)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/blog-images/');
  },
  filename: function (req, file, cb) {
    const crypto = require('crypto');
    const ext = String(path.extname(file.originalname || '')).toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext) ? ext : '.bin';
    cb(null, 'blog-' + Date.now() + '-' + crypto.randomBytes(8).toString('hex') + safeExt);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // Increased from 5MB to 10MB for blog images
    fieldSize: 50 * 1024 * 1024, // Increased from 10MB to 50MB for very long blog content
    fields: 50, // Increased from 20 to 50 to handle SEO fields and other data
    parts: 50 // Increased number of allowed parts
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Configure multer for comment avatar uploads (random hex names; ext allowlisted)
const commentAvatarStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/comment-avatars/');
  },
  filename: function (req, file, cb) {
    const crypto = require('crypto');
    const ext = String(path.extname(file.originalname || '')).toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext) ? ext : '.bin';
    cb(null, 'avatar-' + Date.now() + '-' + crypto.randomBytes(8).toString('hex') + safeExt);
  }
});

const commentAvatarUpload = multer({
  storage: commentAvatarStorage,
  limits: {
    fileSize: 3 * 1024 * 1024 // 3MB for avatar
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  }
});

// Get all published blogs with pagination and filtering
const getAllBlogs = async (req, res) => {
  try {
    const page = clampInt(req.query.page, 1, 1, 1000);
    const limit = clampInt(req.query.limit, 10, 1, 50);
    const skip = (page - 1) * limit;

    const { category, search, featured, author } = req.query;

    // Build filter object
    const filter = { status: 'published' };

    if (category && category !== 'All') {
      filter.category = String(category).slice(0, 60);
    }

    if (featured === 'true') {
      filter.featured = true;
    }

    if (author) {
      filter['author.name'] = new RegExp(escapeRegExp(author), 'i');
    }

    if (search) {
      filter.$text = { $search: String(search).slice(0, 200) };
    }

    const blogs = await Blog.find(filter)
      .sort({ publishedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Blog.countDocuments(filter);

    res.json({
      success: true,
      data: blogs,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalBlogs: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching blogs',
      error: errDetail(error)
    });
  }
};

// Get all blogs for admin (no status filter)
const getAllBlogsAdmin = async (req, res) => {
  try {
    const page = clampInt(req.query.page, 1, 1, 1000);
    const limit = clampInt(req.query.limit, 50, 1, 100);
    const skip = (page - 1) * limit;

    const { category, search, featured, author, status } = req.query;

    // Build filter object - no default status filter for admin
    const filter = {};

    if (status && status !== 'all') {
      filter.status = String(status).slice(0, 20);
    }

    if (category && category !== 'All') {
      filter.category = String(category).slice(0, 60);
    }

    if (featured === 'true') {
      filter.featured = true;
    }

    if (author) {
      filter['author.name'] = new RegExp(escapeRegExp(author), 'i');
    }

    if (search) {
      filter.$text = { $search: String(search).slice(0, 200) };
    }

    const blogs = await Blog.find(filter)
      .sort({ createdAt: -1 }) // Sort by creation date for admin
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Blog.countDocuments(filter);

    res.json({
      success: true,
      data: blogs,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalBlogs: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching blogs for admin',
      error: errDetail(error)
    });
  }
};

// Test endpoint to verify comment like functionality
const testLikeComment = async (req, res) => {
  try {
    console.log('=== TEST LIKE COMMENT ENDPOINT ===');
    console.log('Request params:', req.params);
    console.log('Request body:', req.body);
    
    const { blogId, commentId } = req.params;
    const { userId } = req.body || {};
    
    // Basic validation
    if (!mongoose.Types.ObjectId.isValid(blogId)) {
      return res.status(400).json({ success: false, message: 'Invalid blog ID' });
    }
    
    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({ success: false, message: 'Invalid comment ID' });
    }
    
    // Find the blog and comment
    const blog = await Blog.findById(blogId);
    if (!blog) {
      return res.status(404).json({ success: false, message: 'Blog not found' });
    }
    
    const comment = blog.comments.find(c => c._id.toString() === commentId);
    if (!comment) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }
    
    console.log('Found comment:', {
      _id: comment._id,
      likeCount: comment.likeCount,
      likedBy: comment.likedBy
    });
    
    return res.json({
      success: true,
      message: 'Test successful',
      data: {
        blog: { _id: blog._id, title: blog.title },
        comment: {
          _id: comment._id,
          likeCount: comment.likeCount || 0,
          likedBy: comment.likedBy || [],
          hasLiked: (comment.likedBy || []).includes(userId)
        }
      }
    });
    
  } catch (error) {
    console.error('Test endpoint error:', error);
    return res.status(500).json({
      success: false,
      message: 'Test endpoint error',
      error: errDetail(error)
    });
  }
};

// Like/Unlike a specific comment - Simple toggle system
const likeComment = async (req, res) => {
  try {
    const { blogId, commentId } = req.params;
    const userId = req.auth && req.auth.userId;

    console.log('=== LIKE COMMENT REQUEST ===');
    console.log('Blog ID:', blogId);
    console.log('Comment ID:', commentId);

    // Validate required parameters with proper MongoDB ObjectId validation
    if (!blogId || !mongoose.Types.ObjectId.isValid(blogId)) {
      console.log('Invalid blog ID format');
      return res.status(400).json({
        success: false,
        message: 'Invalid blog ID format'
      });
    }
    if (!commentId || !mongoose.Types.ObjectId.isValid(commentId)) {
      console.log('Invalid comment ID format');
      return res.status(400).json({
        success: false,
        message: 'Invalid comment ID format'
      });
    }
    if (!userId) {
      console.log('Missing authenticated user');
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: authentication required'
      });
    }

    // Create ObjectIds for proper comparison
    const blogObjectId = new mongoose.Types.ObjectId(blogId);
    const commentObjectId = new mongoose.Types.ObjectId(commentId);

    // Find the blog with the specific comment
    console.log('Finding blog and comment...');
    const blog = await Blog.findOne({
      _id: blogObjectId,
      'comments._id': commentObjectId
    });

    if (!blog) {
      console.log('Blog or comment not found');
      return res.status(404).json({ 
        success: false, 
        message: 'Blog or comment not found' 
      });
    }

    // Find the specific comment in the blog
    const comment = blog.comments.find(c => c._id.toString() === commentId);
    if (!comment) {
      console.log('Comment not found in blog');
      return res.status(404).json({ 
        success: false, 
        message: 'Comment not found in this blog post' 
      });
    }

    console.log('Current comment state:', {
      likeCount: comment.likeCount || 0,
      likedBy: comment.likedBy || []
    });

    // Check if user has already liked this comment
    const hasLiked = Array.isArray(comment.likedBy) && comment.likedBy.includes(userId);
    console.log('User has already liked:', hasLiked);

    let updateOperation;
    let message;
    
    if (hasLiked) {
      // Remove like
      updateOperation = {
        $pull: { 'comments.$.likedBy': userId },
        $inc: { 'comments.$.likeCount': -1 }
      };
      message = 'Comment unliked successfully';
    } else {
      // Add like
      updateOperation = {
        $addToSet: { 'comments.$.likedBy': userId },
        $inc: { 'comments.$.likeCount': 1 }
      };
      message = 'Comment liked successfully';
    }

    console.log('Update operation:', updateOperation);

    // Perform the update
    const updatedBlog = await Blog.findOneAndUpdate(
      {
        _id: blogObjectId,
        'comments._id': commentObjectId
      },
      updateOperation,
      { 
        new: true,
        select: 'comments'
      }
    );

    if (!updatedBlog) {
      console.log('Failed to update blog');
      return res.status(404).json({ 
        success: false, 
        message: 'Failed to update comment' 
      });
    }

    // Find the updated comment
    const updatedComment = updatedBlog.comments.find(c => c._id.toString() === commentId);
    if (!updatedComment) {
      console.log('Updated comment not found');
      return res.status(404).json({ 
        success: false, 
        message: 'Updated comment not found' 
      });
    }

    console.log('Updated comment state:', {
      likeCount: updatedComment.likeCount || 0,
      likedBy: updatedComment.likedBy || []
    });
    
    return res.status(200).json({
      success: true,
      message,
      data: {
        commentId: commentId,
        likeCount: Math.max(0, updatedComment.likeCount || 0),
        isLiked: !hasLiked,
        likedBy: updatedComment.likedBy || []
      }
    });

  } catch (error) {
    console.error('=== ERROR IN LIKE COMMENT ===');
    console.error('Error details:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    // Handle specific MongoDB errors
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid ID format provided',
        error: 'Invalid ObjectId'
      });
    }
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        error: errDetail(error)
      });
    }

    if (error.name === 'MongoServerError' || error.name === 'MongoError') {
      return res.status(500).json({
        success: false,
        message: 'Database operation failed',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Database error'
      });
    }

    // Generic server error for unexpected issues
    return res.status(500).json({
      success: false,
      message: 'Internal server error while updating comment like',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Contact support if this persists'
    });
  }
};

// Vote on a specific comment (like/dislike) identified by its subdocument _id
// Body expects an 'action' field: 'like' | 'unlike' | 'dislike' | 'undislike' | 'switchToLike' | 'switchToDislike'
const voteOnComment = async (req, res) => {
  try {
    const { blogId, commentId } = req.params;
    const { action } = req.body || {};
    const voterId = req.auth && req.auth.userId;

    if (!blogId || !blogId.match(/^[0-9a-fA-F]{24}$/) || !commentId || !commentId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ success: false, message: 'Invalid blog or comment ID' });
    }
    if (!voterId) {
      return res.status(401).json({ success: false, message: 'Unauthorized: authentication required' });
    }

    // Load current comment to determine membership and compute idempotent deltas
    const holder = await Blog.findOne({ _id: blogId, 'comments._id': commentId }, { 'comments.$': 1 }).lean();
    if (!holder || !holder.comments || holder.comments.length === 0) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }
    const cur = holder.comments[0];
    const hasLiked = Array.isArray(cur.likedBy) && cur.likedBy.includes(voterId);
    const hasDisliked = Array.isArray(cur.dislikedBy) && cur.dislikedBy.includes(voterId);

    let inc = {};
    const update = { $set: {}, $inc: {}, $addToSet: {}, $pull: {} };

    switch (action) {
      case 'like':
        if (!hasLiked) {
          update.$addToSet['comments.$.likedBy'] = voterId;
          update.$inc['comments.$.likeCount'] = 1;
        }
        break;
      case 'unlike':
        if (hasLiked) {
          update.$pull['comments.$.likedBy'] = voterId;
          update.$inc['comments.$.likeCount'] = -1;
        }
        break;
      case 'dislike':
        if (!hasDisliked) {
          update.$addToSet['comments.$.dislikedBy'] = voterId;
          update.$inc['comments.$.dislikeCount'] = 1;
        }
        break;
      case 'undislike':
        if (hasDisliked) {
          update.$pull['comments.$.dislikedBy'] = voterId;
          update.$inc['comments.$.dislikeCount'] = -1;
        }
        break;
      case 'switchToLike':
        if (hasDisliked && !hasLiked) {
          update.$pull['comments.$.dislikedBy'] = voterId;
          update.$addToSet['comments.$.likedBy'] = voterId;
          update.$inc['comments.$.likeCount'] = 1;
          update.$inc['comments.$.dislikeCount'] = -1;
        } else if (!hasLiked) {
          update.$addToSet['comments.$.likedBy'] = voterId;
          update.$inc['comments.$.likeCount'] = 1;
        }
        break;
      case 'switchToDislike':
        if (hasLiked && !hasDisliked) {
          update.$pull['comments.$.likedBy'] = voterId;
          update.$addToSet['comments.$.dislikedBy'] = voterId;
          update.$inc['comments.$.likeCount'] = -1;
          update.$inc['comments.$.dislikeCount'] = 1;
        } else if (!hasDisliked) {
          update.$addToSet['comments.$.dislikedBy'] = voterId;
          update.$inc['comments.$.dislikeCount'] = 1;
        }
        break;
      default:
        return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    // Clean empty operators to avoid Mongo errors
    Object.keys(update).forEach(op => { if (Object.keys(update[op]).length === 0) delete update[op]; });

    // If no actual change, return current counts
    if (Object.keys(update).length === 0) {
      return res.json({ success: true, data: { likeCount: cur.likeCount || 0, dislikeCount: cur.dislikeCount || 0 } });
    }

    const updated = await Blog.findOneAndUpdate({ _id: blogId, 'comments._id': commentId }, update, { new: true, projection: { comments: { $elemMatch: { _id: commentId } } } });
    const c = updated.comments[0];
    return res.json({ success: true, data: { likeCount: c.likeCount || 0, dislikeCount: c.dislikeCount || 0 } });
    } catch (error) {
    return res.status(500).json({ success: false, message: 'Error updating comment vote', error: errDetail(error) });
  }
};

// Get single blog by slug
const getBlogBySlug = async (req, res) => {
  try {
    const slug = String(req.params.slug || '').toLowerCase();
    const blog = await Blog.findOne({ slug, status: 'published' });

    if (!blog) {
      // Slug history: renamed posts resolve old URLs without leaking drafts
      const moved = await Blog.findOne({ previousSlugs: slug, status: 'published' }).select('slug');
      if (moved) {
        return res.json({
          success: true,
          redirectTo: moved.slug,
          message: 'Blog slug has changed'
        });
      }
      return res.status(404).json({
        success: false,
        message: 'Blog post not found'
      });
    }

    // Increment views
    await Blog.findByIdAndUpdate(blog._id, { $inc: { views: 1 } });

    res.json({
      success: true,
      data: blog
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching blog',
      error: errDetail(error)
    });
  }
};

// Create new blog post
const createBlog = async (req, res) => {
  try {
    console.log('Creating blog with data:', req.body);
    
    const {
      title,
      excerpt,
      content,
      category,
      tags,
      author,
      status = 'published',
      featured = false,
      seo,
      sections = [],
      imageAlt = ''
    } = req.body;
    const requestedSlug = typeof req.body.slug === 'string' ? req.body.slug : '';
    
    // Enhanced validation for long content
    if (!title || !excerpt || !content) {
      return res.status(400).json({
        success: false,
        message: 'Title, excerpt, and content are required'
      });
    }
    
    // Validate field lengths with new limits
    if (title.length > 500) {
      return res.status(400).json({
        success: false,
        message: 'Title cannot exceed 500 characters'
      });
    }
    
    if (excerpt.length > 1000) {
      return res.status(400).json({
        success: false,
        message: 'Excerpt cannot exceed 1000 characters'
      });
    }
    
    // Content length check (reasonable limit to prevent memory issues)
    if (content.length > 10000000) { // 10MB text limit
      return res.status(400).json({
        success: false,
        message: 'Content is too large. Please reduce the content size.'
      });
    }
    
    // Handle image upload
    let imageUrl = req.body.image;
    if (req.file) {
      imageUrl = `/uploads/blog-images/${req.file.filename}`;
    }
    
    // Generate unique slug (manual override wins, backend always finalizes)
    const slug = await ensureUniqueSlug(requestedSlug.trim() ? requestedSlug : title);
    if (!slug) {
      return res.status(400).json({
        success: false,
        message: 'Could not generate a valid slug from the title'
      });
    }
    
    // Parse tags properly
    let parsedTags = normalizeStringArray(tags);
    // CSV fallback if tags couldn't be parsed from main field
    if (parsedTags.length === 0 && typeof req.body.tagsCsv === 'string') {
      parsedTags = normalizeStringArray(req.body.tagsCsv);
    }
    console.log('Final parsed tags:', parsedTags);
    
    // Parse author properly
    let parsedAuthor = author;
    console.log('=== CREATE BLOG AUTHOR PROCESSING ===');
    console.log('Raw author received:', author, 'Type:', typeof author);
    
    if (author !== undefined && author !== null) {
      if (typeof author === 'string') {
        try {
          parsedAuthor = JSON.parse(author);
          console.log('JSON parsed author:', parsedAuthor);
        } catch (e) {
          console.error('Error parsing author:', e);
          // If it's a plain string, treat it as author name
          parsedAuthor = {
            name: author,
            email: 'admin@sosapient.com',
            image: 'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&dpr=1'
          };
          console.log('Created author from string:', parsedAuthor);
        }
      } else if (typeof author === 'object') {
        parsedAuthor = author;
        console.log('Author already object:', parsedAuthor);
      }
    } else {
      console.log('Author is undefined/null, setting default');
      parsedAuthor = {
        name: 'Admin User',
        email: 'admin@sosapient.com',
        image: 'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&dpr=1'
      };
    }
    
    // Ensure author has required fields
    if (!parsedAuthor.name) parsedAuthor.name = 'Admin User';
    if (!parsedAuthor.email) parsedAuthor.email = 'admin@sosapient.com';
    if (!parsedAuthor.image) parsedAuthor.image = 'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&dpr=1';
    
    console.log('Final parsed author:', parsedAuthor);
    
    let parsedSections = sections;
    if (typeof sections === 'string') {
      try {
        parsedSections = JSON.parse(sections);
      } catch {
        parsedSections = [];
      }
    }
    
    // Parse SEO properly
    let parsedSeo = sanitizeSeo(typeof seo === 'string' ? (() => { try { return JSON.parse(seo); } catch { return {}; } })() : (seo || {}));

    // Normalize SEO keywords array
    parsedSeo.keywords = normalizeStringArray((typeof seo === 'string' ? (() => { try { return JSON.parse(seo).keywords; } catch { return []; } })() : seo?.keywords));
    // CSV fallback for SEO keywords
    if ((!Array.isArray(parsedSeo.keywords) || parsedSeo.keywords.length === 0) && typeof req.body.seoKeywordsCsv === 'string') {
      parsedSeo.keywords = normalizeStringArray(req.body.seoKeywordsCsv);
    }

    const cleanImageAlt = String(imageAlt || '').trim().slice(0, 200);
    const cleanSections = Array.isArray(parsedSections) ? parsedSections.map((s) => ({
      heading: typeof s.heading === 'string' ? s.heading : '',
      content: typeof s.content === 'string' ? s.content : '',
      image: typeof s.image === 'string' ? s.image : '',
      imageAlt: typeof s.imageAlt === 'string' ? s.imageAlt.trim().slice(0, 200) : ''
    })) : [];

    const blog = new Blog({
      title,
      slug,
      excerpt,
      content,
      sections: cleanSections,
      image: imageUrl || 'https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?w=800&h=400&fit=crop&crop=center',
      imageAlt: cleanImageAlt,
      category,
      tags: parsedTags,
      author: parsedAuthor,
      status,
      featured: featured === 'true' || featured === true,
      seo: parsedSeo
    });

    try {
      await blog.save();
    } catch (saveError) {
      // Rare concurrent-duplicate race: retry once with a fresh unique slug
      if (saveError && saveError.code === 11000 && saveError.keyPattern && saveError.keyPattern.slug) {
        blog.slug = await ensureUniqueSlug(`${slug}-${Date.now().toString(36)}`);
        await blog.save();
      } else {
        throw saveError;
      }
    }

    try {
      require('../services/ragIndex').queueBlogIndex(blog);
    } catch (e) {
      // indexing is best-effort only
    }

    res.status(201).json({
      success: true,
      message: 'Blog post created successfully',
      data: blog
    });
  } catch (error) {
    console.error('Error creating blog post:', error.message || error);
    if (error && error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'A blog with this slug already exists'
      });
    }
    res.status(400).json({
      success: false,
      message: 'Error creating blog post',
      error: errDetail(error)
    });
  }
};

// Update blog post
const BLOG_WRITE_FIELDS = ['title', 'slug', 'excerpt', 'content', 'image', 'imageAlt', 'author', 'category', 'tags', 'tagsCsv', 'status', 'featured', 'publishedAt', 'sections', 'seo', 'seoKeywordsCsv', 'readTime'];
function pickBlogWrite(body = {}) {
  const out = {};
  for (const k of BLOG_WRITE_FIELDS) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  return out;
}

const updateBlog = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate blog ID format
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid blog ID format'
      });
    }

    const updateData = pickBlogWrite(req.body);
    
    // Handle image upload
    if (req.file) {
      updateData.image = `/uploads/blog-images/${req.file.filename}`;
    }
    
    // Parse JSON strings if they exist with better error handling
    try {
      if (updateData.author && typeof updateData.author === 'string') {
        try {
          updateData.author = JSON.parse(updateData.author);
        } catch (parseError) {
          // If it's a plain string, treat it as author name
          updateData.author = {
            name: updateData.author,
            email: 'admin@sosapient.com',
            image: 'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&dpr=1'
          };
        }

        // Ensure author has required fields
        if (typeof updateData.author === 'object') {
          if (!updateData.author.name) updateData.author.name = 'Admin User';
          if (!updateData.author.email) updateData.author.email = 'admin@sosapient.com';
          if (!updateData.author.image) updateData.author.image = 'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&dpr=1';
        }
      }
    } catch (error) {
      // Don't fail the entire update for author issues, just use default
      updateData.author = {
        name: 'Admin User',
        email: 'admin@sosapient.com',
        image: 'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&dpr=1'
      };
    }

    // Parse tags properly - same logic as createBlog
    let parsedTags = normalizeStringArray(updateData.tags);
    // CSV fallback if tags couldn't be parsed from main field
    if (parsedTags.length === 0 && typeof updateData.tagsCsv === 'string') {
      parsedTags = normalizeStringArray(updateData.tagsCsv);
    }
    updateData.tags = parsedTags;

    // Parse SEO properly - same logic as createBlog, with length validation
    let rawSeo = updateData.seo;
    if (typeof rawSeo === 'string') {
      try {
        rawSeo = JSON.parse(rawSeo);
      } catch (error) {
        rawSeo = {};
      }
    }
    const parsedSeo = sanitizeSeo(rawSeo && typeof rawSeo === 'object' ? rawSeo : {});

    // Normalize SEO keywords array
    const rawKeywords = rawSeo && typeof rawSeo === 'object' ? rawSeo.keywords : [];
    parsedSeo.keywords = normalizeStringArray(rawKeywords);
    // CSV fallback for SEO keywords
    if ((!Array.isArray(parsedSeo.keywords) || parsedSeo.keywords.length === 0) && typeof updateData.seoKeywordsCsv === 'string') {
      parsedSeo.keywords = normalizeStringArray(updateData.seoKeywordsCsv);
    }

    updateData.seo = parsedSeo;

    // Handle sections parsing (with imageAlt passthrough)
    if (updateData.sections && typeof updateData.sections === 'string') {
      try {
        updateData.sections = JSON.parse(updateData.sections);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Invalid sections data format',
          error: errDetail(error)
        });
      }
    }
    if (Array.isArray(updateData.sections)) {
      updateData.sections = updateData.sections.map((s) => ({
        heading: typeof s.heading === 'string' ? s.heading : '',
        content: typeof s.content === 'string' ? s.content : '',
        image: typeof s.image === 'string' ? s.image : '',
        imageAlt: typeof s.imageAlt === 'string' ? s.imageAlt.trim().slice(0, 200) : ''
      }));
    }
    if (updateData.imageAlt !== undefined) {
      updateData.imageAlt = String(updateData.imageAlt || '').trim().slice(0, 200);
    }

    // Ensure readTime is a string
    if (updateData.readTime !== undefined) {
      if (Array.isArray(updateData.readTime)) {
        updateData.readTime = updateData.readTime.filter(item => item && typeof item === 'string').join(' ') || '';
      } else if (typeof updateData.readTime !== 'string') {
        updateData.readTime = String(updateData.readTime);
      }
    }
    
    // Handle boolean fields
    if (updateData.featured !== undefined) {
      updateData.featured = updateData.featured === 'true' || updateData.featured === true;
    }
    
    // Handle slug: manual override wins; otherwise regenerate only if title changed
    {
      const currentBlog = await Blog.findById(id).select('title slug previousSlugs');

      if (!currentBlog) {
        return res.status(404).json({
          success: false,
          message: 'Blog post not found'
        });
      }

      const manualSlug = typeof updateData.slug === 'string' ? buildSlug(updateData.slug) : '';
      const titleChanged = typeof updateData.title === 'string' && updateData.title !== currentBlog.title;
      let nextSlug = '';
      if (manualSlug && manualSlug !== currentBlog.slug) {
        nextSlug = await ensureUniqueSlug(manualSlug, id);
      } else if (!manualSlug && titleChanged && updateData.title) {
        nextSlug = await ensureUniqueSlug(updateData.title, id);
      }
      if (!manualSlug) delete updateData.slug;
      if (nextSlug && nextSlug !== currentBlog.slug) {
        updateData.slug = nextSlug;
        const history = Array.isArray(currentBlog.previousSlugs) ? currentBlog.previousSlugs : [];
        if (!history.includes(currentBlog.slug)) {
          history.push(currentBlog.slug);
        }
        updateData.previousSlugs = history.slice(-20);
      } else {
        delete updateData.previousSlugs;
      }
    }

    // Remove undefined fields to avoid validation issues, but preserve tags and seo even if empty
    Object.keys(updateData).forEach(key => {
      if (key === 'tags' || key === 'seo') {
        // Keep tags and seo fields even if empty
        return;
      }
      if (updateData[key] === undefined || updateData[key] === null || updateData[key] === '') {
        delete updateData[key];
      }
    });

    // Ensure tags and seo are always included in the update, even if empty
    if (!updateData.hasOwnProperty('tags')) {
      updateData.tags = [];
    }
    if (!updateData.hasOwnProperty('seo')) {
      updateData.seo = { metaTitle: '', metaDescription: '', keywords: [] };
    }
    // Drop CSV helpers before Mongo update
    delete updateData.tagsCsv;
    delete updateData.seoKeywordsCsv;

    const blog = await Blog.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true
    });

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found'
      });
    }

    try {
      require('../services/ragIndex').queueBlogIndex(blog);
    } catch (e) {
      // indexing is best-effort only
    }

    res.json({
      success: true,
      message: 'Blog post updated successfully',
      data: blog
    });
  } catch (error) {
    // Check for validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors,
        error: errDetail(error)
      });
    }

    // Check for cast errors (invalid ObjectId)
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid blog ID',
        error: errDetail(error)
      });
    }

    res.status(400).json({
      success: false,
      message: 'Error updating blog post',
      error: errDetail(error)
    });
  }
};

// Delete blog post (also removes orphaned local upload file)
const deleteBlog = async (req, res) => {
  try {
    const { id } = req.params;

    const blog = await Blog.findByIdAndDelete(id);

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found'
      });
    }

    // Best-effort cleanup of local upload files (featured + section images)
    try {
      const fs = require('fs');
      const localFiles = [blog.image, ...(Array.isArray(blog.sections) ? blog.sections.map((s) => s.image) : [])]
        .filter((p) => typeof p === 'string' && p.startsWith('/uploads/'));
      for (const p of [...new Set(localFiles)]) {
        try {
          const filePath = path.join(__dirname, '..', p);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (e) {
          // per-file best effort
        }
      }
    } catch (e) {
      // best-effort cleanup only
    }

    try {
      require('../services/ragIndex').queueBlogRemove(id);
    } catch (e) {
      // indexing is best-effort only
    }

    res.json({
      success: true,
      message: 'Blog post deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting blog post',
      error: errDetail(error)
    });
  }
};

// Get comments for a blog by slug (only approved comments)
const getCommentsBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    if (!slug) {
      return res.status(400).json({ success: false, message: 'Missing blog slug' });
    }

    const blog = await Blog.findOne({ slug, status: 'published' }).select('comments');
    if (!blog) {
      return res.status(404).json({ success: false, message: 'Blog post not found' });
    }

    // Return approved comments sorted by createdAt desc
    const comments = (blog.comments || [])
      .filter(c => c.approved !== false)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ success: true, data: comments });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching comments', error: errDetail(error) });
  }
};

// Add a new comment by blog ID
const addCommentById = async (req, res) => {
  try {
    const { isHoneypotFilled } = require('../utils/honeypot');
    if (isHoneypotFilled(req.body)) {
      return res.status(201).json({ success: true, message: 'Comment added' });
    }
    const { id } = req.params;
    const { name, email, comment } = req.body || {};

    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ success: false, message: 'Invalid blog ID' });
    }
    if (!name || !email || !comment) {
      return res.status(400).json({ success: false, message: 'Name, email and comment are required' });
    }
    const emailOk = /.+@.+\..+/.test(String(email));
    if (!emailOk) {
      return res.status(400).json({ success: false, message: 'Invalid email address' });
    }

    // Build new comment (ownership derived server-side only; never trust client userId)
    const newComment = {
      _id: new mongoose.Types.ObjectId(),
      name: String(name).trim().slice(0, 100),
      email: String(email).trim().toLowerCase().slice(0, 160),
      comment: String(comment).trim().slice(0, 5000),
      userId: null, // public comments are anonymous; ownership assigned only via authenticated edit flow
      approved: true,
      createdAt: new Date()
    };

    // If avatar uploaded, set path
    if (req.file && req.file.filename) {
      newComment.avatar = `/uploads/comment-avatars/${req.file.filename}`;
    }

    const blog = await Blog.findByIdAndUpdate(
      id,
      { $push: { comments: newComment } },
      { new: true, select: 'comments' }
    );

    if (!blog) {
      return res.status(404).json({ success: false, message: 'Blog post not found' });
    }

    res.status(201).json({ success: true, message: 'Comment added', data: newComment });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error adding comment', error: errDetail(error) });
  }
};

// Edit a comment by comment ID
const editCommentById = async (req, res) => {
  try {
    const { blogId, commentId } = req.params;
    const { comment } = req.body;
    const userId = req.auth && req.auth.userId;
    const isAdmin = req.user && req.user.role === 'ADMIN';

    // Validate required fields
    if (!blogId || !mongoose.Types.ObjectId.isValid(blogId)) {
      return res.status(400).json({ success: false, message: 'Invalid blog ID format' });
    }
    if (!commentId || !mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({ success: false, message: 'Invalid comment ID format' });
    }
    if (!comment || !comment.trim()) {
      return res.status(400).json({ success: false, message: 'Comment content is required' });
    }
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized: authentication required' });
    }

    // Validate comment length
    if (comment.trim().length > 5000) {
      return res.status(400).json({ success: false, message: 'Comment cannot exceed 5000 characters' });
    }

    console.log('Looking for blog with comment...');
    // Find the blog and verify comment ownership
    // First, let's check if the comment exists at all
    const blogWithComment = await Blog.findOne({
      _id: blogId,
      'comments._id': commentId
    });
    
    if (!blogWithComment) {
      return res.status(404).json({ 
        success: false, 
        message: 'Comment not found' 
      });
    }
    
    // Find the specific comment
    const targetComment = blogWithComment.comments.find(c => c._id.toString() === commentId);
    if (!targetComment) {
      return res.status(404).json({ 
        success: false, 
        message: 'Comment not found' 
      });
    }
    
    // Ownership: owner or ADMIN only. Legacy comments without userId are ADMIN-only.
    const ownerId = targetComment.userId ? String(targetComment.userId) : null;
    if (!isAdmin && (!ownerId || ownerId !== String(userId))) {
      return res.status(403).json({ 
        success: false, 
        message: 'You do not have permission to edit this comment' 
      });
    }

    // Update the comment - use the found blog for the update
    const updatedBlog = await Blog.findOneAndUpdate(
      {
        _id: blogId,
        'comments._id': commentId
      },
      {
        $set: {
          'comments.$.comment': comment.trim(),
          'comments.$.updatedAt': new Date()
        }
      },
      { new: true, select: 'comments' }
    );

    if (!updatedBlog) {
      return res.status(404).json({ success: false, message: 'Failed to update comment' });
    }

    // Find the updated comment
    const updatedComment = updatedBlog.comments.find(c => c._id.toString() === commentId);
    
    res.json({ 
      success: true, 
      message: 'Comment updated successfully', 
      data: updatedComment 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error editing comment', 
      error: errDetail(error) 
    });
  }
};

// Delete a comment by comment ID
const deleteCommentById = async (req, res) => {
  try {
    const { blogId, commentId } = req.params;
    const userId = req.auth && req.auth.userId;
    const isAdmin = req.user && req.user.role === 'ADMIN';

    // Validate required fields
    if (!blogId || !mongoose.Types.ObjectId.isValid(blogId)) {
      return res.status(400).json({ success: false, message: 'Invalid blog ID format' });
    }
    if (!commentId || !mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({ success: false, message: 'Invalid comment ID format' });
    }
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized: authentication required' });
    }

    // Find the blog and verify comment ownership
    // First, let's check if the comment exists at all
    const blogWithComment = await Blog.findOne({
      _id: blogId,
      'comments._id': commentId
    });
    
    if (!blogWithComment) {
      return res.status(404).json({ 
        success: false, 
        message: 'Comment not found' 
      });
    }
    
    // Find the specific comment
    const targetComment = blogWithComment.comments.find(c => c._id.toString() === commentId);
    if (!targetComment) {
      return res.status(404).json({ 
        success: false, 
        message: 'Comment not found' 
      });
    }
    
    // Ownership: owner or ADMIN only. Legacy comments without userId are ADMIN-only.
    const ownerId = targetComment.userId ? String(targetComment.userId) : null;
    if (!isAdmin && (!ownerId || ownerId !== String(userId))) {
      return res.status(403).json({ 
        success: false, 
        message: 'You do not have permission to delete this comment' 
      });
    }

    // Remove the comment - simplified query without userId constraint for legacy comments
    const updatedBlog = await Blog.findOneAndUpdate(
      {
        _id: blogId
      },
      {
        $pull: {
          comments: { _id: commentId }
        }
      },
      { new: true }
    );

    if (!updatedBlog) {
      return res.status(404).json({ success: false, message: 'Failed to delete comment' });
    }

    res.json({ 
      success: true, 
      message: 'Comment deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error deleting comment', 
      error: errDetail(error) 
    });
  }
};

// Get blog categories
const getCategories = async (req, res) => {
  try {
    const categories = await Blog.distinct('category', { status: 'published' });
    
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching categories',
      error: errDetail(error)
    });
  }
};

// Get featured blogs
const getFeaturedBlogs = async (req, res) => {
  try {
    const raw = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 20) : 3;
    
    const blogs = await Blog.find({ 
      status: 'published', 
      featured: true 
    })
    .sort({ publishedAt: -1 })
    .limit(limit)
    .lean();
    
    res.json({
      success: true,
      data: blogs
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching featured blogs',
      error: errDetail(error)
    });
  }
};

// Like a blog post
const likeBlog = async (req, res) => {
  try {
    const { id } = req.params;
    
    const blog = await Blog.findByIdAndUpdate(
      id,
      { $inc: { likes: 1 } },
      { new: true }
    );
    
    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Blog liked successfully',
      data: { likes: blog.likes }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error liking blog post',
      error: errDetail(error)
    });
  }
};

// Get blog statistics
const getBlogStats = async (req, res) => {
  try {
    const totalBlogs = await Blog.countDocuments({ status: 'published' });
    const totalViews = await Blog.aggregate([
      { $match: { status: 'published' } },
      { $group: { _id: null, totalViews: { $sum: '$views' } } }
    ]);
    
    const categoryStats = await Blog.aggregate([
      { $match: { status: 'published' } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    res.json({
      success: true,
      data: {
        totalBlogs,
        totalViews: totalViews[0]?.totalViews || 0,
        categoryStats
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching blog statistics',
      error: errDetail(error)
    });
  }
};

// Fix placeholder images in existing blogs
const fixPlaceholderImages = async (req, res) => {
  try {
    console.log('Starting placeholder image fix...');
    
    // Find blogs with via.placeholder.com images
    const blogsWithPlaceholders = await Blog.find({
      $or: [
        { image: { $regex: 'via.placeholder.com', $options: 'i' } },
        { 'author.image': { $regex: 'via.placeholder.com', $options: 'i' } }
      ]
    });
    
    console.log(`Found ${blogsWithPlaceholders.length} blogs with placeholder images`);
    
    let updatedCount = 0;
    
    for (const blog of blogsWithPlaceholders) {
      const updates = {};
      
      // Fix main image
      if (blog.image && blog.image.includes('via.placeholder.com')) {
        updates.image = 'https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?w=800&h=400&fit=crop&crop=center';
      }
      
      // Fix author image
      if (blog.author?.image && blog.author.image.includes('via.placeholder.com')) {
        updates['author.image'] = 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face';
      }
      
      if (Object.keys(updates).length > 0) {
        await Blog.findByIdAndUpdate(blog._id, updates);
        updatedCount++;
        console.log(`Updated blog: ${blog.title}`);
      }
    }
    
    res.json({
      success: true,
      message: `Fixed ${updatedCount} blogs with placeholder images`,
      data: { updatedCount, totalFound: blogsWithPlaceholders.length }
    });
  } catch (error) {
    console.error('Error fixing placeholder images:', error);
    res.status(500).json({
      success: false,
      message: 'Error fixing placeholder images',
      error: errDetail(error)
    });
  }
};

module.exports = {
  getAllBlogs,
  getAllBlogsAdmin,
  getBlogBySlug,
  createBlog,
  updateBlog,
  deleteBlog,
  getCategories,
  getFeaturedBlogs,
  likeBlog,
  getBlogStats,
  fixPlaceholderImages,
  upload,
  commentAvatarUpload,
  getCommentsBySlug,
  addCommentById,
  editCommentById,
  deleteCommentById,
  voteOnComment,
  likeComment,
  testLikeComment
};
