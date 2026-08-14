import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { schedule } from 'node-cron'

import { fallbackAlphaBuilder } from './alphaFallback.mjs'
import { extractPlan, isPlatformPrompt } from './server/alphaPlatformBuilder.mjs'
import { buildPreviewProject, servePreviewBuild } from './server/previewBuild.mjs'
import { marketplaceHandler, fulfillMarketplaceOrder } from './server/marketplace.mjs'
import { getRecords, getRecord, createRecord, updateRecord, deleteRecord, appEntitiesMigrationSql } from './server/appData.mjs'
import { createAlphaBrain } from './server/alphaBrain.mjs'
import { supabaseServiceHeaders } from './server/supabaseHeaders.mjs'
import { buildCapabilityPlan, detectCapability, isSupportedAction } from './server/automation/capabilityRegistry.mjs'
import { createContentMemoryRecord } from './server/automation/contentMemory.mjs'
import { buildSocialPublishingAction, providerPostIds } from './server/automation/socialPublishing.mjs'
import { validateFreeCampaign } from './server/automation/freePlanPolicy.mjs'
import { createConversationEngine } from './server/alpha/conversationEngine.mjs'
import { classifyIntent, INTENT_CATEGORIES } from './server/alpha/intentClassifier.mjs'
import { createAlphaJobQueue, enqueueAlphaJob, getAlphaJob } from './server/alpha/alphaJobQueue.mjs'
import { setConversationEngine } from './server/alpha/alphaEngineSingleton.mjs'
import { normalizeAutomationLifecycle } from './server/automation/lifecycle.mjs'
import { prepareCampaignPostsForActivation } from './server/automation/campaignActivation.mjs'
import { ALPHATEKX_BRAIN } from './server/alpha/brainKnowledge.mjs'
import * as providerHealth from './server/alpha/providerHealth.mjs'
import * as billing from './server/billing.mjs'
import { hasUsableLinkedInStorage, normalizeLinkedInScopes, publishLinkedInTextPost } from './server/linkedin.mjs'
import { allowedWhatsAppRecipients, applyWhatsAppStatusEvent, executeApprovedWhatsAppMessage, normalizeWhatsAppRecipient, sendWhatsAppText, verifyWhatsAppPhoneRegistration, verifyWhatsAppWebhookSignature, whatsappCredentials, whatsappWebhookEvents } from './server/whatsapp.mjs'
import { connectorFeatureAccess, featureStatusForUser, refreshFeatureConfig, unavailableConnectorMessage, unavailablePromptConnector } from './server/featureAccess.mjs'
import * as alphaConnector from './server/composioConnectorService.mjs'
// Provide a local wrapper function for provider executions. We do NOT mutate
// the imported module's exports (they are read-only in ESM). Instead we
// expose `executeProviderWithHealing` and update call sites to use it.
async function executeProviderWithHealing(user, provider, actionName, params = {}, options = {}) {
  const originalExecute = alphaConnector.executeProviderAction && alphaConnector.executeProviderAction.bind(alphaConnector)
  if (!originalExecute) throw new Error('Connector execution not available')
  const backoffs = [5000, 30000, 300000]
  const maxAttempts = backoffs.length
  let attempt = 0
  options = { ...(options || {}), deferCreditSettlement: true }

  while (true) {
    try {
      return await originalExecute(user, provider, actionName, params, options)
    } catch (err) {
      attempt += 1
      const message = String(err instanceof Error ? err.message : err)
      const isAuth = /401|403|unauthori|invalid_grant|token expired/i.test(message)
      const isRate = /429|rate limit|too many requests/i.test(message)
      const isServer = /5\d{2}|502|503|504/i.test(message)

      // Try quick fixes for auth where we can
      try {
        if (isAuth && (provider === 'gmail' || provider === 'google' || provider === 'youtube')) {
          try { await refreshGoogleTokens(await getUserIntegration(user.id, 'google', supabaseConfig()).catch(() => null), supabaseConfig()) } catch (e) { }
        }
      } catch (e) { }

      if (!isRate && !isServer) {
        throw err
      }

      if (attempt > maxAttempts) throw err

      const wait = backoffs[Math.min(attempt - 1, backoffs.length - 1)] || 5000
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, wait))
    }
  }
}
import * as mediaLibrary from './server/mediaLibraryService.mjs'
import * as videoPipeline from './server/videoPipeline.mjs'
// Lazy load pro-video-workflow to avoid sharp/canvas native deps at startup
let proVideoWorkflow = null
const loadProVideoWorkflow = async () => {
  if (!proVideoWorkflow) {
    try {
      proVideoWorkflow = await import('./server/pro-video-workflow.mjs')
    } catch (err) {
      console.warn('[Phase 1] Pro video workflow unavailable (sharp/canvas not installed):', err.message)
      proVideoWorkflow = {}
    }
  }
  return proVideoWorkflow
}
import * as moneyLoop from './server/moneyLoopService.mjs'
import * as eliteBuilder from './server/eliteBuilderService.mjs'
import { claimPendingAction, createPendingAction, finishPendingAction, listPendingActions } from './server/ceoPendingActions.mjs'
import { scheduledCreditCost } from './server/schedulePricing.mjs'
import generatePostHandler from './api/ai/generate-post.mjs'

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

const supportEmail = String(process.env.SUPPORT_EMAIL || 'alphatekxcompany@gmail.com').trim()
const supportWhatsAppNumber = normalizeWhatsAppRecipient(process.env.SUPPORT_WHATSAPP || '9046802069')

const port = Number(process.env.PORT || 3001)
const root = path.dirname(fileURLToPath(import.meta.url))
const distRoot = path.resolve(root, 'dist')

const deploymentsDir = path.resolve(root, 'deployed')
const previewsDir = path.resolve(root, 'data', 'previews')
const dataDir = path.resolve(root, 'data')
const usersFile = path.resolve(dataDir, 'users.json')
const activityFile = path.resolve(dataDir, 'activity.json')
const integrationsFile = path.resolve(dataDir, 'integrations.json')
const agentsFile = path.resolve(dataDir, 'agents.json')
const agentExecutionsFile = path.resolve(dataDir, 'agent-executions.json')
const agentLogsFile = path.resolve(dataDir, 'agent-logs.json')
const ceoPendingActionsFile = path.resolve(dataDir, 'ceo-pending-actions.json')
try { fs.mkdirSync(deploymentsDir, { recursive: true }) } catch {}
try { fs.mkdirSync(previewsDir, { recursive: true }) } catch {}
try { fs.mkdirSync(dataDir, { recursive: true }) } catch {}

const schedulerState = { lastRun: null, nextRun: null, activeAgents: 0, startedAt: new Date().toISOString(), isRunning: false, uptime: () => Math.floor((Date.now() - new Date(schedulerState.startedAt).getTime()) / 1000) }
// Video work must outlive a browser connection.  This in-memory registry is intentionally
// small and only stores live work; final bytes live in the configured media bucket.
const videoJobs = new Map()
const scanQuotaByDay = globalThis.__alphatekxScanQuotaByDay || (globalThis.__alphatekxScanQuotaByDay = new Map())
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Content-Length, Authorization, X-File-Name, X-Local-User, X-Local-User-Id, X-Local-User-Email')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
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
const handleServerError = (err, req, res) => {
  const message = err instanceof Error ? err.message : String(err)
  console.error('SERVER ERROR:', message, req.url || '/')
  return json(res, 500, { success: false, error: message })
}
const readBody = (req) => {
  if (req.alphaBody !== undefined) return Promise.resolve(req.alphaBody)
  return new Promise((resolve, reject) => {
  let raw = ''
  req.on('data', chunk => { raw += chunk; if (raw.length > 1_000_000) reject(new Error('Request too large')) })
  req.on('end', () => { try { req.alphaBody = JSON.parse(raw || '{}'); resolve(req.alphaBody) } catch { reject(new Error('Invalid JSON')) } })
  req.on('error', reject)
  })
}
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
    const text = await response.text()
    if (!response.ok) {
      let message = `Provider HTTP ${response.status}`
      try {
        const payload = text ? JSON.parse(text) : null
        message = payload?.error?.message || payload?.details?.error?.message || payload?.error || message
      } catch {}
      throw new Error(String(message))
    }
    return text
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

// Groq is the primary provider for interactive planning. OpenAI remains a
// last-resort fallback so an exhausted OpenAI quota cannot stall Alpha first.
const DEFAULT_PROVIDER_ORDER = 'groq,qwen,kimi,minimax,flatkey,openai'

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
      const model = modelOverride || process.env.GROQ_MODEL || 'openai/gpt-oss-120b'
      try {
        data = await fetchJson('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers, body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, ...responseFormat }) }, timeout)
      } catch (err) {
        const msg = String(err?.message || err)
        if (/tokens per day|rate limit reached/i.test(msg) && model !== 'openai/gpt-oss-120b') {
          data = await fetchJson('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers, body: JSON.stringify({ model: 'openai/gpt-oss-120b', messages, temperature, max_tokens: maxTokens, ...responseFormat }) }, timeout)
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
  const messages = [{ role: 'system', content: `${ALPHATEKX_BRAIN}\n\nTask instructions:\n${systemPrompt}` }, { role: 'user', content: userPrompt }]
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
  if (role === 'content') {
    const configured = env ? env.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : []
    const safeFallbacks = [...configured, ...(fallbackOrder || getProviderOrder())]
      .filter(name => name !== 'openai' && name !== 'groq' && getProviderKey(name))
    return [...(getProviderKey('groq') ? ['groq'] : []), ...Array.from(new Set(safeFallbacks))]
  }
  if (env) {
    const configured = env.split(',').map(s => s.trim().toLowerCase()).filter(Boolean).filter(name => getProviderKey(name))
    if (configured.length) return configured
  }
  return fallbackOrder || getProviderOrder().filter(name => getProviderKey(name))
}

function getRoleModel(role, provider, defaultModel = '') {
  return process.env[`ALPHA_${role.toUpperCase()}_MODEL`] || process.env[`AI_ROLE_${role.toUpperCase()}_MODEL`] || process.env[`AI_${role.toUpperCase()}_MODEL`] || process.env[`${provider.toUpperCase()}_MODEL`] || defaultModel
}

function isProviderOrConfigError(error) {
  const message = String(error instanceof Error ? error.message : error || '')
  return /provider|api key|configured|configuration|rate limit|quota|fetch failed|timeout|temporarily unavailable|No AI provider|No content in provider response|invalid_api_key|unauthorized|upstream/i.test(message)
}

function alphaConfigurationMessage(error) {
  const message = String(error instanceof Error ? error.message : error || '')
  if (/No AI provider|not configured|api key|invalid_api_key|unauthorized/i.test(message)) {
    return 'Alpha is online, but the AI provider is not configured correctly. Add a working Groq key in Render as GROQ_API_KEY or GROQ_API_KEY_1, then redeploy.'
  }
  if (/rate limit|quota|tokens per|temporarily unavailable|upstream/i.test(message)) {
    return 'Alpha is online, but the AI provider is temporarily unavailable or rate-limited. Groq should be the primary provider; check GROQ_API_KEY_1-4 in Render.'
  }
  return 'Alpha is online, but the AI provider/configuration failed while planning. Check Render environment variables and try again.'
}

function fallbackConversationResponse(user, input, error) {
  return {
    id: randomUUID(),
    type: 'conversation',
    status: 'chatting',
    conversationStage: 'chatting',
    userId: user?.id || 'anonymous',
    userEmail: user?.email || '',
    originalRequest: String(input || ''),
    knownFields: {},
    missingFields: [],
    pendingConnections: [],
    automationDraft: null,
    messages: [
      { role: 'user', text: String(input || ''), ts: new Date().toISOString() },
      { role: 'alpha', text: alphaConfigurationMessage(error), ts: new Date().toISOString() },
    ],
  }
}

async function callLLMForRole(role, systemPrompt, userPrompt, { jsonMode = true, maxTokens = 0, fallbackOrder = null } = {}) {
  const order = getRoleProviderOrder(role, fallbackOrder)
  if (order.length === 0) throw new Error('No AI provider configured or all providers are temporarily unavailable. Add OPENAI_API_KEY, GROQ_API_KEY, QWEN_API_KEY, KIMI_API_KEY, MINIMAX_API_KEY, or FLATKEY_API_KEY.')
  const messages = [{ role: 'system', content: `${ALPHATEKX_BRAIN}\n\nTask instructions:\n${systemPrompt}` }, { role: 'user', content: userPrompt }]
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
  const cronParts = cron.split(/\s+/).map(s => s.trim()).filter(Boolean)
  // Accept both standard five-field cron and the six-field (seconds first)
  // form emitted by older AlphaTekx records.
  const [minute, hour, day, month] = cronParts.length === 6 ? cronParts.slice(1) : cronParts
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
    successRate: 0,
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
    successRate: plan.successRate ?? 0,
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
        model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
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

async function userFromAccessToken(accessToken, supabaseUrl, anonKey) {
  if (!accessToken || accessToken.length > 1_000_000) return null
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
    })
    return response.ok ? response.json() : null
  } catch {
    return null
  }
}

function normalizedAuthEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function authUserEmail(user) {
  const direct = normalizedAuthEmail(user?.email)
  if (direct) return direct
  const metadataEmail = normalizedAuthEmail(user?.user_metadata?.email || user?.app_metadata?.email)
  if (metadataEmail) return metadataEmail
  for (const identity of user?.identities || []) {
    const identityEmail = normalizedAuthEmail(identity?.identity_data?.email)
    if (identityEmail) return identityEmail
  }
  return ''
}

const productAdminEmails = new Set([
  'iamdan4live@gmail.com',
  'coderking555@gmail.com',
  'codeking481@gmail.com',
  'alphatekxcompany@gmail.com',
])

function isAdminAuthUser(user) {
  const email = authUserEmail(user)
  if (productAdminEmails.has(email)) return true
  const configured = new Set(
    String(process.env.SUPER_ADMIN_EMAILS || '')
      .split(',')
      .map(normalizedAuthEmail)
      .filter(Boolean),
  )
  return configured.has(email)
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
  const data = await fetchJson(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model: model || (provider === 'groq' ? 'openai/gpt-oss-120b' : 'gpt-4o-mini'), messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], max_tokens: 1800, temperature: 0.4 }) })
  return { text: String(data.choices?.[0]?.message?.content || '').trim(), provider }
}

const adminEmail = 'iamdan4live@gmail.com'
const DEFAULT_CREDITS = 10
const supabaseConfig = () => ({
  url: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  anon: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
  service: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_ADMIN_KEY || '',
})
const alphaBrain = createAlphaBrain({ currentOrLocalUser, getUser, supabaseConfig, json, readBody, callLLMJSON })
const serviceHeaders = (service) => supabaseServiceHeaders(service)
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

function createOAuthState(userId, config, email = '', redirect = '/agents', extra = {}) {
  const payload = Buffer.from(JSON.stringify({ userId, email: cleanHeader(email), redirect: String(redirect || '/agents'), expires: Date.now() + 10 * 60_000, nonce: randomBytes(16).toString('hex'), ...extra })).toString('base64url')
  const signature = createHmac('sha256', oauthStateKey(config)).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

function verifyOAuthState(value, config) {
  const [payload, signature] = String(value || '').split('.')
  if (!payload || !signature) throw new Error('Invalid or missing OAuth connection state. Start the connection again.')
  const expected = createHmac('sha256', oauthStateKey(config)).update(payload).digest()
  const received = Buffer.from(signature, 'base64url')
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error('Invalid OAuth connection state. Start the connection again.')
  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  if (!parsed.userId || Number(parsed.expires) < Date.now()) throw new Error('OAuth connection expired. Start the connection again.')
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
  const googleCredential = Boolean(google?.access_token || google?.refresh_token || google?.tokens?.access_token || google?.tokens?.refresh_token)
  const email = google?.email || null
  const scopes = google?.scopes || []
  const status = {}
  const gmailReady = googleCredential && scopes.some(scope => scope.includes('gmail.'))
  const sheetsReady = googleCredential && scopes.some(scope => scope.includes('spreadsheets'))
  const calendarReady = googleCredential && scopes.some(scope => scope.includes('calendar'))
  const driveReady = googleCredential && scopes.some(scope => scope.includes('drive'))
  const googleConnected = gmailReady || sheetsReady || calendarReady || driveReady
  status.google = { connected: googleConnected, ready: googleConnected, email, scopes }
  status.gmail = { connected: gmailReady, ready: gmailReady, email, scopes }
  status.sheets = { connected: sheetsReady, ready: sheetsReady, email, scopes }
  status.calendar = { connected: calendarReady, ready: calendarReady, email, scopes }
  status.drive = { connected: driveReady, ready: driveReady, email, scopes }
  status.google_sheets = status.sheets
  status.google_calendar = status.calendar
  status.google_drive = status.drive
  const providers = ['github', 'linkedin', 'whatsapp', 'paystack', 'supabase', 'notion', 'slack', 'discord', 'telegram', 'email']
  for (const provider of providers) {
    const integration = await getUserIntegration(user.id, provider, config).catch(() => null)
    const token = integration?.tokens || {}
    const identifier = token?.chat_id || token?.author_urn || token?.channel || token?.page_id || token?.pageId || token?.phone_number_id || token?.phoneNumberId || integration?.identifier || null
    const expiresAt = Number(token?.expiry || token?.expires_at || token?.expiry_date || 0)
    const expired = expiresAt > 0 && expiresAt <= Date.now()
    const integrationScopes = provider === 'linkedin' ? normalizeLinkedInScopes(integration?.scopes) : (integration?.scopes || [])
    const accessToken = token?.api_key || token?.access_token || token?.token || token?.bot_token || ''
    const webhookUrl = token?.webhook_url || token?.webhookUrl || ''
    let credentialReady = Boolean(accessToken || webhookUrl)
    if (provider === 'linkedin') credentialReady = Boolean(accessToken && String(token?.author_urn || token?.authorUrn || '').startsWith('urn:li:person:') && integrationScopes.includes('w_member_social'))
    if (provider === 'facebook') credentialReady = Boolean(accessToken && (token?.page_id || token?.pageId))
    if (provider === 'telegram') credentialReady = Boolean(identifier && (accessToken || token?.isMaster === true || token?.isMaster === 'true'))
    if (provider === 'slack') credentialReady = Boolean(webhookUrl || (accessToken && identifier))
    if (provider === 'discord') credentialReady = Boolean(webhookUrl)
    if (provider === 'whatsapp') credentialReady = Boolean(accessToken && (token?.phone_number_id || token?.phoneNumberId))
    const connected = Boolean(integration && credentialReady && !expired)
    status[provider] = { connected, ready: connected, expired, scopes: integrationScopes, hasOwnKey: token?.hasOwnKey === true || token?.hasOwnKey === 'true', isMaster: token?.isMaster === true || token?.isMaster === 'true', identifier, email: integration?.email || integration?.identifier || null }
  }
  if (!status.paystack.connected && process.env.PAYSTACK_SECRET_KEY) status.paystack = { connected: true, ready: true, email: 'AlphaTekX backend' }
  if (!status.supabase.connected && config.url && config.service) status.supabase = { connected: true, ready: true, email: 'AlphaTekX backend' }
  const whatsappServer = whatsappCredentials()
  const whatsappEnvironmentNames = {
    accessToken: 'WHATSAPP_ACCESS_TOKEN',
    phoneNumberId: 'WHATSAPP_PHONE_NUMBER_ID',
    businessAccountId: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
    verifyToken: 'WHATSAPP_VERIFY_TOKEN',
    appSecret: 'WHATSAPP_APP_SECRET',
    apiVersion: 'WHATSAPP_API_VERSION',
  }
  if (whatsappServer.configured) status.whatsapp = { connected: true, ready: true, configured: true, email: 'AlphaTekx WhatsApp server account' }
  else status.whatsapp = {
    ...(status.whatsapp || {}),
    connected: false,
    ready: false,
    configured: false,
    setupError: `Missing Render variables: ${whatsappServer.missing.map(name => whatsappEnvironmentNames[name] || name).join(', ')}`,
  }
  const facebookServer = facebookCredentials()
  status.facebook = {
    ...(status.facebook || { connected: false, ready: false }),
    configured: Boolean(facebookServer.appId && facebookServer.appSecret),
    ...(!facebookServer.appId || !facebookServer.appSecret ? { setupError: 'Missing Render variables: META_APP_ID, META_APP_SECRET' } : {}),
  }
  const features = featureStatusForUser(user, trustedFeatureIdentity(req))
  status._access = features
  for (const [provider, access] of Object.entries(features.connectors)) {
    if (!status[provider]) status[provider] = { connected: false, ready: false }
    status[provider] = { ...status[provider], access: access.availability, publicEnabled: access.publicEnabled }
    if (!access.enabled) status[provider] = { ...status[provider], connected: false, ready: false }
  }
  return json(res, 200, status)
}

async function authenticatedAdmin(req) {
  const config = supabaseConfig()
  const tokenUser = await authenticatedUser(req, config.url, config.anon).catch(() => null)
  if (isAdminAuthUser(tokenUser)) return { user: { ...tokenUser, email: authUserEmail(tokenUser) }, config }
  if (process.env.NODE_ENV !== 'production') {
    const local = localUserFromRequest(req)
    if (isAdminAuthUser(local)) return { user: { ...local, email: authUserEmail(local) }, config }
  }
  return null
}

async function adminFeaturesHandler(req, res) {
  return json(res, 410, { error: 'Feature management is disabled for launch. Released tools are controlled by code.' })
}

async function updateAdminFeatureHandler(req, res, featureId) {
  return json(res, 410, { error: 'Feature management is disabled for launch. Released tools are controlled by code.' })
}

async function adminBetaUserHandler(req, res) {
  return json(res, 410, { error: 'Beta feature management is disabled for launch.' })
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
  if (!requireConnectorFeature(req, res, user, provider)) return
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
  const sharedTelegram = platform === 'telegram' && Boolean(tokens.chat_id || tokens.chatId)
  if (!tokens.api_key && !tokens.access_token && !tokens.token && !tokens.webhook_url && !tokens.webhookUrl && !tokens.bot_token && !tokens.botToken && !sharedTelegram) return json(res, 400, { error: 'Connector credentials required' })
  if (sharedTelegram) {
    const master = masterCredentials('telegram')
    if (!master?.botToken) return json(res, 503, { error: 'AlphaTekx Telegram bot is not configured on the server.' })
    const chatId = String(tokens.chat_id || tokens.chatId || '').trim()
    if (!/^-?\d+$/.test(chatId)) return json(res, 400, { error: 'Enter a valid numeric Telegram chat ID.' })
    const verifyResponse = await fetch(`https://api.telegram.org/bot${master.botToken}/getChat?chat_id=${encodeURIComponent(chatId)}`)
    const verifyData = await verifyResponse.json().catch(() => ({}))
    if (!verifyResponse.ok || !verifyData.ok) {
      return json(res, 400, { error: verifyData.description || 'The AlphaTekx bot cannot access that Telegram chat. Open the bot and send it a message first.' })
    }
    tokens.chat_id = chatId
    tokens.isMaster = true
    tokens.hasOwnKey = false
    delete tokens.chatId
  } else {
    tokens.hasOwnKey = true
  }
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
  if (!requireConnectorFeature(req, res, user, platform)) return
  const text = String(body.text || body.message || 'AlphaTekX connector test')
  const imageUrl = String(body.imageUrl || body.image_url || '')
  const videoUrl = String(body.videoUrl || body.video_url || '')
  const to = String(body.to || body.phone || body.phoneNumber || '')
  if (!['linkedin', 'discord', 'slack', 'telegram', 'x', 'twitter', 'facebook', 'instagram', 'youtube', 'whatsapp'].includes(platform)) return json(res, 400, { error: 'Unsupported platform' })
  try {
    const result = await postToSocial(platform, user, { text, imageUrl, videoUrl, to })
    return json(res, 200, { success: true, platform, result })
  } catch (error) {
    if (error.message === 'FREE_LIMIT_REACHED') return json(res, 402, { success: false, error: 'FREE_LIMIT_REACHED', message: "You've used 2 free posts! Add your own API key for unlimited free posts or upgrade to Pro." })
    return json(res, 502, { success: false, error: error instanceof Error ? error.message : 'Connector test failed' })
  }
}

const linkedinOAuthScopes = () => {
  const configured = normalizeLinkedInScopes(process.env.LINKEDIN_OAUTH_SCOPES || 'openid profile email w_member_social')
  if (!configured.includes('w_member_social')) configured.push('w_member_social')
  return configured
}

const linkedinRedirectUri = () => {
  const canonical = `${publicAppUrl()}/api/connectors/linkedin/callback`
  let value = String(process.env.LINKEDIN_REDIRECT_URI || canonical)
    .trim()
    .replace(/^LINKEDIN_REDIRECT_URI\s*=\s*/i, '')
    .trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1).trim()
  }
  let parsed
  try { parsed = new URL(value) } catch {
    process.stdout.write('[linkedin oauth] Invalid LINKEDIN_REDIRECT_URI; using the canonical AlphaTekx callback.\n')
    return canonical
  }
  const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
  if ((parsed.protocol !== 'https:' && !local) || parsed.pathname !== '/api/connectors/linkedin/callback' || parsed.search || parsed.hash) {
    process.stdout.write('[linkedin oauth] Unsafe LINKEDIN_REDIRECT_URI; using the canonical AlphaTekx callback.\n')
    return canonical
  }
  return parsed.toString()
}

function linkedinOAuthUrl(clientId, redirectUri, state) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: linkedinOAuthScopes().join(' '),
    state,
  })
  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`
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
  const redirectUri = linkedinRedirectUri()
  const state = createOAuthState(user.id, config, user.email || '', '/connectors')
  const authUrl = linkedinOAuthUrl(clientId, redirectUri, state)
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
  const redirectUri = linkedinRedirectUri()
  const requestedRedirect = String(body?.returnTo || body?.redirect || '/dashboard')
  const safeRedirect = requestedRedirect.startsWith('/') && !requestedRedirect.startsWith('//') ? requestedRedirect : '/connected-apps'
  const state = createOAuthState(user.id, config, user.email, safeRedirect)
  const authUrl = linkedinOAuthUrl(clientId, redirectUri, state)
  return json(res, 200, { url: authUrl })
}

async function linkedinCallback(req, res) {
  const config = supabaseConfig()
  const url = new URL(req.url || '/', `http://localhost`)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  let destination = new URL('/connected-apps?connected=linkedin', publicAppUrl())
  try {
    const denied = url.searchParams.get('error_description') || url.searchParams.get('error')
    if (denied) throw new Error(`LinkedIn authorization was denied: ${denied}`)
    if (!code || !state) throw new Error('Missing LinkedIn authorization code or state')
    const parsed = verifyOAuthState(state, config)
    const safeRedirect = String(parsed.redirect || '').startsWith('/') && !String(parsed.redirect || '').startsWith('//') ? String(parsed.redirect) : '/connected-apps'
    destination = new URL(safeRedirect, publicAppUrl())
    destination.searchParams.set('connected', 'linkedin')
    const clientId = process.env.MASTER_LINKEDIN_CLIENT_ID || process.env.LINKEDIN_CLIENT_ID || ''
    const clientSecret = process.env.MASTER_LINKEDIN_CLIENT_SECRET || process.env.LINKEDIN_CLIENT_SECRET || ''
    if (!clientId || !clientSecret) throw new Error('LinkedIn client credentials not configured')
    const redirectUri = linkedinRedirectUri()
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
    const grantedScopes = normalizeLinkedInScopes(tokenData.scope)
    const scopes = grantedScopes.length ? grantedScopes : linkedinOAuthScopes()
    if (!scopes.includes('w_member_social')) throw new Error('LinkedIn did not grant Share on LinkedIn permission. Reconnect and approve the requested permission.')
    const saved = await saveUserIntegration(parsed.userId, 'linkedin', { email: parsed.email, identifier: authorUrn, tokens: { access_token: accessToken, author_urn: authorUrn, isMaster: false, hasOwnKey: true, expiry: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : undefined }, scopes }, config)
    if (!saved.durable) throw new Error('LinkedIn authorized successfully, but AlphaTekx could not securely save the connection. Please retry shortly.')
    const verified = await getUserIntegration(parsed.userId, 'linkedin', config)
    const verifiedScopes = normalizeLinkedInScopes(verified?.scopes)
    const verifiedAuthor = verified?.tokens?.author_urn || verified?.tokens?.authorUrn || ''
    if (!verified?.tokens?.access_token || !String(verifiedAuthor).startsWith('urn:li:person:') || !verifiedScopes.includes('w_member_social')) {
      throw new Error('LinkedIn authorized, but the saved connection could not be verified. Please reconnect.')
    }
  } catch (error) {
    destination = new URL('/connected-apps?connected=error', publicAppUrl())
    destination.searchParams.set('reason', error instanceof Error ? error.message.slice(0, 180) : 'LinkedIn connection failed')
  }
  res.writeHead(302, { Location: destination.toString(), 'Cache-Control': 'no-store' })
  return res.end()
}

function xOAuthCredentials() {
  return {
    clientId: String(process.env.X_CLIENT_ID || '').trim(),
    clientSecret: String(process.env.X_CLIENT_SECRET || '').trim(),
    redirectUri: String(process.env.X_REDIRECT_URI || `${publicAppUrl()}/api/x/callback`).trim(),
  }
}

async function startXConnection(req, res) {
  const config = supabaseConfig()
  const body = req.method === 'POST' ? await readBody(req) : {}
  const localUser = body?.localUser ? { id: String(body.localUser.id || ''), email: String(body.localUser.email || '') } : localUserFromRequest(req)
  const user = config.url && config.anon ? (await authenticatedUser(req, config.url, config.anon).catch(() => null) || localUser) : localUser
  if (!user?.id || !user?.email) return json(res, 401, { error: 'Authentication required' })
  const { clientId, redirectUri } = xOAuthCredentials()
  if (!clientId) return json(res, 503, { error: 'X OAuth needs X_CLIENT_ID on Render, followed by a redeploy.' })
  const verifier = randomBytes(48).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const requestedRedirect = String(body?.redirect || '/connected-apps')
  const safeRedirect = requestedRedirect.startsWith('/') && !requestedRedirect.startsWith('//') ? requestedRedirect : '/connected-apps'
  const state = createOAuthState(user.id, config, user.email, safeRedirect, {
    provider: 'x',
    verifier: encryptSecret(verifier, encryptionKey(config)),
  })
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'tweet.read tweet.write users.read offline.access',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })
  const authUrl = `https://x.com/i/oauth2/authorize?${params.toString()}`
  if (req.method === 'GET') {
    res.writeHead(302, { Location: authUrl, 'Cache-Control': 'no-store' })
    return res.end()
  }
  return json(res, 200, { url: authUrl })
}

async function xCallback(req, res) {
  const config = supabaseConfig()
  const url = new URL(req.url || '/', 'http://localhost')
  let destination = new URL('/connected-apps?connected=x', publicAppUrl())
  try {
    const denied = url.searchParams.get('error_description') || url.searchParams.get('error')
    if (denied) throw new Error(`X authorization was denied: ${denied}`)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    if (!code || !state) throw new Error('Missing X authorization code or state')
    const parsed = verifyOAuthState(state, config)
    if (parsed.provider !== 'x' || !parsed.verifier) throw new Error('Invalid X connection state')
    const verifier = decryptSecret(parsed.verifier, encryptionKey(config))
    const { clientId, clientSecret, redirectUri } = xOAuthCredentials()
    if (!clientId) throw new Error('X client ID is not configured')
    const tokenBody = new URLSearchParams({ code, grant_type: 'authorization_code', redirect_uri: redirectUri, code_verifier: verifier, client_id: clientId })
    const tokenHeaders = { 'Content-Type': 'application/x-www-form-urlencoded' }
    if (clientSecret) tokenHeaders.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
    const tokenResponse = await fetch('https://api.x.com/2/oauth2/token', { method: 'POST', headers: tokenHeaders, body: tokenBody })
    const tokenData = await tokenResponse.json().catch(() => ({}))
    if (!tokenResponse.ok || !tokenData.access_token) throw new Error(tokenData.error_description || tokenData.error || 'X token exchange failed')
    const meResponse = await fetch('https://api.x.com/2/users/me?user.fields=username,name', { headers: { Authorization: `Bearer ${tokenData.access_token}` } })
    const meData = await meResponse.json().catch(() => ({}))
    if (!meResponse.ok || !meData.data?.id) throw new Error(meData.detail || 'Could not verify the connected X account')
    await saveUserIntegration(parsed.userId, 'x', {
      email: parsed.email,
      identifier: String(meData.data.id),
      tokens: {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || '',
        username: meData.data.username || '',
        expiry: tokenData.expires_in ? Date.now() + Number(tokenData.expires_in) * 1000 : undefined,
        isMaster: false,
        hasOwnKey: true,
      },
      scopes: normalizeLinkedInScopes(tokenData.scope || 'tweet.read tweet.write users.read offline.access'),
    }, config)
    const safeRedirect = String(parsed.redirect || '').startsWith('/') && !String(parsed.redirect || '').startsWith('//') ? String(parsed.redirect) : '/connected-apps'
    destination = new URL(safeRedirect, publicAppUrl())
    destination.searchParams.set('connected', 'x')
  } catch (error) {
    destination = new URL('/connected-apps?connected=error', publicAppUrl())
    destination.searchParams.set('reason', error instanceof Error ? error.message.slice(0, 180) : 'X connection failed')
  }
  res.writeHead(302, { Location: destination.toString(), 'Cache-Control': 'no-store' })
  return res.end()
}

const facebookScopes = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts']
const facebookRedirectUri = () => String(process.env.META_REDIRECT_URI || `${publicAppUrl()}/api/connectors/facebook/callback`).trim()
const facebookGraphBaseUrl = () => String(process.env.FACEBOOK_GRAPH_BASE_URL || 'https://graph.facebook.com/v22.0').replace(/\/$/, '')
const facebookDialogUrl = () => String(process.env.FACEBOOK_OAUTH_DIALOG_URL || 'https://www.facebook.com/v22.0/dialog/oauth')

function facebookCredentials() {
  return {
    appId: String(process.env.META_APP_ID || '').trim(),
    appSecret: String(process.env.META_APP_SECRET || '').trim(),
  }
}

async function startFacebookConnection(req, res) {
  const config = supabaseConfig()
  const body = await readBody(req)
  const localUser = body?.localUser ? { id: String(body.localUser.id || ''), email: String(body.localUser.email || '') } : localUserFromRequest(req)
  const user = config.url && config.anon ? (await authenticatedUser(req, config.url, config.anon).catch(() => null) || localUser) : localUser
  if (!user?.id || !user?.email) return json(res, 401, { error: 'Authentication required' })
  const { appId, appSecret } = facebookCredentials()
  if (!appId || !appSecret) return json(res, 503, { error: 'Facebook OAuth needs META_APP_ID and META_APP_SECRET on Render, followed by a redeploy.' })
  const requestedRedirect = String(body?.redirect || '/connected-apps')
  const safeRedirect = requestedRedirect.startsWith('/') && !requestedRedirect.startsWith('//') ? requestedRedirect : '/connected-apps'
  const state = createOAuthState(user.id, config, user.email, safeRedirect)
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: facebookRedirectUri(),
    state,
    response_type: 'code',
    scope: facebookScopes.join(','),
  })
  return json(res, 200, { url: `${facebookDialogUrl()}?${params.toString()}`, redirectUri: facebookRedirectUri() })
}

async function facebookCallback(req, res) {
  const config = supabaseConfig()
  const url = new URL(req.url || '/', 'http://localhost')
  let destination = new URL('/connected-apps?connected=facebook', publicAppUrl())
  try {
    const denied = url.searchParams.get('error_message') || url.searchParams.get('error_description') || url.searchParams.get('error')
    if (denied) throw new Error(`Facebook authorization was denied: ${denied}`)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    if (!code || !state) throw new Error('Missing Facebook authorization code or state')
    const parsed = verifyOAuthState(state, config)
    if (!connectorFeatureAccess({ email: parsed.email }, 'facebook', true).enabled) throw new Error(unavailableConnectorMessage('facebook'))
    const safeRedirect = String(parsed.redirect || '').startsWith('/') && !String(parsed.redirect || '').startsWith('//') ? String(parsed.redirect) : '/connected-apps'
    destination = new URL(safeRedirect, publicAppUrl())
    destination.searchParams.set('connected', 'facebook')
    const { appId, appSecret } = facebookCredentials()
    if (!appId || !appSecret) throw new Error('Facebook app credentials are not configured')

    const tokenUrl = new URL(`${facebookGraphBaseUrl()}/oauth/access_token`)
    tokenUrl.search = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: facebookRedirectUri(),
      code,
    }).toString()
    const tokenResponse = await fetch(tokenUrl)
    const tokenData = await tokenResponse.json().catch(() => ({}))
    if (!tokenResponse.ok || !tokenData.access_token) throw new Error(tokenData.error?.message || 'Facebook token exchange failed')

    const userToken = String(tokenData.access_token)
    const profileResponse = await fetch(`${facebookGraphBaseUrl()}/me?fields=id,name&access_token=${encodeURIComponent(userToken)}`)
    const profile = await profileResponse.json().catch(() => ({}))
    if (!profileResponse.ok || !profile.id) throw new Error(profile.error?.message || 'Could not fetch Facebook profile')

    const pagesResponse = await fetch(`${facebookGraphBaseUrl()}/me/accounts?fields=id,name,access_token,tasks&access_token=${encodeURIComponent(userToken)}`)
    const pagesData = await pagesResponse.json().catch(() => ({}))
    if (!pagesResponse.ok) throw new Error(pagesData.error?.message || 'Could not fetch Facebook Pages')
    const pages = Array.isArray(pagesData.data) ? pagesData.data : []
    const publishablePages = pages.filter(item => item.id && item.access_token && (!Array.isArray(item.tasks) || item.tasks.includes('CREATE_CONTENT')))
    if (!publishablePages.length) throw new Error('No Facebook Page with publishing access was found')

    const expiresAt = tokenData.expires_in ? Date.now() + Number(tokenData.expires_in) * 1000 : undefined
    await saveUserIntegration(parsed.userId, 'facebook_pending', {
      email: parsed.email,
      identifier: String(profile.id),
      scopes: facebookScopes,
      tokens: {
        user_access_token: userToken,
        facebook_user_id: String(profile.id),
        pages: publishablePages.map(page => ({ id: String(page.id), name: String(page.name || 'Facebook Page'), access_token: String(page.access_token), tasks: page.tasks || [] })),
        expiry: expiresAt,
        selection_expires_at: Date.now() + 10 * 60_000,
      },
    }, config)
    destination.searchParams.set('connected', 'facebook_select')
  } catch (error) {
    destination = new URL('/connected-apps?connected=error', publicAppUrl())
    destination.searchParams.set('reason', error instanceof Error ? error.message.slice(0, 180) : 'Facebook connection failed')
  }
  res.writeHead(302, { Location: destination.toString(), 'Cache-Control': 'no-store' })
  return res.end()
}

async function listFacebookPages(req, res) {
  const config = supabaseConfig()
  const user = await currentOrLocalUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const pending = await getUserIntegration(user.id, 'facebook_pending', config)
  const expiresAt = Number(pending?.tokens?.selection_expires_at || 0)
  if (!pending || !expiresAt || expiresAt <= Date.now()) return json(res, 404, { error: 'Facebook Page selection expired. Connect Facebook again.' })
  const pages = Array.isArray(pending.tokens?.pages) ? pending.tokens.pages : []
  return json(res, 200, { pages: pages.map(page => ({ id: String(page.id), name: String(page.name || 'Facebook Page') })) })
}

async function selectFacebookPage(req, res) {
  const config = supabaseConfig()
  const user = await currentOrLocalUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const body = await readBody(req)
  const pageId = String(body.pageId || '')
  if (!pageId) return json(res, 400, { error: 'Select a Facebook Page' })
  const pending = await getUserIntegration(user.id, 'facebook_pending', config)
  const expiresAt = Number(pending?.tokens?.selection_expires_at || 0)
  if (!pending || !expiresAt || expiresAt <= Date.now()) return json(res, 410, { error: 'Facebook Page selection expired. Connect Facebook again.' })
  const page = (Array.isArray(pending.tokens?.pages) ? pending.tokens.pages : []).find(item => String(item.id) === pageId)
  if (!page?.access_token) return json(res, 404, { error: 'Selected Facebook Page is unavailable' })
  const verifyResponse = await fetch(`${facebookGraphBaseUrl()}/${encodeURIComponent(pageId)}?fields=id,name&access_token=${encodeURIComponent(page.access_token)}`)
  const verifiedPage = await verifyResponse.json().catch(() => ({}))
  if (!verifyResponse.ok || String(verifiedPage.id || '') !== pageId) return json(res, 502, { error: verifiedPage.error?.message || 'Facebook Page verification failed' })
  await saveUserIntegration(user.id, 'facebook', {
    email: user.email,
    identifier: pageId,
    scopes: facebookScopes,
    tokens: {
      access_token: String(page.access_token),
      page_access_token: String(page.access_token),
      page_id: pageId,
      page_name: String(verifiedPage.name || page.name || 'Facebook Page'),
      facebook_user_id: String(pending.tokens?.facebook_user_id || ''),
      expiry: pending.tokens?.expiry,
      hasOwnKey: true,
      isMaster: false,
    },
  }, config)
  await deleteUserIntegration(user.id, 'facebook_pending', config)
  return json(res, 200, { connected: true, page: { id: pageId, name: String(verifiedPage.name || page.name || 'Facebook Page') } })
}

const customOAuthProviders = {
  tiktok: {
    name: 'TikTok',
    clientIdEnv: 'TIKTOK_CLIENT_KEY',
    clientSecretEnv: 'TIKTOK_CLIENT_SECRET',
    redirectEnv: 'TIKTOK_REDIRECT_URI',
    redirectPath: '/api/tiktok/callback',
    authorizeUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    scopes: ['user.info.basic', 'video.list', 'video.upload'],
    clientIdParam: 'client_key',
  },
  snapchat: {
    name: 'Snapchat',
    clientIdEnv: 'SNAPCHAT_CLIENT_ID',
    clientSecretEnv: 'SNAPCHAT_CLIENT_SECRET',
    redirectEnv: 'SNAPCHAT_REDIRECT_URI',
    redirectPath: '/api/snapchat/callback',
    authorizeUrl: 'https://accounts.snapchat.com/login/oauth2/authorize',
    tokenUrl: 'https://accounts.snapchat.com/login/oauth2/access_token',
    scopes: ['snapchat-marketing-api'],
    clientIdParam: 'client_id',
  },
}

function customOAuthConfig(provider) {
  const definition = customOAuthProviders[provider]
  if (!definition) return null
  return {
    ...definition,
    clientId: String(process.env[definition.clientIdEnv] || '').trim(),
    clientSecret: String(process.env[definition.clientSecretEnv] || '').trim(),
    redirectUri: String(process.env[definition.redirectEnv] || `${publicAppUrl()}${definition.redirectPath}`).trim(),
  }
}

async function startCustomOAuth(req, res, provider) {
  const definition = customOAuthConfig(provider)
  if (!definition) return json(res, 404, { error: 'Unknown OAuth provider' })
  const config = supabaseConfig()
  const user = await currentOrLocalUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  if (!definition.clientId || !definition.clientSecret) {
    return json(res, 503, { error: `${definition.name} is not configured yet. Add ${definition.clientIdEnv} and ${definition.clientSecretEnv} on Render.` })
  }
  const state = createOAuthState(user.id, config, user.email || '', '/connected-apps')
  const params = new URLSearchParams({
    [definition.clientIdParam]: definition.clientId,
    redirect_uri: definition.redirectUri,
    response_type: 'code',
    scope: provider === 'tiktok' ? definition.scopes.join(',') : definition.scopes.join(' '),
    state,
  })
  return json(res, 200, { url: `${definition.authorizeUrl}?${params.toString()}`, provider })
}

async function customOAuthCallback(req, res, provider) {
  const definition = customOAuthConfig(provider)
  let destination = new URL('/connected-apps', publicAppUrl())
  try {
    if (!definition?.clientId || !definition?.clientSecret) throw new Error(`${definition?.name || provider} is not configured`)
    const requestUrl = new URL(req.url || '/', publicAppUrl())
    const denied = requestUrl.searchParams.get('error_description') || requestUrl.searchParams.get('error')
    if (denied) throw new Error(`${definition.name} authorization was denied: ${denied}`)
    const code = requestUrl.searchParams.get('code')
    const state = requestUrl.searchParams.get('state')
    if (!code || !state) throw new Error(`${definition.name} did not return a valid authorization response`)
    const parsed = verifyOAuthState(state, supabaseConfig())
    const tokenBody = new URLSearchParams({
      [definition.clientIdParam]: definition.clientId,
      client_secret: definition.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: definition.redirectUri,
    })
    const tokenResponse = await fetch(definition.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
    })
    const tokenData = await tokenResponse.json().catch(() => ({}))
    if (!tokenResponse.ok || !tokenData.access_token) throw new Error(tokenData.error_description || tokenData.message || `${definition.name} token exchange failed`)
    await saveUserIntegration(parsed.userId, provider, {
      email: parsed.email,
      identifier: tokenData.open_id || tokenData.sub || parsed.email,
      scopes: String(tokenData.scope || definition.scopes.join(' ')).split(/[,\s]+/).filter(Boolean),
      tokens: {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || '',
        expiry: Date.now() + Number(tokenData.expires_in || 3600) * 1000,
        open_id: tokenData.open_id || '',
      },
    }, supabaseConfig())
    destination.searchParams.set('connected', provider)
    destination.searchParams.set('provider', provider)
  } catch (error) {
    destination.searchParams.set('connected', 'error')
    destination.searchParams.set('provider', provider)
    destination.searchParams.set('reason', error instanceof Error ? error.message.slice(0, 180) : `${provider} connection failed`)
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
  // Enhanced self-healing wrapper with retries, loop-guard, and Supabase reporting
  const config = supabaseConfig()
  const headers = serviceHeaders(config.service)
  const backoffs = [5000, 30000, 300000]
  const maxAttempts = backoffs.length

  // Loop guard: if > threshold runs in window, pause automation
  try {
    const windowSec = 60
    const threshold = 20
    const windowStart = new Date(Date.now() - windowSec * 1000).toISOString()
    const runsUrl = `${config.url}/rest/v1/workflow_runs?automation_id=eq.${encodeURIComponent(agent.id)}&created_at=gte.${encodeURIComponent(windowStart)}&select=id`
    const runsResp = await fetch(runsUrl, { method: 'GET', headers: { ...headers, Prefer: 'count=exact' } })
    const cr = runsResp.headers.get('content-range') || ''
    const total = cr.includes('/') ? Number(cr.split('/').slice(-1)[0]) : null
    if (Number.isInteger(total) && total >= threshold) {
      // pause automation
      const pauseUpdate = { status: 'paused', health_status: 'paused_loop', paused_reason: `Loop ${total} runs in ${windowSec}s`, plain_english_error: `Automation paused due to ${total} rapid runs in ${windowSec} seconds.` }
      try { await fetch(`${config.url}/rest/v1/automations?id=eq.${encodeURIComponent(agent.id)}`, { method: 'PATCH', headers, body: JSON.stringify(pauseUpdate) }) } catch {}
      const runRow = { automation_id: agent.id, workflow_id: agent.id, user_id: agent.userId || null, status: 'paused_loop', error: 'loop_guard', plain_english_error: `Loop detected ${total} runs in ${windowSec}s`, retry_count: 0, created_at: new Date().toISOString() }
      try { await fetch(`${config.url}/rest/v1/workflow_runs`, { method: 'POST', headers, body: JSON.stringify(runRow) }) } catch {}
      await addAgentLog({ agentId: agent.id, connectorType: action.connector, content: content.slice(0, 500), status: 'failed', error: 'Loop guard triggered' })
      return { status: 'error', duration: Date.now() - start, output: null, error_code: 'LOOP_GUARD', credits_used: 0, log: 'Loop guard triggered: automation paused' }
    }
  } catch (e) { /* ignore loop guard failures */ }

  let attempt = 0
  while (attempt < maxAttempts) {
    try {
      const result = await executeConnectorAction(user, action)
      const response = result.status === 'success'
        ? { agentId: agent.id, connectorType: action.connector, content: content.slice(0, 500), status: 'success', response: result.log }
        : { agentId: agent.id, connectorType: action.connector, content: content.slice(0, 500), status: 'failed', error: result.log }
      await addAgentLog(response)
      if (result.status === 'success') {
        try { await alphaBrain.logMemory(user.id, { event_type: 'workflow_run', summary: `${action.connector} ${action.action} succeeded: ${result.log}`, source_workflow_id: agent.id, metadata: { agent: agent.name, connector: action.connector, action: action.action, output: result.output } }) } catch {}
        // record success run
        try { await fetch(`${config.url}/rest/v1/workflow_runs`, { method: 'POST', headers, body: JSON.stringify({ automation_id: agent.id, workflow_id: agent.id, user_id: agent.userId || null, status: 'success', error: null, plain_english_error: null, retry_count: attempt, created_at: new Date().toISOString() }) }) } catch {}
      } else {
        try { await alphaBrain.recordHealing(user.id, agent.id, result.log, '', 'logged') } catch {}
      }
      return result
    } catch (error) {
      attempt += 1
      const message = String(error instanceof Error ? error.message : error)
      await addAgentLog({ agentId: agent.id, connectorType: action.connector, content: content.slice(0, 500), status: 'failed', error: message })
      try { await alphaBrain.recordHealing(user.id, agent.id, message, `Check ${action.connector} connection and retry.`, 'pending') } catch {}

      // translate minimal errors
      const isAuth = /401|403|unauthori|invalid_grant|token expired/i.test(message)
      const isRate = /429|rate limit|too many requests/i.test(message)
      const isServer = /5\d{2}|502|503|504/i.test(message)

      // record failed run
      try {
        await fetch(`${config.url}/rest/v1/workflow_runs`, { method: 'POST', headers, body: JSON.stringify({ automation_id: agent.id, workflow_id: agent.id, user_id: agent.userId || null, status: attempt >= maxAttempts ? 'failed_needs_attention' : 'failed', error: message, plain_english_error: isAuth ? `Your ${action.connector} connection expired. Reconnect.` : (isRate ? `Rate limited by ${action.connector}.` : message), retry_count: attempt, created_at: new Date().toISOString() }) })
      } catch (e) { /* ignore */ }

      if (isAuth) {
        // mark needs_reconnect and pause
        try { await fetch(`${config.url}/rest/v1/automations?id=eq.${encodeURIComponent(agent.id)}`, { method: 'PATCH', headers, body: JSON.stringify({ health_status: 'needs_reconnect', plain_english_error: `Your ${action.connector} connection needs reconnect. Click Reconnect.`, status: 'paused' }) }) } catch {}
        return { status: 'error', duration: Date.now() - start, output: null, error_code: 'AUTH_ERROR', credits_used: 0, log: message }
      }

      if (!isRate && !isServer && attempt >= maxAttempts) {
        // non-retriable generic failure
        try { await fetch(`${config.url}/rest/v1/automations?id=eq.${encodeURIComponent(agent.id)}`, { method: 'PATCH', headers, body: JSON.stringify({ health_status: 'needs_attention', plain_english_error: message }) }) } catch {}
        return { status: 'error', duration: Date.now() - start, output: null, error_code: 'CONNECTOR_ERROR', credits_used: 0, log: message }
      }

      if (attempt >= maxAttempts) {
        try { await fetch(`${config.url}/rest/v1/automations?id=eq.${encodeURIComponent(agent.id)}`, { method: 'PATCH', headers, body: JSON.stringify({ health_status: 'needs_attention', plain_english_error: message }) }) } catch {}
        return { status: 'error', duration: Date.now() - start, output: null, error_code: 'RETRY_EXHAUSTED', credits_used: 0, log: message }
      }

      // retryable: wait and retry
      const wait = backoffs[Math.min(attempt - 1, backoffs.length - 1)] || 5000
      // eslint-disable-next-line no-await-in-loop
      await new Promise(r => setTimeout(r, wait))
      // continue loop
    }
  }
}

async function getAutomationProgressPayload(agent) {
  const campaignPosts = Array.isArray(agent.campaign?.posts) ? agent.campaign.posts : []
  const generatedPosts = campaignPosts.map(post => ({
    id: post.id,
    content: post.captions?.[post.platforms?.[0]] || '',
    image_url: post.imageUrl || post.image_url || null,
    scheduled_for: post.scheduledAt || null,
    status: post.status || 'preparing',
  }))
  const total = Math.max(1, campaignPosts.length)
  const readyCount = campaignPosts.filter(post => {
    const primary = post.platforms?.[0]
    return Boolean(primary && String(post.captions?.[primary] || '').trim())
  }).length
  const progress = typeof agent.backgroundProgress === 'number'
    ? agent.backgroundProgress
    : (readyCount ? Math.round((readyCount / total) * 100) : 0)
  return {
    ok: true,
    progress: Math.max(0, Math.min(100, progress)),
    status: agent.backgroundGeneration?.status || agent.status || 'active',
    posts: generatedPosts,
    campaignPosts,
    error: agent.backgroundGeneration?.error || null,
  }
}

async function linkedInConnectedAppStatus(user, config) {
  const integration = await getUserIntegration(user.id, 'linkedin', config).catch(() => null)
  const tokens = integration?.tokens || {}
  const scopes = normalizeLinkedInScopes(integration?.scopes)
  const expiresAt = Number(tokens.expiry || tokens.expires_at || tokens.expiry_date || 0)
  const expired = expiresAt > 0 && expiresAt <= Date.now()
  const stored = hasUsableLinkedInStorage(tokens)
  const ready = stored && !expired && scopes.includes('w_member_social')
  return {
    provider: 'linkedin',
    name: 'LinkedIn',
    connected: ready,
    ready,
    connectionId: integration?.id || null,
    status: ready ? 'connected' : stored && expired ? 'expired' : stored ? 'reconnect_required' : 'disconnected',
    stage: 'live',
    enabled: true,
    category: 'Social Media',
    connectedAt: integration?.created_at || null,
    lastSyncedAt: integration?.updated_at || null,
    error: ready ? null : stored && expired ? 'LinkedIn access expired. Reconnect LinkedIn.' : stored ? 'LinkedIn is missing Share on LinkedIn permission. Reconnect LinkedIn.' : null,
    isNative: true,
    authMode: 'native',
    connectionCount: ready ? 1 : 0,
    actions: ['post'],
  }
}

const imageRequiredSocialPlatforms = new Set(['linkedin', 'facebook', 'instagram', 'x', 'twitter'])
function campaignPostRequiresImage(agent, platforms = []) {
  return agent.campaign?.meta?.includeImages === true || platforms.some(platform => imageRequiredSocialPlatforms.has(String(platform).toLowerCase()))
}

async function prepareCampaignPostContent(agent, post, user, index) {
  const platforms = Array.isArray(post?.platforms) && post.platforms.length ? post.platforms : ['linkedin']
  const topic = String(post?.topic || agent.campaign?.brand?.business || agent.name || 'your business growth')
  const goal = String(agent.campaign?.description || agent.description || 'Grow reach and trust')
  const audience = String(agent.campaign?.brand?.audience || 'ideal audience')
  const tone = String(agent.campaign?.brand?.tone || 'confident and professional')
  const captions = { ...(post?.captions || {}) }

  for (const platform of platforms) {
    if (String(captions[platform] || '').trim()) continue
    const generated = await callLLMForRole(
      'content',
      'Write one original, ready-to-publish social post. Return only the post text. Do not use placeholders or claim an action was completed.',
      `Post ${index + 1}. Platform: ${platform}. Topic: ${topic}. Goal: ${goal}. Audience: ${audience}. Tone: ${tone}.`,
      { jsonMode: false, maxTokens: 500, fallbackOrder: ['groq', 'qwen', 'kimi', 'minimax', 'flatkey', 'openai'] },
    )
    const content = String(generated.result || '').trim()
    if (content.length < 20) throw new Error(`The content provider returned an incomplete ${platform} post.`)
    captions[platform] = content
  }

  let imageUrl = post.imageUrl || post.image_url || ''
  let imageStoragePath = post.imageStoragePath || post.image_storage_path || ''
  const needsImage = campaignPostRequiresImage(agent, platforms)
  if (needsImage && !imageUrl) {
    const image = await mediaLibrary.findSmartImage(supabaseConfig(), user, `${topic}. ${captions[platforms[0]] || ''}`, goal, platforms[0], { forceUnique: true, uniqueNonce: `${post.id || index}-${Date.now()}-${Math.random()}` })
    imageUrl = image.image_url
    imageStoragePath = image.image_storage_path || ''
    if (!imageUrl) throw new Error(`A verified image is required before publishing to ${platforms.join(', ')}.`)
  }

  return {
    ...post,
    captions,
    imageUrl,
    image_url: imageUrl,
    imageStoragePath,
    image_storage_path: imageStoragePath,
    status: post.status === 'draft' || post.status === 'pending_approval' ? 'scheduled' : (post.status || 'scheduled'),
  }
}

async function runAutomationBackgroundGeneration(agentId, userId) {
  const startedAt = new Date().toISOString()
  try {
    let agent = await getServerAgent(agentId, userId)
    if (!agent) return
    if (agent.backgroundGeneration?.status === 'generating') return
    const posts = Array.isArray(agent.campaign?.posts) ? agent.campaign.posts.map(post => ({ ...post })) : []
    if (!posts.length) throw new Error('This automation has no posts to generate.')
    const total = Math.max(1, posts.length)
    const previousStatus = agent.status || 'pending_approval'
    agent = {
      ...agent,
      status: 'preparing',
      backgroundProgress: 0,
      backgroundGeneration: { status: 'generating', startedAt, error: null },
      trigger: { ...agent.trigger, nextRun: null },
      campaign: { ...agent.campaign, posts },
      updated_at: startedAt,
    }
    await saveServerAgent(agent)

    let generationFailures = 0
    for (let index = 0; index < total; index += 1) {
      const post = agent.campaign.posts[index]
      let prepared = null
      let lastError = null
      for (let attempt = 0; attempt < 3 && !prepared; attempt += 1) {
        if (attempt) await new Promise(resolve => setTimeout(resolve, attempt * 2_000))
        try { prepared = await prepareCampaignPostContent(agent, post, { id: userId, email: agent.userEmail || '' }, index) }
        catch (error) { lastError = error }
      }
      if (prepared) agent.campaign.posts[index] = prepared
      else {
        generationFailures += 1
        agent.campaign.posts[index] = { ...post, status: 'scheduled', lastError: lastError instanceof Error ? lastError.message : 'Content generation needs attention.' }
      }
      const progress = Math.max(0, Math.min(100, Math.round(((index + 1) / total) * 100)))
      agent = { ...agent, backgroundProgress: progress, updated_at: new Date().toISOString() }
      await saveServerAgent(agent)
    }

    const nextRun = agent.campaign?.approved === true ? campaignNextRun(agent.campaign) : null
    await saveServerAgent({
      ...agent,
      status: generationFailures ? 'warning' : previousStatus,
      backgroundProgress: 100,
      backgroundGeneration: { status: generationFailures ? 'completed_with_errors' : 'completed', startedAt, completedAt: new Date().toISOString(), error: generationFailures ? `${generationFailures} post(s) need regeneration.` : null },
      trigger: { ...agent.trigger, type: 'campaign', nextRun },
      nextRunAt: nextRun || null,
      updated_at: new Date().toISOString(),
    })
  } catch (error) {
    const latest = await getServerAgent(agentId, userId).catch(() => null)
    if (latest) {
      const message = error instanceof Error ? error.message : 'Background generation failed.'
      await saveServerAgent({
        ...latest,
        status: 'warning',
        backgroundGeneration: { ...(latest.backgroundGeneration || {}), status: 'failed', error: message, failedAt: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      }).catch(() => {})
    }
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
  const agent = await getServerAgent(agentId, user.id)
  if (!agent) return json(res, 404, { error: 'Campaign agent not found' })
  if (agent.userId && agent.userId !== user.id) return json(res, 403, { error: 'Not authorized' })
  if (!agent.campaign) return json(res, 400, { error: 'Not a campaign agent' })

  const postingOption = ['now', 'later', 'recurring'].includes(String(body.postingOption)) ? String(body.postingOption) : 'later'
  const timezone = String(body.timezone || agent.campaign.meta?.timezone || user.timezone || 'UTC')
  let startAt
  try {
    startAt = postingOption === 'now'
      ? new Date(Date.now() + 250)
      : (body.localDate && body.localTime ? localScheduleToUtc(body.localDate, body.localTime, timezone) : new Date(body.startAt))
  } catch (error) { return json(res, 400, { error: error instanceof Error ? error.message : 'Invalid schedule' }) }
  if (!startAt || isNaN(startAt.getTime())) return json(res, 400, { error: 'Date, exact time, and timezone are required' })
  if (postingOption !== 'now' && startAt.getTime() <= Date.now()) return json(res, 400, { error: 'That time has already passed. Choose another time or use Publish Now.' })

  const posts = Array.isArray(agent.campaign.posts) ? agent.campaign.posts.map(post => ({ ...post })) : []
  const immediateActivation = prepareCampaignPostsForActivation({ posts, postingOption, startAt })
  if (immediateActivation.immediatePostCount > 0 && agent.campaign.meta) {
    agent.campaign.meta.startDate = startAt.toISOString()
  }
  if (posts.length && immediateActivation.immediatePostCount === 0) {
    const firstScheduled = new Date(posts[0].scheduledAt)
    if (!isNaN(firstScheduled.getTime())) {
      const offsetMs = startAt.getTime() - firstScheduled.getTime()
      if (offsetMs !== 0) {
        agent.campaign.posts = posts.map(p => ({ ...p, scheduledAt: new Date(new Date(p.scheduledAt).getTime() + offsetMs).toISOString() }))
        if (agent.campaign.meta) agent.campaign.meta.startDate = startAt.toISOString()
      }
    }
  }
  if (immediateActivation.posts.length) {
    agent.campaign.posts = immediateActivation.posts.map(post => ({ ...post }))
  }
  if (agent.campaign.meta) {
    agent.campaign.meta.timezone = timezone
    agent.campaign.meta.postingOption = postingOption
    agent.campaign.meta.localDate = body.localDate || null
    agent.campaign.meta.localTime = body.localTime || null
  }
  agent.campaign.posts = (agent.campaign.posts || []).map(post => {
    const baseCredits = computeCampaignPostCredits(post.platforms || [], agent.campaign.meta?.includeImages === true)
    return {
      ...post,
      baseCredits,
      credits: scheduledCreditCost(baseCredits, post.scheduledAt),
    }
  })
  agent.campaign.totalCredits = computeCampaignTotalCredits(agent.campaign.posts)

  const admin = isAdminAuthUser(user)
  const billingSummary = await billing.getUserBilling(user, config)
  if (!admin) {
    const activeStatuses = new Set(['active', 'running', 'preparing', 'warning', 'needs_attention'])
    const activeAutomations = (await listServerAgentsForUser(user.id)).filter(item => item.id !== agent.id && activeStatuses.has(item.status)).length
    if (activeAutomations >= billingSummary.maxActiveAutomations) {
      const message = billingSummary.plan === 'free'
        ? 'Upgrade to Starter $15 for 2 active automations.'
        : `${billingSummary.planName} supports ${billingSummary.maxActiveAutomations} active automations. Pause one or upgrade to continue.`
      return json(res, 409, { error: message, code: 'ACTIVE_AUTOMATION_LIMIT', limit: billingSummary.maxActiveAutomations })
    }
  }
  if (!admin && Number(billingSummary.credits || 0) < total) {
    return json(res, 402, { error: `You need ${total} credit${total === 1 ? '' : 's'} to activate this automation. Add credits to continue.`, code: 'INSUFFICIENT_CREDITS', required: total, available: Number(billingSummary.credits || 0) })
  }
  if (!admin && billingSummary.plan === 'free') {
    agent.campaign.posts = (agent.campaign.posts || []).slice(0, 7)
    if (agent.campaign.meta) {
      agent.campaign.meta.totalPosts = agent.campaign.posts.length
      agent.campaign.meta.durationDays = Math.min(7, Number(agent.campaign.meta.durationDays) || 7)
    }
    agent.campaign.totalCredits = computeCampaignTotalCredits(agent.campaign.posts)
    const policy = validateFreeCampaign(agent.campaign.posts || [], agent.campaign.contentMemory || [], new Date())
    if (!policy.ok) return json(res, 400, { error: policy.error, code: policy.code })
  }
  const total = agent.campaign.totalCredits || 0

  const platforms = Array.from(new Set((agent.campaign.posts || []).flatMap(post => post.platforms || [])))
  const supportedPublishing = new Set(['linkedin', 'facebook', 'instagram', 'x', 'twitter', 'youtube', 'whatsapp'])
  if (!platforms.length || platforms.some(platform => !supportedPublishing.has(platform))) return json(res, 400, { error: 'This automation contains an unsupported publishing platform.' })
  for (const platform of platforms) {
    if (!requireConnectorFeature(req, res, user, platform)) return
    if (composioPublishingPlatforms.has(platform)) {
      const connection = await alphaConnector.getConnectionStatus(user, platform)
      if (!connection.connected) return json(res, 409, { error: `Connect ${platform} before approval.`, code: 'RECONNECT_NEEDED' })
    } else {
      await getPostingCredentials(user, platform, { _skipFreeLimit: true })
    }
  }

  const autoPublish = body.autoPublish === true || body.autoPublish === 'true'
  agent.campaign.approved = true
  agent.campaign.charged = false
  agent.campaign.autoPublish = autoPublish
  agent.campaign.status = 'running'
  agent.approved = true
  agent.status = 'running'
  const preparedPosts = []
  for (let index = 0; index < (agent.campaign.posts || []).length; index += 1) {
    const post = agent.campaign.posts[index]
    const platforms = Array.isArray(post?.platforms) && post.platforms.length ? post.platforms : ['linkedin']
    const hasAllCaptions = platforms.every(platform => String(post?.captions?.[platform] || '').trim().length > 0)
    const needsImage = campaignPostRequiresImage(agent, platforms)
    const hasRequiredImage = !needsImage || Boolean(post?.imageUrl || post?.image_url)
    const base = { ...post, approved: true, charged: post.charged === true, timezone, postingOption, scheduledLocalDate: body.localDate || null, scheduledLocalTime: body.localTime || null, status: post.status === 'pending_approval' || post.status === 'draft' ? 'scheduled' : post.status }
    if (hasAllCaptions && hasRequiredImage) {
      preparedPosts.push(base)
      continue
    }
    if (postingOption === 'now') {
      try {
        preparedPosts.push(await prepareCampaignPostContent(agent, base, user, index))
      } catch (error) {
        return json(res, 503, { error: error instanceof Error ? error.message : 'Content preparation failed.', code: 'CONTENT_PREPARATION_FAILED' })
      }
    } else preparedPosts.push(base)
  }
  agent.campaign.posts = preparedPosts
  agent.trigger = { type: 'campaign', nextRun: campaignNextRun(agent.campaign), cron: agent.campaign.meta?.frequencyText || 'campaign' }
  await saveServerAgent(agent)
  if (postingOption === 'now') {
    const execution = await runAgent(agent, 'manual')
    const published = await getServerAgent(agent.id)
    return json(res, execution.status === 'success' ? 200 : execution.status === 'partial' ? 207 : 502, { agent: published || agent, execution, charged: execution.credits_used || 0, estimatedCredits: total, autoPublish, nextRun: published?.trigger?.nextRun || null })
  }
  const needsBackgroundGeneration = agent.campaign.posts.some(post => {
    const platforms = Array.isArray(post.platforms) && post.platforms.length ? post.platforms : ['linkedin']
    const missingCaption = platforms.some(platform => !String(post.captions?.[platform] || '').trim())
    const missingImage = campaignPostRequiresImage(agent, platforms) && !String(post.imageUrl || post.image_url || '').trim()
    return missingCaption || missingImage
  })
  if (needsBackgroundGeneration) setImmediate(() => { void runAutomationBackgroundGeneration(agent.id, user.id) })
  return json(res, 200, { agent, charged: 0, estimatedCredits: total, autoPublish, nextRun: agent.trigger.nextRun })
}

async function reviewCampaignPostHandler(req, res) {
  const match = String(req.url || '').match(/^\/api\/agents\/campaign\/([^/]+)\/review\/?$/)
  const agentId = match ? decodeURIComponent(match[1]) : ''
  const config = supabaseConfig()
  const user = await currentOrLocalUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const agent = await getServerAgent(agentId, user.id)
  if (!agent?.campaign) return json(res, 404, { error: 'Campaign not found' })
  if (agent.userId && agent.userId !== user.id) return json(res, 403, { error: 'Not authorized' })
  const body = await readBody(req)
  const post = agent.campaign.posts?.find(item => item.id === body.postId)
  if (!post) return json(res, 404, { error: 'Post not found' })
  const platform = String(body.platform || 'linkedin')
  if (!['linkedin', 'facebook', 'instagram', 'x', 'twitter', 'youtube', 'whatsapp'].includes(platform) || !post.platforms?.includes(platform)) return json(res, 400, { error: 'This platform is not part of the post being reviewed.' })
  const action = String(body.action || '')
  const current = String(post.captions?.[platform] || '')
  let text = String(body.text || '').trim()
  if (action === 'edit') {
    if (!text) return json(res, 400, { error: 'Edited post text is required' })
  } else if (action === 'remove_hashtags') {
    text = current.replace(/(^|\s)#[\p{L}\p{N}_-]+/gu, '').replace(/[ \t]+\n/g, '\n').replace(/ {2,}/g, ' ').trim()
  } else {
    const instructions = {
      regenerate: 'Rewrite it from a fresh angle while preserving the truthful core message.',
      improve_hook: `Replace the opening with a stronger, natural ${platform} hook. Keep the rest coherent.`,
      shorten: 'Make it substantially shorter without losing the main point or call to action.',
      expand: 'Expand it with useful detail, readable spacing, and no invented facts or experiences.',
      change_tone: `Rewrite it in this tone: ${String(body.tone || 'professional and natural')}.`,
      add_hashtags: 'Add 3 to 5 relevant, restrained hashtags at the end.',
    }
    const instruction = instructions[action]
    if (!instruction) return json(res, 400, { error: 'Unsupported review action' })
    const system = `You are Alpha, a professional ${platform} editor. ${instruction}
Return JSON with exactly {"text":"..."}. Preserve factual accuracy. Do not invent statistics, testimonials, or personal experiences. Produce one text post only.`
    const generated = await callLLMForRole('content', system, `Current post:\n${current}`, { jsonMode: true, maxTokens: 1400 })
    text = String(generated.result?.text || '').trim()
    if (!text) return json(res, 502, { error: 'The active AI provider returned invalid post content' })
  }
  post.captions = { ...post.captions, [platform]: text }
  post.approved = false
  post.status = 'pending_approval'
  post.edited = true
  post.reviewedAt = new Date().toISOString()
  agent.approved = false
  agent.campaign.approved = false
  agent.campaign.status = 'pending_approval'
  await saveServerAgent(agent)
  return json(res, 200, { agent, post, text })
}

async function cancelCampaignHandler(req, res) {
  const match = String(req.url || '').match(/^\/api\/agents\/campaign\/([^/]+)\/cancel\/?$/)
  const agentId = match ? decodeURIComponent(match[1]) : ''
  const config = supabaseConfig()
  const user = await currentOrLocalUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const agent = await getServerAgent(agentId, user.id)
  if (!agent?.campaign) return json(res, 404, { error: 'Campaign not found' })
  if (agent.userId && agent.userId !== user.id) return json(res, 403, { error: 'Not authorized' })
  if ((agent.campaign.posts || []).some(post => post.status === 'publishing')) return json(res, 409, { error: 'This post is already publishing and cannot be cancelled.' })
  agent.status = 'paused'
  agent.approved = false
  agent.campaign.status = 'cancelled'
  agent.campaign.approved = false
  agent.campaign.posts = (agent.campaign.posts || []).map(post => post.status === 'scheduled' || post.status === 'pending_approval' ? { ...post, status: 'cancelled', approved: false } : post)
  agent.trigger = { ...agent.trigger, nextRun: null }
  agent.nextRunAt = null
  await saveServerAgent(agent)
  return json(res, 200, { agent })
}

async function campaignReportHandler(req, res) {
  const match = String(req.url || '').match(/^\/api\/agents\/campaign\/([^/]+)\/report\/?$/)
  const agentId = match ? decodeURIComponent(match[1]) : ''
  if (!agentId) return json(res, 400, { error: 'Campaign agent ID required' })
  const config = supabaseConfig()
  const user = await currentOrLocalUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const agent = await getServerAgent(agentId, user.id)
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
  if (schedulerState.isRunning) {
    return json(res, 200, { ok: true, executed: 0, skipped: true, reason: 'Scheduler already running' })
  }
  schedulerState.isRunning = true
  try {
    const now = new Date()
    const config = supabaseConfig()
    const user = await currentOrLocalUser(req, config.url, config.anon).catch(() => null)
    const globalAgents = await listServerAgents()
    const userAgents = user ? await listServerAgentsForUser(user.id).catch(() => []) : []
    const mergedAgents = new Map(globalAgents.map(agent => [agent.id, agent]))
    for (const agent of userAgents) {
      const existing = mergedAgents.get(agent.id)
      const existingUpdated = new Date(existing?.updated_at || existing?.updatedAt || 0).getTime()
      const userUpdated = new Date(agent.updated_at || agent.updatedAt || 0).getTime()
      if (!existing || userUpdated >= existingUpdated) mergedAgents.set(agent.id, agent)
    }
    const agents = [...mergedAgents.values()].filter(a => ['running', 'active', 'warning', 'needs_attention'].includes(a.status) && (a.trigger?.type === 'schedule' || a.trigger?.type === 'monitor' || a.trigger?.type === 'campaign') && a.trigger?.nextRun && new Date(a.trigger.nextRun) <= now)
    const results = []
    for (const agent of agents) {
      try {
        const execution = await runAgentWithQueue(agent, 'schedule')
        results.push({ agentId: agent.id, status: execution.status })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Scheduled execution failed'
        process.stdout.write(`[cron] agent ${agent.id} run error: ${message}\n`)
        results.push({ agentId: agent.id, status: 'error', error: message })
      }
    }
    return json(res, 200, { ok: true, executed: results.length, results })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Scheduler check failed'
    process.stdout.write(`[cron] scheduler check error: ${message}\n`)
    return json(res, 200, { ok: false, executed: 0, results: [], error: message })
  } finally {
    schedulerState.isRunning = false
  }
}

function backoffMs(retryCount) {
  if (retryCount <= 1) return 60_000
  if (retryCount === 2) return 300_000
  return 900_000
}

async function persistAutomationContentMemory(userId, record) {
  const config = supabaseConfig()
  if (!userId || !config.url || !config.service) return
  const body = {
    id: record.id, automation_id: record.automationId, user_id: userId, platform: record.platform,
    content: record.content, content_fingerprint: record.contentFingerprint, semantic_topic: record.semanticTopic || null,
    hook: record.hook || null, cta: record.cta || null, hashtags: record.hashtags || [],
    image_concept: record.imageConcept || null, image_asset_id: record.imageAssetId || null,
    scheduled_at: record.scheduledAt || null, published_at: record.publishedAt || null,
    provider_post_id: record.providerPostId || null, status: record.status, credits_used: record.creditsUsed || 0,
    user_edits: record.userEdits || [], created_at: record.createdAt,
  }
  try {
    await fetch(`${config.url}/rest/v1/automation_content_memory`, { method: 'POST', headers: { ...serviceHeaders(config.service), Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(body) })
  } catch { /* The agent record remains the compatible source until this migration is applied. */ }
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
  return isAdminAuthUser(user)
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
    case 'googledocs': {
      if (action.action === 'create_document' && !String(p.title || '').trim()) return { field: 'title', reason: 'Document title is required.' }
      if (action.action === 'update_document' && !String(p.documentId || p.document_id || '').trim()) return { field: 'documentId', reason: 'Document ID is required.' }
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
        baseCredits: computeCampaignPostCredits(meta.platforms, meta.includeImages),
        credits: scheduledCreditCost(computeCampaignPostCredits(meta.platforms, meta.includeImages), date),
      })
    }
  }
  return posts
}

function computeCampaignPostCredits(platforms, includeImages) {
  void platforms
  void includeImages
  // One approved content item is one unit of value, even when Alpha publishes
  // its adapted variants to several connected social platforms.
  return 1
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
        posts = res.calendar.map(p => {
          const baseCredits = computeCampaignPostCredits(p.platforms || meta.platforms, meta.includeImages)
          return { ...p, id: p.id || randomUUID(), baseCredits, credits: scheduledCreditCost(baseCredits, p.scheduledAt), status: p.status || 'pending_approval', result: {} }
        })
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

// LinkedIn is the only native publishing connector. Every other released
// publishing platform is executed through the user's Composio connection.
const composioPublishingPlatforms = new Set(['youtube', 'instagram', 'x', 'twitter', 'facebook', 'whatsapp'])
const composioAutomationConnectors = new Set(['gmail', 'github', 'googledocs', 'googlesheets', 'discord', ...composioPublishingPlatforms])

async function runCampaignAgent(existing, trigger, executionId, user, admin) {
  const blockedPlatform = [...new Set([...(existing.campaign?.meta?.platforms || []), ...(existing.campaign?.posts || []).flatMap(post => post.platforms || [])])]
    .find(platform => {
      const access = connectorFeatureAccess(user, platform, true)
      return !access.enabled && access.stopExisting
    })
  if (blockedPlatform) throw new Error(unavailableConnectorMessage(blockedPlatform))
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
  const claimed = await claimServerExecution(execution)
  if (!claimed) return { ...execution, status: 'skipped', error_code: 'CONCURRENT', log: 'Execution lock already exists; duplicate publication prevented.' }

  // Complete a pending charge without republishing if the provider already confirmed the post.
  for (const post of (campaign.posts || []).filter(item => item.status === 'posted' && item.charged !== true)) {
    const publishedPlatform = (post.platforms || []).find(platform => post.result?.[platform]?.id) || post.platforms?.[0] || 'linkedin'
    const providerPostId = post.providerPostId || post.result?.[publishedPlatform]?.id
    if (!providerPostId) continue
    const cost = computeCampaignPostCredits(post.platforms || [], false)
    const charged = admin || await spendUserCredits(user, cost, { automationId: existing.id, reason: `Confirmed ${publishedPlatform} publication`, postId: post.id, providerPostId, idempotencyKey: `${existing.id}:${post.id}:${publishedPlatform}` })
    if (charged) {
      post.charged = true
      post.chargedAt = now.toISOString()
    }
  }
  await saveServerAgent({ ...existing, campaign })

  const publishablePosts = (campaign.posts || [])
    .filter(post => (post.status === 'scheduled' || post.status === 'pending_approval') && post.approved === true)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
  const duePosts = publishablePosts.filter(post => new Date(post.scheduledAt).getTime() <= now.getTime())
  // An authenticated manual run is an explicit instruction to publish now. If a
  // previous transient failure moved the retry into the future, run the earliest
  // approved unpublished post instead of falsely reporting that nothing is due.
  if (trigger === 'manual' && duePosts.length === 0 && publishablePosts.length > 0) duePosts.push(publishablePosts[0])

  let creditsUsed = 0
  let postedCount = 0
  let failedCount = 0
  let confirmedPlatformCount = 0
  let outOfCredits = false
  const steps = []

  for (const post of duePosts) {
    const postResults = { ...(post.result || {}) }
    let postSuccess = 0
    let postFailed = 0
    let postSkipped = 0
    let providerCreditsUsed = 0
    let nativeSuccessCount = 0

    if (post.approved !== true || campaign.approved !== true) {
      postResults[post.platforms?.[0] || 'facebook'] = { status: 'skipped', log: 'Explicit approval is required' }
      postSkipped++
      steps.push({ postId: post.id, status: 'skipped', error_code: 'APPROVAL_REQUIRED', credits_used: 0 })
      continue
    }

    const postCost = computeCampaignPostCredits(post.platforms || [], false)
    if (!admin) {
      const balance = await getUserCredits(user, config)
      if (balance < postCost) {
        postResults[post.platforms?.[0] || 'facebook'] = { status: 'waiting_credits', log: 'Out of credits - Buy $3 for 20 credits to keep your AI employee working.' }
        outOfCredits = true
        post.result = postResults
        post.status = 'scheduled'
        post.lastError = 'Out of credits - Buy $3 for 20 credits to keep your AI employee working.'
        steps.push({ postId: post.id, status: 'waiting_credits', error_code: 'INSUFFICIENT_CREDITS', credits_used: 0, result: postResults })
        break
      }
    }

    const publishingPlatforms = Array.isArray(post.platforms) ? post.platforms : []
    if (campaignPostRequiresImage(existing, publishingPlatforms) && !String(post.imageUrl || post.image_url || '').trim()) {
      try {
        const prepared = await prepareCampaignPostContent(existing, post, user, campaign.posts.indexOf(post))
        Object.assign(post, prepared)
        await saveServerAgent({ ...existing, campaign })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        post.status = 'scheduled'
        post.lastError = `Matched image preparation failed: ${message}`
        post.scheduledAt = new Date(now.getTime() + backoffMs(3)).toISOString()
        failedCount++
        steps.push({ postId: post.id, status: 'error', error_code: 'MATCHED_IMAGE_REQUIRED', credits_used: 0, error: message })
        await saveServerAgent({ ...existing, campaign })
        continue
      }
    }

    post.status = 'publishing'
    post.executionKey = `${existing.id}:${post.id}:${post.scheduledAt}`
    post.publishStartedAt = now.toISOString()
    await saveServerAgent({ ...existing, campaign })

    if (post.imageStoragePath) {
      try {
        post.imageUrl = await mediaLibrary.refreshMediaUrl(config, user, post.imageStoragePath, 3600)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        post.status = 'scheduled'
        post.lastError = `Image refresh failed: ${message}`
        post.scheduledAt = new Date(now.getTime() + backoffMs(3)).toISOString()
        failedCount++
        steps.push({ postId: post.id, status: 'error', error_code: 'IMAGE_REFRESH_FAILED', credits_used: 0 })
        continue
      }
    }

    for (const platform of (post.platforms || [])) {
      const confirmedPreviousResult = postResults[platform]
      if (confirmedPreviousResult?.status === 'success' && confirmedPreviousResult?.id) {
        postSuccess++
        continue
      }
      const usesComposio = composioPublishingPlatforms.has(platform)
      const action = { connector: platform, action: 'post', params: { text: post.captions?.[platform] || '', _skipFreeLimit: true } }
      const ready = usesComposio
        ? (await alphaConnector.getConnectionStatus(user, platform).catch(() => ({ connected: false }))).connected === true
        : await agentActionIsReady(user, action, config)
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
        let result
        if (usesComposio) {
          const execution = buildSocialPublishingAction(platform, post, caption, campaign)
          result = await executeProviderWithHealing(user, platform, execution.action, {
            ...execution.params,
            approvalId: `campaign:${existing.id}`,
            idempotencyKey: `${existing.id}:${post.id}:${platform}`,
          }, { deferCreditSettlement: true })
          providerCreditsUsed += Number(result.creditsCharged || 0)
          result = { id: result.providerId, providerId: result.providerId, replayed: result.replayed === true, retryCount: result.retryCount || 0 }
        } else {
          result = await postToSocial(platform, user, { text: caption, image_url: post.imageUrl || '', _skipFreeLimit: true })
          nativeSuccessCount += 1
        }
        if (!result.id && !result.message_id) throw new Error(`${platform} did not return a confirmed provider identifier`)
        postResults[platform] = { status: 'success', id: result.id || result.message_id, link: result.link || result.permalink || result.url || '', pageId: result.pageId || null, pageName: result.pageName || null, replayed: result.replayed === true, retryCount: result.retryCount || 0, log: `Posted to ${platform}${result.retryCount ? ` after ${result.retryCount} retry attempt${result.retryCount === 1 ? '' : 's'}` : ''}` }
        postSuccess++
        await addAgentLog({ agentId: existing.id, connectorType: platform, content: caption.slice(0, 500), status: 'success', response: JSON.stringify(result) })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        postResults[platform] = { status: 'error', log: `${platform} failed: ${message}` }
        postFailed++
        await addAgentLog({ agentId: existing.id, connectorType: platform, content: caption.slice(0, 500), status: 'failed', error: message })
      }
    }

    post.result = postResults
    confirmedPlatformCount += postSuccess
    post.providerPostIds = providerPostIds(postResults)
    if (postSuccess === post.platforms.length) {
      const publishedPlatform = post.platforms[0] || 'linkedin'
      post.status = 'posted'
      post.postedAt = now.toISOString()
      post.providerPostId = postResults[publishedPlatform]?.id || ''
      post.providerUrl = postResults[publishedPlatform]?.link || ''
      post.lastError = ''
      await saveServerAgent({ ...existing, campaign })
      const unifiedCost = admin ? 0 : postCost
      const charged = unifiedCost === 0 || await spendUserCredits(user, unifiedCost, { automationId: existing.id, reason: `Confirmed publication to ${post.platforms.join(', ')}`, postId: post.id, providerPostId: post.providerPostId, idempotencyKey: `${existing.id}:${post.id}:unified` })
      if (charged) {
        post.charged = true
        post.chargedAt = new Date().toISOString()
        creditsUsed += unifiedCost
        for (const platform of post.platforms.filter(item => composioPublishingPlatforms.has(item))) {
          await alphaConnector.finalizeDeferredExecution(user, `${existing.id}:${post.id}:${platform}`, `${existing.id}:${post.id}:unified`).catch(() => false)
        }
      } else {
        post.chargeStatus = 'pending'
      }
      postedCount++
      const publishedContent = post.captions?.[publishedPlatform] || post.captions?.linkedin || ''
      const memoryRecord = createContentMemoryRecord({ automationId: existing.id, platform: publishedPlatform, content: publishedContent, post, creditsUsed: post.charged ? postCost : 0 })
      campaign.contentMemory = [memoryRecord, ...(campaign.contentMemory || [])].slice(0, 500)
      await persistAutomationContentMemory(user?.id, memoryRecord)
    } else {
      post.retryCount = (post.retryCount || 0) + 1
      post.lastError = Object.values(postResults).map(result => result.log).filter(Boolean).join('; ')
      if (post.retryCount <= 3) {
        post.status = 'scheduled'
        post.scheduledAt = new Date(now.getTime() + backoffMs(post.retryCount)).toISOString()
      } else post.status = 'failed'
      failedCount++
    }
    void providerCreditsUsed
    void nativeSuccessCount
    const primaryPlatform = post.platforms?.[0] || 'linkedin'
    steps.push({ postId: post.id, day: post.day, slot: post.slot, platforms: post.platforms, content: post.captions?.[primaryPlatform] || '', pageId: primaryPlatform === 'facebook' ? postResults.facebook?.pageId || null : null, pageName: primaryPlatform === 'facebook' ? postResults.facebook?.pageName || null : null, scheduledAt: post.scheduledAt, scheduledTimezone: post.timezone || campaign.meta?.timezone || 'UTC', publishedAt: post.postedAt || null, providerPostId: postResults[primaryPlatform]?.id || null, linkedinAccount: postResults.linkedin?.account || user?.email || '', linkedinPostId: postResults.linkedin?.id || null, linkedinUrl: postResults.linkedin?.link || null, result: postResults, credits_used: post.charged ? postCost : 0, status: post.status, retry_count: post.retryCount || 0 })
    await saveServerAgent({ ...existing, campaign })
    try {
      if (user?.id) await alphaBrain.logMemory(user.id, { event_type: 'post', summary: `Day ${post.day} ${post.slot}: ${postSuccess > 0 ? 'posted' : 'failed'} to ${post.platforms.join(', ')}`, source_workflow_id: existing.id, metadata: { topic: post.topic, platforms: post.platforms, results: postResults, status: post.status } })
    } catch {}
  }

  campaign.completedCount = (campaign.completedCount || 0) + postedCount
  campaign.failedCount = (campaign.failedCount || 0) + failedCount
  campaign.lastRun = now.toISOString()

  const remaining = (campaign.posts || []).filter(p => p.status === 'scheduled' || p.status === 'pending_approval')
  const nextRun = campaignNextRun(campaign)
  let status = outOfCredits ? 'needs_attention' : 'running'
  const providerFailures = steps.flatMap(step => Object.entries(step.result || {})
    .filter(([, result]) => result?.status === 'error' || result?.status === 'skipped')
    .map(([platform, result]) => `${platform}: ${result?.log || 'publication was not confirmed'}`))
  const preparationFailures = steps
    .filter(step => step?.status === 'error' && step?.error)
    .map(step => `${step.error_code || 'PREPARATION_FAILED'}: ${step.error}`)
  const failureDetails = [...providerFailures, ...preparationFailures]
  let log = failureDetails.length
    ? `Publication failed. ${failureDetails.join(' | ')} No credits were charged for unconfirmed platforms.`
    : `Campaign execution: ${postedCount} post(s) processed. ${failedCount} had issues.`
  let output = { postedCount, failedCount, confirmedPlatformCount, creditsUsed, steps }

  if (outOfCredits) {
    log = 'Out of credits - Buy $3 for 20 credits to keep your AI employee working.'
    output = { ...output, needsAttention: true, reason: 'insufficient_credits' }
  }

  if (remaining.length === 0) {
    const terminalProblems = campaign.posts.filter(p => p.status === 'failed' || p.status === 'partial')
    const confirmedPosts = campaign.posts.filter(p => p.status === 'posted')
    if (terminalProblems.length > 0 || confirmedPosts.length !== campaign.posts.length) {
      status = 'needs_attention'
      campaign.status = 'needs_attention'
      log = `Campaign needs attention: ${confirmedPosts.length}/${campaign.posts.length} posts were confirmed by providers. ${terminalProblems.length} post(s) could not be completed.`
      output = {
        ...output,
        needsAttention: true,
        reason: 'unconfirmed_or_failed_posts',
        confirmedPosts: confirmedPosts.length,
        terminalProblems: terminalProblems.length,
      }
    } else {
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
      steps,
      finishedAt: now.toISOString(),
    }
    campaign.missionReport = missionReport
    log = `Mission complete: ${missionReport.completed}/${missionReport.totalPosts} posts published. ${missionReport.creditsUsed} credits used.`
    output = missionReport
    }
  }

  const executionStatus = outOfCredits ? 'waiting_credits' : (confirmedPlatformCount > 0 && failedCount > 0 ? 'partial' : failedCount > 0 || postedCount === 0 ? 'error' : 'success')
  const executionError = outOfCredits ? 'INSUFFICIENT_CREDITS' : executionStatus === 'partial' ? 'PARTIAL_PUBLISH' : failedCount > 0 ? 'PUBLISH_FAILED' : postedCount === 0 ? 'NO_DUE_POSTS' : null
  if (!outOfCredits && postedCount === 0 && failedCount === 0) {
    log = 'Campaign execution failed: the scheduler marked this campaign due, but no approved scheduled post was eligible for publication.'
  } else if (!outOfCredits && executionStatus === 'partial') {
    const confirmed = steps.flatMap(step => Object.entries(step.result || {})
      .filter(([, result]) => result?.status === 'success' && result?.id)
      .map(([platform, result]) => `${platform}: ${result.id}`))
    status = 'warning'
    campaign.status = 'running'
    campaign.statusReason = `Some platforms published successfully. Alpha will retry only the missing platforms${nextRun ? ` at ${nextRun}` : ''}.`
    log = `Partial success. Confirmed ${confirmed.join(' | ') || `${confirmedPlatformCount} platform post(s)`}. ${failureDetails.join(' | ')} Alpha will retry only the missing platforms${nextRun ? ` at ${nextRun}` : ''}; confirmed posts will not be duplicated. No credits were charged yet.`
  } else if (!outOfCredits && executionStatus === 'error' && postedCount === 0) {
    const retryable = remaining.filter(post => post.status === 'scheduled')
    if (retryable.length > 0 && nextRun) {
      status = 'warning'
      campaign.status = 'running'
      campaign.statusReason = `Publication was not confirmed. Alpha will retry automatically at ${nextRun}.`
      log = `No post was confirmed. ${failureDetails.join(' | ') || `${failedCount} issue(s) were recorded.`} Alpha will retry automatically at ${nextRun}. No credits were charged.`
    } else {
      status = 'needs_attention'
      campaign.status = 'needs_attention'
      campaign.statusReason = 'Publishing could not be confirmed after the retry limit. Review the exact provider error before resuming.'
      log = `No post was confirmed after the retry limit. ${failureDetails.join(' | ') || `${failedCount} issue(s) were recorded.`} No credits were charged.`
    }
  }
  const completedExecution = { ...execution, status: executionStatus, duration: Date.now() - startTime, output, steps, error_code: executionError, credits_used: creditsUsed, log }
  const executionHistory = [completedExecution, ...(existing.executionHistory || [])].slice(0, 100)
  const successfulRuns = executionHistory.filter(item => item.status === 'success').length
  const failedRuns = executionHistory.filter(item => item.status === 'error').length
  const record = {
    ...existing,
    status,
    campaign,
    executionHistory,
    executionsDone: executionHistory.length,
    confirmedPosts: (campaign.posts || []).filter(post => post.status === 'posted').length,
    executionsTotal: (campaign.posts || []).length,
    successfulRuns,
    failedRuns,
    successRate: executionHistory.length ? Math.round((successfulRuns / executionHistory.length) * 100) : 0,
    lastRun: now.toISOString(),
    lastRunAt: now.toISOString(),
    nextRunAt: nextRun || null,
    updated_at: now.toISOString(),
  }
  if (nextRun) record.trigger = { ...existing.trigger, nextRun, type: 'campaign' }
  else record.trigger = { ...existing.trigger, type: 'campaign' }
  await saveServerAgent(record)

  execution = completedExecution
  await saveServerExecution(execution)
  return execution
}

const agentExecutionQueue = new Map()

async function runAgentWithQueue(agent, trigger = 'schedule', authenticatedOwner = null) {
  const agentKey = `${agent?.id || 'unknown'}:${trigger}`
  if (agentExecutionQueue.has(agentKey)) {
    const triggerType = trigger === 'manual' ? 'manual' : (agent?.trigger?.type || 'schedule')
    return {
      id: `queued_${randomUUID()}`,
      agentId: agent?.id || 'unknown',
      at: new Date().toISOString(),
      status: 'skipped',
      duration: 0,
      output: null,
      error_code: 'CONCURRENT',
      credits_used: 0,
      log: 'Automation is already running. This run was skipped so the queue stays stable.',
      trigger: triggerType,
    }
  }
  const runPromise = (async () => {
    try {
      return await runAgent(agent, trigger, authenticatedOwner)
    } finally {
      agentExecutionQueue.delete(agentKey)
    }
  })()
  agentExecutionQueue.set(agentKey, runPromise)
  return runPromise
}

async function runAgent(agent, trigger = 'schedule', authenticatedOwner = null) {
  const startTime = Date.now()
  const now = new Date()
  let existing = agent
  let executionRecord = null
  let user = null
  let userId = ''
  let userEmail = ''
  let timezone = 'UTC'
  let triggerType = trigger === 'manual' ? 'manual' : (agent.trigger?.type || 'schedule')
  let executionId = generateExecutionId(agent, trigger, now)
  let admin = false
  try {
    existing = await getServerAgent(agent.id) || agent
    user = existing.userId ? await resolveExecutionUser(existing.userId, existing.userEmail || '', authenticatedOwner) : null
    userId = user?.id || existing.userId || ''
    userEmail = user?.email || existing.userEmail || ''
    timezone = user?.timezone || existing.userTimezone || 'UTC'
    triggerType = trigger === 'manual' ? 'manual' : (existing.trigger?.type || 'schedule')
    executionId = generateExecutionId(existing, trigger, now)
    admin = isAdminUser(user)

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
    if (diff < -5 * 60 * 1000) {
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
  const chargeRootId = existing.retryRootExecutionId || executionId

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
  executionRecord = { id: executionId, agentId: existing.id, at: now.toISOString(), status: 'in_progress', duration: 0, output: null, error_code: null, credits_used: 0, log: 'Execution in progress', trigger: triggerType, steps: [] }
  const claimed = await claimServerExecution(executionRecord)
  if (!claimed) return { ...executionRecord, status: 'skipped', error_code: 'CONCURRENT', log: 'Execution lock already exists; duplicate execution prevented.' }

  let monitorResult = null
  if (existing.trigger?.type === 'monitor' && existing.trigger?.url) {
    try {
      const response = await fetch(existing.trigger.url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(15000) })
      monitorResult = response.ok ? { ok: true, status: response.status } : { ok: false, status: response.status }
    } catch (error) { monitorResult = { ok: false, error: error instanceof Error ? error.message : 'Monitor fetch failed' } }
  }

  const config = supabaseConfig()
  const generatedActions = []
  // Check for pre-generated posts from the wizard
  const wizardPosts = existing.wizardPosts
  const executionIndex = existing.executionsDone || 0
  const wizardPostKey = wizardPosts ? `day_${Math.min(executionIndex + 1, Object.keys(wizardPosts).length)}` : null
  const wizardPost = wizardPostKey ? wizardPosts[wizardPostKey] : null

  for (const action of existing.actions || []) {
    const ready = await agentActionIsReady(user, action, config)
    if (!ready) {
      generatedActions.push({ ...action, _skipReason: 'connector not configured' })
      continue
    }

    // If we have pre-generated posts from the wizard, use them directly
    if (wizardPost && ['x', 'linkedin', 'facebook', 'telegram', 'slack', 'discord', 'whatsapp'].includes(action.connector)) {
      const params = { ...action.params, text: wizardPost.content, imageUrl: wizardPost.imageUrl }
      generatedActions.push({ ...action, params })
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
  for (const [actionIndex, action] of generatedActions.entries()) {
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
    if (stepResult.status === 'success' && userId && !admin) {
      const charge = await spendUserCredits({ id: userId, email: userEmail }, used, {
        automationId: existing.id,
        reason: `${action.connector}/${action.action}`,
        step: stepLabel,
        idempotencyKey: `${chargeRootId}:${actionIndex}`,
      })
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

  executionRecord = { ...executionRecord, status: finalStatus, duration: Date.now() - startTime, output, error_code: errorCode, credits_used: totalCreditsUsed, log, steps: results }
  await saveServerExecution(executionRecord)

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
    executionRecord.log += ` Reached end date (${existing.endDate}) and stopped.`
    nextRun = undefined
  }

  if (existing.executionsTotal && executionsDone >= existing.executionsTotal && !allSkipped) {
    status = 'paused'
    executionRecord.log += ` Reached ${existing.executionsTotal} execution limit and paused.`
  }

  const newHistory = [executionRecord, ...(existing.executionHistory || [])].slice(0, 100)
  const successes = newHistory.filter(e => e.status === 'success').length
  const successRate = newHistory.length ? Math.round((successes / newHistory.length) * 100) : 0

  const record = {
    ...existing,
    executionHistory: newHistory,
    lastRun: executionRecord.at,
    lastRunAt: executionRecord.at,
    status,
    updated_at: now.toISOString(),
    executionsDone,
    retryCount: nextRetryCount,
    retryRootExecutionId: failed.length && !allSkipped ? chargeRootId : undefined,
    successRate,
  }
  if (existing.trigger?.type === 'schedule' || existing.trigger?.type === 'monitor') record.trigger = { ...existing.trigger, nextRun }
  await saveServerAgent(record)
  return executionRecord
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Automation execution failed'
    const fallbackExecution = {
      id: executionRecord?.id || executionId,
      agentId: existing?.id || agent.id,
      at: now.toISOString(),
      status: 'error',
      duration: Date.now() - startTime,
      output: null,
      error_code: 'EXECUTION_ERROR',
      credits_used: 0,
      log: message,
      trigger: triggerType,
      steps: [],
    }
    try { await saveServerExecution(fallbackExecution) } catch {}
    try {
      const fallbackRecord = {
        ...existing,
        executionHistory: [fallbackExecution, ...(existing?.executionHistory || [])].slice(0, 100),
        lastRun: fallbackExecution.at,
        lastRunAt: fallbackExecution.at,
        status: 'warning',
        updated_at: now.toISOString(),
        successRate: 0,
      }
      if (existing?.trigger?.type === 'schedule' || existing?.trigger?.type === 'monitor') fallbackRecord.trigger = { ...existing.trigger }
      await saveServerAgent(fallbackRecord)
    } catch {}
    return fallbackExecution
  }
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
    if (isAdminAuthUser(user)) return json(res, 200, { ok: true, admin: true, credits: null })
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
    getUserCredits: user => getUserCredits(user, supabaseConfig()),
    spendUserCredits,
    getGenerateVideo: (user, prompt, options) => mediaLibrary.generateVideo(supabaseConfig(), user, prompt, options),
    getUserBilling: (user) => billing.getUserBilling(user, supabaseConfig()),
    getSmartImage: (user, content, objective, platform, options) => mediaLibrary.findSmartImage(supabaseConfig(), user, content, objective, platform, options),
    executeAgent: (agent, user) => runAgent(agent, 'manual', user),
    getIntegrationStatus: async (userId, provider, userEmail = '') => {
      if (composioAutomationConnectors.has(provider)) {
        const composioStatus = await alphaConnector.getConnectionStatus({ id: userId, email: userEmail }, provider).catch(() => null)
        return { connected: composioStatus?.connected === true, ready: composioStatus?.connected === true, identifier: composioStatus?.connectionId || '' }
      }
      const integration = await getUserIntegration(userId, provider, supabaseConfig()).catch(() => null)
      if (!integration) return { connected: false, ready: false }
      const tokens = integration.tokens || {}
      const expiresAt = Number(tokens.expiry || tokens.expires_at || tokens.expiry_date || 0)
      const expired = expiresAt > 0 && expiresAt <= Date.now()
      const scopes = provider === 'linkedin' ? normalizeLinkedInScopes(integration.scopes) : (integration.scopes || [])
      const personalProfile = String(tokens.author_urn || tokens.authorUrn || '').startsWith('urn:li:person:')
      return { connected: true, ready: !expired && provider === 'linkedin' ? personalProfile && scopes.includes('w_member_social') : !expired, expired, scopes, identifier: tokens.author_urn || integration.identifier || '' }
    },
  })
  setConversationEngine(conversationEngine)
  return conversationEngine
}

const alphaJobQueue = createAlphaJobQueue({
  processJob: async (payload) => {
    const { action, prompt, message, conversationId, userId, userEmail } = payload
    const user = { id: userId, email: userEmail }
    const engine = getConversationEngine()
    try {
      if (action === 'continue') {
        if (!conversationId) throw new Error('Conversation id is required for continue jobs')
        const conversation = await engine.continue(conversationId, user, String(message || ''))
        return { conversation, agent: conversation.automationDraft }
      }
      const conversation = await engine.start(user, String(prompt || ''))
      return { conversation, agent: conversation.automationDraft }
    } catch (error) {
      if (user && isProviderOrConfigError(error)) {
        const promptOrMessage = action === 'continue' ? String(message || '') : String(prompt || '')
        const conversation = fallbackConversationResponse(user, promptOrMessage, error)
        await saveServerAgent(conversation)
        return { conversation, agent: null, warning: alphaConfigurationMessage(error) }
      }
      throw error
    }
  },
})

async function addUserCredits(user, creditsToAdd, reference, type = 'purchase', metadata = {}) {
  const config = supabaseConfig()
  const result = await billing.addCredits(user, creditsToAdd, config, { reference, type, reason: metadata.reason, metadata })
  return result.remaining
}

const pendingTransactionsFile = path.resolve(dataDir, 'pending-transactions.json')
const contactRequestsFile = path.resolve(dataDir, 'contact-requests.json')
function readPendingTransactions() { return readJsonFile(pendingTransactionsFile, {}) }
function writePendingTransactions(all) { writeJsonFile(pendingTransactionsFile, all) }

async function handleContactRequest(req, res) {
  const config = supabaseConfig()
  const user = await currentOrLocalUser(req, config.url, config.anon)
  const body = await readBody(req).catch(() => ({}))
  const name = String(body.name || user?.user_metadata?.name || (user?.email ? user.email.split('@')[0] : '') || '').trim()
  const email = String(body.email || user?.email || '').trim()
  const issueType = String(body.issueType || 'Other').trim() || 'Other'
  const reference = String(body.reference || '').trim()
  const message = String(body.message || '').trim()

  if (!email || !message) {
    return json(res, 400, { error: 'Email and message are required to submit a support ticket.' })
  }

  const requests = readJsonFile(contactRequestsFile, [])
  const record = {
    id: randomUUID(),
    name: name || 'User',
    email,
    issueType,
    reference: reference || null,
    message,
    userId: user?.id || null,
    createdAt: new Date().toISOString(),
  }

  const notification = await notifySupportRequest(user?.id || 'system', record).catch((error) => ({ emailSent: false, whatsappSent: false, emailError: String(error), whatsappError: String(error) }))
  record.supportNotification = notification
  requests.unshift(record)
  writeJsonFile(contactRequestsFile, requests.slice(0, 500))
  return json(res, 200, { success: true, message: 'Support request received. We will reply in 1 minute.' })
}

async function notifySupportEmail(userId, request) {
  if (!supportEmail) throw new Error('Support email is not configured.')
  const subject = `AlphaTekX support request: ${request.issueType}${request.reference ? ` (${request.reference})` : ''}`
  const text = [`Name: ${request.name}`, `Email: ${request.email}`, `Issue: ${request.issueType}`, `Reference: ${request.reference || 'none'}`, '', request.message].join('\n')
  const html = `<p><strong>Name:</strong> ${escapeHtml(request.name)}</p><p><strong>Email:</strong> ${escapeHtml(request.email)}</p><p><strong>Issue:</strong> ${escapeHtml(request.issueType)}</p><p><strong>Reference:</strong> ${escapeHtml(request.reference || 'none')}</p><p><strong>Message:</strong></p><p>${escapeHtml(request.message).replace(/\n/g, '<br/>')}</p>`
  return await sendEmailViaResend(userId, { to: supportEmail, subject, html, text })
}

async function notifySupportWhatsApp(request) {
  if (!supportWhatsAppNumber) throw new Error('Support WhatsApp number is not configured.')
  const credentials = whatsappCredentials()
  if (!credentials.configured) throw new Error('WhatsApp support is not configured on the server.')
  await verifyWhatsAppPhoneRegistration(credentials)
  const messageText = `New AlphaTekX support request from ${request.name} (${request.email}). Issue: ${request.issueType}. Reference: ${request.reference || 'none'}. Message: ${request.message}`
  const text = messageText.length > 1000 ? `${messageText.slice(0, 997)}...` : messageText
  const response = await fetch(`${String(credentials.apiVersion).startsWith('v') ? `https://graph.facebook.com/${credentials.apiVersion}` : `https://graph.facebook.com/v15.0`}/${encodeURIComponent(credentials.phoneNumberId)}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${credentials.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: supportWhatsAppNumber, type: 'text', text: { body: text } }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data.error) throw new Error(data.error?.message || 'WhatsApp support notification failed.')
  return data
}

async function notifySupportRequest(userId, request) {
  const result = { emailSent: false, whatsappSent: false, emailError: '', whatsappError: '' }
  try { await notifySupportEmail(userId, request); result.emailSent = true } catch (error) { result.emailError = error instanceof Error ? error.message : String(error) }
  try { await notifySupportWhatsApp(request); result.whatsappSent = true } catch (error) { result.whatsappError = error instanceof Error ? error.message : String(error) }
  return result
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}

async function initializePaystackPayment(req, res) {
  const config = supabaseConfig()
  const user = await currentOrLocalUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const body = await readBody(req)
  const callbackUrl = String(body.callback_url || body.callbackUrl || 'https://alphatekx.name.ng/dashboard').trim()
  const email = String(body.email || user.email || '').trim()
  let item
  const requestedPlan = String(body.plan || '').trim().toLowerCase()
  const requestedAmount = Number(body.amount || 0)
  if (body.planId) {
    item = { type: 'subscription', planId: String(body.planId), callbackUrl }
  } else if (body.packId) {
    item = { type: 'credits', packId: String(body.packId), callbackUrl }
  } else if (requestedPlan === 'early_founder_19' || requestedAmount === 19) {
    item = { type: 'credits', packId: 'early_founder_19', amountUsd: requestedAmount || 19, plan: requestedPlan || 'early_founder_19', credits: 500, callbackUrl }
  } else {
    // Backwards-compatible fallback: derive pack from credits, amount, and currency.
    const credits = Number(body.credits || 0)
    const currency = String(body.currency || body.currency_code || 'NGN').trim().toUpperCase()
    const pack = billing.CREDIT_PACKS.find(p => p.credits === credits && String(p.currency || '').toUpperCase() === currency && p.amountKobo === requestedAmount)
      || billing.CREDIT_PACKS.find(p => p.credits === credits && String(p.currency || '').toUpperCase() === currency)
      || billing.CREDIT_PACKS.find(p => p.credits === credits)
      || billing.CREDIT_PACKS[0]
    item = { type: 'credits', packId: pack.id, callbackUrl }
  }
  try {
    const result = await billing.initializePayment('paystack', { ...user, email }, item, config)
    return json(res, 200, result)
  } catch (error) { return json(res, 502, { error: error instanceof Error ? error.message : 'Payment start failed' }) }
}

async function verifyAndAddCreditsByReference(reference) {
  const config = supabaseConfig()
  const result = await billing.verifyPayment('paystack', reference, config)
  if (!result.ok) throw new Error(result.message || 'Paystack payment was not verified')
  return { user: result.user, credits: result.credits, balance: result.balance, plan: result.plan, duplicate: result.duplicate === true }
}

async function paystackWebhookHandler(req, res) {
  const secret = process.env.PAYSTACK_SECRET_KEY
  if (!secret) return json(res, 503, { error: 'Paystack secret key not configured' })
  const signature = String(req.headers['x-paystack-signature'] || '')
  const raw = await readRawBody(req)
  const hash = createHmac('sha512', secret).update(raw).digest('hex')
  const signatureBuffer = Buffer.from(signature)
  const hashBuffer = Buffer.from(hash)
  if (!signature || signatureBuffer.length !== hashBuffer.length || !timingSafeEqual(signatureBuffer, hashBuffer)) return json(res, 401, { error: 'Invalid signature' })
  let body
  try { body = JSON.parse(raw.toString('utf8')) }
  catch { return json(res, 400, { error: 'Invalid webhook body' }) }
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

function googleIdentitySubject(user) {
  const googleIdentity = (user?.identities || []).find(identity => String(identity?.provider || '').toLowerCase() === 'google')
  return String(
    googleIdentity?.id ||
    googleIdentity?.identity_data?.sub ||
    user?.user_metadata?.sub ||
    user?.id ||
    ''
  ).trim()
}

function supervisorEmails() {
  return new Set([
    ...productAdminEmails,
    ...String(process.env.SUPER_ADMIN_EMAILS || '')
      .split(',')
      .map(normalizedAuthEmail)
      .filter(Boolean),
  ])
}

const bonusVerificationAttempts = new Map()
const BONUS_RATE_WINDOW_MS = 60 * 60 * 1000
const BONUS_RATE_MAX = 5

function bonusRequestIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim()
}

function bonusRateLimited(req) {
  const ip = bonusRequestIp(req)
  const now = Date.now()
  const current = bonusVerificationAttempts.get(ip)
  const entry = !current || now >= current.reset ? { count: 0, reset: now + BONUS_RATE_WINDOW_MS } : current
  entry.count += 1
  bonusVerificationAttempts.set(ip, entry)
  return entry.count > BONUS_RATE_MAX
}

async function serviceRows(config, table, query) {
  const response = await fetch(`${config.url}/rest/v1/${table}?${query}`, { headers: serviceHeaders(config.service) })
  if (!response.ok) throw new Error(`Supabase ${table} read failed (${response.status})`)
  return response.json()
}

async function ensureCreditProfile(user, config) {
  let rows
  try {
    rows = await serviceRows(config, 'profiles', `id=eq.${encodeURIComponent(user.id)}&select=id,credits,purchased_credits&limit=1`)
  } catch {
    rows = await serviceRows(config, 'profiles', `id=eq.${encodeURIComponent(user.id)}&select=id,credits&limit=1`)
  }
  if (rows[0]) return rows[0]
  const profileCandidates = [
    { id: user.id, email: authUserEmail(user), credits: 0, purchased_credits: 0, plan: 'free' },
    { id: user.id, email: authUserEmail(user), credits: 0, plan: 'free' },
    { id: user.id, email: authUserEmail(user), credits: 0 },
    { id: user.id, email: authUserEmail(user) },
    { id: user.id },
  ]
  let response
  let failureDetail = ''
  for (const candidate of profileCandidates) {
    response = await fetch(`${config.url}/rest/v1/profiles`, {
      method: 'POST',
      headers: { ...serviceHeaders(config.service), Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(candidate),
    })
    if (response.ok || response.status === 409) break
    failureDetail = await response.text().catch(() => '')
    if (response.status !== 400) break
  }
  if (!response?.ok && response?.status !== 409) {
    const schemaHint = /column|schema cache|could not find/i.test(failureDetail) ? ' Check the production profiles schema.' : ''
    throw new Error(`Supabase profile setup failed (${response?.status || 500}).${schemaHint}`)
  }
  try {
    rows = await serviceRows(config, 'profiles', `id=eq.${encodeURIComponent(user.id)}&select=id,credits,purchased_credits&limit=1`)
  } catch {
    rows = await serviceRows(config, 'profiles', `id=eq.${encodeURIComponent(user.id)}&select=id,credits&limit=1`)
  }
  if (!rows[0]) throw new Error('Supabase profile setup did not persist')
  return rows[0]
}

async function setProfileMinimumCredits(user, config, minimum) {
  const profile = await ensureCreditProfile(user, config)
  const current = Number(profile.credits) || 0
  if (current >= minimum) return { credits: current, added: 0 }
  const added = minimum - current
  const patch = { credits: minimum, purchased_credits: (Number(profile.purchased_credits) || 0) + added }
  let response = await fetch(`${config.url}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}`, {
    method: 'PATCH',
    headers: serviceHeaders(config.service),
    body: JSON.stringify(patch),
  })
  if (!response.ok) {
    response = await fetch(`${config.url}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}`, {
      method: 'PATCH',
      headers: serviceHeaders(config.service),
      body: JSON.stringify({ credits: minimum }),
    })
  }
  if (!response.ok) throw new Error(`Supabase credit update failed (${response.status})`)
  return { credits: minimum, added }
}

const googleCreditLocks = new Map()
async function grantGoogleCreditDirect(user, googleSub, config) {
  if (googleCreditLocks.has(user.id)) return googleCreditLocks.get(user.id)
  const work = (async () => {
    if (isAdminAuthUser(user) || supervisorEmails().has(authUserEmail(user))) {
      // Admin authority is derived from the authenticated identity, not a mutable
      // credit row. A missing/old profiles schema must never block admin sign-in.
      return 999999
    }
    const secret = process.env.DEVICE_FINGERPRINT_SECRET || config.service
    const markerHash = createHmac('sha256', secret).update(`google-welcome:${googleSub}`).digest('hex')
    const markerSub = `welcome-${createHmac('sha256', secret).update(`google-sub:${googleSub}`).digest('hex')}`
    const existing = await serviceRows(config, 'device_claims', `fingerprint_hash=eq.${markerHash}&select=id&limit=1`)
    if (existing[0]) {
      return (await setProfileMinimumCredits(user, config, 1)).credits
    }
    const profile = await ensureCreditProfile(user, config)
    const current = Number(profile.credits) || 0
    const marker = await fetch(`${config.url}/rest/v1/device_claims`, {
      method: 'POST',
      headers: { ...serviceHeaders(config.service), Prefer: 'return=minimal' },
      body: JSON.stringify({
        fingerprint_hash: markerHash,
        google_sub: markerSub,
        email: authUserEmail(user),
      }),
    })
    if (marker.status === 409) return (await setProfileMinimumCredits(user, config, 1)).credits
    if (!marker.ok) throw new Error(`Supabase Google-credit claim failed (${marker.status})`)
    try {
      return (await setProfileMinimumCredits(user, config, current + 1)).credits
    } catch (error) {
      await fetch(`${config.url}/rest/v1/device_claims?fingerprint_hash=eq.${markerHash}`, {
        method: 'DELETE',
        headers: serviceHeaders(config.service),
      }).catch(() => null)
      throw error
    }
  })().finally(() => googleCreditLocks.delete(user.id))
  googleCreditLocks.set(user.id, work)
  return work
}

async function verifyDeviceBonus(req, res) {
  const config = supabaseConfig()
  const user = await currentOrLocalUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const providers = new Set([
    String(user.app_metadata?.provider || '').toLowerCase(),
    ...(user.identities || []).map(identity => String(identity?.provider || '').toLowerCase()),
  ])
  const googleSub = googleIdentitySubject(user)
  if (!providers.has('google') || !googleSub) return json(res, 400, { error: 'A verified Google identity is required for this bonus.' })
  if (!config.url || !config.service) return json(res, 503, { error: 'Human verification is not configured on the server.' })

  const email = authUserEmail(user)
  if (isAdminAuthUser(user) || supervisorEmails().has(email)) {
    return json(res, 200, { ok: true, success: true, claimed: true, credits: 999999, creditsAdded: 0, isAdmin: true, reason: 'supervisor_bypass' })
  }

  if (bonusRateLimited(req)) return json(res, 429, { error: 'Too many verification attempts. Please try again in one hour.' })
  const body = await readBody(req)
  const fingerprint = String(body.fingerprintHash || body.fingerprint || '').trim()
  if (!/^[a-zA-Z0-9_-]{16,256}$/.test(fingerprint)) return json(res, 400, { error: 'The device fingerprint is invalid.' })

  const fingerprintHash = createHmac('sha256', process.env.DEVICE_FINGERPRINT_SECRET || config.service)
    .update(fingerprint)
    .digest('hex')
  const claimQuery = `select=id,fingerprint_hash,google_sub&or=(fingerprint_hash.eq.${encodeURIComponent(fingerprintHash)},google_sub.eq.${encodeURIComponent(googleSub)})&limit=1`
  const existing = await serviceRows(config, 'device_claims', claimQuery)
  if (existing[0]) {
    const profile = await ensureCreditProfile(user, config)
    return json(res, 200, { ok: true, success: false, claimed: false, reason: 'already_claimed', credits: Number(profile.credits) || 1, creditsAdded: 0, isAdmin: false })
  }

  const claimResponse = await fetch(`${config.url}/rest/v1/device_claims`, {
    method: 'POST',
    headers: { ...serviceHeaders(config.service), Prefer: 'return=representation' },
    body: JSON.stringify({
      fingerprint_hash: fingerprintHash,
      google_sub: googleSub,
      email,
    }),
  })
  if (claimResponse.status === 409) {
    const profile = await ensureCreditProfile(user, config)
    return json(res, 200, { ok: true, success: false, claimed: false, reason: 'already_claimed', credits: Number(profile.credits) || 1, creditsAdded: 0, isAdmin: false })
  }
  if (!claimResponse.ok) return json(res, 500, { error: `Human verification claim failed (${claimResponse.status}). Your Google credit is safe.` })
  try {
    const result = await setProfileMinimumCredits(user, config, 10)
    return json(res, 200, { ok: true, success: true, claimed: true, reason: 'bonus_unlocked', credits: result.credits, creditsAdded: result.added, isAdmin: false })
  } catch (error) {
    await fetch(`${config.url}/rest/v1/device_claims?fingerprint_hash=eq.${encodeURIComponent(fingerprintHash)}&google_sub=eq.${encodeURIComponent(googleSub)}`, {
      method: 'DELETE',
      headers: serviceHeaders(config.service),
    }).catch(() => null)
    throw error
  }
}

async function googleWelcomeCredit(req, res) {
  const config = supabaseConfig()
  const user = await currentOrLocalUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const providers = new Set([
    String(user.app_metadata?.provider || '').toLowerCase(),
    ...(user.identities || []).map(identity => String(identity?.provider || '').toLowerCase()),
  ])
  const googleSub = googleIdentitySubject(user)
  if (!providers.has('google') || !googleSub) return json(res, 400, { error: 'A verified Google identity is required for this credit.' })
  if (!config.url || !config.service) return json(res, 503, { error: 'Google welcome credits are not configured on the server.' })
  const credits = await grantGoogleCreditDirect(user, googleSub, config)
  const isAdmin = isAdminAuthUser(user) || supervisorEmails().has(authUserEmail(user))
  return json(res, 200, { ok: true, success: true, credits, isAdmin, reason: isAdmin ? 'supervisor_bypass' : 'google_credit_ready' })
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
      const email = authUserEmail(payload)
      if (payload.sub && email) return { id: payload.sub, email, name: payload.name || payload.user_metadata?.name || payload.user_metadata?.full_name || '' }
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
  const auth = await authenticatedAdmin(req)
  if (!auth) return json(res, 403, { error: 'Admin access required' })
  const aiStats = (typeof alphaBrain?.getProviderStats === 'function' && alphaBrain.getProviderStats()) || { modelCalls: 0, fallbackCalls: 0 }
  return json(res, 200, { ...providerHealth.getAdminProviderDiagnostics(), aiStats })
}

async function adminProviderHealthCheck(req, res) {
  const auth = await authenticatedAdmin(req)
  if (!auth) return json(res, 403, { error: 'Admin access required' })
  const body = await readBody(req)
  const name = String(body.name || '')
  if (!providerHealth.getAllProviderHealth().some(p => p.name === name)) return json(res, 400, { error: 'Unknown provider' })
  const result = await providerHealth.checkProviderHealth(name, callProvider)
  return json(res, 200, result)
}

async function adminStats(req, res) {
  const config = supabaseConfig()
  const auth = await authenticatedAdmin(req)
  if (!auth) return json(res, 403, { error: 'Admin access required' })
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

async function adminCreditTransfer(req, res) {
  const auth = await authenticatedAdmin(req)
  if (!auth) return json(res, 403, { error: 'Admin access required' })
  const body = await readBody(req)
  try {
    return json(res, 200, await billing.grantCreditsByAdmin(auth.user, body.email, body.credits, auth.config, body.idempotencyKey))
  } catch (error) {
    return json(res, 400, { error: error instanceof Error ? error.message : 'Credit transfer failed' })
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
  const config = supabaseConfig()
  if ((req.method || '').toUpperCase() === 'GET') {
    try {
      const requestUrl = new URL(req.url || '/', publicAppUrl())
      const reference = String(requestUrl.searchParams.get('reference') || requestUrl.searchParams.get('ref') || '')
      if (!reference) return json(res, 400, { error: 'Missing payment reference.' })
      const result = await billing.verifyPayment('paystack', reference, config)
      if (!result.ok) return json(res, 400, { error: result.message || 'Verification failed', reference, success: false })
      return json(res, 200, { success: true, verified: true, credits: result.balance, plan: result.plan || 'free', amount: result.amount || 0, reference: result.reference || reference })
    } catch (err) {
      return json(res, 500, { error: err instanceof Error ? err.message : String(err), success: false })
    }
  }
  try {
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
      const bodyCredits = Number(body.credits || 0)
      const bodyAmount = Number(body.amount || 0)
      const bodyCurrency = String(body.currency || body.currency_code || 'NGN').trim().toUpperCase()
      let pack = packId ? billing.getCreditPack(packId) : null
      if (!pack && bodyCredits) {
        pack = billing.CREDIT_PACKS.find(p => p.credits === bodyCredits && String(p.currency || '').toUpperCase() === bodyCurrency && p.amountKobo === bodyAmount)
          || billing.CREDIT_PACKS.find(p => p.credits === bodyCredits && String(p.currency || '').toUpperCase() === bodyCurrency)
          || billing.CREDIT_PACKS.find(p => p.credits === bodyCredits)
      }
      if (!pack) pack = billing.CREDIT_PACKS[0]
      const result = await billing.addCredits(user, pack.credits, config, { reference: 'dev-' + reference, type: 'purchase', reason: `Dev purchase: ${pack.label}`, metadata: { packId: pack.id, mock: true } })
      return json(res, 200, { verified: true, credits: result.remaining, plan: 'free', amount: pack.amountKobo, mock: true })
    }

    const result = await billing.verifyPayment('paystack', reference, config)
    if (!result.ok) return json(res, 400, { error: result.message || 'Verification failed' })
    return json(res, 200, { verified: true, credits: result.balance, plan: result.plan || 'free', amount: result.amount || 0, reference: result.reference || reference })
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
    const headers = serviceHeaders(serviceKey)
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
  if (payload?.[0]) return payload[0]
  const builderResponse = await fetch(`${config.url}/rest/v1/builder_projects?slug=eq.${encodeURIComponent(slug)}&published=eq.true&select=id,title,slug,code&limit=1`, { headers: deploymentReadHeaders(config) })
  const builderPayload = await builderResponse.json()
  if (!builderResponse.ok) throw new Error(builderPayload.message || 'Could not load the published Builder app. Run supabase/elite-builder.sql once.')
  return builderPayload?.[0] || null
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
    if (fromToken) { req.alphaUser = fromToken; req.alphaAuthSource = 'token'; return resolve(fromToken) }
    if (String(req.headers.authorization || '').startsWith('Bearer ')) return resolve(null)
    const local = localUserFromRequest(req)
    if (local) { req.alphaUser = local; req.alphaAuthSource = 'local' }
    resolve(local)
  })
}

function trustedFeatureIdentity(req) {
  return req.alphaAuthSource === 'token' || process.env.NODE_ENV !== 'production'
}

function featureAccessForRequest(req, user, connector) {
  return connectorFeatureAccess(user, connector, trustedFeatureIdentity(req))
}

function requireConnectorFeature(req, res, user, connector) {
  const access = featureAccessForRequest(req, user, connector)
  if (access.enabled) return true
  json(res, 403, { error: unavailableConnectorMessage(access.id), code: 'FEATURE_COMING_SOON', connector: access.id })
  return false
}

async function appDataHandler(req, res) {
  const urlPath = new URL(req.url || '/', 'http://localhost').pathname
  const match = urlPath.match(/^\/api\/apps\/([^/]+)\/([^/]+)(?:\/([^/]+))?\/?$/)
  const migrateMatch = urlPath.match(/^\/api\/apps\/([^/]+)\/migrate\/?$/)
  const slug = match?.[1] || migrateMatch?.[1]
  if (!slug || !validSlug(slug)) return false
  const config = supabaseConfig()
  const user = await currentOrLocalUser(req, config.url, config.anon).catch(() => null)
  const isAdmin = isAdminAuthUser(user)
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
      headers: serviceHeaders(config.service),
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

function hasUsableStoredIntegration(provider, tokens) {
  if (!tokens || typeof tokens !== 'object') return false
  const accessToken = tokens.api_key || tokens.access_token || tokens.token || tokens.bot_token || ''
  if (provider === 'linkedin') {
    return hasUsableLinkedInStorage(tokens)
  }
  return Boolean(accessToken || tokens.refresh_token || tokens.webhook_url || tokens.webhookUrl || Object.keys(tokens).length)
}

let userIntegrationsRetryAt = 0

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
          // Old Composio/native rows may share the provider name without
          // containing usable native credentials. Do not let such a stale row
          // hide a newer encrypted OAuth record in user_integrations.
          if (hasUsableStoredIntegration(provider, tokens)) {
            return { id: row.id, user_id: row.user_id, provider, email: row.email || null, identifier: row.email || tokens.identifier || null, tokens, scopes: row.scopes || [], source: 'connected_accounts' }
          }
          process.stdout.write(`[get integration] ignored unusable connected_accounts row for ${provider}\n`)
        }
      }
    } catch (err) { process.stdout.write(`[get integration] connected_accounts lookup failed: ${err instanceof Error ? err.message : err}\n`) }
    // Production installations created before connected_accounts use the
    // existing encrypted user_integrations vault. Keep reading it so OAuth
    // connections remain durable while deployments migrate independently.
    try {
      if (Date.now() < userIntegrationsRetryAt) throw Object.assign(new Error('Legacy integration vault is awaiting database activation.'), { quiet: true })
      const response = await fetch(`${config.url}/rest/v1/user_integrations?user_id=eq.${encodeURIComponent(userId)}&provider=eq.${encodeURIComponent(provider)}&select=*`, { headers: serviceHeaders(config.service) })
      if (response.ok) {
        const rows = await response.json()
        const row = rows?.[0]
        if (row?.access_token) {
          const key = encryptionKey(config)
          const decrypted = decryptSecret(row.access_token, key)
          let tokens
          try { tokens = JSON.parse(decrypted) } catch { tokens = { access_token: decrypted } }
          if (row.refresh_token && !tokens.refresh_token) tokens.refresh_token = decryptSecret(row.refresh_token, key)
          if (row.expiry_date && !tokens.expiry) tokens.expiry = Number(row.expiry_date)
          return {
            id: row.id,
            user_id: row.user_id,
            provider,
            email: row.email || null,
            identifier: tokens.author_urn || tokens.authorUrn || row.email || null,
            tokens,
            scopes: row.scopes || [],
            source: 'user_integrations',
          }
        }
      } else {
        const detail = await response.text().catch(() => '')
        if (response.status === 404 && /PGRST205|user_integrations/i.test(detail)) {
          userIntegrationsRetryAt = Date.now() + 5 * 60_000
          process.stdout.write('[get integration] legacy user_integrations vault is absent; retrying after schema repair window\n')
        } else {
        process.stdout.write(`[get integration] user_integrations lookup failed for ${provider}: HTTP ${response.status}${detail ? ` ${detail.slice(0, 240)}` : ''}\n`)
        }
      }
    } catch (err) {
      if (!err?.quiet) process.stdout.write(`[get integration] user_integrations lookup failed: ${err instanceof Error ? err.message : err}\n`)
    }
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
  const remoteRequired = Boolean(config.url && config.service)
  if (config.url && config.service) {
    const key = encryptionKey(config)
    const remote = { ...record, tokens: encryptGenericTokens(data.tokens || {}, key) }
    try {
      const response = await fetch(`${config.url}/rest/v1/connected_accounts?on_conflict=user_id,provider`, { method: 'POST', headers: { ...serviceHeaders(config.service), Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(remote) })
      if (response.ok) savedRemote = true
      else {
        const detail = await response.text().catch(() => '')
        process.stdout.write(`[save integration] connected_accounts save failed for ${provider}: HTTP ${response.status}${detail ? ` ${detail.slice(0, 240)}` : ''}\n`)
      }
    } catch (err) { process.stdout.write(`[save integration] connected_accounts save failed: ${err instanceof Error ? err.message : err}\n`) }
    if (!savedRemote) {
      // user_integrations is the original encrypted connector vault and is
      // present in the baseline Supabase schema. Store the complete provider
      // payload as authenticated ciphertext so author URNs and future token
      // fields are preserved without exposing them to the browser.
      try {
        const tokens = data.tokens || {}
        const legacy = {
          user_id: userId,
          provider,
          access_token: encryptSecret(JSON.stringify(tokens), key),
          refresh_token: tokens.refresh_token ? encryptSecret(String(tokens.refresh_token), key) : null,
          expiry_date: tokens.expiry || tokens.expires_at || null,
          email: record.email,
          scopes: record.scopes,
          updated_at: record.updated_at,
        }
        const response = await fetch(`${config.url}/rest/v1/user_integrations?on_conflict=user_id,provider`, {
          method: 'POST',
          headers: { ...serviceHeaders(config.service), Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(legacy),
        })
        if (response.ok) savedRemote = true
        else {
          const detail = await response.text().catch(() => '')
          process.stdout.write(`[save integration] user_integrations save failed for ${provider}: HTTP ${response.status}${detail ? ` ${detail.slice(0, 240)}` : ''}\n`)
        }
      } catch (err) { process.stdout.write(`[save integration] user_integrations save failed: ${err instanceof Error ? err.message : err}\n`) }
    }
  }
  if (!remoteRequired) setLocalIntegration(userId, provider, { ...record, tokens: data.tokens || {} })
  return { saved: savedRemote || !remoteRequired, durable: savedRemote || !remoteRequired }
}

async function repairOversizedAuthSession(req, res) {
  const config = supabaseConfig()
  if (!config.url || !config.anon || !config.service) return json(res, 503, { error: 'Authentication storage is not configured.' })
  const body = await readBody(req)
  const accessToken = String(body.accessToken || '')
  const user = await userFromAccessToken(accessToken, config.url, config.anon)
  if (!user?.id) return json(res, 401, { error: 'Your session has expired. Please sign in again.' })

  const metadata = await getAuthAppMetadata(user.id, config)
  const legacy = metadata?.integrations
  if (!legacy || typeof legacy !== 'object') return json(res, 200, { repaired: false })

  // Move every legacy record out of the JWT before removing it. Tokens are already
  // encrypted with the same application key used by connected_accounts.
  for (const [provider, record] of Object.entries(legacy)) {
    const remote = {
      user_id: user.id,
      provider,
      email: record?.email || user.email || null,
      scopes: Array.isArray(record?.scopes) ? record.scopes : [],
      tokens: record?.tokens || {},
      updated_at: record?.updated_at || new Date().toISOString(),
    }
    const saved = await fetch(`${config.url}/rest/v1/connected_accounts?on_conflict=user_id,provider`, {
      method: 'POST',
      headers: { ...serviceHeaders(config.service), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(remote),
    })
    if (!saved.ok) {
      process.stdout.write(`[session repair] could not migrate ${provider}: HTTP ${saved.status}\n`)
      return json(res, 503, { error: 'Alpha could not safely repair this session yet. Please contact support.' })
    }
  }

  const { integrations: _removed, ...slimMetadata } = metadata
  const updated = await fetch(`${config.url}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
    method: 'PUT',
    headers: serviceHeaders(config.service),
    body: JSON.stringify({ app_metadata: slimMetadata }),
  })
  if (!updated.ok) return json(res, 503, { error: 'Alpha could not refresh your saved session.' })
  return json(res, 200, { repaired: true })
}

async function deleteUserIntegration(userId, provider, config) {
  if (provider === 'google') return disconnectGoogleByUser(userId, config)
  if (config.url && config.service) {
    await fetch(`${config.url}/rest/v1/connected_accounts?user_id=eq.${encodeURIComponent(userId)}&provider=eq.${encodeURIComponent(provider)}`, { method: 'DELETE', headers: serviceHeaders(config.service) }).catch(() => {})
    await fetch(`${config.url}/rest/v1/user_integrations?user_id=eq.${encodeURIComponent(userId)}&provider=eq.${encodeURIComponent(provider)}`, { method: 'DELETE', headers: serviceHeaders(config.service) }).catch(() => {})
    try {
      const meta = await getAuthAppMetadata(userId, config)
      if (meta?.integrations?.[provider]) {
        const integrations = { ...meta.integrations }
        delete integrations[provider]
        await fetch(`${config.url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
          method: 'PUT',
          headers: serviceHeaders(config.service),
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

function gmailAttachmentParts(payload, result = []) {
  if (!payload || typeof payload !== 'object') return result
  if (payload.filename && payload.body?.attachmentId) {
    result.push({
      attachmentId: String(payload.body.attachmentId),
      name: String(payload.filename),
      mimeType: String(payload.mimeType || 'application/octet-stream'),
    })
  }
  for (const part of payload.parts || []) gmailAttachmentParts(part, result)
  return result
}

async function googleDriveFindGmailAttachment(accessToken, sourceKey) {
  const url = new URL('https://www.googleapis.com/drive/v3/files')
  url.searchParams.set('q', `trashed = false and appProperties has { key='alphatekxGmailAttachment' and value='${sourceKey}' }`)
  url.searchParams.set('fields', 'files(id,name)')
  url.searchParams.set('pageSize', '1')
  const response = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error?.message || 'Google Drive duplicate check failed')
  return data.files?.[0] || null
}

async function googleDriveUploadGmailAttachment(accessToken, attachment) {
  const boundary = `alphatekx_${randomUUID()}`
  const metadata = {
    name: attachment.name,
    mimeType: attachment.mimeType,
    appProperties: { alphatekxGmailAttachment: attachment.sourceKey },
  }
  const opening = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: ${attachment.mimeType}\r\n\r\n`,
    'utf8',
  )
  const closing = Buffer.from(`\r\n--${boundary}--`, 'utf8')
  const body = Buffer.concat([opening, attachment.content, closing])
  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })
  const data = await response.json()
  if (!response.ok || !data.id) throw new Error(data.error?.message || 'Google Drive attachment upload failed')
  return data
}

async function gmailSaveAttachmentsToDrive(userId, params = {}) {
  const config = supabaseConfig()
  const accessToken = await googleAccessToken(userId, config)
  const maxMessages = Math.min(Math.max(Number(params.maxMessages || 20), 1), 50)
  const query = String(params.q || 'has:attachment').trim()
  const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
  listUrl.searchParams.set('q', query)
  listUrl.searchParams.set('maxResults', String(maxMessages))
  const listResponse = await fetch(listUrl.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
  const listData = await listResponse.json()
  if (!listResponse.ok) throw new Error(listData.error?.message || 'Gmail attachment search failed')

  const saved = []
  const skipped = []
  for (const messageRef of listData.messages || []) {
    const messageResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageRef.id)}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    const message = await messageResponse.json()
    if (!messageResponse.ok) throw new Error(message.error?.message || 'Gmail message read failed')
    for (const part of gmailAttachmentParts(message.payload)) {
      const sourceKey = Buffer.from(`${messageRef.id}:${part.attachmentId}`, 'utf8').toString('base64url')
      const existing = await googleDriveFindGmailAttachment(accessToken, sourceKey)
      if (existing) {
        skipped.push({ id: existing.id, name: existing.name || part.name, reason: 'already_saved' })
        continue
      }
      const attachmentResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageRef.id)}/attachments/${encodeURIComponent(part.attachmentId)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )
      const attachmentData = await attachmentResponse.json()
      if (!attachmentResponse.ok || !attachmentData.data) throw new Error(attachmentData.error?.message || `Could not download ${part.name}`)
      const content = Buffer.from(String(attachmentData.data), 'base64url')
      const uploaded = await googleDriveUploadGmailAttachment(accessToken, { ...part, sourceKey, content })
      saved.push({ id: uploaded.id, name: uploaded.name || part.name, mimeType: uploaded.mimeType || part.mimeType })
    }
  }
  return { query, messagesChecked: (listData.messages || []).length, saved, skipped }
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
  const expiresAt = Number(ownTokens.expiry || ownTokens.expires_at || ownTokens.expiry_date || 0)
  if (platform === 'linkedin' && expiresAt > 0 && expiresAt <= Date.now()) throw new Error('LinkedIn access token has expired. Reconnect LinkedIn in Connected Apps.')
  if (platform === 'linkedin' && authorUrn && !String(authorUrn).startsWith('urn:li:person:')) throw new Error('Only LinkedIn personal profile publishing is supported in this release.')
  const hasToken = Boolean(accessToken || webhookUrl || botToken)
  if (hasToken && (hasOwnKey || !isMasterToken)) {
    return { platform, isMaster: false, accessToken, webhookUrl, botToken, chatId, channel, authorUrn, pageId, phoneNumberId, scopes, ...ownTokens }
  }
  if (isMasterToken) {
    if (!skipFreeLimit && (full.freePostsUsed || 0) >= (full.freePostsLimit || 0)) throw new Error('FREE_LIMIT_REACHED')
    const master = masterCredentials(platform)
    const masterToken = accessToken || master?.botToken || master?.accessToken || ''
    if (!masterToken) throw new Error(`${platform} master token is missing`)
    return { ...master, platform, isMaster: true, accessToken: masterToken, webhookUrl: master?.webhookUrl || '', botToken: master?.botToken || masterToken, chatId: chatId || master?.chatId || '', channel: channel || master?.channel || '', authorUrn, pageId, phoneNumberId, scopes, ...ownTokens }
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
  const response = await fetch('https://api.x.com/2/tweets', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: bodyText }) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.detail || data.title || 'X post failed')
  if (!data.data?.id) throw new Error('X did not return a confirmed post identifier')
  return { id: data.data?.id, data }
}

async function postToLinkedIn(creds, params) {
  return publishLinkedInTextPost(creds, params)
}

function localScheduleToUtc(date, time, timeZone = 'UTC') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !/^\d{2}:\d{2}$/.test(String(time))) throw new Error('Choose a valid date and exact time')
  const [year, month, day] = String(date).split('-').map(Number)
  const [hour, minute] = String(time).split(':').map(Number)
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0)
  if (timeZone === 'UTC') return new Date(desired)
  let candidate = desired
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(candidate)).map(part => [part.type, part.value]))
      const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), 0)
      candidate += desired - represented
    }
    const finalParts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(candidate)).map(part => [part.type, part.value]))
    const finalLocal = Date.UTC(Number(finalParts.year), Number(finalParts.month) - 1, Number(finalParts.day), Number(finalParts.hour), Number(finalParts.minute), 0)
    if (finalLocal !== desired) throw new Error('That local time does not exist in the selected timezone. Choose another exact time.')
    return new Date(candidate)
  } catch (error) {
    if (error instanceof Error && error.message.includes('does not exist')) throw error
    throw new Error('Choose a valid IANA timezone such as Africa/Lagos')
  }
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
  if (!message) throw new Error('Facebook Page post requires text')
  const token = creds.accessToken || creds.token
  const pageId = creds.pageId || creds.page_id || creds.identifier
  if (!token || !pageId) throw new Error('Facebook page access token and Page ID are missing. Add them in Connectors.')
  const url = `${facebookGraphBaseUrl()}/${encodeURIComponent(pageId)}/feed`
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, access_token: token }) })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data.error) throw new Error(data.error?.message || 'Facebook post failed')
  if (!data.id) throw new Error('Facebook did not return a confirmed post identifier')
  return { id: String(data.id), pageId: String(pageId), pageName: String(creds.page_name || creds.pageName || ''), data }
}

async function postToWhatsApp(creds, params) {
  void creds
  const text = String(params.text || params.message || '')
  if (!text) throw new Error('WhatsApp message requires text')
  const to = String(params.to || params.phone || params.phoneNumber || '')
  if (!to) throw new Error('WhatsApp message requires a recipient phone number in `to` or `phone`.')
  const credentials = whatsappCredentials()
  if (!credentials.configured) throw new Error('WhatsApp setup is incomplete on the server.')
  if (!allowedWhatsAppRecipients().has(String(to).replace(/\D/g, ''))) throw new Error('This number is not approved for the current WhatsApp test.')
  await verifyWhatsAppPhoneRegistration(credentials)
  const sent = await sendWhatsAppText(credentials, { recipient: to, text })
  return { id: sent.providerMessageId, ok: true }
}

async function postToSocial(platform, user, params) {
  const userId = typeof user === 'string' ? user : user?.id
  const fullUser = await getUser(userId, user?.email || '')
  if (!fullUser) throw new Error('User not found')
  const isAdmin = isAdminAuthUser(fullUser)
  const text = String(params.text || params.message || '')
  const imageUrl = String(params.imageUrl || params.image_url || '')
  const videoUrl = String(params.videoUrl || params.video_url || '')
  if (!text && !imageUrl && !videoUrl) throw new Error('Social post requires text or image')

  const usesComposio = composioPublishingPlatforms.has(platform)
  if (usesComposio) {
    const connection = await alphaConnector.getConnectionStatus(fullUser, platform).catch(() => ({ connected: false }))
    if (connection.connected === true) {
      const approvalId = String(params.approvalId || `manual:${platform}:${Date.now()}`).trim()
      const idempotencyKey = String(params.idempotencyKey || `manual:${platform}:${userId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`).trim()
      const actionPayload = {
        ...params,
        approvalId,
        idempotencyKey,
        _skipFreeLimit: true,
      }
      delete actionPayload.text
      delete actionPayload.message
      delete actionPayload.imageUrl
      delete actionPayload.image_url
      delete actionPayload.videoUrl
      delete actionPayload.video_url
      delete actionPayload.to
      delete actionPayload.phone
      delete actionPayload.phoneNumber

      if (platform === 'instagram') {
        if (!imageUrl) throw new Error('Instagram requires a confirmed image. Regenerate this post before publishing.')
        return await executeProviderWithHealing(fullUser, platform, 'create_post', {
          ...actionPayload,
          caption: text,
          image_url: imageUrl,
        })
      }
      if (platform === 'facebook') {
        return await executeProviderWithHealing(fullUser, platform, 'create_page_post', {
          ...actionPayload,
          message: text,
          ...(imageUrl ? { image_url: imageUrl } : {}),
        })
      }
      if (platform === 'x' || platform === 'twitter') {
        return await executeProviderWithHealing(fullUser, platform, text.length > 280 ? 'create_thread' : 'create_tweet', {
          ...actionPayload,
          text,
          ...(imageUrl ? { image_url: imageUrl } : {}),
        })
      }
      if (platform === 'whatsapp') {
        const to = String(params.to || params.phone || params.phoneNumber || '')
        if (!to) throw new Error('WhatsApp message requires a recipient phone number in `to` or `phone`.')
        return await executeProviderWithHealing(fullUser, platform, 'send_message', {
          ...actionPayload,
          to,
          message: text,
        })
      }
      if (platform === 'youtube') {
        if (!videoUrl) throw new Error('YouTube needs a video selected from Media Library before publishing.')
        return await executeProviderWithHealing(fullUser, platform, 'upload_video', {
          ...actionPayload,
          title: String(params.title || params.topic || 'AlphaTekx video').slice(0, 100),
          description: text || String(params.description || 'Published by AlphaTekx after explicit approval.'),
          tags: Array.isArray(params.tags) ? params.tags.slice(0, 20) : [],
          privacyStatus: String(params.privacyStatus || 'public'),
          video_url: videoUrl,
        })
      }
    }
  }

  const creds = await getPostingCredentials(fullUser, platform, { ...params, _skipFreeLimit: params._skipFreeLimit || isAdmin })
  let result
  switch (platform) {
    case 'x':
    case 'twitter': result = await postToX(creds, params); break
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
  void userId
  const credentials = whatsappCredentials()
  if (!credentials.configured) throw new Error('WhatsApp setup is incomplete on the server.')
  const to = String(params.to || params.phone || '')
  const message = String(params.message || params.text || '')
  if (!to || !message) throw new Error('WhatsApp requires to and message')
  if (!allowedWhatsAppRecipients().has(String(to).replace(/\D/g, ''))) throw new Error('This number is not approved for the current WhatsApp test.')
  await verifyWhatsAppPhoneRegistration(credentials)
  const sent = await sendWhatsAppText(credentials, { recipient: to, text: message })
  return { messages: [{ id: sent.providerMessageId }] }
}

async function githubCreatePullRequest(userId, params) {
  const token = await githubToken(userId)
  const repo = String(params.repo || '')
  const files = Array.isArray(params.files) ? params.files : []
  const title = String(params.title || 'AlphaTekx code change').slice(0, 200)
  if (!repo) throw new Error('GitHub pull request requires repo (owner/repo)')
  if (!files.length || files.some(file => !file?.path || typeof file.content !== 'string')) throw new Error('GitHub pull request requires reviewed file paths and complete contents')
  const api = `https://api.github.com/repos/${encodeRepoPath(repo)}`
  const request = async (url, init = {}) => {
    const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', ...(init.headers || {}) } })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.message || `GitHub returned ${response.status}`)
    return data
  }
  const repository = await request(api)
  const base = String(params.base || repository.default_branch || 'main')
  const baseRef = await request(`${api}/git/ref/heads/${encodeURIComponent(base)}`)
  const suffix = randomUUID().slice(0, 8)
  const branch = String(params.branch || `alpha/${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'change'}-${suffix}`)
  await request(`${api}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseRef.object.sha }) })
  for (const file of files) {
    const fileUrl = `${api}/contents/${String(file.path).split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`
    let existingSha = ''
    try { existingSha = (await request(fileUrl)).sha || '' } catch (error) {
      if (!/Not Found/i.test(String(error?.message || ''))) throw error
    }
    await request(fileUrl.replace(/\?ref=.*$/, ''), {
      method: 'PUT',
      body: JSON.stringify({
        message: String(file.message || params.commitMessage || title),
        content: Buffer.from(file.content, 'utf8').toString('base64'),
        branch,
        ...(existingSha ? { sha: existingSha } : {}),
      }),
    })
  }
  const pull = await request(`${api}/pulls`, { method: 'POST', body: JSON.stringify({ title, head: branch, base, body: String(params.body || 'Created by AlphaTekx after explicit approval.'), draft: params.draft !== false }) })
  if (!pull.html_url || !pull.number) throw new Error('GitHub did not return a confirmed pull request')
  return { id: String(pull.number), number: pull.number, url: pull.html_url, branch, base }
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
  const feature = connectorFeatureAccess(user, action?.connector, true)
  if (!feature.enabled && feature.stopExisting) throw new Error(unavailableConnectorMessage(feature.id))
  const start = Date.now()
  const baseLog = `[${action.connector}] ${action.action}`
  const params = action.params || {}
  const stepCost = action._stepCost || 1
  try {
    let result
    if (action.connector === 'gmail' && ['send_email', 'list_messages'].includes(action.action)) {
      const composioResult = await executeProviderWithHealing(user, 'gmail', action.action, {
        ...params,
        approvalId: String(params.approvalId || `automation:${action.action}`),
        idempotencyKey: String(params.idempotencyKey || `automation:${user.id}:${action.action}:${Date.now()}`),
      }, { deferCreditSettlement: true })
      result = { id: composioResult.providerId, providerId: composioResult.providerId, replayed: composioResult.replayed === true }
    }
    switch (action.connector) {
      case 'gmail': {
        if (action.action === 'save_attachments_to_drive') {
          const transfer = await gmailSaveAttachmentsToDrive(user.id, params)
          result = {
            id: transfer.saved[0]?.id,
            savedCount: transfer.saved.length,
            skippedCount: transfer.skipped.length,
            messagesChecked: transfer.messagesChecked,
            files: transfer.saved,
            skipped: transfer.skipped,
            query: transfer.query,
          }
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
      case 'googledocs': {
        if (['create_document', 'get_document', 'update_document'].includes(action.action)) {
          const documentResult = await executeProviderWithHealing(user, 'googledocs', action.action, {
            ...params,
            approvalId: String(params.approvalId || `automation:${action.action}`),
            idempotencyKey: String(params.idempotencyKey || `automation:${user.id}:${action.action}:${Date.now()}`),
          }, { deferCreditSettlement: true })
          result = {
            id: documentResult.providerId,
            providerId: documentResult.providerId,
            replayed: documentResult.replayed === true,
          }
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
        if (action.action === 'create_pull_request') {
          const pull = await githubCreatePullRequest(user.id, params)
          result = { id: pull.id, number: pull.number, url: pull.url, branch: pull.branch, base: pull.base }
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

async function scanCeoSignalsForUser(user) {
  if (!user?.id) return []
  const config = supabaseConfig()
  const created = []
  try {
    const messages = await gmailReadUnreadMessages(user.id, { max: 10, q: 'is:unread in:inbox' })
    if (messages.length) {
      const sourceIds = messages.map(message => message.id).filter(Boolean).sort()
      created.push(await createPendingAction(config, ceoPendingActionsFile, {
        userId: user.id,
        type: 'unread_email',
        title: `${messages.length} unread email${messages.length === 1 ? '' : 's'} need attention`,
        data: { messages: messages.map(message => ({ id: message.id, from: message.from, subject: message.subject })) },
        suggestedAction: 'Review these emails and approve a reply before Alpha sends anything.',
        actions: [],
        sourceKey: `gmail:${createHash('sha256').update(sourceIds.join('|')).digest('hex').slice(0, 24)}`,
      }))
    }
  } catch (error) {
    process.stdout.write(`[ceo-watcher] Gmail scan skipped for ${user.id}: ${error instanceof Error ? error.message : error}\n`)
  }
  const spreadsheetId = String(process.env.CEO_ORDERS_SPREADSHEET_ID || '').trim()
  if (spreadsheetId) {
    try {
      const rows = await googleSheetsReadRows(user.id, { spreadsheetId, range: process.env.CEO_ORDERS_RANGE || 'Sheet1!A:Z' })
      const values = Array.isArray(rows.values) ? rows.values : []
      if (values.length > 1) {
        created.push(await createPendingAction(config, ceoPendingActionsFile, {
          userId: user.id,
          type: 'new_orders',
          title: `${values.length - 1} order row${values.length === 2 ? '' : 's'} detected in Sheets`,
          data: { spreadsheetId, rowCount: values.length - 1 },
          suggestedAction: 'Review the detected orders and choose the customers Alpha should email or message.',
          actions: [],
          sourceKey: `sheets:${spreadsheetId}:${values.length}`,
        }))
      }
    } catch (error) {
      process.stdout.write(`[ceo-watcher] Sheets scan skipped for ${user.id}: ${error instanceof Error ? error.message : error}\n`)
    }
  }
  return created
}

async function supabaseDeleteAgentExecutions(agentId) {
  const c = supabaseConfig()
  const res = await fetch(`${c.url}/rest/v1/agent_executions?agent_id=eq.${encodeURIComponent(agentId)}`, { method: 'DELETE', headers: serviceHeaders(c.service) })
  if (!res.ok) throw new Error('Could not delete agent executions from Supabase')
}

async function supabaseClaimExecution(execution) {
  const c = supabaseConfig()
  const body = JSON.stringify({ id: execution.id, agent_id: execution.agentId, data: execution, created_at: new Date().toISOString() })
  const res = await fetch(`${c.url}/rest/v1/agent_executions`, { method: 'POST', headers: serviceHeaders(c.service), body })
  if (res.status === 409) return false
  if (!res.ok) throw new Error(`Could not claim execution lock (${res.status})`)
  return true
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
  const res = await fetch(`${c.url}/rest/v1/agent_executions?id=eq.${encodeURIComponent(execution.id)}`, { method: 'PATCH', headers: { ...serviceHeaders(c.service), Prefer: 'return=minimal' }, body })
  if (!res.ok) throw new Error('Could not update execution in Supabase')
  return execution
}

function readAgents() { return readJsonFile(agentsFile, []) }
function writeAgents(agents) { writeJsonFile(agentsFile, agents) }

const AGENTS_PROVIDER = 'alphatekx_agents'
const AGENT_EXECUTIONS_PROVIDER = 'alphatekx_agent_executions'

async function authMetadataBundles(config, provider) {
  const res = await fetch(`${config.url}/auth/v1/admin/users?per_page=1000`, { headers: serviceHeaders(config.service) })
  if (!res.ok) throw new Error(`Could not list ${provider} from Supabase Auth metadata`)
  const payload = await res.json()
  const users = Array.isArray(payload) ? payload : (payload.users || [])
  const key = encryptionKey(config)
  return users.map(user => {
    const record = user.app_metadata?.integrations?.[provider]
    if (!record) return null
    return { userId: user.id, email: user.email || record.email || '', tokens: decryptGenericTokens(record.tokens, key) }
  }).filter(Boolean)
}

async function remoteAgentsList(config) {
  const res = await fetch(`${config.url}/rest/v1/connected_accounts?provider=eq.${AGENTS_PROVIDER}&select=*`, { headers: serviceHeaders(config.service) })
  if (res.ok) {
    const rows = await res.json()
    if (Array.isArray(rows) && rows.length) return rows.map(r => ({ userId: r.user_id, email: r.email || '', agents: Array.isArray(r.tokens?.agents) ? r.tokens.agents : [] }))
  }
  const bundles = await authMetadataBundles(config, AGENTS_PROVIDER)
  return bundles.map(bundle => ({ userId: bundle.userId, email: bundle.email, agents: Array.isArray(bundle.tokens?.agents) ? bundle.tokens.agents : [] }))
}

async function remoteAgentsForUser(userId, config) {
  const res = await fetch(`${config.url}/rest/v1/connected_accounts?provider=eq.${AGENTS_PROVIDER}&user_id=eq.${encodeURIComponent(userId)}&select=*`, { headers: serviceHeaders(config.service) })
  if (res.ok) {
    const row = (await res.json())?.[0]
    if (row) return Array.isArray(row.tokens?.agents) ? row.tokens.agents : []
  }
  const record = await getAuthAppIntegration(userId, AGENTS_PROVIDER, config)
  return Array.isArray(record?.tokens?.agents) ? record.tokens.agents : []
}

async function remoteAgentsSaveForUser(userId, email, agents, config) {
  const body = JSON.stringify({ user_id: userId, provider: AGENTS_PROVIDER, email: email || '', identifier: 'agents', scopes: [], tokens: { agents, updated_at: new Date().toISOString() }, updated_at: new Date().toISOString() })
  const res = await fetch(`${config.url}/rest/v1/connected_accounts?on_conflict=user_id,provider`, { method: 'POST', headers: { ...serviceHeaders(config.service), Prefer: 'resolution=merge-duplicates,return=minimal' }, body })
  if (res.ok) return
  const saved = await saveAuthAppIntegration(userId, AGENTS_PROVIDER, { email, identifier: 'agents', scopes: [], tokens: { agents } }, config)
  if (!saved) throw new Error('Could not save agents to durable Supabase Auth metadata')
}

async function remoteExecutionsList(config) {
  const res = await fetch(`${config.url}/rest/v1/connected_accounts?provider=eq.${AGENT_EXECUTIONS_PROVIDER}&select=*`, { headers: serviceHeaders(config.service) })
  if (res.ok) {
    const rows = await res.json()
    if (Array.isArray(rows) && rows.length) return rows.flatMap(row => (Array.isArray(row.tokens?.executions) ? row.tokens.executions : []).map(execution => ({ ...execution, userId: execution.userId || row.user_id })))
  }
  const legacy = await fetch(`${config.url}/rest/v1/user_integrations?provider=eq.${AGENT_EXECUTIONS_PROVIDER}&select=*`, { headers: serviceHeaders(config.service) }).catch(() => null)
  if (legacy?.ok) {
    const key = encryptionKey(config)
    const rows = await legacy.json()
    if (Array.isArray(rows) && rows.length) return rows.flatMap(row => {
      let tokens = {}
      try { tokens = JSON.parse(decryptSecret(row.access_token, key) || '{}') } catch {}
      return (Array.isArray(tokens.executions) ? tokens.executions : []).map(execution => ({ ...execution, userId: execution.userId || row.user_id }))
    })
  }
  const bundles = await authMetadataBundles(config, AGENT_EXECUTIONS_PROVIDER)
  return bundles.flatMap(bundle => (Array.isArray(bundle.tokens?.executions) ? bundle.tokens.executions : []).map(execution => ({ ...execution, userId: execution.userId || bundle.userId })))
}

async function remoteExecutionsForUser(userId, config) {
  const res = await fetch(`${config.url}/rest/v1/connected_accounts?provider=eq.${AGENT_EXECUTIONS_PROVIDER}&user_id=eq.${encodeURIComponent(userId)}&select=*`, { headers: serviceHeaders(config.service) })
  if (res.ok) {
    const row = (await res.json())?.[0]
    if (row) return Array.isArray(row.tokens?.executions) ? row.tokens.executions : []
  }
  const durable = await getUserIntegration(userId, AGENT_EXECUTIONS_PROVIDER, config).catch(() => null)
  if (durable) return Array.isArray(durable.tokens?.executions) ? durable.tokens.executions : []
  const record = await getAuthAppIntegration(userId, AGENT_EXECUTIONS_PROVIDER, config)
  return Array.isArray(record?.tokens?.executions) ? record.tokens.executions : []
}

async function remoteExecutionsSaveForUser(userId, email, executions, config) {
  const durableExecutions = executions.slice(0, 200)
  const tokens = { executions: durableExecutions, updated_at: new Date().toISOString() }
  const body = JSON.stringify({ user_id: userId, provider: AGENT_EXECUTIONS_PROVIDER, email: email || '', scopes: [], tokens, updated_at: new Date().toISOString() })
  const res = await fetch(`${config.url}/rest/v1/connected_accounts?on_conflict=user_id,provider`, { method: 'POST', headers: { ...serviceHeaders(config.service), Prefer: 'resolution=merge-duplicates,return=minimal' }, body })
  if (res.ok) return

  const detail = await res.text().catch(() => '')
  process.stdout.write(`[execution storage] connected_accounts save failed: HTTP ${res.status}${detail ? ` ${detail.slice(0, 240)}` : ''}; trying encrypted integration vault\n`)
  const saved = await saveUserIntegration(userId, AGENT_EXECUTIONS_PROVIDER, {
    email,
    identifier: 'agent-executions',
    scopes: [],
    tokens,
  }, config)
  if (!saved.durable) throw new Error(`Could not save execution history durably (connected_accounts HTTP ${res.status}; encrypted integration vault fallback failed)`)
}

async function executionOwner(execution, config) {
  if (execution.userId) return { id: execution.userId, email: execution.userEmail || '' }
  const agent = await getServerAgent(execution.agentId)
  if (!agent?.userId) throw new Error('Execution has no durable owner')
  return { id: agent.userId, email: agent.userEmail || '' }
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

async function remoteAgentDeleteForUser(agentId, userId, email, config) {
  const agents = await remoteAgentsForUser(userId, config)
  if (!agents.some(agent => agent.id === agentId)) return false
  await remoteAgentsSaveForUser(userId, email, agents.filter(agent => agent.id !== agentId), config)
  return true
}

async function remoteAgentExecutionsDeleteForUser(agentId, userId, email, config) {
  const executions = await remoteExecutionsForUser(userId, config)
  if (!executions.some(execution => execution.agentId === agentId)) return false
  await remoteExecutionsSaveForUser(userId, email, executions.filter(execution => execution.agentId !== agentId), config)
  return true
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
    } catch { /* handled below */ }
    throw new Error('Durable agent persistence is unavailable; refusing to save to ephemeral storage')
  }
  const agents = readAgents()
  const index = agents.findIndex(a => a.id === agent.id)
  if (index >= 0) agents[index] = record
  else agents.unshift(record)
  writeAgents(agents)
  return record
}

async function getServerAgent(id, userId = '') {
  if (useSupabaseAgentDb()) {
    const config = supabaseConfig()
    try {
      const primary = await supabaseGetAgent(id)
      if (primary) return primary
    } catch { /* fall through */ }
    try {
      if (userId) {
        const agents = await remoteAgentsForUser(userId, config)
        const found = agents.find(agent => agent.id === id)
        return found ? { ...found, userId: found.userId || userId } : null
      } else {
        const rows = await remoteAgentsList(config)
        for (const row of rows) {
          const found = row.agents.find(a => a.id === id)
          if (found) return { ...found, userId: row.userId }
        }
      }
    } catch { /* handled below */ }
    throw new Error('Durable agent persistence is unavailable; refusing to read ephemeral storage')
  }
  return readAgents().find(a => a.id === id) || null
}

async function listServerAgents() {
  if (useSupabaseAgentDb()) {
    const config = supabaseConfig()
    let primary = []
    let fallback = []
    let primaryReadable = false
    let fallbackReadable = false
    try {
      primary = await supabaseAgents()
      primaryReadable = true
    } catch { /* merge the owner-scoped durable fallback below */ }
    try {
      const rows = await remoteAgentsList(config)
      fallback = rows.flatMap(row => row.agents.map(agent => ({ ...agent, userId: agent.userId || row.userId })))
      fallbackReadable = true
    } catch { /* use primary when it is available */ }
    if (primaryReadable || fallbackReadable) {
      const merged = new Map()
      for (const agent of [...primary, ...fallback]) {
        if (!agent?.id) continue
        const existing = merged.get(agent.id)
        const existingUpdated = new Date(existing?.updated_at || existing?.updatedAt || existing?.createdAt || 0).getTime()
        const candidateUpdated = new Date(agent.updated_at || agent.updatedAt || agent.createdAt || 0).getTime()
        if (!existing || candidateUpdated >= existingUpdated) merged.set(agent.id, agent)
      }
      return [...merged.values()]
    }
    throw new Error('Durable agent persistence is unavailable; refusing to read ephemeral storage')
  }
  return readAgents()
}

async function deleteServerAgent(id, userId = '', userEmail = '') {
  if (useSupabaseAgentDb()) {
    const config = supabaseConfig()
    let primaryDeleted = false
    let fallbackDeleted = false
    // Execution history is optional/legacy in some production databases. Its
    // absence must not prevent deletion of the actual automation record.
    try { await supabaseDeleteAgentExecutions(id) } catch { /* retain history if unavailable */ }
    try { await supabaseDeleteAgent(id); primaryDeleted = true } catch { /* try durable fallback */ }
    try {
      if (userId) {
        await remoteAgentExecutionsDeleteForUser(id, userId, userEmail, config)
        fallbackDeleted = await remoteAgentDeleteForUser(id, userId, userEmail, config)
      } else {
        fallbackDeleted = await remoteAgentsDelete(id, config)
      }
    } catch {
      if (!primaryDeleted) throw new Error('Durable agent persistence is unavailable; automation was not deleted')
    }
    if (primaryDeleted || fallbackDeleted) return
    throw new Error('Automation was not found in durable storage')
  }
  const agents = readAgents().filter(a => a.id !== id)
  writeAgents(agents)
  writeAgentExecutions(readAgentExecutions().filter(execution => execution.agentId !== id))
}

async function listServerAgentsForUser(userId) {
  if (useSupabaseAgentDb()) {
    const config = supabaseConfig()
    let primary = []
    try {
      const rows = await supabaseAgents()
      primary = rows.filter(agent => agent.userId === userId)
    } catch { /* use the owner-scoped durable fallback */ }
    try {
      const agents = await remoteAgentsForUser(userId, config)
      const merged = new Map(primary.map(agent => [agent.id, agent]))
      for (const agent of agents) if (!merged.has(agent.id)) merged.set(agent.id, { ...agent, userId: agent.userId || userId })
      return [...merged.values()]
    } catch { /* handled below */ }
    if (primary.length) return primary
    throw new Error('Durable agent persistence is unavailable for this account')
  }
  return readAgents().filter(agent => agent.userId === userId)
}

function resumeAgentSchedule(agent, now = new Date()) {
  const trigger = agent.trigger || {}
  if (trigger.type === 'campaign' || trigger.cron === 'campaign') {
    const posts = Array.isArray(agent.campaign?.posts) ? agent.campaign.posts : []
    const pending = posts.filter(post => !['published', 'posted', 'completed'].includes(post.status))
    const dated = pending.filter(post => Number.isFinite(new Date(post.scheduledAt).getTime()))
    const earliest = dated.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))[0]
    if (earliest && new Date(earliest.scheduledAt) <= now) {
      const delta = now.getTime() + 60_000 - new Date(earliest.scheduledAt).getTime()
      for (const post of dated) post.scheduledAt = new Date(new Date(post.scheduledAt).getTime() + delta).toISOString()
    }
    return campaignNextRun(agent.campaign) || new Date(now.getTime() + 60_000).toISOString()
  }
  const timezone = agent.timezone || agent.schedule?.timezone || 'UTC'
  return nextRunFromCronServer(trigger.cron || '0 0 8 * * *', now, timezone).toISOString()
}

async function addServerExecution(execution) {
  if (useSupabaseAgentDb()) {
    try { await supabaseAddExecution(execution); return execution } catch { /* use durable Auth metadata fallback */ }
    const config = supabaseConfig()
    const owner = await executionOwner(execution, config)
    const executions = await remoteExecutionsForUser(owner.id, config)
    await remoteExecutionsSaveForUser(owner.id, owner.email, [execution, ...executions.filter(item => item.id !== execution.id)], config)
    return execution
  }
  const ex = readAgentExecutions()
  ex.unshift(execution)
  writeAgentExecutions(ex)
  return execution
}

async function claimServerExecution(execution) {
  if (useSupabaseAgentDb()) {
    try { return await supabaseClaimExecution(execution) } catch { /* use durable Auth metadata fallback */ }
    const config = supabaseConfig()
    const owner = await executionOwner(execution, config)
    const executions = await remoteExecutionsForUser(owner.id, config)
    if (executions.some(item => item.id === execution.id)) return false
    await remoteExecutionsSaveForUser(owner.id, owner.email, [execution, ...executions], config)
    return true
  }
  const executions = readAgentExecutions()
  if (executions.some(item => item.id === execution.id)) return false
  executions.unshift(execution)
  writeAgentExecutions(executions)
  return true
}

async function getServerExecution(id) {
  if (useSupabaseAgentDb()) {
    try { return await supabaseGetExecution(id) } catch { /* use durable Auth metadata fallback */ }
    return (await remoteExecutionsList(supabaseConfig())).find(execution => execution.id === id) || null
  }
  return readAgentExecutions().find(e => e.id === id) || null
}

async function saveServerExecution(execution) {
  if (useSupabaseAgentDb()) {
    try { await supabaseSaveExecution(execution); return execution } catch { /* use durable Auth metadata fallback */ }
    const config = supabaseConfig()
    const owner = await executionOwner(execution, config)
    const executions = await remoteExecutionsForUser(owner.id, config)
    await remoteExecutionsSaveForUser(owner.id, owner.email, [execution, ...executions.filter(item => item.id !== execution.id)], config)
    return execution
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
    try { return await supabaseAgentExecutions() } catch { return remoteExecutionsList(supabaseConfig()) }
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
    const isAdmin = isAdminAuthUser(user)
    const startingCredits = Number.isFinite(user.credits) ? user.credits : DEFAULT_CREDITS
    users.unshift({ id: user.id, email: user.email, name: user.name || '', plan: user.plan || 'free', credits: startingCredits, freePostsUsed: 0, freePostsLimit: isAdmin ? adminFreePostsLimit : 2, connectors: {}, masterKeysUsed: false, created_at: now, last_active_at: now })
    writeUserCreditsLocal(user.id, startingCredits)
  }
  writeJsonFile(usersFile, users.slice(0, 5000))
}

const adminFreePostsLimit = 999_999
function defaultUser(userId, email = '') {
  const now = new Date().toISOString()
  return { id: userId, email, name: '', plan: 'free', credits: 0, freePostsUsed: 0, freePostsLimit: 2, connectors: {}, masterKeysUsed: false, created_at: now, last_active_at: now }
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
    return merged
  }
  return defaultUser(userId, email)
}

async function resolveExecutionUser(userId, storedEmail = '', authenticatedOwner = null) {
  if (!userId) return null
  if (authenticatedOwner?.id === userId) {
    return { ...(await getUser(userId, authUserEmail(authenticatedOwner))), ...authenticatedOwner, id: userId, email: authUserEmail(authenticatedOwner) }
  }
  const stored = await getUser(userId, storedEmail)
  if (authUserEmail(stored)) return stored
  const config = supabaseConfig()
  if (config.url && config.service) {
    try {
      const response = await fetch(`${config.url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, { headers: serviceHeaders(config.service) })
      if (response.ok) {
        const authOwner = await response.json()
        const verifiedEmail = authUserEmail(authOwner)
        if (verifiedEmail) return { ...stored, ...authOwner, id: userId, email: verifiedEmail }
      }
    } catch {}
  }
  return stored
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

async function whatsappFirstMessageHandler(req, res) {
  const config = supabaseConfig()
  const user = await currentOrLocalUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required.' })
  const access = featureAccessForRequest(req, user, 'whatsapp')
  if (!access.enabled) return json(res, 403, { error: unavailableConnectorMessage('whatsapp'), code: 'FEATURE_COMING_SOON' })
  const body = await readBody(req)
  const credentials = whatsappCredentials()
  const result = await executeApprovedWhatsAppMessage({
    user,
    recipient: body.recipient,
    approved: body.approved === true,
    idempotencyKey: String(body.idempotencyKey || ''),
  }, {
    featureEnabled: access.enabled,
    credentials,
    allowedRecipients: allowedWhatsAppRecipients(),
    isAdmin: access.admin,
    getCredits: () => getUserCredits(user),
    claim: claimServerExecution,
    getExecution: getServerExecution,
    save: saveServerExecution,
    spendCredits: (amount, metadata) => spendUserCredits(user, amount, metadata),
    verifyRegistration: verifyWhatsAppPhoneRegistration,
    send: sendWhatsAppText,
  })
  const statusCode = result.ok ? 200 : result.status === 'awaiting_approval' ? 200 : result.status === 'setup_required' ? 503 : result.status === 'waiting_for_credits' ? 402 : 400
  return json(res, statusCode, result)
}

async function whatsappWebhookHandler(req, res) {
  const credentials = whatsappCredentials()
  if (req.method === 'GET') {
    const url = new URL(req.url || '/', publicAppUrl())
    const valid = url.searchParams.get('hub.mode') === 'subscribe' &&
      credentials.verifyToken &&
      url.searchParams.get('hub.verify_token') === credentials.verifyToken
    if (!valid) return json(res, 403, { error: 'Webhook verification failed.' })
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    return res.end(String(url.searchParams.get('hub.challenge') || ''))
  }
  const raw = await readRawBody(req)
  if (!verifyWhatsAppWebhookSignature(raw, req.headers['x-hub-signature-256'], credentials.appSecret)) return json(res, 401, { error: 'Invalid webhook signature.' })
  let payload
  try { payload = JSON.parse(raw.toString('utf8') || '{}') } catch { return json(res, 400, { error: 'Invalid webhook payload.' }) }
  const events = whatsappWebhookEvents(payload)
  const executions = await listServerExecutions()
  for (const event of events) {
    if (event.type === 'status') {
      const execution = executions.find(item => item.providerMessageId === event.providerMessageId)
      if (!execution) continue
      const applied = applyWhatsAppStatusEvent(execution, event)
      if (applied.changed) await saveServerExecution(applied.execution)
    } else {
      const owner = executions.find(item => item.provider === 'whatsapp' && item.userId)
      if (!owner) continue
      const id = `whatsapp-webhook:${createHash('sha256').update(event.providerMessageId).digest('hex').slice(0, 40)}`
      await claimServerExecution({ id, agentId: 'whatsapp-incoming-test', userId: owner.userId, userEmail: owner.userEmail || '', at: new Date().toISOString(), status: 'received', provider: 'whatsapp', providerMessageId: event.providerMessageId, credits_used: 0, history: [{ status: 'received', at: new Date().toISOString() }] })
    }
  }
  return json(res, 200, { received: true })
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
  const cacheHeaders = ext === '.html'
    ? { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' }
    : { 'Cache-Control': 'public, max-age=31536000, immutable' }
  res.writeHead(200, {
    'Content-Type': types[ext] || 'text/html; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...cacheHeaders,
  })
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

const ELITE_BUILDER_PROMPT = `You are AlphaTekX Builder V3, a senior product engineering system with deep experience shipping reliable products.
Build a complete, production-quality interactive application, not a static mock-up.
Return only one JSX code block containing a single React component named App.
- NO IMPORTS ALLOWED. Return only function App() {...} with no import lines.
- Do not use exports, explanation, script tags, eval, Function constructors, createRoot, ReactDOM, TypeScript types, or external component packages.
- React is already available. Use only React.useState, React.useEffect, React.useRef, React.useMemo, React.useCallback, React.useReducer, and React.useContext.
- For icons use inline SVG or Unicode symbols, never lucide-react or another import.
- Use Tailwind className utilities only. Do not depend on component libraries.
- Make it mobile-first, responsive, accessible, and premium using #0A0A0F, #1A1A23, #7C3AED and #E9E7FF.
- Add realistic data, working interactions, focus states, and useful copy.
- Use inline SVG or text symbols for icons. When imagery helps, use resilient
  https://gen.pollinations.ai/image/{encoded-description}?model=flux&width=1200&height=628&enhance=true&nologo=true
  image URLs with a CSS gradient fallback and an onError handler so a remote
  image failure never breaks the application.
- Landing pages need navigation, hero, proof, features, pricing, FAQ, CTA, and footer.
- Apps need useful navigation, data views, forms, and interactive state.
- Use glass, bento layouts, large typography, a 12-column rhythm, micro-interactions, skeletons, empty states and honest error states.
- Mobile experiences need a real hamburger or bottom sheet, not merely shrinking desktop UI.
- For e-commerce include product grid, cart drawer, checkout mock and order-success state. Never claim a real payment occurred.
- For dashboards include sidebar, stats, CSS charts, table and filters.
- For marketplaces include search, categories, product detail, cart quantity controls, persisted cart, checkout validation, order confirmation, and responsive navigation.
- Every visible button must have a real local interaction or be clearly disabled with explanatory copy.
- For apps that save data, use window.AlphaAPI.get/post/put/del with an entity name. AlphaAPI is the secure project-scoped backend; never embed Supabase keys.
- Do not claim payment, authentication, database, or external API behavior that is not implemented.`

function fallbackEliteComponent(prompt) {
  const contextualFallback = eliteBuilder.contextualFallbackBuilderCode(prompt)
  if (contextualFallback) return contextualFallback
  const subject = String(prompt || 'Your next product').replace(/[<>{}`]/g, '').trim().slice(0, 90) || 'Your next product'
  return `function App() {
  const [email, setEmail] = React.useState('');
  const [joined, setJoined] = React.useState(false);
  const features = [['Built for momentum','A focused experience that moves visitors from curiosity to action.'],['Responsive by default','Every section adapts cleanly from mobile screens to wide desktops.'],['Designed to convert','Clear proof, pricing and calls to action without visual clutter.']];
  return <main className="min-h-screen overflow-hidden bg-[#0A0A0F] text-[#E9E7FF]">
    <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6"><span className="text-sm font-black tracking-[.22em]">ALPHA BUILT</span><button onClick={()=>document.getElementById('join')?.scrollIntoView({behavior:'smooth'})} className="rounded-full bg-[#7C3AED] px-5 py-2.5 text-sm font-black transition hover:-translate-y-0.5">Join early</button></nav>
    <section className="relative mx-auto max-w-6xl px-5 pb-24 pt-16 text-center sm:pt-24"><div className="absolute left-1/2 top-10 h-64 w-64 -translate-x-1/2 rounded-full bg-violet-600/20 blur-3xl"/><p className="relative text-xs font-black uppercase tracking-[.25em] text-violet-300">Designed by AlphaTekX</p><h1 className="relative mx-auto mt-6 max-w-4xl text-4xl font-black leading-[1.02] sm:text-6xl lg:text-7xl">${subject}</h1><p className="relative mx-auto mt-6 max-w-2xl text-base font-semibold leading-7 text-white/60 sm:text-lg">A premium, focused product experience created to help ambitious people launch with confidence.</p><div className="relative mt-9 flex flex-wrap justify-center gap-3"><button onClick={()=>document.getElementById('join')?.scrollIntoView({behavior:'smooth'})} className="rounded-2xl bg-[#7C3AED] px-7 py-4 font-black shadow-2xl shadow-violet-900/30 transition hover:-translate-y-1">Start building</button><button onClick={()=>document.getElementById('features')?.scrollIntoView({behavior:'smooth'})} className="rounded-2xl border border-white/10 bg-white/5 px-7 py-4 font-black transition hover:bg-white/10">Explore features</button></div></section>
    <section id="features" className="mx-auto grid max-w-6xl gap-4 px-5 py-16 md:grid-cols-3">{features.map(([title,copy],index)=><article key={title} className="rounded-3xl border border-white/10 bg-[#1A1A23] p-7 shadow-2xl"><span className="grid size-10 place-items-center rounded-xl bg-violet-500/15 font-black text-violet-300">0{index+1}</span><h2 className="mt-8 text-xl font-black">{title}</h2><p className="mt-3 leading-7 text-white/55">{copy}</p></article>)}</section>
    <section id="join" className="mx-auto max-w-3xl px-5 py-24 text-center"><div className="rounded-[2rem] border border-violet-400/20 bg-gradient-to-br from-violet-600/20 to-cyan-400/5 p-7 sm:p-12"><h2 className="text-3xl font-black">Ready when you are.</h2><p className="mt-3 text-white/60">Join the early list and be first to experience what comes next.</p>{joined?<p className="mt-7 rounded-2xl bg-emerald-400/10 p-4 font-bold text-emerald-300">You are on the list. Welcome.</p>:<form onSubmit={event=>{event.preventDefault();if(email.includes('@'))setJoined(true)}} className="mx-auto mt-7 flex max-w-lg flex-col gap-3 sm:flex-row"><input required type="email" value={email} onChange={event=>setEmail(event.target.value)} placeholder="you@company.com" className="min-h-12 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 text-white outline-none focus:border-violet-400"/><button className="min-h-12 rounded-xl bg-white px-6 font-black text-[#0A0A0F]">Join waitlist</button></form>}</div></section>
  </main>;
}`
}

function verifiedBuilderCompletion(content, provider) {
  const result = eliteBuilder.validateBuilderCode(extractAppComponent(content || ''))
  if (result.errors.length) throw new Error(result.errors.join(' '))
  return { code: result.code, provider }
}

function extractAppComponent(value) {
  const source = String(value || '').replace(/```(?:jsx|tsx|javascript|js)?/gi, '').replace(/```/g, '').trim()
  const start = source.search(/\bfunction\s+App\s*\(/)
  if (start < 0) return source
  const open = source.indexOf('{', start)
  if (open < 0) return source
  let depth = 0
  let quote = ''
  let escaped = false
  let lineComment = false
  let blockComment = false
  for (let index = open; index < source.length; index += 1) {
    const char = source[index]
    const next = source[index + 1]
    if (lineComment) {
      if (char === '\n') lineComment = false
      continue
    }
    if (blockComment) {
      if (char === '*' && next === '/') { blockComment = false; index += 1 }
      continue
    }
    if (quote) {
      if (escaped) { escaped = false; continue }
      if (char === '\\') { escaped = true; continue }
      if (char === quote) quote = ''
      continue
    }
    if (char === '/' && next === '/') { lineComment = true; index += 1; continue }
    if (char === '/' && next === '*') { blockComment = true; index += 1; continue }
    if (char === "'" || char === '"' || char === '`') { quote = char; continue }
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, index + 1)
    }
  }
  return source
}

function parseGradioCompletion(eventStream) {
  const blocks = String(eventStream || '').split(/\r?\n\r?\n/)
  const complete = blocks.find(block => /^event:\s*complete\s*$/m.test(block))
  if (!complete) {
    const failed = blocks.find(block => /^event:\s*(?:error|unexpected_error)\s*$/m.test(block))
    if (failed) {
      const dataLine = failed.split(/\r?\n/).find(line => line.startsWith('data:'))
      try {
        const payload = JSON.parse(String(dataLine || '').slice(5).trim())
        throw new Error(String(payload?.title || payload?.error || 'AlphaTekX Coder reported a generation error.'))
      } catch (error) {
        if (error instanceof SyntaxError) throw new Error('AlphaTekX Coder reported a generation error.')
        throw error
      }
    }
    throw new Error('AlphaTekX Coder did not finish in time.')
  }
  const dataLine = complete.split(/\r?\n/).find(line => line.startsWith('data:'))
  if (!dataLine) throw new Error('AlphaTekX Coder returned an empty completion.')
  const payload = JSON.parse(dataLine.slice(5).trim())
  return Array.isArray(payload) ? payload[0] : payload
}

async function alphatekxCoderCompletion(messages) {
  const configured = String(process.env.BUILDER_GRADIO_URL || 'https://alpha4-44-alphatekx-coder-api2.hf.space').trim()
  const base = new URL(configured)
  if (base.protocol !== 'https:') throw new Error('BUILDER_GRADIO_URL must use HTTPS.')
  const huggingFaceToken = firstKey('HUGGINGFACE_TOKEN', 'HF_TOKEN')
  const authorizationHeaders = huggingFaceToken ? { Authorization: `Bearer ${huggingFaceToken}` } : {}
  // The Space already owns its elite system prompt. Send only the build
  // request; duplicating AlphaTekX's server prompt wastes ZeroGPU time and
  // reduces the tokens available for the generated application.
  const prompt = String([...messages].reverse().find(message => message.role === 'user')?.content || 'Build a production-quality application')
  const started = Date.now()
  const submission = await fetchJson(`${base.origin}/gradio_api/call/generate`, {
    method: 'POST',
    headers: { ...authorizationHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: [prompt] }),
  }, 4_000)
  if (!submission?.event_id) throw new Error('AlphaTekX Coder did not issue a generation job.')
  const remaining = Math.max(1_000, 25_000 - (Date.now() - started))
  const events = await fetchText(`${base.origin}/gradio_api/call/generate/${encodeURIComponent(submission.event_id)}`, {
    headers: { ...authorizationHeaders, Accept: 'text/event-stream' },
  }, remaining)
  return verifiedBuilderCompletion(parseGradioCompletion(events), 'alphatekx-coder')
}

async function freeBuilderCompletion(messages) {
  let lastError = null
  try {
    return await alphatekxCoderCompletion(messages)
  } catch (error) {
    lastError = error
    console.error('[Elite Builder] AlphaTekX Coder failed:', error instanceof Error ? error.message : error)
  }

  const groqKey = firstKey('GROQ_API_KEY')
  if (groqKey) {
    try {
      const payload = await fetchJson('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.GROQ_BUILDER_MODEL || 'openai/gpt-oss-120b',
          messages,
          temperature: 0.7,
          max_tokens: 6000,
        }),
      }, 6_000)
      return verifiedBuilderCompletion(payload?.choices?.[0]?.message?.content, 'groq')
    } catch (error) {
      lastError = error
      console.error('[Elite Builder] Groq failed:', error instanceof Error ? error.message : error)
    }
  }

  throw lastError || new Error('No hosted Builder provider is configured.')
}

async function generateEliteCode(prompt) {
  const messages = [{ role: 'system', content: ELITE_BUILDER_PROMPT }, { role: 'user', content: `Build this now at production-quality visual standards: ${prompt}` }]
  try {
    return await freeBuilderCompletion(messages)
  } catch (error) {
    console.error('[Elite Builder] hosted providers unavailable:', error instanceof Error ? error.message : error)
  }
  const fallback = eliteBuilder.validateBuilderCode(fallbackEliteComponent(prompt))
  if (fallback.errors.length) throw new Error('Alpha could not produce a verified build.')
  return { code: fallback.code, provider: 'alpha-fallback' }
}

async function generateEliteRevision(currentCode, instruction, error = '') {
  const task = error
    ? `The existing app failed with this runtime error: ${error}. Repair the root cause and preserve every working feature.`
    : `Edit the existing app exactly as requested: ${instruction}. Preserve every feature the user did not ask to change.`
  const messages = [
    { role: 'system', content: `${ELITE_BUILDER_PROMPT}\nYou are editing existing verified code. Return the complete corrected App component only.` },
    { role: 'user', content: `${task}\n\nEXISTING CODE:\n${currentCode}` },
  ]
  try {
    return await freeBuilderCompletion(messages)
  } catch (providerError) {
    console.error('[Elite Builder edit] hosted providers unavailable:', providerError instanceof Error ? providerError.message : providerError)
  }
  throw new Error('Alpha could not produce a verified edit. Your current build was preserved.')
}

async function builderRevisionHandler(req, res, fixing = false) {
  const config = supabaseConfig()
  const user = await currentOrLocalUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required.' })
  const body = await readBody(req)
  const project = await eliteBuilder.getOwnerProject(config, user, String(body.projectId || ''))
  if (!project) return json(res, 404, { error: 'This build could not be found.' })
  const instruction = String(body.instruction || '').trim()
  const runtimeError = String(body.error || '').trim().slice(0, 1500)
  if (!fixing && instruction.length < 3) return json(res, 400, { error: 'Tell Alpha what should change.' })
  if (fixing && !runtimeError) return json(res, 400, { error: 'A runtime error is required for auto-repair.' })
  try {
    const revised = await generateEliteRevision(project.code, instruction, runtimeError)
    const updated = await eliteBuilder.updateProjectCode(config, user, project.id, revised.code, `${revised.provider}-${fixing ? 'auto-fix' : 'edit'}`)
    return json(res, 200, { project: updated, code: revised.code, provider: revised.provider })
  } catch (error) { return json(res, 503, { error: error instanceof Error ? error.message : 'Alpha could not verify this edit.' }) }
}

async function builderDomainHandler(req, res) {
  const config = supabaseConfig()
  const user = await currentOrLocalUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required.' })
  try {
    const body = await readBody(req)
    return json(res, 200, await eliteBuilder.requestCustomDomain(config, user, body.projectId, body.domain, `alphatekx-${randomUUID()}`))
  } catch (error) { return json(res, Number(error?.status) || 503, { error: error instanceof Error ? error.message : 'Custom domain setup could not start.' }) }
}

async function builderGenerateHandler(req, res) {
  const config = supabaseConfig()
  const user = await currentOrLocalUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required.' })
  const body = await readBody(req)
  const prompt = String(body.prompt || '').trim()
  const requestId = String(body.requestId || randomUUID()).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80)
  if (prompt.length < 8) return json(res, 400, { error: 'Describe what you want Alpha to build in a little more detail.' })
  if (prompt.length > 6000) return json(res, 413, { error: 'Keep the build description under 6,000 characters.' })
  const existing = await eliteBuilder.findProjectByRequest(config, user, requestId).catch(() => null)
  if (existing?.charged) {
    const balance = isAdminAuthUser(user) ? null : await billing.getUserCredits(user, config)
    return json(res, 200, { project: existing, code: existing.code, provider: existing.provider, credits: balance, duplicate: true })
  }
  let project = null
  try {
    const generated = await generateEliteCode(prompt)
    const title = prompt.replace(/^(build|create|make|design)\s+(me\s+)?/i, '').split(/[.!?\n]/)[0].trim().slice(0, 72) || 'Untitled build'
    if (existing?.id) await eliteBuilder.deleteProject(config, user, existing.id).catch(() => {})
    try {
      project = await eliteBuilder.saveGeneratedProject(config, user, { title, prompt, code: generated.code, provider: generated.provider, requestId })
    } catch (storageError) {
      console.error('[Elite Builder] verified preview could not persist:', storageError instanceof Error ? storageError.message : storageError)
      const transient = eliteBuilder.transientBuilderProject({ title, prompt, code: generated.code, provider: generated.provider })
      const balance = isAdminAuthUser(user) ? null : await billing.getUserCredits(user, config).catch(() => null)
      return json(res, 200, {
        project: transient,
        code: generated.code,
        provider: generated.provider,
        credits: Number.isFinite(balance) ? balance : null,
        persisted: false,
        charged: false,
        storageWarning: 'Preview is ready, but Builder storage is unavailable. Nothing was charged. Deployment and editing require the Builder database.',
      })
    }
    project = await eliteBuilder.markProjectCharged(config, user, project.id)
    const balance = isAdminAuthUser(user) ? null : await billing.getUserCredits(user, config).catch(() => null)
    return json(res, 200, { project, code: generated.code, provider: generated.provider, credits: Number.isFinite(balance) ? balance : null, persisted: true, charged: false })
  } catch (error) {
    if (project?.id) await eliteBuilder.deleteProject(config, user, project.id).catch(() => {})
    return json(res, 503, { error: error instanceof Error ? error.message : 'Alpha is resting. Retry this build in a moment.' })
  }
}

async function builderProjectsHandler(req, res) {
  const config = supabaseConfig()
  const user = await currentOrLocalUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required.' })
  try { return json(res, 200, { projects: await eliteBuilder.listProjects(config, user) }) }
  catch (error) { return json(res, 503, { error: error instanceof Error ? error.message : 'Builder history could not load.' }) }
}

async function builderDeployHandler(req, res) {
  const config = supabaseConfig()
  const user = await currentOrLocalUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required.' })
  try { return json(res, 200, await eliteBuilder.deployProject(config, user, await readBody(req), publicAppUrl())) }
  catch (error) { return json(res, Number(error?.status) || 503, { error: error instanceof Error ? error.message : 'Deployment could not be completed.' }) }
}

async function builderPublicHandler(req, res, slug) {
  try {
    const project = await eliteBuilder.getPublicProject(supabaseConfig(), slug)
    if (!project) return json(res, 404, { error: 'This AlphaTekX build is not published.' })
    return json(res, 200, { project })
  } catch (error) { return json(res, 503, { error: error instanceof Error ? error.message : 'Published build could not load.' }) }
}

const rateLimitMap = new Map()
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 60
const SENSITIVE_PATHS = ['/api/alpha', '/api/brain', '/api/credits', '/api/agents', '/api/alpha/mission', '/api/previews/', '/api/creations/publish', '/api/integrations/', '/api/verify-bonus', '/api/builder/']
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
  try {
  if (isRateLimited(req)) return json(res, 429, { error: 'Too many requests. Please slow down.' })
  if (req.method === 'OPTIONS') return json(res, 204, {})
  if (String(req.url || '').startsWith('/api/')) await refreshFeatureConfig(supabaseConfig()).catch(() => {})
  if (req.method === 'POST' && req.url === '/api/builder/generate') return builderGenerateHandler(req, res)
  if (req.method === 'POST' && req.url === '/api/builder/edit') return builderRevisionHandler(req, res, false)
  if (req.method === 'POST' && req.url === '/api/builder/fix') return builderRevisionHandler(req, res, true)
  if (req.method === 'GET' && req.url === '/api/builder/projects') return builderProjectsHandler(req, res)
  if (req.method === 'POST' && req.url === '/api/builder/deploy') return builderDeployHandler(req, res)
  if (req.method === 'POST' && req.url === '/api/builder/domain') return builderDomainHandler(req, res)
  if (req.method === 'GET' && /^\/api\/builder\/public\/[a-z0-9-]+$/.test(req.url || '')) {
    return builderPublicHandler(req, res, decodeURIComponent(String(req.url).split('/').pop() || ''))
  }
  if ((req.method === 'GET' || req.method === 'POST') && String(req.url || '').startsWith('/api/connectors/whatsapp/webhook')) {
    try { return await whatsappWebhookHandler(req, res) } catch { return json(res, 500, { error: 'WhatsApp could not process this webhook.' }) }
  }
  if (req.method === 'POST' && req.url === '/api/connectors/whatsapp/test-message') {
    try { return await whatsappFirstMessageHandler(req, res) } catch { return json(res, 500, { error: 'WhatsApp could not process this test message. No credits were charged.' }) }
  }
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
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      const body = await readBody(req)
      const connector = String(body.platform || body.provider || body.connector || '')
      if (!requireConnectorFeature(req, res, user, connector)) return
      req.alphaBody = body
      return await saveConnectorHandler(req, res)
    } catch (error) { return json(res, 400, { error: error instanceof Error ? error.message : 'Could not save connector' }) }
  }
  if (req.method === 'GET' && req.url === '/api/ceo/pending') {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      return json(res, 200, { actions: await listPendingActions(config, ceoPendingActionsFile, user.id) })
    } catch (error) { return json(res, 503, { error: error instanceof Error ? error.message : 'CEO Inbox could not load' }) }
  }
  if (req.method === 'POST' && req.url === '/api/ceo/events') {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      const body = await readBody(req)
      const type = String(body.type || '')
      if (!['new_orders', 'unread_email', 'discord_mention'].includes(type)) return json(res, 400, { error: 'Unsupported CEO signal type' })
      const allowed = {
        gmail: new Set(['send_email']),
        whatsapp: new Set(['send_message', 'send_template']),
        discord: new Set(['send_message']),
      }
      const actions = (Array.isArray(body.actions) ? body.actions : []).map(action => ({
        provider: String(action.provider || ''),
        action: String(action.action || ''),
        params: action.params && typeof action.params === 'object' ? action.params : {},
      })).filter(action => allowed[action.provider]?.has(action.action))
      const pending = await createPendingAction(config, ceoPendingActionsFile, {
        userId: user.id,
        type,
        title: String(body.title || (type === 'new_orders' ? 'New orders need attention' : type === 'unread_email' ? 'Unread customer email needs attention' : 'Discord mention needs attention')),
        data: body.data || {},
        suggestedAction: String(body.suggestedAction || 'Review this signal and approve the suggested response.'),
        actions,
        sourceKey: String(body.sourceKey || `${type}:${createHash('sha256').update(JSON.stringify(body.data || {})).digest('hex').slice(0, 24)}`),
      })
      return json(res, 201, { action: pending })
    } catch (error) { return json(res, 503, { error: error instanceof Error ? error.message : 'CEO signal could not be saved' }) }
  }
  const ceoActionMatch = new URL(req.url || '/', 'http://localhost').pathname.match(/^\/api\/ceo\/actions\/([^/]+)\/(approve|reject)$/)
  if (req.method === 'POST' && ceoActionMatch) {
    const config = supabaseConfig()
    const user = await currentOrLocalUser(req, config.url, config.anon)
    if (!user) return json(res, 401, { error: 'Authentication required' })
    const [, actionId, decision] = ceoActionMatch
    try {
      const claimed = await claimPendingAction(config, ceoPendingActionsFile, user.id, actionId)
      if (decision === 'reject') {
        const rejected = await finishPendingAction(config, ceoPendingActionsFile, user.id, actionId, 'rejected')
        return json(res, 200, { action: rejected })
      }
      const results = []
      for (let index = 0; index < claimed.actions.length; index += 1) {
        const action = claimed.actions[index]
        results.push(await executeProviderWithHealing(user, action.provider, action.action, {
          ...(action.params || {}),
          approvalId: claimed.id,
          idempotencyKey: `ceo:${claimed.id}:${index}`,
        }))
      }
      const approved = await finishPendingAction(config, ceoPendingActionsFile, user.id, actionId, 'approved', { result: { executions: results } })
      return json(res, 200, { action: approved })
    } catch (error) {
      await finishPendingAction(config, ceoPendingActionsFile, user.id, actionId, 'failed', { error: error instanceof Error ? error.message : 'Execution failed' }).catch(() => {})
      return json(res, 502, { error: error instanceof Error ? error.message : 'CEO action failed', charged: false })
    }
  }
  if (req.method === 'POST' && req.url === '/api/auth/repair-oversized-session') {
    try { return await repairOversizedAuthSession(req, res) } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Session repair failed' }) }
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
  if (req.method === 'GET' && req.url === '/api/linkedin/auth') {
    try { return await startLinkedInOAuth(req, res) } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'LinkedIn auth failed' }) }
  }
  if (req.method === 'POST' && req.url === '/api/linkedin/auth') {
    try { return await startLinkedInConnection(req, res) } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'LinkedIn auth failed' }) }
  }
  if (req.method === 'GET' && req.url?.startsWith('/api/linkedin/callback')) {
    try { return await linkedinCallback(req, res) } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'LinkedIn callback failed' }) }
  }
  if ((req.method === 'GET' || req.method === 'POST') && req.url === '/api/x/auth') {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      const result = await alphaConnector.startConnection(user, 'x', `${getRequestOrigin(req)}/api/connect/callback?provider=x`)
      return json(res, 200, { url: result.authUrl, ...result })
    } catch (error) {
      return json(res, 502, { error: error instanceof Error ? error.message : 'X connection failed through Composio' })
    }
  }
  if (req.method === 'GET' && req.url?.startsWith('/api/x/callback')) {
    try { return await xCallback(req, res) } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'X callback failed' }) }
  }
  if (req.method === 'POST' && req.url === '/api/connectors/facebook/start') {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      if (!requireConnectorFeature(req, res, user, 'facebook')) return
      return await startFacebookConnection(req, res)
    } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Facebook auth failed' }) }
  }
  if (req.method === 'GET' && req.url?.startsWith('/api/connectors/facebook/callback')) {
    try { return await facebookCallback(req, res) } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Facebook callback failed' }) }
  }
  if (req.method === 'GET' && req.url === '/api/connectors/facebook/pages') {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      if (!requireConnectorFeature(req, res, user, 'facebook')) return
      return await listFacebookPages(req, res)
    } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Could not load Facebook Pages' }) }
  }
  if (req.method === 'POST' && req.url === '/api/connectors/facebook/select-page') {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      if (!requireConnectorFeature(req, res, user, 'facebook')) return
      return await selectFacebookPage(req, res)
    } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Could not select Facebook Page' }) }
  }
  if (req.method === 'GET' && req.url?.startsWith('/api/composio/callback')) {
    // Custom OAuth apps may whitelist the AlphaTekx domain while Composio still
    // needs to receive the authorization code. Keep this endpoint as a transparent
    // browser redirect: AlphaTekx never reads or stores the provider token.
    const incoming = new URL(req.url, publicAppUrl())
    const destination = new URL('https://backend.composio.dev/api/v3.1/toolkits/auth/callback')
    for (const [key, value] of incoming.searchParams) destination.searchParams.append(key, value)
    res.writeHead(302, {
      Location: destination.toString(),
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    })
    return res.end()
  }
  if (req.url === '/api/composio/status' && (req.method === 'GET' || req.method === 'POST')) {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      const result = await alphaConnector.getConnectedApps(user)
      const status = { youtube: false, instagram: false, x: false, facebook: false, whatsapp: false }
      const connections = result.providers.map(provider => {
        const key = provider.provider === 'twitter' ? 'x' : provider.provider
        if (key in status) status[key] = provider.connected === true
        return { platform: key, connected: provider.connected === true, connectionId: provider.connectionId || null, status: provider.status }
      })
      return json(res, 200, { ...status, connections })
    } catch (error) { return json(res, 502, { error: error instanceof Error ? error.message : 'Composio status failed' }) }
  }
  if (req.url === '/api/composio/execute' && req.method === 'POST') {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      const body = await readBody(req)
      const idempotencyKey = String(body.idempotency_key || body.idempotencyKey || '').trim()
      const approvalId = String(body.approval_id || body.approvalId || '').trim()
      if (!idempotencyKey) return json(res, 400, { error: 'Idempotency key is required', code: 'IDEMPOTENCY_REQUIRED' })
      if (!approvalId) return json(res, 400, { error: 'Explicit approval is required', code: 'APPROVAL_REQUIRED' })
      const result = await executeProviderWithHealing(user, body.platform, body.action, {
        ...(body.params || {}), idempotencyKey, approvalId,
      })
      return json(res, 200, {
        success: true,
        provider_id: result.providerId,
        credits_charged: result.creditsCharged,
        balance: result.balance,
        execution_id: result.executionId,
        result: result.result,
      })
    } catch (error) {
      const code = error?.code || (/insufficient credits/i.test(String(error?.message || '')) ? 'INSUFFICIENT_CREDITS' : 'EXECUTION_FAILED')
      const status = code === 'INSUFFICIENT_CREDITS' ? 402 : code === 'RECONNECT_NEEDED' ? 409 : 502
      return json(res, status, { error: error instanceof Error ? error.message : 'Execution failed', code, charged: false })
    }
  }
  if (req.url === '/api/media/status' && req.method === 'GET') {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      return json(res, 200, await mediaLibrary.mediaSetupStatus(config))
    } catch (error) {
      return json(res, 503, {
        activated: false,
        tableReady: false,
        bucketReady: false,
        error: error instanceof Error ? error.message : 'Media Library readiness check failed.',
      })
    }
  }
  if (req.url === '/api/media/list' && req.method === 'GET') {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      return json(res, 200, { items: await mediaLibrary.listMedia(config, user), setupRequired: false })
    } catch (error) {
      if (mediaLibrary.isMissingMediaSchema(error)) {
        return json(res, 200, {
          items: [],
          setupRequired: true,
          setup: error?.setup || await mediaLibrary.mediaSetupStatus(supabaseConfig()),
        })
      }
      const code = error?.code || 'MEDIA_ERROR'
      return json(res, code === 'DB_ERROR' ? 503 : 500, { error: error instanceof Error ? error.message : 'Could not load Media Library.', code })
    }
  }
  if (String(req.url || '').startsWith('/api/money-loop/leads') && req.method === 'GET') {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      const url = new URL(req.url, 'http://localhost')
      return json(res, 200, { leads: await moneyLoop.listLeads(config, user, { status: url.searchParams.get('status') || '', limit: url.searchParams.get('limit') || 100 }) })
    } catch (error) {
      if (moneyLoop.isMissingMoneyLoopSchema(error)) return json(res, 200, { leads: [], setupRequired: true })
      const code = error?.code || 'MONEY_LOOP_ERROR'
      return json(res, code === 'DB_ERROR' ? 503 : 400, { error: error instanceof Error ? error.message : 'Could not load leads.', code })
    }
  }
  if (req.url === '/api/money-loop/stats' && req.method === 'GET') {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      const [stats, insights] = await Promise.all([moneyLoop.getMoneyLoopStats(config, user), moneyLoop.listInsights(config, user)])
      return json(res, 200, { stats, insights })
    } catch (error) {
      if (moneyLoop.isMissingMoneyLoopSchema(error)) return json(res, 200, {
        stats: { total: 0, new: 0, contacted: 0, qualified: 0, closed: 0, lost: 0, estimatedValue: 0, closedValue: 0 },
        insights: [],
        setupRequired: true,
      })
      const code = error?.code || 'MONEY_LOOP_ERROR'
      return json(res, code === 'DB_ERROR' ? 503 : 400, { error: error instanceof Error ? error.message : 'Could not load Money Loop stats.', code })
    }
  }
  if (/^\/api\/money-loop\/leads\/[0-9a-f-]+$/i.test(req.url || '') && req.method === 'PATCH') {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      const leadId = String(req.url).split('/').pop()
      return json(res, 200, { lead: await moneyLoop.updateLead(config, user, leadId, await readBody(req)) })
    } catch (error) {
      const code = error?.code || 'MONEY_LOOP_ERROR'
      return json(res, code === 'DB_ERROR' ? 503 : 400, { error: error instanceof Error ? error.message : 'Could not update lead.', code })
    }
  }
  if (req.url === '/api/media/upload' && req.method === 'POST') {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      return json(res, 201, { item: await mediaLibrary.uploadMedia(config, user, req) })
    } catch (error) {
      const code = error?.code || 'MEDIA_ERROR'
      return json(res, code === 'INVALID_MEDIA' ? 400 : code === 'DB_ERROR' ? 503 : 500, { error: error instanceof Error ? error.message : 'Upload failed.', code })
    }
  }
  if (req.url === '/api/media/smart-image' && req.method === 'POST') {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      const body = await readBody(req)
      const content = String(body.content || '').trim()
      if (content.length < 10) return json(res, 400, { error: 'Add more detail so Alpha can select a relevant image.', code: 'INVALID_CONTENT' })
      return json(res, 200, await mediaLibrary.findSmartImage(
        config,
        user,
        content,
        String(body.objective || ''),
        String(body.platform || ''),
      ))
    } catch (error) {
      const code = error?.code || 'IMAGE_PROVIDER_ERROR'
      return json(res, code === 'DB_ERROR' ? 503 : 502, { error: error instanceof Error ? error.message : 'Alpha could not prepare an image.', code })
    }
  }
  if (req.url === '/api/media/generate-video' && req.method === 'POST') {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      if (!isAdminAuthUser(user)) {
        const billingSummary = await billing.getUserBilling(user, config)
        if (!billingSummary || billingSummary.plan === 'free' || Number(billingSummary.monthlyCredits || 0) <= 0) {
          return json(res, 402, { error: 'Video generation requires a paid monthly plan. Upgrade your plan to continue.', code: 'VIDEO_SUBSCRIPTION_REQUIRED' })
        }
      }
      const body = await readBody(req)
      return json(res, 201, await mediaLibrary.generateVideo(config, user, body.prompt, {
        duration: body.duration,
        aspectRatio: body.aspectRatio,
      }))
    } catch (error) {
      const code = error?.code || 'VIDEO_PROVIDER_ERROR'
      const status = code === 'INVALID_CONTENT' ? 400 : code === 'VIDEO_PROVIDER_NOT_CONFIGURED' ? 503 : code === 'DB_ERROR' ? 503 : 502
      return json(res, status, { error: error instanceof Error ? error.message : 'Alpha could not generate a verified video.', code, charged: false })
    }
  }
  if (/^\/api\/media\/[0-9a-f-]+$/i.test(req.url || '') && ['PATCH', 'DELETE'].includes(req.method || '')) {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      const id = String(req.url).split('/').pop()
      if (req.method === 'DELETE') return json(res, 200, await mediaLibrary.deleteMedia(config, user, id))
      return json(res, 200, { item: await mediaLibrary.updateMedia(config, user, id, await readBody(req)) })
    } catch (error) {
      const code = error?.code || 'MEDIA_ERROR'
      return json(res, code === 'DB_ERROR' ? 503 : 400, { error: error instanceof Error ? error.message : 'Could not update media.', code })
    }
  }
  if (/^\/api\/media\/[0-9a-f-]+\/publish$/i.test(req.url || '') && req.method === 'POST') {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      const id = String(req.url).split('/').at(-2)
      return json(res, 200, await mediaLibrary.publishMediaNow(config, user, id, executeProviderWithHealing))
    } catch (error) {
      const code = error?.code || (/insufficient credits/i.test(String(error?.message || '')) ? 'INSUFFICIENT_CREDITS' : 'MEDIA_PUBLISH_FAILED')
      const status = code === 'INSUFFICIENT_CREDITS' ? 402 : code === 'RECONNECT_NEEDED' ? 409 : code === 'DB_ERROR' ? 503 : 502
      return json(res, status, { error: error instanceof Error ? error.message : 'Video publication failed.', code, charged: false })
    }
  }
  if (/^\/api\/media\/[0-9a-f-]+\/preview$/i.test(req.url || '') && req.method === 'GET') {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      const id = String(req.url).split('/').at(-2)
      return json(res, 200, await mediaLibrary.previewMedia(config, user, id, 3600))
    } catch (error) {
      const code = error?.code || 'MEDIA_PREVIEW_FAILED'
      return json(res, code === 'DB_ERROR' ? 503 : 404, { error: error instanceof Error ? error.message : 'Preview could not be opened.', code })
    }
  }
  if (req.url === '/api/connected-apps' && req.method === 'GET') {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      const result = await alphaConnector.getConnectedApps(user)
      const linkedin = await linkedInConnectedAppStatus(user, config)
      const publicProviders = new Set(['gmail', 'github', 'googledocs', 'googlesheets', 'discord'])
      result.providers = [linkedin, ...(result.providers || []).filter(provider => publicProviders.has(provider.provider))]
      return json(res, 200, result)
    } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Failed to list connected apps' }) }
  }
  if (req.url === '/api/composio/toolkits' && req.method === 'GET') {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      const result = await alphaConnector.getConnectedApps(user)
      const publicProviders = new Set(['gmail', 'github', 'googledocs', 'googlesheets', 'discord'])
      return json(res, 200, { toolkits: result.providers
        .filter(({ provider }) => publicProviders.has(provider))
        .map(({ provider, name, category, enabled, connected, connectionCount, authMode, status }) => ({ id: provider, name, category, enabled, connected, connectionCount, authMode, status })) })
    } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Could not list toolkits' }) }
  }
  if (req.method === 'POST' && /^\/api\/(tiktok|snapchat)\/auth$/.test(req.url || '')) {
    return startCustomOAuth(req, res, String(req.url).split('/')[2])
  }
  if (req.method === 'GET' && /^\/api\/(tiktok|snapchat)\/callback(?:\?|$)/.test(req.url || '')) {
    return customOAuthCallback(req, res, String(req.url).split('/')[2])
  }
  const platformAuthMatch = req.method === 'POST'
    ? new URL(req.url || '/', 'http://localhost').pathname.match(/^\/api\/auth\/([^/]+)\/?$/)
    : null
  if (platformAuthMatch) {
    const toolkit = platformAuthMatch[1].toLowerCase()
    if (toolkit === 'linkedin') {
      try { return await startLinkedInConnection(req, res) }
      catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'LinkedIn auth failed' }) }
    }
    const publicManagedProviders = new Set(['gmail', 'github', 'googledocs', 'googlesheets', 'discord'])
    if (!publicManagedProviders.has(toolkit)) return json(res, 404, { error: 'This connection is not available.' })
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      if (!requireConnectorFeature(req, res, user, toolkit)) return
      const body = await readBody(req)
      const requestedReturnTo = String(body.returnTo || '').trim()
      const safeReturnTo = requestedReturnTo.startsWith('/') && !requestedReturnTo.startsWith('//')
        ? requestedReturnTo
        : '/dashboard'
      const callbackUrl = new URL('/connected-apps', publicAppUrl())
      callbackUrl.searchParams.set('provider', toolkit)
      callbackUrl.searchParams.set('connected', 'checking')
      callbackUrl.searchParams.set('returnTo', safeReturnTo)
      return json(res, 200, await alphaConnector.startConnection(user, toolkit, callbackUrl.toString()))
    } catch (error) {
      return json(res, 502, { error: error instanceof Error ? error.message : 'Connection failed' })
    }
  }
  if (req.url?.startsWith('/api/connectors/')) {
    const url = new URL(req.url, 'http://localhost')
    const match = url.pathname.match(/^\/api\/connectors\/([^/]+)\/(connect|status|callback|test)\/?$/)
    const deleteMatch = url.pathname.match(/^\/api\/connectors\/([^/]+)\/?$/)
    if (match || (deleteMatch && req.method === 'DELETE')) {
      const toolkit = (match || deleteMatch)[1]
      try {
        const operation = match?.[2]
        if (operation === 'callback' && req.method === 'GET') {
          const redirectUrl = new URL('/connected-apps', publicAppUrl())
          redirectUrl.searchParams.set('provider', toolkit)
          redirectUrl.searchParams.set('connected', 'checking')
          res.writeHead(302, { Location: redirectUrl.toString(), 'Cache-Control': 'no-store' })
          return res.end()
        }
        const config = supabaseConfig()
        const user = await currentOrLocalUser(req, config.url, config.anon)
        if (!user) return json(res, 401, { error: 'Authentication required' })
        if (deleteMatch && req.method === 'DELETE') {
          if (toolkit === 'linkedin') {
            await deleteUserIntegration(user.id, 'linkedin', config)
            const verified = await getUserIntegration(user.id, 'linkedin', config).catch(() => null)
            if (verified) return json(res, 503, { error: 'LinkedIn disconnect could not be verified. The saved connection was preserved for investigation.' })
            return json(res, 200, { success: true, disconnected: true, provider: 'linkedin', deletedAccounts: 1 })
          }
          return json(res, 200, await alphaConnector.disconnectProvider(user, toolkit))
        }
        if (!requireConnectorFeature(req, res, user, toolkit)) return
        if (operation === 'connect' && req.method === 'POST') {
          const body = await readBody(req)
          const requestedReturnTo = String(body.returnTo || '').trim()
          const safeReturnTo = requestedReturnTo.startsWith('/') && !requestedReturnTo.startsWith('//')
            ? requestedReturnTo
            : '/automations'
          const callbackUrl = new URL('/connected-apps', publicAppUrl())
          callbackUrl.searchParams.set('provider', toolkit)
          callbackUrl.searchParams.set('connected', 'checking')
          callbackUrl.searchParams.set('returnTo', safeReturnTo)
          return json(res, 200, await alphaConnector.startConnection(user, toolkit, callbackUrl.toString()))
        }
        if (operation === 'status' && req.method === 'GET') {
          return json(res, 200, await alphaConnector.getConnectionStatus(user, toolkit))
        }
        if (operation === 'test' && req.method === 'POST') {
          return json(res, 200, await alphaConnector.testConnection(user, toolkit))
        }
        return json(res, 405, { error: 'Method not allowed' })
      } catch (error) {
        return json(res, 502, { error: error instanceof Error ? error.message : 'Connector request failed' })
      }
    }
  }
  if (req.url?.startsWith('/api/connect/') && req.method === 'POST') {
    const match = new URL(req.url, 'http://localhost').pathname.match(/^\/api\/connect\/([^/]+)\/?$/)
    if (match) {
      try {
        const config = supabaseConfig()
        const user = await currentOrLocalUser(req, config.url, config.anon)
        if (!user) return json(res, 401, { error: 'Authentication required' })
        const body = await readBody(req)
        const callbackUrl = body.callbackUrl || `${getRequestOrigin(req)}/api/connect/callback`
        return json(res, 200, await alphaConnector.startConnection(user, match[1], callbackUrl))
      } catch (error) { return json(res, 502, { error: error instanceof Error ? error.message : 'Connection failed' }) }
    }
  }
  if (req.url?.startsWith('/api/connect/') && req.method === 'GET') {
    const match = new URL(req.url, 'http://localhost').pathname.match(/^\/api\/connect\/([^/]+)\/status\/?$/)
    if (match) {
      try {
        const config = supabaseConfig()
        const user = await currentOrLocalUser(req, config.url, config.anon)
        if (!user) return json(res, 401, { error: 'Authentication required' })
        return json(res, 200, await alphaConnector.getConnectionStatus(user, match[1]))
      } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Status check failed' }) }
    }
  }
  if (req.url?.startsWith('/api/connect/callback') && req.method === 'GET') {
    const url = new URL(req.url || '/', publicAppUrl())
    const provider = url.searchParams.get('provider') || ''
    const error = url.searchParams.get('error') || ''
    const redirectUrl = new URL('/connected-apps', publicAppUrl())
    redirectUrl.searchParams.set('connected', error ? 'error' : provider || 'success')
    if (provider) redirectUrl.searchParams.set('provider', provider)
    if (error) redirectUrl.searchParams.set('error', error.slice(0, 200))
    res.writeHead(302, { Location: redirectUrl.toString(), 'Cache-Control': 'no-store' })
    return res.end()
  }
  if (req.url?.startsWith('/api/reconnect/') && req.method === 'POST') {
    const match = new URL(req.url, 'http://localhost').pathname.match(/^\/api\/reconnect\/([^/]+)\/?$/)
    if (match) {
      try {
        const config = supabaseConfig()
        const user = await currentOrLocalUser(req, config.url, config.anon)
        if (!user) return json(res, 401, { error: 'Authentication required' })
        const body = await readBody(req)
        const callbackUrl = body.callbackUrl || `${getRequestOrigin(req)}/api/connect/callback`
        return json(res, 200, await alphaConnector.reconnectProvider(user, match[1], callbackUrl))
      } catch (error) { return json(res, 502, { error: error instanceof Error ? error.message : 'Reconnect failed' }) }
    }
  }
  if (req.url?.startsWith('/api/disconnect/') && req.method === 'DELETE') {
    const match = new URL(req.url, 'http://localhost').pathname.match(/^\/api\/disconnect\/([^/]+)\/?$/)
    if (match) {
      try {
        const config = supabaseConfig()
        const user = await currentOrLocalUser(req, config.url, config.anon)
        if (!user) return json(res, 401, { error: 'Authentication required' })
        return json(res, 200, await alphaConnector.disconnectProvider(user, match[1]))
      } catch (error) { return json(res, 502, { error: error instanceof Error ? error.message : 'Disconnect failed' }) }
    }
  }
  if (req.url?.startsWith('/api/execute/') && req.method === 'POST') {
    const match = new URL(req.url, 'http://localhost').pathname.match(/^\/api\/execute\/([^/]+)\/([^/]+)\/?$/)
    if (match) {
      try {
        const config = supabaseConfig()
        const user = await currentOrLocalUser(req, config.url, config.anon)
        if (!user) return json(res, 401, { error: 'Authentication required' })
        const body = await readBody(req)
        return json(res, 200, await executeProviderWithHealing(user, match[1], match[2], body.params || {}))
      } catch (error) {
        const code = error?.code || (/insufficient credits/i.test(String(error?.message || '')) ? 'INSUFFICIENT_CREDITS' : 'EXECUTION_FAILED')
        return json(res, code === 'INSUFFICIENT_CREDITS' ? 402 : code === 'RECONNECT_NEEDED' ? 409 : 502, { error: error instanceof Error ? error.message : 'Execution failed', code, charged: false })
      }
    }
  }
  if (req.url?.startsWith('/api/connected-apps/executions/') && req.method === 'GET') {
    const match = new URL(req.url, 'http://localhost').pathname.match(/^\/api\/connected-apps\/executions\/([^/]+)\/?$/)
    if (match) {
      try {
        const config = supabaseConfig()
        const user = await currentOrLocalUser(req, config.url, config.anon)
        if (!user) return json(res, 401, { error: 'Authentication required' })
        return json(res, 200, await alphaConnector.getExecutionHistory(user, match[1]))
      } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Failed to load execution history' }) }
    }
  }
  if (req.method === 'POST' && (req.url === '/api/gmail/send' || req.url === '/api/send-email')) {
    try { return await sendGmail(req, res) } catch (error) { return json(res, 400, { error: error instanceof Error ? error.message : 'Email could not be sent' }) }
  }
  if (req.method === 'POST' && req.url === '/api/alpha/conversation') {
    let user = null
    let prompt = ''
    try {
      const config = supabaseConfig()
      user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      const body = await readBody(req)
      prompt = String(body.prompt || '')
      const conversation = await getConversationEngine().start(user, prompt)
      return json(res, 200, { conversation, agent: conversation.automationDraft })
    } catch (error) {
      if (user && isProviderOrConfigError(error)) {
        const conversation = fallbackConversationResponse(user, prompt, error)
        await saveServerAgent(conversation).catch(saveError => {
          console.error('[AlphaTekX] fallback conversation persistence failed:', saveError instanceof Error ? saveError.message : saveError)
        })
        return json(res, 200, { conversation, agent: null, warning: alphaConfigurationMessage(error) })
      }
      return json(res, error instanceof Error && error.message.includes('No AI provider') ? 503 : 400, { error: error instanceof Error ? error.message : 'Conversation failed' })
    }
  }
  if (req.method === 'GET' && req.url === '/api/alpha/video-health') {
    try {
      // Test tmp directory writeability
      const tmpTestDir = path.join(tmpdir(), `health-check-${Date.now()}`)
      fs.mkdirSync(tmpTestDir, { recursive: true })
      const testFile = path.join(tmpTestDir, 'write-test.tmp')
      fs.writeFileSync(testFile, 'health-check')
      fs.unlinkSync(testFile)
      fs.rmdirSync(tmpTestDir)
      
      console.log('[HEALTH] All checks passed')
      return json(res, 200, { ok: true, ffmpeg: true, tmpWritable: true, timestamp: new Date().toISOString() })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Health check failed'
      console.error('[HEALTH] Check failed:', message)
      return json(res, 503, { ok: false, error: message })
    }
  }
  if (req.method === 'POST' && req.url === '/api/alpha/video-stream') {
    // Set SSE headers FIRST, before any other logic
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) {
        res.write(`data: ${JSON.stringify({ phase: 'error', message: 'Authentication required', error: 'Unauthorized' })}

`)
        res.end()
        return
      }
      
      const body = await readBody(req)
      const prompt = String(body.prompt || '').trim()
      if (!prompt) {
        res.write(`data: ${JSON.stringify({ phase: 'error', message: 'Prompt is required', error: 'Bad request' })}\n\n`)
        res.end()
        return
      }
      
      const plan = String(body.plan || 'free').toLowerCase()
      const planConfig = videoPipeline.getPlanConfig(plan)
      const jobId = randomUUID()
      const job = { id: jobId, userId: user.id, status: 'running', events: [], createdAt: new Date().toISOString(), result: null, error: null }
      videoJobs.set(jobId, job)
      
      // Stream progress updates
      const sendProgress = (update = {}) => {
        const data = { jobId, ...update, timestamp: update.timestamp || new Date().toISOString() }
        job.events.push(data)
        if (job.events.length > 100) job.events.shift()
        if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`)
      }
      
      try {
        sendProgress({ 
          phase: 'starting', 
          message: `Starting ${plan} video (${planConfig.scenesMax} scenes, ${planConfig.duration}s)`, 
          totalScenes: planConfig.scenesMax 
        })
        
        // Build video with resilient pipeline
        const result = await videoPipeline.buildProductionVideo(prompt, {
          duration: planConfig.duration,
          plan,
          jobId,
          onProgress: sendProgress,
        })
        
        if (!result || !result.videoPath) throw new Error('Video pipeline returned invalid result')
        
        // Read the final video file
        const videoBytes = await fs.promises.readFile(result.videoPath)
        
        // Upload to media library
        sendProgress({ phase: 'upload', message: 'Uploading to media library...' })
        const storagePath = `${user.id}/generated-videos/${Date.now()}-${randomUUID()}.mp4`
        const upload = await fetch(`${config.url}/storage/v1/object/media-library/${storagePath}`, {
          method: 'POST',
          headers: supabaseServiceHeaders(config.service, { 'Content-Type': 'video/mp4' }),
          body: videoBytes,
        })
        if (!upload.ok) throw new Error(`Media upload failed: ${upload.status}`)
        
        const signed = await fetch(`${config.url}/storage/v1/object/sign/media-library/${storagePath}`, {
          method: 'POST',
          headers: supabaseServiceHeaders(config.service, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({ expiresIn: 60 * 60 * 24 }),
        })
        const signedPayload = await signed.json().catch(() => ({}))
        if (!signed.ok || !signedPayload.signedURL) throw new Error(`Could not create preview link: ${signed.status}`)
        
        const videoUrl = `${config.url}/storage/v1${signedPayload.signedURL}`
        job.status = 'completed'
        job.result = { 
          finalVideoUrl: videoUrl, 
          scenes: result.scenes,
          duration: result.duration,
          plan: result.plan,
          size: videoBytes.length 
        }
        
        sendProgress({ 
          phase: 'complete', 
          step: 100, 
          message: `✅ Video complete! ${(videoBytes.length / 1024 / 1024).toFixed(1)}MB ready to download`,
          finalVideoUrl: videoUrl,
          size: videoBytes.length 
        })
        res.end()
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Video generation failed'
        console.error('[VIDEO_STREAM_ERROR]', msg, error instanceof Error ? error.stack : '')
        job.status = 'failed'
        job.error = msg
        sendProgress({ phase: 'error', message: `Error: ${msg}`, error: msg })
        res.write(`data: ${JSON.stringify({ phase: 'error', message: `Server warming up - retrying...`, error: msg })}\n\n`)
        res.end()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Video stream failed'
      if (!res.writableEnded) res.write(`data: ${JSON.stringify({ phase: 'error', message: 'Server warming up - retrying...', error: message })}\n\n`)
      return json(res, 400, { error: message })
    }
  }
  const videoStatusMatch = req.url?.match(/^\/api\/alpha\/video\/([^/]+)\/status$/)
  if (req.method === 'GET' && videoStatusMatch) {
    const job = videoJobs.get(videoStatusMatch[1])
    if (!job) return json(res, 404, { error: 'Video job not found or expired.' })
    return json(res, 200, { job: { id: job.id, status: job.status, events: job.events, result: job.result, error: job.error } })
  }

  // Pro video workflow endpoint - advanced editing + YouTube scheduling
  if (req.method === 'POST' && req.url === '/api/alpha/pro-video') {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })

      const body = await readBody(req)
      const prompt = String(body.prompt || '').trim()
      if (!prompt) return json(res, 400, { error: 'Prompt required' })

      // Create pro video job
      const job = proVideoWorkflow.createProVideoJob(prompt, {
        duration: Math.min(600, Math.max(10, Number(body.duration) || 600)),
        colorGrade: body.colorGrade || 'vibrant',
        transition: body.transition || 'fade',
        scheduleDurationDays: Number(body.scheduleDurationDays) || 7,
        youtubeUpload: body.youtubeUpload !== false,
      })

      // Set response headers for Server-Sent Events
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      })

      const sendProgress = (update = {}) => {
        const data = { jobId: job.id, ...update, timestamp: update.timestamp || new Date().toISOString() }
        if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`)
      }

      // Run pro workflow asynchronously
      proVideoWorkflow
        .executeProVideoWorkflow(job.id, sendProgress)
        .then(() => {
          res.end()
        })
        .catch((error) => {
          sendProgress({
            error: error instanceof Error ? error.message : 'Workflow failed',
            phase: 'failed',
          })
          res.end()
        })
    } catch (error) {
      return json(res, 400, { error: error instanceof Error ? error.message : 'Pro video failed' })
    }
  }

  if (req.method === 'GET' && req.url === '/api/alpha/conversations') {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      const conversations = (await listServerAgentsForUser(user.id))
        .filter(record => record.type === 'conversation' && record.status !== 'deleted')
        .sort((a, b) => new Date(b.updated_at || b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updated_at || a.updatedAt || a.createdAt || 0).getTime())
        .slice(0, 100)
        .map(record => ({
          id: record.id,
          title: record.name || `Conversation: ${String(record.originalRequest || '').slice(0, 40)}`,
          originalRequest: record.originalRequest || '',
          conversationStage: record.conversationStage || 'chatting',
          status: record.status || 'draft',
          createdAt: record.createdAt || record.updated_at,
          updatedAt: record.updated_at || record.updatedAt || record.createdAt,
          messages: Array.isArray(record.messages) ? record.messages : [],
        }))
      return json(res, 200, { conversations })
    } catch (error) {
      return json(res, 500, { error: error instanceof Error ? error.message : 'Could not load conversation history.' })
    }
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
    let user = null
    let message = ''
    try {
      const config = supabaseConfig()
      user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      const body = await readBody(req)
      message = String(body.message || '')
      const conversation = await getConversationEngine().continue(conversationGetMatch[1], user, message)
      return json(res, 200, { conversation, agent: conversation.automationDraft })
    } catch (error) {
      if (user && isProviderOrConfigError(error)) {
        const conversation = fallbackConversationResponse(user, message, error)
        return json(res, 200, { conversation, agent: null, warning: alphaConfigurationMessage(error) })
      }
      return json(res, 400, { error: error instanceof Error ? error.message : 'Could not continue conversation' })
    }
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
  if (req.method === 'POST' && req.url === '/api/alpha/jobs') {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      const body = await readBody(req)
      const action = body.action === 'continue' ? 'continue' : 'start'
      const prompt = String(body.prompt || '')
      const message = String(body.message || '')
      const conversationId = String(body.conversationId || '')
      if (action === 'start' && !prompt) return json(res, 400, { error: 'Prompt is required' })
      if (action === 'continue' && !conversationId) return json(res, 400, { error: 'Conversation ID is required' })
      const incomingMessage = action === 'continue' ? message : prompt
      const intent = classifyIntent(incomingMessage, { hasPlanningContext: action === 'continue' })
      const immediateCategories = new Set([
        INTENT_CATEGORIES.conversation,
        INTENT_CATEGORIES.help,
        INTENT_CATEGORIES.unknown,
        INTENT_CATEGORIES.clarification,
      ])
      // Greetings, help, and ordinary conversation must feel like chat. They do
      // not need a provider call and must never wait behind automation jobs.
      if (immediateCategories.has(intent.category)) {
        const engine = getConversationEngine()
        const conversation = action === 'continue'
          ? await engine.continue(conversationId, user, incomingMessage)
          : await engine.start(user, incomingMessage)
        return json(res, 200, {
          immediate: true,
          intent: intent.category,
          conversation,
          agent: conversation.automationDraft,
        })
      }
      const jobPayload = {
        jobId: randomUUID(),
        userId: user.id,
        userEmail: user.email,
        action,
        prompt,
        message,
        conversationId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const job = await enqueueAlphaJob(jobPayload)
      return json(res, 200, { job })
    } catch (error) {
      return json(res, error instanceof Error && error.message.includes('No AI provider') ? 503 : 400, { error: error instanceof Error ? error.message : 'Job creation failed' })
    }
  }
  const jobGetMatch = req.url?.match(/^\/api\/alpha\/jobs\/([^/]+)$/)
  if (jobGetMatch && req.method === 'GET') {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      const job = getAlphaJob(jobGetMatch[1])
      if (!job || job.userId !== user.id) return json(res, 404, { error: 'Job not found' })
      return json(res, 200, { job })
    } catch (error) {
      return json(res, 500, { error: error instanceof Error ? error.message : 'Could not load job' })
    }
  }
  const jobApproveMatch = req.url?.match(/^\/api\/alpha\/jobs\/([^/]+)\/approve$/)
  if (jobApproveMatch && req.method === 'POST') {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      const job = getAlphaJob(jobApproveMatch[1])
      if (!job || job.userId !== user.id) return json(res, 404, { error: 'Job not found' })
      const body = await readBody(req)
      const message = String(body.message || 'approve')
      const conversationId = job.conversationId || job.result?.conversation?.id
      if (!conversationId) return json(res, 400, { error: 'Job has no conversation to approve' })
      const jobPayload = {
        jobId: randomUUID(),
        parentJobId: job.jobId || job.id,
        userId: user.id,
        userEmail: user.email,
        action: 'continue',
        prompt: '',
        message,
        conversationId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const nextJob = await enqueueAlphaJob(jobPayload)
      return json(res, 200, { job: nextJob })
    } catch (error) {
      return json(res, 500, { error: error instanceof Error ? error.message : 'Could not resume job' })
    }
  }
  const jobListMatch = req.url === '/api/alpha/jobs' && req.method === 'GET'
  if (jobListMatch) {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      return json(res, 200, { jobs: listAlphaJobsForUser(user.id) })
    } catch (error) {
      return json(res, 500, { error: error instanceof Error ? error.message : 'Could not load jobs' })
    }
  }
  if (req.method === 'POST' && req.url === '/api/agents/parse') {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      const body = await readBody(req)
      const prompt = String(body.prompt || '')
      const unavailable = unavailablePromptConnector(user, prompt, trustedFeatureIdentity(req))
      if (unavailable) return json(res, 403, { error: unavailableConnectorMessage(unavailable), code: 'FEATURE_COMING_SOON', connector: unavailable })
      const agent = await parseAgentFromNL(prompt, user)
      return json(res, 200, { agent })
    } catch (error) { return json(res, error instanceof Error && error.message.includes('No AI provider') ? 503 : 400, { error: error instanceof Error ? error.message : 'Parse failed' }) }
  }
  if (req.method === 'GET' && /^\/api\/automations\/[^/]+\/progress\/?$/.test(req.url || '')) {
    const match = new URL(req.url || '/', 'http://localhost').pathname.match(/^\/api\/automations\/([^/]+)\/progress\/?$/)
    const automationId = match ? decodeURIComponent(match[1]) : ''
    if (!automationId) return json(res, 400, { error: 'Missing automation id' })
    const config = supabaseConfig()
    const user = await currentOrLocalUser(req, config.url, config.anon)
    if (!user) return json(res, 401, { error: 'Authentication required' })
    const agent = await getServerAgent(automationId, user.id).catch(() => null)
    if (!agent) return json(res, 404, { error: 'Automation not found' })
    return json(res, 200, await getAutomationProgressPayload(agent))
  }
  if (req.method === 'POST' && /^\/api\/automations\/[^/]+\/generate-background\/?$/.test(req.url || '')) {
    const match = new URL(req.url || '/', 'http://localhost').pathname.match(/^\/api\/automations\/([^/]+)\/generate-background\/?$/)
    const automationId = match ? decodeURIComponent(match[1]) : ''
    if (!automationId) return json(res, 400, { error: 'Missing automation id' })
    const config = supabaseConfig()
    const user = await currentOrLocalUser(req, config.url, config.anon)
    if (!user) return json(res, 401, { error: 'Authentication required' })
    const agent = await getServerAgent(automationId, user.id).catch(() => null)
    if (!agent) return json(res, 404, { error: 'Automation not found' })
    if (agent.backgroundGeneration?.status === 'generating') return json(res, 202, { ok: true, started: false, status: 'generating' })
    void runAutomationBackgroundGeneration(automationId, user.id)
    return json(res, 202, { ok: true, started: true, status: 'generating' })
  }
  if (req.method === 'GET' && req.url === '/api/agents') {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      const agents = (await listServerAgentsForUser(user.id)).filter(agent => agent.status !== 'deleted' && agent.type !== 'conversation')
      const agentIds = new Set(agents.map(agent => agent.id))
      const executions = (await listServerExecutions()).filter(execution => agentIds.has(execution.agentId))
      return json(res, 200, { agents, executions })
    }
    catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Could not load agents' }) }
  }
  if (req.method === 'POST' && req.url === '/api/agents') {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      const body = await readBody(req)
      const incoming = body.agent || body
      const incomingConnectors = new Set([
        ...(incoming.actions || []).map(action => action.connector),
        ...(incoming.campaign?.meta?.platforms || []),
        ...(incoming.campaign?.posts || []).flatMap(post => post.platforms || []),
      ])
      const blockedConnector = [...incomingConnectors].find(connector => !featureAccessForRequest(req, user, connector).enabled)
      if (blockedConnector) return json(res, 403, { error: unavailableConnectorMessage(blockedConnector), code: 'FEATURE_COMING_SOON', connector: blockedConnector })
      const agentId = incoming.id || randomUUID()
      const existing = await getServerAgent(agentId, user.id) || {}
      const merged = normalizeAutomationLifecycle({ ...existing, ...incoming, id: agentId, userId: user.id, userEmail: user.email })
      if (!merged.status || merged.status === 'awaiting_information') {
        merged.status = (merged.missing && merged.missing.length) ? 'awaiting_information' : 'running'
      }
      if (merged.status === 'running' || merged.status === 'active') {
        merged.status = 'running'
        merged.approved = true
        if (merged.campaign) {
          merged.campaign.status = 'running'
          merged.campaign.approved = true
          merged.campaign.charged = false
          merged.campaign.posts = (merged.campaign.posts || []).map(post => {
            if (post.status === 'pending_approval' || post.status === 'draft' || post.status === 'awaiting_approval' || post.status === 'scheduled') {
              return { ...post, status: 'scheduled', approved: true, charged: false, providerPostId: undefined, providerUrl: undefined, executionKey: undefined }
            }
            return post
          })
        }
        const allAgents = await listServerAgentsForUser(user.id)
        const activeCount = allAgents.filter(a => (a.status === 'running' || a.status === 'active') && a.id !== agentId).length
        const canCreate = await billing.canCreateAgent(user, config, activeCount)
        if (!canCreate.ok) return json(res, 402, { error: canCreate.reason, plan: canCreate.plan, code: 'PLAN_LIMIT', limit: canCreate.limit })
        const estimatedCredits = Math.max(1, computeEstimatedCredits(merged))
        const billingSummary = await billing.getUserBilling(user, config)
        if (!isAdminAuthUser(user) && Number(billingSummary.credits || 0) < estimatedCredits) {
          return json(res, 402, { error: `You need ${estimatedCredits} credit${estimatedCredits === 1 ? '' : 's'} to activate this automation. Add credits to continue.`, code: 'INSUFFICIENT_CREDITS', required: estimatedCredits, available: Number(billingSummary.credits || 0) })
        }
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
  if (req.method === 'GET' && (req.url === '/api/agents/run-due' || req.url === '/api/cron/check-scheduled-posts')) return runDueAgents(req, res)
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
    const execution = await runAgentWithQueue(agent, 'manual', user)
      return json(res, 200, { executed: true, execution })
    } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Test run failed' }) }
  }
  if (req.method === 'POST' && /^\/api\/agents\/campaign\/[^/]+\/activate\/?$/.test(req.url || '')) {
    try { return await activateCampaignHandler(req, res) } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Campaign activation failed' }) }
  }
  if (req.method === 'POST' && /^\/api\/agents\/campaign\/[^/]+\/review\/?$/.test(req.url || '')) {
    try { return await reviewCampaignPostHandler(req, res) } catch (error) { return json(res, 502, { error: error instanceof Error ? error.message : 'Post review failed' }) }
  }
  if (req.method === 'POST' && /^\/api\/agents\/campaign\/[^/]+\/cancel\/?$/.test(req.url || '')) {
    try { return await cancelCampaignHandler(req, res) } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Campaign cancellation failed' }) }
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
  if (req.method === 'GET' && req.url?.startsWith('/api/health')) {
    const requestUrl = new URL(req.url, 'http://localhost')
    if (requestUrl.searchParams.get('deep') !== '1') {
      return json(res, 200, { status: 'ok', paystack: !!process.env.PAYSTACK_SECRET_KEY, db: true, timestamp: new Date().toISOString(), uptimeSeconds: schedulerState.uptime() })
    }
    const config = supabaseConfig()
    const providers = providerOrder().filter(name => Boolean(providerApiKey(name)))
    let authStatus = 'missing'
    let databaseStatus = 'missing'
    if (config.url && config.service) {
      const signal = AbortSignal.timeout(8_000)
      const [authCheck, databaseCheck] = await Promise.allSettled([
        fetch(`${config.url}/auth/v1/admin/users?page=1&per_page=1`, { headers: serviceHeaders(config.service), signal }),
        fetch(`${config.url}/rest/v1/agents?select=id&limit=1`, { headers: serviceHeaders(config.service), signal }),
      ])
      authStatus = authCheck.status === 'fulfilled' && authCheck.value.ok ? 'ready' : 'failed'
      databaseStatus = databaseCheck.status === 'fulfilled' && databaseCheck.value.ok ? 'ready' : 'failed'
    }
    const dependencies = {
      supabaseAuth: authStatus,
      durableAgents: databaseStatus,
      aiProvider: providers.length ? 'ready' : 'missing',
      aiProviders: providers,
    }
    return json(res, 200, {
      ok: Object.values(dependencies).every(value => Array.isArray(value) || value === 'ready'),
      timestamp: new Date().toISOString(),
      uptimeSeconds: schedulerState.uptime(),
      dependencies,
    })
  }
  const agentIdMatch = req.url?.match(/^\/api\/agents\/([^/]+)(?:\/run)?\/?$/)
  if (agentIdMatch) {
    const agentId = decodeURIComponent(agentIdMatch[1])
    const isRun = req.url.includes('/run')
    const config = supabaseConfig()
    const user = await currentOrLocalUser(req, config.url, config.anon).catch(() => null)
    if (!user) return json(res, 401, { error: 'Authentication required' })
    let existingAgent
    try { existingAgent = await getServerAgent(agentId, user.id) }
    catch (error) { return json(res, 503, { error: error instanceof Error ? error.message : 'Automation storage is temporarily unavailable' }) }
    if (!existingAgent) return json(res, 404, { error: 'Automation not found' })
    if (existingAgent.userId && existingAgent.userId !== user.id) return json(res, 403, { error: 'Not authorized to modify this automation' })
    if (existingAgent.status === 'deleted') {
      return json(res, req.method === 'DELETE' ? 409 : 404, { error: req.method === 'DELETE' ? 'Automation is already deleted' : 'Automation not found' })
    }
    if (isRun && req.method === 'POST') {
      try {
        const campaignPosts = existingAgent.campaign?.posts || []
        if (campaignPosts.length > 0 && campaignPosts.every(post => post.status === 'posted' && post.providerPostId)) {
          return json(res, 200, {
            executed: false,
            duplicatePrevented: true,
            execution: { status: 'skipped', error_code: 'DUPLICATE', log: 'Every post is already confirmed by its provider; duplicate publication was prevented.', credits_used: 0 },
            charged: false,
          })
        }
        const execution = await runAgentWithQueue(existingAgent, 'manual', user)
        const ok = execution.status === 'success' || execution.status === 'partial'
        const idempotentNoop = execution.error_code === 'NO_DUE_POSTS' || execution.error_code === 'DUPLICATE'
        const statusCode = execution.status === 'partial' ? 207 : ok || idempotentNoop ? 200 : execution.error_code === 'INSUFFICIENT_CREDITS' ? 402 : execution.error_code === 'APPROVAL_REQUIRED' ? 409 : 502
        return json(res, statusCode, {
          executed: ok,
          execution,
          error: ok ? undefined : execution.log,
          code: execution.error_code,
          charged: Number(execution.credits_used || 0) > 0,
        })
      }
      catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Run failed', charged: false }) }
    }
    if (req.method === 'GET') {
      const executions = (await listServerExecutions()).filter(e => e.agentId === agentId)
      return json(res, 200, { agent: existingAgent, executions })
    }
    if (req.method === 'PATCH') {
      try {
        const body = await readBody(req)
        const action = String(body.action || '')
        if (!['pause', 'resume', 'archive'].includes(action)) return json(res, 400, { error: 'Action must be pause, resume, or archive' })
        if (existingAgent.campaign?.posts?.some(post => post.status === 'publishing')) {
          return json(res, 409, { error: 'Automation cannot change state while a post is publishing' })
        }
        const agent = structuredClone(existingAgent)
        if (action === 'pause') {
          agent.status = 'paused'
          if (agent.campaign) agent.campaign.status = 'paused'
          agent.pausedNextRunAt = agent.trigger?.nextRun || agent.nextRunAt || null
          agent.trigger = { ...(agent.trigger || {}), nextRun: null }
          agent.nextRunAt = null
        } else if (action === 'resume') {
          agent.status = 'running'
          if (agent.campaign) agent.campaign.status = 'running'
          const nextRun = resumeAgentSchedule(agent)
          agent.trigger = { ...(agent.trigger || {}), nextRun }
          agent.nextRunAt = nextRun
          delete agent.pausedNextRunAt
        } else {
          agent.status = 'deleted'
          agent.deletedAt = new Date().toISOString()
          agent.trigger = { ...(agent.trigger || {}), nextRun: null }
          agent.nextRunAt = null
          if (agent.campaign) agent.campaign.status = 'archived'
        }
        const saved = await saveServerAgent(agent)
        return json(res, 200, { agent: saved })
      } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Could not update automation' }) }
    }
    if (req.method === 'POST') {
      try { const body = await readBody(req); const existing = await getServerAgent(agentId, user.id) || {}; const agent = await saveServerAgent({ ...existing, ...body.agent, id: agentId, userId: user.id, userEmail: user.email }); return json(res, 200, { agent }) }
      catch (error) { return json(res, 400, { error: error instanceof Error ? error.message : 'Could not update agent' }) }
    }
    if (req.method === 'DELETE') {
      try {
        if (existingAgent.campaign?.posts?.some(post => post.status === 'publishing')) {
          return json(res, 409, { error: 'Automation cannot be deleted while a post is publishing' })
        }
        await deleteServerAgent(agentId, user.id, user.email || '')
        return json(res, 200, { deleted: true, id: agentId })
      } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Could not delete automation' }) }
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
          const execution = await runAgentWithQueue(agent, 'webhook')
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
  if (req.method === 'POST' && req.url === '/api/payment/create-checkout-session') {
    try {
      const body = await readBody(req)
      const provider = String(body.provider || 'paystack')
      const item = { ...body }
      delete item.provider
      if (!provider) return json(res, 400, { error: 'Payment provider is required.' })
      if (provider !== 'paystack') return json(res, 400, { error: 'Unsupported payment provider.' })
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      const result = await billing.initializePayment(provider, user, item, config)
      return json(res, 200, result)
    } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Payment initialization failed' }) }
  }
  if (req.url?.startsWith('/api/payment/verify-session')) {
    try {
      const url = new URL(req.url || '/', 'http://localhost')
      let provider = String(req.method === 'GET' ? url.searchParams.get('provider') : '') || 'paystack'
      let reference = String(req.method === 'GET' ? url.searchParams.get('reference') : '') || ''
      if (req.method === 'POST') {
        const body = await readBody(req)
        if (!reference) reference = String(body.reference || '')
        if (!provider) provider = String(body.provider || 'paystack')
      }
      if (!reference) return json(res, 400, { error: 'Missing payment reference.' })
      if (provider !== 'paystack') return json(res, 400, { error: 'Unsupported payment provider.' })
      const config = supabaseConfig()
      const currentUser = await currentOrLocalUser(req, config.url, config.anon)
      if (!currentUser) return json(res, 401, { error: 'Authentication required' })
      const result = await billing.verifyPayment(provider, reference, config)
      if (!result.ok) {
        const retryable = /pending|processing|ongoing|temporar|try again/i.test(String(result.message || ''))
        return json(res, retryable ? 409 : 400, { error: result.message || 'Verification failed', verified: false, retryable })
      }
      const ownsPayment = String(result.user?.id || '') === String(currentUser.id || '') || String(result.user?.email || '').trim().toLowerCase() === String(currentUser.email || '').trim().toLowerCase()
      if (!ownsPayment) return json(res, 403, { error: 'This payment belongs to another AlphaTekx account.' })
      return json(res, 200, { verified: true, creditsAdded: result.credits, balance: result.balance, credits: result.balance, duplicate: result.duplicate === true, plan: result.plan || 'free', amount: result.amount || 0, reference: result.reference || reference })
    } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Verification failed.' }) }
  }
  if (req.method === 'POST' && req.url === '/api/payment/recover') {
    try {
      const config = supabaseConfig()
      const user = await currentOrLocalUser(req, config.url, config.anon)
      if (!user) return json(res, 401, { error: 'Authentication required' })
      return json(res, 200, await billing.recoverRecentPaystackPurchases(user, config))
    } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Payment recovery failed' }) }
  }
  if (req.method === 'POST' && req.url === '/api/payment/webhook') {
    try { return await paystackWebhookHandler(req, res) } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Webhook failed' }) }
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
  if (req.method === 'POST' && req.url === '/api/contact') {
    try { return await handleContactRequest(req, res) } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Contact request failed' }) }
  }
  if (req.method === 'GET' && req.url === '/api/credits/balance') {
    try { return await creditsBalance(req, res) } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Balance failed' }) }
  }
  if (req.method === 'POST' && req.url === '/api/verify-bonus') {
    try { return await verifyDeviceBonus(req, res) }
    catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Human verification failed.' }) }
  }
  if (req.method === 'POST' && req.url === '/api/auth/welcome-credit/google') {
    try { return await googleWelcomeCredit(req, res) }
    catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Google welcome credit failed.' }) }
  }
  if (req.url === '/api/billing' || req.url === '/api/billing/upgrade') {
    try { return await billingHandler(req, res) } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Billing failed' }) }
  }
  const paymentVerifyPath = new URL(req.url || '/', 'http://localhost').pathname
  if (['GET', 'POST'].includes(req.method || '') && (paymentVerifyPath === '/api/paystack/verify' || paymentVerifyPath === '/api/verify-paystack')) return verifyPaystack(req, res)
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
  if (req.method === 'POST' && req.url === '/api/admin/credits/transfer') return adminCreditTransfer(req, res)
  if (req.method === 'GET' && req.url === '/api/admin/features') return adminFeaturesHandler(req, res)
  const adminFeatureMatch = req.url?.match(/^\/api\/admin\/features\/([^/]+)$/)
  if (req.method === 'PUT' && adminFeatureMatch) return updateAdminFeatureHandler(req, res, decodeURIComponent(adminFeatureMatch[1]))
  if (req.method === 'POST' && req.url === '/api/admin/features/beta-users') return adminBetaUserHandler(req, res)
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
  if (req.method === 'POST' && req.url === '/api/ai/generate-post') {
    try {
      const body = await readBody(req)
      return await generatePostHandler(req, res, { body, callProvider })
    } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Post generation failed.' }) }
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
      groq: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
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
  if (req.method === 'GET' && req.url === '/api/debug/dist') {
    try {
      const indexHtml = fs.readFileSync(path.join(distRoot, 'index.html'), 'utf8').slice(0, 1000)
      const assets = fs.readdirSync(path.join(distRoot, 'assets')).filter(f => f.endsWith('.js')).slice(0, 30)
      return json(res, 200, { root, distRoot, indexHtml, assets })
    } catch (err) {
      return json(res, 500, { error: err instanceof Error ? err.message : String(err), root, distRoot })
    }
  }
  const normalizeScanKey = (req) => {
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'anonymous').split(',')[0].trim()
    const userId = String(req.headers['x-local-user-id'] || req.headers.authorization || '').trim()
    return `${userId || 'anonymous'}:${ip}`
  }

  function scanFinding(id, severity, title, detail, code) {
    return { id, severity, title, detail, code }
  }

  function buildSecretMessage(matchType) {
    const labels = {
      api: 'We found an API key in the page source.',
      live: 'We found a live secret key in the page source.',
      aws: 'We found an AWS access key in the page source.',
      google: 'We found a Google API key in the page source.',
      default: 'We found a likely secret value in the page source.'
    }
    const summary = labels[matchType] || labels.default
    return `${summary} Anyone with access to the public page could copy it. Move it to a secure server-only environment and remove it from the front-end code.`
  }

  async function safeHead(url) {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        redirect: 'manual',
        headers: { 'User-Agent': 'AlphaScan/1.0' },
        signal: AbortSignal.timeout(8000),
      })
      return { ok: response.ok, status: response.status, url: response.url }
    } catch {
      return null
    }
  }

  async function runScanFromUrl(targetUrl) {
    const findings = []
    const fetchedAt = Date.now()
    const normalizedUrl = String(targetUrl || '').trim()
    if (!normalizedUrl) throw new Error('Missing URL')

    let parsed
    try {
      parsed = new URL(normalizedUrl)
    } catch {
      throw new Error('Please enter a valid http or https URL.')
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only http and https URLs are allowed.')

    const base = parsed.origin
    let html
    try {
      const response = await fetch(normalizedUrl, {
        method: 'GET',
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://www.google.com/'
        },
        signal: AbortSignal.timeout(20000),
        redirect: 'follow',
      })

      if (response.status === 403) {
        throw new Error(`Access denied (HTTP 403). The website may be blocking automated scanning. This is common for sites like ChatGPT, which use advanced bot detection.`)
      }
      if (response.status === 401) {
        throw new Error(`Unauthorized (HTTP 401). The website requires authentication to scan.`)
      }
      if (!response.ok) {
        throw new Error(`Target responded with HTTP ${response.status}. The website may not be accessible or may be blocking scanners.`)
      }

      html = await response.text()
      
      if (!html || html.length === 0) {
        throw new Error('Received empty response from the target website.')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not fetch the target website.'
      if (message.includes('AbortSignal') || message.includes('timeout')) {
        throw new Error('Scan timed out. The website may be unresponsive or too slow to scan. Try again with a faster site.')
      }
      if (message.includes('fetch failed') || message.includes('ECONNREFUSED')) {
        throw new Error('Failed to connect to the target website. Check that the URL is correct and the site is online.')
      }
      if (message.includes('CORS') || message.includes('cross-origin')) {
        throw new Error('CORS policy prevents scanning. This is typically a website security measure.')
      }
      throw new Error(message)
    }

    const severePatterns = [
      { regex: /sk_live_[A-Za-z0-9]+/gi, label: 'Live secret key exposed in HTML', code: 'SECRET_LEAK', messageType: 'live' },
      { regex: /pk_live_[A-Za-z0-9]+/gi, label: 'Live publish key exposed in HTML', code: 'SECRET_LEAK', messageType: 'api' },
      { regex: /AKIA[0-9A-Z]{16}/g, label: 'AWS access key exposed in HTML', code: 'SECRET_LEAK', messageType: 'aws' },
      { regex: /openai\s*[:=][\s\"']*sk-[A-Za-z0-9]+/gi, label: 'OpenAI key exposed in HTML', code: 'SECRET_LEAK', messageType: 'api' },
      { regex: /AIza[0-9A-Za-z\-_]{35}/g, label: 'Google API key exposed in HTML', code: 'SECRET_LEAK', messageType: 'google' },
      { regex: /(?:api[_-]?key|client[_-]?secret|secret[_-]?key|access[_-]?token)[\s:'"=]+[A-Za-z0-9_\-]{16,}/gi, label: 'Possible secret value exposed in source', code: 'SECRET_LEAK', messageType: 'api' },
    ]

    for (const pattern of severePatterns) {
      if (pattern.regex.test(html)) {
        findings.push(scanFinding(`secret-${pattern.code}-${Math.random().toString(16).slice(2, 8)}`, 'critical', 'API key or secret found', buildSecretMessage(pattern.messageType), pattern.code))
      }
      pattern.regex.lastIndex = 0
    }

    const sensitivePaths = ['/.env', '/config.json', '/.git']
    for (const sensitivePath of sensitivePaths) {
      const headResult = await safeHead(new URL(sensitivePath, base).toString())
      if (headResult && headResult.ok && headResult.status < 500) {
        findings.push(scanFinding(`exposed-${sensitivePath.replace(/\W+/g, '-')}`, 'critical', 'Sensitive file exposed', `The target exposes ${sensitivePath} and is readable without approval.`, 'EXPOSED_PATH'))
      }
    }

    const anchorLinks = [...html.matchAll(/<a\s[^>]*href=["']([^"']+)["'][^>]*>/gi)].slice(0, 20).map(match => match[1]).filter(Boolean)
    const brokenLinks = []
    for (const link of anchorLinks) {
      try {
        const resolved = new URL(link, base)
        if (resolved.origin !== base) continue
        const response = await fetch(resolved.toString(), { method: 'HEAD', redirect: 'manual', headers: { 'User-Agent': 'AlphaScan/1.0' }, signal: AbortSignal.timeout(8000) })
        if (response.status === 404 || response.status >= 500) {
          brokenLinks.push({ href: resolved.toString(), status: response.status })
        }
      } catch {}
    }
    if (brokenLinks.length) {
      findings.push(scanFinding(`broken-links-${brokenLinks.length}`, 'warning', 'Broken pages found', `We found ${brokenLinks.length} internal page links returning an error or a 404. Visitors may get stuck on dead pages.`, 'BROKEN_LINKS'))
    }

    const imageMatches = [...html.matchAll(/<img\s[^>]*src=["']([^"']+)["'][^>]*>/gi)].map(match => match[1]).filter(Boolean)
    const totalImageBytes = Math.max(0, imageMatches.length * 180000)
    const lazyCount = [...html.matchAll(/<img\s[^>]*loading=["']lazy["'][^>]*>/gi)].length
    const ttfbMs = Math.max(80, Date.now() - fetchedAt)
    const performanceSeverity = totalImageBytes > 600000 || ttfbMs > 2500 || lazyCount === 0 ? 'warning' : 'info'
    if (performanceSeverity !== 'info') {
      findings.push(scanFinding(`performance-${ttfbMs}`, performanceSeverity, 'Performance issue detected', `Initial load looks slow: ~${ttfbMs}ms to render and ${imageMatches.length} images discovered. Lazy loading is ${lazyCount === 0 ? 'missing' : 'present'} for some assets.`, 'PERFORMANCE'))
    }

    const title = (html.match(/<title[^>]*>(.*?)<\/title>/is) || [])[1]
    const description = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/is) || [])[1] || (html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>/is) || [])[1]
    const ogImage = (html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/is) || [])[1]
    const h1 = (html.match(/<h1[^>]*>(.*?)<\/h1>/is) || [])[1]
    const seoIssues = []
    if (!title) seoIssues.push('Missing title tag')
    if (!description) seoIssues.push('Missing meta description')
    if (!ogImage) seoIssues.push('Missing OG image')
    if (!h1) seoIssues.push('Missing H1 heading')
    if (seoIssues.length) {
      findings.push(scanFinding(`seo-${seoIssues.length}`, 'info', 'Search page is missing basics', `This page is missing a few important SEO details: ${seoIssues.join(', ')}. That can make it harder for people to find it in search results.`, 'SEO'))
    }

    const finalScore = Math.max(0, Math.min(100, 100 - findings.reduce((score, item) => score + (item.severity === 'critical' ? 30 : item.severity === 'warning' ? 12 : 6), 0)))
    const risk = finalScore >= 80 ? 'Low risk' : finalScore >= 60 ? 'Moderate risk' : finalScore >= 40 ? 'High risk' : 'Critical risk'

    return {
      findings,
      score: finalScore,
      risk,
      totalFindings: findings.length,
      scannedUrl: normalizedUrl,
    }
  }

  // Test fixtures for scanning validation - DO NOT EXPOSE IN PRODUCTION
  if (req.method === 'GET' && req.url === '/test-safe') {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    return res.end(`<!DOCTYPE html>
<html>
<head>
  <title>Safe Page</title>
  <meta charset="utf-8">
</head>
<body>
  <h1>This is a Safe Website</h1>
  <p>No sensitive information is exposed on this page.</p>
  <script>
    // Regular application code
    const apiUrl = "https://api.example.com";
    const appName = "MyApp";
  </script>
</body>
</html>`)
  }

  if (req.method === 'GET' && req.url === '/test-leaked') {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    return res.end(`<!DOCTYPE html>
<html>
<head>
  <title>Leaked Secrets Page</title>
  <meta charset="utf-8">
</head>
<body>
  <h1>Website with Exposed Secrets</h1>
  <p>WARNING: This page intentionally contains exposed test values for validation only.</p>
  <script>
    // Exposed key value used only for validation, not a real secret.
    const stripeKey = "FAKE_STRIPE_KEY_12345abcdefg";

    // Exposed key value used only for validation, not a real secret.
    const awsAccessKey = "FAKE_AWS_ACCESS_KEY_12345";

    // Exposed key value used only for validation, not a real secret.
    const googleApiKey = "FAKE_GOOGLE_API_KEY_1234567890abcdef";
  </script>
</body>
</html>`)
  }

  if (req.method === 'GET' && req.url === '/test-leaked/.env') {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    return res.end(`STRIPE_KEY=FAKE_STRIPE_KEY_12345abcdefg
AWS_ACCESS_KEY=FAKE_AWS_ACCESS_KEY_12345
DATABASE_URL=postgresql://user:password@localhost/db
API_SECRET=FAKE_SECRET_VALUE_12345`)
  }

  if (req.method === 'GET' && req.url === '/test-leaked/config.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({
      apiKey: "FAKE_GOOGLE_API_KEY_1234567890abcdef",
      stripeSecret: "FAKE_STRIPE_KEY_12345abcdefg",
      databasePassword: "FAKE_DATABASE_PASSWORD_123"
    }, null, 2))
  }

  if (req.method === 'POST' && req.url === '/api/scan') {
    try {
      const body = await readBody(req)
      const targetUrl = String(body.url || '').trim()
      
      // SCAN COSTS 3 CREDITS
      const SCAN_COST = 3
      const user = currentOrLocalUser(req)
      let userCredits = await getUserCredits(user, supabaseConfig())
      
      // PHASE 1: Give new users 10 starting credits
      if (userCredits === 0) {
        userCredits = 10
      }
      
      if (userCredits < SCAN_COST) {
        res.writeHead(402, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ 
          error: `You need ${SCAN_COST - userCredits} more credits. Get 100 credits for $49/mo.`, 
          paywall: true,
          creditsNeeded: SCAN_COST,
          creditsAvailable: userCredits
        }))
      }

      // Validate URL early before streaming
      if (!targetUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ error: 'Missing URL' }))
      }
      
      try {
        new URL(targetUrl)
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ error: 'Please enter a valid http or https URL.' }))
      }

      // NOW safe to write streaming headers
      const resHeaders = {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
      }

      res.writeHead(200, resHeaders)
      const emit = (payload) => {
        res.write(`event: update\ndata: ${JSON.stringify(payload)}\n\n`)
      }

      emit({ type: 'progress', progress: 12, message: 'Validating target URL...' })
      await new Promise(resolve => setTimeout(resolve, 180))

      emit({ type: 'progress', progress: 26, message: 'Fetching public HTML and metadata...' })
      const results = await runScanFromUrl(targetUrl)

      for (let index = 0; index < results.findings.length; index += 1) {
        const finding = results.findings[index]
        emit({
          type: 'finding',
          id: finding.id,
          severity: finding.severity,
          title: finding.title,
          detail: finding.detail,
          code: finding.code,
        })
        emit({
          type: 'progress',
          progress: Math.min(95, 40 + ((index + 1) / Math.max(1, results.findings.length)) * 50),
          message: finding.title,
        })
        await new Promise(resolve => setTimeout(resolve, 280))
      }

      // DEDUCT CREDITS AFTER SUCCESSFUL SCAN
      const remainingCredits = userCredits - SCAN_COST
      
      // Persist credit deduction if user is authenticated
      if (user && user.id && user.id !== 'anonymous') {
        try {
          const deductResult = await spendUserCredits(user, SCAN_COST, { 
            type: 'scan', 
            url: targetUrl,
            reason: `Security scan for ${targetUrl}`
          })
          if (deductResult) {
            console.log(`[Scan] Credits deducted for user ${user.id}: -${SCAN_COST} credits`)
          } else {
            console.warn(`[Scan] Failed to deduct credits for user ${user.id}`)
          }
        } catch (err) {
          console.error('[Scan] Credit deduction error:', err instanceof Error ? err.message : err)
          // Don't block the response if credit deduction fails - user still got the scan
        }
      } else {
        console.log('[Scan] Local/anonymous user - credits not persisted')
      }

      emit({
        type: 'done',
        score: results.score,
        risk: results.risk,
        totalFindings: results.totalFindings,
        scannedUrl: results.scannedUrl,
        creditsRemaining: Math.max(0, remainingCredits),
        summary: `Scan complete: ${results.risk.toLowerCase()} with ${results.totalFindings} findings. (${Math.max(0, remainingCredits)} credits remaining)`
      })
      res.end()
      return
    } catch (error) {
      if (!res.headersSent) {
        const message = error instanceof Error ? error.message : 'Scan failed.'
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: message }))
      } else {
        // Headers already sent, just write error to stream
        res.write(`event: error\ndata: ${JSON.stringify({ error: error instanceof Error ? error.message : 'Scan failed' })}\n\n`)
        res.end()
      }
      return
    }
  }

  if (req.url?.startsWith('/api/')) return json(res, 404, { error: 'API route not found' })
  if (req.method === 'GET' && req.url === '/debug/dist') {
    try {
      const indexHtml = fs.readFileSync(path.join(distRoot, 'index.html'), 'utf8').slice(0, 1000)
      const assets = fs.readdirSync(path.join(distRoot, 'assets')).filter(f => f.endsWith('.js')).slice(0, 20)
      return json(res, 200, { root, distRoot, indexHtml, assets })
    } catch (err) {
      return json(res, 500, { error: err instanceof Error ? err.message : String(err), root, distRoot })
    }
  }
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
  } catch (err) { return handleServerError(err, req, res) }
})

if (!process.env.VERCEL) {
  const hasGroqKey = !!(process.env.GROQ_API_KEY || process.env.GROQ_API_KEY_1 || process.env.GROQ_API_KEY_2 || process.env.GROQ_API_KEY_3 || process.env.GROQ_API_KEY_4)
  console.log('[AlphaTekX] API Key Status:')
  console.log('  Pexels keys:', !!process.env.PEXELS_API_KEY_1, !!process.env.PEXELS_API_KEY_2, !!process.env.PEXELS_API_KEY_3)
  console.log('  Groq key:', hasGroqKey)
  console.log('  Pollinations key:', !!process.env.POLLINATIONS_API_KEY, '(optional)')
  
  server.listen(port, () => process.stdout.write(`[AlphaTekX] listening on ${port}\n`))
  schedule('* * * * *', async () => {
    if (schedulerState.isRunning) return
    schedulerState.isRunning = true
    const started = new Date()
    schedulerState.lastRun = started.toISOString()
    schedulerState.nextRun = new Date(started.getTime() + 60_000).toISOString()
    try {
      const now = new Date()
      const agents = await listServerAgents()
      schedulerState.activeAgents = agents.filter(a => ['running', 'active', 'warning', 'needs_attention'].includes(a.status)).length
      const due = agents.filter(a => ['running', 'active', 'warning', 'needs_attention'].includes(a.status) && (a.trigger?.type === 'schedule' || a.trigger?.type === 'monitor' || a.trigger?.type === 'campaign') && a.trigger?.nextRun && new Date(a.trigger.nextRun) <= now)
      process.stdout.write(`[AGENT SCHEDULER] Running ${due.length} active agent(s) at ${started.toISOString()}\n`)
      for (const agent of due) {
        try { await runAgentWithQueue(agent, 'schedule') } catch (err) { process.stdout.write(`[cron] agent ${agent.id} run error: ${err instanceof Error ? err.message : err}\n`) }
      }
      const mediaRuns = await mediaLibrary.runDueMedia(supabaseConfig(), executeProviderWithHealing, now).catch(err => {
        process.stdout.write(`[cron] media queue error: ${err instanceof Error ? err.message : err}\n`)
        return []
      })
      if (mediaRuns.length) process.stdout.write(`[MEDIA SCHEDULER] Processed ${mediaRuns.length} due item(s)\n`)
    } catch (err) { process.stdout.write(`[cron] error: ${err instanceof Error ? err.message : err}\n`) }
    finally { schedulerState.isRunning = false }
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
  schedule('*/5 * * * *', async () => {
    if (process.env.CEO_WATCHER_ENABLED !== 'true') return
    const users = readJsonFile(usersFile, []).filter(user => user?.id)
    for (const user of users) await scanCeoSignalsForUser(user)
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
