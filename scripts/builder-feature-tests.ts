import { parseBuilderOutput, validateGeneratedApp } from '../src/lib/alphaBuilder.ts'
import {
  extractRequestedFeatures,
  validateGeneratedAppFeatures,
  featureSummary,
} from '../src/lib/builderVerifier.ts'
import { fallbackAlphaBuilder } from '../alphaFallback.mjs'
import { readFileSync } from 'node:fs'
import { SLUG_PATTERN, saveGeneratedProject, validateBuilderCode } from '../server/eliteBuilderService.mjs'
import { builderSrcDoc, normalizeBuilderRuntimeCode } from '../src/lib/eliteBuilder.ts'

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

await test('Builder preview removes inline and multiline imports before live execution', () => {
  const generated = `import React, {
    useState
  } from "react"; import { ShoppingBag, Menu as MenuIcon } from "lucide-react";
  function App() {
    const [open, setOpen] = useState(false);
    const products = ["Aso-ebi gown", "Silk dress", "Senator set"];
    return <main className="min-h-screen bg-white p-8 text-slate-950"><header className="flex justify-between"><h1>Lagos Atelier</h1><ShoppingBag/></header><section className="grid gap-4 md:grid-cols-3">{products.map(product => <article key={product} className="rounded-2xl border p-5"><h2>{product}</h2><button onClick={() => setOpen(!open)}>View collection</button></article>)}</section>{open && <aside>Collection open</aside>}<MenuIcon/></main>;
  }`
  const serverResult = validateBuilderCode(generated)
  assert(serverResult.errors.length === 0, `server rejected recoverable imports: ${serverResult.errors.join(' ')}`)
  assert(!/\bimport\s/.test(serverResult.code), 'server left an import in executable code')
  assert(serverResult.code.includes('React.useState('), 'server did not bind the React hook')
  const runtime = normalizeBuilderRuntimeCode(generated)
  assert(!/\bimport\s/.test(runtime), 'live preview left an import in executable code')
  assert(runtime.includes('React.useState('), 'live preview did not bind the React hook')
  const html = builderSrcDoc(generated)
  assert(!html.includes('import React'), 'preview HTML still contains the generated import')
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

await test('Builder V3 exposes verified edit and auto-repair endpoints', () => {
  const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
  assert(server.includes("req.url === '/api/builder/edit'"), 'chat-to-edit endpoint is missing')
  assert(server.includes("req.url === '/api/builder/fix'"), 'auto-fix endpoint is missing')
  assert(server.includes('updateProjectCode(config, user'), 'verified revision persistence is missing')
})

await test('Builder V3 supports visual selection, media, remix and domain verification', () => {
  const ui = readFileSync(new URL('../src/pages/EliteBuilder.tsx', import.meta.url), 'utf8')
  const publicUi = readFileSync(new URL('../src/pages/PublicBuilderProject.tsx', import.meta.url), 'utf8')
  assert(ui.includes('element-clicked') && ui.includes('Use My Media'), 'visual/media editing is incomplete')
  assert(ui.includes('repairCount >= 3'), 'auto-repair must stop after three attempts')
  assert(ui.includes('requestBuilderDomain'), 'custom domain verification UI is missing')
  assert(publicUi.includes('Remix this app'), 'public remix action is missing')
})

await test('Builder V3 has responsive device previews and durable version history', () => {
  const ui = readFileSync(new URL('../src/pages/EliteBuilder.tsx', import.meta.url), 'utf8')
  const service = readFileSync(new URL('../server/eliteBuilderService.mjs', import.meta.url), 'utf8')
  const sql = readFileSync(new URL('../supabase/elite-builder.sql', import.meta.url), 'utf8')
  assert(/["']desktop["']/.test(ui) && /["']tablet["']/.test(ui) && /["']mobile["']/.test(ui), 'device preview controls are missing')
  assert(ui.includes('requestFullscreen') && ui.includes('Refresh preview'), 'preview controls are incomplete')
  assert(service.includes('nextVersions') && sql.includes('versions jsonb'), 'version persistence is missing')
})

await test('Builder V3 uses a bounded authenticated Pollinations request with a verified direct fallback', () => {
  const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
  assert(server.includes('pollinationsBuilderCompletion') && server.includes("15_000"), 'Pollinations timeout is missing')
  assert(server.includes('https://gen.pollinations.ai/v1/chat/completions'), 'official Pollinations endpoint is missing')
  assert(server.includes('https://text.pollinations.ai/'), 'direct Pollinations recovery endpoint is missing')
  assert(server.includes("provider: 'pollinations-direct'"), 'direct output is not verified before use')
  assert(!server.includes("https://text.pollinations.ai/openai"), 'obsolete Pollinations endpoint must not be used')
})

await test('Builder V3 deployment is full-height and counts public views atomically', () => {
  const publicUi = readFileSync(new URL('../src/pages/PublicBuilderProject.tsx', import.meta.url), 'utf8')
  const service = readFileSync(new URL('../server/eliteBuilderService.mjs', import.meta.url), 'utf8')
  const sql = readFileSync(new URL('../supabase/elite-builder.sql', import.meta.url), 'utf8')
  assert(publicUi.includes('fixed inset-0 flex min-h-0 flex-col') && publicUi.includes('AlphaTekX Builder V3'), 'deployed app shell is incomplete')
  assert(service.includes("rpc/increment_builder_views") && sql.includes('increment_builder_views'), 'atomic view counting is missing')
})

await test('Builder starts from the authenticated server balance instead of stale browser credits', () => {
  const ui = readFileSync(new URL('../src/pages/EliteBuilder.tsx', import.meta.url), 'utf8')
  assert(ui.includes('hydrateCredits().then(setCreditBalance)'), 'server credit hydration is missing')
  assert(!ui.includes('if (credits < BUILDER_COST)'), 'stale browser credits still block build requests')
})

await test('Builder remains usable through durable compatibility storage before dedicated schema activation', () => {
  const service = readFileSync(new URL('../server/eliteBuilderService.mjs', import.meta.url), 'utf8')
  assert(service.includes('saveLegacyProject') && /type:\s*["']builder-v3["']/.test(service), 'durable compatibility persistence is missing')
  assert(service.includes('isBuilderSchemaError') && service.includes('creations?'), 'schema fallback routing is missing')
  assert(!service.includes('using (true)'), 'compatibility must not weaken database ownership')
})

await test('Builder compatibility storage accepts missions.description when production has no goal column', async () => {
  const originalFetch = globalThis.fetch
  const missionBodies: Record<string, unknown>[] = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/builder_projects')) {
      return new Response(JSON.stringify({ message: "Could not find the table 'public.builder_projects' in the schema cache" }), { status: 404 })
    }
    if (url.endsWith('/missions')) {
      const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
      missionBodies.push(body)
      if ('goal' in body) {
        return new Response(JSON.stringify({ message: "Could not find the 'goal' column of 'missions' in the schema cache" }), { status: 400 })
      }
      return new Response('', { status: 201 })
    }
    if (url.endsWith('/creations')) {
      const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
      return new Response(JSON.stringify([body]), { status: 201, headers: { 'content-type': 'application/json' } })
    }
    return new Response(JSON.stringify({ message: `Unexpected test URL: ${url}` }), { status: 500 })
  }) as typeof fetch
  try {
    const saved = await saveGeneratedProject(
      { url: 'https://supabase.test', service: 'service-role' },
      { id: '11111111-1111-4111-8111-111111111111' },
      {
        id: '22222222-2222-4222-8222-222222222222',
        title: 'Production Builder Test',
        prompt: 'Build a production website',
        code: 'function App(){return <main>Ready</main>}',
      },
    )
    assert(saved.id === '22222222-2222-4222-8222-222222222222', 'compatible project was not persisted')
    assert(missionBodies.length === 2, `expected goal retry followed by description retry, got ${missionBodies.length}`)
    assert('goal' in missionBodies[0], 'legacy mission insert was not attempted')
    assert(missionBodies[1].description === 'Build a production website', 'description-compatible mission was not written')
    assert(!('goal' in missionBodies[1]), 'rejected goal column remained in the compatibility retry')
  } finally {
    globalThis.fetch = originalFetch
  }
})

await test('Builder stays on builder_projects when production has an older column set', async () => {
  const originalFetch = globalThis.fetch
  const bodies: Record<string, unknown>[] = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (!url.endsWith('/builder_projects')) {
      return new Response(JSON.stringify({ message: `Legacy table must not be queried: ${url}` }), { status: 500 })
    }
    const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
    bodies.push(body)
    if ('charged' in body) {
      return new Response(JSON.stringify({ message: "Could not find the 'charged' column of 'builder_projects' in the schema cache" }), { status: 400 })
    }
    return new Response(JSON.stringify([body]), { status: 201, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  try {
    const saved = await saveGeneratedProject(
      { url: 'https://supabase.test', service: 'service-role' },
      { id: '11111111-1111-4111-8111-111111111111' },
      {
        id: '33333333-3333-4333-8333-333333333333',
        title: 'Compatible Builder Project',
        prompt: 'Build a production website',
        code: 'function App(){return <main>Ready</main>}',
        requestId: '33333333-3333-4333-8333-333333333333',
      },
    )
    assert(saved.id === '33333333-3333-4333-8333-333333333333', 'project was not saved to compatible builder storage')
    assert(bodies.length === 2, `expected one compatible retry, got ${bodies.length}`)
    assert('charged' in bodies[0], 'full current schema insert was not attempted first')
    assert(!('charged' in bodies[1]), 'unsupported column remained in compatibility insert')
    assert(bodies[1].prompt === 'Build a production website', 'compatible Builder data was not preserved')
  } finally {
    globalThis.fetch = originalFetch
  }
})

await test('Builder V3 generated apps use the scoped AlphaAPI without browser service keys', () => {
  const client = readFileSync(new URL('../src/lib/eliteBuilder.ts', import.meta.url), 'utf8')
  assert(client.includes('window.AlphaAPI'), 'project data bridge is missing')
  assert(!client.includes('SUPABASE_SERVICE_ROLE_KEY'), 'service role credentials must never enter generated apps')
  assert(client.includes('Sign in is required to save data'), 'write failures must remain honest')
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
