const KNOWN_PROVIDERS = ['openai', 'groq', 'qwen', 'kimi', 'minimax', 'flatkey']

const PROVIDER_BASE_URLS = {
  openai: 'https://api.openai.com/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  qwen: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
  kimi: 'https://api.moonshot.ai/v1/chat/completions',
  minimax: 'https://api.minimax.io/v1/chat/completions',
  flatkey: 'https://router.flatkey.ai/v1/chat/completions',
}

const ENV_KEY_VARS = {
  openai: ['OPENAI_API_KEY'],
  groq: ['GROQ_API_KEY'],
  qwen: ['QWEN_API_KEY', 'DASHSCOPE_API_KEY'],
  kimi: ['MOONSHOT_API_KEY', 'KIMI_API_KEY'],
  minimax: ['MINIMAX_API_KEY'],
  flatkey: ['FLATKEY_API_KEY', 'FLATKEY_AI_KEY'],
}

const MODEL_ENV_VARS = {
  openai: 'OPENAI_MODEL',
  groq: 'GROQ_MODEL',
  qwen: 'QWEN_MODEL',
  kimi: 'KIMI_MODEL',
  minimax: 'MINIMAX_MODEL',
  flatkey: 'FLATKEY_MODEL',
}

const DEFAULT_MODELS = {
  openai: 'gpt-4o-mini',
  groq: 'llama-3.3-70b-versatile',
  qwen: 'qwen3.7-plus',
  kimi: 'kimi-k3',
  minimax: 'MiniMax-M3',
  flatkey: 'gpt-4o',
}

let health = {}

function statusFromError(error) {
  const msg = String(error instanceof Error ? error.message : error).toLowerCase()
  if (msg.includes('key not configured') || msg.includes('api key required')) return 'missing_key'
  if (msg.includes('insufficient_quota') || msg.includes('exceeded your current quota')) return 'quota_exhausted'
  if (msg.includes('invalid api key') || msg.includes('unauthorized') || msg.includes('authentication') || msg.includes('auth')) return 'auth_failed'
  if (msg.includes('rate_limit') || msg.includes('rate limit') || msg.includes('too many requests')) return 'rate_limited'
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('abort')) return 'timeout'
  if (msg.includes('invalid response') || msg.includes('no content') || msg.includes('unexpected token')) return 'invalid_response'
  if (msg.includes('fetch failed') || msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED') || msg.includes('eai_again') || msg.includes('http 5')) return 'unavailable'
  return 'unavailable'
}

function backoffMs(failures) {
  if (failures <= 1) return 60_000
  if (failures === 2) return 300_000
  return 900_000
}

function hasKey(name) {
  const vars = ENV_KEY_VARS[name] || []
  return vars.some(v => process.env[v] && String(process.env[v]).trim().length > 0)
}

function getConfiguredStatus(name) {
  if (hasKey(name)) return 'configured'
  return 'missing_key'
}

function reset(name) {
  health[name] = { status: getConfiguredStatus(name), failures: 0, disabledUntil: 0, lastChecked: 0, latencyMs: null, lastError: '' }
}

function ensure(name) {
  if (!health[name]) reset(name)
  return health[name]
}

export function recordProviderResult(name, success, error, latencyMs = 0) {
  const h = ensure(name)
  h.lastChecked = Date.now()
  h.latencyMs = latencyMs
  if (success) {
    h.status = 'healthy'
    h.failures = 0
    h.disabledUntil = 0
    h.lastError = ''
    return
  }
  const status = statusFromError(error)
  h.status = status
  h.lastError = status === 'missing_key' ? '' : String(error instanceof Error ? error.message : error).slice(0, 200)
  if (status !== 'missing_key') {
    h.failures = (h.failures || 0) + 1
    h.disabledUntil = Date.now() + backoffMs(h.failures)
  }
}

export function isHealthy(name) {
  const h = ensure(name)
  if (h.status === 'missing_key') return false
  if (h.disabledUntil && h.disabledUntil > Date.now()) return false
  return h.status === 'configured' || h.status === 'healthy' || h.status === 'unknown'
}

export function canAttempt(name) {
  const h = ensure(name)
  if (!hasKey(name)) return false
  if (h.disabledUntil && h.disabledUntil > Date.now()) return false
  return true
}

export function getProviderHealth(name) {
  const h = ensure(name)
  return {
    name,
    status: h.status,
    configured: hasKey(name),
    healthy: isHealthy(name),
    canAttempt: canAttempt(name),
    lastChecked: h.lastChecked,
    latencyMs: h.latencyMs,
    lastError: h.lastError,
    disabledUntil: h.disabledUntil,
    failures: h.failures,
  }
}

export function getAllProviderHealth() {
  return KNOWN_PROVIDERS.map(getProviderHealth)
}

export function getHealthyProviders() {
  return KNOWN_PROVIDERS.filter(isHealthy)
}

export function getAttemptableProviders() {
  return KNOWN_PROVIDERS.filter(canAttempt)
}

export function getProviderBaseUrl(name) {
  return PROVIDER_BASE_URLS[name] || ''
}

export function getProviderModel(name) {
  const envVar = MODEL_ENV_VARS[name]
  return (envVar && process.env[envVar]) || DEFAULT_MODELS[name] || ''
}

export function getProviderEnvVar(name) {
  const vars = ENV_KEY_VARS[name] || []
  return vars.find(v => process.env[v] && String(process.env[v]).trim()) || vars[0] || ''
}

export function getProviderConfig(name) {
  return {
    name,
    baseUrl: getProviderBaseUrl(name),
    envVar: getProviderEnvVar(name),
    model: getProviderModel(name),
    configured: hasKey(name),
    status: getProviderHealth(name),
  }
}

export function getAllProviderConfigs() {
  return KNOWN_PROVIDERS.map(getProviderConfig)
}

export async function checkProviderHealth(name, callProvider) {
  if (!hasKey(name)) {
    reset(name)
    return getProviderHealth(name)
  }
  const h = ensure(name)
  if (h.disabledUntil && h.disabledUntil > Date.now()) {
    return getProviderHealth(name)
  }
  const messages = [{ role: 'user', content: 'Reply with a short JSON object {"ok": true}' }]
  try {
    const result = await callProvider(name, messages, false, true, 500)
    const text = String(result.data.choices?.[0]?.message?.content || '').trim()
    if (!text) throw new Error('No content in provider response')
    const parsed = JSON.parse(text.replace(/```json\s*([\s\S]*?)```/i, '$1').trim())
    if (!parsed.ok) throw new Error('Unexpected provider response')
  } catch (error) {
    // callProvider already records the result; we only rethrow to surface the failure to the caller
  }
  return getProviderHealth(name)
}

export function getAdminProviderDiagnostics() {
  const roleEnv = (role) => process.env[`ALPHA_${role}_PROVIDER`] || process.env[`AI_ROLE_${role}_PROVIDER`] || process.env[`AI_${role}_PROVIDER`] || ''
  return {
    providers: getAllProviderHealth(),
    roles: {
      fast: roleEnv('FAST'),
      content: roleEnv('CONTENT'),
      reasoning: roleEnv('REASONING'),
      fallback: roleEnv('FALLBACK'),
    },
    defaultOrder: (process.env.BUILDER_PROVIDER_ORDER || 'flatkey,openai,qwen,kimi,minimax,groq').split(',').map(s => s.trim()).filter(Boolean),
  }
}

export function resetProviderHealth(name) {
  if (name) reset(name)
  else KNOWN_PROVIDERS.forEach(reset)
}
