const Blog = require('../models/blog.model');
const CaseStudy = require('../models/caseStudy.model');
const Job = require('../models/job.model');

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
    res.set('Cache-Control', 'public, max-age=900');
    if (sitemapCache.xml && Date.now() - sitemapCache.at < SITEMAP_TTL_MS) {
      res.set('Content-Type', 'application/xml');
      return res.send(sitemapCache.xml);
    }
    const base = siteUrl();
    const posts = await Blog.find({ status: 'published' })
      .select('slug updatedAt publishedAt')
      .sort({ updatedAt: -1 })
      .lean();
    const serviceSlugs = [
      'frontend-development',
      'backend-development',
      'mobile-development',
      'cloud-devops',
      'ui-ux-design',
      'security-testing',
      'ai-development',
      'ai-automations',
      'business-solutions',
      'custom-crm-development',
      'erp-development',
      'ai-solutions',
      'chatbot-development',
      'rag-system-integration',
      'saas-product-development',
      'digital-marketing',
      'social-media-promotion'
    ];
    const cases = await CaseStudy.find({ published: true })
      .select('slug updatedAt')
      .sort({ updatedAt: -1 })
      .lean();
    const jobs = await Job.find({ status: 'open' })
      .select('_id slug updatedAt')
      .sort({ updatedAt: -1 })
      .lean();
    const industrySlugs = [
      'healthcare-telehealth',
      'ecommerce-retail',
      'manufacturing-logistics',
      'education-edtech',
      'artificial-intelligence-automation',
      'cloud-devops',
      'cybersecurity',
      'proptech-real-estate',
      'travel-hospitality-tourism',
      'gaming-esports',
      'hrtech-workforce-management',
      'professional-services-legaltech',
      'media-entertainment',
      'logistics-supply-chain',
      'custom-enterprise-web-apps',
      'api-integration-performance-optimization',
      'business-process-automation'
    ];
    const urls = [
      { loc: `${base}/`, changefreq: 'daily', priority: '1.0' },
      { loc: `${base}/about`, changefreq: 'monthly', priority: '0.7' },
      { loc: `${base}/contact`, changefreq: 'monthly', priority: '0.7' },
      { loc: `${base}/privacy`, changefreq: 'yearly', priority: '0.3' },
      { loc: `${base}/blog`, changefreq: 'daily', priority: '0.9' },
      { loc: `${base}/services`, changefreq: 'weekly', priority: '0.9' },
      { loc: `${base}/industries`, changefreq: 'weekly', priority: '0.9' },
      { loc: `${base}/case-studies`, changefreq: 'weekly', priority: '0.9' },
      { loc: `${base}/careers`, changefreq: 'weekly', priority: '0.7' },      { loc: `${base}/terms`, changefreq: 'yearly', priority: '0.3' },
      { loc: `${base}/cookies`, changefreq: 'yearly', priority: '0.3' },
      ...jobs.map((j) => ({
        loc: `${base}/careers/${j.slug || j._id}`,
        lastmod: j.updatedAt ? new Date(j.updatedAt).toISOString() : undefined,
        changefreq: 'weekly',
        priority: '0.6'
      })),
      ...cases.map((c) => ({
        loc: `${base}/case-studies/${c.slug}`,
        lastmod: c.updatedAt ? new Date(c.updatedAt).toISOString() : undefined,
        changefreq: 'weekly',
        priority: '0.8'
      })),
      ...serviceSlugs.map((slug) => ({
        loc: `${base}/services/${slug}`,
        lastmod: new Date().toISOString().slice(0, 10),
        changefreq: 'monthly',
        priority: '0.8'
      })),
      ...industrySlugs.map((slug) => ({
        loc: `${base}/industries/${slug}`,
        lastmod: new Date().toISOString().slice(0, 10),
        changefreq: 'monthly',
        priority: '0.8'
      })),
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
    'Allow: /',
    'Allow: /about',
    'Allow: /services',
    'Allow: /services/*',
    'Allow: /industries',
    'Allow: /industries/*',
    'Allow: /blog',
    'Allow: /blog/*',
    'Allow: /case-studies',
    'Allow: /case-studies/*',
    'Allow: /careers',
    'Allow: /contact',
    'Disallow: /portfolio',
    'Allow: /privacy',
    'Disallow: /admin',
    'Disallow: /admin/*',
    'Disallow: /api/',
    'Disallow: /login',
    'Disallow: /signup',
    'Disallow: /thank-you',
    'Disallow: /profile',
    'Disallow: /verify/',
    `Sitemap: ${base}/sitemap.xml`,
    ''
  ].join('\n');
  res.set('Content-Type', 'text/plain');
  res.set('Cache-Control', 'public, max-age=3600');
  return res.send(txt);
}

module.exports = { sitemap, robots };
