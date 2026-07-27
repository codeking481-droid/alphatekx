import assert from 'node:assert/strict'
import fs from 'node:fs'

const landing = fs.readFileSync(new URL('../src/pages/Landing.tsx', import.meta.url), 'utf8')
const css = fs.readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
let passed = 0
const test = (name, callback) => {
  try { callback(); passed++; process.stdout.write(`✓ ${name}\n`) }
  catch (error) { process.stderr.write(`✗ ${name}\n${error.stack}\n`); process.exitCode = 1 }
}

test('hero uses mature off-white layout without solid purple headline block', () => {
  assert.match(landing, /bg-\[#FAFBFF\]/)
  assert.match(landing, /Delegate the work/)
  assert.match(landing, /reality-underline/)
  assert.doesNotMatch(landing, /Turn Your Idea Into Reality<\/span>/)
})
test('all seven premium motion concepts exist', () => {
  for (const contract of ['CommandMockup', 'Not charged yet', '12\\/30 completed', 'premium-grid', 'ActivityRail', 'BrainWave', 'TiltCard']) assert.match(`${landing}\n${css}`, new RegExp(contract))
  assert.match(landing, /useReducedMotion/)
  assert.match(css, /prefers-reduced-motion/)
})
test('2030 hero includes perspective, glass signals, word reveal and live builder count', () => {
  for (const contract of ['perspective-grid-shell', 'FloatingHeroSignals', 'RevealLine', 'LiveBuilderCount', 'Alpha is working for']) assert.match(`${landing}\n${css}`, new RegExp(contract))
  assert.match(css, /future-mesh-shift/)
  assert.match(css, /premium-noise/)
})
test('command centre morphs thinking state and exposes command palette affordance', () => {
  for (const contract of ['Thinking…', 'thoughtComplete', 'ALPHA COMMAND PALETTE', '⌘ K', '<BrainWave/>']) assert.ok(landing.includes(contract), `${contract} missing`)
})
test('future credibility timeline marks the current AlphaTekx era', () => {
  for (const contract of ["['2024','Manual posting'", "['2025','AI captions'", "['2026','AlphaTekx AI Employee'", "['2030','Autonomous business'", '$1.2T', 'YOU ARE HERE']) assert.ok(landing.includes(contract), `${contract} missing`)
})
test('long trust-page sections are present in the required order', () => {
  const sections = ['<Hero/>','<LogoMarquee/>','<ProblemSolution/>','<HowItWorks/>','<InteractiveDemo/>','<AutomationGallery/>','<ActivityRail/>','<ConnectedApps/>','<FeatureDeepDive/>','<Stats/>','<Testimonials/>','<Pricing/>','<FAQ/>','<FinalCTA/>']
  let cursor = -1
  for (const section of sections) { const next = landing.indexOf(section); assert.ok(next > cursor, `${section} is missing or out of order`); cursor = next }
})
test('pricing matches packs and monthly business tiers', () => {
  for (const contract of ["['Spark','$1','5 credits']", "['Creator','$3','20 credits']", "['Builder','$5','40 credits']", "['Starter',15,150", "['Growth',29,400", "['Scale',79,1200", 'Yearly', '−20%']) assert.ok(landing.includes(contract), `${contract} missing`)
})
test('375px mobile contract avoids fixed content widths and keeps touch targets', () => {
  assert.match(landing, /text-\[36px\]/)
  assert.match(landing, /px-4/)
  assert.match(landing, /min-h-11/)
  assert.match(landing, /overflow-x-hidden/)
  assert.match(landing, /MobileStickyCTA/)
  assert.match(landing, /snap-x snap-mandatory/)
})
test('768px tablet contract uses responsive grids and navigation', () => {
  assert.match(landing, /md:grid-cols-2/)
  assert.match(landing, /md:flex/)
  assert.match(landing, /md:hidden/)
})
test('1440px desktop contract is bounded and uses multi-column layouts', () => {
  assert.match(landing, /max-w-7xl/)
  assert.match(landing, /lg:grid-cols/)
  assert.match(landing, /lg:text-\[72px\]/)
})
test('Paystack CTA routes through authenticated checkout surfaces', () => {
  assert.match(landing, /to="\/auth"/)
  assert.doesNotMatch(landing, /paystack\.co/)
})

if (!process.exitCode) process.stdout.write(`\n${passed}/11 premium landing checks passed.\n`)
