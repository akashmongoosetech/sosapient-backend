// Shared slug helpers (mirrors the rules used by the blog module so future
// modules converge on one implementation without touching existing code).
function buildSlug(value) {
  const base = String(value || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160)
    .replace(/-+$/g, '');
  return base;
}

function isValidSlug(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value || '')) && String(value || '').length <= 160;
}

async function ensureUniqueSlug(Model, base, excludeId) {
  const clean = buildSlug(base) || 'item';
  let slug = clean;
  let counter = 1;
  const filter = (s) => (excludeId ? { slug: s, _id: { $ne: excludeId } } : { slug: s });
  while (await Model.findOne(filter(slug)).select('_id')) {
    counter += 1;
    const suffix = `-${counter}`;
    slug = `${clean.slice(0, 160 - suffix.length)}${suffix}`;
  }
  return slug;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { buildSlug, isValidSlug, ensureUniqueSlug, escapeRegExp };
