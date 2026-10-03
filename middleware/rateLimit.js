// Tiny in-memory rate limiter (no new dependency). Per-IP + route window.
const buckets = new Map();

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
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));
    if (entry.count > max) {
      return res.status(429).json({ success: false, message: 'Too many requests, please try again later' });
    }
    next();
  };
}

module.exports = { rateLimit };
