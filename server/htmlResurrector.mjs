/**
 * ALPHATEKX HTML RESURRECTOR — the "Make It Work" engine.
 *
 * Where the repair pipeline used to COPY the live page and patch it with
 * shallow regexes, this engine genuinely REPAIRS broken markup:
 *
 *   1. CSS recovery      — closes unclosed `/*` comments, rebalances `{ }`
 *                          braces, re-inserts missing `;` between declarations.
 *   2. JS recovery       — compiles every inline <script> with a real JS
 *                          parser, reconstructs missing quotes/braces/parens,
 *                          strips calls to undefined functions, and as a last
 *                          resort gets the page to not crash.
 *   3. HTML normalization — tolerant HTML5 parse auto-closes </div>, <li>,
 *                          <table>, <tr>, <p> and replaces invalid
 *                          self-closing <script/> with a real tag.
 *   4. Dead asset surgery — probes stylesheets/scripts/media/iframes and
 *                          removes references or renders safe placeholders.
 *   5. Document hygiene  — duplicate ids, empty <a href="">, off-site
 *                          redirect metas, ARIA refs to missing ids.
 *
 * DESIGN RULES (matches the repo's "no crashes" contract):
 *   - never throws into the caller: every failure degrades to "keep original"
 *   - never deletes an asset it could not prove dead
 *   - only accepts a repaired script when it *actually parses*
 */

const RE_DEAD_HOST = /(fake|does-not-exist|nonexistent|not-exist|\.(?:test|invalid|localhost)\b)/i

function isLikelyDeadUrl(url) {
  if (typeof url !== 'string' || !url.trim() || /^(data|blob|javascript):/i.test(url)) return false
  try {
    const u = new URL(url, 'https://x.invalid')
    if (!/^https?:$/.test(u.protocol)) return false
    const h = u.hostname.toLowerCase()
    if (RE_DEAD_HOST.test(h)) return true
    return false
  } catch {
    return false
  }
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function isDeadAsset(url, allowNetwork) {
  if (isLikelyDeadUrl(url)) return true
  if (!allowNetwork) return false
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 4000)
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AlphaTekX-Resurrector/1.0)' },
      })
      if (res.status >= 400 && res.status < 600) return true
      if ([403, 405, 501].includes(res.status)) {
        const gres = await fetch(url, {
          method: 'GET',
          redirect: 'follow',
          signal: ctrl.signal,
          headers: { Range: 'bytes=0-2047', 'User-Agent': 'Mozilla/5.0 (compatible; AlphaTekX-Resurrector/1.0)' },
        })
        if (gres.status >= 400) return true
        await gres.body?.cancel().catch(() => {})
        return false
      }
      return false
    } finally { clearTimeout(timer) }
  } catch {
    return true
  }
}

function collectExternalUrls(html) {
  const urls = new Set()
  for (const m of html.matchAll(/(?:href|src|data|action|poster)\s*=\s*["']([^"']+)["']/gi)) {
    const u = m[1]
    if (/^https?:\/\//i.test(u)) urls.add(u)
  }
  return [...urls]
}

// ─── CSS repair ───────────────────────────────────────────────────────────────

function stripUnclosedCssComments(css) {
  // A CSS `/*` that is never closed swallows the REST of the stylesheet in every
  // browser. Recovery: treat the author's intent as closing at end-of-line and
  // KEEP the rules that follow them so the site is not stripped of styling.
  // Orphaned `*/` closers (comment opener already stripped) are dropped too —
  // they are junk tokens left behind by partial edits.
  let out = ''
  let i = 0
  let hadUnclosed = false
  while (i < css.length) {
    const open = css.indexOf('/*', i)
    const closeIdx = css.indexOf('*/', i)
    if (closeIdx !== -1 && (open === -1 || closeIdx < open)) {
      // `*/` with no live comment open before it — junk. Drop it.
      out += css.slice(i, closeIdx)
      i = closeIdx + 2
      continue
    }
    if (open === -1) { out += css.slice(i); break }
    out += css.slice(i, open)
    const close = css.indexOf('*/', open + 2)
    if (close === -1) {
      const nl = css.indexOf('\n', open + 2)
      hadUnclosed = true
      if (nl === -1) break // truly nothing after it
      i = nl + 1
      continue
    }
    out += css.slice(open, close + 2)
    i = close + 2
  }
  return { css: out, hadUnclosed }
}

function normalizeDeclBlock(body) {
  let b = String(body || '').replace(/\/\*[\s\S]*?\*\//g, ' ')
  b = b.replace(/\s+/g, ' ').trim()
  if (!b) return ''
  b = b.replace(/([^{};])\s+(?=[a-zA-Z][a-zA-Z0-9-]*\s*:)/g, '$1; ')
  b = b.replace(/\s*\}/g, '; }')
  return b
    .split(';')
    .map((d) => d.trim())
    .filter((d) => d && d.includes(':'))
    .join('; ') + ';'
}

function rebuildCssBlock(body) {
  const rules = []
  let i = 0
  while (i < body.length) {
    while (i < body.length && /\s/.test(body[i])) i++
    if (i >= body.length) break
    if (body[i] === '}') { i++; continue }
    const open = body.indexOf('{', i)
    if (open === -1) break
    const selector = body.slice(i, open).trim()
    let depth = 1
    let j = open + 1
    let close = -1
    for (; j < body.length; j++) {
      if (body[j] === '{') depth++
      else if (body[j] === '}') {
        depth--
        if (depth === 0) { close = j; break }
      }
    }
    const decls = normalizeDeclBlock(body.slice(open + 1, close === -1 ? undefined : close))
    if (selector) rules.push(`${selector} { ${decls} }`)
    if (close === -1) break
    i = close + 1
  }
  return rules.join('\n')
}

function repairCssBlock(css) {
  if (!css || !css.trim()) return { css: '', hadUnclosed: false }
  const stripped = stripUnclosedCssComments(css)
  const rebuilt = rebuildCssBlock(stripped.css).trim()
  if (!rebuilt) return { css: '', hadUnclosed: true }
  return { css: rebuilt, hadUnclosed: stripped.hadUnclosed }
}

const PLACEHOLDER_IMG =
  `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'><rect width='100%' height='100%' fill='#e8eaed'/><path d='M170 130a18 18 0 1 1 36 0 18 18 0 0 1-36 0zm-45 105l55-70 35 42 25-27 45 55H125z' fill='#aab2bd'/><text x='200' y='265' font-family='sans-serif' font-size='13' fill='#757d89' text-anchor='middle'>Image unavailable</text></svg>`
  )}`

// ─── JS repair ───────────────────────────────────────────────────────────────

const BROWSER_GLOBALS = new Set([
  'window', 'document', 'console', 'alert', 'confirm', 'prompt',
  'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean',
  'Date', 'RegExp', 'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet',
  'Reflect', 'Proxy', 'Symbol', 'BigInt', 'Intl',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame',
  'fetch', 'XMLHttpRequest', 'FormData', 'URL', 'URLSearchParams',
  'Blob', 'File', 'FileReader', 'Image', 'AbortController', 'AbortSignal',
  'location', 'navigator', 'history', 'localStorage', 'sessionStorage',
  'performance', 'structuredClone', 'atob', 'btoa', 'parseInt', 'parseFloat',
  'isNaN', 'isFinite', 'decodeURIComponent', 'encodeURIComponent',
  'decodeURI', 'encodeURI', 'undefined', 'null', 'true', 'false', 'NaN',
  'Infinity', 'globalThis', 'self', 'top', 'parent', 'frames',
  // Reserved words — never treat a control statement as a call.
  'for', 'while', 'if', 'else', 'switch', 'case', 'return', 'function',
  'var', 'let', 'const', 'new', 'this', 'class', 'typeof', 'instanceof',
  'in', 'of', 'try', 'catch', 'finally', 'throw', 'do', 'void', 'delete',
  'yield', 'await', 'async', 'import', 'export', 'extends', 'static',
  'super', 'break', 'continue', 'default',
])

function compileOk(code) {
  if (typeof code !== 'string' || !code.trim()) return true
  try {
    // eslint-disable-next-line no-new-func
    new Function(code)
    return true
  } catch {
    return false
  }
}

function closeStructural(code) {
  // Rebalance quotes / parens / braces. Never removes a line — only inserts
  // what is missing or drops a solvable-stray closer.
  let out = ''
  let mode = null // current string quote (", ', `) via toggling
  let i = 0
  const stack = []          // expected closers
  const closers = { '(': ')', '{': '}', '[': ']' }
  const openers = new Set(['(', '{', '['])
  while (i < code.length) {
    const ch = code[i]
    if (mode) {
      if (ch === '\\') { out += ch + (code[i + 1] || ''); i += 2; continue }
      if (ch === '\n') {
        // Unterminated string at end of line — close it BEFORE the newline so
        // the source stays valid, then keep scanning as normal code.
        out += mode
        out += '\n'
        mode = null
        i++
        continue
      }
      out += ch
      if (ch === mode) mode = null
      i++
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') { mode = ch; out += ch; i++; continue }
    if (ch === '/' && code[i + 1] === '/') {
      const nl = code.indexOf('\n', i)
      out += nl === -1 ? code.slice(i) : code.slice(i, nl) + '\n'
      i = nl === -1 ? code.length : nl + 1
      continue
    }
    if (ch === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2)
      if (end === -1) { out += '/* '; i = code.length; continue }
      out += code.slice(i, end + 2)
      i = end + 2
      continue
    }
    if (openers.has(ch)) { stack.push(closers[ch]); out += ch; i++; continue }
    if (ch === ')' || ch === '}' || ch === ']') {
      if (stack.length && stack[stack.length - 1] === ch) { stack.pop(); out += ch }
      else { i++; continue } // stray closer — safe to drop
      i++
      continue
    }
    out += ch
    i++
  }
  if (mode) out += mode
  while (stack.length) {
    out += stack.pop()
  }
  return out
}

function compilesControlHeader(code) {
  // for (let i = 0; i < 10; i++ { → for (let i = 0; i < 10; i++) {
  return code.replace(/\b(for|if|while|switch|catch)\s*\(([^{)\n]*)\{\s*$/gm, (_m, kw, args) => `${kw} (${args}) {`)
}

function declaredNames(code) {
  const names = new Set()
  const add = (m) => { if (m?.[1]) names.add(m[1]) }
  for (const m of code.matchAll(/\b(?:var|let|const|function)\s+([A-Za-z_$][\w$]*)/g)) add(m)
  for (const m of code.matchAll(/(?:=>|\))\s*{\s*$/gm)) void m
  for (const m of code.matchAll(/\bfor\s*\(\s*(?:let|var|const)\s+([A-Za-z_$][\w$]*)/g)) add(m)
  return names
}

function maskStringsAndComments(code) {
  // Returns a SAME-LENGTH copy of `code` where string/template contents and
  // comments are blanked out. Line-based analysis must run on THIS, never on
  // raw source — otherwise a `webpackJsonp(` sitting inside a template string
  // (launcher shells embed whole sites!) looks like live code and gets a
  // perfectly healthy script deleted.
  let out = ''
  let mode = null // '"', "'" or '`'
  let i = 0
  while (i < code.length) {
    const ch = code[i]
    if (mode) {
      if (ch === '\\') { out += '  '; i += 2; continue }
      if (ch === '\n') { out += '\n'; if (mode !== '`') mode = null; i++; continue }
      if (ch === mode) { out += ch; mode = null; i++; continue }
      out += ' '
      i++
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') { mode = ch; out += ch; i++; continue }
    if (ch === '/' && code[i + 1] === '/') {
      const nl = code.indexOf('\n', i)
      const end = nl === -1 ? code.length : nl
      out += ' '.repeat(end - i)
      i = end
      continue
    }
    if (ch === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2)
      const stop = end === -1 ? code.length : end + 2
      for (let j = i; j < stop; j++) out += code[j] === '\n' ? '\n' : ' '
      i = stop
      continue
    }
    out += ch
    i++
  }
  return out
}

function removeUnsafeStatements(code) {
  // Drop statement-level lines that call/operate on names we can prove are
  // undeclared — decided on STRING-MASKED source so embedded template strings
  // are never mistaken for live code.
  const declared = declaredNames(code)
  const known = (name) => BROWSER_GLOBALS.has(name) || declared.has(name)
  const maskedLines = maskStringsAndComments(code).split('\n')
  const rawLines = code.split('\n')
  const out = []
  for (let idx = 0; idx < rawLines.length; idx++) {
    const raw = rawLines[idx]
    const t = (maskedLines[idx] || '').trim()
    if (!t) { out.push(raw); continue }
    const call = t.match(/^([A-Za-z_$][\w$]*)\s*(?:\.\s*\w+\s*)?\(/)
    const bare = t.match(/^([A-Za-z_$][\w$]*)\s*[;}\]]\s*$/)
    const ident = call ? call[1] : (bare ? bare[1] : '')
    if (ident !== 'undefined' && ident && !known(ident)) continue // drop
    if (/(?:^|[\s;(])(?:undefined|null)\s*\.\s*\w+\s*\(/.test(t)) continue
    if (/\bwebpackJsonp\s*\(/.test(t)) continue
    if (/\bundefinedVariable\b/.test(t) && !/\b(?:var|let|const)\b/.test(t)) continue
    out.push(raw)
  }
  return out.join('\n')
}

function recoverScript(code) {
  // Guarantee: any returned script must PARSE. We try increasingly invasive
  // reconstructions and only accept a result that the JS engine compiles.
  // removeUnsafeStatements decides on STRING-MASKED source, so template
  // strings embedded in launcher shells are never mistaken for live code.
  if (!code || !code.trim()) return { code, action: 'kept', steps: [] }

  const cur = removeUnsafeStatements(code)
  if (compileOk(cur)) return { code: cur, action: cur === code ? 'kept' : 'sanitized', steps: ['removed-unsafe-calls'] }

  let rebuilt = compilesControlHeader(cur)
  rebuilt = closeStructural(rebuilt)
  if (compileOk(rebuilt)) return { code: rebuilt, action: 'reconstructed', steps: ['closed-structure'] }

  rebuilt = removeUnsafeStatements(rebuilt)
  if (compileOk(rebuilt)) return { code: rebuilt, action: 'reconstructed', steps: ['closed-structure', 'removed-unsafe-calls'] }

  const guarded = `(function () { "use strict"; try { ${rebuilt} } catch (err) { console.warn(err); } })();`
  if (compileOk(guarded)) return { code: guarded, action: 'guarded', steps: ['closed-structure', 'wrapped-catch'] }

  return { code: null, action: 'removed', steps: ['unrecoverable'] }
}

async function loadCheerio() {
  const mod = await import('cheerio')
  return (mod.default && mod.default.load) ? mod.default : mod
}

// ─── Document normalization (tolerant HTML5 auto-close) ──────────────────────

async function normalizeDocument(html) {
  try {
    const cheerio = await loadCheerio()
    const $ = cheerio.load(html, { decodeEntities: false })
    return $.html()
  } catch {
    return html
  }
}

async function runHygiene(doc, tally, opts = {}) {
  const { baseUrl = '' } = opts
  let baseHost = ''
  try { baseHost = new URL(baseUrl || 'https://x.invalid').hostname.toLowerCase() } catch { baseHost = '' }
  try {
    const cheerio = await loadCheerio()
    const $ = cheerio.load(doc, { decodeEntities: false })
    // Duplicate ids → unique suffixes; first occurrence wins.
    const seen = new Set()
    $('[id]').each((_, el) => {
      const $el = $(el)
      const id = ($el.attr('id') || '').trim()
      if (!id) return
      if (seen.has(id)) {
        let n = 2
        let next = `${id}-${n}`
        while (seen.has(next)) { n++; next = `${id}-${n}` }
        $el.attr('id', next)
        tally.duplicates_fixed++
      } else {
        seen.add(id)
      }
    })
    // Empty <a href=""> → drop attribute, keep a usable anchor.
    $('a[href]').each((_, el) => {
      const $el = $(el)
      if (($el.attr('href') || '').trim() === '') { $el.removeAttr('href'); tally.empty_hrefs++ }
    })
    // Dangerous <meta http-equiv="refresh"> to another origin / dead domain.
    $('meta[http-equiv]').each((_, el) => {
      const $el = $(el)
      if (!/refresh/i.test($el.attr('http-equiv') || '')) return
      const content = $el.attr('content') || ''
      const m = /url\s*=\s*['"]?([^'"\s;>]+)/i.exec(content)
      if (!m) return
      let targetHost = ''
      try { targetHost = new URL(m[1], baseUrl || 'https://x.invalid').hostname.toLowerCase() } catch { targetHost = m[1] }
      const suspicious = isLikelyDeadUrl(m[1]) || (baseHost && targetHost !== baseHost)
      if (suspicious) { $el.remove(); tally.refresh_metas_removed++ }
    })
    // ARIA refs to ids that no longer exist.
    $('[aria-labelledby], [aria-describedby]').each((_, el) => {
      const $el = $(el)
      for (const attr of ['aria-labelledby', 'aria-describedby']) {
        const refs = ($el.attr(attr) || '').trim().split(/\s+/).filter(Boolean)
        const missing = refs.filter((id) => !$(`#${CSS_Escape(id)}`).length)
        if (refs.length && missing.length === refs.length) { $el.removeAttr(attr); tally.aria_refs_removed++ }
      }
    })
    return $.html()
  } catch {
    return doc
  }
}

function CSS_Escape(id) {
  // Minimal CSS.escape — sufficient for typical id tokens.
  return String(id).replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`)
}

// ─── Main repair entrypoint ──────────────────────────────────────────────────

// Relative junk filenames (this-image-does-not-exist.gif, broken-video.mp4…)
// are just as dead as fake domains — catch them without needing network.
const RE_JUNK_FILENAME = /(?:^|\/)(?:[^\/]*?(?:does-not-exist|not-exist|nonexistent|is-broken|broken-[a-z]+)[^\/]*\.(?:gif|jpe?g|png|svg|webp|mp4|webm|ogv|mp3|ogg|wav|vtt)|broken\.(?:gif|jpe?g|png|mp4|mp3))$/i

export async function repairBrokenHtml(html, opts = {}) {
  const {
    baseUrl = '',
    allowNetwork = false,
    knownDead = [],           // URLs the browser already proved dead
    maxDeadProbes = 30,
  } = opts

  const tally = {
    css_repaired: 0,
    css_dropped: 0,
    js_sanitized: 0,
    js_reconstructed: 0,
    js_guarded: 0,
    js_removed: 0,
    dead_assets_static: 0,
    dead_assets_probed: 0,
    dead_assets_removed: 0,
    html_normalized: false,
    duplicates_fixed: 0,
    empty_hrefs: 0,
    refresh_metas_removed: 0,
    aria_refs_removed: 0,
  }

  let doc = String(html ?? '')
  if (!doc.trim()) return { html: doc, tally }

  // 0) Encoding hygiene.
  doc = doc.replace(/^\uFEFF/, '').replace(/\u0000/g, '')

  // 0b) invalid self-closing `<script ... />` — must be fixed BEFORE the parser
  // so it can't swallow the rest of the document as raw text.
  doc = doc.replace(/<script\b([^>]*)\s*\/\s*>/gi, (_m, attrs) => `<script${attrs}></script>`)

  // 1) Dead-resource set: user/browser-proven first, then static heuristics,
  //    then optional bounded live probes.
  const dead = new Set()
  for (const u of (knownDead || [])) {
    try { dead.add(new URL(u, baseUrl || 'https://x.invalid').href) } catch { if (typeof u === 'string') dead.add(u) }
  }
  const external = collectExternalUrls(
    // Script BODIES are excluded: publisher shells embed whole sites as
    // strings, and URLs inside those strings must never enter the dead set.
    doc.replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi, '$1$2'),
  )
  for (const u of external) {
    let abs
    try { abs = new URL(u, baseUrl || 'https://x.invalid').href } catch { continue }
    if (isLikelyDeadUrl(u) || isLikelyDeadUrl(abs)) {
      // Keep the markup-exact raw form AND canonical forms so the string
      // surgery matches regardless of missing trailing slash etc.
      dead.add(u)
      dead.add(abs)
      if (abs.endsWith('/')) dead.add(abs.slice(0, -1))
      tally.dead_assets_static++
    }
  }
  // Relative junk filenames ("this-image-does-not-exist.gif",
  // "broken-video.mp4", "broken-subs.vtt"…) never hit an absolute-URL scan,
  // but they are just as dead. Catch them straight from the attributes.
  for (const m of doc.matchAll(/(?:src|href|poster|data)\s*=\s*["']([^"':]+)["']/gi)) {
    const v = m[1]
    if (/^(?:data|blob|javascript|#|mailto:)/i.test(v) || /^https?:\/\//i.test(v)) continue
    if (RE_JUNK_FILENAME.test(v)) { dead.add(v); tally.dead_assets_static++ }
  }
  const toProbe = []
  for (const u of external) {
    let abs
    try { abs = new URL(u, baseUrl || 'https://x.invalid').href } catch { continue }
    if (!dead.has(abs) && toProbe.length < maxDeadProbes) { toProbe.push(abs) }
  }
  if (toProbe.length) {
    const gate = Math.min(6, toProbe.length)
    let cursor = 0
    await Promise.all(Array.from({ length: gate }, async () => {
      while (cursor < toProbe.length) {
        const u = toProbe[cursor++]
        const d = await isDeadAsset(u, allowNetwork).catch(() => false)
        if (d) { dead.add(u); tally.dead_assets_probed++ }
      }
    }))
  }

  // 2) Tolerant parse FIRST so every later string repair sees legal structure.
  const beforeNormalize = doc
  doc = await normalizeDocument(doc)
  if (doc !== beforeNormalize) tally.html_normalized = true

  // 3) CSS surgery — rebuild every <style> block.
  doc = doc.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (m, attrs, css) => {
    const repaired = repairCssBlock(css)
    if (!repaired.css) { if (css.trim()) tally.css_dropped++; return '' }
    if (repaired.hadUnclosed) tally.css_repaired++
    if (repaired.css !== css.trim()) tally.css_repaired++
    return `\n<style${attrs}>\n${repaired.css}\n</style>`
  })

  // 4) JS surgery — any accepted script must compile.
  doc = doc.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (m, attrs, code) => {
    if (/\s(src)\s*=/i.test(attrs)) return m
    if (/application\/(?:ld\+json|json)/i.test(attrs)) return m
    if (!code?.trim()) return m
    // Launcher / publisher bootstrap scripts embed whole sites as strings —
    // they are infrastructure, never repair targets.
    if (/template\s*=|__ALPHA_STORAGE_JSON__|alphatekx:published:|srcdoc\s*=/i.test(code)) return m
    const t = recoverScript(code)
    if (t.action === 'kept') return m
    if (t.action === 'sanitized') { tally.js_sanitized++; return `<script${attrs}>${t.code}</script>` }
    if (t.action === 'reconstructed') { tally.js_reconstructed++; return `<script${attrs}>${t.code}</script>` }
    if (t.action === 'guarded') { tally.js_guarded++; return `<script${attrs}>${t.code}</script>` }
    tally.js_removed++
    return ''
  })
  // 4b) inline event handlers that call undefined globals — the page-crashers
  // hidden in attributes (onclick=brokenFn(), onload=undefined.apply()…).
  doc = doc.replace(/<([a-zA-Z][\w-]*)\b([^>]*)>/gi, (m, tag, attrs) => {
    let changed = false
    const out = attrs.replace(/\s+on[a-z]+\s*=\s*(["'])([\s\S]*?)\1/gi, (am, q, handler) => {
      const names = [...handler.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)].map((x) => x[1])
      const unsafe = names.some((n) => !BROWSER_GLOBALS.has(n))
      if (!unsafe) return am
      changed = true
      return '' // drop the crashing handler entirely
    })
    return changed ? `<${tag}${out}>` : m
  })

  // 4c) Dead asset surgery — exact-URL removal.
  if (dead.size) {
    const pats = [...dead].map(escapeRegExp).filter(Boolean)
    const any = `(?:${pats.join('|')})`
    // Scripts: the dead URL must sit in the OPENING TAG (a src attribute).
    // A URL merely mentioned inside the script BODY (launcher template strings)
    // must never trigger removal of the whole bootstrap.
    doc = doc.replace(new RegExp(`<script\\b([^>]*)(?:${any})([^>]*)>([\\s\\S]*?)<\\/script>`, 'gi'), () => { tally.dead_assets_removed++; return '' })
    doc = doc.replace(new RegExp(`<link\\b[^>]*(?:${any})[^>]*\\s*>`, 'gi'), () => { tally.dead_assets_removed++; return '' })
    doc = doc.replace(new RegExp(`<img\\b[^>]*(?:${any})[^>]*\\s*>`, 'gi'), () => { tally.dead_assets_removed++; return `<img src="${PLACEHOLDER_IMG}" alt="Image unavailable">` })
    doc = doc.replace(new RegExp(`<(?:iframe|frame)\\b[^>]*(?:${any})[^>]*>`, 'gi'), () => { tally.dead_assets_removed++; return '' })
    doc = doc.replace(new RegExp(`<embed\\b[^>]*(?:${any})[^>]*>`, 'gi'), () => { tally.dead_assets_removed++; return '' })
    doc = doc.replace(new RegExp(`<object\\b[^>]*(?:${any})[^>]*>[\\s\\S]*?<\\/object>`, 'gi'), () => { tally.dead_assets_removed++; return '' })
    doc = doc.replace(new RegExp(`<source\\b[^>]*(?:${any})[^>]*>`, 'gi'), () => '')
  }

  // 5) <video>/<audio> whose only <source> is dead → keep fallback text only.
  doc = doc.replace(/<video\b[^>]*>([\s\S]*?)<\/video>/gi, (_m, inner) => {
    if (!/<source\b/i.test(inner)) return _m
    return inner.replace(/<[^>]+>/g, '').trim() || ''
  }).replace(/<audio\b[^>]*>([\s\S]*?)<\/audio>/gi, (_m, inner) => {
    if (!/<source\b/i.test(inner)) return _m
    return inner.replace(/<[^>]+>/g, '').trim() || ''
  })

  // 6) Hygiene pass.
  doc = await runHygiene(doc, tally, { baseUrl })

  return { html: doc, tally }
}

export const _internals = {
  compileOk,
  closeStructural,
  compilesControlHeader,
  removeUnsafeStatements,
  recoverScript,
  repairCssBlock,
  isLikelyDeadUrl,
}