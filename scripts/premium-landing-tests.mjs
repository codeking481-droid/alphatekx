import assert from 'node:assert/strict'
import fs from 'node:fs'

const landing = fs.readFileSync(new URL('../src/pages/Landing.tsx', import.meta.url), 'utf8')
const css = fs.readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
let passed = 0
const test = (name, callback) => {
  try { callback(); passed++; process.stdout.write(`✓ ${name}\n`) }
  catch (error) { process.stderr.write(`✗ ${name}\n${error.stack}\n`); process.exitCode = 1 }
}

test('hero communicates the AI employee outcome at premium scale', () => {
  assert.match(landing, /Your Second You/)
  assert.match(landing, /That Never Sleeps/)
  assert.match(landing, /lg:text-\[88px\]/)
  assert.match(landing, /Launch My Second You/)
})

test('landing page provides a complete conversion narrative', () => {
  const sections = ['<Hero />', '<IntegrationsStrip />', '<Problem />', '<UseCases />', '<HowItWorks />', '<ScrollDemo />', '<TrustSection />', '<Comparison />', '<Pricing />', '<FAQ />', '<FinalCTA />']
  let cursor = -1
  for (const section of sections) {
    const next = landing.indexOf(section)
    assert.ok(next > cursor, `${section} is missing or out of order`)
    cursor = next
  }
})

test('integration story covers social and productivity work', () => {
  for (const tool of ['LinkedIn', 'Instagram', 'Facebook', "name: 'X'", 'Gmail', 'Google Docs', 'WhatsApp', 'Calendar']) {
    assert.ok(landing.includes(tool), `${tool} is missing`)
  }
})

test('trust language requires approval and provider confirmation', () => {
  for (const contract of ['You approve the work', 'Success must be confirmed', 'Failures are not charged', 'provider response and post identifier']) {
    assert.ok(landing.includes(contract), `${contract} is missing`)
  }
})

test('audience use cases cover founders creators and small teams', () => {
  for (const audience of ['For founders', 'For creators', 'For small teams']) assert.ok(landing.includes(audience))
})

test('comparison explains the outcome-first product difference', () => {
  assert.match(landing, /Not another scheduler with AI added/)
  assert.match(landing, /Describe the outcome in natural language/)
  assert.match(landing, /Confirmed execution history/)
})

test('FAQ answers purchasing and trust objections', () => {
  assert.match(landing, /What is an AI employee/)
  assert.match(landing, /Does Alpha publish without permission/)
  assert.match(landing, /What happens if a platform fails/)
})

test('motion respects reduced-motion preferences', () => {
  assert.match(landing, /useReducedMotion/)
  assert.match(css, /prefers-reduced-motion/)
})

test('mobile layout remains bounded with usable actions', () => {
  assert.match(landing, /overflow-x-hidden/)
  assert.match(landing, /px-4/)
  assert.match(landing, /w-full/)
  assert.match(landing, /md:hidden/)
  assert.match(landing, /MobileCTA/)
})

test('desktop content remains wide and bounded', () => {
  assert.match(landing, /max-w-7xl/)
  assert.match(landing, /lg:grid-cols/)
  assert.match(landing, /xl:text-\[96px\]/)
})

test('page avoids fabricated customer logo claims and testimonials', () => {
  assert.doesNotMatch(landing, /Trusted by.*(?:Google|Meta|Amazon|Netflix)/i)
  assert.doesNotMatch(landing, /Testimonials/)
})

if (!process.exitCode) process.stdout.write(`\n${passed}/11 premium landing checks passed.\n`)
