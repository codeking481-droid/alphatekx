import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { canRepair, repairCode } from './builderRepair.mjs'
import {
  cleanupOldWorkspaces,
  createWorkspace,
  installDependencies,
  previewRunsRoot,
  publishDist,
  runCommand,
  sanitizeEnv,
  servePreview,
  rootDir,
  copyTemplate,
} from './projectWorkspace.mjs'
import { verifyRuntime } from './runtimeVerify.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const templateDir = path.resolve(root, 'preview-template')

const REACT_HOOKS = ['useState', 'useEffect', 'useMemo', 'useReducer', 'useRef']

const ALLOWED_DEPS = new Set([
  'react', 'react-dom', 'react-router-dom', 'react-router', 'lucide-react',
  'framer-motion', 'recharts', 'zustand', 'axios', 'date-fns', 'clsx',
  'tailwind-merge', 'uuid', '@supabase/supabase-js', 'lodash-es',
])

function hashCode(code) {
  return createHash('sha256').update(String(code || '')).digest('hex')
}

export function transformCodeToViteApp(code) {
  let app = String(code || '')

  app = app.replace(/^const\s*\{\s*([^}]+)\}\s*=\s*React\s*;?\s*$/gm, '')

  for (const hook of REACT_HOOKS) {
    app = app.replace(new RegExp(`\\bReact\\.${hook}\\b`, 'g'), hook)
  }

  app = app.replace(/\bReact\.Fragment\b/g, 'Fragment')
  const usesFragment = /\bFragment\b/.test(app)

  app = app.replace(/\bclass\s*=\s*"/g, 'className="')
  app = app.replace(/\bclass\s*=\s*\{/g, 'className={')
  app = app.replace(/\bfor\s*=\s*"/g, 'htmlFor="')
  app = app.replace(/\bautoFocus\b/g, 'autoFocus')
  app = app.replace(/\bcontentEditable\b/g, 'contentEditable')

  app = app.replace(/ReactDOM\.createRoot\(document\.getElementById\(['"]root['"]\)\)\.render\s*\([\s\S]*?\)\s*;?/g, '')

  const fnMatch = app.match(/function\s+([A-Z][A-Za-z0-9_]*)\s*\(/)
  const arrowMatch = app.match(/const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*/)
  const componentName = fnMatch?.[1] || arrowMatch?.[1] || 'AlphaApp'

  if (!/export\s+default\s+/.test(app)) {
    app += `\nexport default ${componentName};\n`
  }

  const used = REACT_HOOKS.filter((h) => new RegExp(`\\b${h}\\b`).test(app))
  const named = [...used]
  if (usesFragment) named.push('Fragment')
  const importReact = named.length
    ? `import React, { ${named.join(', ')} } from 'react';`
    : `import React from 'react';`

  const globals = []
  if (/\bAlphaUI\b/.test(app)) globals.push('const AlphaUI = window.AlphaUI;')
  if (/\bAlphaAPI\b/.test(app)) globals.push('const AlphaAPI = window.AlphaAPI;')
  if (/\bAlphaDB\b/.test(app)) globals.push('const AlphaDB = window.AlphaDB;')

  return `${importReact}\n${globals.join('\n')}\n${app}`
}

function validateDependencies(dependencies) {
  const clean = {}
  for (const [name, version] of Object.entries(dependencies || {})) {
    if (typeof name !== 'string' || !name.trim()) continue
    if (/^[a-z0-9@\-_.\/]+$/i.test(name) && (ALLOWED_DEPS.has(name) || name.startsWith('@'))) {
      clean[name] = typeof version === 'string' && version ? version : 'latest'
    }
  }
  return clean
}

async function aiRepair({ code, error, command, prompt = '', plan = '', previousAttempts = 0 }) {
  const port = process.env.PORT || '3001'
  const url = `http://127.0.0.1:${port}/api/alpha/repair`
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 60_000)
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, error: error.slice(0, 4000), command, prompt, plan, previousAttempts }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const data = await res.json().catch(() => null)
    if (!data || typeof data !== 'object') return null
    if (typeof data.code === 'string' && data.code.trim()) return { code: data.code, files: Array.isArray(data.files) ? data.files : [], dependencies: data.dependencies || {} }
    if (Array.isArray(data.files) && data.files.length > 0) {
      const main = data.files.find((f) => /src\/App\.(jsx?|tsx?)$/i.test(f.path))
      if (main && typeof main.code === 'string') return { code: main.code, files: data.files, dependencies: data.dependencies || {} }
    }
    return null
  } catch {
    return null
  }
}

function writeProjectFiles(workspaceDir, base, code, files, dependencies) {
  const safeDeps = validateDependencies(dependencies)

  const viteConfig = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'

export default defineConfig({
  base: '${base}',
  plugins: [react()],
  css: { postcss: { plugins: [tailwindcss, autoprefixer] } },
  build: { outDir: 'dist', emptyOutDir: true }
})
`
  fs.writeFileSync(path.resolve(workspaceDir, 'vite.config.js'), viteConfig, 'utf8')

  const packageJson = {
    name: 'alpha-generated-app',
    private: true,
    version: '0.0.1',
    type: 'module',
    scripts: {
      dev: 'vite --host',
      build: 'vite build',
      preview: 'vite preview',
      lint: 'eslint . --ext .js,.jsx,.mjs',
      typecheck: 'tsc --noEmit',
    },
    dependencies: {
      react: '^18.2.0',
      'react-dom': '^18.2.0',
      ...safeDeps,
    },
    devDependencies: {
      '@eslint/js': '^9.19.0',
      '@vitejs/plugin-react': '^4.3.4',
      autoprefixer: '^10.4.17',
      eslint: '^9.19.0',
      'eslint-plugin-react': '^7.37.4',
      'eslint-plugin-react-hooks': '^5.0.0',
      'eslint-plugin-unused-imports': '^4.3.0',
      globals: '^15.14.0',
      postcss: '^8.4.35',
      tailwindcss: '^3.4.1',
      typescript: '^5.7.0',
      vite: '^6.1.0',
    },
  }
  fs.writeFileSync(path.resolve(workspaceDir, 'package.json'), JSON.stringify(packageJson, null, 2), 'utf8')

  const tsconfig = {
    compilerOptions: {
      target: 'ES2020',
      useDefineForClassFields: true,
      lib: ['ES2020', 'DOM', 'DOM.Iterable'],
      module: 'ESNext',
      skipLibCheck: true,
      moduleResolution: 'bundler',
      allowImportingTsExtensions: true,
      resolveJsonModule: true,
      isolatedModules: true,
      noEmit: true,
      jsx: 'react-jsx',
      strict: false,
      noUnusedLocals: false,
      noUnusedParameters: false,
      noFallthroughCasesInSwitch: false,
      allowJs: true,
      esModuleInterop: true,
    },
    include: ['src'],
  }
  fs.writeFileSync(path.resolve(workspaceDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2), 'utf8')

  const eslintConfig = `import globals from 'globals'
import pluginJs from '@eslint/js'
import pluginReact from 'eslint-plugin-react'
import pluginReactHooks from 'eslint-plugin-react-hooks'
import pluginUnusedImports from 'eslint-plugin-unused-imports'

export default [
  {
    files: ['src/**/*.{js,mjs,cjs,jsx}'],
    ...pluginJs.configs.recommended,
    ...pluginReact.configs.flat.recommended,
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    plugins: { react: pluginReact, 'react-hooks': pluginReactHooks, 'unused-imports': pluginUnusedImports },
    rules: {
      'no-unused-vars': 'off',
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': ['warn', { vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' }],
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
      'react-hooks/rules-of-hooks': 'error',
    },
  },
]
`
  fs.writeFileSync(path.resolve(workspaceDir, 'eslint.config.js'), eslintConfig, 'utf8')

  fs.writeFileSync(path.resolve(workspaceDir, '.npmrc'), 'ignore-scripts=true\n', 'utf8')

  const appCode = transformCodeToViteApp(code)
  fs.writeFileSync(path.resolve(workspaceDir, 'src', 'App.jsx'), appCode, 'utf8')

  for (const file of files || []) {
    if (!file.path) continue
    const lowerPath = file.path.toLowerCase()
    if (lowerPath === 'src/app.jsx' || lowerPath === 'src/app.tsx' || lowerPath === 'src/app.ts' || lowerPath === 'src/app.js') continue
    if (lowerPath.startsWith('src/main.')) continue
    const filePath = path.resolve(workspaceDir, file.path)
    const dir = path.dirname(filePath)
    if (!dir.startsWith(workspaceDir + path.sep)) throw new Error(`Invalid file path: ${file.path}`)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    let fileCode = String(file.code || '')
    if (/\.(jsx|tsx?)$/i.test(file.path)) {
      fileCode = transformCodeToViteApp(fileCode).replace(/\nexport default [A-Za-z0-9_]+;?\s*$/, '')
    }
    fs.writeFileSync(filePath, fileCode, 'utf8')
  }
}

function formatStepsLog(steps) {
  return steps.map(s => `[${s.stage}] ${s.ok ? 'OK' : 'FAIL'} ${s.ms}ms${s.summary ? ` — ${s.summary}` : ''}`).join('\n')
}

function sanitizeLogs(log) {
  return String(log || '')
    .replace(/\/home\/[^\s'"]+/g, '<workspace>')
    .replace(/[A-Za-z0-9_\-]*(?:SECRET|KEY|TOKEN|PASSWORD)[A-Za-z0-9_\-]*\s*=\s*[^\s]+/gi, '[redacted]')
    .slice(-8000)
}

export async function buildPreviewProject(missionId, code, files = [], dependencies = {}, options = {}) {
  const { ownerId = 'anonymous', signal } = options
  const runsDir = previewRunsRoot()
  const runTargetDir = path.resolve(runsDir, missionId)
  const metaPath = path.resolve(runTargetDir, 'preview.json')
  const codeHash = hashCode(code + JSON.stringify(files) + JSON.stringify(dependencies))

  try {
    if (fs.existsSync(metaPath) && fs.existsSync(path.resolve(runTargetDir, 'index.html'))) {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
      if (meta.codeHash === codeHash && meta.ok) {
        return { ok: true, url: `/preview/${missionId}`, logs: '[preview] Using cached build.', attempts: 0, steps: [] }
      }
    }
  } catch {}

  if (signal?.aborted) return { ok: false, error: 'Build cancelled before starting.', logs: '', attempts: 0, steps: [] }

  cleanupOldWorkspaces(2)

  const workspace = createWorkspace({ missionId, ownerId, codeHash })
  const workspaceDir = workspace.workspaceDir
  const base = `/preview/${missionId}/`

  let steps = []
  const addStep = (stage, ok, ms, summary = '') => { steps.push({ stage, ok, ms, summary }) }

  try {
    copyTemplate(workspaceDir, templateDir)
    writeProjectFiles(workspaceDir, base, code, files, dependencies)
  } catch (error) {
    return { ok: false, error: `Workspace setup failed: ${error instanceof Error ? error.message : String(error)}`, logs: '', attempts: 0, steps }
  }

  const startInstall = Date.now()
  const install = await installDependencies(workspaceDir, signal)
  addStep('install', install.ok, Date.now() - startInstall, install.killed ? 'killed' : install.ok ? 'dependencies installed' : 'install failed')
  if (!install.ok) {
    return { ok: false, error: `npm install failed: ${sanitizeLogs(install.log).slice(-1000)}`, logs: sanitizeLogs(install.log), attempts: 0, steps }
  }

  const { prompt = '', plan = '' } = options
  let currentCode = code
  let currentFiles = files
  let currentDeps = dependencies
  let lastLog = ''
  let attempt = 0
  const maxAttempts = 5

  async function tryRepair(command, log) {
    const deterministic = repairCode(currentCode, log)
    if (deterministic !== currentCode) return { code: deterministic, source: 'deterministic' }
    if (!canRepair(log)) return null
    const ai = await aiRepair({ code: currentCode, error: log, command, prompt, plan, previousAttempts: attempt })
    if (ai && ai.code && ai.code.trim() && ai.code !== currentCode) return { code: ai.code, source: 'ai' }
    return null
  }

  while (attempt < maxAttempts) {
    if (signal?.aborted) return { ok: false, error: 'Build cancelled.', logs: sanitizeLogs(lastLog), attempts: attempt, steps }
    attempt += 1

    const appCode = transformCodeToViteApp(currentCode)
    fs.writeFileSync(path.resolve(workspaceDir, 'src', 'App.jsx'), appCode, 'utf8')

    const t0 = Date.now()
    const typeCheck = await runCommand(workspaceDir, 'tsc', ['--noEmit'], { label: 'typecheck', timeoutMs: 60_000, signal, env: sanitizeEnv() })
    addStep('typecheck', typeCheck.ok, Date.now() - t0, typeCheck.killed ? 'killed' : typeCheck.ok ? 'no errors' : 'type errors')
    if (!typeCheck.ok) {
      lastLog = typeCheck.log
      if (attempt === maxAttempts) break
      const repaired = await tryRepair('tsc', lastLog)
      if (!repaired) break
      currentCode = repaired.code
      continue
    }

    const l0 = Date.now()
    const lint = await runCommand(workspaceDir, 'eslint', ['src'], { label: 'eslint', timeoutMs: 60_000, signal, env: sanitizeEnv() })
    addStep('eslint', lint.ok, Date.now() - l0, lint.killed ? 'killed' : lint.ok ? 'clean' : 'lint errors')
    if (!lint.ok) {
      lastLog = lint.log
      if (attempt === maxAttempts) break
      const repaired = await tryRepair('eslint', lastLog)
      if (!repaired) break
      currentCode = repaired.code
      continue
    }

    const b0 = Date.now()
    const result = await runCommand(workspaceDir, 'vite', ['build', '--outDir', 'dist', '--emptyOutDir', '--base', base, '--logLevel', 'warn'], { label: 'vite build', timeoutMs: 120_000, signal, env: sanitizeEnv() })
    addStep('vite build', result.ok, Date.now() - b0, result.killed ? 'killed' : result.ok ? 'built' : 'build errors')
    lastLog = result.log
    if (result.ok) {
      const v0 = Date.now()
      const verify = await verifyRuntime({ distDir: path.resolve(workspaceDir, 'dist'), base, timeoutMs: 30_000, expectedFeatures: options.expectedFeatures || [] })
      addStep('runtime verify', verify.ok || verify.skipped, Date.now() - v0, verify.skipped ? 'skipped' : verify.ok ? 'mounted and rendered' : (verify.reason || `errors: ${verify.pageErrors.length + verify.consoleErrors.length}`))
      if (verify.ok || verify.skipped) {
        publishDist(workspaceDir, missionId)
        const meta = { codeHash, ok: true, builtAt: new Date().toISOString(), attempts: attempt, steps }
        fs.writeFileSync(metaPath, JSON.stringify(meta), 'utf8')
        return { ok: true, url: `/preview/${missionId}`, logs: sanitizeLogs(formatStepsLog(steps) + '\n' + lastLog), attempts: attempt, steps }
      }
      lastLog = [verify.reason, ...verify.pageErrors || [], ...verify.consoleErrors || [], verify.bodyTextPreview ? `body: ${verify.bodyTextPreview}` : ''].filter(Boolean).join('\n')
      if (attempt === maxAttempts) break
      const repaired = await tryRepair('runtime', lastLog)
      if (!repaired) break
      currentCode = repaired.code
      continue
    }

    if (attempt === maxAttempts) break
    const repaired = await tryRepair('vite', lastLog)
    if (!repaired) break
    currentCode = repaired.code
  }

  const meta = { codeHash, ok: false, builtAt: new Date().toISOString(), attempts: attempt, steps }
  if (fs.existsSync(path.dirname(metaPath))) fs.writeFileSync(metaPath, JSON.stringify(meta), 'utf8')
  return { ok: false, error: sanitizeLogs(lastLog).slice(-2000), logs: sanitizeLogs(formatStepsLog(steps) + '\n' + lastLog), attempts: attempt, steps }
}

export function servePreviewBuild(req, res, missionId) {
  return servePreview(req, res, missionId)
}
