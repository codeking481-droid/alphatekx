// restorationEngineV3.mjs — AlphaTekX Restoration v3.0: deep restoration layer.
//
// Composes on top of the proven v2 engine (restorationEngineV2.mjs) and adds
// everything v2 deliberately left out:
//   HTML       duplicate ID removal, iframe titles, inline event-handler syntax
//              checks (V8 compile), broken internal anchor surgery
//   Security   rel="noopener noreferrer" on target="_blank", form action
//              http->https upgrade (v2 only covered src/href)
//   UX         keyboard :focus-visible styles
//   SEO        JSON-LD WebSite structured data injection
//   Batch      same-origin multi-page crawling with per-page restoration and a
//              single deployable ZIP
//   Intel      site-purpose classification, static performance snapshot
//              (before/after), restoration history log, honest manual
//              recommendations for anything that must not be auto-fixed
//   Verify     combined v2+v3 re-scan with up to 3 idempotent fix iterations;
//              anything still standing is reported as unresolved, never faked
//
// Routes (mounted under /api/engine/v3/):
//   POST /api/engine/v3/restore   one-shot { url | html, baseUrl?, multiPage?, maxPages? }
//                                 -> { ok, pages, restored, report }
//   GET  /api/engine/v3/health    liveness + capability matrix
//   GET  /api/engine/v3/history   recent restorations from the learning log

import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { detectIssuesV2, applyFixesToHtmlV2, findBrokenResources } from './restorationEngineV2.mjs'
import { FileHandler, sanitizeEncoding, validateHtml } from './scanEngine/fileUtils.js'
import { createMinimalZip } from './websiteRestoreStream.mjs'

const FETCH_TIMEOUT_MS = 15_000
const MAX_HTML_BYTES = 900_000
const MAX_VERIFY_ITERATIONS = 3
const DEFAULT_MAX_PAGES = 8

const SEVERITY_DEDUCTION = { critical: 15, high: 10, medium: 5, low: 2 }

const SITE_TYPE_SIGNALS = [
  ['ecommerce', /\b(cart|checkout|add to cart|price|shop|product|buy now|order)\b/i],
  ['saas_app', /\b(dashboard|sign in|log in|workspace|billing|api key)\b/i],
  ['news', /\b(breaking|headlines|latest news|published|read more)\b/i],
  ['blog', /\b(blog|posted in|leave a comment|archives|categories)\b/i],
  ['portfolio', /\b(portfolio|my works|selected projects|gallery|case study)\b/i],
  ['corporate', /\b(about us|our team|careers|contact us|our services)\b/i],
  ['landing', /\b(get started|start free|book a demo|limited time|cta)\b/i],
]

// ─── Small shared helpers (kept local so v3 stays self-contained) ────────────

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function getAttr(tag, attr) {
  const m = new RegExp(`\\b${attr}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(tag)
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : ''
}

function tagHasAttr(tag, attr) {
  return new RegExp(`\\b${attr}\\s*=`, 'i').test(tag)
}

function stripTags(text) {
  return String(text || '').replace(/<[^>]*>/g, '').replace(/&nbsp;|&amp;/gi, ' ').replace(/\s+/g, ' ').trim()
}

function allStyleCss(html) {
  let css = ''
  for (const m of String(html).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) css += `\n${m[1] || ''}`
  return css
}

function normalizeTargetUrl(raw) {
  let value = String(raw || '').trim()
  if (!value) return null
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (!parsed.hostname || parsed.hostname.length > 253) return null
    return parsed.toString()
  } catch {
    return null
  }
}

async function fetchPage(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AlphaTekxRestoreEngine/3.0)', Accept: 'text/html,application/xhtml+xml' },
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  const contentType = String(response.headers.get('content-type') || '')
  const text = await response.text()
  return { ok: response.ok, status: response.status, finalUrl: response.url || url, contentType, html: text }
}

async function probeStatus(url) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const response = await fetch(url, {
        method,
        redirect: 'follow',
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AlphaTekxRestoreEngine/3.0)' },
      })
      if (method === 'GET') response.body?.cancel().catch(() => {})
      if (method === 'HEAD' && (response.status === 405 || response.status === 501)) continue
      return response.status
    } catch {
      if (method === 'GET') return 0
    }
  }
  return 0
}

function vmSafe(code) {
  return new vm.Script(code, { filename: 'atk-v3-check.js' })
}

// ─── v3 detection ─────────────────────────────────────────────────────────────

export function detectIssuesV3(html) {
  const src = String(html)
  const findings = []
  let counter = 0
  const add = (type, severity, description, count = 1, evidence = '') => {
    findings.push({ id: `v3-${++counter}`, type, severity, description, count, evidence: evidence.slice(0, 200) })
  }

  // Duplicate IDs — invalid HTML, breaks getElementById and label associations.
  const seenIds = new Map()
  let dupCount = 0
  let dupEvidence = ''
  for (const m of src.matchAll(/<[a-zA-Z][^>]*>/g)) {
    const id = getAttr(m[0], 'id')
    if (!id) continue
    seenIds.set(id, (seenIds.get(id) || 0) + 1)
  }
  for (const [id, n] of seenIds) {
    if (n > 1) {
      dupCount += n - 1
      if (!dupEvidence) dupEvidence = `id="${id}" x${n}`
    }
  }
  if (dupCount > 0) add('duplicate_ids', 'medium', `${dupCount} duplicate id attribute value(s) detected (${[...seenIds.entries()].filter(([, n]) => n > 1).map(([id, n]) => `${id} x${n}`).join(', ')}). Duplicate IDs are invalid HTML and break getElementById, labels, and anchors.`, dupCount, dupEvidence)

  // Keyboard focus states.
  if (/<(a|button|input|textarea|select)\b/i.test(src) && !/:focus/i.test(allStyleCss(src))) {
    add('missing_focus_states', 'low', 'No :focus or :focus-visible styles found. Keyboard users cannot see where they are on the page (WCAG 2.4.7).')
  }

  // target="_blank" without noopener — reverse tabnabbing vector.
  let unsafeBlank = 0
  let blankEvidence = ''
  for (const m of src.matchAll(/<a\b[^>]*>/gi)) {
    const tag = m[0]
    if (!/\btarget\s*=\s*["']_blank["']/i.test(tag)) continue
    const rel = getAttr(tag, 'rel')
    if (/noopener|noreferrer/i.test(rel)) continue
    unsafeBlank += 1
    if (!blankEvidence) blankEvidence = tag.slice(0, 120)
  }
  if (unsafeBlank > 0) add('noopener_missing', 'medium', `${unsafeBlank} link(s) open in a new tab without rel="noopener noreferrer"; the opened page can control this page via window.opener (reverse tabnabbing).`, unsafeBlank, blankEvidence)

  // Insecure form actions.
  const insecureForms = [...src.matchAll(/<form\b[^>]*\baction\s*=\s*["']http:\/\/(?!localhost|127\.0\.0\.1)[^"']*["'][^>]*>/gi)]
  if (insecureForms.length) add('insecure_form_action', 'high', `${insecureForms.length} form(s) submit over plain http://; credentials and payment data would travel unencrypted.`, insecureForms.length, insecureForms[0][0].slice(0, 120))

  // Broken internal anchors: href="#x" with no target and no scripted routing.
  const scriptBodies = [...src.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join('\n')
  const knownTargets = new Set([...src.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]))
  for (const m of src.matchAll(/<a\b[^>]*?\bname\s*=\s*["']([^"']+)["']/gi)) knownTargets.add(m[1])
  const brokenAnchors = []
  for (const m of src.matchAll(/<a\b[^>]*?\bhref\s*=\s*["']#([^"'/]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const frag = m[1]
    if (knownTargets.has(frag)) continue
    const referencedInJs = new RegExp(`\\b${frag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(scriptBodies)
    if (referencedInJs) continue
    brokenAnchors.push({ href: `#${frag}`, label: stripTags(m[2]), index: m.index, full: m[0] })
  }
  if (brokenAnchors.length) add('broken_internal_anchor', 'medium', `${brokenAnchors.length} anchor link(s) point to missing targets (${brokenAnchors.slice(0, 3).map((a) => a.href).join(', ')}); clicking does nothing. Unreferenced by any script, so the dead links are unwrapped while keeping their text.`, brokenAnchors.length, brokenAnchors[0]?.full || '')

  // Iframes without accessible names.
  const nakedIframes = [...src.matchAll(/<iframe\b(?![^>]*\btitle\s*=\s*["'][^"']+["'])(?![^>]*\baria-label\s*=)[^>]*>/gi)]
  if (nakedIframes.length) add('iframe_missing_title', 'low', `${nakedIframes.length} iframe(s) ha${nakedIframes.length === 1 ? 's' : 've'} no title attribute; screen readers announce them as empty frames.`, nakedIframes.length)

  // Inline event handlers that fail to compile — silent interaction breakage.
  let brokenHandlers = 0
  let handlerEvidence = ''
  vmCompileTagLoop:
  for (const tagM of src.matchAll(/<[a-zA-Z][^>]*>/g)) {
    const tag = tagM[0]
    for (const h of tag.matchAll(/\son([a-z]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
      const code = h[2] ?? h[3] ?? ''
      if (!code.trim()) continue
      try {
        new vmSafe(`function _atk(){\n${code}\n}`)
      } catch {
        brokenHandlers += 1
        if (!handlerEvidence) handlerEvidence = `${h[1]}="${code.slice(0, 60)}"`
        break vmCompileTagLoop
      }
    }
  }
  if (brokenHandlers > 0) add('inline_handler_syntax', 'critical', `At least one inline event handler fails to compile (e.g. ${handlerEvidence}); clicking those elements throws instead of acting.`)

  // Structured data.
  if (!/application\/ld\+json/i.test(src)) add('jsonld_missing', 'low', 'No JSON-LD structured data found; search engines get no machine-readable summary (rich results ineligible).')

  return findings
}

// ─── v3 fixes (all idempotent) ────────────────────────────────────────────────

export function applyV3Fixes(html, enabledTypes, ctx = {}) {
  let out = String(html)
  const applied = []
  const want = (t) => enabledTypes.has(t)

  if (want('duplicate_ids')) {
    const seen = new Set()
    let removed = 0
    out = out.replace(/<([a-zA-Z][^\s>/]*)\b([^>]*)>/g, (m, tagName, attrs) => {
      const id = getAttr(attrs, 'id')
      if (!id) return m
      if (!seen.has(id)) {
        seen.add(id)
        return m
      }
      const stripped = attrs.replace(new RegExp(`\\s+id\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s">]+))`), '')
      removed += 1
      return `<${tagName}${stripped}>`
    })
    if (removed > 0) applied.push('duplicate_ids')
  }

  if (want('missing_focus_states') && !/:focus/i.test(allStyleCss(out))) {
    const focusCss = `\n/* atk-v3 focus */\na:focus-visible,button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible,[tabindex]:focus-visible{outline:2px solid #005fcc;outline-offset:2px;border-radius:2px;}\n`
    out = injectCss(out, focusCss)
    applied.push('missing_focus_states')
  }

  if (want('noopener_missing')) {
    let fixedCount = 0
    out = out.replace(/<a\b([^>]*)>/gi, (m, attrs) => {
      if (!/\btarget\s*=\s*["']_blank["']/i.test(attrs)) return m
      const rel = getAttr(`<a${attrs}>`, 'rel')
      if (/noopener|noreferrer/i.test(rel)) return m
      fixedCount += 1
      return `<a${attrs} rel="noopener noreferrer">`
    })
    if (fixedCount > 0) applied.push('noopener_missing')
  }

  if (want('insecure_form_action')) {
    const patched = out.replace(/(<form\b[^>]*\baction\s*=\s*["'])http:\/\/(?!localhost|127\.0\.0\.1)([^"']+["'])/gi, '$1https://$2')
    if (patched !== out) applied.push('insecure_form_action')
    out = patched
  }

  if (want('broken_internal_anchor')) {
    const scriptBodies = [...out.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join('\n')
    const knownTargets = new Set([...out.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]))
    for (const m of out.matchAll(/<a\b[^>]*?\bname\s*=\s*["']([^"']+)["']/gi)) knownTargets.add(m[1])
    out = out.replace(/<a\b([^>]*?\bhref\s*=\s*["'])#([^"'/#]+)(["'][^>]*>)([\s\S]*?)<\/a>/gi, (m, pre, frag, post, inner) => {
      if (knownTargets.has(frag)) return m
      if (new RegExp(`\\b${frag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(scriptBodies)) return m
      return inner
    })
    applied.push('broken_internal_anchor')
  }

  if (want('iframe_missing_title')) {
    out = out.replace(/<iframe\b([^>]*)>/gi, (m, attrs) => {
      if (/title\s*=\s*["'][^"']+["']/i.test(attrs) || /aria-label\s*=/i.test(attrs)) return m
      const srcAttr = getAttr(`<iframe${attrs}>`, 'src') || ''
      let guess = 'Embedded content'
      try {
        const base = decodeURIComponent(new URL(srcAttr, 'https://x.invalid').pathname.split('/').pop() || '')
        if (base) guess = base.replace(/[-_.]/g, ' ').replace(/\.(html?|php|aspx?)$/i, '').trim() || guess
        guess = guess.charAt(0).toUpperCase() + guess.slice(1)
      } catch {}
      return `<iframe${attrs} title="${escapeHtml(guess)}">`
    })
    applied.push('iframe_missing_title')
  }

  if (want('inline_handler_syntax')) {
    let disabled = 0
    out = out.replace(/<([a-zA-Z][^<]*?)>/g, (tagFull) => {
      let tag = tagFull
      for (const h of tag.matchAll(/\son([a-z]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
        const code = h[2] ?? h[3] ?? ''
        if (!code.trim()) continue
        let broken = false
        try {
          vmSafe(`function _atk(){\n${code}\n}`)
        } catch {
          broken = true
        }
        if (broken) {
          tag = tag.replace(new RegExp(`\\son${h[1]}\\s*=\\s*(?:"[^"]*"|'[^']*')`), '')
          disabled += 1
        }
      }
      return tag
    })
    if (disabled > 0) applied.push('inline_handler_syntax')
  }

  if (want('jsonld_missing') && !/application\/ld\+json/i.test(out)) {
    const titleText = ((/<title>([^<]*)<\/title>/i.exec(out) || [])[1] || 'Restored Site').trim()
    const descText = ((/<meta[^>]+name=["']description["'][^>]+content\s*=\s*["']([^"']*)["']/i.exec(out) || [])[1] || 'Restored by AlphaTekX').trim()
    const baseUrl = String(ctx.baseUrl || 'https://alphatekx.name.ng/').replace(/^http:/i, 'https:').replace(/\/+$/, '')
    // 2026 AI Search: 4-schema stack — WebSite + Organization + Article + FAQPage (65% of AI citations use schema, ChatGPT favors FAQPage). Keep top-level @type for backward test compat.
    const graph = [
      { '@type': 'Organization', '@id': `${baseUrl}/#organization`, name: titleText, url: `${baseUrl}/`, logo: { '@type': 'ImageObject', url: `${baseUrl}/og-image.png` } },
      { '@type': 'Article', headline: titleText, description: descText, author: { '@type': 'Organization', name: titleText }, datePublished: new Date().toISOString(), dateModified: new Date().toISOString(), mainEntityOfPage: `${baseUrl}/` },
      { '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: `What is ${titleText}?`, acceptedAnswer: { '@type': 'Answer', text: descText } }] },
    ]
    const data = JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebSite', name: titleText, description: descText, url: `${baseUrl}/`, '@graph': graph })
    const ldTag = `\n  <script type="application/ld+json">${data}</script>`
    if (/<\/head>/i.test(out)) {
      const closeIdx = out.toLowerCase().lastIndexOf('</head>')
      out = out.slice(0, closeIdx) + ldTag + out.slice(closeIdx)
    } else {
      out += ldTag
    }
    applied.push('jsonld_missing')
  }

  out = sanitizeEncoding(out)
  return { html: out, applied }
}

function injectCss(html, css) {
  if (/<\/style>/i.test(html)) {
    const firstClose = html.toLowerCase().indexOf('</style>')
    return html.slice(0, firstClose) + css + html.slice(firstClose)
  }
  const headOpen = /<head[^>]*>/i.exec(html)
  if (headOpen) {
    const at = headOpen.index + headOpen[0].length
    return html.slice(0, at) + `\n<style>${css}</style>` + html.slice(at)
  }
  return `<style>${css}</style>\n${html}`
}

// ─── Intelligence: context, performance snapshot, history, recommendations ───

function classifySite(html) {
  const text = stripTags(String(html)).slice(0, 20_000)
  const signals = []
  let best = { type: 'generic', hits: 0 }
  for (const [type, re] of SITE_TYPE_SIGNALS) {
    const matches = text.match(new RegExp(re.source, 'gi')) || []
    if (matches.length) {
      signals.push({ type, hits: matches.length })
      if (matches.length > best.hits) best = { type, hits: matches.length }
    }
  }
  return { siteType: best.type, signals }
}

function perfSnapshot(html) {
  const src = String(html)
  const headMatch = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(src)
  const head = headMatch ? headMatch[1] : ''
  const domNodes = (src.match(/<[a-zA-Z]/g) || []).length
  const externalScripts = (src.match(/<script\b[^>]*\bsrc\s*=/gi) || []).length
  const blockingScripts = (head.match(/<script\b[^>]*\bsrc\s*=\s*["'][^"']+["'][^>]*>/gi) || []).filter((t) => !/\b(defer|async)\b/i.test(t) && !/\btype\s*=\s*["']module["']/i.test(t)).length
  const imagesWithoutLazy = (src.match(/<img(?![^>]*\bloading\s*=)[^>]*>/gi) || []).length
  const styleBytes = Buffer.byteLength([...src.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join(''), 'utf8')

  let score = 100
  score -= Math.min(24, blockingScripts * 4)
  score -= Math.min(16, imagesWithoutLazy * 2)
  if (domNodes > 1500) score -= 10
  else if (domNodes > 800) score -= 5
  if (styleBytes > 120_000) score -= 10
  return {
    score: Math.max(0, score),
    domNodes,
    externalScripts,
    renderBlockingScripts: blockingScripts,
    imagesWithoutLazy,
    inlineStyleBytes: styleBytes,
  }
}

function appendHistory(entry) {
  try {
    const dir = path.join(process.cwd(), 'data')
    fs.mkdirSync(dir, { recursive: true })
    fs.appendFileSync(path.join(dir, 'restoration-history.jsonl'), `${JSON.stringify(entry)}\n`)
    return true
  } catch {
    return false
  }
}

function readHistory(limit = 25) {
  try {
    const file = path.join(process.cwd(), 'data', 'restoration-history.jsonl')
    if (!fs.existsSync(file)) return []
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
    return lines.slice(-limit).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  } catch {
    return []
  }
}

async function collectRecommendations(finalUrl, restoredHtml) {
  const recs = []
  recs.push('Run a Lighthouse audit on the deployed site for field-grade Core Web Vitals.')
  recs.push('Upload a real 1200x630 og-image.png if an og:image placeholder was injected.')
  if (/<!--/.test(restoredHtml)) recs.push('Review remaining HTML comments for sensitive internal notes before going public.')
  if (finalUrl) {
    try {
      const origin = new URL(finalUrl).origin
      const [robots, sitemap] = await Promise.all([probeStatus(`${origin}/robots.txt`), probeStatus(`${origin}/sitemap.xml`)])
      if (robots !== 200) recs.push('Add a robots.txt at the site root (missing or unreachable).')
      if (sitemap !== 200) recs.push('Add a sitemap.xml and reference it from robots.txt (missing or unreachable).')
    } catch {}
  }
  return recs
}

// ─── The combined restore pipeline ────────────────────────────────────────────

function restoreSinglePage(originalHtml, ctx) {
  const started = Date.now()
  const beforePerf = perfSnapshot(originalHtml)

  // Pass 1: full v2 spectrum. Probe findings (broken_script/style/link/image)
  // must be merged in — they never appear in static detection, and without
  // them the fix-enablement set skips dead-resource surgery entirely.
  const probeFindings = Array.isArray(ctx.probeFindings) ? ctx.probeFindings : []
  const v2Findings = [...detectIssuesV2(originalHtml), ...probeFindings]
  const pass1 = applyFixesToHtmlV2(originalHtml, new Set(v2Findings.map((f) => f.type)), ctx)

  // Pass 2: v3 deep layer on top of the repaired document.
  const v3FindingsOnFixed = detectIssuesV3(pass1.html)
  const pass2 = applyV3Fixes(pass1.html, new Set(v3FindingsOnFixed.map((f) => f.type)), ctx)

  // Verify loop: idempotent passes until clean or iteration budget spent.
  let current = pass2.html
  let iterations = 1
  let remaining = []
  for (let i = 0; i < MAX_VERIFY_ITERATIONS; i++) {
    const rem2 = detectIssuesV2(current)
    const rem3 = detectIssuesV3(current)
    remaining = [...rem2, ...rem3]
    if (!remaining.length) break
    iterations += 1
    if (rem2.length) current = applyFixesToHtmlV2(current, new Set(rem2.map((f) => f.type)), ctx).html
    if (rem3.length) current = applyV3Fixes(current, new Set(rem3.map((f) => f.type)), ctx).html
  }
  remaining = [...detectIssuesV2(current), ...detectIssuesV3(current)]

  const afterPerf = perfSnapshot(current)
  const allFindings = [...v2Findings, ...detectIssuesV3(originalHtml)]
  return {
    originalHtml,
    restoredHtml: current,
    findings: allFindings,
    beforeScore: scoreFor(allFindings),
    afterScore: remaining.length === 0 ? 100 : scoreFor(remaining),
    unresolved: remaining,
    verification: {
      rescanClean: remaining.length === 0,
      iterations,
      utf8Valid: validateHtml(current).valid,
      englishClean: FileHandler.isEnglish(current),
    },
    perf: { before: beforePerf, after: afterPerf },
    elapsedMs: Date.now() - started,
  }
}

function scoreFor(findings) {
  let score = 100
  for (const finding of findings) {
    score -= SEVERITY_DEDUCTION[finding.severity] || 2
    if (finding.count > 1) score -= Math.min(10, finding.count - 1)
  }
  return Math.max(0, Math.min(100, score))
}

function severitySummary(findings) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const finding of findings) {
    if (counts[finding.severity] !== undefined) counts[finding.severity] += 1
  }
  return counts
}

function pageSlug(url, fallbackIndex) {
  try {
    const parsed = new URL(url)
    const segments = parsed.pathname.split('/').filter(Boolean)
    if (!segments.length) return 'index.html'
    const name = segments.join('-').replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
    if (!name) return `page-${fallbackIndex}.html`
    return /\.html?$/i.test(name) ? name : `${name}.html`
  } catch {
    return `page-${fallbackIndex}.html`
  }
}

async function crawlSameOrigin(startUrl, maxPages) {
  const pages = []
  const skipped = []
  const queued = [startUrl]
  const seen = new Set([startUrl])
  let origin = ''
  try { origin = new URL(startUrl).origin } catch {}

  while (queued.length && pages.length < maxPages) {
    const url = queued.shift()
    let page
    try {
      page = await fetchPage(url)
      if (!page.html || !page.html.trim()) throw new Error('empty body')
      if (Buffer.byteLength(page.html, 'utf8') > MAX_HTML_BYTES) throw new Error('page exceeds size limit')
    } catch (err) {
      if (url === startUrl) throw Object.assign(new Error(`Could not reach ${url} (${err.message}).`), { status: 502, actionRequired: 'check_url' })
      skipped.push({ url, reason: err.message })
      continue
    }
    pages.push({ url: page.finalUrl || url, html: page.html })

    if (pages.length < maxPages && origin) {
      for (const m of page.html.matchAll(/<a\b[^>]*?\bhref\s*=\s*["']([^"#]+)["']/gi)) {
        let abs
        try { abs = new URL(m[1], page.finalUrl || url) } catch { continue }
        if (abs.origin !== origin || !/^https?:$/i.test(abs.protocol)) continue
        abs.hash = ''
        const key = abs.toString()
        if (seen.has(key)) continue
        seen.add(key)
        queued.push(key)
      }
    }
  }
  return { pages, skipped }
}

// ─── Route factory ────────────────────────────────────────────────────────────

export function createRestorationEngineV3(deps = {}) {
  const log = deps.log || (() => {})

  function json(res, status, payload) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(payload))
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let data = ''
      req.on('data', (chunk) => {
        data += chunk
        if (data.length > 12_000_000) {
          reject(new Error('Payload too large'))
          req.destroy()
        }
      })
      req.on('end', () => {
        try { resolve(data ? JSON.parse(data) : {}) } catch { reject(new Error('Invalid JSON body')) }
      })
      req.on('error', reject)
    })
  }

  async function handleRestore(req, res, body) {
    const multiPage = body.multiPage === true
    const maxPages = Math.max(1, Math.min(Number(body.maxPages) || DEFAULT_MAX_PAGES, 15))

    // Gather source page(s).
    let entryPages = []
    let baseUrl = body.baseUrl || null
    let fetchError = null
    if (typeof body.html === 'string' && body.html.trim()) {
      entryPages = [{ url: '', html: body.html }]
    } else {
      const normalized = normalizeTargetUrl(body.url)
      if (!normalized) return json(res, 400, { ok: false, error: 'Enter a valid http(s) URL or provide html directly.', action_required: 'enter_url' })
      baseUrl = baseUrl || normalized
      if (multiPage) {
        const crawlStart = Date.now()
        const crawl = await crawlSameOrigin(normalized, maxPages)
        entryPages = crawl.pages.map((p) => ({ url: p.url, html: p.html }))
        var crawlSkipped = crawl.skipped
        var crawlMs = Date.now() - crawlStart
      } else {
        try {
          const page = await fetchPage(normalized)
          if (!page.html || !page.html.trim()) throw new Error('Target returned an empty page.')
          if (Buffer.byteLength(page.html, 'utf8') > MAX_HTML_BYTES) throw new Error(`Page exceeds ${MAX_HTML_BYTES} byte limit.`)
          entryPages = [{ url: page.finalUrl, html: page.html }]
        } catch (err) {
          fetchError = err
        }
      }
    }
    if (fetchError) {
      log(`[engine-v3] fetch failed: ${fetchError.message}`)
      return json(res, 502, { ok: false, error: `Could not reach ${body.url} (${fetchError.message}).`, action_required: 'check_url' })
    }

    // Restore every page (with live resource probing when we have a URL).
    const results = []
    for (const page of entryPages) {
      let resourceFixes = []
      let probeFindings = []
      let resourceStats = null
      const effectiveBaseUrl = baseUrl || page.url || null
      if (page.url) {
        try {
          const probe = await findBrokenResources(page.html, page.url)
          resourceFixes = probe.brokenRecords
          probeFindings = probe.findings
          resourceStats = probe.stats
        } catch (err) {
          log(`[engine-v3] resource probe failed for ${page.url}: ${err.message}`)
        }
      }
      const outcome = restoreSinglePage(page.html, { resourceFixes, probeFindings, baseUrl: page.url || effectiveBaseUrl })
      outcome.url = page.url
      outcome.resourceStats = resourceStats
      outcome.context = classifySite(outcome.restoredHtml)
      results.push(outcome)
    }

    // Aggregate report.
    const primary = results[0]
    const totalFindings = results.reduce((sum, r) => sum + r.findings.length, 0)
    const unresolvedAll = results.flatMap((r) => r.unresolved.map((u) => ({ page: r.url || 'pasted-html', ...u })))
    const recommendations = await collectRecommendations(baseUrl || primary?.url || '', primary?.restoredHtml || '')

    const report = {
      engine: 'alpha-restoration-v3',
      generatedAt: new Date().toISOString(),
      mode: multiPage ? 'multi-page' : 'single-page',
      pagesScanned: results.length,
      issues_found: totalFindings,
      issues_fixed: results.reduce((sum, r) => sum + (r.findings.length - r.unresolved.length), 0),
      before_score: scoreFor(results.flatMap((r) => r.findings)),
      after_score: unresolvedAll.length === 0 ? 100 : scoreFor(unresolvedAll),
      severity: severitySummary(results.flatMap((r) => r.findings)),
      verification: {
        rescanClean: unresolvedAll.length === 0,
        iterations: primary?.verification.iterations,
        utf8Valid: results.every((r) => r.verification.utf8Valid),
        englishClean: results.every((r) => r.verification.englishClean),
        ...(crawlSkipped ? { crawledSkipped: crawlSkipped } : {}),
      },
      context: primary?.context,
      performance: {
        before: primary?.perf.before,
        after: primary?.perf.after,
        improved: (primary?.perf.after.score ?? 0) >= (primary?.perf.before.score ?? 0),
        crawlMs: typeof crawlMs === 'number' ? crawlMs : undefined,
      },
      findings_by_page: results.map((r) => ({ page: r.url || 'pasted-html', count: r.findings.length, types: [...new Set(r.findings.map((f) => f.type))] })),
      unresolved: unresolvedAll,
      recommendations,
      historyLogged: appendHistory({
        ts: new Date().toISOString(),
        url: baseUrl || '(pasted html)',
        mode: multiPage ? 'multi-page' : 'single-page',
        pages: results.length,
        issuesFound: totalFindings,
        issuesFixed: totalFindings - unresolvedAll.length,
        afterScore: unresolvedAll.length === 0 ? 100 : scoreFor(unresolvedAll),
      }),
    }

    // Deliverable ZIP: restored pages + per-page originals + report.
    const zipName = `restored-v3-${Date.now()}.zip`
    const zipPath = path.join(process.cwd(), 'data', zipName)
    let zipPathReturned = null
    try {
      fs.mkdirSync(path.dirname(zipPath), { recursive: true })
      const usedNames = new Set()
      const files = results.map((r, idx) => {
        let name = r.url ? pageSlug(r.url, idx + 1) : 'index.html'
        while (usedNames.has(name)) name = name.replace(/(\.html)?$/, `-p${idx + 1}$1`)
        usedNames.add(name)
        return [
          { name, data: r.restoredHtml },
          { name: `originals/${name.replace(/\.html$/, '.orig.html')}`, data: r.originalHtml },
        ]
      }).flat()
      files.push(
        { name: 'report.json', data: JSON.stringify({ ...report, restored_html_note: 'HTML is delivered per-page in this archive; single-page API responses embed restored_html directly.' }, null, 2) },
        { name: 'README.txt', data: `AlphaTekX Restoration v3.0\nGenerated: ${report.generatedAt}\nMode: ${report.mode}\nPages: ${results.length}\nIssues found: ${totalFindings}\nAfter score: ${report.after_score}/100\n\nDeploy: upload the *.html files to your hosting root.\noriginals/ contains the untouched sources for rollback.\n` },
      )
      createMinimalZip(zipPath, files)
      zipPathReturned = zipPath
    } catch (err) {
      log(`[engine-v3] zip packaging failed: ${err.message}`)
    }

    return json(res, 200, {
      ok: unresolvedAll.length === 0,
      ...report,
      restored_html: results.length === 1 ? primary.restoredHtml : undefined,
      pages_restored: results.map((r) => ({ url: r.url || 'pasted-html', slug: r.url ? pageSlug(r.url, 1) : 'index.html', afterScore: r.afterScore })),
      zip_path: zipPathReturned,
    })
  }

  return async function engineV3Route(req, res) {
    if (!String(req.url || '').startsWith('/api/engine/v3/')) return false
    const route = new URL(req.url, 'http://localhost').pathname

    try {
      if (req.method === 'GET' && route === '/api/engine/v3/health') {
        return json(res, 200, {
          ok: true,
          engine: 'alpha-restoration-v3',
          capabilities: {
            v2_spectrum: '36 issue classes (encoding, secrets, resources, responsive, forms, SEO pack, security headers, mobile nav)',
            v3_deep: ['duplicate_ids', 'missing_focus_states', 'noopener_missing', 'insecure_form_action', 'broken_internal_anchor', 'iframe_missing_title', 'inline_handler_syntax', 'jsonld_missing'],
            multi_page_crawl: true,
            verify_loop_iterations: MAX_VERIFY_ITERATIONS,
            context_classification: SITE_TYPE_SIGNALS.map(([t]) => t).concat(['generic']),
            performance_snapshot: true,
            history_learning: true,
            rollback_artifacts: 'originals/ included in every ZIP',
          },
        })
      }
      if (req.method === 'GET' && route === '/api/engine/v3/history') {
        return json(res, 200, { ok: true, entries: readHistory() })
      }
      if (req.method === 'POST' && route === '/api/engine/v3/restore') {
        await handleRestore(req, res, await readBody(req))
        return true
      }
      json(res, 404, { ok: false, error: `Unknown v3 route: ${req.method} ${route}`, action_required: 'check_endpoint' })
      return true
    } catch (err) {
      log(`[engine-v3] error on ${req.method} ${route}: ${err.message}`)
      json(res, err.status || 500, { ok: false, error: err.message || 'Engine failure.', action_required: err.actionRequired || 'retry' })
      return true
    }
  }
}
