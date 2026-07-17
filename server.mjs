import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { google } from 'googleapis'

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
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
  const founderName = 'Daniel Thompson'
  const system = builder
    ? `YOU ARE ALPHATEKX - GOD CRAFT OS

IDENTITY:
Name: AlphaTekX
Tagline: Turn ideas into reality
Founder and CEO: ${founderName}, Nigeria
Developed by: AlphaTekX Team
URL: https://alphatekx.name.ng
You are not a chatbot. You are a team of 6 world-class experts working in parallel to build real products.

YOUR TEAM:
1. Product Manager - Breaks idea into PRD, user stories, features
2. UI/UX Designer - Designs premium Linear/Stripe-level UI
3. Frontend Engineer - Writes production React + Tailwind
4. Backend Engineer - Writes server logic, APIs, integrations
5. Database Architect - Designs Supabase tables, RLS, storage
6. QA & Deployment Engineer - Tests, fixes bugs, prepares launch

CORE LAW - ONE BUILDER TO RULE ALL:
There is NO separate App Builder, Business Builder, Website Builder. There is ONE BUILDER = YOU.
You analyze user intent and build whatever is needed:

IF user says "Build app/website/dashboard/tool" -> Build frontend + backend + DB if needed
IF user says "Teach me / Learn / Course / Explain" -> Become MENTOR MODE: Build learning platform with lessons, code examples, quizzes, progress tracking, certificates
IF user says "Start business / POS / Ecommerce / Startup" -> Become BUSINESS OS: Build landing + dashboard + Supabase DB + Paystack payments + inventory + analytics + business plan
IF user says "Send email / Connect Gmail / Add to Sheets / WhatsApp / When X happens do Y" -> Become AUTOMATION OS: Build app + wire real integrations. Use Gmail API, Google Sheets API via server.mjs tools when available.

You NEVER ask user what type to build. You DECIDE and BUILD.

BUILD RULES - NON NEGOTIABLE:
1. REAL CODE ONLY - No mock, no lorem ipsum, no via.placeholder.com, no TODO comments. Every button works, every form validates, every page responsive.
2. PREMIUM DESIGN - Use Tailwind. rounded-2xl, shadow-sm, hover:scale-105 transition-all, backdrop-blur, Inter font. Look like Linear, Stripe, Vercel. Never ugly.
3. REAL IMAGES - Use https://images.unsplash.com/photo-... with real relevant photos, or https://api.dicebear.com for avatars. NEVER via.placeholder.com/150.
4. FULL FUNCTIONALITY - If you build courses, include lessons array, quiz with keyword check, progress bar with localStorage per lesson, enroll modal not alert(). If contact form, show success animation.
5. SINGLE FILE OUTPUT - Define a React component named AlphaApp containing the full app. Use React.useState and other React globals. No imports or exports. Keep the file under 450 lines so it cannot be truncated.
6. GMAIL TOOL - AlphaTekX has POST /api/gmail/send with {to, subject, html, text}. When the signed-in user asks for an email workflow, use this endpoint from a real submit handler and show loading, success, disconnected, and error states. Never embed Google tokens or API keys in generated code. Gmail must be connected in Vault before sending.

OUTPUT FORMAT - STRICT:
Return one fenced jsx code block and nothing else. It must start with function AlphaApp() and end with ReactDOM.createRoot(document.getElementById('root')).render(<AlphaApp />).

EXAMPLE USER IDEAS YOU MUST HANDLE:
- "Build website for learning coding" -> Full premium learning platform
- "Build POS for my provision store" -> Dashboard with products, sales, Paystack, and receipt printing
- "Teach me JavaScript" -> Mentor mode with 10 interactive lessons
- "Build business for selling shoes and send email when someone buys" -> Ecommerce, Supabase orders, and a real integration-ready Gmail workflow

You are AlphaTekX. You turn ideas into reality. AlphaTekX was founded and is led by ${founderName}, Founder and CEO, and developed by the AlphaTekX Team. You do things, not just build things. Build now.`
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
    if (!groqKey) throw error
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
const supabaseConfig = () => ({
  url: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  anon: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
  service: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
})
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

const gmailScopes = ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/userinfo.email', 'openid', 'email']
const publicAppUrl = () => String(process.env.PUBLIC_APP_URL || 'https://alphatekx.name.ng').replace(/\/$/, '')
const googleClientId = () => process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || ''
const googleClientSecret = () => process.env.GOOGLE_CLIENT_SECRET || ''
const googleRedirectUri = () => process.env.GOOGLE_REDIRECT_URI || process.env.VITE_GOOGLE_REDIRECT_URI || `${publicAppUrl()}/auth/google/callback`
const googleConfigured = () => Boolean(googleClientId() && googleClientSecret() && googleRedirectUri())
const googleClient = () => new google.auth.OAuth2(googleClientId(), googleClientSecret(), googleRedirectUri())
const oauthStateKey = (config) => createHash('sha256').update(process.env.OAUTH_STATE_SECRET || process.env.API_KEY_ENCRYPTION_KEY || config.service).digest()

function createOAuthState(userId, config) {
  const payload = Buffer.from(JSON.stringify({ userId, expires: Date.now() + 10 * 60_000, nonce: randomBytes(16).toString('hex') })).toString('base64url')
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

async function getGmailIntegration(userId, config) {
  const response = await fetch(`${config.url}/rest/v1/user_integrations?user_id=eq.${encodeURIComponent(userId)}&provider=eq.google_gmail&select=*`, { headers: serviceHeaders(config.service) })
  if (!response.ok) throw new Error('Gmail integration storage is unavailable. Run supabase/gmail-integration.sql.')
  return (await response.json())?.[0] || null
}

async function startGoogleConnection(req, res) {
  const config = supabaseConfig()
  if (!config.url || !config.anon || !config.service || !googleConfigured()) return json(res, 503, { error: 'Google OAuth is not configured on Render.' })
  const user = await authenticatedUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const url = googleClient().generateAuthUrl({ access_type: 'offline', prompt: 'consent', include_granted_scopes: true, scope: gmailScopes, state: createOAuthState(user.id, config), login_hint: user.email || undefined })
  return json(res, 200, { url })
}

async function googleCallback(req, res) {
  const destination = new URL('/vault', publicAppUrl())
  try {
    const config = supabaseConfig()
    if (!config.url || !config.service || !googleConfigured()) throw new Error('Google OAuth is not configured')
    const requestUrl = new URL(req.url || '/', publicAppUrl())
    if (requestUrl.searchParams.get('error')) throw new Error(requestUrl.searchParams.get('error_description') || 'Google permission was not granted')
    const code = requestUrl.searchParams.get('code')
    const state = verifyOAuthState(requestUrl.searchParams.get('state'), config)
    if (!code) throw new Error('Google did not return an authorization code')
    const oauth = googleClient()
    const { tokens } = await oauth.getToken(code)
    oauth.setCredentials(tokens)
    const profile = await google.oauth2({ version: 'v2', auth: oauth }).userinfo.get()
    const email = String(profile.data.email || '')
    if (!email || !tokens.access_token) throw new Error('Google did not return the Gmail account details')
    const existing = await getGmailIntegration(state.userId, config)
    const key = encryptionKey(config)
    const refreshToken = tokens.refresh_token || (existing?.refresh_token ? decryptSecret(existing.refresh_token, key) : '')
    const record = {
      user_id: state.userId,
      provider: 'google_gmail',
      access_token: encryptSecret(tokens.access_token, key),
      refresh_token: refreshToken ? encryptSecret(refreshToken, key) : null,
      expiry_date: tokens.expiry_date || null,
      email,
      scopes: gmailScopes,
      updated_at: new Date().toISOString(),
    }
    const saved = await fetch(`${config.url}/rest/v1/user_integrations?on_conflict=user_id,provider`, { method: 'POST', headers: { ...serviceHeaders(config.service), Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(record) })
    if (!saved.ok) throw new Error('Could not save the Gmail connection')
    destination.searchParams.set('gmail', 'connected')
  } catch (error) {
    destination.searchParams.set('gmail', 'error')
    destination.searchParams.set('reason', error instanceof Error ? error.message.slice(0, 180) : 'Google connection failed')
  }
  res.writeHead(302, { Location: destination.toString(), 'Cache-Control': 'no-store' })
  return res.end()
}

async function integrationsStatus(req, res) {
  const config = supabaseConfig()
  if (!config.url || !config.anon || !config.service) return json(res, 503, { error: 'Integrations are not configured.' })
  const user = await authenticatedUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const integration = await getGmailIntegration(user.id, config)
  return json(res, 200, { gmail: { connected: Boolean(integration), email: integration?.email || null } })
}

async function disconnectGmail(req, res) {
  const config = supabaseConfig()
  if (!config.url || !config.anon || !config.service) return json(res, 503, { error: 'Integrations are not configured.' })
  const user = await authenticatedUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const integration = await getGmailIntegration(user.id, config)
  if (integration?.access_token) {
    try { await googleClient().revokeToken(decryptSecret(integration.access_token, encryptionKey(config))) } catch {}
  }
  const response = await fetch(`${config.url}/rest/v1/user_integrations?user_id=eq.${encodeURIComponent(user.id)}&provider=eq.google_gmail`, { method: 'DELETE', headers: serviceHeaders(config.service) })
  if (!response.ok) throw new Error('Could not disconnect Gmail')
  return json(res, 200, { disconnected: true })
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

async function sendGmail(req, res) {
  const config = supabaseConfig()
  if (!config.url || !config.anon || !config.service || !googleConfigured()) return json(res, 503, { error: 'Gmail is not configured.' })
  const user = await authenticatedUser(req, config.url, config.anon)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const body = await readBody(req)
  const to = cleanHeader(body.to)
  const subject = cleanHeader(body.subject).slice(0, 240)
  const html = String(body.html || '').slice(0, 200_000)
  const text = String(body.text || '').slice(0, 100_000)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !subject || (!html && !text)) return json(res, 400, { error: 'A valid recipient, subject, and message are required.' })
  const integration = await getGmailIntegration(user.id, config)
  if (!integration) return json(res, 409, { error: 'Connect Gmail in Vault before sending email.' })
  const key = encryptionKey(config)
  const oauth = googleClient()
  oauth.setCredentials({ access_token: decryptSecret(integration.access_token, key), refresh_token: integration.refresh_token ? decryptSecret(integration.refresh_token, key) : undefined, expiry_date: integration.expiry_date || undefined })
  await oauth.getAccessToken()
  const refreshed = oauth.credentials
  if (refreshed.access_token && (refreshed.access_token !== decryptSecret(integration.access_token, key) || refreshed.expiry_date !== integration.expiry_date)) {
    await fetch(`${config.url}/rest/v1/user_integrations?id=eq.${encodeURIComponent(integration.id)}`, { method: 'PATCH', headers: serviceHeaders(config.service), body: JSON.stringify({ access_token: encryptSecret(refreshed.access_token, key), refresh_token: refreshed.refresh_token ? encryptSecret(refreshed.refresh_token, key) : integration.refresh_token, expiry_date: refreshed.expiry_date || integration.expiry_date, updated_at: new Date().toISOString() }) })
  }
  const sent = await google.gmail({ version: 'v1', auth: oauth }).users.messages.send({ userId: 'me', requestBody: { raw: gmailRawMessage({ from: integration.email, to, subject, text, html }) } })
  return json(res, 200, { success: true, messageId: sent.data.id, threadId: sent.data.threadId })
}

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
    if (verified.data?.customer?.email && String(verified.data.customer.email).toLowerCase() !== String(user.email || '').toLowerCase()) return json(res, 400, { error: 'Payment email does not match the signed-in account.' })
    const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
    const complete = await fetch(`${supabaseUrl}/rest/v1/rpc/complete_credit_purchase`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_user_id: user.id, p_reference: reference, p_amount: verified.data.amount, p_credits: purchased, p_plan: plan }) })
    const credits = await complete.json()
    if (!complete.ok) return json(res, 400, { error: credits.message || 'Could not add credits.' })
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

const validSlug = (value) => /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(value)
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
const scriptJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')

export function normalizePublishedCode(rawCode) {
  const value = String(rawCode || '')
  const fenced = value.match(/```(?:tsx|jsx|javascript|js)?\s*([\s\S]*?)```/i)?.[1] || value
  let code = fenced
    .replace(/^\s*import[^;]+;?\s*$/gm, '')
    .replace(/export\s+default\s+/g, '')
    .trim()
  if (!/ReactDOM\.createRoot/.test(code)) {
    const component = code.match(/function\s+([A-Z][A-Za-z0-9_]*)\s*\(/)?.[1]
      || code.match(/const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*(?:\([^)]*\)|[^=])\s*=>/)?.[1]
    if (component) code += `\nReactDOM.createRoot(document.getElementById('root')).render(<${component} />);`
  }
  return code.replace(/<\/script/gi, '<\\/script')
}

export function publishedAppDocument(creation) {
  const slug = String(creation.slug)
  const title = escapeHtml(creation.title || slug)
  const code = normalizePublishedCode(creation.code)
  const storageBridge = `<script>const __alphaState=(()=>{try{return JSON.parse(__ALPHA_STORAGE_JSON__||'{}')}catch{return {}}})();const __alphaStorage={getItem:key=>Object.prototype.hasOwnProperty.call(__alphaState,key)?String(__alphaState[key]):null,setItem:(key,value)=>{__alphaState[key]=String(value);parent.postMessage({type:'alphatekx-app-storage',slug:${scriptJson(slug)},state:__alphaState},'*')},removeItem:key=>{delete __alphaState[key];parent.postMessage({type:'alphatekx-app-storage',slug:${scriptJson(slug)},state:__alphaState},'*')},clear:()=>{Object.keys(__alphaState).forEach(key=>delete __alphaState[key]);parent.postMessage({type:'alphatekx-app-storage',slug:${scriptJson(slug)},state:__alphaState},'*')},key:index=>Object.keys(__alphaState)[index]??null,get length(){return Object.keys(__alphaState).length}};window.__alphaStorage=__alphaStorage;try{Object.defineProperty(window,'localStorage',{value:__alphaStorage,configurable:true})}catch{}</script>`
  const isHtml = /<(?:!doctype\s+html|html|body)[\s>]/i.test(String(creation.code || ''))
  const pastedHtml = String(creation.code || '')
  const pastedDocument = /<head[^>]*>/i.test(pastedHtml)
    ? pastedHtml.replace(/<head([^>]*)>/i, `<head$1>${storageBridge}`)
    : pastedHtml.replace(/<body([^>]*)>/i, `${storageBridge}<body$1>`)
  const innerDocument = isHtml
    ? pastedDocument
    : `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><base target="_blank"><script src="https://cdn.tailwindcss.com"></script><script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script><script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script><script src="https://unpkg.com/@babel/standalone/babel.min.js"></script><style>html,body,#root{min-height:100%;margin:0}*{box-sizing:border-box}.alpha-runtime-error{margin:24px;padding:16px;border:1px solid #fecaca;border-radius:12px;background:#fef2f2;color:#991b1b;font:14px system-ui}</style>${storageBridge}</head><body><div id="root"></div><script>window.addEventListener('error',event=>{const root=document.getElementById('root');if(root&&!root.childElementCount)root.innerHTML='<div class="alpha-runtime-error"><strong>This app could not start.</strong><br>'+String(event.message||'Runtime error').replace(/[&<>]/g,value=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[value]))+'</div>'});</script><script type="text/babel">const localStorage=window.__alphaStorage;${code}</script></body></html>`
  return `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="index,follow"><title>${title} — Built with AlphaTekX</title><style>html,body{width:100%;height:100%;margin:0;background:#fff}iframe{display:block;width:100%;height:100%;border:0}</style></head><body><iframe id="alpha-app" title="${title}" sandbox="allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads"></iframe><script>const frame=document.getElementById('alpha-app');const storageKey='alphatekx:published:${slug}';let stored='{}';try{stored=localStorage.getItem(storageKey)||'{}'}catch{}const template=${scriptJson(innerDocument)};frame.srcdoc=template.replace('__ALPHA_STORAGE_JSON__',JSON.stringify(stored).replace(/</g,'\\u003c'));addEventListener('message',event=>{if(event.source!==frame.contentWindow||event.data?.type!=='alphatekx-app-storage'||event.data?.slug!==${scriptJson(slug)})return;const state=event.data.state;if(!state||typeof state!=='object'||Array.isArray(state))return;const encoded=JSON.stringify(state);if(encoded.length>500000)return;try{localStorage.setItem(storageKey,encoded)}catch{}});</script></body></html>`
}

const requestSubdomain = (req) => {
  const host = String(req.headers.host || '').toLowerCase().split(':')[0]
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
    const creation = await fetchPublishedCreation(slug)
    if (!creation) return json(res, 404, { error: 'App not found' })
    const html = publishedAppDocument(creation)
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
      'Content-Security-Policy': "default-src 'self'; frame-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://unpkg.com; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: blob: https:; font-src 'self' data: https:; connect-src https:; object-src 'none'; base-uri 'none'; frame-ancestors *",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    })
    return req.method === 'HEAD' ? res.end() : res.end(html)
  } catch (error) {
    return json(res, 503, { error: error instanceof Error ? error.message : 'Published app unavailable' })
  }
}

async function publishCreationPath(req, res) {
  const config = supabaseConfig()
  if (!config.url || !config.anon) return json(res, 503, { error: 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to Render, then redeploy.' })
  try {
    const user = await authenticatedUser(req, config.url, config.anon)
    if (!user) return json(res, 401, { error: 'Authentication required.' })
    const body = await readBody(req)
    const creationId = String(body.creationId || '')
    const slug = String(body.slug || '').toLowerCase().trim()
    if (!/^[0-9a-f-]{36}$/i.test(creationId)) return json(res, 400, { error: 'Invalid creation.' })
    if (!validSlug(slug)) return json(res, 400, { error: 'Use 1-64 lowercase letters, numbers, or hyphens for the slug.' })
    const headers = deploymentWriteHeaders(req, config)
    const creationResponse = await fetch(`${config.url}/rest/v1/creations?id=eq.${encodeURIComponent(creationId)}&user_id=eq.${encodeURIComponent(user.id)}&select=id,title,code`, { headers })
    const creationPayload = await creationResponse.json()
    if (!creationResponse.ok) return json(res, 500, { error: creationPayload.message || 'Could not read this creation. Run supabase/path-deploy.sql first.' })
    const creation = creationPayload?.[0]
    if (!creation) return json(res, 404, { error: 'Creation not found or not owned by this account.' })
    if (!String(creation.code || '').trim()) return json(res, 400, { error: 'This creation has no application code to publish.' })
    const conflictResponse = await fetch(`${config.url}/rest/v1/creations?slug=eq.${encodeURIComponent(slug)}&id=neq.${encodeURIComponent(creationId)}&select=id&limit=1`, { headers })
    const conflicts = await conflictResponse.json()
    if (!conflictResponse.ok) return json(res, 500, { error: conflicts.message || 'Could not validate the slug. Run supabase/path-deploy.sql first.' })
    if (conflicts.length) return json(res, 409, { error: 'That app address is already in use. Choose another slug.' })
    const baseUrl = String(process.env.PUBLIC_APP_URL || 'https://alphatekx.name.ng').replace(/\/$/, '')
    const deploymentUrl = `${baseUrl}/app/${slug}`
    const updateResponse = await fetch(`${config.url}/rest/v1/creations?id=eq.${encodeURIComponent(creationId)}&user_id=eq.${encodeURIComponent(user.id)}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ slug, owner_id: user.id, published: true, status: 'live', deployment_url: deploymentUrl }),
    })
    const updated = await updateResponse.json()
    if (!updateResponse.ok || !updated?.length) return json(res, 500, { error: updated.message || 'Could not publish this creation. Run supabase/path-deploy.sql first.' })
    return json(res, 200, { slug, path: `/app/${slug}`, url: deploymentUrl })
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : 'Publication failed.' })
  }
}

async function publishPastedHtml(req, res) {
  const config = supabaseConfig()
  if (!config.url || !config.anon) return json(res, 503, { error: 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to Render, then redeploy.' })
  try {
    const user = await authenticatedUser(req, config.url, config.anon)
    if (!user) return json(res, 401, { error: 'Authentication required.' })
    const body = await readBody(req)
    const title = String(body.title || '').trim().slice(0, 120)
    const slug = String(body.slug || '').toLowerCase().trim()
    const html = String(body.html || '').trim()
    if (!title) return json(res, 400, { error: 'Enter an app name.' })
    if (!validSlug(slug)) return json(res, 400, { error: 'Use 1-64 lowercase letters, numbers, or hyphens for the slug.' })
    if (!/<(?:!doctype\s+html|html|body)[\s>]/i.test(html)) return json(res, 400, { error: 'Paste a complete HTML document.' })
    if (Buffer.byteLength(html, 'utf8') > 900_000) return json(res, 413, { error: 'HTML must be smaller than 900 KB.' })
    const headers = deploymentWriteHeaders(req, config)
    const existingResponse = await fetch(`${config.url}/rest/v1/creations?slug=eq.${encodeURIComponent(slug)}&select=id,user_id,mission_id&limit=1`, { headers })
    const existingPayload = await existingResponse.json()
    if (!existingResponse.ok) return json(res, 500, { error: existingPayload.message || 'Could not validate the slug. Run supabase/path-deploy.sql first.' })
    const existing = existingPayload?.[0]
    if (existing && existing.user_id !== user.id) return json(res, 409, { error: 'That subdomain is already in use.' })
    const baseUrl = String(process.env.PUBLIC_APP_URL || 'https://alphatekx.name.ng').replace(/\/$/, '')
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
      if (!updatedResponse.ok || !updated?.length) return json(res, 500, { error: updated.message || 'Could not update this deployment.' })
    } else {
      const missionId = randomUUID()
      const missionResponse = await fetch(`${config.url}/rest/v1/missions`, {
        method: 'POST', headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({ id: missionId, user_id: user.id, title: `Deploy ${title}`, goal: `Deploy pasted HTML for ${title}`, status: 'completed', progress: 100 }),
      })
      if (!missionResponse.ok) return json(res, 500, { error: 'Could not create the deployment record.' })
      const creationResponse = await fetch(`${config.url}/rest/v1/creations`, {
        method: 'POST', headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({ id: creationId, mission_id: missionId, user_id: user.id, owner_id: user.id, slug, title, code: html, type: 'html', status: 'live', files: [{ path: 'index.html', code: html }], published: true, deployment_url: subdomainUrl }),
      })
      const created = await creationResponse.json()
      if (!creationResponse.ok || !created?.length) {
        await fetch(`${config.url}/rest/v1/missions?id=eq.${encodeURIComponent(missionId)}`, { method: 'DELETE', headers })
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

const server = http.createServer(async (req, res) => {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return json(res, 204, {})
  const subdomain = requestSubdomain(req)
  if (subdomain && ['GET', 'HEAD'].includes(req.method || '')) return servePublishedCreation(req, res, subdomain)
  if (subdomain) return json(res, 404, { error: 'App route not found' })
  if (req.method === 'GET' && req.url?.startsWith('/auth/google/callback')) return googleCallback(req, res)
  if (req.method === 'POST' && req.url === '/api/integrations/google/start') {
    try { return await startGoogleConnection(req, res) } catch (error) { return json(res, 400, { error: error instanceof Error ? error.message : 'Google connection failed' }) }
  }
  if (req.method === 'GET' && req.url === '/api/integrations/status') {
    try { return await integrationsStatus(req, res) } catch (error) { return json(res, 400, { error: error instanceof Error ? error.message : 'Could not load integrations' }) }
  }
  if (req.method === 'DELETE' && req.url === '/api/integrations/gmail') {
    try { return await disconnectGmail(req, res) } catch (error) { return json(res, 400, { error: error instanceof Error ? error.message : 'Could not disconnect Gmail' }) }
  }
  if (req.method === 'POST' && req.url === '/api/gmail/send') {
    try { return await sendGmail(req, res) } catch (error) { return json(res, 400, { error: error instanceof Error ? error.message : 'Email could not be sent' }) }
  }
  if (req.method === 'GET' && req.url === '/api/paystack/status') {
    const required = { PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY }
    const missing = Object.entries(required).filter(([, value]) => !value).map(([name]) => name)
    return json(res, missing.length ? 503 : 200, { ready: missing.length === 0, missing, error: missing.length ? `Paystack needs these Render variables: ${missing.join(', ')}` : undefined })
  }
  if (req.method === 'POST' && req.url === '/api/paystack/verify') return verifyPaystack(req, res)
  if (req.method === 'POST' && req.url === '/api/marketplace/purchase') return purchaseMarketplace(req, res)
  if (req.method === 'POST' && req.url === '/api/creations/publish') return publishCreationPath(req, res)
  if (req.method === 'POST' && req.url === '/api/creations/publish-code') return publishPastedHtml(req, res)
  if (req.method === 'POST' && req.url === '/api/credits/spend') return creditSpend(req, res)
  if (req.method === 'POST' && req.url === '/api/activity/ping') return activityPing(req, res)
  if (req.method === 'GET' && req.url === '/api/admin/stats') return adminStats(req, res)
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
  if (req.method === 'POST' && req.url === '/api/alpha') {
    try {
      const body = await readBody(req)
      return json(res, 200, await handleAlpha(String(body.prompt || ''), String(body.mode || 'chat')))
    } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : 'Alpha failed.' }) }
  }
  if (req.url?.startsWith('/api/')) return json(res, 404, { error: 'API route not found' })
  if (!['GET', 'HEAD'].includes(req.method || '')) return json(res, 404, { error: 'Not found' })
  const appMatch = new URL(req.url || '/', 'http://localhost').pathname.match(/^\/app\/([^/]+)\/?$/)
  if (appMatch) return servePublishedCreation(req, res, decodeURIComponent(appMatch[1]))
  return serveStatic(req, res)
})

if (!process.env.VERCEL) server.listen(port, () => process.stdout.write(`[AlphaTekX] listening on ${port}\n`))
