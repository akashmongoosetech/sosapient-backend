// Tiny in-memory rate limiter (no new dependency). Per-IP + route window.
// NOTE: per-instance only — use Redis (express-rate-limit) when running PM2/cluster/multi-instance.
const buckets = new Map();

// Periodic eviction so the Map cannot grow unbounded (memory leak fix).
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
if (!global.__rateLimitCleanup) {
  global.__rateLimitCleanup = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets) {
      if (!v || now > v.reset) buckets.delete(k);
    }
  }, CLEANUP_INTERVAL_MS);
  if (global.__rateLimitCleanup.unref) global.__rateLimitCleanup.unref();
}

function rateLimit({ windowMs = 60000, max = 30 } = {}) {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${req.ip}:${req.baseUrl}${req.path}`;
    let entry = buckets.get(key);
    if (!entry || now > entry.reset) {
      entry = { count: 0, reset: now + windowMs };
    }
    entry.count += 1;
    buckets.set(key, entry);
    const remaining = Math.max(0, max - entry.count);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.reset / 1000)));
    if (entry.count > max) {
      const retryAfter = Math.max(1, Math.ceil((entry.reset - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ success: false, message: 'Too many requests, please try again later' });
    }
    next();
  };
}

module.exports = { rateLimit };
