// Plain-English meaning and real-world consequence for each scan finding type.
// Updated for the code-and-content scanner v2.

const CATALOG = {
  // ── Broken Links ─────────────────────────────────────────────────────
  broken_link: {
    meaning: 'A link on the page points to a resource that returns an error or is unreachable.',
    consequence: 'Users hitting broken links get error pages, lose trust, and search engines penalize the site in rankings.',
  },

  // ── Leaked Secrets ───────────────────────────────────────────────────
  secret: {
    meaning: 'An API key, token, password, or other credential is exposed in the page source or a linked resource.',
    consequence: 'Anyone can extract the key and use your paid accounts. This is the most common cause of surprise API bills.',
  },

  // ── CVE Vulnerabilities ──────────────────────────────────────────────
  cve: {
    meaning: 'A known vulnerability (CVE) exists in a library or dependency referenced by the page.',
    consequence: 'Attackers exploit known CVEs automatically with public exploit code. Unpatched CVEs are the #1 attack vector.',
  },

  // ── Bad Code Patterns ────────────────────────────────────────────────
  bad_code: {
    meaning: 'The page source contains code patterns known to introduce security vulnerabilities or instability.',
    consequence: 'These patterns are entry points for XSS, data leakage, and other attacks that compromise user data.',
  },

  // ── Performance Issues ───────────────────────────────────────────────
  performance: {
    meaning: 'The page has technical issues that slow down loading, increase data usage, or hurt user experience.',
    consequence: 'Slow pages lose visitors. Google uses page speed as a ranking factor, and users abandon sites that take over 3 seconds to load.',
  },

  // ── Missing Meta Tags ────────────────────────────────────────────────
  meta: {
    meaning: 'Essential SEO or social-sharing meta tags are missing or insufficient.',
    consequence: 'Search engines cannot properly index the page. Social media previews will be broken or missing.',
  },

  // ── Broken Images ────────────────────────────────────────────────────
  image: {
    meaning: 'An image referenced by the page is missing or returns an error.',
    consequence: 'Broken images make the site look unprofessional and can break page layouts.',
  },

  // ── Accessibility Issues ─────────────────────────────────────────────
  accessibility: {
    meaning: 'The page has barriers that prevent disabled users from accessing content.',
    consequence: 'Excludes users who rely on screen readers. May violate ADA/WCAG compliance requirements.',
  },
}

const DEFAULT = {
  meaning: 'This issue weakens the quality or security of the website.',
  consequence: 'Left unfixed it may harm user experience, search rankings, or security posture.',
}

export function interpret(type) {
  return CATALOG[type] || DEFAULT
}
