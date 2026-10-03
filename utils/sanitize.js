function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 100);
}

function sanitizeFilename(value, fallback = 'file') {
  return String(value || fallback)
    .replace(/[\r\n"\\]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120) || fallback;
}

function publicErrorMessage() {
  return process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : undefined;
}

module.exports = { escapeHtml, escapeRegExp, sanitizeFilename, publicErrorMessage };
