// Best-effort RAG reindex hooks for admin content writes.
// Fire-and-forget: never blocks the API response, never throws.
const rag = require('./rag.service');

function strip(html) {
  return rag.stripHtml(html);
}

function queue(fn) {
  setImmediate(() => {
    Promise.resolve()
      .then(fn)
      .catch(() => {
        // Indexing must never break content APIs
      });
  });
}

function queueBlogIndex(blog) {
  if (!blog) return;
  queue(async () => {
    const published = blog.status === 'published';
    await rag.indexDocument({
      source: 'blog',
      sourceId: String(blog._id),
      sourceType: 'blog',
      metadata: {
        title: blog.title || '',
        slug: blog.slug || '',
        url: blog.slug ? `/blog/${blog.slug}` : '',
        category: blog.category || ''
      },
      sections: [
        {
          label: 'blog summary',
          text: `${blog.title || ''}. ${blog.excerpt || ''} Category: ${blog.category || ''}. Tags: ${Array.isArray(blog.tags) ? blog.tags.join(', ') : ''}`
        },
        { label: 'blog content', text: strip(blog.content || '').slice(0, 6000) }
      ],
      published
    });
  });
}

function queueBlogRemove(id) {
  if (!id) return;
  queue(async () => {
    await rag.removeDocument('blog', String(id));
  });
}

function queueCaseStudyIndex(doc) {
  if (!doc) return;
  queue(async () => {
    const results = Array.isArray(doc.results)
      ? doc.results.map((r) => `${r.label}: ${r.value}`).join('; ')
      : '';
    await rag.indexDocument({
      source: 'case-study',
      sourceId: String(doc._id),
      sourceType: 'case-study',
      metadata: {
        title: doc.title || '',
        slug: doc.slug || '',
        url: doc.slug ? `/case-studies/${doc.slug}` : '',
        category: doc.category || ''
      },
      sections: [
        {
          label: 'case study overview',
          text: `${doc.title || ''} for ${doc.client || ''}. Category: ${doc.category || ''}. Duration: ${doc.duration || ''}. ${strip(doc.overview || '').slice(0, 1500)}`
        },
        { label: 'case study challenge', text: strip(doc.challenge || '').slice(0, 1500) },
        { label: 'case study solution', text: strip(doc.solution || '').slice(0, 1500) },
        {
          label: 'case study results',
          text: `Results: ${results}. Technologies: ${Array.isArray(doc.technologies) ? doc.technologies.join(', ') : ''}`
        }
      ],
      published: doc.published === true
    });
  });
}

function queueCaseStudyRemove(id) {
  if (!id) return;
  queue(async () => {
    await rag.removeDocument('case-study', String(id));
  });
}

module.exports = { queueBlogIndex, queueBlogRemove, queueCaseStudyIndex, queueCaseStudyRemove };
