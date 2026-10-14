// Website knowledge exporter: single source of truth for RAG indexing.
// Reads the FRONTEND source files directly (no duplication):
//   services.ts + industries.ts (full objects via Node type-stripping),
//   FaqSection / AboutFaq / Contact FAQs (regex-extracted Q&A pairs),
//   data/business-info.json (company facts), Mongo Job (open roles).
// Usage: node scripts/export-website-knowledge.js [--frontend-dir <path>] [--dry-run]
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const args = process.argv.slice(2);
function argValue(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const DRY_RUN = args.includes('--dry-run');
const FRONTEND_DIR =
  argValue('--frontend-dir', process.env.FRONTEND_DIR) ||
  path.resolve(__dirname, '../../sosapient-frontend-main');

// Extract {q, a} pairs from TSX faq arrays supporting ', ", ` quotes + escapes.
// Supports keys: question/answer and q/a.
function extractFaqs(source, page, url) {
  const out = [];
  const re = /(?:question|\bq)\s*:\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)\s*,\s*(?:answer|\ba)\s*:\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)/gs;
  let m;
  const unquote = (s) => {
    const q = s[0];
    let inner = s.slice(1, -1);
    if (q === '`') {
      inner = inner.replace(/\$\{[^}]*\}/g, '').replace(/\\`/g, '`').replace(/\\\$/g, '$');
    } else {
      inner = inner.replace(/\\(.)/gs, '$1');
    }
    return inner.replace(/\s+/g, ' ').trim();
  };
  while ((m = re.exec(source)) !== null) {
    const q = unquote(m[1]);
    const a = unquote(m[2]);
    if (q && a) out.push({ q, a, page, url });
  }
  return out;
}

async function collect() {
  const docs = [];
  const dataDir = path.join(FRONTEND_DIR, 'src', 'data');

  // ---- Services (FULL objects, not the trimmed snapshot) ----
  const servicesMod = await import(pathToFileURL(path.join(dataDir, 'services.ts')).href);
  for (const s of servicesMod.SERVICES || []) {
    const sections = [
      { label: 'service overview', text: `${s.name}. ${s.shortDescription || ''} ${s.description || ''} ${(s.overview || []).join(' ')}` },
      { label: 'service why need', text: `Why ${s.name}: ${(s.whyNeed || []).join(' ')}` },
      { label: 'service benefits', text: `Benefits of ${s.name}: ${(s.benefits || []).join(' ')}` },
      { label: 'service deliverables', text: `What you get with ${s.name}: ${(s.deliverables || []).join(' ')}` },
      { label: 'service technologies', text: `${s.name} technologies: ${(s.technologies || []).map((t) => (typeof t === 'string' ? t : `${t.name} ${t.blurb || ''}`)).join(' ')} ${s.techIntro || ''}` },
      { label: 'service use cases', text: `${s.name} use cases: ${(s.useCases || []).join(' ')}` }
    ];
    for (const f of s.faqs || []) {
      sections.push({ label: 'service faq', text: `Q: ${f.q || f.question || ''} A: ${f.a || f.answer || ''}` });
    }
    docs.push({
      source: 'services-full', sourceId: s.slug, sourceType: 'service',
      metadata: { title: s.name, slug: s.slug, url: `/services/${s.slug}`, category: s.category || '' },
      sections: sections.filter((x) => x.text.trim().length > 10), published: true
    });
  }

  // ---- Industries (previously unindexed) ----
  const industriesMod = await import(pathToFileURL(path.join(dataDir, 'industries.ts')).href);
  for (const ind of industriesMod.INDUSTRIES || []) {
    const sections = [
      { label: 'industry overview', text: `${ind.name}. ${ind.shortDescription || ''} ${ind.description || ''} ${(ind.overview || []).join(' ')}` },
      { label: 'industry challenges', text: `${ind.name} challenges: ${(ind.challenges || []).join(' ')}` },
      { label: 'industry solutions', text: `${ind.name} solutions: ${(ind.solutions || []).join(' ')}` },
      { label: 'industry technologies', text: `${ind.name} technologies: ${(ind.technologies || []).map((t) => (typeof t === 'string' ? t : t.name)).join(' ')}` },
      { label: 'industry benefits', text: `${ind.name} benefits: ${(ind.benefits || []).join(' ')}` },
      { label: 'industry use cases', text: `${ind.name} use cases: ${(ind.useCases || []).join(' ')}` }
    ];
    for (const f of ind.faqs || []) {
      sections.push({ label: 'industry faq', text: `Q: ${f.q || f.question || ''} A: ${f.a || f.answer || ''}` });
    }
    docs.push({
      source: 'industries', sourceId: ind.slug, sourceType: 'industry',
      metadata: { title: ind.name, slug: ind.slug, url: `/industries/${ind.slug}`, category: '' },
      sections: sections.filter((x) => x.text.trim().length > 10), published: true
    });
  }

  // ---- Page FAQs (Home 13, About 6, Contact 4) ----
  const faqFiles = [
    { file: ['src', 'components', 'Home', 'FaqSection.tsx'], page: 'home', url: '/' },
    { file: ['src', 'components', 'about', 'AboutFaq.tsx'], page: 'about', url: '/about' },
    { file: ['src', 'pages', 'Contact.tsx'], page: 'contact', url: '/contact' }
  ];
  for (const { file, page, url } of faqFiles) {
    const full = path.join(FRONTEND_DIR, ...file);
    if (!fs.existsSync(full)) {
      console.warn(`FAQ source missing: ${full}`);
      continue;
    }
    const faqs = extractFaqs(fs.readFileSync(full, 'utf8'), page, url);
    for (const [i, f] of faqs.entries()) {
      docs.push({
        source: `faq-${page}`, sourceId: `${page}-${i}`, sourceType: 'faq',
        metadata: { title: f.q.slice(0, 200), slug: '', url: f.url, category: page },
        sections: [{ label: 'faq', text: `Q: ${f.q} A: ${f.a}` }], published: true
      });
    }
    console.log(`FAQs from ${page}: ${faqs.length}`);
  }

  // ---- Business facts (single source of truth) ----
  const biz = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'business-info.json'), 'utf8'));
  docs.push({
    source: 'business', sourceId: 'company-profile', sourceType: 'business',
    metadata: { title: biz.name, slug: '', url: '/about', category: 'company' },
    sections: [
      { label: 'business profile', text: `${biz.name} — ${biz.tagline}. Founded ${biz.founded}. ${biz.stats.projects}, ${biz.stats.clients}, ${biz.stats.satisfaction}, ${biz.stats.team}. Process: ${biz.process.join(' → ')}.` },
      { label: 'business contact', text: `Contact ${biz.name}: email ${biz.email}, support ${biz.supportPhone}, HR ${biz.hrPhone}. Address: ${biz.base}. Hours: ${biz.hours}. Replies ${biz.responseTime}.` }
    ],
    published: true
  });

  return { docs };
}

async function run() {
  const { docs } = await collect();
  const counts = {};
  for (const d of docs) counts[d.sourceType] = (counts[d.sourceType] || 0) + 1;
  console.log(`Collected ${docs.length} documents:`, JSON.stringify(counts));
  if (DRY_RUN) return { docs, indexed: 0 };

  // Jobs are live Mongo data (not frontend files) — index open roles here.
  const mongoose = require('mongoose');
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  const Job = require('../models/job.model');
  const rag = require('../services/rag.service');
  const jobs = await Job.find({ status: 'open' }).lean();
  for (const j of jobs) {
    docs.push({
      source: 'jobs', sourceId: String(j.slug || j._id), sourceType: 'job',
      metadata: { title: j.title, slug: j.slug || '', url: `/careers/${j.slug || j._id}`, category: j.department || '' },
      sections: [
        { label: 'job posting', text: `${j.title} (${j.department || ''}, ${j.location || ''}, ${j.type || ''}). Experience: ${j.experience || ''}. ${rag.stripHtml(j.description || '').slice(0, 1500)} Requirements: ${(j.requirements || []).join(' ')}`.slice(0, 3000) }
      ],
      published: true
    });
  }
  console.log(`Open jobs: ${jobs.length}`);

  let indexed = 0;
  for (const d of docs) {
    const r = await rag.indexDocument(d);
    indexed += r.indexed || 0;
  }
  await mongoose.disconnect();
  console.log(`Indexed ${indexed} chunks from ${docs.length} documents.`);
  return { docs, indexed };
}

if (require.main === module) {
  run().then(() => process.exit(0)).catch((e) => { console.error(e.message || e); process.exit(1); });
}

module.exports = { collect, extractFaqs, run };
