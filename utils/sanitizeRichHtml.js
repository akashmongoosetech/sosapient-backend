const sanitizeHtml = require('sanitize-html');

// Strict allowlist for CKEditor-generated job content (description,
// requirements, responsibilities, benefits). Everything else — scripts,
// event handlers, iframes, images, javascript:/data: URLs — is discarded.
const JOB_HTML_OPTIONS = {
  allowedTags: [
    'p', 'br',
    'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'sub', 'sup',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'blockquote',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    'a', 'hr', 'pre', 'code',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel', 'title'],
    th: ['colspan', 'rowspan'],
    td: ['colspan', 'rowspan'],
    // CKEditor alignment only; all other inline styles are dropped.
    p: ['style'],
    h1: ['style'], h2: ['style'], h3: ['style'],
    h4: ['style'], h5: ['style'], h6: ['style'],
    td: ['colspan', 'rowspan', 'style'],
    th: ['colspan', 'rowspan', 'style'],
  },
  allowedStyles: {
    '*': {
      'text-align': [/^left$/, /^right$/, /^center$/, /^justify$/],
    },
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: {},
  allowProtocolRelative: false,
  enforceHtmlBoundary: false,
  // Harden links the same way the frontend renderer does.
  transformTags: {
    a: (tagName, attribs) => {
      const href = String(attribs.href || '');
      const isAbsolute = /^(https?:)?\/\//i.test(href);
      return {
        tagName,
        attribs: {
          ...attribs,
          ...(isAbsolute ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
        },
      };
    },
  },
};

function sanitizeRichHtml(value) {
  if (typeof value !== 'string') return value;
  if (value === '') return value;
  return sanitizeHtml(value, JOB_HTML_OPTIONS);
}

// Sanitize one rich-text field: string passes through, arrays sanitize
// each string item (non-strings dropped), anything else passes through
// for schema validation to reject.
function sanitizeRichField(value) {
  if (typeof value === 'string') return sanitizeRichHtml(value);
  if (Array.isArray(value)) {
    return value.filter((v) => typeof v === 'string').map((v) => sanitizeRichHtml(v));
  }
  return value;
}

// Plain-text length of HTML (used for emptiness checks).
function richTextLength(value) {
  if (typeof value !== 'string') return 0;
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
}

module.exports = { JOB_HTML_OPTIONS, sanitizeRichHtml, sanitizeRichField, richTextLength };
