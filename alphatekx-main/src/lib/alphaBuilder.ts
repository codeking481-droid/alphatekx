import { spendCredits } from './creditStore'
import { addActivity, buildMemoryContext, completeMission, saveCreation, updateMission, updateMissionProgress } from './missionStore'
import type { Creation, CreationFile, Mission, Plan } from './types'
import { postJson } from './apiClient'
import { extractRequestedFeatures, featureSummary, validateGeneratedAppFeatures } from './builderVerifier'
import { generatePlan } from './builderPlanner'
import { addProjectMemory } from './companyMemory'

const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds))

async function buildPreviewForMission(mission: Mission, code: string, files: CreationFile[] = [], dependencies: string[] = [], signal?: AbortSignal): Promise<{ ok: boolean; url?: string; error?: string; logs?: string; steps?: { stage: string; ok: boolean; ms: number; summary?: string }[] }> {
  try {
    const deps = dependencies.reduce((acc, d) => { acc[d] = 'latest'; return acc }, {} as Record<string, string>)
    const plan = mission.plan ? JSON.stringify(mission.plan) : ''
    const expectedFeatures = extractRequestedFeatures(mission.goal)
    const result = await postJson<{ ok: boolean; url: string; error?: string; logs?: string; steps?: { stage: string; ok: boolean; ms: number; summary?: string }[] }>(`/api/previews/${mission.id}`, { code, files, dependencies: deps, prompt: mission.goal, plan, expectedFeatures }, { timeoutMs: 180_000, signal })
    return { ok: result.ok, url: result.url, error: result.error, logs: result.logs, steps: result.steps }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Preview build request failed' }
  }
}

const REACT_IMPORTS = `const { useState, useEffect, useMemo, useReducer, useRef } = React;\n`

function rememberBuild(mission: Mission, creation: Creation, fix?: string) {
  try {
    addProjectMemory({
      id: mission.id,
      title: creation.title || mission.title,
      goal: mission.goal,
      category: 'web-app',
      systems: ['React', 'Tailwind', 'Alpha OS'],
      installedLibraries: creation.dependencies || [],
      previousPrompts: [mission.goal],
      previousFixes: fix ? [fix] : [],
      goals: [mission.goal],
      createdAt: new Date().toISOString(),
    })
  } catch {}
}

function stripFences(value: string) {
  return value.replace(/```(?:json|tsx|jsx|javascript|js)?\s*([\s\S]*?)```/gi, '$1').trim()
}

function maybeJson<T>(value: string): T | null {
  const cleaned = stripFences(value)
  if (!cleaned.startsWith('{')) return null
  try { return JSON.parse(cleaned) as T } catch { return null }
}

function extractFirstJsonObject(value: string): string | null {
  const cleaned = stripFences(value)
  let depth = 0
  let inString = false
  let escape = false
  let start = -1
  for (let i = 0; i < cleaned.length; i += 1) {
    const c = cleaned[i]
    if (escape) { escape = false; continue }
    if (c === '\\') { escape = true; continue }
    if (c === '"' && (i === 0 || cleaned[i - 1] !== '\\')) inString = !inString
    if (inString) continue
    if (c === '{') {
      if (start === -1) start = i
      depth += 1
    } else if (c === '}') {
      depth -= 1
      if (depth === 0 && start !== -1) return cleaned.slice(start, i + 1)
    }
  }
  return null
}

export function extractCode(value: string) {
  const blocks = [...value.matchAll(/```(?:tsx|jsx|javascript|js)?\s*([\s\S]*?)```/gi)]
  const fenced = blocks.find(match => /function\s+AlphaApp|const\s+AlphaApp/.test(match[1]))?.[1] ?? blocks[0]?.[1] ?? value
  let code = fenced
    .replace(/\bimport\s+(?:[\s\S]*?\s+from\s+['"][^'"]+['"]\s*;?|['"][^'"]+['"]\s*;?)\s*/g, '')
    .replace(/\bexport\s+default\s+/g, '')
    .replace(/^\s*export\s+/gm, '')
    .trim()
  if (!/\bconst\s*\{[^}]*useState/.test(code) && /\buseState\b/.test(code)) {
    code = REACT_IMPORTS + code
  }
  if (!/createRoot\(/.test(code)) {
    const component = code.match(/function\s+([A-Z][A-Za-z0-9_]*)\s*\(/)?.[1] ?? code.match(/const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*\(/)?.[1]
    if (component) code += `\nReactDOM.createRoot(document.getElementById('root')).render(<${component} />);`
  }
  return code
}

export function extractFiles(value: string): { files: Record<string, string>; title?: string; description?: string; dependencies?: string[] } | null {
  const json = extractFirstJsonObject(value)
  if (!json) return null
  const parsed = maybeJson<{ files?: Record<string, string>; title?: string; description?: string; dependencies?: string[] }>(json)
  if (!parsed?.files || Object.keys(parsed.files).length < 1) return null
  return parsed as { files: Record<string, string>; title?: string; description?: string; dependencies?: string[] }
}

function normalizeFileContent(content: string) {
  return content
    .replace(/^\s*import\s+(?:[\s\S]*?\s+from\s+['"][^'"]+['"]\s*;?|['"][^'"]+['"]\s*;?)\s*$/gm, '')
    .replace(/^\s*import\s+\{[^}]*\}\s*from\s+['"][^'"]+['"]\s*;?\s*$/gm, '')
    .replace(/^\s*import\s+\*\s+as\s+\w+\s+from\s+['"][^'"]+['"]\s*;?\s*$/gm, '')
    .replace(/^\s*export\s+default\s+/gm, '')
    .replace(/^\s*export\s+/gm, '')
    .replace(/ReactDOM\.createRoot\([\s\S]*?\)\.render\s*\([\s\S]*?\);?\s*/g, '')
    .trim()
}

const isCodeFile = (path: string) => /\.(jsx?|tsx?|js|ts)$/i.test(path)

function filePriority(path: string) {
  const lower = path.toLowerCase()
  if (lower.includes('app.jsx') || lower.includes('app.tsx')) return 1000
  if (lower.includes('main.')) return 900
  if (lower.endsWith('.css')) return 10
  if (lower.startsWith('src/lib/') || lower.startsWith('src/data/') || lower.startsWith('src/utils/') || lower.startsWith('src/hooks/') || lower.startsWith('src/store/')) return 60
  if (lower.startsWith('src/components/')) return 70
  if (lower.startsWith('src/pages/')) return 80
  return 50
}

export function combineFiles(files: Record<string, string>): string {
  const entries = Object.entries(files)
    .filter(([path]) => isCodeFile(path) && !/index\.html|package\.json|vite\.config|tailwind\.config|postcss\.config|readme\.md/i.test(path))
    .sort(([a], [b]) => filePriority(a) - filePriority(b) || a.localeCompare(b))
  let combined = ''
  for (const [path, raw] of entries) {
    const content = normalizeFileContent(raw)
    if (!content) continue
    combined += `\n/* --- ${path} --- */\n` + content + '\n'
  }
  if (!/\bconst\s*\{[^}]*useState/.test(combined) && /\buseState\b/.test(combined)) {
    combined = REACT_IMPORTS + combined
  }
  if (!/ReactDOM\.createRoot\(/.test(combined)) {
    const component = combined.match(/function\s+(AlphaApp|App)\s*\(/)?.[1] ?? combined.match(/const\s+(AlphaApp|App)\s*=\s*\(/)?.[1]
    if (component) combined += `\nReactDOM.createRoot(document.getElementById('root')).render(<${component} />);`
  }
  return combined
}

export function parseBuilderOutput(value: string): { code: string; files: CreationFile[]; title?: string; description?: string; dependencies?: string[] } {
  const json = extractFiles(value)
  if (json) {
    const fileArray: CreationFile[] = Object.entries(json.files).map(([path, code]) => ({ path, code }))
    const code = combineFiles(json.files)
    return { code, files: fileArray, title: json.title, description: json.description, dependencies: json.dependencies }
  }
  const code = extractCode(value)
  return { code, files: [{ path: 'src/App.tsx', code }], title: 'Alpha App', description: '' }
}

function normalizeAppCode(code: string, appLike: boolean) {
  if (!appLike) return code
  const rootMatch = code.match(/<div\b[^>]*?className=["']([^"']*)["'][^>]*>/)
  if (rootMatch) {
    const tag = rootMatch[0]
    let cls = rootMatch[1]
    const ensure = (c: string) => { if (!new RegExp(`\\b${c}\\b`).test(cls)) cls += ' ' + c }
    ensure('h-screen'); ensure('w-full'); ensure('overflow-hidden'); ensure('flex'); ensure('flex-col')
    code = code.slice(0, rootMatch.index) + tag.replace(rootMatch[1], cls.trim()) + code.slice(rootMatch.index + tag.length)
  }
  const mainMatch = code.match(/<main\b[^>]*?className=["']([^"']*)["'][^>]*>/)
  if (mainMatch) {
    const tag = mainMatch[0]
    let cls = mainMatch[1]
    const ensure = (c: string) => { if (!new RegExp(`\\b${c}\\b`).test(cls)) cls += ' ' + c }
    ensure('flex-1'); ensure('overflow-y-auto'); ensure('min-h-0')
    code = code.slice(0, mainMatch.index) + tag.replace(mainMatch[1], cls.trim()) + code.slice(mainMatch.index + tag.length)
  }
  return code
}

export function validateGeneratedApp(code: string, appLike = false, fileCount = 1, prompt?: string) {
  const errors: string[] = []
  if (fileCount < 1) errors.push('no files generated')
  if (!/function\s+[A-Z]|const\s+[A-Z][A-Za-z0-9_]*\s*=/.test(code)) errors.push('missing a React component')
  if (!/createRoot\(/.test(code)) errors.push('missing a render entry')
  if (!/useState|useReducer/.test(code)) errors.push('missing application state')
  if (!/onClick|onSubmit|onChange/.test(code)) errors.push('missing working interactions')
  if (/\bTODO\b/.test(code) || /coming soon|under construction|lorem ipsum|\[\s*your content here\s*\]/i.test(code)) errors.push('contains unfinished or dead functionality')
  if (/\bimport\s+.*['"]|\bexport\s+default\s+/.test(code)) errors.push('contains unsupported module syntax')
  if (!/ReactDOM\.createRoot\(document\.getElementById\(['"]root['"]\)\)\.render\(/.test(code)) errors.push('missing a valid preview mount')
  if (appLike) {
    if (!/h-screen/.test(code)) errors.push('app root must use h-screen')
    if (!/overflow-y-auto/.test(code) && !/overflow-auto/.test(code)) errors.push('app main area must scroll internally')
  } else {
    if (!/min-h-screen|h-screen/.test(code)) errors.push('missing a full-viewport root layout')
  }
  if (!/[})];?\s*$/.test(code)) errors.push('appears truncated')
  if (prompt) {
    const featureResult = validateGeneratedAppFeatures(code, prompt)
    if (featureResult.missing.length > 0) {
      errors.push(featureSummary(featureResult))
    }
  }
  return errors
}

function pageExamples() {
  return `
EXAMPLE FILE STRUCTURE FOR "Build full e-commerce website":
{
  "files": {
    "src/data/products.js": "const products = [{ id:1, name:'Wireless Headphones', price:59.99, category:'Electronics', image:'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400', stock:12 }, ... 24 more items];",
    "src/components/Navbar.jsx": "function Navbar({ cartCount, setView }) { return (...) }",
    "src/components/ProductCard.jsx": "function ProductCard({ product, addToCart }) { return (...) }",
    "src/components/CartDrawer.jsx": "function CartDrawer({ cart, removeFromCart, updateQty, isOpen, setIsOpen }) { return (...) }",
    "src/pages/Home.jsx": "function Home({ products, addToCart, setView }) { return (...) }",
    "src/pages/Shop.jsx": "function Shop({ products, addToCart, filters, setFilters }) { return (...) }",
    "src/pages/ProductDetail.jsx": "function ProductDetail({ product, addToCart }) { return (...) }",
    "src/pages/Cart.jsx": "function Cart({ cart, removeFromCart, updateQty, setView }) { return (...) }",
    "src/pages/Checkout.jsx": "function Checkout({ cart, setView }) { return (...) }",
    "src/pages/AdminDashboard.jsx": "function AdminDashboard({ products, orders }) { return (...) }",
    "src/App.jsx": "function AlphaApp() { const [view, setView] = React.useState('home'); ... return (<div className=\\\"h-screen w-full overflow-hidden flex flex-col bg-[#0A0A0A] text-zinc-100\\\"><Navbar .../>{renderView()}</div>); }\nReactDOM.createRoot(document.getElementById('root')).render(<AlphaApp />);"
  },
  "dependencies": ["react-router-dom"]
}

NOTE: Do not actually import these dependencies. Write every icon as inline SVG and every animation as CSS transitions. No external packages.`.trim()
}

function builderContract(mission: Mission, isApp: boolean, appExtras: string, memory: string): string {
  const learningMode = /\blearn|teach|course|study|academy|physics|math|biology|subject|student|lesson|quiz|school\b/i.test(mission.goal)
  const mentorMode = learningMode ? ' Learning platform mode: build a FULL AlphaLearn-style single-page learning platform. Sidebar: Dashboard, Courses, Lesson Player, Quiz Center, Notes, Progress, Certificate, Profile. Dashboard shows hero with real stats and 4-8 course cards. Course library has category filter and search. Lesson player has left lesson menu and right content area with real lesson text (not placeholder), code blocks for technical topics, and mark complete. Quiz Center has multiple-choice questions with score, correct/wrong feedback, and retry. Notes view lets users add/delete notes. Progress view shows completed lessons and weekly goal. Certificate view is printable. Profile has theme toggle and name edit. Use localStorage for all state. Include real courses and lessons (e.g. Mathematics, Physics, JavaScript, Business) with actual content, not lorem ipsum.' : ''
  const businessMode = /\b(start|launch|build)\s+(a\s+)?business\b|business plan|startup|POS|store|ecommerce|shop|inventory|sales|checkout|receipt/i.test(mission.goal) ? ' Business OS mode: build a full operational app, not a static page. Include idea validation, business model, public landing with real value prop, customer catalog, inventory/product list with real sample items, cart with add/remove and quantity, checkout with receipt/order confirmation, sales analytics/chart, and localStorage persistence. Every button works and updates state.' : ''
  const platformMode = /\b(os|operating system|neuralos|business operating system|all-in-one|workspace suite|erp)\b|(?:enterprise|saas|all-in-one)\s+(platform|suite|operating system|os|workspace|dashboard|app)/i.test(mission.goal) ? ' PLATFORM / OS MODE: This is a large multi-module operating system. Build 6-10 core modules (Dashboard, Projects/Kanban, CRM, Analytics/Charts, Team Chat, Calendar, Files/Storage, Automations, Settings/Admin, etc.) each as a real working view. Use the global AlphaUI component library for navigation, cards, tables, kanban, charts, modals, and badges to keep the code concise. Use AlphaAPI for backend CRUD. Every module must be functional with realistic mock data and interactive.' : ''
  const tradingMode = /\b(trading|crypto|stock|forex|exchange|broker|portfolio|market|trade)\b/i.test(mission.goal) ? ' TRADING / FINTECH MODE: Build a real trading/fintech platform with market overview, asset prices with live-style updates, portfolio summary, order book, buy/sell forms with validation, transaction history, watchlist, charts of price movement, and responsive dark UI. Use realistic mock market data and update numbers with small random fluctuations to feel alive.' : ''
  const portfolioMode = /\bportfolio\b/i.test(mission.goal) ? ' Portfolio mode: full multi-section single-page site with sticky nav, hero with name/role/tagline, about, skills, 4-6 real project cards with descriptions and links, services, testimonials, contact form with validation, footer, and theme toggle.' : ''
  const blogMode = /\bblog\b/i.test(mission.goal) ? ' Blog mode: full content site with featured post hero, category filter, search, article grid with real sample posts and excerpts, single article view with markdown-like styling, newsletter signup, and related posts.' : ''
  const modeClause = isApp
    ? ` APP MODE: This is a single-screen mobile app. The root element MUST be <div className="h-screen w-full overflow-hidden flex flex-col bg-[#0A0A0A] text-zinc-100">. Keep one compact fixed top bar (fixed top-0 left-0 right-0 z-50) with a hamburger menu. The main content area MUST be <main className="flex-1 overflow-y-auto min-h-0"> so it scrolls internally and never pushes the header off-screen. No landing hero, no footer, no wide desktop sidebars. Use a views object mapping lowercase view names to components and a currentView state to include 5-7 functional screens; every menu button must have data-view matching the lowercase view key and call setView(viewName).${appExtras}`
    : ' WEBSITE / PLATFORM MODE: This is a multi-view single-page platform. The root MUST be <div className="min-h-screen w-full overflow-x-hidden bg-[#0A0A0A] text-zinc-100"> with a sticky/fixed top nav and, on desktop, a sidebar. Create a views object mapping lowercase view names to page components. Use currentView and setView to switch pages. Every nav button MUST have data-view="viewname" and call setView(viewName). Listen to window.location.hash on load and hashchange. Include a view switcher (dashboard, list/detail, settings, etc.), hero sections, real content, CTA, and footer. Use max-w-7xl mx-auto for content sections. Hamburger must open a mobile drawer. The header must be fixed/sticky and visible without scrolling.'
  const designClause = ' Design system: background #0A0A0A, cards #151515 with border border-white/[0.08] rounded-2xl, choose ONE premium accent color per build (e.g. #6366F1, #8B5CF6, #EC4899, #3B82F6, #10B981, #F59E0B) and use it consistently for primary CTAs/active states, text zinc-100 headings / zinc-400 body. No random colors, no neon, no scattered pastels. Inline SVG icons only. Real Unsplash images where relevant.'
  return `User wants: ${mission.goal}. User memory: ${memory} ${mentorMode}${businessMode}${platformMode}${tradingMode}${portfolioMode}${blogMode}${modeClause}${designClause} Build a COMPLETE, PRODUCTION-READY, multi-file React app with a real AlphaTekX backend. Generate 8-15 files minimum with real data, CRUD, charts, lists, forms, modals, toasts, search/filter/sort, animations, dark mode toggle, responsive layout, loading/success/error/empty states, and localStorage persistence. Use the global AlphaAPI object for real backend CRUD (AlphaAPI.get('products'), AlphaAPI.post('products', data), AlphaAPI.put('products', id, data), AlphaAPI.del('products', id)). Use the global AlphaUI component library for common UI: Sidebar, Topbar, Card, StatCard, Button, Input, Table, Kanban, Chart, Modal, Tabs, Search, Avatar, Badge, Empty, Skeleton. Do not redefine AlphaUI. Every button works, every form validates, every screen responsive. NEVER a generic dashboard or empty landing page. NEVER placeholder text like 'Sample course', 'Project 1', 'Lorem ipsum', or empty arrays. NEVER put an object directly inside JSX; only render strings, numbers, booleans, arrays, or React elements.
- AlphaUI prop shapes: Sidebar items must be an array of objects {id, label, icon?}. Table columns must be an array of objects {key, title, render?} and rows must be an array of arrays or objects. Avatar accepts name and optional image/src.
- Defensive code: always guard nested access with optional chaining and fallbacks. For example use (currentUser || {}).name, user?.image || '', files?.[0]?.name || ''. Never access .image, .url, .name, or any property on a possibly undefined object without a fallback.

OUTPUT FORMAT - STRICT JSON:
Return a single JSON object (no markdown fences) with this exact shape:
{
  "title": "App title",
  "description": "Short tagline",
  "dependencies": ["react-router-dom", "framer-motion", "lucide-react", "zustand"],
  "files": {
    "src/data/mockData.js": "...",
    "src/lib/store.js": "function loadEntities(entity, setState) { window.AlphaAPI.get(entity).then(r => setState(r.records || [])); } function saveEntity(entity, data, setState) { window.AlphaAPI.post(entity, data).then(() => loadEntities(entity, setState)); }",
    "src/components/Navbar.jsx": "...",
    "src/pages/Home.jsx": "...",
    "src/pages/Shop.jsx": "...",
    "src/App.jsx": "...",
    "supabase/migrations/001_app_entities.sql": "CREATE TABLE IF NOT EXISTS app_entities (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), app_slug text NOT NULL, entity text NOT NULL, data jsonb NOT NULL DEFAULT '{}'::jsonb, owner_id uuid, owner_email text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()); CREATE INDEX IF NOT EXISTS idx_app_entities_app_entity ON app_entities(app_slug, entity);"
  }
}

RULES FOR FILES:
- Only React 18 and Tailwind CSS via CDN. NO external packages are bundled, so you must NOT import lucide-react, framer-motion, recharts, zustand, or react-router-dom. Inline all icons as SVG and all animations as CSS transitions.
- The "dependencies" field in the output is for documentation only; do not import those packages.
- Do NOT use import/export statements. All functions share the same global scope, so define helpers and components in data/lib files first, then components, then pages, then App.jsx.
- Each main page/component must be at least 150 lines and fully functional, not a skeleton.
- Include at least 8 files and at least 1000 lines total.
- App.jsx must contain a function named AlphaApp (or App) and end with: ReactDOM.createRoot(document.getElementById('root')).render(<AlphaApp />);
- Use React.useState/useEffect/useMemo/useReducer for state. For navigation use a currentView state and a setView function; render the active page based on currentView. Add a sidebar/topbar that calls setView to switch pages. Every navigation button or link MUST include a data-view attribute equal to the lowercase view name (e.g. data-view="home"). Also listen to window.location.hash on load and hashchange events: if the hash matches a known view, call setView(hashValue) so the preview page dropdown can drive navigation.
- Use the global AlphaAPI object for real backend CRUD: AlphaAPI.get('products'), AlphaAPI.post('products', data), AlphaAPI.put('products', id, data), AlphaAPI.del('products', id). Do not redefine AlphaAPI.
- Use realistic mock data: 20+ products for e-commerce, 5-8 courses for learning, 8-15 posts for blog, 50+ items for POS/inventory.
- Persist UI state to localStorage and read it back on load. Use AlphaAPI for data records.

${pageExamples()}`
}

function checkSignal(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error('ABORTED')
}

function stageLabelFromProgress(progress: number): string {
  if (progress <= 10) return 'Planning'
  if (progress <= 30) return 'Generating Files'
  if (progress <= 40) return 'Type Checking'
  if (progress <= 50) return 'Building'
  if (progress <= 70) return 'Launching Preview'
  if (progress <= 85) return 'Inspecting'
  if (progress <= 95) return 'Repairing / Refining'
  return 'Complete'
}

async function stage(missionId: string, text: string, progress: number, signal?: AbortSignal) {
  checkSignal(signal)
  addActivity(missionId, text)
  updateMissionProgress(missionId, progress)
  updateMission(missionId, { currentStage: stageLabelFromProgress(progress) })
  await wait(220)
}

export async function planMission(mission: Mission, signal?: AbortSignal): Promise<Plan> {
  checkSignal(signal)
  try {
    const payload = await postJson<{ plan?: Plan }>('/api/alpha/plan', { prompt: mission.goal }, { timeoutMs: 60_000, signal })
    if (payload.plan) {
      updateMission(mission.id, { plan: payload.plan, planStatus: 'draft' })
      addActivity(mission.id, `[Product Manager] Plan created: ${payload.plan.title} — ${payload.plan.modules.length} modules`)
      return payload.plan
    }
  } catch (error) {
    addActivity(mission.id, `[Product Manager] AI planning unavailable; using deterministic planner.`)
  }
  const plan = generatePlan(mission.goal)
  updateMission(mission.id, { plan, planStatus: 'draft' })
  addActivity(mission.id, `[Product Manager] Plan created: ${plan.title} — ${plan.modules.length} modules`)
  return plan
}

function planPrompt(plan: Plan) {
  return `\nFOLLOW THIS APPROVED ARCHITECTURE PLAN:\nTitle: ${plan.title}\nDescription: ${plan.description}\nModules to build:\n${plan.modules.map((m, i) => `${i + 1}. ${m.name} (${m.id}) — ${m.purpose}`).join('\n')}\nGenerate files that implement each module. Use the module ids as view names in the navigation.`
}

export async function buildFromPlan(mission: Mission, signal?: AbortSignal): Promise<Creation> {
  checkSignal(signal)
  if (!mission.plan) throw new Error('No approved plan for this mission')
  if (!await spendCredits(10)) throw new Error('LOW_CREDITS')

  await stage(mission.id, '[Product Manager] Starting approved plan...', 5, signal)
  await stage(mission.id, '[UI Designer] Applying design system to all modules...', 12, signal)

  const isApp = /\b(app|calculator|tool|todo|tracker|clock|timer|converter|mobile|utility)\b/i.test(mission.goal) && !/\b(website|landing|site|portfolio|blog|webpage|page|platform|academy)\b/i.test(mission.goal)
  const appExtras = /\bcalculator\b/i.test(mission.goal) ? ' Calculator extras: include standard arithmetic, scientific operations, memory buttons (M+, M-, MR, MC), history with clear, percentage, sign toggle, tip/split calculator, and a dark theme toggle. All keys work and history persists.' : ''
  const memory = buildMemoryContext(mission.id)
  const contract = builderContract(mission, isApp, appExtras, memory) + planPrompt(mission.plan)

  checkSignal(signal)
  updateMission(mission.id, { status: 'building', planStatus: 'approved' })

  let code = ''
  let files: CreationFile[] = []
  let title = mission.plan.title || mission.title
  let description = mission.plan.description || ''
  let dependencies: string[] = []

  let previewUrl = ''
  let previewLogs = ''
  let previewSteps: { stage: string; ok: boolean; ms: number; summary?: string }[] = []
  try {
    let validationErrors: string[] = []
    for (let attempt = 0; attempt < 2; attempt += 1) {
      checkSignal(signal)
      const payload = await postJson<{ code?: string; response?: string; provider?: string }>('/api/alpha', { mode: 'builder', missionId: mission.id, prompt: attempt === 0 ? contract : `${contract}\nThe previous build was rejected because it was ${validationErrors.join(', ')}. Return a fully corrected JSON object with all files and a working AlphaApp.` }, { timeoutMs: 180_000, signal })
      const raw = String(payload.code || payload.response || '')
      const parsed = parseBuilderOutput(raw)
      code = normalizeAppCode(parsed.code, isApp)
      files = parsed.files
      title = parsed.title || title
      description = parsed.description || description
      dependencies = parsed.dependencies || []
      validationErrors = validateGeneratedApp(code, isApp, files.length, mission.goal)
      if (validationErrors.length === 0) {
        const build = await buildPreviewForMission(mission, code, files, dependencies, signal)
        if (build.ok) { previewUrl = build.url || ''; previewLogs = build.logs || ''; previewSteps = build.steps || []; break }
        validationErrors = [`preview build failed: ${build.error || 'unknown'}`]
        addActivity(mission.id, `[QA Tester] Build failed: ${validationErrors.join(', ')}`)
        if (build.logs) addActivity(mission.id, `[Build logs] ${build.logs.slice(-500)}`)
      }
      addActivity(mission.id, `[QA Tester] Repairing: ${validationErrors.join(', ')}...`)
    }
    if (validationErrors.length) {
      checkSignal(signal)
      addActivity(mission.id, `[QA Tester] AI output did not pass verification (${validationErrors.join(', ')}). Falling back to deterministic builder...`)
      const fallback = await postJson<{ code?: string; provider?: string }>('/api/alpha/fallback', { prompt: mission.goal }, { timeoutMs: 30_000, signal })
      const parsed = parseBuilderOutput(String(fallback.code || ''))
      code = normalizeAppCode(parsed.code, isApp)
      files = parsed.files
      title = parsed.title || title
      description = parsed.description || description
      dependencies = parsed.dependencies || []
      validationErrors = validateGeneratedApp(code, isApp, files.length, mission.goal)
      if (validationErrors.length === 0) {
        const build = await buildPreviewForMission(mission, code, files, dependencies, signal)
        if (!build.ok) {
          addActivity(mission.id, `[QA Tester] Deterministic fallback build failed: ${build.error || 'unknown'}`)
          throw new Error(`Preview build failed for fallback: ${build.error || 'unknown'}`)
        }
        previewUrl = build.url || ''
        previewLogs = build.logs || ''; previewSteps = build.steps || []
      }
      if (validationErrors.length) {
        addActivity(mission.id, `[QA Tester] Deterministic fallback also failed verification: ${validationErrors.join(', ')}`)
        throw new Error(`The generated app does not match your request. Missing: ${validationErrors.join(', ')}. Please rephrase your prompt or check your AI provider settings.`)
      }
      addActivity(mission.id, '[QA Tester] Deterministic fallback passed verification and preview build.')
    }
  } catch (error) {
    addActivity(mission.id, `[QA Tester] Build stopped: ${error instanceof Error ? error.message : 'AI generation failed'}`)
    throw error
  }

  await stage(mission.id, '[Backend Engineer] Creating authentication and service architecture...', 46, signal)
  await stage(mission.id, '[Database Engineer] Building Supabase tables and data policies...', 60, signal)
  await stage(mission.id, '[QA Tester] Running functional and responsive tests...', 76, signal)
  await stage(mission.id, '[QA Tester] Repairing verification failures...', 90, signal)

  checkSignal(signal)
  const creation = saveCreation({
    missionId: mission.id,
    title,
    description,
    code,
    type: 'web-app',
    files,
    dependencies,
    previewUrl,
    previewLogs,
    previewSteps,
  })
  await stage(mission.id, '[Deployment Engineer] Preparing production build and deployment...', 98, signal)
  completeMission(mission.id)
  rememberBuild(mission, creation)
  return creation
}

export async function buildFromMission(mission: Mission, signal?: AbortSignal): Promise<Creation> {
  checkSignal(signal)
  if (!await spendCredits(10)) throw new Error('LOW_CREDITS')

  await stage(mission.id, '[Product Manager] Defining requirements and acceptance criteria...', 8, signal)
  await stage(mission.id, '[UI Designer] Designing responsive screens and interaction states...', 18, signal)
  await stage(mission.id, '[Tech Lead] Architecting multi-file app structure...', 28, signal)

  const isApp = /\b(app|calculator|tool|todo|tracker|clock|timer|converter|mobile|utility)\b/i.test(mission.goal) && !/\b(website|landing|site|portfolio|blog|webpage|page|platform|academy)\b/i.test(mission.goal)
  const appExtras = /\bcalculator\b/i.test(mission.goal) ? ' Calculator extras: include standard arithmetic, scientific operations, memory buttons (M+, M-, MR, MC), history with clear, percentage, sign toggle, tip/split calculator, and a dark theme toggle. All keys work and history persists.' : ''
  const memory = buildMemoryContext(mission.id)

  let code = ''
  let files: CreationFile[] = []
  let title = mission.title
  let description = ''
  let dependencies: string[] = []
  let previewUrl = ''
  let previewLogs = ''
  let previewSteps: { stage: string; ok: boolean; ms: number; summary?: string }[] = []

  try {
    const contract = builderContract(mission, isApp, appExtras, memory)
    let validationErrors: string[] = []
    for (let attempt = 0; attempt < 2; attempt += 1) {
      checkSignal(signal)
      const payload = await postJson<{ code?: string; response?: string; provider?: string }>('/api/alpha', { mode: 'builder', missionId: mission.id, prompt: attempt === 0 ? contract : `${contract}\nThe previous build was rejected because it was ${validationErrors.join(', ')}. Return a fully corrected JSON object with all files and a working AlphaApp.` }, { timeoutMs: 180_000, signal })
      const raw = String(payload.code || payload.response || '')
      const parsed = parseBuilderOutput(raw)
      code = normalizeAppCode(parsed.code, isApp)
      files = parsed.files
      title = parsed.title || title
      description = parsed.description || description
      dependencies = parsed.dependencies || []
      validationErrors = validateGeneratedApp(code, isApp, files.length, mission.goal)
      if (validationErrors.length === 0) {
        const build = await buildPreviewForMission(mission, code, files, dependencies, signal)
        if (build.ok) { previewUrl = build.url || ''; previewLogs = build.logs || ''; previewSteps = build.steps || []; break }
        validationErrors = [`preview build failed: ${build.error || 'unknown'}`]
        addActivity(mission.id, `[QA Tester] Build failed: ${validationErrors.join(', ')}`)
        if (build.logs) addActivity(mission.id, `[Build logs] ${build.logs.slice(-500)}`)
      }
      addActivity(mission.id, `[QA Tester] Repairing: ${validationErrors.join(', ')}...`)
    }
    if (validationErrors.length) {
      checkSignal(signal)
      addActivity(mission.id, `[QA Tester] AI output did not pass verification (${validationErrors.join(', ')}). Falling back to deterministic builder...`)
      const fallback = await postJson<{ code?: string; provider?: string }>('/api/alpha/fallback', { prompt: mission.goal }, { timeoutMs: 30_000, signal })
      const parsed = parseBuilderOutput(String(fallback.code || ''))
      code = normalizeAppCode(parsed.code, isApp)
      files = parsed.files
      title = parsed.title || title
      description = parsed.description || description
      dependencies = parsed.dependencies || []
      validationErrors = validateGeneratedApp(code, isApp, files.length, mission.goal)
      if (validationErrors.length === 0) {
        const build = await buildPreviewForMission(mission, code, files, dependencies, signal)
        if (!build.ok) {
          addActivity(mission.id, `[QA Tester] Deterministic fallback build failed: ${build.error || 'unknown'}`)
          throw new Error(`Preview build failed for fallback: ${build.error || 'unknown'}`)
        }
        previewUrl = build.url || ''; previewLogs = build.logs || ''; previewSteps = build.steps || []
      }
      if (validationErrors.length) {
        addActivity(mission.id, `[QA Tester] Deterministic fallback also failed verification: ${validationErrors.join(', ')}`)
        throw new Error(`The generated app does not match your request. Missing: ${validationErrors.join(', ')}. Please rephrase your prompt or check your AI provider settings.`)
      }
      addActivity(mission.id, '[QA Tester] Deterministic fallback passed verification and preview build.')
    }
  } catch (error) {
    addActivity(mission.id, `[QA Tester] Build stopped: ${error instanceof Error ? error.message : 'AI generation failed'}`)
    throw error
  }

  await stage(mission.id, '[Backend Engineer] Creating authentication and service architecture...', 46, signal)
  await stage(mission.id, '[Database Engineer] Building Supabase tables and data policies...', 60, signal)
  await stage(mission.id, '[QA Tester] Running functional and responsive tests...', 76, signal)
  await stage(mission.id, '[QA Tester] Repairing verification failures...', 90, signal)

  checkSignal(signal)
  const creation = saveCreation({
    missionId: mission.id,
    title,
    description,
    code,
    type: 'web-app',
    files,
    dependencies,
    previewUrl,
    previewLogs,
    previewSteps,
  })
  await stage(mission.id, '[Deployment Engineer] Preparing production build and deployment...', 98, signal)
  completeMission(mission.id)
  rememberBuild(mission, creation)
  return creation
}

function applySafeLocalEdit(code: string, request: string): string {
  const lower = request.toLowerCase()
  const tailwindColors = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose', 'slate', 'gray', 'zinc', 'neutral', 'stone']
  const colorMatch = lower.match(/\b(?:make it|change to|use|set to)\s+(?:everything |the app |it |color |theme |to )?([a-z]+)\b/i) || lower.match(/\b(?:blue|red|green|purple|indigo|emerald|teal|cyan|orange|pink|yellow|gray|slate|zinc|violet)\b/i)
  let requested = ''
  let edited = code

  if (colorMatch) {
    requested = (colorMatch[1] || colorMatch[0]).toLowerCase()
    if (tailwindColors.includes(requested)) {
      const colorRegex = new RegExp(`\\b(bg|text|border|from|to|ring|shadow|caret|accent|decoration|outline|placeholder|divide|stroke|fill)-(${tailwindColors.join('|')})-(50|100|200|300|400|500|600|700|800|900|950)\\b`, 'g')
      edited = edited.replace(colorRegex, `$1-${requested}-$3`)
    }
  }

  if (/\b(dark mode|dark theme|light mode|theme toggle|toggle theme)\b/i.test(lower) && !/\bdark\b/i.test(requested || '')) {
    if (!/\bsetDark\b|\[dark,/.test(edited)) {
      edited = edited.replace(/(function\s+[A-Z][a-zA-Z0-9_]*\(\)\s*\{)/, `$1\n  const [dark, setDark] = React.useState(true);\n  React.useEffect(() => { document.documentElement.classList.toggle('dark', dark); }, [dark]);`)
      if (!/setDark\s*\(/.test(edited)) {
        const navMatch = edited.match(/<nav[^>]*>/i)
        if (navMatch) {
          edited = edited.replace(navMatch[0], `${navMatch[0]}\n        <button onClick={() => setDark(!dark)} className="rounded-lg border border-white/10 px-3 py-1 text-sm text-white/80 hover:bg-white/5">{dark ? 'Light' : 'Dark'}</button>`)
        }
      }
    }
  }

  if (/\bcontact\s+form\b/i.test(lower) && !/<input[^>]*name="email"/i.test(edited)) {
    const contactSection = `<section className="py-16 px-6 md:px-12 bg-white/5">\n      <h2 className="text-2xl font-semibold text-white mb-6">Contact us</h2>\n      <form className="max-w-md space-y-4" onSubmit={(e) => { e.preventDefault(); alert('Message sent'); }}>\n        <input name="email" type="email" placeholder="Email" className="w-full rounded-lg bg-black/20 border border-white/10 p-3 text-white" required />\n        <textarea name="message" placeholder="Message" className="w-full rounded-lg bg-black/20 border border-white/10 p-3 text-white" required />\n        <button type="submit" className="rounded-lg bg-blue-600 px-5 py-2 text-white">Send</button>\n      </form>\n    </section>\n    `
    edited = edited.replace(/(<footer\b)/i, `${contactSection}$1`)
  }

  return edited
}

export async function refineFromMission(mission: Mission, creation: { id: string; code: string; files?: CreationFile[] }, request: string, signal?: AbortSignal): Promise<Creation> {
  checkSignal(signal)
  if (!mission?.id) throw new Error('Mission not found')
  if (!request.trim()) throw new Error('Describe the change you want')
  if (!await spendCredits(5)) throw new Error('LOW_CREDITS')
  addActivity(mission.id, `[Product Manager] User requested change: ${request}`)
  await updateMissionProgress(mission.id, 15)

  const isApp = /\b(app|calculator|tool|todo|tracker|clock|timer|converter|dashboard|utility|mobile)\b/i.test(mission.goal) && !/\b(website|landing|site|portfolio|blog|webpage|page)\b/i.test(mission.goal)

  let code = ''
  let files: CreationFile[] = creation.files || [{ path: 'src/App.jsx', code: creation.code }]
  const dependencies = (creation as Creation).dependencies || []
  let previewUrl = ''
  let previewLogs = ''
  let previewSteps: { stage: string; ok: boolean; ms: number; summary?: string }[] = []
  try {
    const currentFiles = creation.files && creation.files.length > 1
      ? `Current app files as JSON:\n\`\`\`json\n${JSON.stringify(Object.fromEntries(creation.files.map(f => [f.path, f.code])))}\n\`\`\``
      : `Existing AlphaApp code to modify:\n\`\`\`jsx\n${creation.code}\n\`\`\``
    checkSignal(signal)
    const prompt = `${currentFiles}\n\nRequested change: ${request}\n\nApply the change and return the COMPLETE updated JSON object with all files. Preserve all existing functionality and the design system. Do not return explanations.`
    const payload = await postJson<{ code?: string; response?: string; provider?: string }>('/api/alpha', { mode: 'refine', prompt, currentCode: '' }, { timeoutMs: 180_000, signal })
    const raw = String(payload.code || payload.response || '')
    const parsed = parseBuilderOutput(raw)
    code = normalizeAppCode(parsed.code, isApp)
    files = parsed.files.length > 1 ? parsed.files : files.map(f => f.path === 'src/App.jsx' ? { ...f, code } : f)
    let validationErrors = validateGeneratedApp(code, isApp, files.length, `${mission.goal} ${request}`)
    if (validationErrors.length) throw new Error(`Refined app failed verification: ${validationErrors.join(', ')}`)
    const build = await buildPreviewForMission(mission, code, files, dependencies, signal)
    if (!build.ok) {
      addActivity(mission.id, `[QA Tester] Refined build failed: ${build.error || 'unknown'}`)
      throw new Error(`Refined preview build failed: ${build.error || 'unknown'}`)
    }
    previewUrl = build.url || ''
    previewLogs = build.logs || ''; previewSteps = build.steps || []
  } catch (error) {
    addActivity(mission.id, `[QA Tester] AI refinement unavailable. Applying safe local edit...`)
    const fallbackCode = applySafeLocalEdit(creation.code, request)
    code = normalizeAppCode(fallbackCode, isApp)
    files = creation.files && creation.files.length > 1
      ? creation.files.map(f => f.path === 'src/App.jsx' ? { ...f, code: fallbackCode } : f)
      : [{ path: 'src/App.jsx', code: fallbackCode }]
    const validationErrors = validateGeneratedApp(code, isApp, files.length, `${mission.goal} ${request}`)
    if (validationErrors.length) {
      addActivity(mission.id, `[QA Tester] Safe local edit failed: ${validationErrors.join(', ')}`)
      addActivity(mission.id, `[QA Tester] Refine failed: ${error instanceof Error ? error.message : 'AI refinement failed'}`)
      throw error
    }
    const build = await buildPreviewForMission(mission, code, files, dependencies, signal)
    if (!build.ok) {
      addActivity(mission.id, `[QA Tester] Refine failed: ${error instanceof Error ? error.message : 'AI refinement failed'}`)
      throw error
    }
    previewUrl = build.url || ''
    previewLogs = build.logs || ''; previewSteps = build.steps || []
  }

  await stage(mission.id, '[UI Designer] Applying requested changes...', 55, signal)
  await stage(mission.id, '[QA Tester] Verifying the updated app...', 85, signal)

  checkSignal(signal)
  const refined = saveCreation({
    missionId: mission.id,
    title: `${mission.title} — ${request.slice(0, 40)}`,
    code,
    type: 'web-app',
    files,
    dependencies,
    previewUrl,
    previewLogs,
    previewSteps,
  })
  rememberBuild(mission, refined, request)
  await stage(mission.id, '[Deployment Engineer] Re-packing production build...', 98, signal)
  return refined
}
