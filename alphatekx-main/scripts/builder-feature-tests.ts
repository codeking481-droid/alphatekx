import { parseBuilderOutput, validateGeneratedApp } from '../src/lib/alphaBuilder.ts'
import {
  extractRequestedFeatures,
  validateGeneratedAppFeatures,
  featureSummary,
} from '../src/lib/builderVerifier.ts'
import { fallbackAlphaBuilder } from '../alphaFallback.mjs'

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
