import { parseBuilderOutput, validateGeneratedApp } from '../src/lib/alphaBuilder.ts'
import {
  extractRequestedFeatures,
  validateGeneratedAppFeatures,
  featureSummary,
} from '../src/lib/builderVerifier.ts'
import { fallbackAlphaBuilder } from '../alphaFallback.mjs'
import { readFileSync } from 'node:fs'
import { SLUG_PATTERN, validateBuilderCode } from '../server/eliteBuilderService.mjs'
import { builderSrcDoc } from '../src/lib/eliteBuilder.ts'

globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
}
;(globalThis as { window?: unknown }).window = {
  localStorage: globalThis.localStorage,
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
  setTimeout: (cb: (...args: unknown[]) => void) => setTimeout(cb, 0),
}
globalThis.CustomEvent = class CustomEvent extends Event {
  detail: unknown
  constructor(type: string, init?: { detail?: unknown }) {
    super(type)
    this.detail = init?.detail
  }
}

type TestResult = { name: string; passed: boolean; reason?: string }
const results: TestResult[] = []

async function test(name: string, run: () => unknown | Promise<unknown>) {
  try {
    await run()
    results.push({ name, passed: true })
  } catch (error) {
    results.push({
      name,
      passed: false,
      reason: error instanceof Error ? error.message : String(error),
    })
  }
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

const ECOMMERCE_PROMPT = 'Build a full e-commerce shop website with hero, products, cart and checkout'

await test('Feature extraction: e-commerce prompt returns expected features', () => {
  const features = extractRequestedFeatures(ECOMMERCE_PROMPT)
  assert(
    features.includes('hero') &&
      features.includes('product-catalog') &&
      features.includes('shopping-cart') &&
      features.includes('checkout') &&
      features.includes('navigation') &&
      features.includes('footer') &&
      features.includes('responsive'),
    `Expected e-commerce features, got: ${features.join(', ')}`,
  )
})

await test('E-commerce fallback is an inline React app, not an iframe wrapper', () => {
  const raw = fallbackAlphaBuilder(ECOMMERCE_PROMPT)
  assert(!raw.includes('<iframe'), 'fallback should not wrap the shop in an iframe')
  assert(/function\s+AlphaApp/.test(raw), 'fallback must contain a React component')
  assert(/createRoot\(/.test(raw), 'fallback must render to root')
})

await test('E-commerce fallback passes structural and feature validation', () => {
  const raw = fallbackAlphaBuilder(ECOMMERCE_PROMPT)
  const parsed = parseBuilderOutput(raw)
  const errors = validateGeneratedApp(parsed.code, false, parsed.files.length, ECOMMERCE_PROMPT)
  assert(errors.length === 0, `validation errors: ${errors.join(', ')}`)

  const featureResult = validateGeneratedAppFeatures(parsed.code, ECOMMERCE_PROMPT)
  assert(featureResult.missing.length === 0, `missing features: ${featureResult.missing.join(', ')}`)
})

await test('Generic dashboard fallback fails e-commerce feature verification', () => {
  const raw = fallbackAlphaBuilder('Build a random analytics dashboard')
  const parsed = parseBuilderOutput(raw)
  assert(parsed.code.length > 0, 'fallback produced no code')
  const featureResult = validateGeneratedAppFeatures(parsed.code, ECOMMERCE_PROMPT)
  assert(
    featureResult.missing.some((f) => f === 'Shopping cart' || f === 'Checkout' || f === 'Hero section'),
    'generic dashboard should be rejected for e-commerce prompt; features present: ' +
      featureSummary(featureResult),
  )
})

await test('Feature verifier detects missing hero and cart in generic code', () => {
  const generic = `
    function AlphaApp() {
      const [count, setCount] = React.useState(0);
      return <div className="min-h-screen"><h1>Dashboard</h1><button onClick={() => setCount(c => c + 1)}>Add</button></div>;
    }
    ReactDOM.createRoot(document.getElementById('root')).render(<AlphaApp />);
  `
  const result = validateGeneratedAppFeatures(generic, ECOMMERCE_PROMPT)
  assert(
    result.missing.includes('Hero section') && result.missing.includes('Shopping cart'),
    `expected missing hero and cart, got: ${result.missing.join(', ')}`,
  )
})

await test('validateGeneratedApp reports missing requested features for generic dashboard', () => {
  const raw = fallbackAlphaBuilder('Build a random analytics dashboard')
  const parsed = parseBuilderOutput(raw)
  const errors = validateGeneratedApp(parsed.code, false, parsed.files.length, ECOMMERCE_PROMPT)
  assert(
    errors.some((e) => e.includes('missing requested features')),
    `expected missing-features error, got: ${errors.join('; ')}`,
  )
})

await test('Elite Builder validates complete single-component output', () => {
  const result = validateBuilderCode(`function App(){ const [open,setOpen]=React.useState(false); return <main className="min-h-screen bg-black text-white"><h1>Launch Lagos</h1><button onClick={()=>setOpen(!open)}>Toggle</button>{open&&<p>Ready for customers with a complete mobile experience and helpful content.</p>}<section>${'Premium product experience. '.repeat(20)}</section></main>; }`)
  assert(result.errors.length === 0, `unexpected elite validation errors: ${result.errors.join(', ')}`)
})

await test('Elite Builder rejects unsafe generated execution', () => {
  const result = validateBuilderCode(`function App(){ eval("alert(1)"); return <main>${'Unsafe content '.repeat(30)}</main>; }`)
  assert(result.errors.some(error => error.includes('unsafe')), 'unsafe generated code should be rejected')
})

await test('Builder deployment slug validation matches the public route contract', () => {
  assert(SLUG_PATTERN.test('lagos-fashion'), 'valid slug was rejected')
  assert(!SLUG_PATTERN.test('-bad') && !SLUG_PATTERN.test('A Bad Slug') && !SLUG_PATTERN.test('ab'), 'invalid slug was accepted')
})

await test('Builder preview is isolated from the AlphaTekX origin', () => {
  const source = readFileSync(new URL('../src/pages/EliteBuilder.tsx', import.meta.url), 'utf8')
  const publicSource = readFileSync(new URL('../src/pages/PublicBuilderProject.tsx', import.meta.url), 'utf8')
  assert(source.includes('sandbox="allow-scripts allow-forms allow-modals"'), 'workspace iframe sandbox is missing')
  assert(publicSource.includes('sandbox="allow-scripts allow-forms allow-modals"'), 'public iframe sandbox is missing')
  assert(!source.includes('allow-same-origin') && !publicSource.includes('allow-same-origin'), 'generated code must not share the application origin')
})

await test('Builder preview includes Tailwind once and catches runtime failures', () => {
  const document = builderSrcDoc('function App(){ return <main>Ready</main>; }', 'Test')
  assert((document.match(/cdn\.tailwindcss\.com/g) || []).length === 2, 'Tailwind host should appear once in CSP and once as a script')
  assert(document.includes("window.addEventListener('error'"), 'preview error boundary is missing')
  assert(document.includes('React.createElement(App)'), 'preview does not mount the generated App')
})

await test('Builder API uses durable idempotency and charges only after persistence', () => {
  const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
  const save = server.indexOf('saveGeneratedProject(config, user')
  const spend = server.indexOf('billing.spendCredits(user, eliteBuilder.BUILDER_COST')
  const settle = server.indexOf('markProjectCharged(config, user')
  assert(server.includes('findProjectByRequest(config, user, requestId)'), 'durable request lookup is missing')
  assert(save > 0 && spend > save && settle > spend, 'project persistence, charging, and settlement are in the wrong order')
  assert(server.includes('idempotencyKey: `elite-builder:${requestId}`'), 'credit idempotency key is missing')
})

await test('Builder migration is owner-scoped and does not expose source publicly', () => {
  const sql = readFileSync(new URL('../supabase/elite-builder.sql', import.meta.url), 'utf8')
  assert(sql.includes('auth.uid()::text = user_id::text'), 'owner-scoped RLS policy is missing')
  assert(sql.includes('revoke all on public.builder_projects from anon'), 'anonymous table access must be revoked')
  assert(!sql.includes('using (true)'), 'allow-all RLS policy must not exist')
})

const passed = results.filter((r) => r.passed).length
const failed = results.length - passed
process.stdout.write(`BUILDER_FEATURE_TESTS:\n- Total: ${results.length}\n- Passed: ${passed}\n- Failed: ${failed}\n`)
for (const result of results.filter((r) => !r.passed)) {
  process.stdout.write(`- FAIL: ${result.name} - ${result.reason}\n`)
}
if (failed === 0) {
  process.stdout.write('BUILDER_FEATURE_TESTS_OK\n')
} else {
  process.exitCode = 1
}
