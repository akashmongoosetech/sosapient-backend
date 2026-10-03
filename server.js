const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const subscriberRoutes = require('./routes/subscribers');

const app = express();

// Security headers (lightweight helmet-equivalent, no new dependency)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // uploads contain only images; never execute as scripts
  res.setHeader('X-Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'self'");
  next();
});

// CORS configuration (env-driven allowlist with scheme fix)
const defaultOrigins = [
  'http://localhost:5173', // Development
  'http://localhost:3000', // Alternative development port
  'https://sosapient-test.netlify.app', // Production
  'https://sosapient.in',
  'https://www.sosapient.in',
  'https://staging.sosapient.com', // Staging
  'https://sosapient-backend.onrender.com', // Backend domain (for self-requests)
  'https://sosapient-backend-mdhx-cy6ftta6r-akash-raikwars-projects.vercel.app'
];
// Merge defaults + env allowlist and normalize (strip trailing slashes:
// the Origin header never has a path, so 'http://localhost:5173/' would never match).
const envOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim().replace(/\/+$/, ''))
  .filter(Boolean);
const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins])];
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'X-Requested-With', 'Accept'],
  credentials: true
}));

// Body parsers: keep global limits small; blog image/content uploads use multipart (multer) limits instead
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Request logging middleware (redacted: never log headers/bodies with PII or secrets)
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== 'test') {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  }
  next();
});

// Serve static files for uploaded images (ensure directory exists)
const fs = require('fs');
const uploadsDir = path.join(__dirname, 'uploads');
const blogImagesDir = path.join(uploadsDir, 'blog-images');
const commentAvatarsDir = path.join(uploadsDir, 'comment-avatars');
try {
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
  if (!fs.existsSync(blogImagesDir)) fs.mkdirSync(blogImagesDir);
  if (!fs.existsSync(commentAvatarsDir)) fs.mkdirSync(commentAvatarsDir);
} catch (e) {
  console.warn('Warning: could not ensure uploads directories exist:', e.message);
}
app.use('/uploads', express.static(uploadsDir));

// Import routes
const authRoutes = require('./routes/auth.routes');
const contactRoutes = require('./routes/contact.routes');
const careerRoutes = require('./routes/career.routes');
const blogRoutes = require('./routes/blog.routes');
const chatRoutes = require('./routes/chat.routes');
const copilotKitRoutes = require('./routes/copilotkit.routes');
const jobRoutes = require('./routes/job.routes');
const caseStudyRoutes = require('./routes/caseStudy.routes');

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Dynamic SEO: sitemap (published posts) + robots (blog crawlable, admin excluded)
const { sitemap, robots } = require('./controllers/seo.controller');
app.get('/sitemap.xml', sitemap);
app.get('/robots.txt', robots);

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/career', careerRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/copilotkit', copilotKitRoutes);
app.use('/api', subscriberRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/case-studies', caseStudyRoutes);

// 404 for unknown API routes
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'API route not found' });
});

// Error handling middleware (never leak internals in production)
app.use((err, req, res, next) => {
  console.error('Global error handler:', err && err.message ? err.message : err);
  const isProd = process.env.NODE_ENV === 'production';
  res.status(err.status || 500).json({
    success: false,
    message: isProd ? 'Internal server error' : (err.message || 'Internal server error')
  });
});

// Connect to MongoDB (fail fast instead of hanging requests for 30s by default)
const t0 = Date.now();
mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
  .then(async () => {
    console.log(`Connected to MongoDB in ${Date.now() - t0}ms`);
    // Warm up indexes in the background so the first signup/login
    // doesn't pay index-build cost inside the request.
    try {
      await require('./models/User').createIndexes();
      console.log('User indexes ready');
    } catch (e) {
      console.warn('User index warmup failed:', e.message);
    }
    // Start server
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error.message || error);
    process.exit(1);
  }); 