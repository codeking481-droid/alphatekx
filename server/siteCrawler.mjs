/**
 * ALPHATEKX SITE CRAWLER — whole-site discovery for multi-page restoration.
 *
 * From a single entry URL Alpha maps every reachable page of the same site:
 *   1. Entry page links (<a href>) — breadth-first
 *   2. /sitemap.xml <loc> entries when present
 *   3. Deduped, same-host only, asset extensions skipped
 *
 * Every discovered page is fetched once during the crawl so the restoration
 * pipeline never re-downloads anything. Deadline-bounded and fail-soft: a
 * page that cannot be fetched is skipped and reported, never fatal.
 */

import { pooled } from './asyncUtils.mjs'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 AlphaTekX-Restoration/4.0'

const ASSET_EXT_RE = /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp|tiff?|css|js|mjs|json|xml|rss|atom|pdf|zip|gz|rar|7z|tar|mp4|webm|mov|avi|mkv|mp3|wav|ogg|flac|woff2?|ttf|eot|otf|txt|md|csv|docx?|xlsx?|pptx?|dmg|exe|apk)(?:[?#].*)?$/i

const DEFAULTS = {
  maxPages: 15,
  concurrency: 4,
  perPageTimeoutMs: 15000,
  timeBudgetMs: 90_000,
}

/** Strip www. so example.com and www.example.com count as one site. */
function bareHost(hostname) {
  return String(hostname || '').toLowerCase().replace(/^www\./, '')
}

/**
 * Canonical form used as both the crawl dedupe key and the deployed-site
 * page key: lowercase host dropped (same-host assumed), leading slash kept,
 * trailing slash removed unless root, no fragment. Query strings survive so
 * pages that genuinely differ stay distinct.
 */
export function normalizePagePath(rawUrl) {
  try {
    const u = new URL(rawUrl)
    let p = u.pathname || '/'
    if (p.length > 1) p = p.replace(/\/+$/, '') || '/'
    return p + (u.search || '')
  } catch {
    return null
  }
}

/** True when an href points at a document worth restoring on the same site. */
export function isCrawlableHref(href, baseUrlHost) {
  if (!href) return false
  const trimmed = href.trim()
  if (!trimmed || trimmed.startsWith('#')) return false
  if (/^(javascript:|mailto:|tel:|sms:|data:|blob:|about:)/i.test(trimmed)) return false
  let abs = null
  try { abs = new URL(trimmed, baseUrlHost) } catch { return false }
  if (!/^https?:$/i.test(abs.protocol)) return false
  if (bareHost(abs.hostname) !== bareHost(baseUrlHost.hostname)) return false
  if (ASSET_EXT_RE.test(abs.pathname)) return false
  return true
}

/** Extract same-host crawlable absolute URLs from an HTML document. */
export function extractLinks(html, baseUrl) {
  const base = new URL(baseUrl)
  const found = []
  const seen = new Set()
  for (const m of String(html || '').matchAll(/<a\b[^>]*?\shref\s*=\s*(["'])([^"']+)\1/gi)) {
    const href = m[2]
    if (!isCrawlableHref(href, base)) continue
    let abs
    try { abs = new URL(href, base) } catch { continue }
    abs.hash = ''
    const key = normalizePagePath(abs.href)
    if (!key || seen.has(key)) continue
    seen.add(key)
    found.push({ href: abs.href, key })
    if (found.length >= 200) break
  }
  return found
}

/** Parse <loc> entries out of a sitemap.xml body (same-host only). */
export function parseSitemap(xmlBody, baseUrl) {
  const base = new URL(baseUrl)
  const out = []
  const seen = new Set()
  for (const m of String(xmlBody || '').matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    let abs
    try { abs = new URL(m[1], base) } catch { continue }
    if (!/^https?:$/i.test(abs.protocol)) continue
    if (bareHost(abs.hostname) !== bareHost(base.hostname)) continue
    if (ASSET_EXT_RE.test(abs.pathname)) continue
    abs.hash = ''
    const key = normalizePagePath(abs.href)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push({ href: abs.href, key })
  }
  return out
}

async function fetchPage(url, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    })
    const body = await res.text()
    // Non-HTML responses are not restorable pages — treat as skipped.
    const looksHtml = res.ok && /<[\s\S]*?>/.test(String(body).slice(0, 4000))
    return { ok: Boolean(looksHtml), status: res.status, finalUrl: res.url || url, html: looksHtml ? body : '' }
  } catch (err) {
    return { ok: false, status: 0, finalUrl: url, html: '', error: err instanceof Error ? err.message : String(err) }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Crawl a site starting from an entry URL whose document is already loaded
 * (entryDoc) — it counts as page #1 and its links seed the frontier.
 *
 * @returns {{ pages: Array<{url:string, finalUrl:string, html:string}>,
 *             discovered:number, failed:Array<{url:string, reason:string}> }}
 */
export async function crawlSite(entryUrl, entryHtml, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts }
  const startedAt = Date.now()
  const entryKey = normalizePagePath(entryUrl) || '/'
  const queue = []           // { href, key }
  const enqueued = new Set([entryKey])
  const pages = [{ url: entryUrl, finalUrl: entryUrl, html: entryHtml }]
  const failed = []

  // Seed: sitemap first (authoritative), then entry-page links.
  const sitemap = await fetchPage(new URL('/sitemap.xml', entryUrl).href, 6000).catch(() => ({ ok: false, html: '' }))
  const seeds = sitemap.ok ? parseSitemap(sitemap.html, entryUrl) : []
  for (const link of [...seeds, ...extractLinks(entryHtml, entryUrl)]) {
    if (enqueued.has(link.key) || pages.length >= cfg.maxPages) continue
    enqueued.add(link.key)
    queue.push(link)
  }

  while (queue.length && pages.length < cfg.maxPages && Date.now() - startedAt < cfg.timeBudgetMs) {
    const batch = queue.splice(0, Math.min(cfg.concurrency, cfg.maxPages - pages.length))
    const results = await pooled(batch, cfg.concurrency, async (item) => {
      if (Date.now() - startedAt > cfg.timeBudgetMs) return { ok: false, skip: true }
      return fetchPage(item.href, cfg.perPageTimeoutMs)
    })
    for (let i = 0; i < results.length; i++) {
      const item = batch[i]
      const r = results[i]
      if (r?.ok) {
        pages.push({ url: item.href, finalUrl: r.finalUrl, html: r.html })
        if (pages.length < cfg.maxPages) {
          for (const link of extractLinks(r.html, r.finalUrl)) {
            if (enqueued.has(link.key) || pages.length >= cfg.maxPages) continue
            enqueued.add(link.key)
            queue.push(link)
          }
        }
      } else if (!r?.skip) {
        failed.push({ url: item.href, reason: r?.error ? clipReason(r.error) : `HTTP ${r?.status || 'unreachable'}` })
      }
    }
  }
  return { pages, discovered: enqueued.size + 1, failed }
}

function clipReason(text) {
  const s = String(text || '').trim()
  return s.length > 80 ? s.slice(0, 80) + '…' : s
}
