// Design tokens for the transactional emails.
//
// The surfaces are light and cool, and every accent traces back to a token in
// the website's tailwind config (primary #7F5FA8, secondary #39269B) so the
// emails and the site share one palette instead of inventing a second one.
//
// One constraint drives the header colour: the logo is dark artwork on a
// transparent background. It used to sit on a dark violet header at 1.16:1
// contrast — effectively invisible. It needs a white surround, which is why the
// header is white rather than brand-coloured. Contrast for every text/surface
// pair below is asserted in __tests__/emailTemplates.test.js.

// System stack: renders natively on Apple and Android, falls back to Helvetica
// or Arial everywhere else. No web font, so nothing to download and nothing to
// block.
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const BRAND = {
  // Surfaces. Each one has a distinct role and they are never used for one
  // another's job, so the email reads as bands rather than one flat sheet.
  card: '#FFFFFF',
  banner: '#E9E2F3', // primary-100
  panel: '#F7F8FC',
  social: '#F0EEF9', // secondary-50
  footer: '#EDF0F7',
  canvas: '#F5F7FC',

  // Hairlines
  border: '#E7E9F1',
  divider: '#E9EAF2',

  // Text
  ink: '#20243A',
  muted: '#687087',
  footerText: '#5F667A',
  bannerText: '#4C5270',

  // Brand accents (verified tailwind tokens)
  primary: '#7F5FA8', // primary-500
  primaryDark: '#5A3F7A', // primary-700
  secondary: '#39269B', // secondary-500
  lavender: '#C3B4E4', // primary-200, decorative only

  // Kept so callers still reading the older token names keep working.
  page: '#F5F7FC',
  white: '#FFFFFF'
};

// Verified public company details, taken from the live contact page. Nothing
// here is invented; responseTime is existing site copy rather than a new
// commitment.
const COMPANY = {
  name: 'SoSapient',
  website: 'https://sosapient.in',
  email: 'admin@sosapient.in',
  phone: '+91-9685533878',
  address: 'Anand Nagar, Vasant Vihar, Ujjain (M.P.) 456010, India',
  // Served from the company's own domain rather than the ImageKit copy the
  // site's header currently points at: same 525x148 artwork, but it survives an
  // ImageKit migration, which the blog images have already been through.
  logoUrl: 'https://sosapient.in/logo/Dlogo.png',
  logoWidth: 150,
  logoHeight: 42,
  logoInk: '#222978', // sampled from the wordmark, used to guard header contrast
  responseTime: 'We typically respond to all inquiries within 24 hours during business days.',
  // Every URL below was verified in the site's own Header, Footer, Contact and
  // Home components — they are not guesses.
  social: [
    { label: 'Facebook', url: 'https://www.facebook.com/profile.php?id=61553017931533' },
    { label: 'LinkedIn', url: 'https://www.linkedin.com/company/100043699/' },
    { label: 'Instagram', url: 'https://www.instagram.com/sosapient/' },
    { label: 'X', url: 'https://x.com/SoSapient_tech' }
  ]
};

module.exports = { BRAND, COMPANY, FONT };
