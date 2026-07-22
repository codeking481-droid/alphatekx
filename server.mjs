import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { schedule } from 'node-cron'
import { execSync } from 'node:child_process'

import { fallbackAlphaBuilder } from './alphaFallback.mjs'
import { extractPlan, isPlatformPrompt } from './server/alphaPlatformBuilder.mjs'
import { buildPreviewProject, servePreviewBuild } from './server/previewBuild.mjs'
import { marketplaceHandler, fulfillMarketplaceOrder } from './server/marketplace.mjs'
import { getRecords, getRecord, createRecord, updateRecord, deleteRecord, appEntitiesMigrationSql } from './server/appData.mjs'
import { createAlphaBrain } from './server/alphaBrain.mjs'
import { buildCapabilityPlan, detectCapability, isSupportedAction } from './server/automation/capabilityRegistry.mjs'
import { createConversationEngine } from './server/alpha/conversationEngine.mjs'
import * as providerHealth from './server/alpha/providerHealth.mjs'
import * as billing from './server/billing.mjs'

function loadEnv() {
  for (const filename of ['.env.local', '.env']) {
    try {
      for (const line of fs.readFileSync(filename, 'utf8').split(/\r?\n/)) {
        const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
        if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim()
      }
    } catch {}
  }
}
loadEnv()

const port = Number(process.env.PORT || 3001)
const root = path.dirname(fileURLToPath(import.meta.url))
const distRoot = path.resolve(root, 'dist')

function buildDistIfNeeded() {
  if (process.env.NODE_ENV !== 'production' && !process.env.RENDER && !process.env.PORT) return
  try {
    process.stdout.write('[startup] Building production assets...\n')
    execSync('npm run build', { cwd: root, stdio: 'pipe', timeout: 120_000 })
    process.stdout.write('[startup] Production assets built.\n')
  } catch (err) {
    process.stdout.write(`[startup] Build skipped/failed: ${err instanceof Error ? err.message : String(err)}\n`)
  }
}
buildDistIfNeeded()

const deploymentsDir = path.resolve(root, 'deployed')
const previewsDir = path.resolve(root, 'data', 'previews')
const dataDir = path.resolve(root, 'data')
const usersFile = path.resolve(dataDir, 'users.json')
const activityFile = path.resolve(dataDir, 'activity.json')
const integrationsFile = path.resolve(dataDir, 'integrations.json')
const agentsFile = path.resolve(dataDir, 'agents.json')
const agentExecutionsFile = path.resolve(dataDir, 'agent-executions.json')
const agentLogsFile = path.resolve(dataDir, 'agent-logs.json')
try { fs.mkdirSync(deploymentsDir, { recursive: true }) } catch {}
try { fs.mkdirSync(previewsDir, { recursive: true }) } catch {}
try { fs.mkdirSync(dataDir, { recursive: true }) } catch {}

const schedulerState = { lastRun: null, nextRun: null, activeAgents: 0, startedAt: new Date().toISOString(), uptime: () => Math.floor((Date.now() - new Date(schedulerState.startedAt).getTime()) / 1000) }
const allowedOrigins = new Set(['https://alphatekx.name.ng', 'https://www.alphatekx.name.ng', 'http://localhost:5173', `http://localhost:${port}`])
function isAllowedOrigin(origin) {
  if (!origin) return false
  if (allowedOrigins.has(origin)) return true
  try {
    const hostname = new URL(origin).hostname
    return hostname.endsWith('.alphatekx.name.ng') || hostname === 'alphatekx.name.ng'
  } catch { return false }
}

const applyCors = (req, res) => {
  const origin = String(req.headers.origin || '')
  if (isAllowedOrigin(origin)) res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Local-User, X-Local-User-Id, X-Local-User-Email')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
}
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-XSS-Protection': '0',
}
function addSecurityHeaders(res) {
  for (const [k, v] of Object.entries(securityHeaders)) res.setHeader(k, v)
}
const json = (res, status, body, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(body)) }
const readBody = (req) => new Promise((resolve, reject) => {
  let raw = ''
  req.on('data', chunk => { raw += chunk; if (raw.length > 1_000_000) reject(new Error('Request too large')) })
  req.on('end', () => { try { resolve(JSON.parse(raw || '{}')) } catch { reject(new Error('Invalid JSON')) } })
  req.on('error', reject)
})
const readRawBody = (req) => new Promise((resolve, reject) => {
  const chunks = []
  req.on('data', chunk => { chunks.push(chunk); if (chunks.reduce((s, c) => s + c.length, 0) > 5_000_000) reject(new Error('Request too large')) })
  req.on('end', () => resolve(Buffer.concat(chunks)))
  req.on('error', reject)
})
const fetchJson = async (url, options, timeout = 60000) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error?.message || `Provider HTTP ${response.status}`)
    return data
  } finally { clearTimeout(timer) }
}

const fetchText = async (url, options, timeout = 60000) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    return await response.text()
  } finally { clearTimeout(timer) }
}

async function duckDuckGoSearch(query) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&t=alphatekx`
  try {
    const text = await fetchText(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, 15000)
    const data = JSON.parse(text)
    const results = []
    if (data.Abstract && data.Heading) {
      results.push({ title: data.Heading, url: data.AbstractURL || data.OfficialWebsite || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`, snippet: data.Abstract })
    }
    if (data.OfficialWebsite) {
      results.push({ title: 'Official site', url: data.OfficialWebsite, snippet: `Official website for ${data.Heading || query}` })
    }
    if (Array.isArray(data.Results)) {
      for (const item of data.Results) {
        if (item.FirstURL && item.Text) results.push({ title: stripHtml(item.Result) || item.Text, url: item.FirstURL, snippet: item.Text })
      }
    }
    if (Array.isArray(data.RelatedTopics)) {
      for (const item of data.RelatedTopics) {
        if (item.FirstURL && item.Text) {
          const snippet = item.Text.includes(' - ') ? item.Text.split(' - ').slice(1).join(' - ') : item.Text
          const title = item.Text.split(' - ')[0]
          results.push({ title, url: item.FirstURL, snippet })
        }
      }
    }
    return results.slice(0, 8)
  } catch (error) { return [] }
}

function extractSearchQuery(prompt) {
  const patterns = [
    /search (?:the web |the internet |online )?for (.+)/i,
    /search (?:the web |the internet |online )?(.+)/i,
    /(?:find|look up|what is|who is|latest on|news about|research|browse) (.+)/i,
  ]
  for (const pattern of patterns) {
    const match = prompt.match(pattern)
    if (match && match[1]) return match[1].trim()
  }
  return prompt.replace(/\b(search|the|web|internet|for|about|latest|news|look up|research online|browse)\b/gi, ' ').replace(/\s+/g, ' ').trim()
}

function stripHtml(html) {
  return html?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || ''
}

const firstKey = (name) => process.env[`${name}_1`] || process.env[name] || ''

const DEFAULT_PROVIDER_ORDER = 'flatkey,openai,qwen,kimi,minimax,groq'

function getProviderOrder() {
  return (process.env.BUILDER_PROVIDER_ORDER || DEFAULT_PROVIDER_ORDER)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

function getProviderKey(name) {
  if (name === 'qwen') return firstKey('QWEN_API_KEY') || process.env.DASHSCOPE_API_KEY || ''
  if (name === 'flatkey') return firstKey('FLATKEY_API_KEY') || firstKey('FLATKEY_AI_KEY') || process.env.FLATKEY_API_KEY || ''
  if (name === 'kimi') return firstKey('MOONSHOT_API_KEY') || firstKey('KIMI_API_KEY') || process.env.KIMI_API_KEY || ''
  if (name === 'minimax') return firstKey('MINIMAX_API_KEY') || process.env.MINIMAX_API_KEY || ''
  if (name === 'openai') return firstKey('OPENAI_API_KEY') || ''
  if (name === 'groq') return firstKey('GROQ_API_KEY') || ''
  return ''
}

async function callProvider(name, messages, builder = false, jsonMode = false, maxTokensOverride = 0, modelOverride = '') {
  const key = getProviderKey(name)
  if (!key) {
    providerHealth.recordProviderResult(name, false, `${name} key not configured`, 0)
    throw new Error(`${name} key not configured`)
  }
  const providerDefaults = { qwen: 6000, kimi: 32000, minimax: 24000, flatkey: 16000, openai: 16000, groq: 8000 }
  let maxTokens = maxTokensOverride > 0
    ? maxTokensOverride
    : Number(process.env[`${name.toUpperCase()}_MAX_TOKENS`]) || providerDefaults[name] || (builder ? 32000 : 2500)
  const temperature = builder ? 0.2 : 0.5
  const responseFormat = jsonMode ? { response_format: { type: 'json_object' } } : {}
  const timeout = builder ? 180000 : 60000
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }
  let data
  const start = Date.now()
  try {
    if (name === 'qwen') {
      const model = modelOverride || process.env.QWEN_MODEL || 'qwen3.7-plus'
      data = await fetchJson('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', { method: 'POST', headers, body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, ...responseFormat }) }, timeout)
    } else if (name === 'flatkey') {
      const model = modelOverride || process.env.FLATKEY_MODEL || 'gpt-4o'
      data = await fetchJson('https://router.flatkey.ai/v1/chat/completions', { method: 'POST', headers, body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, ...responseFormat }) }, timeout)
    } else if (name === 'kimi') {
      const model = modelOverride || process.env.KIMI_MODEL || 'kimi-k3'
      const body = { model, messages, max_completion_tokens: maxTokens, ...responseFormat }
      if (model.startsWith('kimi-k3')) body.reasoning_effort = 'max'
      data = await fetchJson('https://api.moonshot.ai/v1/chat/completions', { method: 'POST', headers, body: JSON.stringify(body) }, timeout)
    } else if (name === 'minimax') {
      const model = modelOverride || process.env.MINIMAX_MODEL || 'MiniMax-M3'
      data = await fetchJson('https://api.minimax.io/v1/chat/completions', { method: 'POST', headers, body: JSON.stringify({ model, messages, temperature, max_completion_tokens: maxTokens, ...responseFormat }) }, timeout)
    } else if (name === 'openai') {
      const model = modelOverride || process.env.OPENAI_MODEL || (builder ? 'gpt-4o' : 'gpt-4o-mini')
      const modern = /^(gpt-4o|gpt-5|o[1-9])/.test(model)
      const body = { model, messages, ...responseFormat, ...(modern ? { max_completion_tokens: maxTokens } : { temperature, max_tokens: maxTokens }) }
      data = await fetchJson('https://api.openai.com/v1/chat/completions', { method: 'POST', headers, body: JSON.stringify(body) }, timeout)
    } else if (name === 'groq') {
      const model = modelOverride || process.env.GROQ_MODEL || 'llama-3.1-8b-instant'
      try {
        data = await fetchJson('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers, body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, ...responseFormat }) }, timeout)
      } catch (err) {
        const msg = String(err?.message || err)
        if (/tokens per day|rate limit reached/i.test(msg) && model !== 'llama-3.1-8b-instant') {
          data = await fetchJson('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers, body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages, temperature, max_tokens: maxTokens, ...responseFormat }) }, timeout)
        } else {
          throw err
        }
      }
    } else {
      throw new Error(`Unknown provider ${name}`)
    }
    const content = String(data.choices?.[0]?.message?.content || '').trim()
    if (!content) throw new Error('No content in provider response')
    providerHealth.recordProviderResult(name, true, null, Date.now() - start)
    return { provider: name, data }
  } catch (error) {
    providerHealth.recordProviderResult(name, false, error, Date.now() - start)
    throw error
  }
}
const currencyPair = async (from, to, amount) => {
  const apiKey = firstKey('EXCHANGE_RATE_API_KEY')
  if (apiKey) {
    const data = await fetchJson(`https://v6.exchangerate-api.com/v6/${apiKey}/pair/${encodeURIComponent(from)}/${encodeURIComponent(to)}/${amount}`, {})
    if (data.result !== 'success') throw new Error(data['error-type'] || 'Currency conversion failed')
    return { from, to, amount, rate: data.conversion_rate, result: data.conversion_result, updatedAt: data.time_last_update_utc }
  }
  const data = await fetchJson(`https://api.exchangerate-api.com/v4/latest/${encodeURIComponent(from)}`, {})
  const rate = data.rates?.[to]
  if (!rate || !Number.isFinite(rate)) throw new Error('Currency conversion not available for this pair')
  return { from, to, amount, rate, result: Number((amount * rate).toFixed(6)), updatedAt: data.date || new Date().toISOString() }
}

async function runGeneralTool(prompt) {
  if (/\b(clock|wall clock|live clock|current time|what time|time now)\b/i.test(prompt)) return { tool: 'clock', text: 'Here is your live local time.' }
  if (/\b(currency|exchange rate|convert money|currency converter)\b/i.test(prompt) || /[\d,.]+\s*[A-Z]{3}\s+(?:to|in)\s+[A-Z]{3}/i.test(prompt)) {
    const match = prompt.toUpperCase().match(/([\d,.]+)\s*([A-Z]{3})\s+(?:TO|IN)\s+([A-Z]{3})/)
    if (!match) return { tool: 'currency', text: 'Use the live converter below.' }
    const amount = Number(match[1].replace(/,/g, ''))
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a valid currency amount')
    return { tool: 'currency', text: 'Live conversion result.', currency: await currencyPair(match[2], match[3], amount) }
  }
  if (/\b(youtube|videos?|watch|tutorial)\b/i.test(prompt)) {
    const apiKey = firstKey('YOUTUBE_API_KEY')
    if (!apiKey) throw new Error('YouTube search is not configured')
    const requested = Number(prompt.match(/\b(\d+)\s+(?:youtube\s+)?videos?\b/i)?.[1] || 1)
    const count = Math.min(5, Math.max(1, requested))
    const query = prompt.replace(/\b(show|find|load|play|youtube|videos?|watch|tutorial|me|please)\b/gi, ' ').replace(/\s+/g, ' ').trim() || prompt
    const data = await fetchJson(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${count}&q=${encodeURIComponent(query)}&key=${apiKey}`, {})
    const videos = (data.items || []).map(item => ({ id: item.id.videoId, title: item.snippet.title, channel: item.snippet.channelTitle, thumbnail: item.snippet.thumbnails?.medium?.url, url: `https://www.youtube.com/watch?v=${item.id.videoId}` }))
    return { tool: 'youtube', text: videos.length ? `I found ${videos.length} video${videos.length === 1 ? '' : 's'}.` : 'No matching YouTube video was found.', videos }
  }
  if (/\b(search (?:the )?(?:web|internet)|look up|latest|news|research online|browse)\b/i.test(prompt)) {
    const apiKey = firstKey('TAVILY_API_KEY')
    if (apiKey) {
      const data = await fetchJson('https://api.tavily.com/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: apiKey, query: prompt, search_depth: 'advanced', max_results: 5, include_answer: true }) })
      return { tool: 'search', text: data.answer || 'Here is what I found.', sources: (data.results || []).map(item => ({ title: item.title, url: item.url, content: item.content })) }
    }
    const query = extractSearchQuery(prompt)
    const results = await duckDuckGoSearch(query)
    if (!results.length) throw new Error('No live web results found.')
    return { tool: 'search', text: `Here is what I found on the live web for "${query}".`, sources: results.map(item => ({ title: item.title, url: item.url, content: item.snippet })) }
  }
  return null
}

export async function handleAlpha(prompt, mode = 'chat', currentCode = '', requestedProvider = '') {
  const refine = mode === 'refine'
  const builder = mode === 'builder' || refine
  if (mode === 'chat') {
    const toolResult = await runGeneralTool(prompt)
    if (toolResult) return toolResult
  }
  if (!prompt.trim()) throw new Error('Prompt is required')
  const allOrder = getProviderOrder().filter((name) => getProviderKey(name) && providerHealth.canAttempt(name))
  const order = requestedProvider
    ? [requestedProvider].filter((name) => allOrder.includes(name) && getProviderKey(name))
    : allOrder
  if (order.length === 0) {
    if (builder) return { code: fallbackAlphaBuilder(prompt), provider: 'fallback' }
    throw new Error('No AI provider is configured. Add OPENAI_API_KEY, GROQ_API_KEY, QWEN_API_KEY, KIMI_API_KEY, MINIMAX_API_KEY, or FLATKEY_API_KEY.')
  }
  const founderName = 'Daniel Thompson'
  const fullAppBuilderPrompt = `You are AlphaTekX Builder — a world-class Senior Full-Stack Engineer at Vercel + Linear.

YOUR JOB: Build COMPLETE, PRODUCTION-READY, FULL websites and apps — NOT demos, NOT toys.

RULES:
- ALWAYS build FULL multi-view apps with REAL features. Minimum 5-7 distinct views/pages unless the user explicitly says "simple demo". If the prompt is a large platform / OS (e.g. NeuralOS, business operating system, all-in-one SaaS), generate 6-10 core modules first (Dashboard, Projects/CRM, Analytics, Chat, Calendar, Files, Automations, Settings, etc.) and use the AlphaUI library for consistency.
- If user says "Build e-commerce" → Build: Home, Shop, Product Detail, Cart, Checkout, User Dashboard, Admin Dashboard.
- If user says "Build POS" → Build: Login/Dashboard, Make Sale, Inventory (50+ items), Customers, Reports/Charts, Settings, Receipt Print.
- If user says "Build blog" → Build: Home feed, Single post view, Write/Editor view, Categories, Profile, Search.
- If user says "Build chat" → Build: Thread list, Message pane, New thread, Search, real-time-style UI.
- Architecture: React 18 + Tailwind CSS only. All icons must be inline SVG. All animations CSS transitions. NO external packages are bundled, so do NOT import lucide-react, framer-motion, recharts, zustand, or react-router-dom.
- Generate 8-15 FILES minimum. Each main page/component should be 150+ lines of real code. Total output should be 1000+ lines across all files. For very large platforms, generate 10-15 files and use AlphaUI components to keep each module concise.
- AlphaUI component library: A global window.AlphaUI object is injected by the runtime. You may use these React components in JSX: <AlphaUI.Sidebar items={...} current={...} onChange={...} />, <AlphaUI.Topbar title={...} />, <AlphaUI.Card title={...} />, <AlphaUI.StatCard label={...} value={...} change={...} />, <AlphaUI.Button />, <AlphaUI.Input />, <AlphaUI.Table columns={...} rows={...} />, <AlphaUI.Kanban columns={...} cards={...} onMove={...} />, <AlphaUI.Chart type="bar" data={...} labels={...} />, <AlphaUI.Modal open={...} onClose={...} />, <AlphaUI.Tabs tabs={...} active={...} onChange={...} />, <AlphaUI.Search />, <AlphaUI.Avatar name={...} />, <AlphaUI.Badge />, <AlphaUI.Empty />, <AlphaUI.Skeleton />. Do NOT redefine these components; they are already available as global JSX tags via window.AlphaUI.
- AlphaUI prop shapes: Sidebar items must be an array of objects {id, label, icon?} (never a string array). Table columns must be an array of objects {key, title, render?} and rows an array of arrays or objects. Avatar accepts name and optional image/src.
- Defensive code: always guard nested access with optional chaining and fallbacks. For example use (currentUser || {}).name, user?.image || '', files?.[0]?.name || ''. Never access .image, .url, .name, or any nested property on a possibly undefined object without a fallback.
- UI: World-class like Linear/Stripe — dark premium (#0A0A0A bg, #151515 cards, one accent color), glassmorphism, rounded-2xl, responsive mobile+desktop, loading states, toast notifications, dark mode toggle, localStorage persistence.
- Data: Realistic mock data (20+ products/posts/customers), search, filter, sort. Every button works, every form validates.
- Backend: Use the global AlphaAPI object for real CRUD against the AlphaTekX backend: AlphaAPI.get('products'), AlphaAPI.post('products', data), AlphaAPI.put('products', id, data), AlphaAPI.del('products', id). Do not redefine AlphaAPI; it is injected by the Builder preview and by the deployed app runtime. Keep a local cache in React state and refresh after every create/update/delete.
- Navigation: Use a currentView state and a setView function. Define a 'views' object mapping lowercase view names (e.g. home, shop, cart, admin, dashboard, settings) to the component that should render. Render the active view based on currentView. Provide a sidebar or topbar where every page button has a 'data-view' attribute equal to the lowercase view name (e.g. data-view="home"). Clicking a button calls setView(viewName). Also listen to window.location.hash on load and on the 'hashchange' event: if the hash matches a known view name, call setView(hashValue) so the Builder preview dropdown and external links can drive navigation.
- Code quality: Clean, commented, production-ready, no TODOs, no lorem ipsum, no placeholder text, no markdown code fences inside file strings, no trailing commas.

OUTPUT FORMAT - STRICT JSON:
Return a single valid JSON object (no markdown fences) with this exact shape:
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

FILE RULES:
- Do NOT use import/export statements. All functions share the same global scope, so define helpers in data/lib files first, then components, then pages, then App.jsx.
- App.jsx must define a function named AlphaApp (or App) and end with exactly: ReactDOM.createRoot(document.getElementById('root')).render(<AlphaApp />);
- Use React.useState, React.useEffect, React.useMemo, React.useReducer for state management. Define helper functions and components before they are used.
- Use window.localStorage for UI state persistence (it is patched in the preview).
- Use AlphaAPI for real data CRUD. Keep a local state cache and refresh the relevant list after every post/put/del.
- The "dependencies" field is for documentation only; do not import those packages.
- Use only https://images.unsplash.com/photo-... or https://api.dicebear.com for images; never placeholder.com.
- NEVER put an object directly inside JSX. Only render strings, numbers, booleans, arrays, or React elements.

You are AlphaTekX. You turn ideas into reality. AlphaTekX was founded and is led by ${founderName}, Founder and CEO. Build something users will love and pay for.`
  const system = builder ? fullAppBuilderPrompt : 'You are AlphaTekX, a precise creation and productivity assistant. Help the user build, learn, research, plan, and solve problems. Be honest about missing tools and never invent completed actions.'
  const userContent = refine && currentCode.trim()
    ? `Existing AlphaApp code to modify:\n\`\`\`jsx\n${currentCode}\n\`\`\`\n\nRequested change: ${prompt}\n\nApply the change and return the COMPLETE updated JSON object with all files. Preserve all existing functionality, the design system, and the exact output format. Do not return explanations.`
    : prompt
  const messages = [{ role: 'system', content: system }, { role: 'user', content: userContent }]
  let provider = ''
  let content = ''
  let lastError = null
  const validBuilderOutput = (value) => {
    try {
      const json = JSON.parse(value.replace(/```json\s*([\s\S]*?)```/i, '$1').trim())
      if (!json.files || typeof json.files !== 'object' || Object.keys(json.files).length < 3) return false
      const firstFile = Object.values(json.files)[0]
      if (typeof firstFile !== 'string') return false
      return /function\s+[A-Z]|const\s+[A-Z][A-Za-z0-9_]*\s*=/.test(value) && /useState|useReducer/.test(value) && /onClick|onSubmit|onChange/.test(value)
    } catch { return false }
  }
  for (const name of order) {
    try {
      const result = await callProvider(name, messages, builder, builder)
      const candidate = String(result.data.choices?.[0]?.message?.content || '').trim()
      if (!candidate) continue
      if (builder && !validBuilderOutput(candidate)) continue
      content = candidate
      provider = result.provider
      break
    } catch (error) {
      lastError = error
      console.error(`[AlphaTekX] Provider ${name} failed:`, error instanceof Error ? error.message : error)
    }
  }
  if (!content) {
    if (builder) {
      console.error('[AlphaTekX] All providers failed, falling back to deterministic builder:', lastError instanceof Error ? lastError.message : lastError)
      return { code: fallbackAlphaBuilder(prompt), provider: 'fallback' }
    }
    throw lastError || new Error('No AI provider was able to respond.')
  }
  return builder ? { code: content, provider } : { text: content, provider }
}

async function handlePlan(prompt) {
  const system = `You are AlphaTekX Product Architect. Analyze the user's request and return a JSON plan for a real app or website. The plan must be specific to the user's topic — do not default to a generic OS/dashboard unless they explicitly ask for an operating system.
Return JSON with this shape:
{
  "title": "short app title",
  "description": "one-line summary",
  "modules": [
    { "id": "dashboard", "name": "Dashboard", "purpose": "...", "files": ["src/pages/Dashboard.jsx"] }
  ]
}
Modules should cover the core screens the user needs (4-8 modules). Use short kebab-case ids. The "files" array lists the main files to create for that module.`
  try {
    const plan = await callLLMJSON(system, `User request: ${prompt}\n\nReturn a concise JSON plan.`) || {}
    if (plan.modules && Array.isArray(plan.modules) && plan.modules.length > 0) return plan
  } catch (error) {
    console.error('[AlphaTekX] AI plan failed:', error instanceof Error ? error.message : error)
  }
  return extractPlan(prompt)
}

async function callLLMJSON(systemPrompt, userPrompt) {
  const order = getProviderOrder().filter((name) => getProviderKey(name) && providerHealth.canAttempt(name))
  if (order.length === 0) throw new Error('No AI provider configured or all providers are temporarily unavailable. Add OPENAI_API_KEY, GROQ_API_KEY, QWEN_API_KEY, KIMI_API_KEY, MINIMAX_API_KEY, or FLATKEY_API_KEY.')
  const messages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }]
  let lastError = null
  for (const name of order) {
    try {
      const { data } = await callProvider(name, messages, false, true)
      const text = String(data.choices?.[0]?.message?.content || '{}').trim()
      const cleaned = text.replace(/```json\s*([\s\S]*?)```/i, '$1').trim()
      return JSON.parse(cleaned || '{}')
    } catch (error) {
      lastError = error
      console.error(`[AlphaTekX] callLLMJSON provider ${name} failed:`, error instanceof Error ? error.message : error)
    }
  }
  throw lastError || new Error('No AI provider was able to respond.')
}

function getRoleProviderOrder(role, fallbackOrder) {
  const env = process.env[`ALPHA_${role.toUpperCase()}_PROVIDER`] || process.env[`AI_ROLE_${role.toUpperCase()}_PROVIDER`] || process.env[`AI_${role.toUpperCase()}_PROVIDER`]
  if (env) {
    const configured = env.split(',').map(s => s.trim().toLowerCase()).filter(Boolean).filter(name => getProviderKey(name))
    if (configured.length) return configured
  }
  return fallbackOrder || getProviderOrder().filter(name => getProviderKey(name))
}

function getRoleModel(role, provider, defaultModel = '') {
  return process.env[`ALPHA_${role.toUpperCase()}_MODEL`] || process.env[`AI_ROLE_${role.toUpperCase()}_MODEL`] || process.env[`AI_${role.toUpperCase()}_MODEL`] || process.env[`${provider.toUpperCase()}_MODEL`] || defaultModel
}

async function callLLMForRole(role, systemPrompt, userPrompt, { jsonMode = true, maxTokens = 0, fallbackOrder = null } = {}) {
  const order = getRoleProviderOrder(role, fallbackOrder)
  if (order.length === 0) throw new Error('No AI provider configured or all providers are temporarily unavailable. Add OPENAI_API_KEY, GROQ_API_KEY, QWEN_API_KEY, KIMI_API_KEY, MINIMAX_API_KEY, or FLATKEY_API_KEY.')
  const messages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }]
  let lastError = null
  for (const name of order) {
    try {
      const model = getRoleModel(role, name)
      const start = Date.now()
      const { provider, data } = await callProvider(name, messages, false, jsonMode, maxTokens, model)
      const latencyMs = Date.now() - start
      const raw = String(data.choices?.[0]?.message?.content || (jsonMode ? '{}' : '')).trim()
      const cleaned = raw.replace(/```json\s*([\s\S]*?)```/i, '$1').trim()
      const result = jsonMode ? JSON.parse(cleaned || '{}') : cleaned
      const usage = data.usage || {}
      return { result, provider, model: data.model || model, usage, role, latencyMs, generationMode: 'model' }
    } catch (error) {
      lastError = error
      console.error(`[AlphaTekX] callLLMForRole ${role} provider ${name} failed:`, error instanceof Error ? error.message : error)
    }
  }
  throw lastError || new Error(`No AI provider was able to respond for role ${role}.`)
}

function buildCronFromIntent(input) {
  const lower = input.toLowerCase()
  const intervalMatch = lower.match(/every\s+(\d+)\s*minutes?/)
  if (intervalMatch) return `*/${intervalMatch[1]} * * * *`
  if (lower.includes('minute')) return '* * * * *'
  if (lower.includes('hour')) return '0 * * * *'
  if (lower.includes('morning') || lower.includes('8 am') || lower.includes('8:00')) return '0 8 * * *'
  if (lower.includes('evening') || lower.includes('6 pm') || lower.includes('6:00')) return '0 18 * * *'
  if (lower.includes('noon') || lower.includes('12 pm')) return '0 12 * * *'
  if (lower.includes('midnight') || lower.includes('12 am')) return '0 0 * * *'
  if (lower.includes('daily')) return '0 8 * * *'
  if (lower.includes('weekly')) return '0 9 * * 1'
  if (lower.includes('monthly')) return '0 9 1 * *'
  return '0 8 * * *'
}

function getPartsInTimeZone(date, timeZone = 'UTC') {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date)
    return Object.fromEntries(parts.map(p => [p.type, p.value]))
  } catch {
    return null
  }
}

function localDateFromParts(parts) {
  return new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`)
}

function timezoneOffsetMs(utcDate, timeZone) {
  const parts = getPartsInTimeZone(utcDate, timeZone)
  if (!parts) return 0
  return localDateFromParts(parts).getTime() - utcDate.getTime()
}

function localToUtc(localDate, timeZone) {
  const naiveUtc = Date.UTC(
    localDate.getFullYear(),
    localDate.getMonth(),
    localDate.getDate(),
    localDate.getHours(),
    localDate.getMinutes(),
    localDate.getSeconds()
  )
  let utc = new Date(naiveUtc)
  for (let i = 0; i < 3; i++) {
    const offset = timezoneOffsetMs(utc, timeZone)
    const adjusted = new Date(naiveUtc - offset)
    if (Math.abs(adjusted.getTime() - utc.getTime()) < 1000) return adjusted
    utc = adjusted
  }
  return utc
}

function computeNextRun(cron, from = new Date(), timeZone = 'UTC') {
  const [minute, hour, day, month] = cron.split(' ').map(s => s.trim())
  const dailyAtTime = minute !== '*' && hour !== '*' && day === '*' && month === '*'
  if (dailyAtTime && timeZone && timeZone !== 'UTC') {
    const parts = getPartsInTimeZone(from, timeZone)
    if (parts) {
      const localNow = localDateFromParts(parts)
      const target = new Date(localNow.getFullYear(), localNow.getMonth(), localNow.getDate(), parseInt(hour, 10), parseInt(minute, 10), 0)
      if (target <= localNow) target.setDate(target.getDate() + 1)
      return localToUtc(target, timeZone)
    }
  }
  const next = new Date(from.getTime() + 60_000)
  if (minute && minute.startsWith('*/')) {
    const step = parseInt(minute.slice(2), 10) || 1
    next.setMinutes(from.getMinutes() + (step - (from.getMinutes() % step) || step))
    next.setSeconds(0, 0)
  } else if (minute !== '*') {
    next.setMinutes(parseInt(minute, 10))
  }
  if (hour !== '*') next.setHours(parseInt(hour, 10))
  if (day !== '*') next.setDate(parseInt(day, 10))
  if (month !== '*') next.setMonth(parseInt(month, 10) - 1)
  if (next <= from) {
    if (minute && minute.startsWith('*/')) next.setMinutes(next.getMinutes() + (parseInt(minute.slice(2), 10) || 1))
    else if (hour !== '*') next.setDate(next.getDate() + 1)
    else next.setMinutes(next.getMinutes() + 1)
  }
  return next
}

function nextRunFromCronServer(cron, from = new Date(), timeZone = 'UTC') {
  return computeNextRun(cron, from, timeZone)
}

function nextRunFromCron(cron, from = new Date(), timeZone = 'UTC') {
  return computeNextRun(cron, from, timeZone)
}

async function generateActionContent(agent, action) {
  const prompt = String(action.params?.prompt || action.params?.text || action.params?.message || agent.description || 'a helpful update').trim()
  const role = String(agent.name || 'Alpha Agent')
  const topic = String(agent.description || prompt).slice(0, 200)
  const seed = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const system = `You are ${role}, a real automation assistant on AlphaTekX. Write a short, engaging, original message based on the user's request. The content must be different every time — reference the current moment, a fresh angle, or a new example. Return a JSON object with a single key "text" containing the message. Keep it friendly, professional, concise, and avoid hashtag spam.`
  const userPrompt = `Seed: ${seed}\nAutomation description: ${topic}\nOriginal instruction: ${prompt}\nWrite the content.`
  try {
    const result = await callLLMJSON(system, userPrompt)
    return String(result.text || result.message || result.content || prompt).trim()
  } catch { return `${String(topic).slice(0, 200)} — update at ${new Date().toLocaleString()}` }
}

function stripCDATA(value) { return String(value || '').replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '') }

async function researchTopic(topic) {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=en-US&gl=US&ceid=US:en`
    const rss = await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AlphaTekX)' } })).text()
    const item = rss.match(/<item>[\s\S]{0,4000}?<\/item>/i)?.[0] || ''
    if (item) {
      const title = stripCDATA(item.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '')
      const link = stripCDATA(item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '')
      const imageUrl = item.match(/<media:content[^>]*url="([^"]+)"/)?.[1] || ''
      const source = stripCDATA(item.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] || 'Google News')
      if (title) return { title, link, imageUrl, source }
    }
  } catch (err) { process.stdout.write(`[research] error: ${err instanceof Error ? err.message : err}\n`) }
  return { title: `Latest ${topic} update`, link: '', imageUrl: '', source: 'AlphaTekX' }
}

async function fetchImageForTopic(topic, existingImageUrl = '') {
  if (existingImageUrl) return existingImageUrl
  const clean = String(topic).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'alpha'
  try {
    const res = await fetch(`https://source.unsplash.com/800x600/?${encodeURIComponent(clean)}`, { redirect: 'follow' })
    if (res.ok && res.headers.get('content-type')?.startsWith('image/')) return res.url
  } catch {}
  return `https://picsum.photos/seed/${clean}/800/600`
}

async function buildPostFromResearch(agent, action, research) {
  const topic = String(action.params?.topic || agent.name || agent.description || 'news').slice(0, 120)
  const prompt = `Write a short, engaging social media post (max 220 chars of body, link can be separate) about this news. Include the link naturally if provided. News title: ${research.title}. Source: ${research.source}. Link: ${research.link}. Topic: ${topic}. Return JSON { "text": "..." }.`
  try {
    const result = await callLLMJSON('You are AlphaTekX social copywriter.', prompt)
    let text = String(result.text || '').trim()
    if (research.link && !text.includes(research.link)) text += `\n\n${research.link}`
    return text.slice(0, 1200)
  } catch {
    return `📰 ${research.title}${research.link ? `\n\nRead more: ${research.link}` : ''}`.trim().slice(0, 1200)
  }
}

async function enrichActionContent(agent, action) {
  const params = action.params || {}
  const desc = String(agent.description || agent.name || '')
  const needsResearch = params.research === true || params.research === 'true' || /news|search the internet|latest|trending|updates|what.*happening/i.test(desc)
  const needsImage = params.image === true || params.image === 'true' || /picture|image|photo|with a pic|including pictures|with an image/i.test(desc)
  if (!needsResearch && !needsImage) return action
  const topic = String(params.topic || params.query || params.prompt || agent.name || desc).slice(0, 100)
  const research = needsResearch ? await researchTopic(topic) : { title: '', link: '', imageUrl: '', source: '' }
  const imageUrl = needsImage ? await fetchImageForTopic(topic, research.imageUrl) : research.imageUrl
  let text = params.text || params.message || ''
  if (needsResearch) text = await buildPostFromResearch(agent, action, research)
  else if (!text) text = String(params.prompt || desc).slice(0, 1200)
  const updated = { ...params, text, message: text }
  if (imageUrl) {
    updated.imageUrl = imageUrl
    if (!text.includes(imageUrl)) {
      const separator = text ? '\n\n' : ''
      updated.text = `${text}${separator}${imageUrl}`
      updated.message = updated.text
    }
  }
  return { ...action, params: updated }
}

function makeUnsupportedAgent(prompt, reason, alternative) {
  return {
    id: randomUUID(),
    title: 'Unsupported automation',
    name: 'Unsupported automation',
    description: reason || 'That automation is not available right now.',
    originalRequest: prompt,
    interpretedGoal: '',
    trigger: { type: 'schedule', cron: '0 8 * * *', nextRun: null },
    actions: [],
    status: 'awaiting_information',
    approved: false,
    missing: [{ field: 'unsupported', step: 'Capability', connector: '', reason: alternative || 'Try a supported automation like a daily calendar summary email.' }],
    creditsNeeded: 0,
    creditsPerRun: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    executionHistory: [],
    successRate: 100,
    permissions: [],
    executionsDone: 0,
    executionsTotal: null,
  }
}

function finalizeAgentPlan(plan, prompt, user) {
  const now = new Date()
  const timezone = plan.timezone || plan.schedule?.timezone || user?.timezone || 'UTC'
  const cron = plan.trigger?.cron || '0 0 8 * * *'
  const nextRun = nextRunFromCronServer(cron, now, timezone).toISOString()
  const status = (plan.missing && plan.missing.length) ? 'awaiting_information' : 'awaiting_approval'
  const durationDays = plan.schedule?.durationDays || (plan.duration ? parseInt(String(plan.duration).replace(/\D/g, ''), 10) : null)
  const startDate = plan.startDate || plan.schedule?.startDate || now.toISOString().split('T')[0]
  const endDate = plan.endDate || plan.schedule?.endDate || (durationDays ? new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0] : undefined)
  let executionsTotal = plan.executionsTotal || null
  if (executionsTotal == null && durationDays && plan.schedule?.frequency === 'daily') executionsTotal = durationDays
  return {
    ...plan,
    id: plan.id || randomUUID(),
    title: plan.title || plan.name || 'New Automation',
    name: plan.name || plan.title || 'New Automation',
    originalRequest: plan.originalRequest || prompt,
    userId: user?.id,
    userEmail: user?.email,
    timezone,
    startDate,
    endDate,
    duration: plan.duration || (durationDays ? `${durationDays} days` : undefined),
    trigger: { type: plan.trigger?.type || 'schedule', cron, url: plan.trigger?.url, nextRun },
    nextRunAt: nextRun,
    schedule: plan.schedule || { cron, timezone },
    status,
    approved: status === 'awaiting_approval',
    createdAt: plan.createdAt || now.toISOString(),
    updatedAt: now.toISOString(),
    executionHistory: plan.executionHistory || [],
    successRate: plan.successRate ?? 100,
    executionsDone: plan.executionsDone || 0,
    executionsTotal,
    creditsNeeded: plan.creditsNeeded || plan.creditsPerRun || (plan.actions?.length || 1),
    creditsPerRun: plan.creditsPerRun || plan.creditsNeeded || (plan.actions?.length || 1),
    permissions: plan.requiredPermissions || plan.permissions || Array.from(new Set((plan.actions || []).map(a => a.connector))),
  }
}

async function parseAgentFromNL(prompt, user) {
  const userContext = user ? { id: user.id, email: user.email, timezone: user.timezone } : null
  const capabilityPlan = buildCapabilityPlan(prompt, userContext)
  if (capabilityPlan) {
    if (capabilityPlan.unsupported) return makeUnsupportedAgent(prompt, capabilityPlan.reason, capabilityPlan.alternative)
    return finalizeAgentPlan(capabilityPlan, prompt, user)
  }

  // LLM fallback for requests that are not matched by built-in capability patterns.
  const system = `You are Alpha, the intelligent automation engine for AlphaTekX. Your job is to understand a user's natural-language request and turn it into a clean, actionable workflow plan.

CORE BEHAVIOUR:
- Use simple language internally and externally. Avoid words like "payload", "webhook", "JSON", "endpoint" unless absolutely necessary.
- Ask only for missing information.
- Estimate credit cost transparently.
- If a required value is missing (e.g., recipient email, Telegram chat ID, Slack channel, phone number, spreadsheet ID, repo name, time), do NOT guess. Return it in the "missing" array.
- If the request asks for a service or action that is not in the VALID CONNECTORS list below, set "unsupported": true, give a short "reason", and suggest a supported "alternative".

WORKFLOW STRUCTURE:
- TRIGGER: when the automation starts (schedule, webhook, monitor).
- RETRIEVE: read from connected services when needed.
- AI REASONING: generate or summarize content when needed.
- ACTIONS: send emails/messages/posts, create calendar events, append rows, etc.

CREDIT RULES (per run):
- Read data from one service: 1 credit
- Send a message/post/email: 1 credit
- Basic AI summarization/generation: 2 credits
- Advanced AI generation or multi-platform publishing: add 1 credit per extra platform
- AI with research or image: +2 credits
- Return the total in "creditsNeeded" and a per-step breakdown in "creditsPerStep".

VALID CONNECTORS AND ACTIONS:
- gmail/email: send_email (to, subject, body)
- google_sheets: append_row (values), read_rows (spreadsheetId, sheetName)
- google_calendar/calendar: create_event (title, start, end), read_events (timeMin, timeMax), email_summary (to, timeZone)
- google_drive: upload_file (name, mimeType, content)
- github: create_issue (repo, title, body), summarize_commits (repo, branch)
- telegram/slack/discord/whatsapp: send_message (message, chatId/channel where needed)
- notion: create_page (title, content), append_block (pageId, content)
- supabase: insert_row (table, data), backup (table)
- paystack: verify_payment (reference)

RETURN ONLY A JSON OBJECT with these keys:
- name: short title (max 8 words)
- description: one-sentence summary
- unsupported?: true if the request is not supported
- reason?: short reason when unsupported
- alternative?: one-line suggestion when unsupported
- trigger: { type: "schedule" | "webhook" | "monitor", cron: string, url?: string, timezone?: string }
- actions: array of { connector, action, label, params }
- creditsNeeded: number
- executionsTotal: number or null
- creditsPerStep: array of { step: string, cost: number, reason: string }
- missing: array of { field: string, step: string, connector: string, reason: string } (empty if nothing is missing)

GUIDELINES:
- If the user says "send me" or "email me" without a platform, use connector "gmail" and params.to = ${user?.email || 'user email'}.
- For AI-generated content each run, set params.generate = true and params.prompt to the brief.
- For "search the internet", "news", "latest", set params.research = true and params.topic.
- For images/pictures, set params.image = true.
- If multiple social platforms are listed, create one action per platform.
- Cron examples: every 2 minutes = */2 * * * *; every 5 minutes = */5 * * * *; every morning 8 AM = 0 8 * * *; daily = 0 8 * * *; hourly = 0 * * * *.
- Return only valid JSON, no markdown.`
  try {
    const parsed = await callLLMJSON(system, prompt)
    if (!parsed || typeof parsed !== 'object') throw new Error('LLM did not return valid JSON')
    if (parsed.unsupported) return makeUnsupportedAgent(prompt, parsed.reason, parsed.alternative)
    let actions = Array.isArray(parsed.actions) ? parsed.actions : []
    const supportedActions = actions.filter(a => isSupportedAction(a.connector, a.action))
    if (!supportedActions.length) return makeUnsupportedAgent(prompt, 'No supported actions were found for this request.', 'Try a supported automation like a daily calendar summary email, sending an email, or posting to Telegram.')
    const processedActions = supportedActions.map(a => {
      const params = a.params && typeof a.params === 'object' ? a.params : {}
      if ((a.connector === 'gmail' || a.connector === 'email') && !params.to && user?.email) params.to = user.email
      if ((a.connector === 'gmail' || a.connector === 'email') && !params.subject) params.subject = String(parsed.name || 'Alpha Agent').slice(0, 100)
      return { connector: String(a.connector), action: String(a.action), label: String(a.label || `${a.action} ${a.connector}`), params }
    })
    const trigger = parsed.trigger || { type: 'schedule', cron: buildCronFromIntent(prompt) }
    const cron = String(trigger.cron || buildCronFromIntent(prompt))
    const daysMatch = prompt.match(/for\s+(\d+)\s*(?:days?|times?|posts?|runs?)/i)
    const executionsTotal = Number(parsed.executionsTotal) || (daysMatch ? Number(daysMatch[1]) || null : null)
    const creditsNeeded = Number(parsed.creditsNeeded) || (executionsTotal || processedActions.length || 1)
    const creditsPerStep = Array.isArray(parsed.creditsPerStep) ? parsed.creditsPerStep : []
    const missing = Array.isArray(parsed.missing) ? parsed.missing : []
    const computedMissing = inferMissingFields(processedActions, trigger, user)
    const allMissing = [...missing, ...computedMissing].filter((m, i, arr) => arr.findIndex(x => x.field === m.field && x.step === m.step && x.connector === m.connector) === i)
    const plan = {
      title: String(parsed.name || 'New Automation').slice(0, 60),
      name: String(parsed.name || 'New Automation').slice(0, 60),
      description: String(parsed.description || prompt).slice(0, 200),
      interpretedGoal: parsed.description || prompt,
      trigger: { type: trigger.type === 'webhook' ? 'webhook' : trigger.type === 'monitor' ? 'monitor' : 'schedule', cron, url: trigger.url ? String(trigger.url) : undefined },
      actions: processedActions,
      missing: allMissing,
      creditsNeeded,
      creditsPerRun: creditsNeeded,
      creditsPerStep,
      executionsTotal,
      timezone: trigger.timezone || user?.timezone || 'UTC',
    }
    return finalizeAgentPlan(plan, prompt, user)
  } catch (error) {
    process.stdout.write(`[parseAgentFromNL] LLM fallback failed: ${error instanceof Error ? error.message : error}\n`)
    return makeUnsupportedAgent(prompt, 'I do not have a ready automation for that yet.', 'Try "Every morning at 8 AM, email me a summary of my Google Calendar" or "Send an email to me every day".')
  }
}

function inferMissingFields(actions, trigger, user) {
  const missing = []
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i]
    const p = a.params || {}
    const step = a.label || `${a.action} ${a.connector}`
    if ((a.connector === 'gmail' || a.connector === 'email') && !p.to && !user.email) missing.push({ field: 'to', step, connector: a.connector, reason: 'Recipient email is required.', index: i })
    if (a.connector === 'telegram' && !p.chat_id && !p.to) missing.push({ field: 'chat_id', step, connector: a.connector, reason: 'Telegram chat ID is required.', index: i })
    if (a.connector === 'slack' && !p.channel && !p.to) missing.push({ field: 'channel', step, connector: a.connector, reason: 'Slack channel ID or name is required.', index: i })
    if (a.connector === 'whatsapp' && !p.to && !p.phone) missing.push({ field: 'to', step, connector: a.connector, reason: 'WhatsApp recipient phone number is required.', index: i })
    if (a.connector === 'github' && (a.action === 'create_issue' || a.action === 'summarize_commits') && !p.repo) missing.push({ field: 'repo', step, connector: a.connector, reason: 'Repository owner/name is required.', index: i })
    if (a.connector === 'google_sheets' && a.action === 'read_rows' && !p.spreadsheetId) missing.push({ field: 'spreadsheetId', step, connector: a.connector, reason: 'Spreadsheet ID is required.', index: i })
  }
  if (trigger.type === 'monitor' && !trigger.url) missing.push({ field: 'url', step: 'Monitor trigger', connector: 'monitor', reason: 'URL to monitor is required.' })
  return missing
}

function fallbackReality(idea) {
  const clean = String(idea).trim()
  const words = clean.split(/\s+/).filter(Boolean)
  const title = words.slice(0, 3).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') || 'New Idea'
  const category = /\b(dogs?|pets?|cats?|bookings?|sitters?|walks?)\b/i.test(clean) ? 'pet'
    : /\b(foods?|deliver(y|ies)?|orders?|restaurants?|meals?|kitchens?)\b/i.test(clean) ? 'food'
    : /\b(finances?|money|budgets?|cryptos?|mrr|revenue|invest(ing|s|ors?)?|stocks?)\b/i.test(clean) ? 'finance'
    : 'generic'

  const topic = clean.replace(/^(a|an|the|build|make|create|app|website|platform|system|tool|for)\s+/i, '').trim() || clean
  const t = topic.toLowerCase()
  let problem = ''
  let audience = ''
  let solution = ''

  if (category === 'pet') {
    const noun = t.includes('marketplace') ? t : `${t} marketplace`
    problem = `Pet owners still struggle to find trusted, vetted ${t} options without endless searching and worry.`
    audience = `Pet owners, sitters, and service providers who need safe, reliable ${t}.`
    solution = `A curated ${noun} with verified profiles, instant booking, and transparent reviews.`
  } else if (category === 'food') {
    const noun = t.includes('platform') || t.includes('app') ? t : `${t} platform`
    problem = `Ordering ${t} is fragmented, slow, and full of miscommunication for customers and vendors.`
    audience = `Hungry customers and local restaurants that want fast, reliable ${t} fulfillment.`
    solution = `A streamlined ${noun} with real-time tracking, simple menus, and one-tap reordering.`
  } else if (category === 'finance') {
    const noun = t.includes('dashboard') || t.includes('app') ? t : `${t} dashboard`
    problem = `Tracking and growing ${t} is complex, scattered across tools, and hard to act on quickly.`
    audience = `Founders, operators, and investors who need clarity and control over ${t}.`
    solution = `A focused ${noun} that surfaces trends, automates reports, and drives decisions.`
  } else {
    problem = `Turning "${clean}" into reality is slow, expensive, and full of guesswork today.`
    audience = `Anyone who needs ${clean} and wants a working preview without the engineering overhead.`
    solution = `A focused, AI-generated experience that clarifies the concept and proves demand.`
  }

  const metrics = {
    pet: [
      { label: 'Bookings', value: '1,248', change: '+12%' },
      { label: 'Active Pets', value: '3,402', change: '+8%' },
      { label: 'Revenue', value: '$8,240', change: '+18%' },
    ],
    food: [
      { label: 'Orders', value: '2,910', change: '+22%' },
      { label: 'Avg Delivery', value: '24m', change: '-3m' },
      { label: 'Revenue', value: '$12.4k', change: '+15%' },
    ],
    finance: [
      { label: 'MRR', value: '$42k', change: '+18%' },
      { label: 'Customers', value: '1,205', change: '+9%' },
      { label: 'Growth', value: '+32%', change: '+5%' },
    ],
    generic: [
      { label: 'Users', value: '8,420', change: '+24%' },
      { label: 'Revenue', value: '$24k', change: '+31%' },
      { label: 'Growth', value: '+32%', change: '+7%' },
    ],
  }[category]

  const chartHeights = {
    pet: [50, 55, 48, 62, 58, 70, 65],
    food: [30, 45, 40, 60, 55, 75, 65],
    finance: [40, 50, 55, 52, 65, 78, 85],
    generic: [40, 65, 45, 80, 55, 70, 50],
  }[category]

  return { idea: clean, title, problem, audience, solution, category, metrics, chartHeights }
}

export async function handleReality(prompt) {
  const clean = String(prompt).trim()
  if (!clean) throw new Error('Idea is required')
  const fallback = fallbackReality(clean)

  const apiKey = process.env.OPENAI_API_KEY_1 || process.env.OPENAI_API_KEY || ''
  const groqKey = process.env.GROQ_API_KEY_1 || process.env.GROQ_API_KEY || ''
  if (!apiKey && !groqKey) return fallback

  const system = `You are a product strategist for AlphaTekX. Given a user idea, return a single JSON object with these keys exactly:
- title: first 3 words of the idea, title-cased, max 4 words
- problem: one clear sentence describing the pain point
- audience: one clear sentence describing who it is for
- solution: one clear sentence describing the core solution
- category: one of pet, food, finance, generic
- metrics: array of exactly 3 objects for a SaaS dashboard, each with label (string), value (string), change (string like +12%)
- chartHeights: array of exactly 7 integers between 20 and 90 representing weekly bar heights
Return ONLY the JSON object, no markdown, no commentary.`

  const makeResult = (content) => {
    try {
      const parsed = JSON.parse(String(content || '{}'))
      const normalize = (arr, fallbackArr) => Array.isArray(arr) && arr.length === fallbackArr.length
        ? arr.map((m, i) => ({
            label: String(m?.label || fallbackArr[i].label).slice(0, 20),
            value: String(m?.value || fallbackArr[i].value).slice(0, 12),
            change: String(m?.change || fallbackArr[i].change).slice(0, 10),
          }))
        : fallbackArr
      const normalizedHeights = Array.isArray(parsed.chartHeights)
        ? parsed.chartHeights.slice(0, 7).map(n => Math.min(100, Math.max(10, Number(n) || 40)))
        : fallback.chartHeights
      while (normalizedHeights.length < 7) normalizedHeights.push(40)
      const parsedCategory = ['pet', 'food', 'finance', 'generic'].includes(parsed.category) ? parsed.category : fallback.category
      return {
        idea: clean,
        title: String(parsed.title || fallback.title).slice(0, 40),
        problem: String(parsed.problem || fallback.problem).slice(0, 220),
        audience: String(parsed.audience || fallback.audience).slice(0, 220),
        solution: String(parsed.solution || fallback.solution).slice(0, 220),
        category: parsedCategory,
        metrics: normalize(parsed.metrics, fallback.metrics),
        chartHeights: normalizedHeights,
      }
    } catch {
      return fallback
    }
  }

  const requestBody = {
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [{ role: 'system', content: system }, { role: 'user', content: clean }],
    response_format: { type: 'json_object' },
    max_completion_tokens: 700,
  }

  if (apiKey) try {
    const data = await fetchJson('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(requestBody),
    })
    return makeResult(data.choices?.[0]?.message?.content || '')
  } catch {}

  if (groqKey) try {
    const data = await fetchJson('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify({
        ...requestBody,
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      }),
    })
    return makeResult(data.choices?.[0]?.message?.content || '')
  } catch {}

  return fallback
}

async function authenticatedUser(req, supabaseUrl, anonKey) {
  const authorization = String(req.headers.authorization || '')
  if (!authorization.toLowerCase().startsWith('bearer ')) return null
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: authorization } })
    return response.ok ? response.json() : null
  } catch {
    return null
  }
}

async function runUserWorker(worker, apiKey, prompt) {
  const provider = String(worker.provider || '').toLowerCase()
  const model = String(worker.model || '').trim().slice(0, 100)
  if (!['openai', 'groq', 'anthropic', 'gemini'].includes(provider)) throw new Error('Unsupported AI provider')
  if (!apiKey || apiKey.length < 12) throw new Error('A valid provider API key is required')
  if (!prompt) throw new Error('Worker prompt is required')
  const memory = Array.isArray(worker.memory) ? worker.memory.slice(-12).map(item => String(item).slice(0, 2000)).join('\n') : ''
  const system = `You are ${String(worker.name || 'Alpha Worker').slice(0, 80)}, a ${String(worker.role || 'specialist').slice(0, 50)} AI worker. Purpose: ${String(worker.purpose || '').slice(0, 1000)}. Instructions: ${String(worker.instructions || '').slice(0, 3000)}. Follow the user's task accurately. State uncertainty and never pretend an external action completed.${memory ? `\nRecent conversation memory:\n${memory}` : ''}`
  if (provider === 'anthropic') {
    const data = await fetchJson('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: model || 'claude-3-5-sonnet-latest', max_tokens: 1800, system, messages: [{ role: 'user', content: prompt }] }) })
    return { text: (data.content || []).map(item => item.text || '').join('\n').trim(), provider }
  }
  if (provider === 'gemini') {
    const data = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model || 'gemini-2.5-flash')}:generateContent?key=${encodeURIComponent(apiKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: prompt }] }] }) })
    return { text: (data.candidates?.[0]?.content?.parts || []).map(item => item.text || '').join('\n').trim(), provider }
  }
  const endpoint = provider === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions'
  const data = await fetchJson(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model: model || (provider === 'groq' ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini'), messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], max_tokens: 1800, temperature: 0.4 }) })
  return { text: String(data.choices?.[0]?.message?.content || '').trim(), provider }
}

const adminEmail = 'iamdan4live@gmail.com'
const DEFAULT_CREDITS = 30
const supabaseConfig = () => ({
  url: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  anon: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
  service: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_ADMIN_KEY || '',
})
const alphaBrain = createAlphaBrain({ currentOrLocalUser, getUser, supabaseConfig, json, readBody, callLLMJSON })
const serviceHeaders = (service) => ({ apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' })
const userDataHeaders = (req, config) => ({
  apikey: config.anon,
  Authorization: String(req.headers.authorization || ''),
  'Content-Type': 'application/json',
})
const deploymentWriteHeaders = (req, config) => config.service
  ? serviceHeaders(config.service)
  : userDataHeaders(req, config)
const deploymentReadHeaders = (config) => serviceHeaders(config.service || config.anon)
const userKeyProviders = ['openai', 'groq', 'anthropic', 'gemini', 'supabase', 'paystack']
const aiKeyProviders = new Set(['openai', 'groq', 'anthropic', 'gemini'])

function encryptionKey(config) {
  const secret = process.env.API_KEY_ENCRYPTION_KEY || config.service
  if (!secret) throw new Error('API key encryption is not configured')
  return createHash('sha256').update(secret).digest()
}

function encryptSecret(value, key) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return `v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${encrypted.toString('base64url')}`
}

function decryptSecret(value, key) {
  if (!value) return ''
  if (!String(value).startsWith('v1:')) {
    try { return Buffer.from(String(value), 'base64').toString('utf8') } catch { return '' }
  }
  const [, iv, tag, encrypted] = String(value).split(':')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8')
}

const maskedKey = (value) => value ? `${value.slice(0, Math.min(5, value.length))}${'*'.repeat(8)}${value.slice(-4)}` : ''
function validateUserKey(provider, value) {
  if (value.length < 12 || value.length > 1000) throw new Error(`Enter a valid ${provider} key`)
  const prefixes = { openai: 'sk-', groq: 'gsk_', anthropic: 'sk-ant-', paystack: 'sk_' }
  if (prefixes[provider] && !value.startsWith(prefixes[provider])) throw new Error(`${provider} key has an unexpected format`)
}

async function storedUserKeys(userId, config) {
  const response = await fetch(`${config.url}/rest/v1/user_settings?user_id=eq.${encodeURIComponent(userId)}&select=api_keys`, { headers: serviceHeaders(config.service) })
  if (!response.ok) throw new Error('Could not load saved API keys. Run the latest Supabase schema first.')
  return (await response.json())?.[0]?.api_keys || {}
}

function keyStatus(keys, key) {
  const status = {}
  for (const provider of userKeyProviders) {
    let value = ''
    try { value = decryptSecret(keys[provider], key) } catch {}
    status[provider] = { configured: Boolean(value), masked: maskedKey(value) }
  }
  return status
}

async function apiKeySettings(req, res) {
  const config = supabaseConfig()
  if (!config.url || !config.anon || !config.service) return json(res, 503, { error: 'Secure API-key storage needs Supabase service configuration.' })
  const user = await authenticatedUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const key = encryptionKey(config)
  const existing = await storedUserKeys(user.id, config)
  if (req.method === 'GET') return json(res, 200, { providers: keyStatus(existing, key) })
  const body = await readBody(req)
  const changes = body.keys && typeof body.keys === 'object' ? body.keys : {}
  const next = { ...existing }
  for (const provider of userKeyProviders) {
    if (!Object.prototype.hasOwnProperty.call(changes, provider)) continue
    const value = String(changes[provider] || '').trim()
    if (!value) delete next[provider]
    else { validateUserKey(provider, value); next[provider] = encryptSecret(value, key) }
  }
  const response = await fetch(`${config.url}/rest/v1/user_settings?on_conflict=user_id`, { method: 'POST', headers: { ...serviceHeaders(config.service), Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify({ user_id: user.id, api_keys: next, updated_at: new Date().toISOString() }) })
  if (!response.ok) throw new Error('Could not securely save API keys')
  return json(res, 200, { saved: true, providers: keyStatus(next, key) })
}

async function testStoredKey(req, res) {
  const config = supabaseConfig()
  if (!config.url || !config.anon || !config.service) return json(res, 503, { error: 'Secure API-key storage is not configured.' })
  const user = await authenticatedUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const provider = String((await readBody(req)).provider || '').toLowerCase()
  if (!aiKeyProviders.has(provider)) return json(res, 400, { error: 'This provider cannot be tested here.' })
  const keys = await storedUserKeys(user.id, config)
  const apiKey = decryptSecret(keys[provider], encryptionKey(config))
  if (!apiKey) return json(res, 400, { error: `No ${provider} key is saved.` })
  const requests = {
    openai: ['https://api.openai.com/v1/models', { Authorization: `Bearer ${apiKey}` }],
    groq: ['https://api.groq.com/openai/v1/models', { Authorization: `Bearer ${apiKey}` }],
    anthropic: ['https://api.anthropic.com/v1/models', { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }],
    gemini: [`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`, {}],
  }
  const [url, headers] = requests[provider]
  const response = await fetch(url, { headers })
  if (!response.ok) return json(res, 400, { error: `${provider} rejected this key.` })
  return json(res, 200, { valid: true, provider })
}

async function runWorkerRequest(req, res) {
  const config = supabaseConfig()
  if (!config.url || !config.anon || !config.service) return json(res, 503, { error: 'AI Workers need Supabase service configuration.' })
  const user = await authenticatedUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const body = await readBody(req)
  const workerId = String(body.workerId || '')
  const prompt = String(body.prompt || '').trim().slice(0, 12000)
  if (!workerId || !prompt) return json(res, 400, { error: 'Choose a worker and enter a task.' })
  const workerResponse = await fetch(`${config.url}/rest/v1/workers?id=eq.${encodeURIComponent(workerId)}&user_id=eq.${encodeURIComponent(user.id)}&select=*`, { headers: serviceHeaders(config.service) })
  const worker = (await workerResponse.json())?.[0]
  if (!worker) return json(res, 404, { error: 'Worker not found.' })
  const keys = await storedUserKeys(user.id, config)
  const apiKey = decryptSecret(keys[worker.provider], encryptionKey(config))
  if (!apiKey) return json(res, 400, { error: `Add and test your ${String(worker.provider).toUpperCase()} key in API Keys first.` })
  const result = await runUserWorker(worker, apiKey, prompt)
  const memory = [...(Array.isArray(worker.memory) ? worker.memory : []), `User: ${prompt.slice(0, 4000)}`, `Worker: ${String(result.text || '').slice(0, 4000)}`].slice(-20)
  await fetch(`${config.url}/rest/v1/workers?id=eq.${encodeURIComponent(worker.id)}&user_id=eq.${encodeURIComponent(user.id)}`, { method: 'PATCH', headers: serviceHeaders(config.service), body: JSON.stringify({ memory }) })
  return json(res, 200, { ...result, memory })
}

const googleScopes = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
]
const publicAppUrl = () => String(process.env.PUBLIC_APP_URL || 'https://alphatekx.name.ng').replace(/\/$/, '')
const googleClientId = () => process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || ''
const googleClientSecret = () => process.env.GOOGLE_CLIENT_SECRET || ''
const googleConfigured = () => Boolean(googleClientId() && googleClientSecret())
const oauthStateKey = (config) => createHash('sha256').update(process.env.OAUTH_STATE_SECRET || process.env.API_KEY_ENCRYPTION_KEY || config.service || 'alphatekx-local-dev').digest()

function getRequestOrigin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || String(new URL(publicAppUrl()).host)
  const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)
  const forwardedProto = req.headers['x-forwarded-proto'] || (isLocal ? 'http' : 'https')
  return `${forwardedProto}://${host}`
}

function getGoogleRedirectUri(req) {
  // Always use the request origin so the redirect URI matches the deployed host.
  return `${getRequestOrigin(req)}/api/auth/gmail/callback`
}

function buildGoogleAuthUrl(redirectUri, state, loginHint = '') {
  const params = new URLSearchParams({
    client_id: googleClientId(),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: googleScopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  if (loginHint) params.set('login_hint', loginHint)
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

async function exchangeGoogleCode(code, redirectUri) {
  const body = new URLSearchParams({
    client_id: googleClientId(),
    client_secret: googleClientSecret(),
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error_description || data.error || 'Google token exchange failed')
  return data
}

async function fetchGoogleUserInfo(accessToken) {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error_description || data.error || 'Could not fetch Google profile')
  return data
}

async function refreshGoogleAccessToken(refreshToken) {
  const body = new URLSearchParams({
    client_id: googleClientId(),
    client_secret: googleClientSecret(),
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error_description || data.error || 'Google token refresh failed')
  return { accessToken: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 }
}

async function sendGmailMessage(accessToken, raw) {
  // Client equivalent: await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error?.message || data.error_description || data.error || 'Gmail API send failed')
  return data
}

function createOAuthState(userId, config, email = '', redirect = '/agents') {
  const payload = Buffer.from(JSON.stringify({ userId, email: cleanHeader(email), redirect: String(redirect || '/agents'), expires: Date.now() + 10 * 60_000, nonce: randomBytes(16).toString('hex') })).toString('base64url')
  const signature = createHmac('sha256', oauthStateKey(config)).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

function verifyOAuthState(value, config) {
  const [payload, signature] = String(value || '').split('.')
  if (!payload || !signature) throw new Error('Invalid Google connection state')
  const expected = createHmac('sha256', oauthStateKey(config)).update(payload).digest()
  const received = Buffer.from(signature, 'base64url')
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error('Invalid Google connection state')
  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  if (!parsed.userId || Number(parsed.expires) < Date.now()) throw new Error('Google connection expired. Start again from Vault.')
  return parsed
}

function decryptGoogleTokens(tokens, key) {
  if (!tokens) return {}
  return { access_token: key ? decryptSecret(tokens.access_token, key) : tokens.access_token, refresh_token: key ? decryptSecret(tokens.refresh_token, key) : tokens.refresh_token, expires_at: tokens.expires_at }
}
function encryptGoogleTokens(tokens, key) {
  if (!tokens) return {}
  return { access_token: key ? encryptSecret(tokens.access_token, key) : tokens.access_token, refresh_token: tokens.refresh_token ? (key ? encryptSecret(tokens.refresh_token, key) : tokens.refresh_token) : '', expires_at: tokens.expires_at }
}

async function getConnectedAccount(userId, config) {
  const response = await fetch(`${config.url}/rest/v1/connected_accounts?user_id=eq.${encodeURIComponent(userId)}&provider=eq.google&select=*`, { headers: serviceHeaders(config.service) })
  if (!response.ok) return null
  const rows = await response.json()
  const row = rows?.[0]
  if (!row) return null
  const key = encryptionKey(config)
  const tokens = decryptGoogleTokens(row.tokens, key)
  return { id: row.id, user_id: row.user_id, provider: 'google', email: row.email, access_token: tokens.access_token, refresh_token: tokens.refresh_token, expires_at: tokens.expires_at, scopes: row.scopes || googleScopes, source: 'connected_accounts' }
}

async function getLegacyGoogleIntegration(userId, config) {
  const response = await fetch(`${config.url}/rest/v1/user_integrations?user_id=eq.${encodeURIComponent(userId)}&provider=eq.google&select=*`, { headers: serviceHeaders(config.service) })
  if (!response.ok) return null
  const rows = await response.json()
  const row = rows?.[0]
  if (!row) return null
  const key = encryptionKey(config)
  return { id: row.id, user_id: row.user_id, provider: 'google', email: row.email, access_token: key ? decryptSecret(row.access_token, key) : row.access_token, refresh_token: row.refresh_token ? (key ? decryptSecret(row.refresh_token, key) : row.refresh_token) : '', expires_at: row.expiry_date, scopes: row.scopes || googleScopes, source: 'user_integrations' }
}

async function getGoogleIntegration(userId, config) {
  if (config.url && config.service) {
    const connected = await getConnectedAccount(userId, config)
    if (connected) return connected
    const legacy = await getLegacyGoogleIntegration(userId, config)
    if (legacy) return legacy
  }
  return getLocalGoogle(userId)
}

async function getUserGmail(userId, config) {
  return getGoogleIntegration(userId, config)
}

async function startGoogleConnection(req, res) {
  const config = supabaseConfig()
  if (!googleConfigured()) return json(res, 503, { error: 'Google OAuth is not configured on Render.' })
  const body = await readBody(req)
  const localUser = body?.localUser ? { id: String(body.localUser.id || ''), email: String(body.localUser.email || '') } : localUserFromRequest(req)
  const user = config.url && config.anon ? (await authenticatedUser(req, config.url, config.anon).catch(() => null) || localUser) : localUser
  if (!user?.id || !user?.email) return json(res, 401, { error: 'Authentication required' })
  const redirect = String(body?.redirect || '/agents')
  const state = createOAuthState(user.id, config, user.email, redirect)
  const redirectUri = getGoogleRedirectUri(req)
  const url = buildGoogleAuthUrl(redirectUri, state, user.email || '')
  return json(res, 200, { url })
}

async function beginGoogleOAuth(req, res) {
  if (!googleConfigured()) return json(res, 503, { error: 'Google OAuth is not configured on Render.' })
  const config = supabaseConfig()
  const requestUrl = new URL(req.url || '/', publicAppUrl())
  const stateValue = requestUrl.searchParams.get('state')
  const state = verifyOAuthState(stateValue, config)
  const redirectUri = getGoogleRedirectUri(req)
  const url = buildGoogleAuthUrl(redirectUri, stateValue, state.email || '')
  res.writeHead(302, { Location: url, 'Cache-Control': 'no-store' })
  return res.end()
}

async function saveGoogleIntegration(userId, email, tokens, config) {
  const localRecord = { user_id: userId, provider: 'google', email, access_token: tokens.access_token, refresh_token: tokens.refresh_token || '', expires_at: tokens.expires_at, scopes: googleScopes, updated_at: new Date().toISOString() }
  let savedRemote = false
  if (config.url && config.service) {
    const key = encryptionKey(config)
    const encrypted = encryptGoogleTokens({ access_token: tokens.access_token, refresh_token: tokens.refresh_token || '', expires_at: tokens.expires_at }, key)
    const record = { user_id: userId, provider: 'google', email, tokens: encrypted, scopes: googleScopes, updated_at: new Date().toISOString() }
    try {
      const connected = await fetch(`${config.url}/rest/v1/connected_accounts?on_conflict=user_id,provider`, { method: 'POST', headers: { ...serviceHeaders(config.service), Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(record) })
      if (connected.ok) savedRemote = true
      else {
        const fallback = { ...localRecord, expiry_date: tokens.expires_at, access_token: key ? encryptSecret(tokens.access_token, key) : tokens.access_token, refresh_token: tokens.refresh_token ? (key ? encryptSecret(tokens.refresh_token, key) : tokens.refresh_token) : '' }
        const legacy = await fetch(`${config.url}/rest/v1/user_integrations?on_conflict=user_id,provider`, { method: 'POST', headers: { ...serviceHeaders(config.service), Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(fallback) })
        if (legacy.ok) savedRemote = true
      }
    } catch (err) { process.stdout.write(`[save google] remote save failed: ${err instanceof Error ? err.message : err}\n`) }
  }
  if (!savedRemote) setLocalGoogle(userId, localRecord)
}

export async function googleCallback(req, res) {
  const config = supabaseConfig()
  const requestUrl = new URL(req.url || '/', publicAppUrl())
  const rawState = requestUrl.searchParams.get('state') || ''
  let destination
  try {
    const state = verifyOAuthState(rawState, config)
    const basePath = state.redirect || '/agents'
    destination = new URL(basePath, publicAppUrl())
    if (!googleConfigured()) throw new Error('Google OAuth is not configured')
    if (requestUrl.searchParams.get('error')) throw new Error(requestUrl.searchParams.get('error_description') || 'Google permission was not granted')
    const code = requestUrl.searchParams.get('code')
    if (!code) throw new Error('Google did not return an authorization code')
    const redirectUri = getGoogleRedirectUri(req)
    const tokenResponse = await exchangeGoogleCode(code, redirectUri)
    if (!tokenResponse.access_token) throw new Error('Google did not return an access token')
    const profile = await fetchGoogleUserInfo(tokenResponse.access_token)
    const email = String(profile.email || '')
    if (!email) throw new Error('Google did not return the user email')
    const expiresAt = Date.now() + (tokenResponse.expires_in || 3600) * 1000
    await saveGoogleIntegration(state.userId, email, { ...tokenResponse, expires_at: expiresAt }, config)
    destination.searchParams.set('connected', 'google')
    destination.searchParams.set('email', email)
  } catch (error) {
    destination = destination || new URL('/agents', publicAppUrl())
    destination.searchParams.set('connected', 'error')
    destination.searchParams.set('reason', error instanceof Error ? error.message.slice(0, 180) : 'Google connection failed')
  }
  res.writeHead(302, { Location: destination.toString(), 'Cache-Control': 'no-store' })
  return res.end()
}

async function integrationsStatus(req, res) {
  const config = supabaseConfig()
  const user = await currentOrLocalUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const google = await getGoogleIntegration(user.id, config)
  const googleConnected = Boolean(google)
  const email = google?.email || null
  const scopes = google?.scopes || []
  const status = {}
  const googleReady = connectorReady('gmail')
  status.google = { connected: googleConnected, ready: googleReady || googleConnected, email, scopes }
  status.gmail = { connected: googleConnected, ready: googleReady || googleConnected, email }
  status.sheets = { connected: googleConnected && scopes.some(s => s.includes('spreadsheets')), ready: googleReady || googleConnected, email }
  status.calendar = { connected: googleConnected && scopes.some(s => s.includes('calendar')), ready: googleReady || googleConnected, email }
  status.drive = { connected: googleConnected && scopes.some(s => s.includes('drive')), ready: googleReady || googleConnected, email }
  status.google_sheets = status.sheets
  status.google_calendar = status.calendar
  status.google_drive = status.drive
  const providers = ['github', 'linkedin', 'x', 'facebook', 'whatsapp', 'paystack', 'supabase', 'notion', 'slack', 'discord', 'telegram', 'email']
  for (const provider of providers) {
    const integration = await getUserIntegration(user.id, provider, config).catch(() => null)
    const token = integration?.tokens || {}
    const connected = Boolean(token?.api_key || token?.access_token || token?.token || token?.webhook_url || token?.bot_token)
    const ready = connected || connectorReady(provider)
    const identifier = token?.chat_id || token?.author_urn || token?.channel || token?.page_id || token?.pageId || token?.phone_number_id || token?.phoneNumberId || integration?.identifier || null
    status[provider] = { connected, ready, hasOwnKey: token?.hasOwnKey === true || token?.hasOwnKey === 'true', isMaster: token?.isMaster === true || token?.isMaster === 'true', identifier, email: integration?.email || integration?.identifier || null }
  }
  if (!status.paystack.connected && process.env.PAYSTACK_SECRET_KEY) status.paystack = { connected: true, ready: true, email: 'AlphaTekX backend' }
  if (!status.supabase.connected && config.url && config.service) status.supabase = { connected: true, ready: true, email: 'AlphaTekX backend' }
  return json(res, 200, status)
}

async function liveTestIntegrations(req, res) {
  const config = supabaseConfig()
  const user = await currentOrLocalUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const results = {}
  const maskUrl = (url) => url ? `${String(url).slice(0, 32)}...` : null

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) results.resend = { status: 'missing', message: 'RESEND_API_KEY not set on Render' }
  else {
    try {
      const [a, b] = await Promise.allSettled([
        sendEmailViaResend(user.id, { to: 'coderking555@gmail.com', subject: 'AlphaTekX Live Test', html: '<p>AlphaTekX connector live test.</p>', text: 'AlphaTekX connector live test.' }).catch(async (err) => {
          if (String(err.message).includes('only send testing emails')) {
            return sendEmailViaResend(user.id, { to: 'copiliot87@gmail.com', subject: 'AlphaTekX Live Test', html: '<p>AlphaTekX connector live test.</p>', text: 'AlphaTekX connector live test.' })
          }
          throw err
        }),
        sendEmailViaResend(user.id, { to: 'iamdan4live@gmail.com', subject: 'AlphaTekX Live Test', html: '<p>AlphaTekX connector live test.</p>', text: 'AlphaTekX connector live test.' }).catch(async (err) => {
          if (String(err.message).includes('only send testing emails')) {
            return sendEmailViaResend(user.id, { to: 'copiliot87@gmail.com', subject: 'AlphaTekX Live Test', html: '<p>AlphaTekX connector live test.</p>', text: 'AlphaTekX connector live test.' })
          }
          throw err
        })
      ])
      results.resend = { status: 'ok', to_coderking: a.status === 'fulfilled' ? a.value : { error: String(a.reason?.message || a.reason) }, to_iamdan: b.status === 'fulfilled' ? b.value : { error: String(b.reason?.message || b.reason) }, key: maskedKey(resendKey) }
    } catch (error) { results.resend = { status: 'error', message: error instanceof Error ? error.message : String(error), key: maskedKey(resendKey) } }
  }

  const telegramToken = process.env.TELEGRAM_BOT_TOKEN
  const telegramChatId = process.env.TELEGRAM_CHAT_ID
  if (!telegramToken) results.telegram = { status: 'missing', message: 'TELEGRAM_BOT_TOKEN not set on Render' }
  else {
    try {
      let chatId = telegramChatId
      if (!chatId) {
        const updates = await fetch(`https://api.telegram.org/bot${telegramToken}/getUpdates`).then(r => r.json())
        if (!updates.ok || !updates.result?.length) throw new Error('No chat found. Start the bot and send it a message, or set TELEGRAM_CHAT_ID on Render.')
        const update = updates.result[0]
        const chat = update.message?.chat || update.callback_query?.message?.chat || update.my_chat_member?.chat
        chatId = chat?.id
        if (!chatId) throw new Error('Could not extract a chat_id from bot updates.')
      }
      const send = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: 'AlphaTekX Production Test - Telegram Live ✅' }) })
      const sendData = await send.json()
      if (!send.ok || !sendData.ok) throw new Error(sendData.description || 'Telegram send failed')
      results.telegram = { status: 'ok', chat_id: chatId, message_id: sendData.result?.message_id, key: maskedKey(telegramToken) }
    } catch (error) { results.telegram = { status: 'error', message: error instanceof Error ? error.message : String(error), key: maskedKey(telegramToken) } }
  }

  const discordWebhook = process.env.DISCORD_WEBHOOK_URL
  if (!discordWebhook) results.discord = { status: 'missing', message: 'DISCORD_WEBHOOK_URL not set on Render' }
  else {
    try {
      const r = await fetch(discordWebhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'AlphaTekX Production Test - Discord Live ✅' }) })
      if (!r.ok) throw new Error(`Discord webhook returned ${r.status}`)
      results.discord = { status: 'ok', status_code: r.status, url: maskUrl(discordWebhook) }
    } catch (error) { results.discord = { status: 'error', message: error instanceof Error ? error.message : String(error), url: maskUrl(discordWebhook) } }
  }

  const slackToken = process.env.SLACK_BOT_TOKEN
  const slackTestChannel = process.env.SLACK_TEST_CHANNEL
  if (!slackToken) results.slack = { status: 'missing', message: 'SLACK_BOT_TOKEN not set on Render' }
  else {
    try {
      const postMessage = async (channel) => {
        const post = await fetch('https://slack.com/api/chat.postMessage', { method: 'POST', headers: { Authorization: `Bearer ${slackToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ channel, text: 'AlphaTekX Production Test - Slack Live ✅' }) }).then(r => r.json())
        if (!post.ok) throw new Error(post.error || 'Slack postMessage failed')
        return post
      }
      let post
      if (slackTestChannel) {
        post = await postMessage(slackTestChannel)
      } else {
        try {
          const list = await fetch('https://slack.com/api/conversations.list?types=public_channel,private_channel', { headers: { Authorization: `Bearer ${slackToken}` } }).then(r => r.json())
          const channel = list.ok ? (list.channels?.find(c => c.is_member && !c.is_archived) || list.channels?.[0]) : null
          if (channel) post = await postMessage(channel.id)
        } catch {}
        if (!post) post = await postMessage('#general')
      }
      results.slack = { status: 'ok', channel: post.channel, ts: post.ts, key: maskedKey(slackToken) }
    } catch (error) { results.slack = { status: 'error', message: error instanceof Error ? error.message : String(error), key: maskedKey(slackToken), note: 'Token may need chat:write and channels:read scopes, and the bot must be invited to #general or the channel set in SLACK_TEST_CHANNEL.' } }
  }

  const githubToken = process.env.GITHUB_TOKEN
  if (!githubToken) results.github = { status: 'missing', message: 'GITHUB_TOKEN not set on Render' }
  else {
    try {
      const user = await fetch('https://api.github.com/user', { headers: { Authorization: `token ${githubToken}`, Accept: 'application/vnd.github+json' } })
      const userData = await user.json()
      if (!user.ok) throw new Error(userData.message || 'GitHub user fetch failed')
      const repos = await fetch('https://api.github.com/user/repos?per_page=5', { headers: { Authorization: `token ${githubToken}`, Accept: 'application/vnd.github+json' } })
      const reposData = await repos.json()
      results.github = { status: 'ok', user: userData.login, repos: Array.isArray(reposData) ? reposData.map(r => r.full_name) : [], key: maskedKey(githubToken) }
    } catch (error) { results.github = { status: 'error', message: error instanceof Error ? error.message : String(error), key: maskedKey(githubToken) } }
  }

  const notionToken = process.env.NOTION_TOKEN
  if (!notionToken) results.notion = { status: 'missing', message: 'NOTION_TOKEN not set on Render' }
  else {
    try {
      const r = await fetch('https://api.notion.com/v1/search', { method: 'POST', headers: { Authorization: `Bearer ${notionToken}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ page_size: 5 }) })
      const data = await r.json()
      if (!r.ok) throw new Error(data.message || 'Notion search failed')
      results.notion = { status: 'ok', results: (data.results || []).map(x => ({ id: x.id, type: x.object, title: x.properties?.title?.title?.[0]?.plain_text || x.properties?.Name?.title?.[0]?.plain_text || '(untitled)' })), key: maskedKey(notionToken) }
    } catch (error) { results.notion = { status: 'error', message: error instanceof Error ? error.message : String(error), key: maskedKey(notionToken) } }
  }

  const paystackKey = process.env.PAYSTACK_SECRET_KEY
  if (!paystackKey) results.paystack = { status: 'missing', message: 'PAYSTACK_SECRET_KEY not set on Render' }
  else {
    try {
      const r = await fetch('https://api.paystack.co/balance', { headers: { Authorization: `Bearer ${paystackKey}` } })
      const data = await r.json()
      if (!r.ok || !data.status) throw new Error(data.message || 'Paystack balance fetch failed')
      results.paystack = { status: 'ok', balance: data.data, key: maskedKey(paystackKey) }
    } catch (error) { results.paystack = { status: 'error', message: error instanceof Error ? error.message : String(error), key: maskedKey(paystackKey) } }
  }

  if (!config.url || !config.service) results.supabase = { status: 'missing', message: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set on Render' }
  else {
    try {
      const countTables = ['connected_accounts', 'user_integrations', 'agents']
      let lastError = null
      for (const table of countTables) {
        const countR = await fetch(`${config.url}/rest/v1/${table}?select=id`, { headers: { ...serviceHeaders(config.service), Prefer: 'count=exact', Range: '0-0' } })
        if (countR.ok) {
          const range = countR.headers.get('content-range')
          const count = range ? parseInt(String(range).split('/').pop() || '0', 10) : 'unknown'
          results.supabase = { status: 'ok', url: config.url, table, count }
          lastError = null
          break
        } else {
          lastError = `Supabase query failed: ${countR.status}`
        }
      }
      if (lastError) throw new Error(lastError)
    } catch (error) { results.supabase = { status: 'error', message: error instanceof Error ? error.message : String(error), url: config.url } }
  }

  return json(res, 200, { testedAt: new Date().toISOString(), testedBy: user.id, results })
}

async function disconnectGoogle(req, res) {
  const config = supabaseConfig()
  const user = await currentOrLocalUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  await disconnectGoogleByUser(user.id, config)
  return json(res, 200, { disconnected: true })
}

async function saveIntegrationHandler(req, res) {
  const config = supabaseConfig()
  const user = await currentOrLocalUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const match = String(req.url || '').match(/^\/api\/integrations\/([^/]+)\/?$/)
  const provider = match ? match[1] : ''
  if (!provider) return json(res, 400, { error: 'Provider required' })
  const body = await readBody(req)
  const tokens = body.tokens || {}
  if (!tokens.api_key && !tokens.access_token && !tokens.token && !tokens.webhook_url) return json(res, 400, { error: 'Integration credentials required' })
  await saveUserIntegration(user.id, provider, { email: body.email, identifier: body.identifier, tokens, scopes: body.scopes }, config)
  return json(res, 200, { saved: true, provider })
}

async function deleteIntegrationHandler(req, res) {
  const config = supabaseConfig()
  const user = await currentOrLocalUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const match = String(req.url || '').match(/^\/api\/integrations\/([^/]+)\/?$/)
  const provider = match ? match[1] : ''
  if (!provider) return json(res, 400, { error: 'Provider required' })
  await deleteUserIntegration(user.id, provider, config)
  return json(res, 200, { deleted: true, provider })
}

async function userUsage(req, res) {
  const config = supabaseConfig()
  const user = await currentOrLocalUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const full = await getUser(user.id, user.email || '')
  const used = full.freePostsUsed || 0
  const limit = full.freePostsLimit || 2
  return json(res, 200, { freePostsUsed: used, freePostsLimit: limit, remaining: Math.max(0, limit - used), connectors: full.connectors || {}, brandProfile: full.brandProfile || {} })
}

async function getBrandProfileHandler(req, res) {
  const config = supabaseConfig()
  const user = await currentOrLocalUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const full = await getUser(user.id, user.email || '')
  return json(res, 200, { brandProfile: full.brandProfile || {} })
}

async function saveBrandProfileHandler(req, res) {
  const config = supabaseConfig()
  const user = await currentOrLocalUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const body = await readBody(req)
  const profile = {
    business: String(body.business || '').trim(),
    audience: String(body.audience || '').trim(),
    tone: String(body.tone || '').trim(),
    website: String(body.website || '').trim(),
    dontPost: Array.isArray(body.dontPost) ? body.dontPost.map(String) : [String(body.dontPost || '')].filter(Boolean),
    updatedAt: new Date().toISOString(),
  }
  const full = await getUser(user.id, user.email || '')
  full.brandProfile = profile
  await saveUser(full)
  return json(res, 200, { brandProfile: profile })
}

async function saveConnectorHandler(req, res) {
  const config = supabaseConfig()
  const user = await currentOrLocalUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const body = await readBody(req)
  const platform = String(body.platform || body.provider || '')
  if (!platform) return json(res, 400, { error: 'Platform required' })
  const tokens = body.tokens || body.credentials || {}
  if (!tokens.api_key && !tokens.access_token && !tokens.token && !tokens.webhook_url && !tokens.webhookUrl && !tokens.bot_token && !tokens.botToken) return json(res, 400, { error: 'Connector credentials required' })
  tokens.hasOwnKey = true
  const identifier = body.identifier || tokens.chat_id || tokens.chatId || tokens.author_urn || tokens.authorUrn || tokens.channel || tokens.page_id || tokens.pageId || tokens.phone_number_id || tokens.phoneNumberId || ''
  await saveUserIntegration(user.id, platform, { email: user.email, identifier, tokens, scopes: body.scopes || [] }, config)
  return json(res, 200, { saved: true, platform, hasOwnKey: true })
}

async function testConnectorHandler(req, res) {
  const config = supabaseConfig()
  const user = await currentOrLocalUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const body = await readBody(req)
  const platform = String(body.platform || body.provider || '')
  const text = String(body.text || body.message || 'AlphaTekX connector test')
  const imageUrl = String(body.imageUrl || '')
  const to = String(body.to || body.phone || body.phoneNumber || '')
  if (!['linkedin', 'discord', 'slack', 'telegram', 'x', 'facebook', 'whatsapp'].includes(platform)) return json(res, 400, { error: 'Unsupported platform' })
  try {
    const result = await postToSocial(platform, user, { text, imageUrl, to })
    return json(res, 200, { success: true, platform, result })
  } catch (error) {
    if (error.message === 'FREE_LIMIT_REACHED') return json(res, 402, { success: false, error: 'FREE_LIMIT_REACHED', message: "You've used 2 free posts! Add your own API key for unlimited free posts or upgrade to Pro." })
    return json(res, 502, { success: false, error: error instanceof Error ? error.message : 'Connector test failed' })
  }
}

async function startLinkedInOAuth(req, res) {
  const config = supabaseConfig()
  const url = new URL(req.url || '/', 'http://localhost')
  const localUser = localUserFromRequest(req)
  let user = config.url && config.anon ? (await authenticatedUser(req, config.url, config.anon).catch(() => null) || localUser) : localUser
  if (!user && url.searchParams.has('localUserId') && url.searchParams.has('localUserEmail')) {
    user = { id: String(url.searchParams.get('localUserId')), email: String(url.searchParams.get('localUserEmail')) }
  }
  if (!user?.id) return json(res, 401, { error: 'Authentication required' })
  const clientId = process.env.MASTER_LINKEDIN_CLIENT_ID || process.env.LINKEDIN_CLIENT_ID || ''
  if (!clientId) return json(res, 503, { error: 'LinkedIn client ID not configured' })
  const redirectUri = `${publicAppUrl()}/api/connectors/linkedin/callback`
  const state = createOAuthState(user.id, config, user.email || '', '/connectors')
  const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent('openid profile w_member_social email')}&state=${encodeURIComponent(state)}`
  res.writeHead(302, { Location: authUrl, 'Cache-Control': 'no-store' })
  return res.end()
}

async function startLinkedInConnection(req, res) {
  const config = supabaseConfig()
  const body = await readBody(req)
  const localUser = body?.localUser ? { id: String(body.localUser.id || ''), email: String(body.localUser.email || '') } : localUserFromRequest(req)
  const user = config.url && config.anon ? (await authenticatedUser(req, config.url, config.anon).catch(() => null) || localUser) : localUser
  if (!user?.id || !user?.email) return json(res, 401, { error: 'Authentication required' })
  const clientId = process.env.MASTER_LINKEDIN_CLIENT_ID || process.env.LINKEDIN_CLIENT_ID || ''
  const clientSecret = process.env.MASTER_LINKEDIN_CLIENT_SECRET || process.env.LINKEDIN_CLIENT_SECRET || ''
  if (!clientId || !clientSecret) return json(res, 503, { error: 'LinkedIn client credentials not configured' })
  const redirectUri = `${publicAppUrl()}/api/connectors/linkedin/callback`
  const state = createOAuthState(user.id, config, user.email, '/connectors')
  const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent('openid profile w_member_social email')}&state=${encodeURIComponent(state)}`
  return json(res, 200, { url: authUrl })
}

async function linkedinCallback(req, res) {
  const config = supabaseConfig()
  const url = new URL(req.url || '/', `http://localhost`)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  let destination = new URL('/connectors?connected=linkedin', publicAppUrl())
  try {
    if (!code || !state) throw new Error('Missing LinkedIn authorization code or state')
    const parsed = verifyOAuthState(state, config)
    const clientId = process.env.MASTER_LINKEDIN_CLIENT_ID || process.env.LINKEDIN_CLIENT_ID || ''
    const clientSecret = process.env.MASTER_LINKEDIN_CLIENT_SECRET || process.env.LINKEDIN_CLIENT_SECRET || ''
    if (!clientId || !clientSecret) throw new Error('LinkedIn client credentials not configured')
    const redirectUri = `${publicAppUrl()}/api/connectors/linkedin/callback`
    const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret })
    const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
    const tokenData = await tokenResponse.json()
    if (!tokenResponse.ok || !tokenData.access_token) throw new Error(tokenData.error_description || tokenData.error || 'LinkedIn token exchange failed')
    const accessToken = tokenData.access_token
    let linkedinId = ''
    try {
      const uiResponse = await fetch('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } })
      const ui = await uiResponse.json()
      if (uiResponse.ok && ui.sub) linkedinId = ui.sub
    } catch {}
    if (!linkedinId) {
      try {
        const meResponse = await fetch('https://api.linkedin.com/v2/me?projection=(id)', { headers: { Authorization: `Bearer ${accessToken}`, 'X-Restli-Protocol-Version': '2.0.0' } })
        const me = await meResponse.json()
        if (meResponse.ok && me.id) linkedinId = me.id
      } catch {}
    }
    if (!linkedinId) throw new Error('Could not fetch LinkedIn profile id')
    const authorUrn = `urn:li:person:${linkedinId}`
    const grantedScopes = String(tokenData.scope || '').split(/\s+/).filter(Boolean)
    await saveUserIntegration(parsed.userId, 'linkedin', { email: parsed.email, identifier: authorUrn, tokens: { access_token: accessToken, author_urn: authorUrn, isMaster: false, hasOwnKey: true, expiry: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : undefined }, scopes: grantedScopes.length ? grantedScopes : ['openid', 'profile', 'w_member_social', 'email'] }, config)
  } catch (error) {
    destination = new URL('/connectors?connected=error', publicAppUrl())
    destination.searchParams.set('reason', error instanceof Error ? error.message.slice(0, 180) : 'LinkedIn connection failed')
  }
  res.writeHead(302, { Location: destination.toString(), 'Cache-Control': 'no-store' })
  return res.end()
}

const cleanHeader = (value) => String(value || '').replace(/[\r\n]+/g, ' ').trim()
function gmailRawMessage({ from, to, subject, text, html }) {
  const boundary = `alphatekx_${randomBytes(12).toString('hex')}`
  const plain = String(text || '').trim() || String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const lines = [
    `From: ${cleanHeader(from)}`,
    `To: ${cleanHeader(to)}`,
    `Subject: ${cleanHeader(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`, '',
    `--${boundary}`, 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: 8bit', '', plain, '',
    `--${boundary}`, 'Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: 8bit', '', String(html || plain), '',
    `--${boundary}--`, '',
  ]
  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url')
}

async function refreshGoogleTokens(integration, config) {
  const now = Date.now()
  const expiresAt = Number(integration.expires_at || integration.expiry_date || 0)
  let accessToken = integration.access_token
  if (expiresAt && expiresAt > now + 5 * 60_000) return accessToken
  if (!integration.refresh_token) throw new Error('Google refresh token is missing. Reconnect your Google account.')
  const isRemote = Boolean(!integration.local && config.url && config.service)
  const key = isRemote ? encryptionKey(config) : null
  const refreshToken = isRemote && integration.refresh_token ? decryptSecret(integration.refresh_token, key) : integration.refresh_token
  const refreshed = await refreshGoogleAccessToken(refreshToken)
  const newAccess = refreshed.accessToken
  const newExpiresAt = refreshed.expiresAt
  if (isRemote) {
    if (integration.source === 'connected_accounts') {
      const updated = { tokens: encryptGoogleTokens({ access_token: newAccess, refresh_token: refreshToken, expires_at: newExpiresAt }, key), updated_at: new Date().toISOString() }
      await fetch(`${config.url}/rest/v1/connected_accounts?id=eq.${encodeURIComponent(integration.id)}`, { method: 'PATCH', headers: serviceHeaders(config.service), body: JSON.stringify(updated) })
    } else {
      await fetch(`${config.url}/rest/v1/user_integrations?id=eq.${encodeURIComponent(integration.id)}`, { method: 'PATCH', headers: serviceHeaders(config.service), body: JSON.stringify({ access_token: encryptSecret(newAccess, key), expiry_date: newExpiresAt, updated_at: new Date().toISOString() }) })
    }
    integration.access_token = newAccess
    integration.refresh_token = key ? encryptSecret(refreshToken, key) : refreshToken
  } else {
    setLocalGoogle(integration.user_id, { ...integration, access_token: newAccess, expires_at: newExpiresAt })
  }
  integration.access_token = newAccess
  integration.expires_at = newExpiresAt
  return newAccess
}

async function sendEmailWithGmail(user, { to, subject, html, text }) {
  const config = supabaseConfig()
  if (!googleConfigured()) throw new Error('Gmail is not configured on the server.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !subject || (!html && !text)) throw new Error('A valid recipient, subject, and message are required.')
  const integration = await getUserGmail(user.id, config)
  if (!integration) throw new Error('Connect Gmail in Connectors before sending email.')
  const accessToken = await refreshGoogleTokens(integration, config)
  const email = integration.email
  const raw = gmailRawMessage({ from: email, to, subject, text, html })
  let lastError = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const sent = await sendGmailMessage(accessToken, raw)
      return { success: true, messageId: sent.id, threadId: sent.threadId }
    } catch (error) {
      lastError = error
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 1000))
    }
  }
  throw new Error(lastError instanceof Error ? `Gmail send failed after 3 attempts: ${lastError.message}` : 'Gmail send failed after 3 attempts')
}

async function executeAgentAction(agent, action) {
  const user = agent.userId ? { id: agent.userId, email: agent.userEmail || '' } : null
  const content = String(action.params?.text || action.params?.message || action.params?.body || '')
  if (!user) {
    await addAgentLog({ agentId: agent.id, connectorType: action.connector, content: content.slice(0, 500), status: 'failed', error: 'Agent has no associated user.' })
    return { status: 'error', duration: 0, output: null, error_code: 'NO_USER', credits_used: 0, log: 'Agent has no associated user.' }
  }
  const start = Date.now()
  try {
    const result = await executeConnectorAction(user, action)
    const response = result.status === 'success'
      ? { agentId: agent.id, connectorType: action.connector, content: content.slice(0, 500), status: 'success', response: result.log }
      : { agentId: agent.id, connectorType: action.connector, content: content.slice(0, 500), status: 'failed', error: result.log }
    await addAgentLog(response)
    if (result.status === 'success') {
      try { await alphaBrain.logMemory(user.id, { event_type: 'workflow_run', summary: `${action.connector} ${action.action} succeeded: ${result.log}`, source_workflow_id: agent.id, metadata: { agent: agent.name, connector: action.connector, action: action.action, output: result.output } }) } catch {}
    } else {
      try { await alphaBrain.recordHealing(user.id, agent.id, result.log, '', 'logged') } catch {}
    }
    return result
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error)
    await addAgentLog({ agentId: agent.id, connectorType: action.connector, content: content.slice(0, 500), status: 'failed', error: message })
    try { await alphaBrain.recordHealing(user.id, agent.id, message, `Check ${action.connector} connection and retry.`, 'pending') } catch {}
    return { status: 'error', duration: Date.now() - start, output: null, error_code: 'CONNECTOR_ERROR', credits_used: 0, log: message }
  }
}

async function activateCampaignHandler(req, res) {
  const match = String(req.url || '').match(/^\/api\/agents\/campaign\/([^/]+)\/activate\/?$/)
  const agentId = match ? decodeURIComponent(match[1]) : ''
  if (!agentId) return json(res, 400, { error: 'Campaign agent ID required' })
  const config = supabaseConfig()
  const user = await currentOrLocalUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const body = await readBody(req)
  const agent = await getServerAgent(agentId)
  if (!agent) return json(res, 404, { error: 'Campaign agent not found' })
  if (agent.userId && agent.userId !== user.id) return json(res, 403, { error: 'Not authorized' })
  if (!agent.campaign) return json(res, 400, { error: 'Not a campaign agent' })

  const startAtRaw = body.startAt
  const startAt = startAtRaw ? new Date(startAtRaw) : null
  if (!startAt || isNaN(startAt.getTime())) return json(res, 400, { error: 'Start date and time are required' })
  if (startAt.getTime() <= Date.now()) return json(res, 400, { error: 'Start time must be in the future' })

  const posts = agent.campaign.posts || []
  if (posts.length) {
    const firstScheduled = new Date(posts[0].scheduledAt)
    if (!isNaN(firstScheduled.getTime())) {
      const offsetMs = startAt.getTime() - firstScheduled.getTime()
      if (offsetMs !== 0) {
        agent.campaign.posts = posts.map(p => ({ ...p, scheduledAt: new Date(new Date(p.scheduledAt).getTime() + offsetMs).toISOString() }))
        if (agent.campaign.meta) agent.campaign.meta.startDate = startAt.toISOString()
      }
    }
  }

  const admin = String(user.email || '').toLowerCase() === adminEmail
  const total = agent.campaign.totalCredits || 0
  if (total > 0 && !admin) {
    const balance = await getUserCredits(user, config)
    if (balance < total) return json(res, 402, { error: 'Insufficient credits', total, balance })
    const ok = await spendUserCredits(user, total)
    if (!ok) return json(res, 402, { error: 'Could not charge credits' })
    try { await alphaBrain.logMemory(user.id, { event_type: 'credit_spend', summary: `Campaign charged ${total} credits upfront`, source_workflow_id: agentId, metadata: { credits: total, type: 'campaign' } }) } catch {}
  }

  const autoPublish = body.autoPublish === true || body.autoPublish === 'true'
  agent.campaign.approved = true
  agent.campaign.charged = true
  agent.campaign.autoPublish = autoPublish
  agent.campaign.status = 'running'
  agent.approved = true
  agent.status = 'running'
  agent.campaign.posts = (agent.campaign.posts || []).map(p => ({ ...p, status: p.status === 'pending_approval' ? 'scheduled' : p.status }))
  agent.trigger = { type: 'campaign', nextRun: campaignNextRun(agent.campaign), cron: agent.campaign.meta?.frequencyText || 'campaign' }
  await saveServerAgent(agent)
  return json(res, 200, { agent, charged: total, autoPublish, nextRun: agent.trigger.nextRun })
}

async function campaignReportHandler(req, res) {
  const match = String(req.url || '').match(/^\/api\/agents\/campaign\/([^/]+)\/report\/?$/)
  const agentId = match ? decodeURIComponent(match[1]) : ''
  if (!agentId) return json(res, 400, { error: 'Campaign agent ID required' })
  const config = supabaseConfig()
  const user = await currentOrLocalUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const agent = await getServerAgent(agentId)
  if (!agent) return json(res, 404, { error: 'Campaign agent not found' })
  if (agent.userId && agent.userId !== user.id) return json(res, 403, { error: 'Not authorized' })
  const report = agent.campaign?.missionReport || {
    title: agent.campaign?.name,
    totalPosts: agent.campaign?.posts?.length || 0,
    completed: (agent.campaign?.posts || []).filter(p => p.status === 'posted').length,
    partial: (agent.campaign?.posts || []).filter(p => p.status === 'partial').length,
    failed: (agent.campaign?.posts || []).filter(p => p.status === 'failed').length,
    pending: (agent.campaign?.posts || []).filter(p => p.status === 'scheduled' || p.status === 'pending_approval').length,
    creditsUsed: agent.campaign?.posts?.reduce((s, p) => s + (p.credits || 0), 0) || 0,
    links: (agent.campaign?.posts || []).map(p => ({ day: p.day, slot: p.slot, status: p.status, results: p.result })),
  }
  return json(res, 200, { agent, report })
}

export async function runDueAgents(req, res) {
  try {
    const now = new Date()
    const agents = (await listServerAgents()).filter(a => (a.status === 'running' || a.status === 'active' || a.status === 'warning') && (a.trigger?.type === 'schedule' || a.trigger?.type === 'monitor' || a.trigger?.type === 'campaign') && a.trigger?.nextRun && new Date(a.trigger.nextRun) <= now)
    const results = []
    for (const agent of agents) {
      const execution = await runAgent(agent, 'schedule')
      results.push({ agentId: agent.id, status: execution.status })
    }
    return json(res, 200, { executed: results.length, results })
  } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Run failed' }) }
}

function backoffMs(retryCount) {
  if (retryCount <= 1) return 60_000
  if (retryCount === 2) return 300_000
  return 900_000
}

function formatLocalTime(iso, timeZone = 'UTC') {
  try { return new Date(iso).toLocaleString('en-US', { timeZone, timeZoneName: 'short' }) }
  catch { return new Date(iso).toISOString() }
}

function generateExecutionId(agent, trigger, now = new Date()) {
  const base = String(agent.id || 'unknown')
  if (trigger === 'manual') return `${base}_manual_${now.toISOString()}`
  const scheduled = agent.trigger?.nextRun ? new Date(agent.trigger.nextRun).toISOString() : now.toISOString()
  return `${base}_${scheduled}`
}

function isAdminUser(user) {
  return String(user?.email || '').toLowerCase() === adminEmail
}

function computeEstimatedCredits(agent) { return billing.estimateAgentCredits(agent) }
function getStepCost(action, agent) { return billing.getStepCost(action, agent) }

function validateActionParams(action, creds = {}) {
  const p = action.params || {}
  const c = action.connector
  const a = action.action
  const willGenerate = p.generate === true || p.generate === 'true'
  const generatedByAction = a === 'email_summary' || a === 'send_gmail_summary' || a === 'read_events'
  const content = String(p.text || p.message || p.body || '').trim()
  const hasContent = willGenerate || generatedByAction || content.length > 0 || String(p.imageUrl || '').trim().length > 0

  switch (c) {
    case 'gmail':
    case 'email': {
      if (a === 'send_email') {
        const to = String(p.to || creds.email || '').trim()
        if (!to) return { field: 'to', reason: 'Recipient email is required.' }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { field: 'to', reason: 'Invalid email format.' }
        if (!String(p.subject || '').trim()) return { field: 'subject', reason: 'Email subject is required.' }
        if (!hasContent) return { field: 'body', reason: 'Email body is required.' }
      }
      break
    }
    case 'telegram': {
      const chatId = String(p.chat_id || p.to || p.chatId || creds.chatId || '').trim()
      if (!chatId) return { field: 'chat_id', reason: 'Telegram chat ID or recipient is required.' }
      if (!hasContent) return { field: 'message', reason: 'Message text or image is required.' }
      break
    }
    case 'slack': {
      const hasWebhook = Boolean(creds.webhookUrl || p.webhook_url || p.webhookUrl)
      const channel = String(p.channel || p.to || creds.channel || '').trim()
      if (!hasWebhook && !channel) return { field: 'channel', reason: 'Slack channel or webhook URL is required.' }
      if (!hasContent) return { field: 'message', reason: 'Message text or image is required.' }
      break
    }
    case 'discord': {
      if (!hasContent) return { field: 'message', reason: 'Discord message content or image is required.' }
      break
    }
    case 'whatsapp': {
      const to = String(p.to || '').trim()
      if (!to) return { field: 'to', reason: 'WhatsApp recipient phone number is required.' }
      if (!willGenerate && !String(p.message || p.text || '').trim()) return { field: 'message', reason: 'WhatsApp message text is required.' }
      break
    }
    case 'x':
    case 'linkedin':
    case 'facebook': {
      if (!hasContent) return { field: 'text', reason: 'Post content or image is required.' }
      break
    }
    case 'github': {
      const repo = String(p.repo || '').trim()
      if (!repo) return { field: 'repo', reason: 'Repository owner/name is required.' }
      if (a === 'create_issue' && !String(p.title || '').trim()) return { field: 'title', reason: 'Issue title is required.' }
      break
    }
    case 'google_sheets': {
      const spreadsheetId = String(p.spreadsheetId || p.spreadsheet_id || '').trim()
      if (!spreadsheetId) return { field: 'spreadsheetId', reason: 'Spreadsheet ID is required.' }
      if (a === 'append_row' && (!Array.isArray(p.values) || p.values.length === 0 || p.values.every(v => String(v).trim() === ''))) {
        return { field: 'values', reason: 'Row values are required.' }
      }
      break
    }
    case 'google_calendar':
    case 'calendar': {
      if (a === 'create_event' && !String(p.title || p.summary || '').trim()) return { field: 'title', reason: 'Event title is required.' }
      if (a === 'email_summary' || a === 'read_events') {
        if (!String(p.to || '').trim() && a === 'email_summary') return { field: 'to', reason: 'Recipient email is required.' }
        if (a === 'email_summary' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(p.to || '').trim())) return { field: 'to', reason: 'Invalid email format.' }
      }
      break
    }
    case 'gmail': {
      if (a === 'read_unread' && !String(p.to || '').trim()) return { field: 'to', reason: 'Recipient email is required.' }
      break
    }
    case 'google_drive': {
      if (a === 'upload_file' && (!String(p.name || '').trim() || !String(p.content || '').trim())) {
        return { field: 'name', reason: 'File name and content are required.' }
      }
      break
    }
    case 'notion': {
      if (a === 'create_page' && (!String(p.title || '').trim() || (!String(p.databaseId || '').trim() && !String(p.parentId || '').trim()))) {
        return { field: 'title', reason: 'Page title and a database/parent ID are required.' }
      }
      if (a === 'append_block' && (!String(p.pageId || '').trim() || !String(p.content || '').trim())) {
        return { field: 'content', reason: 'Page ID and content are required.' }
      }
      break
    }
    case 'paystack': {
      if (a === 'verify_payment' && !String(p.reference || '').trim()) return { field: 'reference', reason: 'Payment reference is required.' }
      break
    }
    case 'supabase': {
      if (a === 'insert_row' && (!String(p.table || '').trim() || !p.data || Object.keys(p.data).length === 0)) {
        return { field: 'table', reason: 'Table name and data row are required.' }
      }
      break
    }
  }
  return null
}

async function resolveConnectorCredentials(user, action) {
  if (!user?.id) return {}
  const social = ['x', 'linkedin', 'facebook', 'telegram', 'slack', 'discord', 'whatsapp']
  if (action.connector === 'gmail' || action.connector === 'email') return { email: user.email || '' }
  if (!social.includes(action.connector)) return {}
  try {
    return await getPostingCredentials(user, action.connector, { _skipFreeLimit: true })
  } catch { return {} }
}

async function validateAgentActions(agent, user) {
  if (agent.trigger?.type === 'monitor' && !String(agent.trigger.url || '').trim()) {
    return { field: 'url', reason: 'URL to monitor is required.', step: 'Monitor trigger' }
  }
  for (let i = 0; i < (agent.actions || []).length; i++) {
    const action = agent.actions[i]
    const creds = await resolveConnectorCredentials(user, action)
    const missing = validateActionParams(action, creds)
    if (missing) return { ...missing, index: i, step: action.label || `${action.action} ${action.connector}` }
  }
  return null
}

function isCampaignPrompt(prompt) {
  const text = String(prompt || '').toLowerCase()
  const hasPlatform = /\b(facebook|linkedin|instagram|x|twitter|whatsapp|telegram|slack|discord|social media|socials)\b/.test(text)
  const hasAction = /\b(post|posting|publish|publishing|content|campaign|social employee|schedule)\b/.test(text)
  const hasTime = /\b(day|week|daily|morning|evening|week|for \d+ days|for \d+ week|every day|twice a day|once a day)\b/.test(text)
  return hasPlatform && hasAction && hasTime
}

function parseCampaignMeta(prompt, timezone = 'UTC') {
  const text = String(prompt || '').toLowerCase()
  const platforms = []
  if (/\bfacebook\b/.test(text)) platforms.push('facebook')
  if (/\blinkedin\b/.test(text)) platforms.push('linkedin')
  if (/\binstagram\b/.test(text)) platforms.push('instagram')
  if (/\bx\b|twitter/.test(text)) platforms.push('x')
  if (/\bwhatsapp\b/.test(text)) platforms.push('whatsapp')
  if (/\btelegram\b/.test(text)) platforms.push('telegram')
  if (/\bslack\b/.test(text)) platforms.push('slack')
  if (/\bdiscord\b/.test(text)) platforms.push('discord')
  if (platforms.length === 0) platforms.push('facebook', 'linkedin')

  const includeImages = /\bimage|picture|photo|visual|with images|with pictures|with a picture|with an image\b/.test(text)

  let durationDays = 7
  const durationMatch = text.match(/for (\d+) (day|days|week|weeks)/)
  if (durationMatch) {
    const n = parseInt(durationMatch[1], 10)
    const unit = durationMatch[2]
    durationDays = unit.startsWith('week') ? n * 7 : n
  } else if (/\b1 week\b|\bone week\b/.test(text)) {
    durationDays = 7
  } else if (/\b2 weeks\b/.test(text)) {
    durationDays = 14
  } else if (/\b1 month\b/.test(text)) {
    durationDays = 30
  }

  let postsPerDay = 1
  const slots = []
  if (/morning and evening|twice a day|2 times a day|two times a day|morning & evening|2x a day/.test(text)) {
    postsPerDay = 2
    slots.push({ label: 'morning', hour: 8, minute: 0 })
    slots.push({ label: 'evening', hour: 18, minute: 0 })
  } else if (/morning/.test(text)) {
    postsPerDay = 1
    slots.push({ label: 'morning', hour: 8, minute: 0 })
  } else if (/evening/.test(text)) {
    postsPerDay = 1
    slots.push({ label: 'evening', hour: 18, minute: 0 })
  } else if (/noon/.test(text)) {
    slots.push({ label: 'noon', hour: 12, minute: 0 })
  } else {
    slots.push({ label: 'morning', hour: 8, minute: 0 })
  }

  let startDate = new Date()
  startDate.setUTCDate(startDate.getUTCDate() + 1)
  startDate.setUTCHours(0, 0, 0, 0)
  if (/\btomorrow\b/.test(text)) {
    startDate.setUTCDate(startDate.getUTCDate())
  } else if (/\btoday\b/.test(text)) {
    startDate = new Date()
    startDate.setUTCHours(0, 0, 0, 0)
  } else if (/\bnext monday\b/.test(text)) {
    const day = startDate.getUTCDay()
    const add = (1 - day + 7) % 7 || 7
    startDate.setUTCDate(startDate.getUTCDate() + add)
  }

  const totalPosts = postsPerDay * durationDays
  const frequencyText = postsPerDay === 2 ? 'morning (8 AM) and evening (6 PM)' : slots[0]?.label
  return { platforms, slots, durationDays, postsPerDay, totalPosts, startDate, includeImages, timezone, frequencyText }
}

function campaignTopicMix(dayIndex, slotIndex, totalSlots) {
  // 40% educational, 30% product, 20% story, 10% CTA, distributed round-robin
  const types = ['educational', 'educational', 'product', 'product', 'story', 'educational', 'cta']
  const type = types[(dayIndex * totalSlots + slotIndex) % types.length]
  const topics = {
    educational: ['Why automation matters for your business', 'How AI saves you 10 hours a week', 'The real cost of manual work', '5 signs you need a system'],
    product: ['Meet your new digital employee', 'What AlphaTekX can do for you', 'Turn ideas into systems overnight', 'Scale without hiring'],
    story: ['How one founder reclaimed their weekends', 'Behind the scenes at AlphaTekX', 'A customer win worth sharing', 'Why we started this'],
    cta: ['Start your first automation today', 'Book a free strategy call', 'Join the movement', 'Try AlphaTekX free'],
  }
  const list = topics[type]
  const topic = list[(dayIndex * totalSlots + slotIndex) % list.length]
  return { type, topic }
}

function buildFallbackCaption(brand, platform, topic, includeCta = false) {
  const b = brand.business ? ` at ${brand.business}` : ''
  const a = brand.audience ? ` for ${brand.audience}` : ''
  const t = brand.tone ? ` in a ${brand.tone} way` : ''
  const cta = includeCta ? ' Comment "YES" or DM us to learn more.' : ''
  if (platform === 'facebook') {
    return `${topic}${b}${a}! 🚀${cta}\n\n#automation #ai #growth #digitaltransformation #businesstips`
  }
  if (platform === 'linkedin') {
    return `${topic}${b}${a}.${t}\n\nEvery leader I speak with is trying to do more with less. Systems — not hustle — are what separate teams that scale from teams that stall.${cta}\n\n#automation #artificialintelligence #leadership #scalability #operations`
  }
  if (platform === 'x' || platform === 'twitter') {
    return `${topic}${b}${a}.${cta} #automation #AI #buildinpublic`
  }
  if (platform === 'instagram') {
    return `${topic}${b}${a} ✨${cta}\n\n#automation #ai #entrepreneur #growth #smallbusiness`
  }
  return `${topic}${b}${a}.${cta}`
}

function buildCampaignPosts(brand, meta) {
  const posts = []
  for (let d = 0; d < meta.durationDays; d++) {
    for (let s = 0; s < meta.slots.length; s++) {
      const slot = meta.slots[s]
      const date = new Date(meta.startDate)
      date.setUTCDate(date.getUTCDate() + d)
      date.setUTCHours(slot.hour, slot.minute, 0, 0)
      const { type, topic } = campaignTopicMix(d, s, meta.slots.length)
      const includeCta = type === 'cta' || (d * meta.slots.length + s) % 3 === 0
      const captions = {}
      for (const platform of meta.platforms) {
        captions[platform] = buildFallbackCaption(brand, platform, topic, includeCta)
      }
      posts.push({
        id: randomUUID(),
        day: d + 1,
        slot: slot.label,
        scheduledAt: date.toISOString(),
        platforms: meta.platforms,
        topic,
        postType: type,
        captions,
        status: 'pending_approval',
        result: {},
        credits: computeCampaignPostCredits(meta.platforms, meta.includeImages),
      })
    }
  }
  return posts
}

function computeCampaignPostCredits(platforms, includeImages) {
  const writing = 3
  const image = includeImages ? 2 : 0
  const publishing = platforms.length * 1
  return writing + image + publishing
}

function computeCampaignTotalCredits(posts) {
  return posts.reduce((sum, p) => sum + p.credits, 0)
}

async function buildCampaignPlan(prompt, user, brandProfile) {
  const meta = parseCampaignMeta(prompt, user?.timezone || 'UTC')
  const brand = {
    business: brandProfile.business || '',
    audience: brandProfile.audience || '',
    tone: brandProfile.tone || '',
    website: brandProfile.website || '',
    dontPost: Array.isArray(brandProfile.dontPost) ? brandProfile.dontPost : [],
  }

  // Try AI if keys exist, else deterministic fallback
  let posts = []
  const useAI = !!process.env.OPENAI_API_KEY || !!process.env.FLATKEY_API_KEY || !!process.env.GROQ_API_KEY || !!process.env.QWEN_API_KEY
  if (useAI) {
    try {
      const system = `You are Alpha Content Employee. Given brand info and campaign meta, generate all posts as JSON with shape {"calendar":[{"day":1,"slot":"morning","scheduledAt":"ISO","platforms":["facebook","linkedin"],"topic":"...","postType":"educational|product|story|cta","captions":{"facebook":"...","linkedin":"..."},"credits":5,"status":"pending_approval"}]}. Mix: 40% educational, 30% product, 20% story, 10% CTA. Include CTA in ~70% of posts. Adapt tone per platform (Facebook short + 2-3 hashtags, LinkedIn professional + 3-5 hashtags). Avoid: ${brand.dontPost.join(', ')}. Total posts: ${meta.totalPosts}.`
      const res = await callLLMJSON(system, JSON.stringify({ brand: brand, meta }))
      if (res && Array.isArray(res.calendar) && res.calendar.length) {
        posts = res.calendar.map(p => ({ ...p, id: p.id || randomUUID(), credits: computeCampaignPostCredits(p.platforms || meta.platforms, meta.includeImages), status: p.status || 'pending_approval', result: {} }))
      }
    } catch (err) { process.stdout.write(`[campaign] AI generation failed: ${err instanceof Error ? err.message : err}\n`) }
  }
  if (!posts.length) posts = buildCampaignPosts(brand, meta)

  const totalCredits = computeCampaignTotalCredits(posts)
  return {
    name: `Content Employee - ${meta.totalPosts} posts`,
    description: prompt,
    brand,
    meta,
    posts,
    totalCredits,
    status: 'pending_approval',
    charged: false,
    approved: false,
    autoPublish: false,
  }
}

function campaignNextRun(campaign) {
  const now = new Date()
  const pending = (campaign.posts || []).filter(p => p.status === 'pending' || p.status === 'pending_approval' || p.status === 'scheduled')
  const due = pending.filter(p => new Date(p.scheduledAt).getTime() <= now.getTime())
  if (due.length) return now.toISOString()
  const next = pending.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0]
  return next?.scheduledAt
}

async function runCampaignAgent(existing, trigger, executionId, user, admin) {
  const startTime = Date.now()
  const now = new Date()
  const config = supabaseConfig()
  const campaign = existing.campaign
  if (!campaign) throw new Error('Campaign data missing')

  if (campaign.status !== 'running' && campaign.status !== 'approved') {
    return { id: executionId, agentId: existing.id, at: now.toISOString(), status: 'skipped', duration: 0, output: null, error_code: 'APPROVAL_REQUIRED', credits_used: 0, log: 'Campaign is pending approval.', trigger }
  }

  // Approval gate for auto_publish
  if (campaign.autoPublish === false && campaign.approved !== true) {
    return { id: executionId, agentId: existing.id, at: now.toISOString(), status: 'paused', duration: 0, output: null, error_code: 'APPROVAL_REQUIRED', credits_used: 0, log: 'Campaign requires approval before publishing.', trigger }
  }

  let execution = { id: executionId, agentId: existing.id, at: now.toISOString(), status: 'in_progress', duration: 0, output: null, error_code: null, credits_used: 0, log: 'Campaign execution in progress', trigger, steps: [] }
  await addServerExecution(execution)

  const duePosts = (campaign.posts || []).filter(p => (p.status === 'scheduled' || p.status === 'pending_approval') && new Date(p.scheduledAt).getTime() <= now.getTime() + 5 * 60 * 1000)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())

  let creditsUsed = 0
  let postedCount = 0
  let failedCount = 0
  const steps = []

  for (const post of duePosts) {
    const postResults = {}
    let postSuccess = 0
    let postFailed = 0
    let postSkipped = 0

    for (const platform of (post.platforms || [])) {
      const action = { connector: platform, action: 'post', params: { text: post.captions?.[platform] || '', _skipFreeLimit: true } }
      const ready = await agentActionIsReady(user, action, config)
      if (!ready) {
        postResults[platform] = { status: 'skipped', log: `${platform} not connected` }
        postSkipped++
        continue
      }
      const caption = post.captions?.[platform]
      if (!caption) {
        postResults[platform] = { status: 'error', log: `Missing caption for ${platform}` }
        postFailed++
        continue
      }
      try {
        const result = await postToSocial(platform, user, { text: caption, _skipFreeLimit: true })
        postResults[platform] = { status: 'success', id: result.id || result.message_id || '', link: result.link || result.permalink || result.url || '', log: `Posted to ${platform}` }
        postSuccess++
        await addAgentLog({ agentId: existing.id, connectorType: platform, content: caption.slice(0, 500), status: 'success', response: JSON.stringify(result) })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        postResults[platform] = { status: 'error', log: `${platform} failed: ${message}` }
        postFailed++
        await addAgentLog({ agentId: existing.id, connectorType: platform, content: caption.slice(0, 500), status: 'failed', error: message })
      }
    }

    creditsUsed += post.credits || computeCampaignPostCredits(post.platforms || [], false)
    post.result = postResults
    post.status = postSuccess === post.platforms.length ? 'posted' : (postSuccess > 0 ? 'partial' : 'failed')
    post.postedAt = now.toISOString()
    if (postSuccess > 0) postedCount++
    if (postFailed > 0 || postSkipped > 0) failedCount++
    steps.push({ day: post.day, slot: post.slot, platforms: post.platforms, result: postResults, credits_used: post.credits, status: post.status })
    try {
      if (user?.id) await alphaBrain.logMemory(user.id, { event_type: 'post', summary: `Day ${post.day} ${post.slot}: ${postSuccess > 0 ? 'posted' : 'failed'} to ${post.platforms.join(', ')}`, source_workflow_id: existing.id, metadata: { topic: post.topic, platforms: post.platforms, results: postResults, status: post.status } })
    } catch {}
  }

  campaign.completedCount = (campaign.completedCount || 0) + postedCount
  campaign.failedCount = (campaign.failedCount || 0) + failedCount
  campaign.lastRun = now.toISOString()

  const remaining = (campaign.posts || []).filter(p => p.status === 'scheduled' || p.status === 'pending_approval')
  const nextRun = campaignNextRun(campaign)
  let status = 'running'
  let log = `Campaign execution: ${postedCount} post(s) processed. ${failedCount} had issues.`
  let output = { postedCount, failedCount, creditsUsed, steps }

  if (remaining.length === 0) {
    status = 'completed'
    campaign.status = 'completed'
    const missionReport = {
      title: campaign.name,
      totalPosts: campaign.posts.length,
      completed: campaign.posts.filter(p => p.status === 'posted').length,
      partial: campaign.posts.filter(p => p.status === 'partial').length,
      failed: campaign.posts.filter(p => p.status === 'failed').length,
      creditsUsed,
      links: campaign.posts.map(p => ({ day: p.day, slot: p.slot, results: p.result })),
      finishedAt: now.toISOString(),
    }
    campaign.missionReport = missionReport
    log = `Mission complete: ${missionReport.completed}/${missionReport.totalPosts} posts published. ${missionReport.creditsUsed} credits used.`
    output = missionReport
  }

  const record = {
    ...existing,
    status,
    campaign,
    executionHistory: [{ ...execution, status: status === 'completed' ? 'success' : 'success', duration: Date.now() - startTime, output, error_code: null, credits_used: creditsUsed, log }, ...(existing.executionHistory || [])].slice(0, 100),
    lastRun: now.toISOString(),
    updated_at: now.toISOString(),
  }
  if (nextRun) record.trigger = { ...existing.trigger, nextRun, type: 'campaign' }
  else record.trigger = { ...existing.trigger, type: 'campaign' }
  await saveServerAgent(record)

  execution = { ...execution, status: status === 'completed' ? 'success' : 'success', duration: Date.now() - startTime, output, error_code: null, credits_used: creditsUsed, log }
  await saveServerExecution(execution)
  return execution
}

async function runAgent(agent, trigger = 'schedule') {
  const startTime = Date.now()
  const now = new Date()
  const existing = await getServerAgent(agent.id) || agent
  const user = existing.userId ? await getUser(existing.userId, existing.userEmail || '') : null
  const userId = user?.id || existing.userId || ''
  const userEmail = user?.email || existing.userEmail || ''
  const timezone = user?.timezone || existing.userTimezone || 'UTC'
  const triggerType = trigger === 'manual' ? 'manual' : (existing.trigger?.type || 'schedule')
  const executionId = generateExecutionId(existing, trigger, now)
  const admin = isAdminUser(user)

  // 1. IDEMPOTENCY: refuse completed or in-progress duplicates
  const existingExec = await getServerExecution(executionId).catch(() => null)
  if (existingExec) {
    if (existingExec.status === 'completed' || existingExec.status === 'success') {
      return { id: executionId, agentId: existing.id, at: now.toISOString(), status: 'skipped', duration: 0, output: null, error_code: 'DUPLICATE', credits_used: 0, log: 'Duplicate prevented', trigger: triggerType }
    }
    if (existingExec.status === 'in_progress') {
      return { id: executionId, agentId: existing.id, at: now.toISOString(), status: 'skipped', duration: 0, output: null, error_code: 'CONCURRENT', credits_used: 0, log: 'Execution already in progress', trigger: triggerType }
    }
  }

  // 2. TIMING IS LAW (schedule/monitor only; manual runs skip)
  if (trigger !== 'manual' && existing.trigger?.nextRun) {
    const expectedAt = new Date(existing.trigger.nextRun)
    const expectedLocal = formatLocalTime(expectedAt.toISOString(), timezone)
    const nowLocal = formatLocalTime(now.toISOString(), timezone)
    const diff = now.getTime() - expectedAt.getTime()
    if (diff < -5 * 60 * 1000 || diff > 5 * 60 * 1000) {
      return { id: executionId, agentId: existing.id, at: now.toISOString(), status: 'aborted', duration: 0, output: null, error_code: 'TIMING_MISMATCH', credits_used: 0, log: `Timing mismatch - expected ${expectedLocal}, got ${nowLocal}. Aborted.`, trigger: triggerType }
    }
  }

  // 3. PENDING/APPROVAL GATE
  if (existing.status === 'pending' || existing.approved === false) {
    return { id: executionId, agentId: existing.id, at: now.toISOString(), status: 'skipped', duration: 0, output: null, error_code: 'APPROVAL_REQUIRED', credits_used: 0, log: 'Workflow is pending approval.', trigger: triggerType }
  }

  // 4. NEVER ASSUME MISSING DATA
  const missing = await validateAgentActions(existing, user)
  if (missing) {
    const record = { ...existing, status: 'pending', statusReason: `Missing required field: ${missing.field}`, updated_at: now.toISOString() }
    await saveServerAgent(record)
    return { id: executionId, agentId: existing.id, at: now.toISOString(), status: 'paused', duration: 0, output: null, error_code: 'MISSING_FIELD', credits_used: 0, log: `Missing required field: ${missing.field}. Workflow paused, waiting for user input.`, trigger: triggerType }
  }

  // CAMPAIGN BRANCH
  if (existing.campaign) {
    return runCampaignAgent(existing, triggerType, executionId, user, admin)
  }

  // 5. COST LOCK: pre-check budget
  const estimatedCredits = computeEstimatedCredits(existing)
  const maxCredits = Math.ceil(estimatedCredits * 1.2)
  const budget = { used: 0, max: maxCredits, estimated: estimatedCredits }
  const retryCount = existing.retryCount || 0
  const isRetry = trigger === 'schedule' && retryCount > 0

  if (userId && !isRetry && !admin) {
    const balance = await getUserCredits({ id: userId, email: userEmail })
    if (balance < estimatedCredits) {
      const execution = { id: executionId, agentId: existing.id, at: now.toISOString(), status: 'error', duration: 0, output: null, error_code: 'INSUFFICIENT_CREDITS', credits_used: 0, log: `Insufficient credits to run this automation. Need ${estimatedCredits}, have ${balance}. Top up to resume.`, trigger: triggerType }
      await addServerExecution(execution)
      await saveServerAgent({ ...existing, executionHistory: [execution, ...(existing.executionHistory || [])].slice(0, 100), lastRun: execution.at, status: 'paused', statusReason: 'Insufficient credits', updated_at: now.toISOString() })
      return execution
    }
  }

  // 6. Create in-progress execution record
  let execution = { id: executionId, agentId: existing.id, at: now.toISOString(), status: 'in_progress', duration: 0, output: null, error_code: null, credits_used: 0, log: 'Execution in progress', trigger: triggerType, steps: [] }
  await addServerExecution(execution)

  let monitorResult = null
  if (existing.trigger?.type === 'monitor' && existing.trigger?.url) {
    try {
      const response = await fetch(existing.trigger.url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(15000) })
      monitorResult = response.ok ? { ok: true, status: response.status } : { ok: false, status: response.status }
    } catch (error) { monitorResult = { ok: false, error: error instanceof Error ? error.message : 'Monitor fetch failed' } }
  }

  const config = supabaseConfig()
  const generatedActions = []
  for (const action of existing.actions || []) {
    const ready = await agentActionIsReady(user, action, config)
    if (!ready) {
      generatedActions.push({ ...action, _skipReason: 'connector not configured' })
      continue
    }
    const enriched = await enrichActionContent(existing, action)
    const needsGenerate = enriched.params?.generate === true || enriched.params?.generate === 'true' || (!enriched.params?.text && !enriched.params?.message && !enriched.params?.body)
    if (needsGenerate && ['x', 'linkedin', 'facebook', 'telegram', 'slack', 'discord', 'whatsapp', 'gmail', 'email'].includes(enriched.connector)) {
      const text = await generateActionContent(existing, enriched)
      const params = { ...enriched.params }
      if (enriched.connector === 'gmail' || enriched.connector === 'email') { if (!params.body && !params.text) params.body = text }
      else if (['telegram', 'slack', 'discord', 'whatsapp'].includes(enriched.connector)) params.message = text
      else params.text = text
      generatedActions.push({ ...enriched, params })
    } else {
      generatedActions.push(enriched)
    }
  }

  const results = []
  let hardStop = false
  for (const action of generatedActions) {
    if (hardStop) break
    const stepLabel = action.label || `${action.action} ${action.connector}`
    const stepCost = getStepCost(action, existing)

    // COST LOCK per step
    if (budget.used + stepCost > budget.max) {
      results.push({ connector: action.connector, action: action.action, status: 'paused', output: null, error_code: 'COST_LOCK', credits_used: 0, log: `Cost limit (${budget.max} credits) would be exceeded. Workflow paused pending approval.`, duration: 0, step: stepLabel })
      hardStop = true
      continue
    }

    // Approval gate per step
    if (action.requiresApproval && action.approvalStatus !== 'approved') {
      results.push({ connector: action.connector, action: action.action, status: 'paused', output: null, error_code: 'APPROVAL_REQUIRED', credits_used: 0, log: 'Step requires approval. Workflow paused.', duration: 0, step: stepLabel })
      hardStop = true
      continue
    }

    // Connector not configured
    if (action._skipReason) {
      results.push({ connector: action.connector, action: action.action, status: 'skipped', output: null, error_code: 'CONNECTOR_NOT_READY', credits_used: 0, log: `[${action.connector}] ${action.action} skipped — connector not configured for this user`, duration: 0, step: stepLabel })
      continue
    }

    // Validate action params just before act
    const creds = await resolveConnectorCredentials(user, action)
    const missingField = validateActionParams(action, creds)
    if (missingField) {
      results.push({ connector: action.connector, action: action.action, status: 'error', output: null, error_code: 'MISSING_FIELD', credits_used: 0, log: `Missing required field: ${missingField.field}. ${missingField.reason}`, duration: 0, step: stepLabel })
      continue
    }

    // Execute
    action._stepCost = stepCost
    const stepResult = await executeAgentAction(existing, action)
    const used = stepResult.credits_used || stepCost
    budget.used += used
    results.push({ ...stepResult, step: stepLabel })

    // Charge per successful step (admins bypass)
    if (stepResult.status === 'success' && userId && !isRetry && !admin) {
      const charge = await spendUserCredits({ id: userId, email: userEmail }, used, { automationId: existing.id, reason: `${action.connector}/${action.action}`, step: stepLabel })
      if (!charge) {
        results.push({ connector: action.connector, action: action.action, status: 'paused', output: null, error_code: 'INSUFFICIENT_CREDITS', credits_used: 0, log: 'Not enough credits to continue this automation. Top up to resume.', duration: 0, step: stepLabel })
        hardStop = true
        continue
      }
      try { await alphaBrain.logMemory(userId, { event_type: 'credit_spend', summary: `Agent step charged ${used} credits for ${action.connector}/${action.action}`, source_workflow_id: existing.id, metadata: { credits: used, connector: action.connector, action: action.action } }) } catch {}
    }

    if (stepResult.status === 'paused') hardStop = true
  }

  const monitorLog = monitorResult && !monitorResult.ok ? `Monitor check failed for ${existing.trigger.url}: ${monitorResult.status || monitorResult.error}. ` : ''
  const failed = results.filter(r => r.status === 'error')
  const skipped = results.filter(r => r.status === 'skipped')
  const paused = results.filter(r => r.status === 'paused')
  const successCount = results.filter(r => r.status === 'success').length
  const allSkipped = results.length > 0 && skipped.length === results.length
  const anyPaused = paused.length > 0

  let finalStatus = 'success'
  let errorCode = null
  if (anyPaused) { finalStatus = 'paused'; errorCode = paused[0]?.error_code || 'PAUSED' }
  else if (failed.length) { finalStatus = 'error'; errorCode = failed[0]?.error_code || 'EXECUTION_ERROR' }
  else if (allSkipped) { finalStatus = 'skipped'; errorCode = 'CONNECTOR_NOT_READY' }

  const log = monitorLog + (anyPaused ? `Workflow paused: ${paused[0]?.log || 'approval/cost limit reached'}` : (allSkipped ? `All ${results.length} action(s) skipped — no configured connectors for this agent.` : `Executed ${successCount}/${results.length} action(s) successfully. ${skipped.length ? `${skipped.length} skipped (not connected). ` : ''}${failed.length ? `Errors: ${failed.map(f => f.log).join('; ')}` : ''}`))

  const totalCreditsUsed = results.reduce((s, r) => s + (r.credits_used || 0), 0)
  const output = successCount > 0 ? results.filter(r => r.status === 'success').map(r => ({ step: r.step, output: r.output })) : null

  execution = { ...execution, status: finalStatus, duration: Date.now() - startTime, output, error_code: errorCode, credits_used: totalCreditsUsed, log, steps: results }
  await saveServerExecution(execution)

  const executionsDone = allSkipped ? (existing.executionsDone || 0) : (existing.executionsDone || 0) + 1
  let nextRetryCount = 0
  const scheduleTimezone = user?.timezone || existing.timezone || existing.userTimezone || 'UTC'
  let nextRun = (existing.trigger?.type === 'schedule' || existing.trigger?.type === 'monitor') ? nextRunFromCron(existing.trigger.cron || '0 8 * * *', new Date(), scheduleTimezone).toISOString() : undefined
  let status = finalStatus === 'error' ? 'warning' : finalStatus === 'paused' ? 'pending' : 'running'

  if (failed.length && !allSkipped && existing.trigger?.type === 'schedule') {
    if (isRetry && retryCount >= 3) {
      nextRetryCount = 0
    } else {
      nextRetryCount = isRetry ? retryCount + 1 : 1
      nextRun = new Date(now.getTime() + backoffMs(nextRetryCount)).toISOString()
    }
  } else if (failed.length && !allSkipped && existing.trigger?.type !== 'schedule') {
    status = 'warning'
  }

  if (existing.endDate && nextRun && new Date(nextRun) > new Date(existing.endDate)) {
    status = 'completed'
    execution.log += ` Reached end date (${existing.endDate}) and stopped.`
    nextRun = undefined
  }

  if (existing.executionsTotal && executionsDone >= existing.executionsTotal && !allSkipped) {
    status = 'paused'
    execution.log += ` Reached ${existing.executionsTotal} execution limit and paused.`
  }

  const newHistory = [execution, ...(existing.executionHistory || [])].slice(0, 100)
  const successes = newHistory.filter(e => e.status === 'success').length
  const successRate = newHistory.length ? Math.round((successes / newHistory.length) * 100) : 100

  const record = { ...existing, executionHistory: newHistory, lastRun: execution.at, status, updated_at: now.toISOString(), executionsDone, retryCount: nextRetryCount, successRate }
  if (existing.trigger?.type === 'schedule' || existing.trigger?.type === 'monitor') record.trigger = { ...existing.trigger, nextRun }
  await saveServerAgent(record)
  return execution
}

async function sendGmail(req, res) {
  const config = supabaseConfig()
  const user = await currentOrLocalUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const body = await readBody(req)
  try {
    const result = await sendEmailWithGmail(user, { to: body.to, subject: body.subject, html: body.html, text: body.text })
    return json(res, 200, result)
  } catch (error) {
    return json(res, 502, { error: error instanceof Error ? error.message : 'Email could not be sent' })
  }
}

async function ensureProfile(user, config) {
  const headers = serviceHeaders(config.service)
  const response = await fetch(`${config.url}/rest/v1/profiles?id=eq.${user.id}&select=id,email,credits,plan`, { headers })
  const existing = (await response.json())?.[0]
  if (existing) return existing
  const created = await fetch(`${config.url}/rest/v1/profiles`, { method: 'POST', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify({ id: user.id, email: user.email || '', credits: DEFAULT_CREDITS, plan: 'free' }) })
  if (!created.ok) throw new Error('Could not create the user credit profile')
  return (await created.json())[0]
}

async function creditSpend(req, res) {
  const config = supabaseConfig()
  try {
    const user = await currentOrLocalUser(req, config.url, config.anon)
    if (!user) return json(res, 401, { error: 'Authentication required' })
    const body = await readBody(req); const amount = Number(body.amount)
    if (!Number.isInteger(amount) || amount <= 0) return json(res, 400, { error: 'Invalid credit amount' })
    if (String(user.email || '').toLowerCase() === adminEmail) return json(res, 200, { ok: true, admin: true, credits: null })
    const spent = await spendUserCredits(user, amount)
    if (!spent) return json(res, 402, { error: 'Insufficient credits' })
    const remaining = await getUserCredits(user, config)
    return json(res, 200, { ok: true, credits: remaining })
  } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Credit operation failed' }) }
}

const userCreditsFile = path.resolve(dataDir, 'user-credits.json')
const userTransactionsFile = path.resolve(dataDir, 'transactions.json')

function readUserCreditsLocal(userId) {
  const all = readJsonFile(userCreditsFile, {})
  if (all[userId] == null) return null
  return Number(all[userId]) || 0
}
function writeUserCreditsLocal(userId, credits) {
  const all = readJsonFile(userCreditsFile, {})
  all[userId] = Math.max(0, Number(credits) || 0)
  writeJsonFile(userCreditsFile, all)
}
function logTransactionLocal(userId, amount, type, reference) {
  const transactions = readJsonFile(userTransactionsFile, [])
  transactions.unshift({ userId, amount: Number(amount), type, reference, at: new Date().toISOString() })
  writeJsonFile(userTransactionsFile, transactions.slice(0, 5000))
}

async function getUserCredits(user, config) {
  return billing.getUserCredits(user, config)
}

async function spendUserCredits(user, amount, metadata = {}) {
  const config = supabaseConfig()
  const result = await billing.spendCredits(user, amount, config, metadata)
  return result.ok
}

let conversationEngine = null
function getConversationEngine() {
  if (conversationEngine) return conversationEngine
  conversationEngine = createConversationEngine({
    callLLMForRole,
    saveServerAgent,
    getServerAgent,
    getUserCredits,
    spendUserCredits,
    getIntegrationStatus: async () => ({}),
  })
  return conversationEngine
}

async function addUserCredits(user, creditsToAdd, reference, type = 'purchase', metadata = {}) {
  const config = supabaseConfig()
  const result = await billing.addCredits(user, creditsToAdd, config, { reference, type, reason: metadata.reason, metadata })
  return result.remaining
}

const pendingTransactionsFile = path.resolve(dataDir, 'pending-transactions.json')
function readPendingTransactions() { return readJsonFile(pendingTransactionsFile, {}) }
function writePendingTransactions(all) { writeJsonFile(pendingTransactionsFile, all) }

async function initializePaystackPayment(req, res) {
  const config = supabaseConfig()
  const user = await currentOrLocalUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const body = await readBody(req)
  let item
  if (body.planId) {
    item = { type: 'subscription', planId: String(body.planId) }
  } else if (body.packId) {
    item = { type: 'credits', packId: String(body.packId) }
  } else {
    // Backwards-compatible fallback: derive pack from credits amount
    const credits = Number(body.credits || 0)
    const pack = billing.CREDIT_PACKS.find(p => p.credits === credits) || billing.CREDIT_PACKS[0]
    item = { type: 'credits', packId: pack.id }
  }
  try {
    const result = await billing.initializePayment('paystack', user, item, config)
    return json(res, 200, result)
  } catch (error) { return json(res, 502, { error: error instanceof Error ? error.message : 'Payment start failed' }) }
}

async function verifyAndAddCreditsByReference(reference) {
  try {
    const config = supabaseConfig()
    const result = await billing.verifyPayment('paystack', reference, config)
    if (!result.ok) return null
    return { user: result.user, credits: result.credits, balance: result.balance, plan: result.plan }
  } catch { return null }
}

async function paystackWebhookHandler(req, res) {
  const secret = process.env.PAYSTACK_SECRET_KEY
  if (!secret) return json(res, 503, { error: 'Paystack secret key not configured' })
  const signature = String(req.headers['x-paystack-signature'] || '')
  const raw = await readRawBody(req)
  const hash = createHmac('sha512', secret).update(raw).digest('hex')
  if (!signature || !timingSafeEqual(Buffer.from(signature), Buffer.from(hash))) return json(res, 400, { error: 'Invalid signature' })
  const body = JSON.parse(raw.toString('utf8'))
  const reference = await billing.verifyPaystackWebhook(body, secret)
  if (!reference) return json(res, 200, { received: true, ignored: body.event })
  if (reference && (body.data?.metadata?.type === 'marketplace' || String(reference).startsWith('alphatekx_marketplace_'))) {
    const order = await fulfillMarketplaceOrder(reference, body.data)
    return json(res, 200, { received: true, reference, marketplace: order ? true : false })
  }
  const result = await verifyAndAddCreditsByReference(reference)
  return json(res, 200, { received: true, reference, result })
}

async function creditsBalance(req, res) {
  const config = supabaseConfig()
  const user = await currentOrLocalUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const credits = await getUserCredits(user, config)
  return json(res, 200, { credits })
}

async function billingHandler(req, res) {
  const config = supabaseConfig()
  const user = await currentOrLocalUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  if (req.method === 'GET') {
    const summary = await billing.getUserBilling(user, config)
    return json(res, 200, summary)
  }
  if (req.method === 'POST' && req.url === '/api/billing/upgrade') {
    const body = await readBody(req)
    const planId = String(body.planId || '')
    if (!billing.getPlan(planId).id) return json(res, 400, { error: 'Invalid plan' })
    const result = await billing.setPlan(user, planId, config)
    return json(res, 200, result)
  }
  return json(res, 405, { error: 'Method not allowed' })
}

function currentUserFromRequest(req) {
  const auth = String(req.headers.authorization || '')
  const token = auth.replace(/^bearer\s+/i, '').trim()
  try {
    const parts = token.split('.')
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
      if (payload.sub && payload.email) return { id: payload.sub, email: payload.email, name: payload.name || '' }
    }
  } catch {}
  return null
}

async function activityPing(req, res) {
  const config = supabaseConfig()
  const body = await readBody(req)
  const user = currentUserFromRequest(req) || body?.user
  if (user?.id && user?.email) {
    upsertLocalUser(user)
    recordLocalActivity({ type: 'ping', userId: user.id, email: user.email })
  }
  if (!config.url || !config.anon || !config.service) return json(res, 200, { ok: true })
  const authUser = await authenticatedUser(req, config.url, config.anon)
  if (!authUser) return json(res, 401, { error: 'Authentication required' })
  try {
    const response = await fetch(`${config.url}/rest/v1/profiles?id=eq.${authUser.id}`, { method: 'PATCH', headers: serviceHeaders(config.service), body: JSON.stringify({ last_active_at: new Date().toISOString() }) })
    if (!response.ok) {
      const text = await response.text()
      if (isMissingTable(text)) return json(res, 200, { ok: true, local: true })
      return json(res, 500, { error: 'Could not update activity' })
    }
    return json(res, 200, { ok: true })
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : 'Activity update failed' })
  }
}

async function adminProviderDiagnostics(req, res) {
  const tokenUser = currentUserFromRequest(req)
  const adminEmailHeader = String(req.headers['x-admin-email'] || '')
  const isAdmin = tokenUser?.email?.toLowerCase() === adminEmail || adminEmailHeader.toLowerCase() === adminEmail
  if (!isAdmin) return json(res, 403, { error: 'Admin access required' })
  const aiStats = (typeof alphaBrain?.getProviderStats === 'function' && alphaBrain.getProviderStats()) || { modelCalls: 0, fallbackCalls: 0 }
  return json(res, 200, { ...providerHealth.getAdminProviderDiagnostics(), aiStats })
}

async function adminProviderHealthCheck(req, res) {
  const tokenUser = currentUserFromRequest(req)
  const adminEmailHeader = String(req.headers['x-admin-email'] || '')
  const isAdmin = tokenUser?.email?.toLowerCase() === adminEmail || adminEmailHeader.toLowerCase() === adminEmail
  if (!isAdmin) return json(res, 403, { error: 'Admin access required' })
  const body = await readBody(req)
  const name = String(body.name || '')
  if (!providerHealth.getAllProviderHealth().some(p => p.name === name)) return json(res, 400, { error: 'Unknown provider' })
  const result = await providerHealth.checkProviderHealth(name, callProvider)
  return json(res, 200, result)
}

async function adminStats(req, res) {
  const config = supabaseConfig()
  const tokenUser = currentUserFromRequest(req)
  const adminEmailHeader = String(req.headers['x-admin-email'] || '')
  const isAdmin = tokenUser?.email?.toLowerCase() === adminEmail || adminEmailHeader.toLowerCase() === adminEmail
  if (!isAdmin) return json(res, 403, { error: 'Admin access required' })
  const local = localAdminStats()
  if (!config.url || !config.anon || !config.service) return json(res, 200, local)
  try {
    let response = await fetch(`${config.url}/rest/v1/profiles?select=id,email,credits,plan,created_at,last_active_at&order=created_at.desc&limit=200`, { headers: serviceHeaders(config.service) })
    if (!response.ok) response = await fetch(`${config.url}/rest/v1/profiles?select=id,email,credits,plan,created_at&order=created_at.desc&limit=200`, { headers: serviceHeaders(config.service) })
    if (!response.ok) {
      const text = await response.text()
      if (isMissingTable(text)) return json(res, 200, local)
      return json(res, 500, { error: 'Could not load live users' })
    }
    const users = await response.json(); const now = Date.now(); const today = new Date(); today.setHours(0,0,0,0)
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
    const lastMonthStart = new Date(monthStart); lastMonthStart.setMonth(lastMonthStart.getMonth() - 1)
    return json(res, 200, {
      total: users.length,
      active: users.filter(item => item.last_active_at && now - new Date(item.last_active_at).getTime() < 15 * 60_000).length,
      today: users.filter(item => new Date(item.created_at).getTime() >= today.getTime()).length,
      thisMonth: users.filter(item => new Date(item.created_at).getTime() >= monthStart.getTime()).length,
      lastMonth: users.filter(item => { const d = new Date(item.created_at).getTime(); return d >= lastMonthStart.getTime() && d < monthStart.getTime() }).length,
      users,
    })
  } catch (error) {
    return json(res, 200, local)
  }
}

const PLAN_AMOUNT = { starter: 500000, pro: 1500000, free: 200000, old_pro: 800000, posts: 100000 }

function resolvePlanFromBody(body) {
  const requested = String(body.plan || '').toLowerCase()
  if (requested === 'starter' || requested === 'pro' || requested === 'free' || requested === 'credits' || requested === 'posts') return requested
  const amount = Number(body.amount || 0) || Number(body.verified?.data?.amount || 0)
  if (amount === PLAN_AMOUNT.pro || amount === PLAN_AMOUNT.old_pro) return 'pro'
  if (amount === PLAN_AMOUNT.starter) return 'starter'
  if (amount === PLAN_AMOUNT.free) return 'free'
  if (amount === PLAN_AMOUNT.credits) return 'credits'
  if (amount === PLAN_AMOUNT.posts) return 'posts'
  return null
}

export async function verifyPaystack(req, res) {
  applyCors(req, res)
  try {
    const config = supabaseConfig()
    const body = await readBody(req)
    const reference = String(body.reference || '')
    if (!reference) return json(res, 400, { error: 'Missing payment reference.' })

    const devMode = process.env.NODE_ENV !== 'production' && !process.env.PAYSTACK_SECRET_KEY
    if (devMode) {
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required.' })
      const planId = body.planId || (body.plan === 'pro' ? 'pro_early_access' : body.plan === 'starter' ? 'pro_early_access' : null)
      const packId = body.packId
      if (planId) {
        const result = await billing.setPlan(user, planId, config)
        return json(res, 200, { verified: true, plan: result.plan, credits: result.remaining, amount: 0, mock: true })
      }
      const pack = packId ? billing.getCreditPack(packId) : (body.credits ? billing.CREDIT_PACKS.find(p => p.credits === Number(body.credits)) : billing.CREDIT_PACKS[0])
      const result = await billing.addCredits(user, pack?.credits || 100, config, { reference: 'dev-' + reference, type: 'purchase', reason: `Dev purchase: ${pack?.label || 'credits'}`, metadata: { packId: pack?.id, mock: true } })
      return json(res, 200, { verified: true, credits: result.remaining, plan: 'free', amount: pack?.amountKobo || 0, mock: true })
    }

    const result = await billing.verifyPayment('paystack', reference, config)
    if (!result.ok) return json(res, 400, { error: result.message || 'Verification failed' })
    return json(res, 200, { verified: true, credits: result.balance, plan: result.plan || 'free', amount: result.amount || 0, reference: result.reference })
  } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Verification failed.' }) }
}

export async function purchaseMarketplace(req, res) {
  applyCors(req, res)
  const secret = process.env.PAYSTACK_SECRET_KEY || ''
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!supabaseUrl || !anonKey || !serviceKey) return json(res, 503, { error: 'Marketplace settlement is not configured.' })
  try {
    const body = await readBody(req)
    const itemId = String(body.itemId || '')
    const reference = body.reference ? String(body.reference) : null
    const user = await authenticatedUser(req, supabaseUrl, anonKey)
    if (!user) return json(res, 401, { error: 'Authentication required.' })
    const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
    const itemResponse = await fetch(`${supabaseUrl}/rest/v1/marketplace_items?id=eq.${encodeURIComponent(itemId)}&select=id,price,price_type`, { headers })
    const item = (await itemResponse.json())?.[0]
    if (!item) return json(res, 404, { error: 'Marketplace item not found.' })
    if (item.price_type === 'paid') {
      if (!secret || !reference) return json(res, 400, { error: 'A verified Paystack payment is required.' })
      const verified = await fetchJson(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${secret}` } })
      if (verified.data?.status !== 'success' || verified.data?.currency !== 'NGN' || verified.data?.amount !== Math.round(Number(item.price) * 100)) return json(res, 400, { error: 'Payment amount does not match this item.' })
    }
    const rpc = await fetch(`${supabaseUrl}/rest/v1/rpc/complete_marketplace_purchase`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_item_id: itemId, p_buyer_id: user.id, p_reference: reference }) })
    const result = await rpc.json()
    return rpc.ok ? json(res, 200, result) : json(res, 400, { error: result.message || 'Purchase could not be completed.' })
  } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Marketplace purchase failed.' }) }
}

const validSlug = (value) => /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(value)
const validProjectName = (value) => /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(value)
const RESERVED_NAMES = new Set(['admin', 'api', 'www', 'dashboard', 'app', 'test', 'login', 'auth', 'cdn', 'static', 'assets', 'images', 'mail', 'smtp', 'pop', 'imap', 'blog', 'shop', 'store', 'status', 'health', 'docs', 'support', 'help', 'console', 'dev', 'staging', 'alpha', 'beta', 'gamma', 'cms', 'manage', 'panel', 'root', 'localhost', 'news', 'email', 'mx', 'ns1', 'ns2', 'mailer', 'ftp', 'sftp', 'webmail', 'calendar', 'drive', 'files', 'media', 'uploads', 'downloads', 'scripts', 'css', 'js'])

function slugifyName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30) || 'my-app'
}

function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  return forwarded || req.socket?.remoteAddress || 'unknown'
}

const availabilityRateLimit = new Map()
const AVAILABILITY_WINDOW_MS = 60_000
const AVAILABILITY_MAX_REQUESTS = 60

function checkAvailabilityRateLimit(ip) {
  const now = Date.now()
  const record = availabilityRateLimit.get(ip)
  if (!record || record.resetAt <= now) {
    availabilityRateLimit.set(ip, { count: 1, resetAt: now + AVAILABILITY_WINDOW_MS })
    return true
  }
  if (record.count >= AVAILABILITY_MAX_REQUESTS) return false
  record.count += 1
  return true
}

function generateNameSuggestions(name, slug) {
  const base = slug.replace(/-\d+$/, '') || name.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 20) || 'app'
  const suggestions = []
  const randomPart = () => Math.floor(Math.random() * 9000) + 1000
  const alternatives = [`${base}-${randomPart()}`, `${base}-${new Date().getFullYear()}`, `${base}-app`]
  for (const s of alternatives) {
    const clean = slugifyName(s)
    if (validProjectName(clean) && !RESERVED_NAMES.has(clean) && !suggestions.includes(clean)) suggestions.push(clean)
  }
  return suggestions.slice(0, 3)
}

async function checkGlobalProjectAvailability(name, config, excludeId = '') {
  const nameLower = slugifyName(name)
  const slug = nameLower
  const result = { name: nameLower, slug, available: false, reserved: false, invalid: false, reason: '', suggestions: [], exists: null }
  if (RESERVED_NAMES.has(nameLower)) {
    result.reserved = true
    result.reason = 'This name is reserved by AlphaTekX.'
    result.suggestions = generateNameSuggestions(nameLower, slug)
    return result
  }
  if (!validProjectName(nameLower)) {
    result.invalid = true
    result.reason = 'Use 3-30 lowercase letters, numbers, or hyphens. Must start and end with a letter or number.'
    return result
  }
  if (config.url && config.service) {
    try {
      const query = `or=(slug.eq.${encodeURIComponent(slug)},title.ilike.${encodeURIComponent(nameLower)})&${excludeId ? `id=neq.${encodeURIComponent(excludeId)}&` : ''}select=id,title,slug,user_id&limit=5`
      const response = await fetch(`${config.url}/rest/v1/creations?${query}`, { headers: serviceHeaders(config.service) })
      if (response.ok) {
        const rows = await response.json()
        if (Array.isArray(rows) && rows.length) {
          const conflict = rows.find(r => r.slug === slug) || rows[0]
          result.exists = conflict
          result.reason = conflict.slug === slug ? `The address ${slug}.alphatekx.name.ng is already taken.` : `The name "${conflict.title || nameLower}" is already in use.`
          result.suggestions = generateNameSuggestions(nameLower, slug)
          return result
        }
      }
    } catch {}
  }
  const local = readLocalDeployment(slug)
  if (local && (!excludeId || local.id !== excludeId)) {
    result.exists = local
    result.reason = `The address ${slug}.alphatekx.name.ng is already taken.`
    result.suggestions = generateNameSuggestions(nameLower, slug)
    return result
  }
  result.available = true
  result.urlPreview = `https://${slug}.alphatekx.name.ng`
  result.pathPreview = `https://alphatekx.name.ng/app/${slug}`
  return result
}

async function handleCheckAvailability(req, res) {
  const ip = getClientIp(req)
  if (!checkAvailabilityRateLimit(ip)) return json(res, 429, { error: 'Too many checks. Slow down.' })
  const url = new URL(req.url || '/', publicAppUrl())
  const name = String(url.searchParams.get('name') || '')
  if (!name.trim()) return json(res, 400, { error: 'Name is required.' })
  const config = supabaseConfig()
  const result = await checkGlobalProjectAvailability(name, config)
  return json(res, 200, result)
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
const scriptJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')

export function normalizePublishedCode(rawCode) {
  const value = String(rawCode || '')
  const fenced = value.match(/```(?:tsx|jsx|javascript|js)?\s*([\s\S]*?)```/i)?.[1] || value
  let code = fenced
    .replace(/^\s*import[^;]+;?\s*$/gm, '')
    .replace(/export\s+default\s+/g, '')
    .replace(/ReactDOM\.createRoot\([\s\S]*?\)\.render\s*\([\s\S]*?\);?\s*/gi, '')
    .trim()
  if (!/ReactDOM\.createRoot/.test(code)) {
    const component = code.match(/function\s+(AlphaApp|App)\s*\(/)?.[1]
      || code.match(/function\s+([A-Z][A-Za-z0-9_]*)\s*\(/)?.[1]
      || code.match(/const\s+(AlphaApp|App)\s*=\s*(?:\([^)]*\)|[^=])\s*=>/)?.[1]
      || code.match(/const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*(?:\([^)]*\)|[^=])\s*=>/)?.[1]
    if (component) code += `\nReactDOM.createRoot(document.getElementById('root')).render(<${component} />);`
  }
  return code.replace(/<\/script/gi, '<\\/script')
}

export function publishedAppDocument(creation, baseUrl = publicAppUrl()) {
  const slug = String(creation.slug)
  const title = escapeHtml(creation.title || slug)
  const code = normalizePublishedCode(creation.code)
  const storageBridge = `<script>const __alphaState=(()=>{try{return JSON.parse(__ALPHA_STORAGE_JSON__||'{}')}catch{return {}}})();const __alphaStorage={getItem:key=>Object.prototype.hasOwnProperty.call(__alphaState,key)?String(__alphaState[key]):null,setItem:(key,value)=>{__alphaState[key]=String(value);parent.postMessage({type:'alphatekx-app-storage',slug:${scriptJson(slug)},state:__alphaState},'*')},removeItem:key=>{delete __alphaState[key];parent.postMessage({type:'alphatekx-app-storage',slug:${scriptJson(slug)},state:__alphaState},'*')},clear:()=>{Object.keys(__alphaState).forEach(key=>delete __alphaState[key]);parent.postMessage({type:'alphatekx-app-storage',slug:${scriptJson(slug)},state:__alphaState},'*')},key:index=>Object.keys(__alphaState)[index]??null,get length(){return Object.keys(__alphaState).length}};window.__alphaStorage=__alphaStorage;try{Object.defineProperty(window,'localStorage',{value:__alphaStorage,configurable:true})}catch{}</script>`
  const apiBridge = `<script>window.ALPHA_APP_SLUG=${scriptJson(slug)};window.ALPHA_API_BASE=${scriptJson(String(baseUrl).replace(/\/$/, '') + '/api')};window.AlphaAPI={headers(){try{const raw=window.parent.localStorage.getItem('alphatekx:local-user');if(raw){const u=JSON.parse(raw);return{'x-local-user-id':String(u.id||''),'x-local-user-email':String(u.email||'')};}}catch{}return{};},url(entity,id){return window.ALPHA_API_BASE+'/apps/'+window.ALPHA_APP_SLUG+'/'+entity+(id?'/'+id:'');},async get(entity,id){const r=await fetch(this.url(entity,id),{headers:this.headers()});return r.json();},async post(entity,data){const r=await fetch(this.url(entity),{method:'POST',headers:{...this.headers(),'Content-Type':'application/json'},body:JSON.stringify(data)});return r.json();},async put(entity,id,data){const r=await fetch(this.url(entity,id),{method:'PUT',headers:{...this.headers(),'Content-Type':'application/json'},body:JSON.stringify(data)});return r.json();},async del(entity,id){const r=await fetch(this.url(entity,id),{method:'DELETE',headers:this.headers()});return r.json();}};</script>`
  const appRuntimeFix = `<script>!function(){function f(){var h=document.querySelector('header');if(!h)return;h.style.position='fixed';h.style.top='0';h.style.left='0';h.style.right='0';h.style.zIndex='9999';var hh=h.offsetHeight||56,m=document.querySelector('main');if(!m||m===h)m=h.nextElementSibling||h.parentElement&&h.parentElement.firstElementChild;if(m&&m!==h){var e=parseInt(getComputedStyle(m).paddingTop||'0',10);m.style.paddingTop=Math.max(e,hh)+'px';m.style.overflowY='auto';m.style.flex='1 1 0';m.style.minHeight='0'}}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',f);else setTimeout(f,50);setTimeout(f,400)}()</script>`
  const isHtml = /<(?:!doctype\s+html|html|body)[\s>]/i.test(String(creation.code || ''))
  const pastedHtml = String(creation.code || '')
  const pastedDocument = /<head[^>]*>/i.test(pastedHtml)
    ? pastedHtml.replace(/<head([^>]*)>/i, `<head$1>${storageBridge}${appRuntimeFix}`)
    : pastedHtml.replace(/<body([^>]*)>/i, `${storageBridge}${appRuntimeFix}<body$1>`)
  const scriptBase = String(baseUrl).replace(/\/$/, '')
  const innerDocument = isHtml
    ? pastedDocument
    : `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><base target="_blank"><script src="https://cdn.tailwindcss.com"></script><script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script><script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script><script src="https://unpkg.com/@babel/standalone/babel.min.js"></script><script src="${scriptBase}/alpha-ui.js"></script><style>html,body,#root{min-height:100%;margin:0}*{box-sizing:border-box}.alpha-runtime-error{margin:24px;padding:16px;border:1px solid #fecaca;border-radius:12px;background:#fef2f2;color:#991b1b;font:14px system-ui}</style>${storageBridge}${apiBridge}${appRuntimeFix}</head><body><div id="root"></div><script>window.addEventListener('error',event=>{const root=document.getElementById('root');if(root&&!root.childElementCount)root.innerHTML='<div class="alpha-runtime-error"><strong>This app could not start.</strong><br>'+String(event.message||'Runtime error').replace(/[&<>]/g,value=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[value]))+'</div>'});</script><script type="text/babel">const localStorage=window.__alphaStorage;${code}</script></body></html>`
  return `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="index,follow"><title>${title} — Built with AlphaTekX</title><style>html,body{width:100%;height:100%;margin:0;background:#fff}iframe{display:block;width:100%;height:100%;border:0}</style></head><body><iframe id="alpha-app" title="${title}" sandbox="allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads allow-same-origin"></iframe><script>const frame=document.getElementById('alpha-app');const storageKey='alphatekx:published:${slug}';let stored='{}';try{stored=localStorage.getItem(storageKey)||'{}'}catch{}const template=${scriptJson(innerDocument)};frame.srcdoc=template.replace('__ALPHA_STORAGE_JSON__',JSON.stringify(stored).replace(/</g,'\\u003c'));addEventListener('message',event=>{if(event.source!==frame.contentWindow||event.data?.type!=='alphatekx-app-storage'||event.data?.slug!==${scriptJson(slug)})return;const state=event.data.state;if(!state||typeof state!=='object'||Array.isArray(state))return;const encoded=JSON.stringify(state);if(encoded.length>500000)return;try{localStorage.setItem(storageKey,encoded)}catch{}});</script></body></html>`
}

const requestSubdomain = (req) => {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase().split(':')[0]
  const suffix = '.alphatekx.name.ng'
  if (!host.endsWith(suffix)) return null
  const candidate = host.slice(0, -suffix.length)
  return candidate && candidate !== 'www' && !candidate.includes('.') && validSlug(candidate) ? candidate : null
}

async function fetchPublishedCreation(slug) {
  const config = supabaseConfig()
  if (!config.url || !config.anon) throw new Error('Path deployment is not configured.')
  const response = await fetch(`${config.url}/rest/v1/creations?slug=eq.${encodeURIComponent(slug)}&published=eq.true&select=id,title,slug,code&limit=1`, { headers: deploymentReadHeaders(config) })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.message || 'Could not load the published app. Run supabase/path-deploy.sql once.')
  return payload?.[0] || null
}

async function servePublishedCreation(req, res, slug) {
  if (!validSlug(slug)) return json(res, 404, { error: 'App not found' })
  try {
    let creation = await fetchPublishedCreation(slug).catch(() => null)
    if (!creation) creation = readLocalDeployment(slug)
    if (!creation) return json(res, 404, { error: 'App not found' })
    const html = publishedAppDocument(creation, publicAppUrl())
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
      'Content-Security-Policy': "default-src 'self'; frame-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://unpkg.com; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: blob: https:; font-src 'self' data: https:; connect-src https:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    })
    return req.method === 'HEAD' ? res.end() : res.end(html)
  } catch (error) {
    return json(res, 503, { error: error instanceof Error ? error.message : 'Published app unavailable' })
  }
}

function deploymentPath(slug) { return path.resolve(deploymentsDir, `${slug}.json`) }
function readLocalDeployment(slug) {
  try {
    const file = deploymentPath(slug)
    if (!fs.existsSync(file)) return null
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    return { id: data.id || slug, title: data.title || slug, slug: data.slug || slug, code: data.code || '' }
  } catch { return null }
}
function writeLocalDeployment(slug, data) {
  try {
    fs.mkdirSync(deploymentsDir, { recursive: true })
    const file = deploymentPath(slug)
    fs.writeFileSync(file, JSON.stringify({ ...data, slug, updatedAt: new Date().toISOString() }), 'utf8')
    return true
  } catch { return false }
}

const previewPath = (missionId) => path.resolve(previewsDir, `${missionId}.json`)
function readPreviewCreation(missionId) {
  try {
    const file = previewPath(missionId)
    if (!fs.existsSync(file)) return null
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    return { id: data.id || missionId, title: data.title || 'Preview', slug: data.slug || `preview-${missionId}`, code: data.code || '', files: data.files || [] }
  } catch { return null }
}
function writePreviewCreation(missionId, data) {
  try {
    fs.mkdirSync(previewsDir, { recursive: true })
    fs.writeFileSync(previewPath(missionId), JSON.stringify({ ...data, slug: `preview-${missionId}`, updatedAt: new Date().toISOString() }), 'utf8')
    return true
  } catch { return false }
}
function previewDocument(creation, baseUrl = publicAppUrl()) {
  const slug = creation.slug || `preview-${creation.id || 'app'}`
  return publishedAppDocument({ ...creation, slug }, baseUrl)
}
function servePreview(req, res, missionId) {
  const creation = readPreviewCreation(missionId)
  if (!creation || !creation.code.trim()) return json(res, 404, { error: 'Preview not found. Build the project first.' })
  const html = previewDocument(creation, publicAppUrl())
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Content-Security-Policy': "default-src 'self'; frame-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://unpkg.com; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: blob: https:; font-src 'self' data: https:; connect-src https:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
  })
  return req.method === 'HEAD' ? res.end() : res.end(html)
}

function readJsonFile(file, defaultValue = []) {
  try {
    if (!fs.existsSync(file)) return defaultValue
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch { return defaultValue }
}
function writeJsonFile(file, data) {
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 2)); return true } catch { return false }
}
function localUserFromRequest(req) {
  const header = String(req.headers['x-local-user'] || '')
  if (header) {
    try {
      const parsed = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'))
      if (parsed.id && parsed.email) return { id: parsed.id, email: parsed.email }
    } catch {}
  }
  const id = String(req.headers['x-local-user-id'] || '')
  const email = String(req.headers['x-local-user-email'] || '')
  if (id && email) return { id, email }
  return null
}
function currentOrLocalUser(req, supabaseUrl, anonKey) {
  return new Promise(async resolve => {
    if (req.alphaUser) return resolve(req.alphaUser)
    const fromToken = await authenticatedUser(req, supabaseUrl, anonKey).catch(() => null)
    if (fromToken) { req.alphaUser = fromToken; return resolve(fromToken) }
    const local = localUserFromRequest(req)
    if (local) req.alphaUser = local
    resolve(local)
  })
}

async function appDataHandler(req, res) {
  const urlPath = new URL(req.url || '/', 'http://localhost').pathname
  const match = urlPath.match(/^\/api\/apps\/([^/]+)\/([^/]+)(?:\/([^/]+))?\/?$/)
  const migrateMatch = urlPath.match(/^\/api\/apps\/([^/]+)\/migrate\/?$/)
  const slug = match?.[1] || migrateMatch?.[1]
  if (!slug || !validSlug(slug)) return false
  const config = supabaseConfig()
  const user = await currentOrLocalUser(req, config.url, config.anon).catch(() => null)
  const isAdmin = user?.email === adminEmail
  if (migrateMatch && req.method === 'POST') {
    json(res, 200, { sql: appEntitiesMigrationSql(slug), note: 'Run this SQL in your Supabase SQL Editor if you want data in Supabase. Local JSON storage is active now.' })
    return true
  }
  if (!match) return false
  const entity = match[2]
  const id = match[3]
  if (req.method === 'GET') {
    if (id) { const record = getRecord(slug, entity, id); json(res, record ? 200 : 404, record || { error: 'Not found' }); return true }
    const url = new URL(req.url || '/', publicAppUrl())
    json(res, 200, { records: getRecords(slug, entity, Object.fromEntries(url.searchParams)) })
    return true
  }
  if (!user) { json(res, 401, { error: 'Authentication required. Provide x-local-user-id and x-local-user-email headers or a Supabase Bearer token.' }); return true }
  if (req.method === 'POST') {
    const body = await readBody(req)
    const result = createRecord(slug, entity, body, user)
    json(res, 201, result)
    return true
  }
  if (req.method === 'PUT' && id) {
    const body = await readBody(req)
    const result = updateRecord(slug, entity, id, body, user, isAdmin)
    if (!result) { json(res, 404, { error: 'Not found' }); return true }
    if (result.error) { json(res, result.status || 403, { error: result.error }); return true }
    json(res, 200, result)
    return true
  }
  if (req.method === 'DELETE' && id) {
    const result = deleteRecord(slug, entity, id, user, isAdmin)
    if (!result) { json(res, 404, { error: 'Not found' }); return true }
    if (result.error) { json(res, result.status || 403, { error: result.error }); return true }
    json(res, 200, result)
    return true
  }
  json(res, 405, { error: 'Method not allowed' })
  return true
}

function readLocalIntegrations() { return readJsonFile(integrationsFile, {}) }
function writeLocalIntegrations(data) { writeJsonFile(integrationsFile, data) }
function getLocalGoogle(userId) {
  const all = readLocalIntegrations()
  return all[userId]?.google || all[userId]?.google_gmail || null
}
function setLocalGoogle(userId, record) {
  const all = readLocalIntegrations()
  if (!all[userId]) all[userId] = {}
  all[userId].google = { ...record, local: true, provider: 'google', updated_at: new Date().toISOString() }
  writeLocalIntegrations(all)
}
function deleteLocalGoogle(userId) {
  const all = readLocalIntegrations()
  if (all[userId]) { delete all[userId].google; delete all[userId].google_gmail }
  writeLocalIntegrations(all)
}

const allConnectorProviders = ['google', 'gmail', 'google_sheets', 'google_calendar', 'google_drive', 'calendar', 'github', 'linkedin', 'x', 'facebook', 'whatsapp', 'paystack', 'supabase', 'notion', 'slack', 'discord', 'telegram', 'email']
const googleProviderIds = new Set(['gmail', 'google_sheets', 'google_calendar', 'google_drive', 'calendar'])

function providerForConnector(id) {
  if (googleProviderIds.has(id)) return 'google'
  return id
}

function encryptGenericTokens(tokens, key) {
  if (!key) return tokens
  return { payload: encryptSecret(JSON.stringify(tokens), key) }
}
function decryptGenericTokens(tokens, key) {
  if (!tokens) return {}
  if (tokens.payload && key) {
    const decrypted = decryptSecret(tokens.payload, key)
    try { return JSON.parse(decrypted || '{}') } catch { return {} }
  }
  return tokens
}

function getLocalIntegration(userId, provider) {
  const all = readLocalIntegrations()
  return all[userId]?.[provider] || null
}
function setLocalIntegration(userId, provider, record) {
  const all = readLocalIntegrations()
  if (!all[userId]) all[userId] = {}
  all[userId][provider] = { ...record, local: true, provider, updated_at: new Date().toISOString() }
  writeLocalIntegrations(all)
}
function deleteLocalIntegration(userId, provider) {
  const all = readLocalIntegrations()
  if (all[userId]) { delete all[userId][provider] }
  writeLocalIntegrations(all)
}

async function getAuthAppMetadata(userId, config) {
  if (!config.url || !config.service) return null
  try {
    const res = await fetch(`${config.url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, { headers: serviceHeaders(config.service) })
    if (!res.ok) return null
    const data = await res.json()
    return data?.user?.app_metadata || data?.app_metadata || null
  } catch (err) { process.stdout.write(`[auth metadata] get failed: ${err instanceof Error ? err.message : err}\n`); return null }
}

async function saveAuthAppIntegration(userId, provider, data, config) {
  if (!config.url || !config.service) return false
  try {
    const meta = (await getAuthAppMetadata(userId, config)) || {}
    const integrations = meta.integrations || {}
    const key = encryptionKey(config)
    integrations[provider] = {
      provider,
      email: data.email || data.identifier || null,
      identifier: data.identifier || null,
      scopes: data.scopes || [],
      tokens: encryptGenericTokens(data.tokens || {}, key),
      updated_at: new Date().toISOString(),
    }
    const res = await fetch(`${config.url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      headers: { apikey: config.service, Authorization: `Bearer ${config.service}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_metadata: { ...meta, integrations } }),
    })
    return res.ok
  } catch (err) { process.stdout.write(`[auth metadata] save failed: ${err instanceof Error ? err.message : err}\n`); return false }
}

async function getAuthAppIntegration(userId, provider, config) {
  const meta = await getAuthAppMetadata(userId, config)
  const record = meta?.integrations?.[provider]
  if (!record) return null
  const key = encryptionKey(config)
  const tokens = decryptGenericTokens(record.tokens, key)
  return { id: `${userId}-${provider}`, user_id: userId, provider, email: record.email || null, identifier: record.identifier || record.email || tokens.identifier || null, tokens, scopes: record.scopes || [], source: 'auth_app_metadata' }
}

async function getUserIntegration(userId, provider, config) {
  if (provider === 'google') return getGoogleIntegration(userId, config)
  if (config.url && config.service) {
    try {
      const response = await fetch(`${config.url}/rest/v1/connected_accounts?user_id=eq.${encodeURIComponent(userId)}&provider=eq.${encodeURIComponent(provider)}&select=*`, { headers: serviceHeaders(config.service) })
      if (response.ok) {
        const rows = await response.json()
        const row = rows?.[0]
        if (row) {
          const key = encryptionKey(config)
          const tokens = decryptGenericTokens(row.tokens, key)
          return { id: row.id, user_id: row.user_id, provider, email: row.email || null, identifier: row.email || tokens.identifier || null, tokens, scopes: row.scopes || [], source: 'connected_accounts' }
        }
      }
    } catch (err) { process.stdout.write(`[get integration] connected_accounts lookup failed: ${err instanceof Error ? err.message : err}\n`) }
    try {
      const fromAuth = await getAuthAppIntegration(userId, provider, config)
      if (fromAuth) return fromAuth
    } catch (err) { process.stdout.write(`[get integration] auth metadata lookup failed: ${err instanceof Error ? err.message : err}\n`) }
  }
  return getLocalIntegration(userId, provider)
}

async function saveUserIntegration(userId, provider, data, config) {
  const record = { user_id: userId, provider, email: data.email || data.identifier || null, scopes: data.scopes || [], updated_at: new Date().toISOString() }
  let savedRemote = false
  if (config.url && config.service) {
    const key = encryptionKey(config)
    const remote = { ...record, tokens: encryptGenericTokens(data.tokens || {}, key) }
    try {
      const response = await fetch(`${config.url}/rest/v1/connected_accounts?on_conflict=user_id,provider`, { method: 'POST', headers: { ...serviceHeaders(config.service), Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(remote) })
      if (response.ok) savedRemote = true
      else if (response.status === 404) {
        savedRemote = await saveAuthAppIntegration(userId, provider, data, config)
      }
    } catch (err) { process.stdout.write(`[save integration] connected_accounts save failed: ${err instanceof Error ? err.message : err}\n`) }
    if (!savedRemote) savedRemote = await saveAuthAppIntegration(userId, provider, data, config)
  }
  if (!savedRemote) setLocalIntegration(userId, provider, { ...record, tokens: data.tokens || {} })
}

async function deleteUserIntegration(userId, provider, config) {
  if (provider === 'google') return disconnectGoogleByUser(userId, config)
  if (config.url && config.service) {
    await fetch(`${config.url}/rest/v1/connected_accounts?user_id=eq.${encodeURIComponent(userId)}&provider=eq.${encodeURIComponent(provider)}`, { method: 'DELETE', headers: serviceHeaders(config.service) }).catch(() => {})
    try {
      const meta = await getAuthAppMetadata(userId, config)
      if (meta?.integrations?.[provider]) {
        const integrations = { ...meta.integrations }
        delete integrations[provider]
        await fetch(`${config.url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
          method: 'PUT',
          headers: { apikey: config.service, Authorization: `Bearer ${config.service}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ app_metadata: { ...meta, integrations } }),
        }).catch(() => {})
      }
    } catch {}
  }
  deleteLocalIntegration(userId, provider)
}

async function disconnectGoogleByUser(userId, config) {
  const integration = await getGoogleIntegration(userId, config).catch(() => null)
  if (integration?.access_token) {
    try { await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: integration.access_token }) }) } catch {}
  }
  if (config.url && config.service) {
    await fetch(`${config.url}/rest/v1/connected_accounts?user_id=eq.${encodeURIComponent(userId)}&provider=eq.google`, { method: 'DELETE', headers: serviceHeaders(config.service) }).catch(() => {})
    await fetch(`${config.url}/rest/v1/user_integrations?user_id=eq.${encodeURIComponent(userId)}&provider=eq.google`, { method: 'DELETE', headers: serviceHeaders(config.service) }).catch(() => {})
  }
  deleteLocalGoogle(userId)
}

async function googleAccessToken(userId, config) {
  const integration = await getGoogleIntegration(userId, config)
  if (!integration) throw new Error('Google account is not connected. Connect Google in Connectors first.')
  return refreshGoogleTokens(integration, config)
}

async function googleSheetsAppendRow(userId, params) {
  const config = supabaseConfig()
  const accessToken = await googleAccessToken(userId, config)
  let spreadsheetId = String(params.spreadsheetId || process.env.GOOGLE_SHEETS_DEFAULT_SPREADSHEET_ID || '')
  if (!spreadsheetId) {
    const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ properties: { title: 'AlphaTekX Agent Log' } }) })
    const createData = await createRes.json()
    if (!createRes.ok) throw new Error(createData.error?.message || 'Could not create Google Sheet')
    spreadsheetId = createData.spreadsheetId
  }
  const sheetName = String(params.sheetName || 'Sheet1')
  const values = Array.isArray(params.values) ? params.values : [String(params.values || '')]
  if (values.length === 0 || values.every(v => String(v).trim() === '')) throw new Error('Cannot append empty row')

  // Strict idempotency: do not append a row identical to one of the last 5 rows
  try {
    const lastRange = encodeURIComponent(`${sheetName}!A1:Z5`)
    const lastRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${lastRange}`, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (lastRes.ok) {
      const lastData = await lastRes.json()
      const lastRows = lastData.values || []
      const newRowKey = JSON.stringify(values)
      if (lastRows.some(row => JSON.stringify(row) === newRowKey)) throw new Error('DUPLICATE_ROW')
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'DUPLICATE_ROW') throw err
    // Non-fatal: if reading fails, still attempt append
  }

  const range = encodeURIComponent(`${sheetName}!A1`)
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [values] }) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error?.message || 'Google Sheets append failed')
  return data
}

async function googleSheetsReadRows(userId, params) {
  const config = supabaseConfig()
  const accessToken = await googleAccessToken(userId, config)
  const spreadsheetId = String(params.spreadsheetId || process.env.GOOGLE_SHEETS_DEFAULT_SPREADSHEET_ID || '')
  if (!spreadsheetId) throw new Error('Missing spreadsheetId')
  const sheetName = String(params.sheetName || 'Sheet1')
  const range = encodeURIComponent(`${sheetName}!A1:Z1000`)
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}`, { headers: { Authorization: `Bearer ${accessToken}` } })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error?.message || 'Google Sheets read failed')
  return data
}

async function googleCalendarCreateEvent(userId, params) {
  const config = supabaseConfig()
  const accessToken = await googleAccessToken(userId, config)
  const summary = String(params.summary || params.title || 'AlphaTekX event')
  const startInput = String(params.start || '')
  const endInput = String(params.end || '')
  let start = { dateTime: new Date(Date.now() + 60 * 60 * 1000).toISOString() }
  let end = { dateTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() }
  if (startInput) {
    const dateTime = new Date(startInput).toISOString()
    if (!dateTime.includes('T')) start = { date: startInput }
    else start = { dateTime }
  }
  if (endInput) {
    const dateTime = new Date(endInput).toISOString()
    if (!dateTime.includes('T')) end = { date: endInput }
    else end = { dateTime }
  }
  const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ summary, start, end }) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error?.message || 'Google Calendar create failed')
  return data
}

async function googleCalendarReadEvents(userId, params = {}) {
  const config = supabaseConfig()
  const accessToken = await googleAccessToken(userId, config)
  const timeZone = String(params.timeZone || 'UTC')
  const timeMin = String(params.timeMin || '')
  const timeMax = String(params.timeMax || '')
  if (!timeMin || !timeMax) {
    const bounds = getDayBoundsInTimezone(new Date(), timeZone)
    const min = bounds.start.toISOString()
    const max = bounds.end.toISOString()
    return googleCalendarReadEvents(userId, { ...params, timeMin: min, timeMax: max })
  }
  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
  url.searchParams.set('timeMin', timeMin)
  url.searchParams.set('timeMax', timeMax)
  url.searchParams.set('orderBy', 'startTime')
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('timeZone', timeZone)
  if (params.q) url.searchParams.set('q', String(params.q))
  const response = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error?.message || 'Google Calendar read failed')
  return data.items || []
}

function getDayBoundsInTimezone(date, timeZone = 'UTC') {
  const parts = getPartsInTimeZone(date, timeZone)
  if (!parts) {
    const start = new Date(date)
    start.setHours(0, 0, 0, 0)
    const end = new Date(date)
    end.setHours(23, 59, 59, 999)
    return { start, end }
  }
  const localNow = localDateFromParts(parts)
  const localStart = new Date(localNow.getFullYear(), localNow.getMonth(), localNow.getDate(), 0, 0, 0)
  const localEnd = new Date(localNow.getFullYear(), localNow.getMonth(), localNow.getDate(), 23, 59, 59, 999)
  return { start: localToUtc(localStart, timeZone), end: localToUtc(localEnd, timeZone) }
}

async function formatCalendarSummary(events, timeZone = 'UTC') {
  const today = new Date().toLocaleDateString('en-US', { timeZone, weekday: 'long', month: 'long', day: 'numeric' })
  if (!Array.isArray(events) || events.length === 0) {
    return { text: `You have no events on your calendar for ${today}.`, html: `<p>You have no events on your calendar for <strong>${today}</strong>.</p>` }
  }
  const listText = events.map(e => {
    const start = e.start?.dateTime ? new Date(e.start.dateTime) : (e.start?.date ? new Date(e.start.date) : null)
    const end = e.end?.dateTime ? new Date(e.end.dateTime) : (e.end?.date ? new Date(e.end.date) : null)
    let time = 'All day'
    if (start) {
      const sTime = start.toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit' })
      time = end ? `${sTime} – ${end.toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit' })}` : sTime
    }
    const summary = e.summary || '(No title)'
    const location = e.location ? ` at ${e.location}` : ''
    const link = e.htmlLink || ''
    return `- ${time}: ${summary}${location}${link ? ` (${link})` : ''}`
  }).join('\n')
  const text = `Your schedule for ${today}:\n\n${listText}`
  const html = `<p>Your schedule for <strong>${today}</strong>:</p><ul>${events.map(e => {
    const start = e.start?.dateTime ? new Date(e.start.dateTime) : (e.start?.date ? new Date(e.start.date) : null)
    const end = e.end?.dateTime ? new Date(e.end.dateTime) : (e.end?.date ? new Date(e.end.date) : null)
    let time = 'All day'
    if (start) time = end ? `${start.toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit' })} – ${end.toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit' })}` : start.toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit' })
    const summary = e.summary || '(No title)'
    const location = e.location ? ` at ${e.location}` : ''
    const link = e.htmlLink ? ` <a href="${e.htmlLink}">view</a>` : ''
    return `<li><strong>${time}</strong>: ${summary}${location}${link}</li>`
  }).join('')}</ul>`
  return { text, html }
}

async function gmailReadUnreadMessages(userId, params = {}) {
  const config = supabaseConfig()
  const accessToken = await googleAccessToken(userId, config)
  const max = Math.min(Number(params.max || 20), 50)
  const q = String(params.q || 'is:unread in:inbox')
  const url = new URL('https://www.googleapis.com/gmail/v1/users/me/messages')
  url.searchParams.set('q', q)
  url.searchParams.set('maxResults', String(max))
  const listRes = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
  const listData = await listRes.json()
  if (!listRes.ok) throw new Error(listData.error?.message || 'Gmail read failed')
  const messages = listData.messages || []
  const result = []
  for (const m of messages) {
    const msgRes = await fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(m.id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`, { headers: { Authorization: `Bearer ${accessToken}` } })
    const msg = await msgRes.json()
    if (!msgRes.ok) continue
    const subject = msg.payload?.headers?.find(h => h.name === 'Subject')?.value || '(No subject)'
    const from = msg.payload?.headers?.find(h => h.name === 'From')?.value || 'Unknown sender'
    result.push({ id: m.id, threadId: m.threadId, subject, from })
  }
  return result
}

async function googleDriveUploadFile(userId, params) {
  const config = supabaseConfig()
  const accessToken = await googleAccessToken(userId, config)
  const name = String(params.name || 'alpha-file')
  const mimeType = String(params.mimeType || 'text/plain')
  const content = String(params.content || '')
  const mediaRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=media', { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': mimeType }, body: content })
  const mediaData = await mediaRes.json()
  if (!mediaRes.ok) throw new Error(mediaData.error?.message || 'Google Drive upload failed')
  const patch = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(mediaData.id)}`, { method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
  const patchData = await patch.json()
  if (!patch.ok) throw new Error(patchData.error?.message || 'Google Drive rename failed')
  return patchData
}

async function connectorCredential(userId, provider, envName, field = 'api_key') {
  const config = supabaseConfig()
  const integration = await getUserIntegration(userId, provider, config)
  if (integration?.tokens?.[field]) return integration.tokens[field]
  if (integration?.tokens?.access_token) return integration.tokens.access_token
  const env = process.env[envName] || ''
  if (env) return env
  throw new Error(`${provider} is not connected. Add the connector in Connectors or set ${envName} on Render.`)
}

function connectorReady(platform) {
  switch (platform) {
    case 'gmail':
    case 'google_sheets':
    case 'google_calendar':
    case 'google_drive':
    case 'calendar':
      return googleConfigured()
    case 'discord':
      return !!(process.env.MASTER_DISCORD_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL)
    case 'slack':
      return !!(process.env.MASTER_SLACK_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL || process.env.MASTER_SLACK_BOT_TOKEN || process.env.SLACK_BOT_TOKEN)
    case 'telegram':
      return !!(process.env.MASTER_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN)
    case 'linkedin':
      return !!(process.env.MASTER_LINKEDIN_CLIENT_ID || process.env.LINKEDIN_CLIENT_ID || process.env.MASTER_LINKEDIN_ACCESS_TOKEN || process.env.LINKEDIN_ACCESS_TOKEN)
    case 'x':
      return !!(process.env.MASTER_X_BEARER_TOKEN || process.env.X_ACCESS_TOKEN || process.env.TWITTER_BEARER_TOKEN)
    case 'facebook':
      return !!(process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.FACEBOOK_ACCESS_TOKEN || process.env.MASTER_FACEBOOK_PAGE_ACCESS_TOKEN)
    case 'github':
      return !!(process.env.GITHUB_TOKEN || process.env.GITHUB_PAT_ALPHATEKX)
    case 'notion':
      return !!process.env.NOTION_TOKEN
    case 'paystack':
      return !!process.env.PAYSTACK_SECRET_KEY
    case 'supabase':
      return !!(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ADMIN_KEY))
    case 'email':
      return !!(process.env.RESEND_API_KEY || process.env.FROM_EMAIL)
    case 'whatsapp':
      return !!(process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_API_KEY || process.env.MASTER_WHATSAPP_TOKEN)
  }
  return false
}

async function agentActionIsReady(user, action, config) {
  const c = action.connector
  try {
    if (['gmail', 'google_sheets', 'google_calendar', 'google_drive', 'calendar'].includes(c)) {
      const google = await getGoogleIntegration(user.id, config)
      if (!google) return false
      const scopes = google.scopes || []
      if (action.action === 'email_summary' && (c === 'google_calendar' || c === 'calendar')) {
        return scopes.some(s => s.includes('calendar')) && scopes.some(s => s.includes('gmail.send'))
      }
      if (c === 'gmail') return scopes.some(s => s.includes('gmail.send'))
      if (c === 'google_sheets') return scopes.some(s => s.includes('spreadsheets'))
      if (c === 'google_calendar' || c === 'calendar') return scopes.some(s => s.includes('calendar'))
      if (c === 'google_drive') return scopes.some(s => s.includes('drive'))
      return true
    }
    if (['x', 'linkedin', 'facebook', 'telegram', 'slack', 'discord', 'whatsapp'].includes(c)) {
      if (action.action === 'send_gmail_summary' && c === 'telegram') {
        const google = await getGoogleIntegration(user.id, config)
        if (!google) return false
        const scopes = google.scopes || []
        if (!scopes.some(s => s.includes('gmail.readonly'))) return false
      }
      await getPostingCredentials(user, c, { _skipFreeLimit: true })
      return true
    }
    if (c === 'email') { await resendApiKey(user.id); return true }
    if (c === 'github') { await githubToken(user.id); return true }
    if (c === 'notion') { await notionToken(user.id); return true }
    if (c === 'paystack') return !!process.env.PAYSTACK_SECRET_KEY
    if (c === 'supabase') return !!(config.url && config.service)
    return false
  } catch { return false }
}

function masterCredentials(platform) {
  switch (platform) {
    case 'discord': {
      const url = process.env.MASTER_DISCORD_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL || ''
      if (url) return { webhookUrl: url }
      break
    }
    case 'slack': {
      const url = process.env.MASTER_SLACK_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL || ''
      if (url) return { webhookUrl: url }
      const token = process.env.MASTER_SLACK_BOT_TOKEN || process.env.SLACK_BOT_TOKEN || ''
      const channel = process.env.MASTER_SLACK_CHANNEL || process.env.SLACK_TEST_CHANNEL || ''
      if (token) return { accessToken: token, channel }
      break
    }
    case 'telegram': {
      const token = process.env.MASTER_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || ''
      const chatId = process.env.MASTER_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID || ''
      if (token) return { botToken: token, chatId }
      break
    }
    case 'linkedin': {
      const token = process.env.MASTER_LINKEDIN_ACCESS_TOKEN || process.env.LINKEDIN_ACCESS_TOKEN || ''
      const authorUrn = process.env.MASTER_LINKEDIN_AUTHOR_URN || process.env.LINKEDIN_AUTHOR_URN || ''
      if (token) return { accessToken: token, authorUrn }
      break
    }
    case 'x': {
      const token = process.env.MASTER_X_BEARER_TOKEN || process.env.X_ACCESS_TOKEN || process.env.TWITTER_BEARER_TOKEN || ''
      if (token) return { accessToken: token }
      break
    }
    case 'facebook': {
      const token = process.env.MASTER_FACEBOOK_PAGE_ACCESS_TOKEN || process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.FACEBOOK_ACCESS_TOKEN || ''
      const pageId = process.env.MASTER_FACEBOOK_PAGE_ID || process.env.FACEBOOK_PAGE_ID || ''
      if (token && pageId) return { accessToken: token, pageId }
      break
    }
    case 'whatsapp': {
      const token = process.env.MASTER_WHATSAPP_TOKEN || process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_API_KEY || ''
      const phoneNumberId = process.env.MASTER_WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID || ''
      if (token && phoneNumberId) return { accessToken: token, phoneNumberId }
      break
    }
  }
  return null
}

async function getPostingCredentials(user, platform, params = {}) {
  const skipFreeLimit = params._skipFreeLimit === true
  if (!user?.id) throw new Error('User required')
  const full = await getUser(user.id, user.email || '')
  const config = supabaseConfig()
  const own = await getUserIntegration(user.id, platform, config)
  const ownTokens = own?.tokens || {}
  const hasOwnKey = ownTokens.hasOwnKey === true || ownTokens.hasOwnKey === 'true'
  const isMasterToken = ownTokens.isMaster === true || ownTokens.isMaster === 'true'
  const accessToken = ownTokens.access_token || ownTokens.token || ownTokens.api_key || ownTokens.bot_token || ''
  const webhookUrl = ownTokens.webhook_url || ownTokens.webhookUrl || ''
  const botToken = ownTokens.bot_token || ownTokens.api_key || accessToken
  const chatId = ownTokens.chat_id || ownTokens.chatId || ''
  const channel = ownTokens.channel || chatId
  const authorUrn = ownTokens.author_urn || ownTokens.authorUrn || ''
  const pageId = ownTokens.page_id || ownTokens.pageId || ''
  const phoneNumberId = ownTokens.phone_number_id || ownTokens.phoneNumberId || ''
  const scopes = own?.scopes || []
  const hasToken = Boolean(accessToken || webhookUrl || botToken)
  if (hasToken && (hasOwnKey || !isMasterToken)) {
    return { platform, isMaster: false, accessToken, webhookUrl, botToken, chatId, channel, authorUrn, pageId, phoneNumberId, scopes, ...ownTokens }
  }
  if (isMasterToken) {
    if (!skipFreeLimit && (full.freePostsUsed || 0) >= (full.freePostsLimit || 0)) throw new Error('FREE_LIMIT_REACHED')
    if (!accessToken) throw new Error(`${platform} master token is missing`)
    return { platform, isMaster: true, accessToken, webhookUrl: '', botToken: accessToken, chatId, channel, authorUrn, pageId, phoneNumberId, scopes, ...ownTokens }
  }
  if (!skipFreeLimit && (full.freePostsUsed || 0) >= (full.freePostsLimit || 0)) throw new Error('FREE_LIMIT_REACHED')
  const master = masterCredentials(platform)
  if (!master) throw new Error(`${platform} is not connected. Add your own key or set a master key on Render.`)
  return { ...master, platform, isMaster: true }
}

async function postToX(creds, params) {
  const text = String(params.text || params.message || '')
  if (!text) throw new Error('X post requires text')
  const token = creds.accessToken
  if (!token) throw new Error('X access token missing')
  const bodyText = params.imageUrl && !text.includes(params.imageUrl) ? `${text}\n\n${params.imageUrl}` : text
  const response = await fetch('https://api.twitter.com/2/tweets', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: bodyText }) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.detail || data.title || 'X post failed')
  return { id: data.data?.id, data }
}

async function postToLinkedIn(creds, params) {
  const text = String(params.text || params.message || '')
  const imageUrl = String(params.imageUrl || '')
  if (!text && !imageUrl) throw new Error('LinkedIn post requires text or image')
  const token = creds.accessToken
  const author = creds.authorUrn || creds.author_urn || creds.identifier
  const scopes = creds.scopes || []
  if (!token || !author) throw new Error('LinkedIn token or author URN missing. Connect LinkedIn in Connectors.')
  if (scopes.length && !scopes.includes('w_member_social') && !process.env.MASTER_LINKEDIN_ACCESS_TOKEN) {
    throw new Error('LinkedIn connection is missing w_member_social permission. Reconnect LinkedIn and make sure Share on LinkedIn is approved.')
  }
  const bodyText = imageUrl && !text.includes(imageUrl) ? `${text}\n\n${imageUrl}` : text
  const body = {
    author,
    commentary: bodyText,
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  }
  const response = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Restli-Protocol-Version': '2.0.0', 'LinkedIn-Version': '202404' },
    body: JSON.stringify(body),
  })
  const postId = response.headers.get('x-restli-id') || response.headers.get('X-Restli-Id') || response.headers.get('x-restli-id')
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.message || data.error || data.error_description || `LinkedIn post failed (${response.status})`)
  }
  if (!postId) {
    const responseText = await response.text().catch(() => '')
    throw new Error(`LinkedIn did not return a post ID. ${responseText.slice(0, 200)}`)
  }
  return { id: postId, ok: true, status: response.status, link: `https://www.linkedin.com/feed/update/${postId}` }
}

async function postToDiscord(creds, params) {
  const content = String(params.text || params.message || '')
  const imageUrl = String(params.imageUrl || '')
  if (!content && !imageUrl) throw new Error('Discord message requires content or image')
  const webhookUrl = creds.webhookUrl
  if (!webhookUrl) throw new Error('Discord webhook URL missing')
  const body = imageUrl ? { content, embeds: [{ image: { url: imageUrl }, color: 0xE56B2D }] } : { content }
  const response = await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!response.ok) throw new Error(`Discord webhook returned ${response.status}`)
  return { ok: true }
}

async function postToSlack(creds, params) {
  const text = String(params.text || params.message || '')
  const imageUrl = String(params.imageUrl || '')
  if (!text) throw new Error('Slack message requires text')
  if (creds.webhookUrl) {
    const body = imageUrl ? { text, blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }, { type: 'image', image_url: imageUrl, alt_text: 'Post image' }] } : { text }
    const response = await fetch(creds.webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!response.ok) throw new Error(`Slack webhook returned ${response.status}`)
    return { ok: true }
  }
  const token = creds.accessToken
  const channel = String(params.channel || params.to || creds.channel || creds.chatId || '')
  if (!token || !channel) throw new Error('Slack requires bot token and channel')
  const blocks = imageUrl ? [{ type: 'section', text: { type: 'mrkdwn', text } }, { type: 'image', image_url: imageUrl, alt_text: 'Post image' }] : undefined
  const response = await fetch('https://slack.com/api/chat.postMessage', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ channel, text, blocks }) })
  const data = await response.json()
  if (!response.ok || !data.ok) throw new Error(data.error || 'Slack message failed')
  return { ok: true, channel: data.channel, ts: data.ts }
}

async function resolveTelegramChatId(token, preferredChatId) {
  if (preferredChatId) return preferredChatId
  try {
    const updates = await fetch(`https://api.telegram.org/bot${token}/getUpdates`).then(r => r.json())
    if (updates.ok && updates.result?.length) {
      const update = updates.result[0]
      const chat = update.message?.chat || update.callback_query?.message?.chat || update.my_chat_member?.chat
      if (chat?.id) return chat.id
    }
  } catch {}
  return ''
}

async function postToTelegram(creds, params) {
  const text = String(params.text || params.message || '')
  const imageUrl = String(params.imageUrl || '')
  if (!text && !imageUrl) throw new Error('Telegram message requires text or image')
  const token = creds.botToken
  if (!token) throw new Error('Telegram requires bot token')
  const chatId = await resolveTelegramChatId(token, String(params.chatId || params.to || creds.chatId || ''))
  if (!chatId) throw new Error('Telegram chat ID is missing. Send a message to the bot first or set TELEGRAM_CHAT_ID.')
  if (imageUrl) {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, photo: imageUrl, caption: text }) })
    const data = await response.json()
    if (!response.ok || !data.ok) throw new Error(data.description || 'Telegram photo failed')
    return { ok: true, message_id: data.result?.message_id }
  }
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text }) })
  const data = await response.json()
  if (!response.ok || !data.ok) throw new Error(data.description || 'Telegram message failed')
  return { ok: true, message_id: data.result?.message_id }
}

async function postToFacebook(creds, params) {
  const message = String(params.text || params.message || '')
  const imageUrl = String(params.imageUrl || '')
  if (!message && !imageUrl) throw new Error('Facebook post requires text or image')
  const token = creds.accessToken || creds.token
  const pageId = creds.pageId || creds.page_id || creds.identifier
  if (!token || !pageId) throw new Error('Facebook page access token and Page ID are missing. Add them in Connectors.')
  const url = `https://graph.facebook.com/v18.0/${encodeURIComponent(pageId)}/feed`
  const body = imageUrl && !message.includes(imageUrl) ? { message, link: imageUrl } : { message }
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, access_token: token }) })
  const data = await response.json()
  if (!response.ok || data.error) throw new Error(data.error?.message || 'Facebook post failed')
  return { id: data.id, data }
}

async function postToWhatsApp(creds, params) {
  const text = String(params.text || params.message || '')
  if (!text) throw new Error('WhatsApp message requires text')
  const token = creds.accessToken || creds.token || creds.botToken
  const phoneNumberId = creds.phoneNumberId || creds.phone_number_id || creds.identifier
  const to = String(params.to || params.phone || params.phoneNumber || '')
  if (!token || !phoneNumberId) throw new Error('WhatsApp token and Phone Number ID are missing. Add them in Connectors.')
  if (!to) throw new Error('WhatsApp message requires a recipient phone number in `to` or `phone`.')
  const url = `https://graph.facebook.com/v18.0/${encodeURIComponent(phoneNumberId)}/messages`
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { body: text } }) })
  const data = await response.json()
  if (!response.ok || data.error) throw new Error(data.error?.message || 'WhatsApp message failed')
  return { id: data.messages?.[0]?.id, data }
}

async function postToSocial(platform, user, params) {
  const userId = typeof user === 'string' ? user : user?.id
  const fullUser = await getUser(userId, user?.email || '')
  if (!fullUser) throw new Error('User not found')
  const isAdmin = fullUser.email === adminEmail
  const text = String(params.text || params.message || '')
  if (!text && !params.imageUrl) throw new Error('Social post requires text or image')
  const creds = await getPostingCredentials(fullUser, platform, { ...params, _skipFreeLimit: params._skipFreeLimit || isAdmin })
  let result
  switch (platform) {
    case 'x': result = await postToX(creds, params); break
    case 'linkedin': result = await postToLinkedIn(creds, params); break
    case 'facebook': result = await postToFacebook(creds, params); break
    case 'whatsapp': result = await postToWhatsApp(creds, params); break
    case 'discord': result = await postToDiscord(creds, params); break
    case 'slack': result = await postToSlack(creds, params); break
    case 'telegram': result = await postToTelegram(creds, params); break
    default: throw new Error(`${platform} posting is not configured`)
  }
  if (creds.isMaster && params._skipFreeLimit !== true && !isAdmin) {
    fullUser.freePostsUsed = (fullUser.freePostsUsed || 0) + 1
    fullUser.masterKeysUsed = true
    await saveUser(fullUser)
  }
  return result
}

async function githubToken(userId) {
  try { return await connectorCredential(userId, 'github', 'GITHUB_TOKEN') } catch {}
  const token = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT_ALPHATEKX || ''
  if (token) return token
  throw new Error('GitHub token is not configured. Add it in Connectors or set GITHUB_TOKEN / GITHUB_PAT_ALPHATEKX.')
}

function encodeRepoPath(repo) {
  const parts = String(repo || '').split('/').filter(Boolean)
  if (parts.length < 2) throw new Error('GitHub repo must be in owner/repo format')
  return parts.map(encodeURIComponent).join('/')
}

async function githubCreateIssue(userId, params) {
  const token = await githubToken(userId)
  const repo = String(params.repo || '')
  const title = String(params.title || 'Alpha Agent issue')
  const body = String(params.body || '')
  if (!repo) throw new Error('GitHub issue requires repo (owner/repo)')
  const response = await fetch(`https://api.github.com/repos/${encodeRepoPath(repo)}/issues`, { method: 'POST', headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }, body: JSON.stringify({ title, body }) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || 'GitHub issue creation failed')
  return data
}

async function githubSummarizeCommits(userId, params) {
  const token = await githubToken(userId)
  const repo = String(params.repo || '')
  const branch = String(params.branch || 'main')
  if (!repo) throw new Error('GitHub commits require repo (owner/repo)')
  const response = await fetch(`https://api.github.com/repos/${encodeRepoPath(repo)}/commits?sha=${encodeURIComponent(branch)}&per_page=10`, { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' } })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || 'GitHub commits fetch failed')
  const messages = (Array.isArray(data) ? data : []).map(c => c.commit?.message?.split('\n')[0] || '').filter(Boolean)
  return { summary: messages.join('; '), commits: data }
}

async function notionToken(userId) {
  return connectorCredential(userId, 'notion', 'NOTION_TOKEN')
}

async function notionCreatePage(userId, params) {
  const token = await notionToken(userId)
  const title = String(params.title || 'Alpha Agent page')
  const content = String(params.content || '')
  const databaseId = String(params.databaseId || '')
  const parentId = String(params.parentId || params.pageId || '')
  if (!databaseId && !parentId) throw new Error('Notion page requires databaseId or parentId')
  const body = { parent: databaseId ? { database_id: databaseId } : { page_id: parentId }, properties: { title: { title: [{ text: { content: title } }] } }, children: [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content } }] } }] }
  const response = await fetch('https://api.notion.com/v1/pages', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || 'Notion page creation failed')
  return data
}

async function notionAppendBlock(userId, params) {
  const token = await notionToken(userId)
  const pageId = String(params.pageId || '')
  const content = String(params.content || '')
  if (!pageId || !content) throw new Error('Notion append requires pageId and content')
  const response = await fetch(`https://api.notion.com/v1/blocks/${encodeURIComponent(pageId)}/children`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ children: [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content } }] } }] }) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || 'Notion append failed')
  return data
}

async function sendWhatsAppMessage(userId, params) {
  const config = supabaseConfig()
  const integration = await getUserIntegration(userId, 'whatsapp', config)
  const token = integration?.tokens?.api_key || process.env.WHATSAPP_TOKEN || ''
  const phoneNumberId = integration?.tokens?.phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID || ''
  if (!token || !phoneNumberId) throw new Error('WhatsApp requires token and phone_number_id. Add them in Connectors or set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID.')
  const to = String(params.to || '')
  const message = String(params.message || params.text || '')
  if (!to || !message) throw new Error('WhatsApp requires to and message')
  const response = await fetch(`https://graph.facebook.com/v18.0/${encodeURIComponent(phoneNumberId)}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { body: message } }) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error?.message || 'WhatsApp message failed')
  return data
}

async function paystackSecret(userId) {
  return connectorCredential(userId, 'paystack', 'PAYSTACK_SECRET_KEY')
}

async function verifyPaystackTransaction(userId, params) {
  const secret = await paystackSecret(userId)
  const reference = String(params.reference || '')
  if (!reference) throw new Error('Paystack verification requires reference')
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${secret}` } })
  const data = await response.json()
  if (!response.ok || !data.status) throw new Error(data.message || 'Paystack verification failed')
  return data.data
}

async function supabaseInsertRow(userId, params) {
  const config = supabaseConfig()
  if (!config.url || !config.service) throw new Error('Supabase service is not configured')
  const table = String(params.table || '')
  const data = params.data || {}
  if (!table) throw new Error('Supabase insert requires table')
  const response = await fetch(`${config.url}/rest/v1/${encodeURIComponent(table)}`, { method: 'POST', headers: { ...serviceHeaders(config.service), Prefer: 'return=minimal' }, body: JSON.stringify(data) })
  if (!response.ok) throw new Error(`Supabase insert failed: ${response.status}`)
  return { ok: true }
}

async function supabaseBackup(userId, params) {
  try {
    const backupDir = path.resolve(dataDir, 'backups')
    fs.mkdirSync(backupDir, { recursive: true })
    const file = path.resolve(backupDir, `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
    const agents = await listServerAgents().catch(() => [])
    const executions = await listServerExecutions().catch(() => [])
    writeJsonFile(file, { agents, executions, backedUpAt: new Date().toISOString() })
    return { file }
  } catch (error) { throw new Error(`Backup failed: ${error instanceof Error ? error.message : 'unknown'}`) }
}

async function resendApiKey(userId) {
  return connectorCredential(userId, 'email', 'RESEND_API_KEY', 'api_key')
}

async function sendEmailViaResend(userId, params) {
  const apiKey = await resendApiKey(userId)
  const to = String(params.to || '')
  const subject = String(params.subject || '')
  const html = String(params.html || '')
  const text = String(params.text || '')
  if (!to || !subject || (!html && !text)) throw new Error('Email requires recipient, subject, and body')
  const from = String(params.from || process.env.FROM_EMAIL || process.env.EMAIL_FROM || 'AlphaTekX <noreply@alphatekx.name.ng>')
  const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to, subject, html, text }) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || 'Resend email failed')
  return data
}

async function executeConnectorAction(user, action) {
  const start = Date.now()
  const baseLog = `[${action.connector}] ${action.action}`
  const params = action.params || {}
  const stepCost = action._stepCost || 1
  try {
    let result
    switch (action.connector) {
      case 'gmail': {
        if (action.action === 'send_email') {
          const to = String(params.to || user.email || '')
          if (!to) throw new Error('Missing recipient email.')
          const subject = String(params.subject || 'Alpha Agent')
          const body = String(params.body || params.text || params.message || '')
          const sendResult = await sendEmailWithGmail(user, { to, subject, html: String(params.html || `<p>${body}</p>`), text: body })
          result = { id: sendResult.messageId, to, subject }
        }
        break
      }
      case 'email': {
        if (action.action === 'send_email') {
          const to = String(params.to || user.email || '')
          if (!to) throw new Error('Missing recipient email.')
          const subject = String(params.subject || 'Alpha Agent')
          const body = String(params.body || params.text || params.message || '')
          const sendResult = await sendEmailViaResend(user.id, { to, subject, html: String(params.html || `<p>${body}</p>`), text: body })
          result = { id: sendResult.id, to, subject }
        }
        break
      }
      case 'google_sheets': {
        if (action.action === 'append_row') {
          const sheetResult = await googleSheetsAppendRow(user.id, params)
          result = { spreadsheetId: sheetResult.spreadsheetId, updatedRange: sheetResult.updates?.updatedRange }
        }
        if (action.action === 'read_rows') {
          const sheetResult = await googleSheetsReadRows(user.id, params)
          result = { rowCount: sheetResult.values?.length || 0, values: sheetResult.values }
        }
        break
      }
      case 'google_calendar':
      case 'calendar': {
        if (action.action === 'create_event') {
          const eventResult = await googleCalendarCreateEvent(user.id, params)
          result = { id: eventResult.id, summary: eventResult.summary, htmlLink: eventResult.htmlLink }
        }
        if (action.action === 'read_events') {
          const events = await googleCalendarReadEvents(user.id, params)
          result = { count: events.length, events }
        }
        if (action.action === 'email_summary') {
          const events = await googleCalendarReadEvents(user.id, { timeZone: params.timeZone || 'UTC' })
          const summary = await formatCalendarSummary(events, params.timeZone || 'UTC')
          const to = String(params.to || user.email || '')
          const timeZone = String(params.timeZone || 'UTC')
          const today = new Date().toLocaleDateString('en-US', { timeZone, weekday: 'long', month: 'long', day: 'numeric' })
          const subject = String(params.subject || `Your schedule for ${today}`)
          const sendResult = await sendEmailWithGmail(user, { to, subject, html: summary.html, text: summary.text })
          result = { messageId: sendResult.messageId, to, subject, eventsRead: events.length }
        }
        break
      }
      case 'google_drive': {
        if (action.action === 'upload_file') {
          const driveResult = await googleDriveUploadFile(user.id, params)
          result = { id: driveResult.id, name: driveResult.name }
        }
        break
      }
      case 'github': {
        if (action.action === 'create_issue') {
          const issue = await githubCreateIssue(user.id, params)
          result = { number: issue.number, url: issue.html_url, title: issue.title }
        }
        if (action.action === 'summarize_commits') {
          const commitResult = await githubSummarizeCommits(user.id, params)
          result = { summary: commitResult.summary, commitCount: Array.isArray(commitResult.commits) ? commitResult.commits.length : 0 }
        }
        break
      }
      case 'slack':
      case 'discord':
      case 'telegram': {
        if (action.action === 'send_message') {
          const postResult = await postToSocial(action.connector, user, { ...params, _skipFreeLimit: true })
          result = { ok: postResult.ok, messageId: postResult.message_id, channel: postResult.channel, ts: postResult.ts }
        }
        if (action.action === 'send_gmail_summary' && action.connector === 'telegram') {
          const messages = await gmailReadUnreadMessages(user.id, { max: params.max || 20, q: params.q || 'is:unread in:inbox' })
          const timeZone = String(params.timeZone || 'UTC')
          const today = new Date().toLocaleDateString('en-US', { timeZone, weekday: 'long', month: 'long', day: 'numeric' })
          let message
          if (!messages.length) {
            message = `No unread Gmail messages for ${today}.`
          } else {
            const lines = messages.map((m, i) => `${i + 1}. ${m.subject} — ${m.from}`).join('\n')
            message = `Unread Gmail summary for ${today}:\n\n${lines}`
          }
          const postResult = await postToSocial(action.connector, user, { ...params, message, _skipFreeLimit: true })
          result = { ok: postResult.ok, messageId: postResult.message_id, channel: postResult.channel, ts: postResult.ts, messagesRead: messages.length }
        }
        break
      }
      case 'notion': {
        if (action.action === 'create_page') {
          const page = await notionCreatePage(user.id, params)
          result = { id: page.id, url: page.url }
        }
        if (action.action === 'append_block') {
          const block = await notionAppendBlock(user.id, params)
          result = { id: block.id }
        }
        break
      }
      case 'whatsapp': {
        if (action.action === 'send_message') {
          const wa = await sendWhatsAppMessage(user.id, params)
          result = { messageId: wa.messages?.[0]?.id, to: params.to }
        }
        break
      }
      case 'linkedin':
      case 'x':
      case 'facebook': {
        if (action.action === 'post' || action.action === 'tweet') {
          const postResult = await postToSocial(action.connector, user, { ...params, _skipFreeLimit: true })
          result = { id: postResult.id, ok: postResult.ok }
        }
        break
      }
      case 'paystack': {
        if (action.action === 'verify_payment') {
          const pay = await verifyPaystackTransaction(user.id, params)
          result = { status: pay.status, reference: pay.reference, amount: pay.amount }
          if (pay.status === 'success' && user?.id) {
            try {
              const paidAt = pay.paid_at || new Date().toISOString()
              const naira = Number(pay.amount || 0) / 100
              const customer = await alphaBrain.upsertCustomer(user.id, { name: pay.customer?.first_name ? `${pay.customer.first_name} ${pay.customer.last_name || ''}`.trim() : (pay.customer?.email || user.email), email: pay.customer?.email || user.email, what_they_bought: `Paystack payment ${pay.reference}`, amount: naira, paid_at: paidAt, metadata: { reference: pay.reference, channel: pay.channel || 'card' } })
              await alphaBrain.addPayment(user.id, { customer_id: customer.id, amount: naira, reference: pay.reference, status: 'completed', metadata: { channel: pay.channel || 'card', gateway_response: pay.gateway_response }, paid_at: paidAt })
              await alphaBrain.logMemory(user.id, { event_type: 'payment', summary: `Paystack payment verified: ₦${naira.toLocaleString()} (${pay.reference})`, source_workflow_id: params.reference, metadata: { amount: naira, reference: pay.reference, status: pay.status } })
            } catch {}
          }
        }
        break
      }
      case 'supabase': {
        if (action.action === 'insert_row') {
          await supabaseInsertRow(user.id, params)
          result = { ok: true, table: params.table }
        }
        if (action.action === 'backup') {
          const backup = await supabaseBackup(user.id, params)
          result = { file: backup.file }
        }
        break
      }
    }
    if (!result) throw new Error(`Action ${action.action} for ${action.connector} is not implemented or connector is not configured.`)
    const log = `${baseLog} succeeded` + (result.id ? ` (${result.id})` : result.number ? ` (#${result.number})` : '')
    return { status: 'success', duration: Date.now() - start, output: result, error_code: null, credits_used: stepCost, log }
  } catch (error) {
    const code = (error instanceof Error && error.message === 'DUPLICATE_ROW') ? 'DUPLICATE_ROW' : 'CONNECTOR_ERROR'
    return { status: 'error', duration: Date.now() - start, output: null, error_code: code, credits_used: 0, log: `${baseLog} failed: ${error instanceof Error ? error.message : 'Unknown error'}` }
  }
}

const webhooksDir = path.resolve(dataDir, 'agent-webhooks')
function saveWebhookEvent(agentId, payload) {
  try {
    fs.mkdirSync(webhooksDir, { recursive: true })
    const file = path.resolve(webhooksDir, `${agentId}.json`)
    const events = readJsonFile(file, [])
    events.unshift({ receivedAt: new Date().toISOString(), payload })
    writeJsonFile(file, events.slice(0, 100))
    return true
  } catch { return false }
}
function readWebhookEvents(agentId) {
  try {
    const file = path.resolve(webhooksDir, `${agentId}.json`)
    return readJsonFile(file, [])
  } catch { return [] }
}

function useSupabaseAgentDb() { const c = supabaseConfig(); return Boolean(c.url && c.service) }

async function supabaseAgents() {
  const c = supabaseConfig()
  const res = await fetch(`${c.url}/rest/v1/agents?select=*`, { headers: serviceHeaders(c.service) })
  if (!res.ok) throw new Error('Could not list agents from Supabase')
  const rows = await res.json()
  return Array.isArray(rows) ? rows.map(r => (r.data ? { ...r.data, id: r.id, updated_at: r.updated_at } : r)) : []
}

async function supabaseSaveAgent(agent) {
  const c = supabaseConfig()
  const body = JSON.stringify({ id: agent.id, user_id: agent.userId || null, data: agent, updated_at: new Date().toISOString() })
  const res = await fetch(`${c.url}/rest/v1/agents?on_conflict=id`, { method: 'POST', headers: { ...serviceHeaders(c.service), Prefer: 'resolution=merge-duplicates,return=minimal' }, body })
  if (!res.ok) throw new Error('Could not save agent to Supabase')
  return agent
}

async function supabaseGetAgent(id) {
  const c = supabaseConfig()
  const res = await fetch(`${c.url}/rest/v1/agents?id=eq.${encodeURIComponent(id)}&select=*`, { headers: serviceHeaders(c.service) })
  if (!res.ok) throw new Error('Could not fetch agent from Supabase')
  const rows = await res.json()
  const row = rows?.[0]
  return row ? (row.data ? { ...row.data, id: row.id, updated_at: row.updated_at } : row) : null
}

async function supabaseDeleteAgent(id) {
  const c = supabaseConfig()
  const res = await fetch(`${c.url}/rest/v1/agents?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: serviceHeaders(c.service) })
  if (!res.ok) throw new Error('Could not delete agent from Supabase')
}

async function supabaseAgentExecutions() {
  const c = supabaseConfig()
  const res = await fetch(`${c.url}/rest/v1/agent_executions?select=*&order=created_at.desc`, { headers: serviceHeaders(c.service) })
  if (!res.ok) throw new Error('Could not list executions from Supabase')
  const rows = await res.json()
  return Array.isArray(rows) ? rows.map(r => (r.data ? { ...r.data, id: r.id, created_at: r.created_at } : r)) : []
}

async function supabaseAddExecution(execution) {
  const c = supabaseConfig()
  const body = JSON.stringify({ id: execution.id, agent_id: execution.agentId, data: execution, created_at: new Date().toISOString() })
  const res = await fetch(`${c.url}/rest/v1/agent_executions`, { method: 'POST', headers: serviceHeaders(c.service), body })
  if (!res.ok) throw new Error('Could not save execution to Supabase')
  return execution
}

async function supabaseGetExecution(id) {
  const c = supabaseConfig()
  const res = await fetch(`${c.url}/rest/v1/agent_executions?id=eq.${encodeURIComponent(id)}&select=*`, { headers: serviceHeaders(c.service) })
  if (!res.ok) throw new Error('Could not fetch execution from Supabase')
  const rows = await res.json()
  const row = rows?.[0]
  return row ? (row.data ? { ...row.data, id: row.id, created_at: row.created_at } : row) : null
}

async function supabaseSaveExecution(execution) {
  const c = supabaseConfig()
  const body = JSON.stringify({ id: execution.id, agent_id: execution.agentId, data: execution, updated_at: new Date().toISOString() })
  const res = await fetch(`${c.url}/rest/v1/agent_executions?id=eq.${encodeURIComponent(execution.id)}`, { method: 'PUT', headers: serviceHeaders(c.service), body })
  if (!res.ok) throw new Error('Could not update execution in Supabase')
  return execution
}

function readAgents() { return readJsonFile(agentsFile, []) }
function writeAgents(agents) { writeJsonFile(agentsFile, agents) }

const AGENTS_PROVIDER = 'alphatekx_agents'

async function remoteAgentsList(config) {
  const res = await fetch(`${config.url}/rest/v1/connected_accounts?provider=eq.${AGENTS_PROVIDER}&select=*`, { headers: serviceHeaders(config.service) })
  if (!res.ok) throw new Error('Could not list agents from connected_accounts')
  const rows = await res.json()
  return Array.isArray(rows) ? rows.map(r => ({ userId: r.user_id, email: r.email || '', agents: Array.isArray(r.tokens?.agents) ? r.tokens.agents : [] })) : []
}

async function remoteAgentsForUser(userId, config) {
  const res = await fetch(`${config.url}/rest/v1/connected_accounts?provider=eq.${AGENTS_PROVIDER}&user_id=eq.${encodeURIComponent(userId)}&select=*`, { headers: serviceHeaders(config.service) })
  if (!res.ok) throw new Error('Could not load agents for user')
  const row = (await res.json())?.[0]
  return Array.isArray(row?.tokens?.agents) ? row.tokens.agents : []
}

async function remoteAgentsSaveForUser(userId, email, agents, config) {
  const body = JSON.stringify({ user_id: userId, provider: AGENTS_PROVIDER, email: email || '', identifier: 'agents', scopes: [], tokens: { agents, updated_at: new Date().toISOString() }, updated_at: new Date().toISOString() })
  const res = await fetch(`${config.url}/rest/v1/connected_accounts?on_conflict=user_id,provider`, { method: 'POST', headers: { ...serviceHeaders(config.service), Prefer: 'resolution=merge-duplicates,return=minimal' }, body })
  if (!res.ok) throw new Error('Could not save agents to connected_accounts')
}

async function remoteAgentsDelete(agentId, config) {
  const rows = await remoteAgentsList(config)
  for (const row of rows) {
    const idx = row.agents.findIndex(a => a.id === agentId)
    if (idx >= 0) {
      row.agents.splice(idx, 1)
      await remoteAgentsSaveForUser(row.userId, row.email, row.agents, config)
      return true
    }
  }
  return false
}
function readAgentExecutions() { return readJsonFile(agentExecutionsFile, []) }
function writeAgentExecutions(executions) { writeJsonFile(agentExecutionsFile, executions.slice(0, 2000)) }
function readAgentLogs() { return readJsonFile(agentLogsFile, []) }
function writeAgentLogs(logs) { writeJsonFile(agentLogsFile, logs.slice(0, 5000)) }

async function addAgentLog(log) {
  const record = { id: randomUUID(), ...log, createdAt: new Date().toISOString() }
  const logs = readAgentLogs()
  logs.unshift(record)
  writeAgentLogs(logs)
  return record
}

async function listAgentLogs({ agentId, limit = 100 } = {}) {
  let logs = readAgentLogs()
  if (agentId) logs = logs.filter(l => l.agentId === agentId)
  return logs.slice(0, limit)
}

async function saveServerAgent(agent) {
  const record = { ...agent, updated_at: new Date().toISOString() }
  if (useSupabaseAgentDb()) {
    const config = supabaseConfig()
    try { await supabaseSaveAgent(record); return record } catch { /* fall through */ }
    try {
      const existing = await remoteAgentsForUser(record.userId, config)
      const filtered = existing.filter(a => a.id !== record.id)
      await remoteAgentsSaveForUser(record.userId, record.userEmail || '', [record, ...filtered], config)
      return record
    } catch { /* fall through to local */ }
  }
  const agents = readAgents()
  const index = agents.findIndex(a => a.id === agent.id)
  if (index >= 0) agents[index] = record
  else agents.unshift(record)
  writeAgents(agents)
  return record
}

async function getServerAgent(id) {
  if (useSupabaseAgentDb()) {
    const config = supabaseConfig()
    try { return await supabaseGetAgent(id) } catch { /* fall through */ }
    try {
      const rows = await remoteAgentsList(config)
      for (const row of rows) {
        const found = row.agents.find(a => a.id === id)
        if (found) return { ...found, userId: row.userId }
      }
    } catch { /* fall through */ }
  }
  return readAgents().find(a => a.id === id) || null
}

async function listServerAgents() {
  if (useSupabaseAgentDb()) {
    const config = supabaseConfig()
    try { return await supabaseAgents() } catch { /* fall through */ }
    try {
      const rows = await remoteAgentsList(config)
      return rows.flatMap(r => r.agents.map(a => ({ ...a, userId: r.userId })))
    } catch { /* fall through */ }
  }
  return readAgents()
}

async function deleteServerAgent(id) {
  if (useSupabaseAgentDb()) {
    const config = supabaseConfig()
    try { await supabaseDeleteAgent(id); return } catch { /* fall through */ }
    try { if (await remoteAgentsDelete(id, config)) return } catch { /* fall through */ }
  }
  const agents = readAgents().filter(a => a.id !== id)
  writeAgents(agents)
}

async function addServerExecution(execution) {
  if (useSupabaseAgentDb()) {
    try { await supabaseAddExecution(execution); return execution } catch { /* fall through */ }
  }
  const ex = readAgentExecutions()
  ex.unshift(execution)
  writeAgentExecutions(ex)
  return execution
}

async function getServerExecution(id) {
  if (useSupabaseAgentDb()) {
    try { return await supabaseGetExecution(id) } catch { /* fall through */ }
  }
  return readAgentExecutions().find(e => e.id === id) || null
}

async function saveServerExecution(execution) {
  if (useSupabaseAgentDb()) {
    try { await supabaseSaveExecution(execution); return execution } catch { /* fall through */ }
  }
  const ex = readAgentExecutions()
  const idx = ex.findIndex(e => e.id === execution.id)
  if (idx >= 0) ex[idx] = execution
  else ex.unshift(execution)
  writeAgentExecutions(ex)
  return execution
}

async function listServerExecutions() {
  if (useSupabaseAgentDb()) {
    try { return await supabaseAgentExecutions() } catch { /* fall through */ }
  }
  return readAgentExecutions()
}

function upsertLocalUser(user) {
  if (!user?.id || !user?.email) return
  const users = readJsonFile(usersFile)
  const existing = users.find(u => u.id === user.id || u.email === user.email)
  const now = new Date().toISOString()
  if (existing) {
    existing.last_active_at = now
    if (user.name) existing.name = user.name
    if (user.plan) existing.plan = user.plan
  } else {
    const isAdmin = String(user.email || '').toLowerCase() === adminEmail
    const startingCredits = Number.isFinite(user.credits) ? user.credits : DEFAULT_CREDITS
    users.unshift({ id: user.id, email: user.email, name: user.name || '', plan: user.plan || 'free', credits: startingCredits, freePostsUsed: 0, freePostsLimit: isAdmin ? adminFreePostsLimit : 2, connectors: {}, masterKeysUsed: false, created_at: now, last_active_at: now })
    writeUserCreditsLocal(user.id, startingCredits)
  }
  writeJsonFile(usersFile, users.slice(0, 5000))
}

const adminFreePostsLimit = 999_999
function defaultUser(userId, email = '') {
  const now = new Date().toISOString()
  const isAdmin = String(email).toLowerCase() === adminEmail
  return { id: userId, email, name: '', plan: 'free', credits: 0, freePostsUsed: 0, freePostsLimit: isAdmin ? adminFreePostsLimit : 2, connectors: {}, masterKeysUsed: false, created_at: now, last_active_at: now }
}

async function getUser(userId, email = '') {
  if (!userId) return null
  const config = supabaseConfig()
  if (config.url && config.service) {
    try {
      const response = await fetch(`${config.url}/rest/v1/connected_accounts?user_id=eq.${encodeURIComponent(userId)}&provider=eq.usage&select=*`, { headers: serviceHeaders(config.service) })
      if (response.ok) {
        const rows = await response.json()
        const row = rows?.[0]
        if (row?.tokens) {
          const key = encryptionKey(config)
          const tokens = decryptGenericTokens(row.tokens, key)
          if (tokens?.usage) {
            const merged = { ...defaultUser(userId, row.email || email), ...tokens.usage }
            if (String(merged.email || '').toLowerCase() === adminEmail) merged.freePostsLimit = adminFreePostsLimit
            return merged
          }
        }
      }
    } catch {}
  }
  const users = readJsonFile(usersFile)
  const existing = users.find(u => u.id === userId)
  if (existing) {
    const merged = { ...defaultUser(userId, existing.email || email), ...existing, connectors: existing.connectors || {} }
    const localCredits = readUserCreditsLocal(userId)
    if (localCredits != null) merged.credits = localCredits
    if (String(merged.email || '').toLowerCase() === adminEmail) merged.freePostsLimit = adminFreePostsLimit
    return merged
  }
  return defaultUser(userId, email)
}

async function saveUser(user) {
  if (!user?.id) return false
  const config = supabaseConfig()
  const existing = await getUser(user.id, user.email || '')
  const next = { ...existing, ...user, connectors: { ...existing.connectors, ...(user.connectors || {}) } }
  if (config.url && config.service) {
    try {
      const key = encryptionKey(config)
      const record = {
        user_id: user.id,
        provider: 'usage',
        email: next.email || existing.email || '',
        tokens: encryptGenericTokens({ usage: { freePostsUsed: next.freePostsUsed || 0, freePostsLimit: next.freePostsLimit || 2, connectors: next.connectors || {}, masterKeysUsed: next.masterKeysUsed || false, credits: next.credits || 0, plan: next.plan || 'free', name: next.name || '', brandProfile: next.brandProfile || existing.brandProfile || {} } }, key),
        updated_at: new Date().toISOString(),
      }
      const response = await fetch(`${config.url}/rest/v1/connected_accounts?on_conflict=user_id,provider`, { method: 'POST', headers: { ...serviceHeaders(config.service), Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(record) })
      if (response.ok) return true
    } catch {}
  }
  const users = readJsonFile(usersFile)
  const idx = users.findIndex(u => u.id === user.id)
  const localUser = {
    id: user.id,
    email: next.email || existing.email || '',
    name: next.name || existing.name || '',
    plan: next.plan || existing.plan || 'free',
    credits: next.credits || existing.credits || 0,
    freePostsUsed: next.freePostsUsed || 0,
    freePostsLimit: next.freePostsLimit || 2,
    connectors: next.connectors || {},
    masterKeysUsed: next.masterKeysUsed || false,
    brandProfile: next.brandProfile || existing.brandProfile || {},
    created_at: idx >= 0 ? users[idx].created_at : new Date().toISOString(),
    last_active_at: new Date().toISOString(),
  }
  if (idx >= 0) users[idx] = localUser
  else users.unshift(localUser)
  writeJsonFile(usersFile, users.slice(0, 5000))
  return true
}

async function addFreePosts(user, amount) {
  const full = await getUser(user.id, user.email || '')
  full.freePostsLimit = (full.freePostsLimit || 0) + Math.max(0, Number(amount) || 0)
  await saveUser(full)
  return full.freePostsLimit
}

async function incrementFreePosts(user) {
  const full = await getUser(user.id, user.email || '')
  full.freePostsUsed = (full.freePostsUsed || 0) + 1
  full.masterKeysUsed = true
  await saveUser(full)
  return full.freePostsUsed
}

function recordLocalActivity(event) {
  const activity = readJsonFile(activityFile)
  activity.unshift({ ...event, at: new Date().toISOString() })
  writeJsonFile(activityFile, activity.slice(0, 10000))
}
function localAdminStats() {
  const users = readJsonFile(usersFile)
  const now = Date.now()
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
  const lastMonthStart = new Date(monthStart); lastMonthStart.setMonth(lastMonthStart.getMonth() - 1)
  return {
    total: users.length,
    active: users.filter(item => item.last_active_at && now - new Date(item.last_active_at).getTime() < 15 * 60_000).length,
    today: users.filter(item => new Date(item.created_at).getTime() >= today.getTime()).length,
    thisMonth: users.filter(item => new Date(item.created_at).getTime() >= monthStart.getTime()).length,
    lastMonth: users.filter(item => { const d = new Date(item.created_at).getTime(); return d >= lastMonthStart.getTime() && d < monthStart.getTime() }).length,
    users,
  }
}

function isMissingTable(errorText) {
  const t = String(errorText || '').toLowerCase()
  return t.includes('schema cache') || t.includes('could not find the table') || t.includes('relation') || t.includes('does not exist')
}

async function localPublishCreation(body, baseUrl) {
  const creationId = String(body.creationId || '')
  const slug = String(body.slug || '').toLowerCase().trim()
  if (!/^[0-9a-f-]{36}$/i.test(creationId)) return { status: 400, body: { error: 'Invalid creation.' } }
  if (!validProjectName(slug)) return { status: 400, body: { error: 'Use 3-30 lowercase letters, numbers, or hyphens. Must start and end with a letter or number.' } }
  const local = readLocalDeployment(slug)
  if (local && local.id !== creationId) return { status: 409, body: { error: 'That app address is already in use. Choose another slug.', suggestions: generateNameSuggestions(slug, slug) } }
  const creation = { id: creationId, slug, title: body.title || slug, code: String(body.code || '') }
  if (!creation.code.trim()) return { status: 400, body: { error: 'This creation has no application code to publish.' } }
  if (!writeLocalDeployment(slug, creation)) return { status: 500, body: { error: 'Could not write deployment to disk.' } }
  const url = `${baseUrl}/app/${slug}`
  return { status: 200, body: { slug, path: `/app/${slug}`, url, subdomainUrl: `https://${slug}.alphatekx.name.ng` } }
}

async function localPublishPasted(body, baseUrl) {
  const title = String(body.title || '').trim().slice(0, 120)
  const slug = String(body.slug || '').toLowerCase().trim()
  const html = String(body.html || '').trim()
  if (!title) return { status: 400, body: { error: 'Enter an app name.' } }
  if (!validProjectName(slug)) return { status: 400, body: { error: 'Use 3-30 lowercase letters, numbers, or hyphens. Must start and end with a letter or number.' } }
  if (!/<(?:!doctype\s+html|html|body)[\s>]/i.test(html)) return { status: 400, body: { error: 'Paste a complete HTML document.' } }
  if (Buffer.byteLength(html, 'utf8') > 900_000) return { status: 413, body: { error: 'HTML must be smaller than 900 KB.' } }
  const existing = readLocalDeployment(slug)
  const creationId = existing?.id || randomUUID()
  const creation = { id: creationId, slug, title, code: html, type: 'html', files: [{ path: 'index.html', code: html }] }
  if (!writeLocalDeployment(slug, creation)) return { status: 500, body: { error: 'Could not write deployment to disk.' } }
  const url = `${baseUrl}/app/${slug}`
  return { status: 200, body: { creationId, slug, url, pathUrl: url, subdomainUrl: `https://${slug}.alphatekx.name.ng` } }
}

async function publishCreationPath(req, res) {
  const config = supabaseConfig()
  const baseUrl = String(process.env.PUBLIC_APP_URL || 'https://alphatekx.name.ng').replace(/\/$/, '')
  try {
    const body = await readBody(req)
    const user = await currentOrLocalUser(req, config.url, config.anon)
    if (!user) return json(res, 401, { error: 'Authentication required.' })
    if (!config.url || !config.anon || !config.service) {
      const result = await localPublishCreation(body, baseUrl)
      return json(res, result.status, result.body)
    }
    const creationId = String(body.creationId || '')
    const slug = String(body.slug || '').toLowerCase().trim()
    if (!/^[0-9a-f-]{36}$/i.test(creationId)) return json(res, 400, { error: 'Invalid creation.' })
    if (!validProjectName(slug)) return json(res, 400, { error: 'Use 3-30 lowercase letters, numbers, or hyphens. Must start and end with a letter or number.' })
    const availability = await checkGlobalProjectAvailability(slug, config, creationId)
    if (!availability.available) return json(res, 409, { error: availability.reason, suggestions: availability.suggestions, available: false })
    const headers = deploymentWriteHeaders(req, config)
    const creationResponse = await fetch(`${config.url}/rest/v1/creations?id=eq.${encodeURIComponent(creationId)}&user_id=eq.${encodeURIComponent(user.id)}&select=id,title,code`, { headers })
    const creationPayload = await creationResponse.json()
    if (!creationResponse.ok && !isMissingTable(creationPayload.message)) return json(res, 500, { error: creationPayload.message || 'Could not read this creation. Run supabase/path-deploy.sql first.' })
    const creation = creationPayload?.[0]
    if (!creation || !creationResponse.ok) {
      const result = await localPublishCreation(body, baseUrl)
      return json(res, result.status, result.body)
    }
    if (!String(creation.code || '').trim()) return json(res, 400, { error: 'This creation has no application code to publish.' })
    const conflictResponse = await fetch(`${config.url}/rest/v1/creations?slug=eq.${encodeURIComponent(slug)}&id=neq.${encodeURIComponent(creationId)}&select=id&limit=1`, { headers })
    const conflicts = await conflictResponse.json()
    if (!conflictResponse.ok && !isMissingTable(conflicts.message)) return json(res, 500, { error: conflicts.message || 'Could not validate the slug. Run supabase/path-deploy.sql first.' })
    if (conflicts?.length) return json(res, 409, { error: 'That app address is already in use. Choose another slug.' })
    const deploymentUrl = `${baseUrl}/app/${slug}`
    const updateResponse = await fetch(`${config.url}/rest/v1/creations?id=eq.${encodeURIComponent(creationId)}&user_id=eq.${encodeURIComponent(user.id)}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ slug, owner_id: user.id, published: true, status: 'live', deployment_url: deploymentUrl }),
    })
    const updated = await updateResponse.json()
    if (!updateResponse.ok || !updated?.length) {
      const result = await localPublishCreation(body, baseUrl)
      return json(res, result.status, result.body)
    }
    const subdomainUrl = `https://${slug}.alphatekx.name.ng`
    return json(res, 200, { slug, path: `/app/${slug}`, url: deploymentUrl, subdomainUrl })
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : 'Publication failed.' })
  }
}

async function publishPastedHtml(req, res) {
  const config = supabaseConfig()
  const baseUrl = String(process.env.PUBLIC_APP_URL || 'https://alphatekx.name.ng').replace(/\/$/, '')
  try {
    const body = await readBody(req)
    const user = await currentOrLocalUser(req, config.url, config.anon)
    if (!user) return json(res, 401, { error: 'Authentication required.' })
    if (!config.url || !config.anon || !config.service) {
      const result = await localPublishPasted(body, baseUrl)
      return json(res, result.status, result.body)
    }
    const title = String(body.title || '').trim().slice(0, 120)
    const slug = String(body.slug || '').toLowerCase().trim()
    const html = String(body.html || '').trim()
    if (!title) return json(res, 400, { error: 'Enter an app name.' })
    if (!validProjectName(slug)) return json(res, 400, { error: 'Use 3-30 lowercase letters, numbers, or hyphens. Must start and end with a letter or number.' })
    if (!/<(?:!doctype\s+html|html|body)[\s>]/i.test(html)) return json(res, 400, { error: 'Paste a complete HTML document.' })
    if (Buffer.byteLength(html, 'utf8') > 900_000) return json(res, 413, { error: 'HTML must be smaller than 900 KB.' })
    const headers = deploymentWriteHeaders(req, config)
    const existingResponse = await fetch(`${config.url}/rest/v1/creations?slug=eq.${encodeURIComponent(slug)}&select=id,user_id,mission_id,title&limit=1`, { headers })
    const existingPayload = await existingResponse.json()
    if (!existingResponse.ok) {
      if (isMissingTable(existingPayload.message)) { const result = await localPublishPasted(body, baseUrl); return json(res, result.status, result.body) }
      return json(res, 500, { error: existingPayload.message || 'Could not validate the slug. Run supabase/path-deploy.sql first.' })
    }
    const existing = existingPayload?.[0]
    const excludeId = existing?.id || ''
    const pastedAvailability = await checkGlobalProjectAvailability(slug, config, excludeId)
    if (!pastedAvailability.available) return json(res, 409, { error: pastedAvailability.reason, suggestions: pastedAvailability.suggestions, available: false })
    if (existing && existing.user_id !== user.id) return json(res, 409, { error: 'That subdomain is already in use.' })
    const pathUrl = `${baseUrl}/app/${slug}`
    const subdomainUrl = `https://${slug}.alphatekx.name.ng`
    let creationId = existing?.id || randomUUID()
    if (existing) {
      const updatedResponse = await fetch(`${config.url}/rest/v1/creations?id=eq.${encodeURIComponent(creationId)}&user_id=eq.${encodeURIComponent(user.id)}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({ title, code: html, type: 'html', files: [{ path: 'index.html', code: html }], owner_id: user.id, published: true, status: 'live', deployment_url: subdomainUrl }),
      })
      const updated = await updatedResponse.json()
      if (!updatedResponse.ok || !updated?.length) {
        if (isMissingTable(updated.message)) { const result = await localPublishPasted(body, baseUrl); return json(res, result.status, result.body) }
        return json(res, 500, { error: updated.message || 'Could not update this deployment.' })
      }
    } else {
      const missionId = randomUUID()
      const missionResponse = await fetch(`${config.url}/rest/v1/missions`, {
        method: 'POST', headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({ id: missionId, user_id: user.id, title: `Deploy ${title}`, goal: `Deploy pasted HTML for ${title}`, status: 'completed', progress: 100 }),
      })
      if (!missionResponse.ok) {
        if (isMissingTable(await missionResponse.text())) { const result = await localPublishPasted(body, baseUrl); return json(res, result.status, result.body) }
        return json(res, 500, { error: 'Could not create the deployment record.' })
      }
      const creationResponse = await fetch(`${config.url}/rest/v1/creations`, {
        method: 'POST', headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({ id: creationId, mission_id: missionId, user_id: user.id, owner_id: user.id, slug, title, code: html, type: 'html', status: 'live', files: [{ path: 'index.html', code: html }], published: true, deployment_url: subdomainUrl }),
      })
      const created = await creationResponse.json()
      if (!creationResponse.ok || !created?.length) {
        await fetch(`${config.url}/rest/v1/missions?id=eq.${encodeURIComponent(missionId)}`, { method: 'DELETE', headers })
        if (isMissingTable(created.message)) { const result = await localPublishPasted(body, baseUrl); return json(res, result.status, result.body) }
        return json(res, 500, { error: created.message || 'Could not save this deployment. Run supabase/path-deploy.sql first.' })
      }
    }
    return json(res, 200, { creationId, slug, pathUrl, subdomainUrl })
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : 'Code deployment failed.' })
  }
}

function serveStatic(req, res) {
  let pathname = '/'
  try { pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname) } catch {}
  if (pathname.split('/').includes('..') || /%2e/i.test(req.url || '')) return json(res, 404, { error: 'Not found' })
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  const candidate = path.resolve(distRoot, requested)
  const inside = candidate === distRoot || candidate.startsWith(`${distRoot}${path.sep}`)
  const file = inside && fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : path.resolve(distRoot, 'index.html')
  if (!fs.existsSync(file)) return json(res, 404, { error: 'Build not found. Run npm run build.' })
  const ext = path.extname(file)
  const types = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' }
  res.writeHead(200, { 'Content-Type': types[ext] || 'text/html; charset=utf-8', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable' })
  if (req.method === 'HEAD') return res.end()
  fs.createReadStream(file).pipe(res)
}

function sanitizeMissionId(value) {
  return String(value || randomUUID()).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || randomUUID()
}

function missionAppCode({ blueprintId, name, goal }) {
  const isCommerce = /commerce|store|shop|e-?commerce|cart|inventory/i.test(`${blueprintId} ${goal}`)
  const isRestaurant = /restaurant|menu|reservation|food|order/i.test(`${blueprintId} ${goal}`)
  const isLearning = /learn|course|lesson|student|quiz/i.test(`${blueprintId} ${goal}`)
  const isSaas = /saas|dashboard|metric|customer|billing/i.test(`${blueprintId} ${goal}`)
  const title = String(name || 'AlphaTekX Mission App').replace(/`/g, '')
  if (isCommerce) return `const { useMemo, useState, useEffect } = React;
function AlphaApp(){
  const initialProducts=[
    {id:'p1',name:'Chrome Runner Sneakers',category:'Shoes',price:42000,stock:5},
    {id:'p2',name:'Liquid Glass Hoodie',category:'Fashion',price:28000,stock:8},
    {id:'p3',name:'Orange Studio Backpack',category:'Bags',price:35000,stock:4},
    {id:'p4',name:'Founder Desk Lamp',category:'Office',price:18500,stock:6}
  ];
  const [products,setProducts]=useState(()=>JSON.parse(localStorage.getItem('alpha_products')||'null')||initialProducts);
  const [cart,setCart]=useState(()=>JSON.parse(localStorage.getItem('alpha_cart')||'[]'));
  const [query,setQuery]=useState('');
  const [orders,setOrders]=useState(()=>JSON.parse(localStorage.getItem('alpha_orders')||'[]'));
  const [form,setForm]=useState({name:'',phone:'',address:''});
  useEffect(()=>localStorage.setItem('alpha_products',JSON.stringify(products)),[products]);
  useEffect(()=>localStorage.setItem('alpha_cart',JSON.stringify(cart)),[cart]);
  useEffect(()=>localStorage.setItem('alpha_orders',JSON.stringify(orders)),[orders]);
  const filtered=products.filter(item=>item.name.toLowerCase().includes(query.toLowerCase())||item.category.toLowerCase().includes(query.toLowerCase()));
  const total=cart.reduce((sum,item)=>sum+item.price,0);
  const buy=(id)=>{const product=products.find(item=>item.id===id);if(!product||product.stock<1)return;setProducts(items=>items.map(item=>item.id===id?{...item,stock:Math.max(0,item.stock-1)}:item));setCart(items=>[...items,product]);};
  const checkout=(event)=>{event.preventDefault();if(!form.name||!form.phone||!cart.length)return;setOrders(items=>[{id:crypto.randomUUID(),customer:form,total,items:cart,createdAt:new Date().toLocaleString(),status:'pending'},...items]);setCart([]);setForm({name:'',phone:'',address:''});};
  return <main className="min-h-screen bg-[#0A0A0A] p-4 text-white md:p-8"><section className="mx-auto max-w-6xl"><div className="rounded-3xl border border-white/10 bg-[rgba(30,26,24,.72)] p-6 shadow-2xl backdrop-blur-3xl"><p className="text-sm text-[#E07A45]">Built by AlphaTekX Mission Mode</p><h1 className="mt-2 text-4xl font-bold">${title}</h1><p className="mt-3 text-white/60">Search products, manage stock, add to cart, checkout, and review orders. All data persists in localStorage.</p><input value={query} onChange={e=>setQuery(e.target.value)} className="mt-6 w-full rounded-2xl border border-white/10 bg-white/5 p-4 outline-none focus:border-[#E56B2D]" placeholder="Search products or category"/></div><div className="mt-6 grid gap-5 lg:grid-cols-[1fr_360px]"><div className="grid gap-4 md:grid-cols-2">{filtered.map(product=><article key={product.id} className="rounded-3xl border border-white/10 bg-[rgba(30,26,24,.72)] p-5 backdrop-blur-3xl"><div className="flex justify-between gap-3"><h2 className="font-semibold">{product.name}</h2><span className="text-[#E07A45]">NGN {product.price.toLocaleString()}</span></div><p className="mt-2 text-sm text-white/55">{product.category}</p><p className="mt-4 text-sm">Stock: {product.stock}</p><button onClick={()=>buy(product.id)} disabled={product.stock===0} className="mt-5 w-full rounded-2xl bg-gradient-to-br from-[#E56B2D] to-[#C45A26] p-3 font-semibold disabled:opacity-40">{product.stock===0?'Out of stock':'Add to cart'}</button></article>)}</div><aside className="rounded-3xl border border-white/10 bg-[rgba(30,26,24,.72)] p-5 backdrop-blur-3xl"><h2 className="text-xl font-bold">Cart</h2><div className="mt-4 space-y-2">{cart.map((item,index)=><p key={index} className="flex justify-between rounded-xl bg-white/5 p-3 text-sm"><span>{item.name}</span><span>NGN {item.price.toLocaleString()}</span></p>)}{!cart.length&&<p className="text-sm text-white/50">Cart is empty.</p>}</div><p className="mt-4 font-bold">Total: NGN {total.toLocaleString()}</p><form onSubmit={checkout} className="mt-5 grid gap-3">{['name','phone','address'].map(field=><input key={field} value={form[field]} onChange={e=>setForm({...form,[field]:e.target.value})} className="rounded-xl border border-white/10 bg-white/5 p-3 outline-none" placeholder={field}/>) }<button className="rounded-2xl bg-white p-3 font-semibold text-black">Checkout</button></form><h3 className="mt-6 font-semibold">Orders</h3><div className="mt-3 space-y-2">{orders.map(order=><p key={order.id} className="rounded-xl bg-white/5 p-3 text-xs">{order.customer.name} - NGN {order.total.toLocaleString()} - {order.status}</p>)}</div></aside></div></section></main>
}
ReactDOM.createRoot(document.getElementById('root')).render(<AlphaApp/>);`
  if (isRestaurant) return `const { useState, useMemo } = React;
function AlphaApp(){
  const menu=[{id:1,name:'Lagos Fire Jollof',price:6500,type:'Main'},{id:2,name:'Chrome Suya Platter',price:9000,type:'Grill'},{id:3,name:'Obsidian Mocktail',price:3500,type:'Drink'},{id:4,name:'Plantain Tower',price:4200,type:'Side'},{id:5,name:'Chef Tasting Board',price:18000,type:'Premium'}];
  const [cart,setCart]=useState([]);const [filter,setFilter]=useState('');const [reservations,setReservations]=useState(()=>JSON.parse(localStorage.getItem('alpha_reservations')||'[]'));const [booking,setBooking]=useState({name:'',phone:'',date:'',guests:'2'});
  const visible=menu.filter(item=>item.name.toLowerCase().includes(filter.toLowerCase())||item.type.toLowerCase().includes(filter.toLowerCase()));
  const total=cart.reduce((sum,item)=>sum+item.price,0);
  const reserve=e=>{e.preventDefault();if(!booking.name||!booking.phone||!booking.date)return;const next=[{id:crypto.randomUUID(),...booking,createdAt:new Date().toLocaleString()},...reservations];setReservations(next);localStorage.setItem('alpha_reservations',JSON.stringify(next));setBooking({name:'',phone:'',date:'',guests:'2'});};
  return <main className="min-h-screen bg-[#0A0A0A] p-4 text-white md:p-8"><section className="mx-auto max-w-6xl"><div className="rounded-[2rem] border border-white/10 bg-[rgba(30,26,24,.72)] p-8 backdrop-blur-3xl"><p className="text-[#E07A45]">Restaurant Empire OS</p><h1 className="mt-2 text-5xl font-bold">${title}</h1><p className="mt-4 max-w-2xl text-white/60">A complete menu, cart, reservation, and order experience generated by AlphaTekX workers.</p></div><div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]"><div><input value={filter} onChange={e=>setFilter(e.target.value)} className="mb-4 w-full rounded-2xl border border-white/10 bg-white/5 p-4 outline-none focus:border-[#E56B2D]" placeholder="Search menu..."/><div className="grid gap-4 md:grid-cols-2">{visible.map(item=><article key={item.id} className="rounded-3xl border border-white/10 bg-[rgba(30,26,24,.72)] p-5"><p className="text-xs text-[#E07A45]">{item.type}</p><h2 className="mt-2 text-xl font-semibold">{item.name}</h2><p className="mt-3 text-white/60">NGN {item.price.toLocaleString()}</p><button onClick={()=>setCart([...cart,item])} className="mt-5 rounded-2xl bg-gradient-to-br from-[#E56B2D] to-[#C45A26] px-5 py-3 font-semibold">Add to order</button></article>)}</div></div><aside className="rounded-3xl border border-white/10 bg-[rgba(30,26,24,.72)] p-5"><h2 className="text-xl font-bold">Order + Reservation</h2><div className="mt-3 space-y-2">{cart.map((item,index)=><p key={index} className="flex justify-between rounded-xl bg-white/5 p-3 text-sm"><span>{item.name}</span><span>{item.price.toLocaleString()}</span></p>)}</div><p className="mt-3 font-bold">Total NGN {total.toLocaleString()}</p><form onSubmit={reserve} className="mt-5 grid gap-3">{['name','phone','date','guests'].map(field=><input key={field} value={booking[field]} type={field==='date'?'date':'text'} onChange={e=>setBooking({...booking,[field]:e.target.value})} className="rounded-xl border border-white/10 bg-white/5 p-3" placeholder={field}/>) }<button className="rounded-2xl bg-white p-3 font-bold text-black">Reserve table</button></form><h3 className="mt-5 font-semibold">Reservations</h3>{reservations.map(item=><p key={item.id} className="mt-2 rounded-xl bg-white/5 p-3 text-xs">{item.name} - {item.guests} guests - {item.date}</p>)}</aside></div></section></main>
}
ReactDOM.createRoot(document.getElementById('root')).render(<AlphaApp/>);`
  if (isLearning) return `const { useState } = React;
function AlphaApp(){
  const lessons=['Foundation','Core Concepts','Practice Lab','Real Project','Final Quiz'].map((title,index)=>({id:index+1,title,objective:'Master '+title.toLowerCase(),quiz:'What is the key idea in '+title+'?'}));
  const [current,setCurrent]=useState(lessons[0]);const [done,setDone]=useState(()=>JSON.parse(localStorage.getItem('alpha_lessons')||'[]'));const [answer,setAnswer]=useState('');
  const complete=()=>{const next=[...new Set([...done,current.id])];setDone(next);localStorage.setItem('alpha_lessons',JSON.stringify(next));};
  return <main className="min-h-screen bg-[#0A0A0A] p-4 text-white md:p-8"><section className="mx-auto max-w-5xl"><div className="rounded-3xl border border-white/10 bg-[rgba(30,26,24,.72)] p-8 backdrop-blur-3xl"><p className="text-[#E07A45]">Learning Platform OS</p><h1 className="mt-2 text-4xl font-bold">${title}</h1><div className="mt-6 h-2 rounded-full bg-white/10"><div className="h-full rounded-full bg-[#E56B2D]" style={{width:(done.length/lessons.length*100)+'%'}}></div></div></div><div className="mt-6 grid gap-5 md:grid-cols-[260px_1fr]"><aside className="rounded-3xl border border-white/10 bg-[rgba(30,26,24,.72)] p-4">{lessons.map(lesson=><button key={lesson.id} onClick={()=>setCurrent(lesson)} className={'mb-2 w-full rounded-xl p-3 text-left '+(current.id===lesson.id?'bg-[#E56B2D]':'bg-white/5')}>{lesson.title} {done.includes(lesson.id)?'✓':''}</button>)}</aside><article className="rounded-3xl border border-white/10 bg-[rgba(30,26,24,.72)] p-8"><h2 className="text-3xl font-bold">{current.title}</h2><p className="mt-4 text-white/65">{current.objective}. This lesson includes explanation, practice, and a short quiz so the student learns by doing.</p><pre className="mt-6 overflow-auto rounded-2xl bg-black/40 p-4 text-sm">const skill = "${current.title}";{"\\n"}console.log("Practice", skill);</pre><p className="mt-6 font-semibold">{current.quiz}</p><input value={answer} onChange={e=>setAnswer(e.target.value)} className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 p-3" placeholder="Type your answer"/><button onClick={complete} className="mt-4 rounded-2xl bg-gradient-to-br from-[#E56B2D] to-[#C45A26] px-5 py-3 font-bold">Complete lesson</button></article></div></section></main>
}
ReactDOM.createRoot(document.getElementById('root')).render(<AlphaApp/>);`
  return `const { useMemo, useState } = React;
function AlphaApp(){
  const [customers,setCustomers]=useState(()=>JSON.parse(localStorage.getItem('alpha_customers')||'[]')||[{id:1,name:'Acme Foods',plan:'Pro',mrr:45000},{id:2,name:'Fresh Cuts',plan:'Starter',mrr:15000}]);
  const [task,setTask]=useState('');const [tasks,setTasks]=useState(()=>JSON.parse(localStorage.getItem('alpha_tasks')||'[]'));const revenue=customers.reduce((sum,item)=>sum+item.mrr,0);
  const addTask=e=>{e.preventDefault();if(!task.trim())return;const next=[{id:crypto.randomUUID(),text:task,done:false},...tasks];setTasks(next);localStorage.setItem('alpha_tasks',JSON.stringify(next));setTask('');};
  const toggle=id=>{const next=tasks.map(item=>item.id===id?{...item,done:!item.done}:item);setTasks(next);localStorage.setItem('alpha_tasks',JSON.stringify(next));};
  return <main className="min-h-screen bg-[#0A0A0A] p-4 text-white md:p-8"><section className="mx-auto max-w-6xl"><div className="rounded-3xl border border-white/10 bg-[rgba(30,26,24,.72)] p-8"><p className="text-[#E07A45]">SaaS Dashboard OS</p><h1 className="mt-2 text-4xl font-bold">${title}</h1></div><div className="mt-6 grid gap-4 md:grid-cols-3"><div className="rounded-3xl border border-white/10 bg-[rgba(30,26,24,.72)] p-5"><p className="text-white/55">MRR</p><strong className="text-3xl">NGN {revenue.toLocaleString()}</strong></div><div className="rounded-3xl border border-white/10 bg-[rgba(30,26,24,.72)] p-5"><p className="text-white/55">Customers</p><strong className="text-3xl">{customers.length}</strong></div><div className="rounded-3xl border border-white/10 bg-[rgba(30,26,24,.72)] p-5"><p className="text-white/55">Open tasks</p><strong className="text-3xl">{tasks.filter(t=>!t.done).length}</strong></div></div><div className="mt-6 grid gap-5 lg:grid-cols-2"><section className="rounded-3xl border border-white/10 bg-[rgba(30,26,24,.72)] p-5"><h2 className="font-bold">Customers</h2>{customers.map(customer=><p key={customer.id} className="mt-3 flex justify-between rounded-xl bg-white/5 p-3"><span>{customer.name}</span><span>{customer.plan} - NGN {customer.mrr.toLocaleString()}</span></p>)}</section><section className="rounded-3xl border border-white/10 bg-[rgba(30,26,24,.72)] p-5"><h2 className="font-bold">Tasks</h2><form onSubmit={addTask} className="mt-3 flex gap-2"><input value={task} onChange={e=>setTask(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 p-3" placeholder="Add operation task"/><button className="rounded-xl bg-[#E56B2D] px-5 font-bold">Add</button></form>{tasks.map(item=><button key={item.id} onClick={()=>toggle(item.id)} className="mt-3 block w-full rounded-xl bg-white/5 p-3 text-left">{item.done?'✓ ':'○ '}{item.text}</button>)}</section></div></section></main>
}
ReactDOM.createRoot(document.getElementById('root')).render(<AlphaApp/>);`
}

function missionFiles(input) {
  const code = missionAppCode(input)
  return [
    { path: 'package.json', code: JSON.stringify({ scripts: { dev: 'vite --host 0.0.0.0', build: 'vite build', preview: 'vite preview' }, dependencies: { '@vitejs/plugin-react': '^4.3.4', vite: '^6.1.0', typescript: '^5.8.2', react: '^18.2.0', 'react-dom': '^18.2.0' }, devDependencies: {} }, null, 2) },
    { path: 'index.html', code: '<!doctype html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>AlphaTekX Mission App</title><script src="https://cdn.tailwindcss.com"></script></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>' },
    { path: 'src/main.jsx', code: "import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport './index.css';\nimport './App.jsx';" },
    { path: 'src/App.jsx', code },
    { path: 'src/index.css', code: 'html,body,#root{min-height:100%;margin:0}*{box-sizing:border-box}body{background:#0A0A0A;color:white;font-family:Inter,ui-sans-serif,system-ui,sans-serif}' },
    { path: 'README.md', code: `# ${input.name}\n\nGenerated by AlphaTekX Mission Mode.\n\nGoal: ${input.goal}\n\nRun with:\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n` },
  ]
}

async function buildMissionFiles(req, res) {
  const body = await readBody(req)
  const missionId = sanitizeMissionId(body.missionId)
  const name = String(body.name || 'AlphaTekX Mission App')
  const goal = String(body.goal || 'Build a working app')
  const blueprintId = String(body.blueprintId || 'custom')
  const folder = path.resolve(root, 'generated', missionId)
  if (!folder.startsWith(path.resolve(root, 'generated'))) return json(res, 400, { error: 'Invalid mission id' })
  const files = missionFiles({ blueprintId, name, goal })
  fs.rmSync(folder, { recursive: true, force: true })
  for (const file of files) {
    const target = path.resolve(folder, file.path)
    if (!target.startsWith(folder)) throw new Error('Invalid generated file path')
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, file.code, 'utf8')
  }
  const logs = [
    `Planner: mapped ${files.length} files for ${name}.`,
    `Builder: wrote project to generated/${missionId}/.`,
    'Designer: applied International Orange Liquid Glass system.',
    'QA: verified state, forms, persistence, and preview entry.',
  ]
  return json(res, 200, { missionId, generatedPath: `generated/${missionId}`, files, code: files.find(file => file.path === 'src/App.jsx')?.code || '', logs })
}

const rateLimitMap = new Map()
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 60
const SENSITIVE_PATHS = ['/api/alpha', '/api/brain', '/api/credits', '/api/agents', '/api/alpha/mission', '/api/previews/', '/api/creations/publish', '/api/integrations/']
function isRateLimited(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim()
  const now = Date.now()
  const entry = rateLimitMap.get(ip) || { count: 0, reset: now + RATE_LIMIT_WINDOW_MS }
  if (now > entry.reset) { entry.count = 0; entry.reset = now + RATE_LIMIT_WINDOW_MS }
  if (SENSITIVE_PATHS.some(p => (req.url || '').startsWith(p))) entry.count++
  rateLimitMap.set(ip, entry)
  return entry.count > RATE_LIMIT_MAX
}

const server = http.createServer(async (req, res) => {
  applyCors(req, res)
  addSecurityHeaders(res)
  if (isRateLimited(req)) return json(res, 429, { error: 'Too many requests. Please slow down.' })
  if (req.method === 'OPTIONS') return json(res, 204, {})
  if (req.method === 'GET' && (req.url?.startsWith('/auth/google/callback') || req.url?.startsWith('/api/auth/gmail/callback'))) return googleCallback(req, res)
  if (req.method === 'GET' && (req.url?.startsWith('/auth/google?') || req.url?.startsWith('/auth/google?state='))) {
    try { return await beginGoogleOAuth(req, res) } catch (error) { return json(res, 400, { error: error instanceof Error ? error.message : 'Google connection failed' }) }
  }
  if (req.method === 'POST' && req.url === '/api/integrations/google/start') {
    try { return await startGoogleConnection(req, res) } catch (error) { return json(res, 400, { error: error instanceof Error ? error.message : 'Google connection failed' }) }
  }
  if (req.method === 'GET' && req.url === '/api/integrations/status') {
    try { return await integrationsStatus(req, res) } catch (error) { return json(res, 400, { error: error instanceof Error ? error.message : 'Could not load integrations' }) }
  }
  if (req.method === 'GET' && req.url === '/api/integrations/live-test') {
    try { return await liveTestIntegrations(req, res) } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Live test failed' }) }
  }
  if (req.method === 'DELETE' && (req.url === '/api/integrations/google' || req.url === '/api/integrations/gmail')) {
    try { return await disconnectGoogle(req, res) } catch (error) { return json(res, 400, { error: error instanceof Error ? error.message : 'Could not disconnect Google' }) }
  }
  if (req.method === 'POST' && /^\/api\/integrations\/[^/]+$/.test(req.url || '')) {
    try { return await saveIntegrationHandler(req, res) } catch (error) { return json(res, 400, { error: error instanceof Error ? error.message : 'Could not save integration' }) }
  }
  if (req.method === 'DELETE' && /^\/api\/integrations\/[^/]+$/.test(req.url || '')) {
    try { return await deleteIntegrationHandler(req, res) } catch (error) { return json(res, 400, { error: error instanceof Error ? error.message : 'Could not delete integration' }) }
  }
  if (req.method === 'GET' && req.url === '/api/user/usage') {
    try { return await userUsage(req, res) } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Could not load usage' }) }
  }
  if (req.method === 'GET' && req.url === '/api/user/brand-profile') {
    try { return await getBrandProfileHandler(req, res) } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Could not load brand profile' }) }
  }
  if (req.method === 'POST' && req.url === '/api/user/brand-profile') {
    try { return await saveBrandProfileHandler(req, res) } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Could not save brand profile' }) }
  }
  if (req.method === 'POST' && req.url === '/api/connectors/save') {
    try { return await saveConnectorHandler(req, res) } catch (error) { return json(res, 400, { error: error instanceof Error ? error.message : 'Could not save connector' }) }
  }
  if (req.method === 'POST' && req.url === '/api/connectors/test') {
    try { return await testConnectorHandler(req, res) } catch (error) { return json(res, 502, { error: error instanceof Error ? error.message : 'Connector test failed' }) }
  }
  if (req.method === 'GET' && req.url === '/api/connectors/linkedin/auth') {
    try { return await startLinkedInOAuth(req, res) } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'LinkedIn auth failed' }) }
  }
  if (req.method === 'POST' && req.url === '/api/connectors/linkedin/start') {
    try { return await startLinkedInConnection(req, res) } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'LinkedIn auth failed' }) }
  }
  if (req.method === 'GET' && req.url?.startsWith('/api/connectors/linkedin/callback')) {
    try { return await linkedinCallback(req, res) } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'LinkedIn callback failed' }) }
  }
  if (req.method === 'POST' && (req.url === '/api/gmail/send' || req.url === '/api/send-email')) {
    try { return await sendGmail(req, res) } catch (error) { return json(res, 400, { error: error instanceof Error ? error.message : 'Email could not be sent' }) }
  }
  if (req.method === 'POST' && req.url === '/api/alpha/conversation') {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      const body = await readBody(req)
      const prompt = String(body.prompt || '')
      const conversation = await getConversationEngine().start(user, prompt)
      return json(res, 200, { conversation, agent: conversation.automationDraft })
    } catch (error) { return json(res, error instanceof Error && error.message.includes('No AI provider') ? 503 : 400, { error: error instanceof Error ? error.message : 'Conversation failed' }) }
  }
  const conversationGetMatch = req.url?.match(/^\/api\/alpha\/conversation\/([^/]+)$/)
  if (conversationGetMatch && req.method === 'GET') {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      const conversation = await getConversationEngine().get(conversationGetMatch[1], user)
      return json(res, 200, { conversation, agent: conversation.automationDraft })
    } catch (error) { return json(res, 400, { error: error instanceof Error ? error.message : 'Could not load conversation' }) }
  }
  if (conversationGetMatch && req.method === 'POST') {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      const body = await readBody(req)
      const conversation = await getConversationEngine().continue(conversationGetMatch[1], user, String(body.message || ''))
      return json(res, 200, { conversation, agent: conversation.automationDraft })
    } catch (error) { return json(res, 400, { error: error instanceof Error ? error.message : 'Could not continue conversation' }) }
  }
  const conversationActionMatch = req.url?.match(/^\/api\/alpha\/conversation\/([^/]+)\/(approve|create|regenerate)$/)
  if (conversationActionMatch && req.method === 'POST') {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      const [, id, action] = conversationActionMatch
      const body = await readBody(req)
      const engine = getConversationEngine()
      if (action === 'create') {
        const agent = await engine.approveAndCreate(id, user)
        return json(res, 200, { agent, created: true })
      }
      if (action === 'approve') {
        const conversation = await engine.get(id, user)
        await engine.approveContent(conversation, Array.isArray(body.itemIds) ? body.itemIds : [])
        await saveServerAgent(conversation)
        return json(res, 200, { conversation, agent: conversation.automationDraft })
      }
      if (action === 'regenerate') {
        const conversation = await engine.get(id, user)
        await engine.regenerateContent(conversation, Array.isArray(body.itemIds) ? body.itemIds : [])
        await saveServerAgent(conversation)
        return json(res, 200, { conversation, agent: conversation.automationDraft })
      }
    } catch (error) { return json(res, 400, { error: error instanceof Error ? error.message : 'Action failed' }) }
  }
  if (req.method === 'POST' && req.url === '/api/agents/parse') {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      const body = await readBody(req)
      const prompt = String(body.prompt || '')
      const agent = await parseAgentFromNL(prompt, user)
      return json(res, 200, { agent })
    } catch (error) { return json(res, error instanceof Error && error.message.includes('No AI provider') ? 503 : 400, { error: error instanceof Error ? error.message : 'Parse failed' }) }
  }
  if (req.method === 'GET' && req.url === '/api/agents') {
    try { return json(res, 200, { agents: await listServerAgents(), executions: await listServerExecutions() }) }
    catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Could not load agents' }) }
  }
  if (req.method === 'POST' && req.url === '/api/agents') {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      const body = await readBody(req)
      const incoming = body.agent || body
      const agentId = incoming.id || randomUUID()
      const existing = await getServerAgent(agentId) || {}
      const merged = { ...existing, ...incoming, id: agentId, userId: user.id, userEmail: user.email }
      const status = incoming.status
      if (status === 'active' || status === 'pending') {
        merged.status = 'running'
        merged.approved = true
      }
      if (!merged.status || merged.status === 'awaiting_information') {
        merged.status = (merged.missing && merged.missing.length) ? 'awaiting_information' : 'running'
      }
      if (merged.status === 'running' || merged.status === 'active') {
        const allAgents = await listServerAgents()
        const activeCount = allAgents.filter(a => (a.status === 'running' || a.status === 'active') && a.userId === user.id && a.id !== agentId).length
        const canCreate = await billing.canCreateAgent(user, config, activeCount)
        if (!canCreate.ok) return json(res, 402, { error: canCreate.reason, plan: canCreate.plan, code: 'PLAN_LIMIT' })
      }
      const trigger = merged.trigger || {}
      const timezone = merged.timezone || merged.schedule?.timezone || existing.timezone || 'UTC'
      const cron = trigger.cron || '0 0 8 * * *'
      if (!trigger.nextRun || merged.status === 'running') {
        let nextRun
        if (trigger.type === 'campaign' || cron === 'campaign') {
          nextRun = campaignNextRun(merged.campaign)
        } else {
          try { nextRun = nextRunFromCronServer(cron, new Date(), timezone).toISOString() } catch { nextRun = new Date().toISOString() }
        }
        merged.trigger = { ...trigger, nextRun: nextRun || new Date().toISOString() }
        merged.nextRunAt = merged.trigger.nextRun
      }
      merged.updatedAt = new Date().toISOString()
      const agent = await saveServerAgent(merged)
      return json(res, 200, { agent })
    } catch (error) { return json(res, 400, { error: error instanceof Error ? error.message : 'Could not save agent' }) }
  }
  if (req.method === 'GET' && req.url === '/api/agents/run-due') return runDueAgents(req, res)
  if (req.method === 'GET' && req.url === '/api/agents/health') {
    try {
      const agents = await listServerAgents()
      const active = agents.filter(a => a.status === 'running' || a.status === 'active' || a.status === 'warning').length
      const due = agents.filter(a => (a.status === 'running' || a.status === 'active' || a.status === 'warning') && (a.trigger?.type === 'schedule' || a.trigger?.type === 'monitor' || a.trigger?.type === 'campaign') && a.trigger?.nextRun && new Date(a.trigger.nextRun) <= new Date()).length
      const logs = (await listAgentLogs({ limit: 5 })).map(l => ({ agentId: l.agentId, connectorType: l.connectorType, status: l.status, createdAt: l.createdAt }))
      return json(res, 200, { lastRun: schedulerState.lastRun, nextRun: schedulerState.nextRun, activeAgents: active, dueAgents: due, uptimeSeconds: schedulerState.uptime(), logs })
    } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Health check failed' }) }
  }
  if (req.method === 'POST' && req.url === '/api/agents/test-run') {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      const body = await readBody(req)
      const agent = await getServerAgent(String(body.agentId || ''))
      if (!agent) return json(res, 404, { error: 'Agent not found' })
      if (agent.userId && agent.userId !== user.id) return json(res, 403, { error: 'Not authorized' })
      const execution = await runAgent(agent, 'manual')
      return json(res, 200, { executed: true, execution })
    } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Test run failed' }) }
  }
  if (req.method === 'POST' && /^\/api\/agents\/campaign\/[^/]+\/activate\/?$/.test(req.url || '')) {
    try { return await activateCampaignHandler(req, res) } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Campaign activation failed' }) }
  }
  if (req.method === 'GET' && /^\/api\/agents\/campaign\/[^/]+\/report\/?$/.test(req.url || '')) {
    try { return await campaignReportHandler(req, res) } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Campaign report failed' }) }
  }
  if (req.method === 'GET' && req.url === '/api/agents/logs') {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      const url = new URL(req.url, 'http://localhost')
      const agentId = url.searchParams.get('agentId') || undefined
      const limit = Math.min(500, Number(url.searchParams.get('limit') || '100'))
      const logs = await listAgentLogs({ agentId, limit })
      return json(res, 200, { logs })
    } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Could not load logs' }) }
  }
  if (req.method === 'GET' && req.url === '/api/health') {
    return json(res, 200, { ok: true, timestamp: new Date().toISOString(), uptimeSeconds: schedulerState.uptime() })
  }
  const agentIdMatch = req.url?.match(/^\/api\/agents\/([^/]+)(?:\/run)?\/?$/)
  if (agentIdMatch) {
    const agentId = decodeURIComponent(agentIdMatch[1])
    const isRun = req.url.includes('/run')
    if (isRun && req.method === 'POST') {
      const agent = await getServerAgent(agentId)
      if (!agent) return json(res, 404, { error: 'Agent not found' })
      try { const execution = await runAgent(agent, 'manual'); return json(res, 200, { executed: true, execution }) }
      catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Run failed' }) }
    }
    if (req.method === 'GET') {
      const agent = await getServerAgent(agentId)
      if (!agent) return json(res, 404, { error: 'Agent not found' })
      const executions = (await listServerExecutions()).filter(e => e.agentId === agentId)
      return json(res, 200, { agent, executions })
    }
    if (req.method === 'POST') {
      try { const body = await readBody(req); const existing = await getServerAgent(agentId) || {}; const agent = await saveServerAgent({ ...existing, ...body.agent, id: agentId }); return json(res, 200, { agent }) }
      catch (error) { return json(res, 400, { error: error instanceof Error ? error.message : 'Could not update agent' }) }
    }
    if (req.method === 'DELETE') {
      await deleteServerAgent(agentId)
      return json(res, 200, { deleted: true })
    }
    return json(res, 405, { error: 'Method not allowed' })
  }
  const webhookMatch = req.url?.match(/^\/api\/agents\/webhook\/([^/]+)\/?$/)
  if (webhookMatch) {
    const agentId = decodeURIComponent(webhookMatch[1])
    if (req.method === 'POST') {
      try {
        const body = await readBody(req)
        saveWebhookEvent(agentId, body)
        const agent = await getServerAgent(agentId)
        if (agent && agent.status === 'running') {
          const execution = await runAgent(agent, 'webhook')
          return json(res, 200, { received: true, executed: true, agentId, execution })
        }
        return json(res, 200, { received: true, executed: false, agentId, reason: agent ? 'Agent not running' : 'Agent not found' })
      } catch (error) { return json(res, 400, { error: error instanceof Error ? error.message : 'Bad webhook' }) }
    }
    if (req.method === 'GET') {
      return json(res, 200, { agentId, events: readWebhookEvents(agentId) })
    }
    return json(res, 405, { error: 'Method not allowed' })
  }
  if (req.method === 'GET' && req.url === '/api/deploy/info') {
    const publicAppUrl = String(process.env.PUBLIC_APP_URL || '').replace(/\/$/, '') || `https://${String(req.headers.host || 'alphatekx.name.ng').split(':')[0]}`
    const serviceUrl = String(process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '') || `https://${String(req.headers.host || 'localhost').split(':')[0]}`
    const serviceHostname = (() => { try { return new URL(serviceUrl).hostname } catch { return 'alphatekx.onrender.com' } })()
    return json(res, 200, {
      publicAppUrl,
      serviceUrl,
      serviceHostname,
      wildcardDomain: `*.alphatekx.name.ng`,
      dnsRecords: [
        { type: 'CNAME', name: '*', value: serviceHostname, note: 'Point all subdomains to your Render service' },
      ],
      instructions: `Published apps are live at ${publicAppUrl}/app/{slug}. You can also add a wildcard custom domain *.alphatekx.name.ng in your Render Dashboard and point the CNAME above at your DNS provider so each app is reachable at https://{slug}.alphatekx.name.ng as an alias.`,
    })
  }
  if (req.method === 'GET' && req.url === '/api/paystack/status') {
    const required = { PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY }
    const missing = Object.entries(required).filter(([, value]) => !value).map(([name]) => name)
    return json(res, missing.length ? 503 : 200, { ready: missing.length === 0, missing, error: missing.length ? `Paystack needs these Render variables: ${missing.join(', ')}` : undefined })
  }
  if (req.method === 'POST' && req.url === '/api/paystack/initialize') {
    try { return await initializePaystackPayment(req, res) } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Payment initialization failed' }) }
  }
  if (req.method === 'POST' && req.url === '/api/paystack/verify-credits') {
    try {
      const body = await readBody(req)
      const result = await verifyAndAddCreditsByReference(String(body.reference || ''))
      return json(res, result ? 200 : 400, result ? { success: true, result } : { error: 'Could not verify credits' })
    } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Credit verification failed' }) }
  }
  if (req.method === 'POST' && req.url === '/api/paystack/webhook') {
    try { return await paystackWebhookHandler(req, res) } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Webhook failed' }) }
  }
  if (req.method === 'GET' && req.url === '/api/credits/balance') {
    try { return await creditsBalance(req, res) } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Balance failed' }) }
  }
  if (req.url === '/api/billing' || req.url === '/api/billing/upgrade') {
    try { return await billingHandler(req, res) } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Billing failed' }) }
  }
  if (req.method === 'POST' && (req.url === '/api/paystack/verify' || req.url === '/api/verify-paystack')) return verifyPaystack(req, res)
  if (req.method === 'POST' && req.url === '/api/marketplace/purchase') return purchaseMarketplace(req, res)
  if (req.method === 'POST' && req.url === '/api/missions/build') return buildMissionFiles(req, res)
  if (req.method === 'GET' && req.url?.startsWith('/api/projects/check-availability')) {
    try { return await handleCheckAvailability(req, res) } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Availability check failed' }) }
  }
  if (req.method === 'POST' && req.url === '/api/creations/publish') return publishCreationPath(req, res)
  if (req.method === 'POST' && req.url === '/api/creations/publish-code') return publishPastedHtml(req, res)
  if (req.method === 'POST' && req.url === '/api/credits/spend') return creditSpend(req, res)
  if (req.method === 'POST' && req.url === '/api/activity/ping') return activityPing(req, res)
  if (req.method === 'GET' && req.url === '/api/admin/stats') return adminStats(req, res)
  if (req.method === 'GET' && req.url === '/api/admin/providers') return adminProviderDiagnostics(req, res)
  if (req.method === 'POST' && req.url === '/api/admin/providers/health') return adminProviderHealthCheck(req, res)
  if (['GET', 'POST'].includes(req.method || '') && req.url === '/api/settings/api-keys') {
    try { return await apiKeySettings(req, res) } catch (error) { return json(res, 400, { error: error instanceof Error ? error.message : 'API key operation failed' }) }
  }
  if (req.method === 'POST' && req.url === '/api/settings/api-keys/test') {
    try { return await testStoredKey(req, res) } catch (error) { return json(res, 400, { error: error instanceof Error ? error.message : 'API key test failed' }) }
  }
  if (req.method === 'POST' && req.url === '/api/tools/currency') {
    try { const body = await readBody(req); return json(res, 200, await currencyPair(String(body.from || 'USD').toUpperCase(), String(body.to || 'NGN').toUpperCase(), Number(body.amount || 1))) }
    catch (error) { return json(res, 400, { error: error instanceof Error ? error.message : 'Currency conversion failed' }) }
  }
  if (req.method === 'POST' && req.url === '/api/workers/run') {
    try { return await runWorkerRequest(req, res) }
    catch (error) { return json(res, 400, { error: error instanceof Error ? error.message : 'Worker failed' }) }
  }
  if (req.method === 'GET' && req.url?.startsWith('/api/search')) {
    try {
      const url = new URL(req.url, 'http://localhost')
      const q = extractSearchQuery(String(url.searchParams.get('q') || ''))
      if (!q) return json(res, 400, { error: 'Missing search query.' })
      const results = firstKey('TAVILY_API_KEY') ? null : await duckDuckGoSearch(q)
      if (results && results.length) return json(res, 200, { results })
      const tavily = firstKey('TAVILY_API_KEY') ? await fetchJson('https://api.tavily.com/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: firstKey('TAVILY_API_KEY'), query: q, search_depth: 'advanced', max_results: 5, include_answer: true }) }) : null
      if (tavily) return json(res, 200, { results: (tavily.results || []).map(item => ({ title: item.title, url: item.url, snippet: item.content })), answer: tavily.answer })
      return json(res, 503, { error: 'Live search is not available. Add TAVILY_API_KEY or try again later.' })
    } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Search failed.' }) }
  }
  if (req.url?.startsWith('/api/apps/')) {
    try { if (await appDataHandler(req, res)) return } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'App data failed' }) }
  }
  if (req.method === 'POST' && req.url === '/api/alpha') {
    try {
      const body = await readBody(req)
      return json(res, 200, await handleAlpha(String(body.prompt || body.request || ''), String(body.mode || 'chat'), String(body.currentCode || ''), String(body.provider || '')))
    } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Alpha failed.' }) }
  }
  if (req.method === 'POST' && req.url === '/api/alpha/fallback') {
    try {
      const body = await readBody(req)
      return json(res, 200, { code: fallbackAlphaBuilder(String(body.prompt || '')), provider: 'fallback' })
    } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Fallback failed.' }) }
  }
  if (req.method === 'POST' && req.url === '/api/alpha/repair') {
    try {
      const body = await readBody(req)
      const prompt = `A build step failed for the project described below.\n\nFailed command: ${String(body.command || 'unknown')}\nError output:\n${String(body.error || '').slice(0, 4000)}\n\nOriginal request: ${String(body.prompt || '')}\n\nProject plan: ${String(body.plan || 'none')}\n\nPrevious repair attempts: ${Number(body.previousAttempts || 0)}\n\nFix the code so it passes TypeScript, ESLint, and Vite build. Return only the corrected complete App code or a JSON files object.`
      const result = await handleAlpha(prompt, 'refine', String(body.code || ''), String(body.provider || ''))
      return json(res, 200, { code: result.code || '', files: result.files || [], dependencies: result.dependencies || [], provider: result.provider || 'ai' })
    } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Repair failed.' }) }
  }
  if (req.method === 'POST' && req.url === '/api/alpha/plan') {
    try {
      const body = await readBody(req)
      const plan = await handlePlan(String(body.prompt || ''))
      return json(res, 200, { plan, provider: 'ai' })
    } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Plan extraction failed.' }) }
  }
  if ((req.method === 'GET' || req.method === 'POST') && req.url === '/api/alpha/providers') {
    const order = getProviderOrder()
    const configured = order.filter((name) => getProviderKey(name))
    const models = {
      qwen: process.env.QWEN_MODEL || 'qwen3.7-plus',
      kimi: process.env.KIMI_MODEL || 'kimi-k3',
      minimax: process.env.MINIMAX_MODEL || 'MiniMax-M3',
      flatkey: process.env.FLATKEY_MODEL || 'gpt-4o',
      openai: process.env.OPENAI_MODEL || 'gpt-4o',
      groq: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
    }
    return json(res, 200, { configured, order, models, defaultOrder: DEFAULT_PROVIDER_ORDER })
  }
  if (req.method === 'POST' && req.url === '/api/alpha/test-provider') {
    try {
      const body = await readBody(req)
      const name = String(body.provider || '')
      const prompt = String(body.prompt || 'say hi in one word')
      const isBuilder = Boolean(body.builder)
      if (!getProviderKey(name)) return json(res, 400, { ok: false, error: `${name} key not configured` })
      const maxTokens = Number(body.maxTokens) || 0
      const { data } = await callProvider(name, [{ role: 'user', content: prompt }], isBuilder, false, maxTokens)
      const text = String(data.choices?.[0]?.message?.content || '').trim()
      return json(res, 200, { ok: true, provider: name, text })
    } catch (error) {
      return json(res, 200, { ok: false, error: error instanceof Error ? error.message : 'Provider call failed' })
    }
  }
  if (req.url?.startsWith('/api/brain/')) {
    try { return await alphaBrain.handler(req, res) } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Alpha Brain failed' }) }
  }
  if (req.method === 'POST' && (req.url === '/api/reality' || req.url === '/api/alpha/mission')) {
    try {
      const body = await readBody(req)
      return json(res, 200, await handleReality(String(body.idea || body.prompt || '')))
    } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Reality failed.' }) }
  }
  try { if (await marketplaceHandler(req, res)) return } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Marketplace/Store failed' }) }
  if (req.method === 'POST' && req.url?.startsWith('/api/previews/')) {
    const match = req.url.match(/^\/api\/previews\/([^/]+)\/?$/)
    if (match) {
      try {
        const body = await readBody(req)
        const missionId = decodeURIComponent(match[1])
        if (!body.code) return json(res, 400, { error: 'Preview code is required.' })
        writePreviewCreation(missionId, { id: missionId, title: body.title || 'Preview', code: body.code, files: body.files || [] })
        const user = await currentOrLocalUser(req, supabaseConfig().url, supabaseConfig().anon)
        const abortController = new AbortController()
        const onClose = () => { try { abortController.abort() } catch {} }
        req.on('close', onClose)
        req.on('aborted', onClose)
        req.on('error', onClose)
        const build = await buildPreviewProject(missionId, body.code, body.files || [], body.dependencies || {}, { ownerId: user?.id || 'anonymous', prompt: String(body.prompt || ''), plan: String(body.plan || ''), expectedFeatures: Array.isArray(body.expectedFeatures) ? body.expectedFeatures : [], signal: abortController.signal })
        req.removeListener('close', onClose); req.removeListener('aborted', onClose); req.removeListener('error', onClose)
        if (build.ok) return json(res, 200, { ok: true, url: build.url, missionId, logs: build.logs, steps: build.steps })
        return json(res, 422, { ok: false, error: build.error || 'Preview build failed.', logs: build.logs, steps: build.steps, url: `/preview/${missionId}` })
      } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Preview build failed.' }) }
    }
  }
  if (req.url?.startsWith('/api/')) return json(res, 404, { error: 'API route not found' })
  const subdomain = requestSubdomain(req)
  if (subdomain && ['GET', 'HEAD'].includes(req.method || '')) return servePublishedCreation(req, res, subdomain)
  if (subdomain) return json(res, 404, { error: 'App route not found' })
  if (!['GET', 'HEAD'].includes(req.method || '')) return json(res, 404, { error: 'Not found' })
  const appMatch = new URL(req.url || '/', 'http://localhost').pathname.match(/^\/app\/([^/]+)\/?$/)
  if (appMatch) return servePublishedCreation(req, res, decodeURIComponent(appMatch[1]))
  const previewMatch = new URL(req.url || '/', 'http://localhost').pathname.match(/^\/preview\/([^/]+)(?:\/|$)/)
  if (previewMatch) {
    const missionId = decodeURIComponent(previewMatch[1])
    if (servePreviewBuild(req, res, missionId)) return
    return servePreview(req, res, missionId)
  }
  return serveStatic(req, res)
})

if (!process.env.VERCEL) {
  server.listen(port, () => process.stdout.write(`[AlphaTekX] listening on ${port}\n`))
  schedule('* * * * *', async () => {
    const started = new Date()
    schedulerState.lastRun = started.toISOString()
    schedulerState.nextRun = new Date(started.getTime() + 60_000).toISOString()
    try {
      const now = new Date()
      const agents = await listServerAgents()
      schedulerState.activeAgents = agents.filter(a => a.status === 'running' || a.status === 'active' || a.status === 'warning').length
      const due = agents.filter(a => (a.status === 'running' || a.status === 'active' || a.status === 'warning') && (a.trigger?.type === 'schedule' || a.trigger?.type === 'monitor' || a.trigger?.type === 'campaign') && a.trigger?.nextRun && new Date(a.trigger.nextRun) <= now)
      process.stdout.write(`[AGENT SCHEDULER] Running ${due.length} active agent(s) at ${started.toISOString()}\n`)
      for (const agent of due) {
        try { await runAgent(agent, 'schedule') } catch (err) { process.stdout.write(`[cron] agent ${agent.id} run error: ${err instanceof Error ? err.message : err}\n`) }
      }
    } catch (err) { process.stdout.write(`[cron] error: ${err instanceof Error ? err.message : err}\n`) }
  })

  schedule('0 9 * * *', async () => {
    try {
      const config = supabaseConfig()
      const resetCount = await billing.resetMonthlyCredits(config)
      process.stdout.write(`[billing] reset monthly credits for ${resetCount} user(s)\n`)
    } catch (err) { process.stdout.write(`[billing] reset cron error: ${err instanceof Error ? err.message : err}\n`) }
    try {
      const users = readJsonFile(usersFile, [])
      for (const user of users) {
        try { await alphaBrain.generatePredictions(user.id) } catch (err) { process.stdout.write(`[predictions] error for ${user.id}: ${err instanceof Error ? err.message : err}\n`) }
      }
      process.stdout.write(`[predictions] generated for ${users.length} user(s)\n`)
    } catch (err) { process.stdout.write(`[predictions] cron error: ${err instanceof Error ? err.message : err}\n`) }
  })

  if (process.env.KEEP_ALIVE !== 'false') {
    setInterval(async () => {
      try {
        const url = `https://alphatekx.name.ng/api/health`
        await fetch(url, { method: 'GET', signal: AbortSignal.timeout(30000) })
        process.stdout.write(`[keep-alive] pinged ${url}\n`)
      } catch (err) { process.stdout.write(`[keep-alive] ping failed: ${err instanceof Error ? err.message : err}\n`) }
    }, 14 * 60 * 1000)
  }
}
