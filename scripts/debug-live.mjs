// Debug: reproduce the live restoration flow against the deployed test-site
import { extractEmbeddedDocument } from '../server/alphaRestorationPipeline.mjs'
import { repairBrokenHtml } from '../server/htmlResurrector.mjs'

const url = process.argv[2] || 'https://alphatekx.name.ng/app/test-site'
console.log('fetching:', url)
const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36' } })
const body = await res.text()
console.log('status:', res.status, '| bytes:', body.length)
console.log('has alphatekx:published:', /alphatekx:published:/i.test(body))
console.log('has srcdoc=template:', /srcdoc\s*=\s*template/i.test(body))

const embedded = extractEmbeddedDocument(body)
console.log('unwrap result:', embedded ? `${embedded.source}, ${embedded.html.length} bytes` : 'NO UNWRAP')

const target = embedded ? embedded.html : body
console.log('--- doc fed to repairs:', target.length, 'bytes')
console.log('inner head:', JSON.stringify(target.slice(0, 150)))
console.log('inner has broken markers:', {
  undefinedFunction: target.includes('undefinedFunction'),
  deadStylesheet: target.includes('this-stylesheet-does-not-exist'),
})

const r = await repairBrokenHtml(target, { baseUrl: url, allowNetwork: false })
console.log('--- repaired:', r.html.length, 'bytes')
console.log('tally:', JSON.stringify(r.tally))
console.log('repaired head:', JSON.stringify(r.html.slice(0, 200)))
console.log('repaired tail:', JSON.stringify(r.html.slice(-200)))
// Stage-by-stage: where do the bytes go?
const { compileOk, removeUnsafeStatements, closeStructural, compilesControlHeader, recoverScript } = await import('../server/htmlResurrector.mjs').then(m => m._internals)

console.log('\n=== STAGE ANALYSIS ===')
const stage0 = target
console.log('stage0 (unwrapped):', stage0.length)

const cheerioMod = await import('cheerio')
const cheerio = cheerioMod.default && cheerioMod.default.load ? cheerioMod.default : cheerioMod
const stage1 = cheerio.load(stage0, { decodeEntities: false }).html()
console.log('stage1 (normalized):', stage1.length, '| delta:', stage1.length - stage0.length)

// scripts before/after
const scriptsOf = (h) => [...h.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map((m) => ({ attrs: m[1].slice(0, 40), len: m[2].length }))
console.log('scripts stage0:', JSON.stringify(scriptsOf(stage0)))
console.log('scripts stage1:', JSON.stringify(scriptsOf(stage1)))

// find the bootstrap (contains template=)
const boot = stage1.match(/<script>([^]*?)<\/script>/g)?.filter((s) => s.includes('template=')) || []
console.log('bootstrap count:', boot.length)
if (boot[0]) {
  const code = boot[0].replace(/^<script>/, '').replace(/<\/script>$/, '')
  console.log('bootstrap code len:', code.length)
  console.log('compiles as-is:', compileOk(code))
  const cur = removeUnsafeStatements(code)
  console.log('after removeUnsafe len:', cur.length, '| compiles:', compileOk(cur))
  const closed = closeStructural(compilesControlHeader(cur))
  console.log('after structure len:', closed.length, '| compiles:', compileOk(closed))
  const rec = recoverScript(code)
  console.log('recoverScript action:', rec.action, rec.steps, '| out len:', (rec.code || '').length)
}

// Damage report for a given URL
const targetUrl = process.argv[2] || 'https://alphatekx.name.ng/app/aii'
{
  let h = body
  let lv = 0
  for (;;) {
    const e = extractEmbeddedDocument(h)
    if (!e || lv >= 5) break
    h = e.html
    lv++
  }
  const fs3 = await import('node:fs')
  fs3.writeFileSync(new URL('../data/report-inner.html', import.meta.url), h)

  console.log('\n=== DAMAGE REPORT ===')
  const checks = {
    'unclosed CSS comment': /\/\*(?:(?!\/\*)[\s\S]*?)$(?![\s\S]*\*\/)/m.test(h) && (h.match(/\/\*/g) || []).length > (h.match(/\*\//g) || []).length,
    'CSS brace imbalance': (h.match(/\{/g) || []).length !== (h.match(/\}/g) || []).length,
    'broken <img> (no alt)': /<img(?![^>]*alt=)[^>]*>/i.test(h),
    'dead/fake URLs': (h.match(/https?:\/\/[^"'\s>]+/g) || []).filter((u) => /(does-not-exist|fake|nonexistent|not-exist|example-broken|invalid)/i.test(u)),
    'inline onclick handlers': (h.match(/\son[a-z]+\s*=/gi) || []).length,
    'duplicate ids': (() => { const ids = [...h.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]); return ids.filter((v, i, a) => a.indexOf(v) !== i) })(),
    'stray text after </html>': (() => { const m = h.match(/<\/html>\s*([\s\S]+)$/i); return m ? JSON.stringify(m[1].slice(0, 60)) : false })(),
    'meta refresh redirect': /http-equiv=["']?refresh/i.test(h),
    'mixed content (http://)': (h.match(/(?:src|href)=["']http:\/\/[^"']+["']/gi) || []).length,
    'self-closing <script/>': /<script[^>]*\/\s*>/i.test(h),
    'empty href': /href=["']\s*["']/i.test(h),
    'broken table structure': /<table[\s\S]*?<\/table>/i.test(h) && (() => { const t = h.match(/<table[\s\S]*?<\/table>/i)[0]; return (t.match(/<tr\b/gi) || []).length !== (t.match(/<\/tr>/gi) || []).length })(),
    'unclosed <div>': (() => { const o = (h.match(/<div\b/gi) || []).length; const c = (h.match(/<\/div>/gi) || []).length; return o !== c ? `${o} open vs ${c} close` : false })(),
    'undefined fn calls': (h.match(/\b(?:undefinedFunction|brokenFunction\w*|webpackJsonp)\s*\(/g) || []),
    'unterminated JS strings': (() => { let n = 0; for (const m of h.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) { const code = m[1]; for (const line of code.split('\n')) { const q = line.match(/["']/g) || []; if (q.length % 2 === 1) n++ } } return n || false })(),
  }
  for (const [k, v] of Object.entries(checks)) {
    const hit = v === false || v == null ? 'clean' : (Array.isArray(v) ? (v.length ? `HIT ×${v.length}: ${v.slice(0, 3).join(' | ').slice(0, 100)}` : 'clean') : `HIT: ${v}`)
    console.log(`  ${hit === 'clean' ? '·' : '✖'} ${k}: ${hit}`)
  }
}
