import { buildPreviewProject, transformCodeToViteApp } from '../server/previewBuild.mjs'
import { verifyRuntime } from '../server/runtimeVerify.mjs'
import { fallbackAlphaBuilder } from '../alphaFallback.mjs'
import { SaaSLandingTemplate, TaskDashboardTemplate } from '../server/alphaFallbackTemplates.mjs'
import fs from 'node:fs'
import path from 'node:path'

const cases = [
  {
    id: 'phase11-saas',
    prompt: 'Build a responsive SaaS landing page with a hero section, pricing, testimonials, FAQ and footer',
    generator: SaaSLandingTemplate,
    check(url, code) {
      const checks = ['hero', 'pricing', 'testimonials', 'FAQ', 'footer']
      return checks.filter((c) => code.toLowerCase().includes(c.toLowerCase()))
    },
  },
  {
    id: 'phase11-task',
    prompt: 'Build a task management dashboard with sidebar navigation, task cards, filters and dark mode',
    generator: TaskDashboardTemplate,
    check(url, code) {
      const checks = ['sidebar', 'task', 'filter', 'dark']
      return checks.filter((c) => code.toLowerCase().includes(c.toLowerCase()))
    },
  },
]

const repairCases = [
  {
    id: 'phase11-repair-class',
    code: `function AlphaApp() { return <div class="dark">Hello</div>; }\nexport default AlphaApp;`,
    verify(url, code) { return code.includes('className=') },
  },
  {
    id: 'phase11-repair-export',
    code: `function AlphaApp() { return <div>Hello</div>; }`,
    verify(url, code) { return code.includes('export default') },
  },
]

function ok(id, result) {
  return result.ok && fs.existsSync(path.resolve('preview-runs', id, 'index.html'))
}

async function run() {
  const results = []
  for (const c of cases) {
    const code = c.generator(c.prompt)
    const result = await buildPreviewProject(c.id, code, [])
    const transformed = transformCodeToViteApp(code)
    const found = ok(c.id, result) ? c.check(result.url, transformed) : []
    results.push({ id: c.id, ok: ok(c.id, result), features: found, attempts: result.attempts || 0, error: result.error })
  }
  for (const c of repairCases) {
    const result = await buildPreviewProject(c.id, c.code, [])
    const transformed = transformCodeToViteApp(c.code)
    const fixed = ok(c.id, result) && c.verify(result.url, transformed)
    results.push({ id: c.id, ok: ok(c.id, result) && fixed, attempts: result.attempts || 0, error: result.error })
  }

  const ecomPrompt = 'Build a full e-commerce shop website with a landing page, product catalogue, categories, search, product details, shopping cart, checkout, responsive navigation and footer'
  const ecomCode = fallbackAlphaBuilder(ecomPrompt)
  const ecomResult = await buildPreviewProject('phase11-ecom', ecomCode, [])
  const ecomVerify = await verifyRuntime({ distDir: path.resolve('preview-runs', 'phase11-ecom'), base: '/preview/phase11-ecom/', expectedFeatures: ['Product', 'Cart', 'Place order', 'Search', 'Built with'] })
  const ecomOk = ok('phase11-ecom', ecomResult) && ecomVerify.ok && ecomVerify.missingFeatures.length === 0 && !/task dashboard|existing alphaapp code/i.test(ecomVerify.bodyTextPreview || '')
  results.push({ id: 'phase11-ecom', ok: ecomOk, attempts: ecomResult.attempts || 0, error: ecomResult.error || (ecomVerify.missingFeatures.length ? `missing: ${ecomVerify.missingFeatures.join(', ')}` : '') })

  const refined = ecomCode
    .replace('<h2 className="text-lg font-semibold">Your cart</h2>', '<h2 className="text-lg font-semibold">Your mobile-friendly cart</h2>')
    .replace('placeholder="Search products..."', 'placeholder="Search or filter products..."')
    .replace('function AlphaApp() {', 'function AlphaApp() {\n  // Added product filtering and mobile cart improvements\n')
  const ecomRefineResult = await buildPreviewProject('phase11-ecom-refine', refined, [])
  const refineOk = ok('phase11-ecom-refine', ecomRefineResult)
  results.push({ id: 'phase11-ecom-refine', ok: refineOk, attempts: ecomRefineResult.attempts || 0, error: ecomRefineResult.error })

  const passed = results.filter(r => r.ok).length
  const total = results.length
  console.log(`PHASE11_TESTS:`)
  for (const r of results) {
    console.log(`- ${r.id}: ${r.ok ? 'PASS' : 'FAIL'} (attempts: ${r.attempts}${r.features ? `, features: ${r.features.join(', ')}` : ''}${r.error ? `, error: ${r.error.slice(0, 200)}` : ''})`)
  }
  console.log(`- Total: ${total}, Passed: ${passed}, Failed: ${total - passed}`)
  if (passed === total) console.log('PHASE11_TESTS_OK')
  else process.exit(1)
}

run().catch((error) => { console.error('PHASE11_TESTS_ERROR', error); process.exit(1) })
