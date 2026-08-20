// AlphaTekX Website Code Scanner v2
// Scans ONLY live website code and content: HTML, CSS, JS, images, links.
// NO DNS lookups. NO hosting info. NO SSL cert checks. NO WHOIS. NO server headers.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

import { withContext } from './browserPool.mjs'
import { findSecrets } from './secretPatterns.mjs'

const EVIDENCE_ROOT = process.env.SCANNER_EVIDENCE_DIR || path.join(process.cwd(), '.tmp', 'scans')
const SEVERITY_WEIGHT = { critical: 30, high: 18, medium: 9, low: 4, info: 1 }
const FETCH_TIMEOUT = 12000
const LINK_CHECK_TIMEOUT = 8000
const MAX_CONCURRENT_LINK_CHECKS = 8
const MAX_LINKS_TO_CHECK = 60

// ============================================================================
// Secret patterns — API keys, tokens, passwords in page source
// ============================================================================
const SECRET_PATTERNS = [
  { type: 'OPENAI_KEY', label: 'OpenAI API key', regex: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}\b/g, severity: 'critical' },
  { type: 'ANTHROPIC_KEY', label: 'Anthropic API key', regex: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g, severity: 'critical' },
  { type: 'STRIPE_SECRET_KEY', label: 'Stripe secret key', regex: /\bsk_live_[A-Za-z0-9]{16,}\b/g, severity: 'critical' },
  { type: 'STRIPE_RESTRICTED_KEY', label: 'Stripe restricted key', regex: /\brk_live_[A-Za-z0-9]{16,}\b/g, severity: 'critical' },
  { type: 'STRIPE_PUBLISHABLE_KEY', label: 'Stripe publishable key (live)', regex: /\bpk_live_[A-Za-z0-9]{16,}\b/g, severity: 'high' },
  { type: 'AWS_ACCESS_KEY', label: 'AWS access key', regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, severity: 'critical' },
  { type: 'AWS_SECRET_KEY', label: 'AWS secret key', regex: /\baws_secret_access_key\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})\b/gi, severity: 'critical' },
  { type: 'GOOGLE_API_KEY', label: 'Google API key', regex: /\bAIza[0-9A-Za-z_-]{35}\b/g, severity: 'critical' },
  { type: 'GITHUB_TOKEN', label: 'GitHub token', regex: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g, severity: 'critical' },
  { type: 'SLACK_TOKEN', label: 'Slack token', regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, severity: 'critical' },
  { type: 'SENDGRID_KEY', label: 'SendGrid API key', regex: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g, severity: 'critical' },
  { type: 'TWILIO_SID', label: 'Twilio account SID', regex: /\bAC[a-f0-9]{32}\b/g, severity: 'high' },
  { type: 'HEROKU_API_KEY', label: 'Heroku API key', regex: /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g, severity: 'high' },
  { type: 'PRIVATE_KEY', label: 'Private key material', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g, severity: 'critical' },
  { type: 'DATABASE_URL', label: 'Database connection string with credentials', regex: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:@/"']+:[^\s:@/"']+@[^\s/"']+/gi, severity: 'critical' },
  { type: 'GENERIC_SECRET', label: 'Hardcoded secret or password', regex: /(?:password|passwd|secret|token|api_?key|auth_?token)\s*[:=]\s*["']([^"']{8,})["']/gi, severity: 'high' },
]

// ============================================================================
// Bad code patterns — XSS, eval, document.write, innerHTML
// ============================================================================
const BAD_CODE_PATTERNS = [
  { type: 'XSS_EVAL', label: 'eval() usage', regex: /\beval\s*\(/g, severity: 'high', description: 'eval() executes arbitrary code and is a major XSS vector' },
  { type: 'XSS_INNERHTML', label: 'innerHTML assignment', regex: /\.innerHTML\s*=/g, severity: 'high', description: 'Direct innerHTML assignment can inject malicious HTML/scripts' },
  { type: 'XSS_DOCUMENT_WRITE', label: 'document.write()', regex: /document\.write\s*\(/g, severity: 'medium', description: 'document.write() can be exploited for XSS attacks' },
  { type: 'XSS_OUTERHTML', label: 'outerHTML assignment', regex: /\.outerHTML\s*=/g, severity: 'medium', description: 'outerHTML assignment can inject malicious content' },
  { type: 'XSS_INSERTADJACENTHTML', label: 'insertAdjacentHTML()', regex: /\.insertAdjacentHTML\s*\(/g, severity: 'medium', description: 'insertAdjacentHTML can inject untrusted HTML' },
  { type: 'XSS_LOCATION_HREF', label: 'Unvalidated location.href', regex: /(?:window\.)?location(?:\.href)?\s*=\s*(?!['"]https?:\/\/)/g, severity: 'medium', description: 'Setting location.href from non-literal values can enable redirect attacks' },
  { type: 'UNSAFE_INNERHTML', label: 'dangerouslySetInnerHTML usage', regex: /dangerouslySetInnerHTML\s*=\s*\{/g, severity: 'medium', description: 'React dangerouslySetInnerHTML bypasses XSS protection' },
  { type: 'UNSAFE_POSTMESSAGE', label: 'postMessage without origin check', regex: /addEventListener\s*\(\s*['"]message['"]\s*,\s*(?:function|\(e\)|e\s*=>)/g, severity: 'medium', description: 'postMessage listener without apparent origin validation' },
  { type: 'WEAK_RANDOM', label: 'Weak random number generation', regex: /\bMath\.random\s*\(\)/g, severity: 'low', description: 'Math.random() is not cryptographically secure' },
  { type: 'CONSOLE_LOG_SECRETS', label: 'Console logging sensitive data', regex: /console\.(?:log|warn|error|debug)\s*\([^)]*(?:password|token|secret|key|credential)/gi, severity: 'medium', description: 'Sensitive data may be logged to browser console' },
]

// ============================================================================
// Exposed sensitive file patterns (code/content only, no server probing)
// ============================================================================
const EXPOSED_FILE_PATTERNS = [
  { path: '/.env', type: 'EXPOSED_ENV', label: 'Environment file exposed', validate: (b) => /^[\t ]*(?:export[\t ]+)?[A-Z][A-Z0-9_]{2,}\s*=/m.test(b) },
  { path: '/.env.local', type: 'EXPOSED_ENV', label: 'Local environment file exposed', validate: (b) => /^[\t ]*(?:export[\t ]+)?[A-Z][A-Z0-9_]{2,}\s*=/m.test(b) },
  { path: '/.env.production', type: 'EXPOSED_ENV', label: 'Production environment file exposed', validate: (b) => /^[\t ]*(?:export[\t ]+)?[A-Z][A-Z0-9_]{2,}\s*=/m.test(b) },
  { path: '/.git/config', type: 'EXPOSED_GIT', label: 'Git config exposed', validate: (b) => /\[core\]/i.test(b) },
  { path: '/.git/HEAD', type: 'EXPOSED_GIT', label: 'Git HEAD exposed', validate: (b) => /^ref:\s+refs\//im.test(b) },
  { path: '/config.json', type: 'EXPOSED_CONFIG', label: 'Config file exposed', validate: (b) => { try { return typeof JSON.parse(b) === 'object' } catch { return false } } },
  { path: '/backup.sql', type: 'EXPOSED_BACKUP', label: 'SQL backup exposed', validate: (b) => /(CREATE TABLE|INSERT INTO|MySQL dump|PostgreSQL)/i.test(b) },
]

// ============================================================================
// Known vulnerable dependency patterns (for inline package.json references)
// ============================================================================
const KNOWN_VULNERABLE_PATTERNS = [
  { type: 'CVE_LODASH', label: 'Lodash prototype pollution (CVE-2019-10744)', regex: /lodash[\/\\@]4\.17\.(?:1[0-5]|0)/g, severity: 'high', description: 'Lodash < 4.17.16 has prototype pollution vulnerability' },
  { type: 'CVE_NEXTJS', label: 'Next.js SSRF (CVE-2024-34351)', regex: /next[\/\\@](?:13\.[0-4]|14\.[0-1])\./g, severity: 'high', description: 'Next.js < 14.1.1 vulnerable to SSRF via Host header' },
  { type: 'CVE_MOMENT', label: 'Moment.js ReDoS (CVE-2022-31129)', regex: /moment[\/\\@]2\.29\.[0-3]/g, severity: 'medium', description: 'Moment.js < 2.29.4 has ReDoS vulnerability' },
  { type: 'CVE_AXIOS', label: 'Axios SSRF (CVE-2023-45857)', regex: /axios[\/\\@](?:0\.[0-2][0-9]?|1\.[0-5]\.)/g, severity: 'medium', description: 'Axios < 1.6.0 vulnerable to SSRF' },
  { type: 'CVE_JSON5', label: 'JSON5 prototype pollution (CVE-2022-46175)', regex: /json5[\/\\@]2\.[0-2]\./g, severity: 'high', description: 'JSON5 < 2.2.2 has prototype pollution vulnerability' },
  { type: 'CVE_EXPRESS', label: 'Express open redirect (CVE-2024-29041)', regex: /express[\/\\@]4\.1[0-8]\./g, severity: 'medium', description: 'Express < 4.19.2 has open redirect vulnerability' },
  { type: 'CVE_SEQUELIZE', label: 'Sequelize SQL injection (CVE-2024-xxxxx)', regex: /sequelize[\/\\@]6\.[0-3][0-6]\./g, severity: 'high', description: 'Sequelize versions may have SQL injection vulnerabilities' },
]

// ============================================================================
// Utility helpers
// ============================================================================

function normalizeTarget(rawUrl) {
  const trimmed = String(rawUrl || '').trim()
  if (!trimmed) throw new Error('Missing URL')
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let parsed
  try { parsed = new URL(withScheme) } catch { throw new Error('Please enter a valid http or https URL.') }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only http and https URLs are allowed.')
  if (!parsed.hostname.includes('.')) throw new Error('Please enter a full domain, for example https://example.com')
  return parsed
}

function maskSecret(value) {
  const v = String(value || '')
  if (v.length <= 8) return v.slice(0, 2) + '***'
  return v.slice(0, 6) + '***' + v.slice(-4)
}

function lineNumber(text, index) {
  let line = 1
  for (let i = 0; i < index && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) line++
  }
  return line
}

function resolveUrl(href, base) {
  try { return new URL(href, base).href } catch { return null }
}

function isSameOrigin(url, base) {
  try { return new URL(url).origin === new URL(base).origin } catch { return false }
}

function isExternalUrl(url, base) {
  try { return new URL(url).origin !== new URL(base).origin } catch { return true }
}

function extractLineSnippet(text, index, radius = 80) {
  const start = Math.max(0, index - radius)
  const end = Math.min(text.length, index + radius)
  return text.slice(start, end).replace(/\s+/g, ' ').trim()
}

// ============================================================================
// HTML parsing helpers (regex-based, no DOM dependency)
// ============================================================================

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return match ? match[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : ''
}

function extractMetaDescription(html) {
  return (
    (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i) || [])[1] ||
    (html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>/i) || [])[1] ||
    ''
  )
}

function extractMetaTags(html) {
  const tags = {}
  const ogTitle = (html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) || [])[1]
  const ogDesc = (html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) || [])[1]
  const ogImage = (html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) || [])[1]
  const robots = (html.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i) || [])[1]
  const viewport = (html.match(/<meta[^>]+name=["']viewport["'][^>]+content=["']([^"']+)["']/i) || [])[1]
  const charset = (html.match(/<meta[^>]+charset=["']?([^"'\s>]+)["']?/i) || [])[1]
  tags.ogTitle = ogTitle || ''
  tags.ogDescription = ogDesc || ''
  tags.ogImage = ogImage || ''
  tags.robots = robots || ''
  tags.viewport = viewport || ''
  tags.charset = charset || ''
  return tags
}

function extractLinks(html, baseUrl) {
  const links = new Set()
  const hrefRegex = /href=["']([^"'#][^"']*?)["']/gi
  let match
  while ((match = hrefRegex.exec(html))) {
    const resolved = resolveUrl(match[1], baseUrl)
    if (resolved) links.add(resolved)
  }
  return [...links]
}

function extractScriptSources(html, baseUrl) {
  const scripts = []
  const regex = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi
  let match
  while ((match = regex.exec(html))) {
    const resolved = resolveUrl(match[1], baseUrl)
    if (resolved) scripts.push({ src: resolved, line: lineNumber(html, match.index) })
  }
  return scripts
}

function extractStylesheets(html, baseUrl) {
  const sheets = []
  const regex = /<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi
  let match
  while ((match = regex.exec(html))) {
    const resolved = resolveUrl(match[1], baseUrl)
    if (resolved) sheets.push({ href: resolved, line: lineNumber(html, match.index) })
  }
  return sheets
}

function extractImages(html, baseUrl) {
  const images = []
  const regex = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi
  let match
  while ((match = regex.exec(html))) {
    const src = resolveUrl(match[1], baseUrl)
    if (!src) continue
    const tag = match[0]
    const altMatch = tag.match(/\balt=["']([^"']*)["']/i)
    const widthMatch = tag.match(/\bwidth=["']?(\d+)["']?/i)
    const heightMatch = tag.match(/\bheight=["']?(\d+)["']?/i)
    const loadingMatch = tag.match(/\bloading=["']([^"']+)["']/i)
    images.push({
      src,
      alt: altMatch ? altMatch[1] : null,
      hasAlt: altMatch !== null,
      width: widthMatch ? parseInt(widthMatch[1]) : null,
      height: heightMatch ? parseInt(heightMatch[1]) : null,
      loading: loadingMatch ? loadingMatch[1] : null,
      line: lineNumber(html, match.index),
    })
  }
  return images
}

function extractInlineScripts(html) {
  const scripts = []
  const regex = /<script\b[^>]*>([^<]*(?:<\/script>)?[^<]*)<\/script>/gi
  let match
  while ((match = regex.exec(html))) {
    const content = match[1]
    if (!content || content.trim().length === 0) continue
    // skip src-based scripts (already handled)
    if (match[0].match(/\bsrc=["']/i)) continue
    scripts.push({ content, line: lineNumber(html, match.index) })
  }
  return scripts
}

function extractInlineStyles(html) {
  const styles = []
  const regex = /<style\b[^>]*>([\s\S]*?)<\/style>/gi
  let match
  while ((match = regex.exec(html))) {
    styles.push({ content: match[1], line: lineNumber(html, match.index) })
  }
  return styles
}

function extractExternalLinks(html, baseUrl) {
  const links = extractLinks(html, baseUrl)
  return links.filter(l => isExternalUrl(l, baseUrl))
}

function extractInternalLinks(html, baseUrl) {
  const links = extractLinks(html, baseUrl)
  return links.filter(l => isSameOrigin(l, baseUrl))
}

function extractRenderBlockingResources(html) {
  const blocking = []
  const cssRegex = /<link\b[^>]*\brel=["']stylesheet["'][^>]*>/gi
  let match
  while ((match = cssRegex.exec(html))) {
    blocking.push({ type: 'css', tag: match[0], line: lineNumber(html, match.index) })
  }
  const scriptRegex = /<script\b[^>]*\bsrc=["'][^"']+["'][^>]*>/gi
  while ((match = scriptRegex.exec(html))) {
    const tag = match[0]
    // async/defer are not render-blocking
    if (/\b(async|defer)\b/i.test(tag)) continue
    blocking.push({ type: 'script', tag, line: lineNumber(html, match.index) })
  }
  return blocking
}

// ============================================================================
// SCAN CATEGORIES
// ============================================================================

// 1. BROKEN LINKS — Check all href/src URLs for 404, 500, redirect loops
async function scanBrokenLinks(html, baseUrl, emit, scanId) {
  const findings = []
  const links = [...new Set([...extractLinks(html, baseUrl)])]
  const toCheck = links.slice(0, MAX_LINKS_TO_CHECK)

  emit({ type: 'progress', progress: 30, message: `Checking ${toCheck.length} links...` })

  let checked = 0
  async function checkLink(url) {
    checked++
    if (checked % 10 === 0) {
      emit({ type: 'progress', progress: 30 + Math.round((checked / toCheck.length) * 15), message: `Checked ${checked}/${toCheck.length} links...` })
    }
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), LINK_CHECK_TIMEOUT)
      const res = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        redirect: 'manual',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      })
      clearTimeout(timer)

      const status = res.status
      const location = res.headers.get('location') || ''

      if (status === 404) {
        findings.push({
          id: `broken-404-${findings.length}`,
          type: 'broken_link',
          severity: 'high',
          url,
          description: 'Link returns HTTP 404 (Not Found)',
          line: null,
          snippet: null,
          fix: `Remove or update the broken link. Target returned 404.`,
        })
      } else if (status === 500 || status === 502 || status === 503) {
        findings.push({
          id: `broken-5xx-${findings.length}`,
          type: 'broken_link',
          severity: 'medium',
          url,
          description: `Link returns HTTP ${status} (Server Error)`,
          line: null,
          snippet: null,
          fix: 'Check if the linked resource is available or remove the link.',
        })
      } else if (status >= 300 && status < 400) {
        // Check for redirect chains
        if (location) {
          try {
            const redirectUrl = new URL(location, url).href
            if (redirectUrl === url) {
              findings.push({
                id: `redirect-loop-${findings.length}`,
                type: 'broken_link',
                severity: 'medium',
                url,
                description: 'Link redirects to itself (redirect loop)',
                line: null,
                snippet: `Redirects to: ${redirectUrl}`,
                fix: 'Fix the redirect target or remove the link.',
              })
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      const msg = String(err?.message || '')
      if (msg.includes('abort') || msg.includes('timeout')) {
        findings.push({
          id: `broken-timeout-${findings.length}`,
          type: 'broken_link',
          severity: 'medium',
          url,
          description: 'Link request timed out',
          line: null,
          snippet: null,
          fix: 'The resource may be slow or unreachable. Consider removing or updating the link.',
        })
      } else if (msg.includes('fetch failed') || msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED')) {
        findings.push({
          id: `broken-unreachable-${findings.length}`,
          type: 'broken_link',
          severity: 'medium',
          url,
          description: 'Link destination is unreachable',
          line: null,
          snippet: null,
          fix: 'The target host is unreachable. Remove or update the link.',
        })
      }
    }
  }

  // Parallel link checking
  const chunks = []
  for (let i = 0; i < toCheck.length; i += MAX_CONCURRENT_LINK_CHECKS) {
    chunks.push(toCheck.slice(i, i + MAX_CONCURRENT_LINK_CHECKS))
  }
  for (const chunk of chunks) {
    await Promise.allSettled(chunk.map(checkLink))
  }

  return findings
}

// 2. LEAKED SECRETS — API keys, tokens, passwords in HTML, CSS, JS files
async function scanLeakedSecrets(html, scriptSources, inlineScripts, inlineStyles, baseUrl, emit) {
  const findings = []
  emit({ type: 'progress', progress: 45, message: 'Scanning for leaked secrets...' })

  // Scan page HTML
  for (const pattern of SECRET_PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags.includes('g') ? pattern.regex.flags : `${pattern.regex.flags}g`)
    let match
    while ((match = regex.exec(html))) {
      const masked = maskSecret(match[0])
      findings.push({
        id: `secret-${pattern.type}-${findings.length}`,
        type: 'secret',
        severity: pattern.severity,
        url: baseUrl,
        description: `${pattern.label} found in page HTML`,
        line: lineNumber(html, match.index),
        snippet: extractLineSnippet(html, match.index),
        fix: `Remove ${pattern.label} from page source. Move to server-side environment variables.`,
      })
    }
  }

  // Scan inline scripts
  for (const script of inlineScripts) {
    for (const pattern of SECRET_PATTERNS) {
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags.includes('g') ? pattern.regex.flags : `${pattern.regex.flags}g`)
      let match
      while ((match = regex.exec(script.content))) {
        const masked = maskSecret(match[0])
        findings.push({
          id: `secret-${pattern.type}-js-${findings.length}`,
          type: 'secret',
          severity: pattern.severity,
          url: baseUrl,
          description: `${pattern.label} found in inline JavaScript`,
          line: script.line,
          snippet: extractLineSnippet(script.content, match.index),
          fix: `Remove ${pattern.label} from inline script. Move to server-side environment variables.`,
        })
      }
    }
  }

  // Scan external JS bundles (up to 10 same-origin scripts)
  const sameOriginScripts = scriptSources
    .filter(s => isSameOrigin(s.src, baseUrl))
    .slice(0, 10)

  for (const scriptInfo of sameOriginScripts) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
      const res = await fetch(scriptInfo.src, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      })
      clearTimeout(timer)
      if (!res.ok) continue
      const text = await res.text()
      if (!text || text.length > 2_000_000) continue

      for (const pattern of SECRET_PATTERNS) {
        const regex = new RegExp(pattern.regex.source, pattern.regex.flags.includes('g') ? pattern.regex.flags : `${pattern.regex.flags}g`)
        let match
        while ((match = regex.exec(text))) {
          const masked = maskSecret(match[0])
          findings.push({
            id: `secret-${pattern.type}-bundle-${findings.length}`,
            type: 'secret',
            severity: pattern.severity,
            url: scriptInfo.src,
            description: `${pattern.label} found in JavaScript bundle`,
            line: lineNumber(text, match.index),
            snippet: extractLineSnippet(text, match.index),
            fix: `Remove ${pattern.label} from client bundle. Use server-side environment variables.`,
          })
        }
      }
    } catch { /* skip unreachable bundles */ }
  }

  // Scan inline styles for secrets
  for (const style of inlineStyles) {
    for (const pattern of SECRET_PATTERNS) {
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags.includes('g') ? pattern.regex.flags : `${pattern.regex.flags}g`)
      let match
      while ((match = regex.exec(style.content))) {
        findings.push({
          id: `secret-${pattern.type}-css-${findings.length}`,
          type: 'secret',
          severity: pattern.severity,
          url: baseUrl,
          description: `${pattern.label} found in inline CSS`,
          line: style.line,
          snippet: extractLineSnippet(style.content, match.index),
          fix: `Remove ${pattern.label} from CSS.`,
        })
      }
    }
  }

  return findings
}

// 3. CVE VULNERABILITIES — Check inline dependencies and package references
async function scanCveVulnerabilities(html, scriptSources, baseUrl, emit) {
  const findings = []
  emit({ type: 'progress', progress: 55, message: 'Checking for known vulnerabilities...' })

  // Scan HTML for inline version references
  for (const pattern of KNOWN_VULNERABLE_PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags.includes('g') ? pattern.regex.flags : `${pattern.regex.flags}g`)
    let match
    while ((match = regex.exec(html))) {
      findings.push({
        id: `cve-${pattern.type}-${findings.length}`,
        type: 'cve',
        severity: pattern.severity,
        url: baseUrl,
        description: pattern.label,
        line: lineNumber(html, match.index),
        snippet: extractLineSnippet(html, match.index),
        fix: pattern.description,
      })
    }
  }

  // Scan external JS bundles for version strings
  const sameOriginScripts = scriptSources
    .filter(s => isSameOrigin(s.src, baseUrl))
    .slice(0, 10)

  for (const scriptInfo of sameOriginScripts) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
      const res = await fetch(scriptInfo.src, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      })
      clearTimeout(timer)
      if (!res.ok) continue
      const text = await res.text()
      if (!text || text.length > 2_000_000) continue

      for (const pattern of KNOWN_VULNERABLE_PATTERNS) {
        const regex = new RegExp(pattern.regex.source, pattern.regex.flags.includes('g') ? pattern.regex.flags : `${pattern.regex.flags}g`)
        let match
        while ((match = regex.exec(text))) {
          findings.push({
            id: `cve-${pattern.type}-bundle-${findings.length}`,
            type: 'cve',
            severity: pattern.severity,
            url: scriptInfo.src,
            description: pattern.label,
            line: lineNumber(text, match.index),
            snippet: extractLineSnippet(text, match.index),
            fix: pattern.description,
          })
        }
      }
    } catch { /* skip */ }
  }

  return findings
}

// 4. BAD CODE PATTERNS — XSS risks, eval(), innerHTML, document.write()
async function scanBadCodePatterns(html, inlineScripts, scriptSources, baseUrl, emit) {
  const findings = []
  emit({ type: 'progress', progress: 60, message: 'Scanning for bad code patterns...' })

  // Scan inline scripts
  for (const script of inlineScripts) {
    for (const pattern of BAD_CODE_PATTERNS) {
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags.includes('g') ? pattern.regex.flags : `${pattern.regex.flags}g`)
      let match
      while ((match = regex.exec(script.content))) {
        findings.push({
          id: `badcode-${pattern.type}-${findings.length}`,
          type: 'bad_code',
          severity: pattern.severity,
          url: baseUrl,
          description: pattern.label,
          line: script.line,
          snippet: extractLineSnippet(script.content, match.index),
          fix: pattern.description,
        })
      }
    }
  }

  // Scan external JS bundles (same-origin)
  const sameOriginScripts = scriptSources
    .filter(s => isSameOrigin(s.src, baseUrl))
    .slice(0, 10)

  for (const scriptInfo of sameOriginScripts) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
      const res = await fetch(scriptInfo.src, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      })
      clearTimeout(timer)
      if (!res.ok) continue
      const text = await res.text()
      if (!text || text.length > 2_000_000) continue

      for (const pattern of BAD_CODE_PATTERNS) {
        const regex = new RegExp(pattern.regex.source, pattern.regex.flags.includes('g') ? pattern.regex.flags : `${pattern.regex.flags}g`)
        let match
        while ((match = regex.exec(text))) {
          findings.push({
            id: `badcode-${pattern.type}-bundle-${findings.length}`,
            type: 'bad_code',
            severity: pattern.severity,
            url: scriptInfo.src,
            description: pattern.label,
            line: lineNumber(text, match.index),
            snippet: extractLineSnippet(text, match.index),
            fix: pattern.description,
          })
        }
      }
    } catch { /* skip */ }
  }

  return findings
}

// 5. PERFORMANCE ISSUES — Unoptimized images, render-blocking, caching
async function scanPerformance(html, images, scriptSources, stylesheets, baseUrl, responseHeaders, emit) {
  const findings = []
  emit({ type: 'progress', progress: 65, message: 'Analyzing performance issues...' })

  // Check render-blocking resources
  const blocking = extractRenderBlockingResources(html)
  if (blocking.length > 3) {
    findings.push({
      id: `perf-render-blocking-${findings.length}`,
      type: 'performance',
      severity: 'medium',
      url: baseUrl,
      description: `${blocking.length} render-blocking resources found (${blocking.filter(b => b.type === 'css').length} CSS, ${blocking.filter(b => b.type === 'script').length} scripts)`,
      line: null,
      snippet: null,
      fix: 'Add async/defer to non-critical scripts. Use <link rel="preload"> for critical CSS. Consider code splitting.',
    })
  }

  // Check for missing async/defer on scripts
  const scriptTags = html.match(/<script\b[^>]*\bsrc=["'][^"']+["'][^>]*>/gi) || []
  const blockingScripts = scriptTags.filter(t => !/\b(async|defer)\b/i.test(t))
  if (blockingScripts.length > 2) {
    findings.push({
      id: `perf-sync-scripts-${findings.length}`,
      type: 'performance',
      severity: 'medium',
      url: baseUrl,
      description: `${blockingScripts.length} synchronous (blocking) scripts detected`,
      line: null,
      snippet: blockingScripts[0]?.slice(0, 200),
      fix: 'Add async or defer attribute to non-critical scripts to prevent render blocking.',
    })
  }

  // Check for images without lazy loading
  const nonLazyImages = images.filter(img => !img.loading || img.loading !== 'lazy')
  const aboveFoldCount = 4
  if (nonLazyImages.length > aboveFoldCount) {
    const lazyCandidates = nonLazyImages.length - aboveFoldCount
    findings.push({
      id: `perf-no-lazy-${findings.length}`,
      type: 'performance',
      severity: 'low',
      url: baseUrl,
      description: `${lazyCandidates} images could benefit from lazy loading (loading="lazy")`,
      line: null,
      snippet: null,
      fix: 'Add loading="lazy" to below-the-fold images to improve initial page load.',
    })
  }

  // Check for images without explicit dimensions (causes layout shift)
  const noDimensions = images.filter(img => !img.width || !img.height)
  if (noDimensions.length > 3) {
    findings.push({
      id: `perf-no-dimensions-${findings.length}`,
      type: 'performance',
      severity: 'low',
      url: baseUrl,
      description: `${noDimensions.length} images missing explicit width/height (causes layout shift)`,
      line: null,
      snippet: null,
      fix: 'Add explicit width and height attributes to all <img> tags to prevent Cumulative Layout Shift (CLS).',
    })
  }

  // Check response caching headers
  const cacheControl = responseHeaders['cache-control'] || ''
  const etag = responseHeaders['etag'] || ''
  const lastModified = responseHeaders['last-modified'] || ''
  if (!cacheControl && !etag && !lastModified) {
    findings.push({
      id: `perf-no-cache-${findings.length}`,
      type: 'performance',
      severity: 'medium',
      url: baseUrl,
      description: 'No caching headers found (Cache-Control, ETag, Last-Modified)',
      line: null,
      snippet: null,
      fix: 'Add Cache-Control headers with appropriate max-age for static resources.',
    })
  }

  // Check for very large inline scripts (>100KB)
  const largeInline = html.match(/<script\b[^>]*>([\s\S]{100000,})<\/script>/gi) || []
  if (largeInline.length > 0) {
    findings.push({
      id: `perf-large-inline-js-${findings.length}`,
      type: 'performance',
      severity: 'medium',
      url: baseUrl,
      description: `${largeInline.length} inline script(s) exceeding 100KB — should be external files`,
      line: null,
      snippet: null,
      fix: 'Move large inline scripts to external files for better caching and parallel loading.',
    })
  }

  // Check for images over 500KB (via HEAD request for same-origin)
  const sameOriginImages = images.filter(img => isSameOrigin(img.src, baseUrl)).slice(0, 15)
  for (const img of sameOriginImages) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 5000)
      const res = await fetch(img.src, {
        method: 'HEAD',
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      })
      clearTimeout(timer)
      const contentLength = parseInt(res.headers.get('content-length') || '0')
      if (contentLength > 500_000) {
        findings.push({
          id: `perf-large-image-${findings.length}`,
          type: 'performance',
          severity: 'medium',
          url: img.src,
          description: `Image is ${(contentLength / 1024).toFixed(0)}KB — should be optimized or compressed`,
          line: img.line,
          snippet: `<img src="${img.src}" ...>`,
          fix: 'Compress the image, convert to WebP/AVIF format, or use a CDN with automatic optimization.',
        })
      }
    } catch { /* skip */ }
  }

  return findings
}

// 6. MISSING META TAGS — Title, description, Open Graph, robots
function scanMetaTags(html, baseUrl, emit) {
  const findings = []
  emit({ type: 'progress', progress: 70, message: 'Checking meta tags...' })

  const title = extractTitle(html)
  const description = extractMetaDescription(html)
  const meta = extractMetaTags(html)

  if (!title) {
    findings.push({
      id: 'meta-title-missing',
      type: 'meta',
      severity: 'high',
      url: baseUrl,
      description: 'Page is missing a <title> tag',
      line: null,
      snippet: null,
      fix: 'Add <title>Your Page Title</title> inside <head>. This is critical for SEO and browser tabs.',
    })
  } else if (title.length < 10) {
    findings.push({
      id: 'meta-title-short',
      type: 'meta',
      severity: 'medium',
      url: baseUrl,
      description: `Title is very short (${title.length} chars): "${title}"`,
      line: null,
      snippet: `<title>${title}</title>`,
      fix: 'Make the title 30-60 characters for optimal SEO.',
    })
  }

  if (!description) {
    findings.push({
      id: 'meta-description-missing',
      type: 'meta',
      severity: 'high',
      url: baseUrl,
      description: 'Page is missing a meta description',
      line: null,
      snippet: null,
      fix: 'Add <meta name="description" content="Your description here">. This appears in search results.',
    })
  } else if (description.length < 50) {
    findings.push({
      id: 'meta-description-short',
      type: 'meta',
      severity: 'medium',
      url: baseUrl,
      description: `Meta description is short (${description.length} chars)`,
      line: null,
      snippet: `<meta name="description" content="${description.slice(0, 100)}">`,
      fix: 'Write a meta description of 120-160 characters for optimal search result display.',
    })
  }

  if (!meta.ogTitle) {
    findings.push({
      id: 'meta-og-title-missing',
      type: 'meta',
      severity: 'medium',
      url: baseUrl,
      description: 'Missing Open Graph title (og:title)',
      line: null,
      snippet: null,
      fix: 'Add <meta property="og:title" content="..."> for better social media sharing.',
    })
  }

  if (!meta.ogDescription) {
    findings.push({
      id: 'meta-og-description-missing',
      type: 'meta',
      severity: 'low',
      url: baseUrl,
      description: 'Missing Open Graph description (og:description)',
      line: null,
      snippet: null,
      fix: 'Add <meta property="og:description" content="..."> for social media link previews.',
    })
  }

  if (!meta.ogImage) {
    findings.push({
      id: 'meta-og-image-missing',
      type: 'meta',
      severity: 'low',
      url: baseUrl,
      description: 'Missing Open Graph image (og:image)',
      line: null,
      snippet: null,
      fix: 'Add <meta property="og:image" content="URL-to-image"> for social media thumbnails.',
    })
  }

  if (!meta.robots) {
    findings.push({
      id: 'meta-robots-missing',
      type: 'meta',
      severity: 'low',
      url: baseUrl,
      description: 'Missing robots meta tag',
      line: null,
      snippet: null,
      fix: 'Add <meta name="robots" content="index, follow"> to control search engine indexing.',
    })
  }

  if (!meta.viewport) {
    findings.push({
      id: 'meta-viewport-missing',
      type: 'meta',
      severity: 'medium',
      url: baseUrl,
      description: 'Missing viewport meta tag — page may not be mobile-friendly',
      line: null,
      snippet: null,
      fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> for mobile support.',
    })
  }

  return findings
}

// 7. BROKEN IMAGES — img src returning 404
async function scanBrokenImages(images, baseUrl, emit) {
  const findings = []
  emit({ type: 'progress', progress: 75, message: `Checking ${images.length} images...` })

  const sameOriginImages = images.filter(img => isSameOrigin(img.src, baseUrl))
  const toCheck = sameOriginImages.slice(0, 30)

  let checked = 0
  async function checkImage(img) {
    checked++
    if (checked % 10 === 0) {
      emit({ type: 'progress', progress: 75 + Math.round((checked / toCheck.length) * 10), message: `Checked ${checked}/${toCheck.length} images...` })
    }
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), LINK_CHECK_TIMEOUT)
      const res = await fetch(img.src, {
        method: 'HEAD',
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      })
      clearTimeout(timer)

      if (res.status === 404) {
        findings.push({
          id: `broken-img-404-${findings.length}`,
          type: 'image',
          severity: 'high',
          url: img.src,
          description: 'Image returns HTTP 404 (Not Found)',
          line: img.line,
          snippet: `<img src="${img.src}" alt="${img.alt || ''}">`,
          fix: 'Remove the broken image or update the src URL to a valid image.',
        })
      } else if (res.status === 410) {
        findings.push({
          id: `broken-img-410-${findings.length}`,
          type: 'image',
          severity: 'high',
          url: img.src,
          description: 'Image returns HTTP 410 (Gone)',
          line: img.line,
          snippet: `<img src="${img.src}" alt="${img.alt || ''}">`,
          fix: 'Remove the image reference — the resource has been permanently removed.',
        })
      } else if (res.status >= 500) {
        findings.push({
          id: `broken-img-5xx-${findings.length}`,
          type: 'image',
          severity: 'medium',
          url: img.src,
          description: `Image returns HTTP ${res.status}`,
          line: img.line,
          snippet: `<img src="${img.src}" alt="${img.alt || ''}">`,
          fix: 'Check if the image server is available.',
        })
      }
    } catch (err) {
      const msg = String(err?.message || '')
      if (msg.includes('timeout') || msg.includes('abort')) {
        findings.push({
          id: `broken-img-timeout-${findings.length}`,
          type: 'image',
          severity: 'medium',
          url: img.src,
          description: 'Image request timed out',
          line: img.line,
          snippet: `<img src="${img.src}">`,
          fix: 'The image may be too large or the server is slow. Optimize or replace.',
        })
      }
    }
  }

  const chunks = []
  for (let i = 0; i < toCheck.length; i += MAX_CONCURRENT_LINK_CHECKS) {
    chunks.push(toCheck.slice(i, i + MAX_CONCURRENT_LINK_CHECKS))
  }
  for (const chunk of chunks) {
    await Promise.allSettled(chunk.map(checkImage))
  }

  return findings
}

// 8. ACCESSIBILITY ISSUES — Missing alt text, improper ARIA
function scanAccessibility(images, html, baseUrl, emit) {
  const findings = []
  emit({ type: 'progress', progress: 80, message: 'Checking accessibility...' })

  // Missing alt text
  const imagesNoAlt = images.filter(img => !img.hasAlt || img.alt === null)
  if (imagesNoAlt.length > 0) {
    const sample = imagesNoAlt.slice(0, 5)
    for (const img of sample) {
      findings.push({
        id: `a11y-no-alt-${findings.length}`,
        type: 'accessibility',
        severity: 'medium',
        url: baseUrl,
        description: 'Image missing alt attribute',
        line: img.line,
        snippet: `<img src="${img.src}">`,
        fix: 'Add descriptive alt text: <img src="..." alt="Description of image">',
      })
    }
    if (imagesNoAlt.length > 5) {
      findings.push({
        id: `a11y-no-alt-summary`,
        type: 'accessibility',
        severity: 'medium',
        url: baseUrl,
        description: `${imagesNoAlt.length} total images missing alt text`,
        line: null,
        snippet: null,
        fix: 'All images must have alt attributes for screen reader accessibility.',
      })
    }
  }

  // Empty alt text (decorative images should have alt="")
  const emptyAlt = images.filter(img => img.alt === '')
  // This is fine for decorative images, skip warning

  // Check for form inputs without labels
  const inputRegex = /<input\b[^>]*(?!.*\baria-label\b)(?!.*\bid=["'][^"']+["'])(?!.*\btype=["'](?:hidden|submit|button|image|reset)["'])[^>]*>/gi
  const inputsWithoutLabels = html.match(inputRegex) || []
  if (inputsWithoutLabels.length > 0) {
    findings.push({
      id: `a11y-no-label-${findings.length}`,
      type: 'accessibility',
      severity: 'medium',
      url: baseUrl,
      description: `${inputsWithoutLabels.length} form input(s) without associated labels or aria-label`,
      line: null,
      snippet: inputsWithoutLabels[0]?.slice(0, 200),
      fix: 'Add a <label for="inputId"> element or aria-label attribute to every form input.',
    })
  }

  // Check for missing lang attribute on html tag
  if (!/<html\b[^>]*\blang=["'][^"']+["']/i.test(html)) {
    findings.push({
      id: 'a11y-no-lang',
      type: 'accessibility',
      severity: 'medium',
      url: baseUrl,
      description: 'Missing lang attribute on <html> tag',
      line: null,
      snippet: null,
      fix: 'Add lang attribute: <html lang="en">',
    })
  }

  // Check for skip navigation links
  const hasSkipLink = /<a\b[^>]*\bhref=["']#(?:main|content|main-content)["'][^>]*>/i.test(html)
  const hasMainLandmark = /<main\b/i.test(html) || /role=["']main["']/i.test(html)
  if (!hasSkipLink && hasMainLandmark) {
    findings.push({
      id: 'a11y-no-skip-nav',
      type: 'accessibility',
      severity: 'low',
      url: baseUrl,
      description: 'No skip navigation link found (page has <main> landmark)',
      line: null,
      snippet: null,
      fix: 'Add a skip-to-content link: <a href="#main" class="sr-only focus:not-sr-only">Skip to content</a>',
    })
  }

  // Check for color contrast issues (very basic heuristic)
  const inlineColorRegex = /color:\s*(?:#[0-9a-fA-F]{3,8}|rgb\([^)]+\))/gi
  const hasLightColors = /color:\s*(?:#[cdefCDEF]{3}|rgb\((?:2[0-4]\d|25[0-5]|[01]?\d\d?)\s*,\s*(?:2[0-4]\d|25[0-5]|[01]?\d\d?)\s*,\s*(?:2[0-4]\d|25[0-5]|[01]?\d\d?)\))/gi
  const lightColors = html.match(hasLightColors) || []
  if (lightColors.length > 2) {
    findings.push({
      id: 'a11y-color-contrast',
      type: 'accessibility',
      severity: 'low',
      url: baseUrl,
      description: 'Potential color contrast issues detected (light colors on potentially light backgrounds)',
      line: null,
      snippet: lightColors[0],
      fix: 'Ensure text has a contrast ratio of at least 4.5:1 against its background (WCAG AA).',
    })
  }

  return findings
}

// ============================================================================
// MAIN SCANNER
// ============================================================================

function buildFinding(finding) {
  return {
    ...finding,
    timestamp: new Date().toISOString(),
  }
}

function scoreFrom(findings) {
  const weight = findings.reduce((total, f) => total + (SEVERITY_WEIGHT[f.severity] || 1), 0)
  return Math.max(0, 100 - weight)
}

function riskFrom(score, findings) {
  if (findings.some(f => f.severity === 'critical')) return 'CRITICAL'
  if (score < 55) return 'HIGH'
  if (score < 75) return 'MEDIUM'
  if (score < 90) return 'LOW'
  return 'SECURE'
}

export function createScanId() {
  return `scn_${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`
}

export function evidenceDirFor(scanId) {
  return path.join(EVIDENCE_ROOT, String(scanId).replace(/[^a-z0-9_-]/gi, ''))
}

/**
 * Runs a website code and content scan.
 * NO DNS. NO hosting. NO SSL. NO WHOIS. NO server headers.
 * ONLY scans HTML, CSS, JS, images, and links.
 */
export async function runRealScan(targetUrl, options = {}) {
  const parsed = normalizeTarget(targetUrl)
  const scanId = options.scanId || createScanId()
  let hardTimeoutReached = false
  const emit = (event) => {
    if (hardTimeoutReached) return
    if (typeof options.onEvent === 'function') options.onEvent(event)
  }
  const evidenceDir = evidenceDirFor(scanId)
  const startedAt = Date.now()

  console.log(`[Scanner ${scanId}] Starting code+content scan of: ${parsed.toString()}`)
  emit({ type: 'progress', progress: 1, message: 'Fetching page source...' })

  const hardTimeoutMs = Number(process.env.SCANNER_HARD_TIMEOUT_MS || 90000)

  const scan = (async () => {
    // ── Step 1: Fetch the page HTML ──────────────────────────────────────
    const fetchStartedAt = Date.now()
    let html = ''
    let finalUrl = parsed.toString()
    let responseStatus = 0
    let responseHeaders = {}

    const response = await fetch(parsed.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(25000),
      redirect: 'follow',
    })

    responseStatus = response.status
    finalUrl = response.url || parsed.toString()
    responseHeaders = {}
    response.headers.forEach((value, key) => { responseHeaders[key.toLowerCase()] = value })

    if (responseStatus === 403) throw new Error('Access denied (HTTP 403). The site is blocking automated traffic.')
    if (responseStatus === 401) throw new Error('Unauthorized (HTTP 401). This URL requires authentication.')
    if (responseStatus >= 500) throw new Error(`Target responded with HTTP ${responseStatus}.`)

    html = await response.text()
    if (!html || html.trim().length === 0) throw new Error('Received an empty response from the target site.')

    const ttfbMs = Date.now() - fetchStartedAt
    emit({ type: 'progress', progress: 8, message: `Page loaded (${(html.length / 1024).toFixed(1)}KB in ${ttfbMs}ms)` })

    // ── Step 2: Parse HTML to extract assets ─────────────────────────────
    const pageTitle = extractTitle(html)
    const metaDescription = extractMetaDescription(html)
    const scriptSources = extractScriptSources(html, finalUrl)
    const stylesheets = extractStylesheets(html, finalUrl)
    const images = extractImages(html, finalUrl)
    const inlineScripts = extractInlineScripts(html)
    const inlineStyles = extractInlineStyles(html)

    console.log(`[Scanner ${scanId}] Parsed: ${scriptSources.length} scripts, ${stylesheets.length} stylesheets, ${images.length} images, ${inlineScripts.length} inline scripts`)

    const allFindings = []
    const pushFinding = (f) => {
      allFindings.push(f)
      emit({ type: 'finding', finding: f })
    }

    // ── Step 3: Exposed sensitive files ──────────────────────────────────
    emit({ type: 'progress', progress: 12, message: 'Checking for exposed sensitive files...' })
    for (const target of EXPOSED_FILE_PATTERNS) {
      try {
        const probeUrl = new URL(target.path, parsed.origin).toString()
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 8000)
        const probeRes = await fetch(probeUrl, {
          method: 'GET',
          signal: controller.signal,
          redirect: 'manual',
          headers: { 'User-Agent': 'Mozilla/5.0' },
        })
        clearTimeout(timer)
        if (probeRes.status === 200) {
          const body = await probeRes.text().catch(() => '')
          if (target.validate(body)) {
            const secrets = findSecrets(body, target.path)
            pushFinding(buildFinding({
              id: `exposed-${target.path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}`,
              type: 'secret',
              severity: 'critical',
              url: probeUrl,
              description: target.label,
              line: null,
              snippet: body.slice(0, 200).replace(/\s+/g, ' ').trim(),
              fix: 'Remove this file from the public web root or block access via server configuration.',
            }))
          }
        }
      } catch { /* skip */ }
    }

    // ── Step 4: Broken links ─────────────────────────────────────────────
    const brokenLinkFindings = await scanBrokenLinks(html, finalUrl, emit, scanId)
    brokenLinkFindings.forEach(pushFinding)

    // ── Step 5: Leaked secrets ───────────────────────────────────────────
    const secretFindings = await scanLeakedSecrets(html, scriptSources, inlineScripts, inlineStyles, finalUrl, emit)
    secretFindings.forEach(pushFinding)

    // ── Step 6: CVE vulnerabilities ──────────────────────────────────────
    const cveFindings = await scanCveVulnerabilities(html, scriptSources, finalUrl, emit)
    cveFindings.forEach(pushFinding)

    // ── Step 7: Bad code patterns ────────────────────────────────────────
    const badCodeFindings = await scanBadCodePatterns(html, inlineScripts, scriptSources, finalUrl, emit)
    badCodeFindings.forEach(pushFinding)

    // ── Step 8: Performance issues ───────────────────────────────────────
    const perfFindings = await scanPerformance(html, images, scriptSources, stylesheets, finalUrl, responseHeaders, emit)
    perfFindings.forEach(pushFinding)

    // ── Step 9: Missing meta tags ────────────────────────────────────────
    const metaFindings = scanMetaTags(html, finalUrl, emit)
    metaFindings.forEach(pushFinding)

    // ── Step 10: Broken images ───────────────────────────────────────────
    const brokenImageFindings = await scanBrokenImages(images, finalUrl, emit)
    brokenImageFindings.forEach(pushFinding)

    // ── Step 11: Accessibility issues ────────────────────────────────────
    const a11yFindings = scanAccessibility(images, html, finalUrl, emit)
    a11yFindings.forEach(pushFinding)

    // ── Step 12: Try Playwright for screenshot ────────────────────────────
    let screenshot = null
    try {
      emit({ type: 'progress', progress: 90, message: 'Capturing screenshot...' })
      const { withContext: ctxFn } = await import('./browserPool.mjs')
      await ctxFn(async (context) => {
        const page = await context.newPage()
        try {
          const pageResponse = await page.goto(finalUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })
          if (pageResponse) {
            await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
          }
          await fs.promises.mkdir(evidenceDir, { recursive: true })
          const file = 'target.png'
          await page.screenshot({ path: path.join(evidenceDir, file), fullPage: false })
          screenshot = file

          // Also store in screenshots service directory for before/after comparison
          try {
            const shotsDir = path.join(process.cwd(), 'data', 'screenshots', scanId)
            await fs.promises.mkdir(shotsDir, { recursive: true })
            await fs.promises.copyFile(path.join(evidenceDir, file), path.join(shotsDir, 'before.png'))
          } catch { /* optional */ }
        } catch { /* screenshot is optional */ }
        finally { await page.close().catch(() => {}) }
      })
    } catch {
      console.log(`[Scanner ${scanId}] Screenshot capture skipped (Playwright unavailable)`)
    }

    // ── Build report ─────────────────────────────────────────────────────
    const score = scoreFrom(allFindings)
    const report = {
      scanId,
      url: parsed.toString(),
      scannedUrl: finalUrl,
      host: parsed.hostname,
      status: responseStatus,
      pageTitle,
      metaDescription,
      screenshot,
      engine: 'code-scanner-v2',
      score,
      risk: riskFrom(score, allFindings),
      findings: allFindings,
      counts: allFindings.reduce((acc, f) => ({ ...acc, [f.severity]: (acc[f.severity] || 0) + 1 }), {}),
      totalFindings: allFindings.length,
      discoveredEndpoints: [],
      responseHeaders: Object.keys(responseHeaders),
      durationMs: Date.now() - startedAt,
      startedAt: new Date(startedAt).toISOString(),
      completedAt: new Date().toISOString(),
      scanCategories: {
        brokenLinks: brokenLinkFindings.length,
        secrets: secretFindings.length,
        cve: cveFindings.length,
        badCode: badCodeFindings.length,
        performance: perfFindings.length,
        meta: metaFindings.length,
        brokenImages: brokenImageFindings.length,
        accessibility: a11yFindings.length,
        exposedFiles: allFindings.filter(f => f.id?.startsWith('exposed-')).length,
      },
    }

    await fs.promises.mkdir(evidenceDir, { recursive: true }).catch(() => {})
    await fs.promises.writeFile(path.join(evidenceDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8').catch(() => {})

    console.log(`[Scanner ${scanId}] Scan completed in ${Date.now() - startedAt}ms with ${report.totalFindings} findings (score: ${report.score}, risk: ${report.risk})`)
    emit({ type: 'progress', progress: 100, message: 'Scan complete' })
    return report
  })()

  return await Promise.race([
    scan,
    new Promise((_, reject) =>
      setTimeout(() => {
        hardTimeoutReached = true
        console.error(`[Scanner ${scanId}] Hard timeout reached after ${Math.round(hardTimeoutMs / 1000)}s`)
        reject(new Error(`Scan timed out after ${Math.round(hardTimeoutMs / 1000)}s.`))
      }, hardTimeoutMs)
    ),
  ])
}

export async function loadStoredReport(scanId) {
  const file = path.join(evidenceDirFor(scanId), 'report.json')
  const raw = await fs.promises.readFile(file, 'utf8').catch(() => null)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}
