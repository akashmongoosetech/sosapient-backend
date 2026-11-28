const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const subscriberRoutes = require('./routes/subscribers');

const app = express();

// Trust proxy (Render/Vercel/Netlify) so req.ip + rate-limit work behind proxies
app.set('trust proxy', 1);

// Security headers (lightweight helmet-equivalent, no new dependency)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // Standard CSP for a JSON API + static uploads: no framing, no execution
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'self'; frame-ancestors 'none'");
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  // HSTS only in production behind HTTPS (never send on http://localhost)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  next();
});

// Fail-closed env checks at boot (never log values)
if (!process.env.MONGODB_URI) {
  console.error('FATAL: MONGODB_URI is not set');
  process.exit(1);
}
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'your-jwt-secret-key-here' || process.env.JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET is missing, placeholder, or too short (>=32 chars required)');
  process.exit(1);
}

// CORS configuration (env-driven allowlist with scheme fix)
// In production localhost/preview/staging origins are dropped unless explicitly in CORS_ORIGINS.
const devOrigins = [
  'http://localhost:5173', // Development
  'http://localhost:3000', // Alternative development port
];
const prodOrigins = [
  'https://sosapient-test.netlify.app',
  'https://sosapient.in',
  'https://www.sosapient.in',
  'https://sosapient-backend-1ay4.onrender.com', // Backend domain (for self-requests)
];
const previewOrigins = [
  'https://staging.sosapient.com', // Staging
  'https://sosapient-backend-mdhx-cy6ftta6r-akash-raikwars-projects.vercel.app'
];
const isProd = process.env.NODE_ENV === 'production';
const defaultOrigins = isProd ? prodOrigins : [...devOrigins, ...prodOrigins, ...previewOrigins];
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

// Leads CRM accepts large JSON imports — mounted before the global 1mb body
// parsers; its router applies a scoped 10mb JSON limit instead.
const leadRoutesEarly = require('./routes/lead.routes');
app.use('/api/leads', leadRoutesEarly);

// Razorpay webhook MUST receive the exact raw bytes that were signed, so it is
// mounted before the global JSON parser (which would otherwise consume and
// re-serialise the body and invalidate the HMAC check).
const { webhook: razorpayWebhook } = require('./controllers/enrollmentController');
app.post(
  '/api/training/payment/webhook',
  express.raw({ type: '*/*', limit: '1mb' }),
  razorpayWebhook
);

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

// Request timing middleware: logs total server response time per request
// to help identify slow endpoints. No PII is logged.
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    if (process.env.NODE_ENV !== 'test') {
      const ms = Number((process.hrtime.bigint() - start) / 1000000n);
      if (ms > 500) {
        console.log(`[slow] ${req.method} ${req.url} ${res.statusCode} ${ms.toFixed(0)}ms`);
      }
    }
  });
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
// Public uploads are meant to be embedded cross-origin (<img> on the site,
// which may live on another origin). Override the API-wide same-origin
// CORP/COOP headers for these files, otherwise browsers refuse to render
// them with ERR_BLOCKED_BY_RESPONSE.
app.use('/uploads', express.static(uploadsDir, {
  maxAge: '7d',
  etag: true,
  lastModified: true,
  setHeaders: (res) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.removeHeader('Cross-Origin-Opener-Policy');
  }
}));

// Import routes
const authRoutes = require('./routes/auth.routes');
const contactRoutes = require('./routes/contact.routes');
const careerRoutes = require('./routes/career.routes');
const blogRoutes = require('./routes/blog.routes');
const chatRoutes = require('./routes/chat.routes');
const copilotKitRoutes = require('./routes/copilotkit.routes');
const jobRoutes = require('./routes/job.routes');
const caseStudyRoutes = require('./routes/caseStudy.routes');
const certificateRoutes = require('./routes/certificate.routes');
const trainingRoutes = require('./routes/trainingRoutes');
const enrollmentRoutes = require('./routes/enrollmentRoutes');

// Health check endpoint (DB-aware: reports degraded when Mongo is down)
app.get('/health', (req, res) => {
  const dbState = mongoose.connection.readyState; // 1 = connected
  const ok = dbState === 1;
  res.status(ok ? 200 : 503).json({
    success: ok,
    message: ok ? 'Server is running' : 'Server degraded: database not connected',
    timestamp: new Date().toISOString()
  });
});

app.get('/ready', (req, res) => {
  const ok = mongoose.connection.readyState === 1;
  res.status(ok ? 200 : 503).json({ success: ok, db: mongoose.connection.readyState });
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
app.use('/api/certificates', certificateRoutes);
app.use('/api/trainings', trainingRoutes);
app.use('/api/training', enrollmentRoutes);
const dealRoutes = require('./routes/deal.routes');
app.use('/api/deals', dealRoutes);
const candidatesRoutes = require('./routes/candidatesRoutes');
app.use('/api/admin/candidates', candidatesRoutes);
const chatbotRoutes = require('./routes/chatbot.routes');
app.use('/api/chatbot', chatbotRoutes);
// Uploaded images (blog featured images, comment avatars) served from MongoDB.
const imageRoutes = require('./routes/image.routes');
app.use('/api/images', imageRoutes);

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
    // Warm up indexes in the background so the first request
    // doesn't pay index-build cost inside the request.
    const models = [
      require('./models/User'),
      require('./models/lead.model'),
      require('./models/contact.model'),
      require('./models/career.model'),
      require('./models/job.model'),
      require('./models/caseStudy.model'),
      require('./models/certificate.model'),
      require('./models/blog.model'),
      require('./models/Subscriber'),
      require('./models/deal.model'),
      require('./models/imageAsset.model'),
      require('./models/Training'),
      require('./models/Enrollment'),
    ];
    for (const Model of models) {
      try {
        await Model.createIndexes();
        console.log(`${Model.modelName} indexes ready`);
      } catch (e) {
        console.warn(`${Model.modelName} index warmup failed:`, e.message);
      }
    }

    // Payment has legacy index definitions that must be repaired BEFORE the
    // indexes are rebuilt (the old unique/partial definitions reject the
    // second payment document). See utils/migratePaymentIndexes.js.
    try {
      const { migratePaymentIndexes } = require('./utils/migratePaymentIndexes');
      await migratePaymentIndexes();
      console.log('Payment indexes ready');
    } catch (e) {
      console.warn('Payment index warmup failed:', e.message);
    }

    // Backfill slugs for existing jobs missing them (safe to re-run; only
    // updates jobs without a slug).
    try {
      const Job = require('./models/job.model');
      await Job.createIndexes();
      console.log('Job indexes ready');
      const jobsWithoutSlug = await Job.find({ $or: [{ slug: { $exists: false } }, { slug: '' }] }).lean();
      for (const job of jobsWithoutSlug) {
        const slug = await Job.generateUniqueSlug(Job, job.title, job._id);
        await Job.updateOne({ _id: job._id }, { $set: { slug } });
      }
      if (jobsWithoutSlug.length > 0) {
        console.log(`Backfilled slugs for ${jobsWithoutSlug.length} existing job(s)`);
      }
    } catch (e) {
      console.warn('Job slug backfill failed:', e.message);
    }
    // Start server
    const PORT = process.env.PORT || 5000;
    server = app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error.message || error);
    process.exit(1);
  });

// Graceful shutdown (Render/Heroku SIGTERM): drain HTTP + close Mongo
let server;
const shutdown = async (signal) => {
  try {
    console.log(`${signal} received: closing server...`);
    if (server && server.close) {
      await new Promise((resolve) => server.close(resolve));
    }
    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error('Shutdown error:', e.message || e);
    process.exit(1);
  }
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT')); 