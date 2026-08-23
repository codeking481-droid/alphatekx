/**
 * WORDPRESS DOCTOR — CMS detection + WordPress-aware repair context.
 *
 * Alpha focuses on restoration: ~40% of the web runs WordPress, and its
 * breakage has signature patterns (plugin/theme asset paths, injected
 * malware loaders, migration mixed-content). This module gives every
 * pipeline consumer (diagnose, watch-mode, MCP) three things:
 *
 *   detectWordPress(html) — is this a WP site, and why we think so
 *   wordpressAudit(html)  — deterministic WP-specific issues worth fixing
 *   wordpressGuidance(...)— a surgical rules block injected into AI prompts
 */

const WP_SIGNALS = [
  { re: /\/wp-content\/(?:themes|plugins|uploads)\//i, weight: 3, label: 'wp-content asset paths' },
  { re: /\/wp-includes\//i, weight: 3, label: 'wp-includes core paths' },
  { re: /<meta[^>]+name=["']generator["'][^>]+wordpress/i, weight: 3, label: 'generator meta tag' },
  { re: /\/wp-json\//i, weight: 2, label: 'REST API references' },
  { re: /wp-embed\.js|wp-emoji/i, weight: 1, label: 'WP core scripts' },
]

export function detectWordPress(html) {
  const source = String(html || '')
  const signals = []
  let score = 0
  for (const { re, weight, label } of WP_SIGNALS) {
    const match = source.match(re)
    if (match) {
      signals.push(label)
      score += weight
    }
  }
  return { isWp: score >= 3, score, signals }
}

// Obfuscated-loader signatures commonly injected into compromised WP installs.
const MALWARE_PATTERNS = [
  { re: /\beval\s*\(\s*(?:window\.)?atob\s*\(/i, severity: 'critical', label: 'eval(atob(...)) loader' },
  { re: /\beval\s*\(\s*unescape\s*\(/i, severity: 'critical', label: 'eval(unescape(...)) loader' },
  { re: /document\.write\s*\(\s*unescape\s*\(/i, severity: 'critical', label: 'document.write(unescape(...)) injector' },
  { re: /String\.fromCharCode\s*\(\s*\d{2,3}\s*,\s*\d{2,3}\s*,\s*\d{2,3}/, severity: 'high', label: 'fromCharCode obfuscation blob' },
]

export function wordpressAudit(html) {
  const source = String(html || '')
  const profile = detectWordPress(source)
  const issues = []

  for (const { re, severity, label } of MALWARE_PATTERNS) {
    const match = source.match(re)
    if (match) {
      issues.push({
        type: 'wordpress_malware_loader',
        severity,
        description: `Suspicious ${label} detected${profile.isWp ? ' (common in compromised WordPress installs)' : ''}.`,
        fixHint: 'Remove the obfuscated loader script entirely; it is never legitimate theme code.',
      })
    }
  }

  if (profile.isWp) {
    // Migration classic: absolute http:// asset URLs inside a WP document.
    const httpAssets = source.match(/(?:src|href)=["']http:\/\/[^"']+\/wp-(?:content|includes)\/[^"']*["']/gi) || []
    if (httpAssets.length >= 3) {
      issues.push({
        type: 'wordpress_mixed_content',
        severity: 'high',
        description: `${httpAssets.length} WordPress assets referenced over insecure http:// — browsers block these on HTTPS origins, breaking theme styles/scripts.`,
        fixHint: 'Rewrite http:// wp-content/wp-includes URLs to protocol-relative or https://.',
      })
    }
  }

  return { profile, issues }
}

export function wordpressGuidance(profile) {
  if (!profile?.isWp) return ''
  const signals = (profile.signals || []).join(', ')
  return [
    'WORDPRESS CONTEXT (surgical rules):',
    `- Signals: ${signals}.`,
    '- NEVER rewrite or relocate /wp-content/ or /wp-includes/ paths — plugins and themes depend on them.',
    '- Broken styling/scripts are usually a blocked or 404-ing theme/plugin asset: repair the reference, do not delete the enqueue.',
    '- Preserve REST endpoint hints (/wp-json/), form nonces, and data-* attributes injected by plugins.',
    '- Remove obvious injected loader scripts (eval/atob/unescape) completely — they are not part of any legitimate theme.',
  ].join('\n')
}
