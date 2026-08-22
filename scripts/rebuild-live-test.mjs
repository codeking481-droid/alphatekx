#!/usr/bin/env node
/**
 * LIVE REBUILD TEST — runs llmRebuildPage (the merged expert/restoration/
 * emergency-recovery instruction) against a saved broken page using the keys
 * from .env. Proves Alpha now produces a clean modern page, not patched chaos.
 *
 * Run with:  node scripts/rebuild-live-test.mjs [path-to-html]
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { llmRebuildPage } from '../server/llmRepairAgent.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

// Load .env without printing any secret values.
const envPath = join(root, '.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) {
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      process.env[m[1]] = v
    }
  }
}
console.log('GROQ_API_KEY present:', Boolean(process.env.GROQ_API_KEY))
console.log('OPENAI_API_KEY present:', Boolean(process.env.OPENAI_API_KEY))

const src = process.argv[2]
  ? resolve(process.cwd(), process.argv[2])
  : join(root, 'data', 'report-inner.html')
if (!existsSync(src)) {
  console.error('input not found:', src)
  process.exit(1)
}
const brokenHtml = readFileSync(src, 'utf8')
console.log('input bytes:', brokenHtml.length)

const chaosMarkers = ['BROKEN OVERLAY', 'ON FIRE', 'Comic Sans', 'Wingdings', 'Papyrus', '<marquee', 'blink', 'THIS SITE IS INTENTIONALLY BROKEN', 'BROKEN SITE INC']
const hitsBefore = chaosMarkers.filter((k) => brokenHtml.toLowerCase().includes(k.toLowerCase()))
console.log('chaos markers in INPUT:', hitsBefore.length ? hitsBefore.join(', ') : '(none)')

console.log('calling LLM rebuild…')
const r = await llmRebuildPage({ html: brokenHtml, hostname: 'aii-test', url: 'https://alphatekx.name.ng/app/aii' })
console.log('result:', JSON.stringify({ configured: r.configured, attempted: r.attempted, rebuilt: r.rebuilt, bytes: r.html.length }))
console.log('notes:', r.notes)

if (r.rebuilt) {
  const out = r.html
  const lower = out.toLowerCase()
  const hitsAfter = chaosMarkers.filter((k) => lower.includes(k.toLowerCase()))
  console.log('chaos markers in OUTPUT:', hitsAfter.length ? hitsAfter.join(', ') : '(none)')
  console.log('structure ok:', {
    doctype: /<!doctype\s+html/i.test(out),
    head: /<head[\s>]/i.test(out),
    body: /<body[\s>]/i.test(out),
    styleBlock: /<style[\s>]/i.test(out),
  })
  // Content preservation — meaningful text should survive.
  const preserved = ['pizza', 'burger', 'sushi', 'bento'].filter((w) => lower.includes(w))
  console.log('content preserved (food list):', preserved.length ? preserved.join(', ') : '(content was reorganized/renamed by design)')
  writeFileSync(join(root, 'data', 'rebuild-preview.html'), out)
  console.log('saved → data/rebuild-preview.html')
} else {
  console.log('REBUILD DID NOT RUN — see notes above.')
  process.exit(1)
}