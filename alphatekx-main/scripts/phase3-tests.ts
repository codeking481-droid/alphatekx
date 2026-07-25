import { parseBuilderOutput, validateGeneratedApp } from '../src/lib/alphaBuilder.ts'
import {
  extractRequestedFeatures,
  validateGeneratedAppFeatures,
} from '../src/lib/builderVerifier.ts'
import { fallbackAlphaBuilder } from '../alphaFallback.mjs'
import { buildPreviewProject, transformCodeToViteApp } from '../server/previewBuild.mjs'
import {
  saveCreation,
  undoCreation,
  revertCreation,
  getCreationForMission,
  getCreations,
} from '../src/lib/missionStore.ts'

globalThis.localStorage = {
  getItem: (key: string) => (globalThis as unknown as { _store?: Record<string, string> })._store?.[key] ?? null,
  setItem: (key: string, value: string) => {
    const store = (globalThis as unknown as { _store?: Record<string, string> })._store ?? {}
    store[key] = value
    ;(globalThis as unknown as { _store?: Record<string, string> })._store = store
  },
  removeItem: (key: string) => {
    const store = (globalThis as unknown as { _store?: Record<string, string> })._store ?? {}
    delete store[key]
  },
  clear: () => {
    ;(globalThis as unknown as { _store?: Record<string, string> })._store = {}
  },
  length: 0,
  key: () => null,
} as Storage

;(globalThis as { window?: unknown }).window = {
  localStorage: globalThis.localStorage,
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
  setTimeout: (cb: (...args: unknown[]) => void) => setTimeout(cb, 0),
}

const prompts = {
  saas: 'Build a responsive SaaS landing page with a hero section, pricing, testimonials, FAQ and footer',
  task: 'Build a task management dashboard with sidebar navigation, task cards, filters and dark mode',
  learning: 'Build a student learning platform with courses, progress tracking, quiz cards and profile page',
}

type TestResult = { name: string; passed: boolean; reason?: string }
const results: TestResult[] = []

async function test(name: string, run: () => unknown | Promise<unknown>) {
  try {
    await run()
    results.push({ name, passed: true })
  } catch (error) {
    results.push({ name, passed: false, reason: error instanceof Error ? error.message : String(error) })
  }
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

await test('Builder prompt submission: e-commerce fallback returns expected features', () => {
  const raw = fallbackAlphaBuilder('Build a full e-commerce shop website with hero, products, cart and checkout')
  const parsed = parseBuilderOutput(raw)
  assert(parsed.code.length > 0, 'fallback produced no code')
  const features = validateGeneratedAppFeatures(parsed.code, 'Build a full e-commerce shop website with hero, products, cart and checkout')
  assert(features.missing.length === 0, `missing features: ${features.missing.join(', ')}`)
})

await test('SaaS landing fallback passes feature verification', () => {
  const raw = fallbackAlphaBuilder(prompts.saas)
  const parsed = parseBuilderOutput(raw)
  const errors = validateGeneratedApp(parsed.code, false, parsed.files.length, prompts.saas)
  assert(errors.length === 0, `validation errors: ${errors.join(', ')}`)
  const features = validateGeneratedAppFeatures(parsed.code, prompts.saas)
  assert(features.missing.length === 0, `missing features: ${features.missing.join(', ')}`)
})

await test('Task dashboard fallback passes feature verification', () => {
  const raw = fallbackAlphaBuilder(prompts.task)
  const parsed = parseBuilderOutput(raw)
  const errors = validateGeneratedApp(parsed.code, false, parsed.files.length, prompts.task)
  assert(errors.length === 0, `validation errors: ${errors.join(', ')}`)
  const features = validateGeneratedAppFeatures(parsed.code, prompts.task)
  assert(features.missing.length === 0, `missing features: ${features.missing.join(', ')}`)
})

await test('Student learning fallback passes feature verification', () => {
  const raw = fallbackAlphaBuilder(prompts.learning)
  const parsed = parseBuilderOutput(raw)
  const errors = validateGeneratedApp(parsed.code, false, parsed.files.length, prompts.learning)
  assert(errors.length === 0, `validation errors: ${errors.join(', ')}`)
  const features = validateGeneratedAppFeatures(parsed.code, prompts.learning)
  assert(features.missing.length === 0, `missing features: ${features.missing.join(', ')}`)
})

await test('File generation: fallback produces valid App code and file list', () => {
  const raw = fallbackAlphaBuilder(prompts.saas)
  const parsed = parseBuilderOutput(raw)
  assert(parsed.files.length >= 1, 'expected at least one file')
  assert(parsed.code.includes('function AlphaApp'), 'missing AlphaApp function')
  assert(/createRoot\(/.test(parsed.code), 'missing render entry')
})

await test('Preview code transformation: React globals become ESM imports', () => {
  const code = `const { useState } = React;\nfunction AlphaApp() { const [c, setC] = useState(0); return <div>{c}</div>; }\nReactDOM.createRoot(document.getElementById('root')).render(<AlphaApp />);`
  const out = transformCodeToViteApp(code)
  assert(out.includes("import React, { useState } from 'react';"), 'missing ESM React import')
  assert(!out.includes('ReactDOM.createRoot'), 'mount call was not removed')
  assert(out.includes('export default AlphaApp'), 'missing default export')
})

await test('Preview startup: Vite build succeeds for the three required prompts', async () => {
  for (const [key, prompt] of Object.entries(prompts)) {
    const raw = fallbackAlphaBuilder(prompt)
    const parsed = parseBuilderOutput(raw)
    const build = await buildPreviewProject(`phase3-${key}`, parsed.code, parsed.files)
    assert(build.ok, `build for ${key} failed: ${build.error || build.logs}`)
    assert(build.url?.startsWith('/preview/'), `missing preview url for ${key}`)
  }
})

await test('Build failure recovery: invalid JSX is rejected with a clear error', async () => {
  const build = await buildPreviewProject('phase3-bad', 'function AlphaApp() { return <div className="broken>Hello</div>; }\nReactDOM.createRoot(document.getElementById(\'root\')).render(<AlphaApp />);')
  assert(!build.ok, 'invalid JSX should fail')
  assert(build.error || build.logs, 'expected error details')
})

await test('Fallback model: returns a relevant app for each prompt category', () => {
  const cases = [
    { prompt: prompts.saas, expected: /pricing|testimonials|faq|hero/i },
    { prompt: prompts.task, expected: /dashboard|tasks|chart|dark/i },
    { prompt: prompts.learning, expected: /alpha-learn|courses|quiz|progress/i },
  ]
  for (const c of cases) {
    const raw = fallbackAlphaBuilder(c.prompt)
    assert(c.expected.test(raw), `fallback output for ${c.prompt.slice(0, 40)} did not match expected pattern`)
  }
})

await test('Undo: saveCreation creates versions and undoCreation restores previous code', () => {
  const missionId = 'phase3-undo'
  const first = saveCreation({ missionId, title: 'First', code: 'first code', type: 'web-app' })
  const second = saveCreation({ missionId, title: 'Second', code: 'second code', type: 'web-app' })
  assert(second.code === 'second code', 'second version not saved')
  const restored = undoCreation(second.id)
  assert(restored?.code === 'first code', `undo did not restore first code: ${restored?.code}`)
})

await test('Revert: revertCreation restores a specific version', () => {
  const missionId = 'phase3-revert'
  const first = saveCreation({ missionId, title: 'Revert First', code: 'v1', type: 'web-app' })
  saveCreation({ missionId, title: 'Revert Second', code: 'v2', type: 'web-app' })
  const firstVersion = first.versions?.[0]
  assert(firstVersion, 'first version missing')
  const restored = revertCreation(first.id, firstVersion.id)
  assert(restored?.code === 'v1', 'revert did not restore v1')
  assert(restored?.versions && restored.versions.length > 2, 'revert did not append a new version')
})

await test('Project persistence: creation stored in localStorage and readable', () => {
  const missionId = 'phase3-persist'
  saveCreation({ missionId, title: 'Persist', code: 'persisted', type: 'web-app' })
  const fromStore = getCreationForMission(missionId)
  assert(fromStore?.code === 'persisted', 'creation not persisted')
  assert(getCreations().length > 0, 'creations list empty')
})

await test('Mobile layout: generated fallback code includes responsive Tailwind classes', () => {
  const raw = fallbackAlphaBuilder(prompts.saas)
  const parsed = parseBuilderOutput(raw)
  const hasResponsive = /\b(sm:|md:|lg:|grid-cols-1|max-w-|h-screen)\b/.test(parsed.code)
  assert(hasResponsive, 'generated code missing responsive classes')
})

const passed = results.filter((r) => r.passed).length
const failed = results.length - passed
process.stdout.write(`PHASE3_TESTS:\n- Total: ${results.length}\n- Passed: ${passed}\n- Failed: ${failed}\n`)
for (const result of results.filter((r) => !r.passed)) {
  process.stdout.write(`- FAIL: ${result.name} - ${result.reason}\n`)
}
if (failed === 0) {
  process.stdout.write('PHASE3_TESTS_OK\n')
} else {
  process.exitCode = 1
}
