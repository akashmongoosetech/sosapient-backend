// RAG indexer: rebuilds RagDocument chunks from public sources.
// Usage: node scripts/index-rag.js [--clear]
// Indexes: published blogs, published case studies, services snapshot, business info.
// Only PUBLIC content is ever indexed (published === true / public pages).
require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const RagDocument = require('../models/RagDocument');
const Blog = require('../models/blog.model');
const CaseStudy = require('../models/caseStudy.model');
const rag = require('../services/rag.service');

function strip(html) {
  return rag.stripHtml(html);
}

async function indexServices() {
  const snapPath = path.join(__dirname, '..', 'data', 'services.snapshot.json');
  if (!fs.existsSync(snapPath)) {
    console.log('services snapshot missing, skipping (run snapshot-services.mjs)');
    return 0;
  }
  const snap = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
  let n = 0;
  for (const s of snap.services || []) {
    const sections = [
      { label: 'service overview', text: `${s.name}. ${s.shortDescription || ''} ${s.description || ''}` },
      { label: 'service technologies', text: `Technologies for ${s.name}: ${(s.technologies || []).join(', ')}` },
      ...((s.faqs || []).map((f) => ({
        label: 'service faq',
        text: `Q: ${f.q} A: ${f.a}`
      })))
    ];
    const r = await rag.indexDocument({
      source: 'services-page',
      sourceId: s.slug,
      sourceType: 'service',
      metadata: {
        title: s.name,
        slug: s.slug,
        url: `/services/${s.slug}`,
        category: s.category || ''
      },
      sections,
      published: true
    });
    n += r.indexed;
  }
  console.log(`services indexed: ${n} chunks`);
  return n;
}

async function indexBlogs() {
  const posts = await Blog.find({ status: 'published' })
    .select('title slug excerpt content category tags')
    .lean();
  let n = 0;
  for (const b of posts) {
    const r = await rag.indexDocument({
      source: 'blog',
      sourceId: String(b._id),
      sourceType: 'blog',
      metadata: {
        title: b.title,
        slug: b.slug,
        url: `/blog/${b.slug}`,
        category: b.category || ''
      },
      sections: [
        { label: 'blog summary', text: `${b.title}. ${b.excerpt || ''} Category: ${b.category || ''}. Tags: ${(b.tags || []).join(', ')}` },
        { label: 'blog content', text: strip(b.content || '').slice(0, 6000) }
      ],
      published: true
    });
    n += r.indexed;
  }
  console.log(`blogs indexed: ${posts.length} posts, ${n} chunks`);
  return n;
}

async function indexCaseStudies() {
  const items = await CaseStudy.find({ published: true }).lean();
  let n = 0;
  for (const c of items) {
    const results = (c.results || []).map((r) => `${r.label}: ${r.value}`).join('; ');
    const r = await rag.indexDocument({
      source: 'case-study',
      sourceId: String(c._id),
      sourceType: 'case-study',
      metadata: {
        title: c.title,
        slug: c.slug,
        url: `/case-studies/${c.slug}`,
        category: c.category || ''
      },
      sections: [
        { label: 'case study overview', text: `${c.title} for ${c.client}. Category: ${c.category}. Duration: ${c.duration}. ${strip(c.overview || '').slice(0, 1500)}` },
        { label: 'case study challenge', text: strip(c.challenge || '').slice(0, 1500) },
        { label: 'case study solution', text: strip(c.solution || '').slice(0, 1500) },
        {
          label: 'case study results',
          text: `Results: ${results}. Technologies: ${(c.technologies || []).join(', ')}`
        }
      ],
      published: true
    });
    n += r.indexed;
  }
  console.log(`case studies indexed: ${items.length} items, ${n} chunks`);
  return n;
}

async function indexBusinessInfo() {
  const r = await rag.indexDocument({
    source: 'business-info',
    sourceId: 'contact',
    sourceType: 'business-info',
    metadata: { title: 'Contact SoSapient', url: '/contact', category: 'contact' },
    sections: [
      {
        label: 'business contact',
        text: 'SoSapient is a software company in Ujjain, Madhya Pradesh, India, serving clients worldwide. Contact via the contact page at /contact or email hr.sosapient@gmail.com. Services: web and mobile development, AI solutions and automation, CRM and ERP software, digital marketing and social media promotion.'
      }
    ],
    published: true
  });
  console.log(`business info indexed: ${r.indexed} chunks`);
  return r.indexed;
}

async function rebuild({ skipClear = false } = {}) {
  if (!skipClear) {
    const r = await RagDocument.deleteMany({});
    console.log(`cleared ${r.deletedCount} chunks`);
  }
  await indexServices();
  await indexBlogs();
  await indexCaseStudies();
  await indexBusinessInfo();
  const total = await RagDocument.countDocuments({ published: true });
  console.log(`total published chunks: ${total}`);
  return total;
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  await rebuild({ skipClear: process.argv.includes('--no-clear') });
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}

module.exports = rebuild;
