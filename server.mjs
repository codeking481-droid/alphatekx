import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
const allowedOrigins = new Set(['https://alphatekx.name.ng', 'https://www.alphatekx.name.ng', 'http://localhost:5173'])

const applyCors = (req, res) => {
  const origin = String(req.headers.origin || '')
  if (allowedOrigins.has(origin)) res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
}
const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }
const readBody = (req) => new Promise((resolve, reject) => {
  let raw = ''
  req.on('data', chunk => { raw += chunk; if (raw.length > 1_000_000) reject(new Error('Request too large')) })
  req.on('end', () => { try { resolve(JSON.parse(raw || '{}')) } catch { reject(new Error('Invalid JSON')) } })
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

const firstKey = (name) => process.env[`${name}_1`] || process.env[name] || ''
const currencyPair = async (from, to, amount) => {
  const apiKey = firstKey('EXCHANGE_RATE_API_KEY')
  if (!apiKey) throw new Error('Currency conversion is not configured')
  const data = await fetchJson(`https://v6.exchangerate-api.com/v6/${apiKey}/pair/${encodeURIComponent(from)}/${encodeURIComponent(to)}/${amount}`, {})
  if (data.result !== 'success') throw new Error(data['error-type'] || 'Currency conversion failed')
  return { from, to, amount, rate: data.conversion_rate, result: data.conversion_result, updatedAt: data.time_last_update_utc }
}

async function runGeneralTool(prompt) {
  if (/\b(clock|current time|what time|time now)\b/i.test(prompt)) return { tool: 'clock', text: 'Here is your live local time.' }
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
    if (!apiKey) throw new Error('Web search is not configured')
    const data = await fetchJson('https://api.tavily.com/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: apiKey, query: prompt, search_depth: 'advanced', max_results: 5, include_answer: true }) })
    return { tool: 'search', text: data.answer || 'Here is what I found.', sources: (data.results || []).map(item => ({ title: item.title, url: item.url, content: item.content })) }
  }
  return null
}

export async function handleAlpha(prompt, mode = 'chat') {
  if (mode === 'chat') {
    const toolResult = await runGeneralTool(prompt)
    if (toolResult) return toolResult
  }
  const apiKey = process.env.OPENAI_API_KEY_1 || process.env.OPENAI_API_KEY || ''
  const primaryGroqKey = process.env.GROQ_API_KEY_1 || process.env.GROQ_API_KEY || ''
  if (!apiKey && !primaryGroqKey) throw new Error('No AI provider is configured. Add OPENAI_API_KEY or GROQ_API_KEY.')
  if (!prompt.trim()) throw new Error('Prompt is required')
  const builder = mode === 'builder'
  const system = builder
    ? `You are the AlphaTekX God Craft engineering team: Product Manager, UI Designer, Frontend Engineer, Backend Engineer, QA Tester, and Deployment Engineer. AlphaTekX creates websites, apps, dashboards, courses, lessons, business systems, AI workers, templates, and tools. Return ONLY one fenced JSX code block with a self-contained React component and no imports, exports, TypeScript types, external components, or undefined icons. React, ReactDOM, and Tailwind are available globally. Match the requested product type. Implement real state, useful content, working interactions, validation, loading, error and empty states, accessibility, responsive mobile UI, and localStorage persistence when appropriate. Every visible button must have a working handler. Never return TODOs, dead buttons, static mockups, or generic dashboards.`
    : 'You are AlphaTekX, a precise creation and productivity assistant. Help the user build, learn, research, plan, and solve problems. Be honest about missing tools and never invent completed actions.'
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  const modernModel = /^(gpt-5|o[1-9])/.test(model)
  const requestBody = {
    model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
    ...(modernModel
      ? { max_completion_tokens: builder ? 8000 : 2500 }
      : { temperature: builder ? 0.2 : 0.5, max_tokens: builder ? 8000 : 2500 }),
  }
  let provider = apiKey ? 'openai' : 'groq'
  let data
  if (!apiKey) {
    data = await fetchJson('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${primaryGroqKey}` },
      body: JSON.stringify({ model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile', messages: requestBody.messages, temperature: builder ? 0.2 : 0.5, max_tokens: builder ? 5000 : 2500 }),
    })
  } else try {
    data = await fetchJson('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(requestBody),
    })
  } catch (error) {
    const groqKey = primaryGroqKey
    if (!groqKey || !/rate limit|429|tokens per min/i.test(error instanceof Error ? error.message : String(error))) throw error
    provider = 'groq'
    data = await fetchJson('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify({ model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile', messages: requestBody.messages, temperature: builder ? 0.2 : 0.5, max_tokens: builder ? 5000 : 2500 }),
    })
  }
  let content = String(data.choices?.[0]?.message?.content || '').trim()
  if (!content) throw new Error('OpenAI returned an empty response')
  const validApp = (value) => /useState|useReducer/.test(value) && /onClick|onSubmit|onChange/.test(value) && /function\s+[A-Z]|const\s+[A-Z][A-Za-z0-9_]*\s*=/.test(value)
  if (builder && !validApp(content)) {
    const repairKey = process.env.GROQ_API_KEY_2 || process.env.GROQ_API_KEY_1 || process.env.GROQ_API_KEY || ''
    if (!repairKey) throw new Error(`${provider} returned invalid application code. Please retry the build.`)
    const repaired = await fetchJson('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${repairKey}` },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: `${system}\nMANDATORY CONTRACT: Define function AlphaApp() or const AlphaApp = (). Include React.useState or useState, at least three working event handlers, and return complete JSX. Do not return HTML, explanations, imports, or exports.` },
          { role: 'user', content: `${prompt}\nYour previous answer was rejected as non-renderable. Rebuild it from scratch and obey every contract.` },
        ],
        temperature: 0.1,
        max_tokens: 5000,
      }),
    })
    provider = 'groq'
    content = String(repaired.choices?.[0]?.message?.content || '').trim()
    if (!validApp(content)) throw new Error('Groq returned invalid application code after one repair attempt.')
  }
  return builder ? { code: content, provider } : { text: content, provider }
}

async function authenticatedUser(req, supabaseUrl, anonKey) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: String(req.headers.authorization || '') } })
  return response.ok ? response.json() : null
}

const adminEmail = 'iamdan4live@gmail.com'
const supabaseConfig = () => ({
  url: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  anon: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
  service: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
})
const serviceHeaders = (service) => ({ apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' })

async function ensureProfile(user, config) {
  const headers = serviceHeaders(config.service)
  const response = await fetch(`${config.url}/rest/v1/profiles?id=eq.${user.id}&select=id,email,credits,plan`, { headers })
  const existing = (await response.json())?.[0]
  if (existing) return existing
  const created = await fetch(`${config.url}/rest/v1/profiles`, { method: 'POST', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify({ id: user.id, email: user.email || '', credits: 100, plan: 'free' }) })
  if (!created.ok) throw new Error('Could not create the user credit profile')
  return (await created.json())[0]
}

async function creditSpend(req, res) {
  const config = supabaseConfig()
  if (!config.url || !config.anon) return json(res, 503, { error: 'Credit service is not configured' })
  try {
    const user = await authenticatedUser(req, config.url, config.anon)
    if (!user) return json(res, 401, { error: 'Authentication required' })
    const body = await readBody(req); const amount = Number(body.amount)
    if (!Number.isInteger(amount) || amount <= 0) return json(res, 400, { error: 'Invalid credit amount' })
    if (String(user.email || '').toLowerCase() === adminEmail) return json(res, 200, { ok: true, admin: true, credits: null })
    if (config.service) await ensureProfile(user, config)
    const rpc = await fetch(`${config.url}/rest/v1/rpc/spend_credits`, { method: 'POST', headers: { apikey: config.anon, Authorization: String(req.headers.authorization || ''), 'Content-Type': 'application/json' }, body: JSON.stringify({ amount }) })
    const value = await rpc.json()
    if (!rpc.ok) return json(res, 402, { error: typeof value === 'object' ? value.message || 'Insufficient credits' : 'Insufficient credits' })
    return json(res, 200, { ok: true, credits: Number(value) })
  } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Credit operation failed' }) }
}

async function activityPing(req, res) {
  const config = supabaseConfig(); if (!config.url || !config.anon || !config.service) return json(res, 503, { error: 'Activity service is not configured' })
  const user = await authenticatedUser(req, config.url, config.anon); if (!user) return json(res, 401, { error: 'Authentication required' })
  await ensureProfile(user, config)
  const response = await fetch(`${config.url}/rest/v1/profiles?id=eq.${user.id}`, { method: 'PATCH', headers: serviceHeaders(config.service), body: JSON.stringify({ last_active_at: new Date().toISOString() }) })
  return response.ok ? json(res, 200, { ok: true }) : json(res, 500, { error: 'Could not update activity' })
}

async function adminStats(req, res) {
  const config = supabaseConfig(); if (!config.url || !config.anon || !config.service) return json(res, 503, { error: 'Admin service is not configured' })
  const user = await authenticatedUser(req, config.url, config.anon)
  if (!user || String(user.email || '').toLowerCase() !== adminEmail) return json(res, 403, { error: 'Admin access required' })
  let response = await fetch(`${config.url}/rest/v1/profiles?select=id,email,credits,plan,created_at,last_active_at&order=created_at.desc&limit=200`, { headers: serviceHeaders(config.service) })
  if (!response.ok) response = await fetch(`${config.url}/rest/v1/profiles?select=id,email,credits,plan,created_at&order=created_at.desc&limit=200`, { headers: serviceHeaders(config.service) })
  if (!response.ok) return json(res, 500, { error: 'Could not load live users' })
  const users = await response.json(); const now = Date.now(); const today = new Date(); today.setHours(0,0,0,0)
  return json(res, 200, { total: users.length, active: users.filter(item => item.last_active_at && now - new Date(item.last_active_at).getTime() < 15 * 60_000).length, today: users.filter(item => new Date(item.created_at).getTime() >= today.getTime()).length, users })
}

export async function verifyPaystack(req, res) {
  applyCors(req, res)
  const secret = process.env.PAYSTACK_SECRET_KEY || ''
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!secret || !supabaseUrl || !anonKey || !serviceKey) return json(res, 503, { error: 'Payment verification is not configured.' })
  try {
    const body = await readBody(req)
    const reference = String(body.reference || '')
    if (!reference) return json(res, 400, { error: 'Missing payment reference.' })
    const verified = await fetchJson(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${secret}` } })
    if (verified.data?.status !== 'success' || verified.data?.currency !== 'NGN') return json(res, 400, { error: 'Payment was not successful.' })
    const plan = verified.data.amount === 800000 ? 'pro' : verified.data.amount === 200000 ? 'free' : null
    const purchased = verified.data.amount === 800000 ? 2500 : verified.data.amount === 200000 ? 500 : 0
    if (!plan || !purchased) return json(res, 400, { error: 'Unknown AlphaTekX payment amount.' })
    const user = await authenticatedUser(req, supabaseUrl, anonKey)
    if (!user) return json(res, 401, { error: 'Authentication required.' })
    const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
    const profileResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=credits`, { headers })
    const profiles = await profileResponse.json()
    const credits = Number(profiles?.[0]?.credits ?? 100) + purchased
    const update = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ credits, plan }) })
    if (!update.ok) return json(res, 500, { error: 'Could not add credits.' })
    return json(res, 200, { verified: true, credits, plan })
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

const server = http.createServer(async (req, res) => {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return json(res, 204, {})
  if (req.method === 'POST' && req.url === '/api/paystack/verify') return verifyPaystack(req, res)
  if (req.method === 'POST' && req.url === '/api/marketplace/purchase') return purchaseMarketplace(req, res)
  if (req.method === 'POST' && req.url === '/api/credits/spend') return creditSpend(req, res)
  if (req.method === 'POST' && req.url === '/api/activity/ping') return activityPing(req, res)
  if (req.method === 'GET' && req.url === '/api/admin/stats') return adminStats(req, res)
  if (req.method === 'POST' && req.url === '/api/tools/currency') {
    try { const body = await readBody(req); return json(res, 200, await currencyPair(String(body.from || 'USD').toUpperCase(), String(body.to || 'NGN').toUpperCase(), Number(body.amount || 1))) }
    catch (error) { return json(res, 400, { error: error instanceof Error ? error.message : 'Currency conversion failed' }) }
  }
  if (req.method === 'POST' && req.url === '/api/alpha') {
    try {
      const body = await readBody(req)
      return json(res, 200, await handleAlpha(String(body.prompt || ''), String(body.mode || 'chat')))
    } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Alpha failed.' }) }
  }
  if (req.url?.startsWith('/api/')) return json(res, 404, { error: 'API route not found' })
  if (!['GET', 'HEAD'].includes(req.method || '')) return json(res, 404, { error: 'Not found' })
  return serveStatic(req, res)
})

if (!process.env.VERCEL) server.listen(port, () => process.stdout.write(`[AlphaTekX] listening on ${port}\n`))
