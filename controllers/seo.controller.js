const Blog = require('../models/blog.model');

function siteUrl() {
  return String(process.env.SITE_URL || 'https://sosapient.in').replace(/\/+$/, '');
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

let sitemapCache = { xml: '', at: 0 };
const SITEMAP_TTL_MS = 15 * 60 * 1000;

// GET /sitemap.xml — published posts only, cached 15 min
async function sitemap(req, res) {
  try {
    if (sitemapCache.xml && Date.now() - sitemapCache.at < SITEMAP_TTL_MS) {
      res.set('Content-Type', 'application/xml');
      return res.send(sitemapCache.xml);
    }
    const base = siteUrl();
    const posts = await Blog.find({ status: 'published' })
      .select('slug updatedAt publishedAt')
      .sort({ updatedAt: -1 })
      .lean();
    const urls = [
      { loc: `${base}/`, changefreq: 'daily', priority: '1.0' },
      { loc: `${base}/blog`, changefreq: 'daily', priority: '0.9' },
      ...posts.map((p) => ({
        loc: `${base}/blog/${p.slug}`,
        lastmod: (p.updatedAt || p.publishedAt)
          ? new Date(p.updatedAt || p.publishedAt).toISOString()
          : undefined,
        changefreq: 'weekly',
        priority: '0.8'
      }))
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((u) => `  <url>\n    <loc>${escapeXml(u.loc)}</loc>\n${u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>\n` : ''}    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`)
      .join('\n')}\n</urlset>`;
    sitemapCache = { xml, at: Date.now() };
    res.set('Content-Type', 'application/xml');
    return res.send(xml);
  } catch (error) {
    return res.status(500).type('text/plain').send('Error generating sitemap');
  }
}

// GET /robots.txt — crawlable blog, admin/api excluded
function robots(req, res) {
  const base = siteUrl();
  const txt = [
    'User-agent: *',
    'Allow: /blog',
    'Allow: /blog/*',
    'Disallow: /admin',
    'Disallow: /admin/*',
    'Disallow: /api/',
    `Sitemap: ${base}/sitemap.xml`,
    ''
  ].join('\n');
  res.set('Content-Type', 'text/plain');
  return res.send(txt);
}

module.exports = { sitemap, robots };
