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

// FULL FLOW: repeated unwrap (like the pipeline now does) + repair
{
  let html = body
  let levels = 0
  for (;;) {
    const e = extractEmbeddedDocument(html)
    if (!e || levels >= 5) break
    html = e.html
    levels++
  }
  console.log('\n=== FULL FLOW ===')
  console.log('unwrap levels:', levels, '| innermost bytes:', html.length)
  console.log('innermost is broken site:', html.includes('undefinedFunction'), '| still a shell:', html.includes('__alphaState'))
  const r2 = await repairBrokenHtml(html, { baseUrl: url, allowNetwork: false })
  console.log('final bytes:', r2.html.length, '| tally:', JSON.stringify(r2.tally))
  console.log('final checks:', {
    brokenGone: !/undefinedFunction\s*\(/.test(r2.html) && !/webpackJsonp\s*\(/.test(r2.html) && !/undefined\.apply\s*\(/.test(r2.html),
    deadGone: !r2.html.includes('this-stylesheet-does-not-exist'),
    noShell: !r2.html.includes('__alphaState') && !r2.html.includes('alpha-app'),
    scriptsParse: [...r2.html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
      .filter((m) => !/\bsrc\s*=/.test(m[1]) && !/ld\+json/.test(m[1]))
      .every((m) => { try { new Function(m[2]); return true } catch { return false } }),
  })
  await import('node:fs').then((fs) => fs.writeFileSync(new URL('../data/debug-live-final.html', import.meta.url), r2.html))
  await import('node:fs').then((fs) => fs.writeFileSync(new URL('../data/debug-innermost.html', import.meta.url), html))
  console.log('innermost head:', JSON.stringify(html.slice(0, 400)))
  console.log('innermost tail:', JSON.stringify(html.slice(-300)))
}
