// liveVerifier.js — The Restore Engine
// Prove a leaked credential is STILL LIVE (not just present) by calling the
// vendor's read-only verification endpoint. Never mutates anything: only
// read-only GET calls (models list, balance, auth.test, GetCallerIdentity).
//
// `candidates` are the raw values the scanner found internally; only masked
// values + a boolean ever appear in the returned report objects.

import { createHmac, createHash } from 'node:crypto'
import { maskSecret } from './secretHunter.js'

const READ_ENDPOINTS = {
  OPENAI_API_KEY: { url: 'https://api.openai.com/v1/models', method: 'GET', auth: 'Bearer', note: 'OpenAI live key (read /v1/models)' },
  OPENAI_PROJECT_KEY: { url: 'https://api.openai.com/v1/models', method: 'GET', auth: 'Bearer', note: 'OpenAI live project key (read /v1/models)' },
  OPENAI_ORG_KEY: { url: 'https://api.openai.com/v1/organizations', method: 'GET', auth: 'Bearer', note: 'OpenAI org key (read /v1/organizations)' },
  ANTHROPIC_API_KEY: { url: 'https://api.anthropic.com/v1/models', method: 'GET', auth: 'Bearer', note: 'Anthropic live key (read /v1/models)' },
  GROQ_API_KEY: { url: 'https://api.groq.com/openai/v1/models', method: 'GET', auth: 'Bearer', note: 'Groq live key (read /v1/models)' },
  STRIPE_SECRET_KEY: { url: 'https://api.stripe.com/v1/balance', method: 'GET', auth: 'Bearer', note: 'Stripe live key (read /v1/balance)' },
  STRIPE_RESTRICTED_KEY: { url: 'https://api.stripe.com/v1/balance', method: 'GET', auth: 'Bearer', note: 'Stripe live restricted key (read /v1/balance)' },
  PAYSTACK_SECRET_KEY: { url: 'https://api.paystack.co/balance', method: 'GET', auth: 'Bearer', note: 'Paystack live key (read /balance)' },
  SENDGRID_API_KEY: { url: 'https://api.sendgrid.com/v3/scopes', method: 'GET', auth: 'Bearer', note: 'SendGrid live key (read /v3/scopes)' },
  GITHUB_TOKEN: { url: 'https://api.github.com/user', method: 'GET', auth: 'Bearer', note: 'GitHub live token (read /user)' },
  GITHUB_FINE_GRAINED: { url: 'https://api.github.com/user', method: 'GET', auth: 'Bearer', note: 'GitHub fine-grained token (read /user)' },
  HUGGINGFACE_TOKEN: { url: 'https://huggingface.co/api/whoami-v2', method: 'GET', auth: 'Bearer', note: 'Hugging Face live token' },
  VERCEL_TOKEN: { url: 'https://api.vercel.com/v2/user', method: 'GET', auth: 'Bearer', note: 'Vercel live token (read /v2/user)' },
  SLACK_TOKEN: { url: 'https://slack.com/api/auth.test', method: 'GET', auth: 'Bearer', note: 'Slack live token (auth.test)' },
  TELEGRAM_BOT_TOKEN: { url: 'https://api.telegram.org/bot', method: 'GET', auth: 'none', note: 'Telegram bot token (getMe)' },
  AWS_ACCESS_KEY: { url: 'https://sts.amazonaws.com/', method: 'GET', auth: 'sigv4', note: 'AWS access key (STS GetCallerIdentity)' },
}

function awsSigV4(accessKey, secretKey, service, region, method, host, path, payload, now = new Date()) {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\n`
  const signedHeaders = 'host;x-amz-date'
  const hashedPayload = createHash('sha256').update(payload).digest('hex')
  const canonicalRequest = [
    method,
    path,
    'Action=GetCallerIdentity&Version=2011-06-15',
    canonicalHeaders,
    signedHeaders,
    hashedPayload,
  ].join('\n')
  const scope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n')
  const kDate = createHmac('sha256', `AWS4${secretKey}`).update(dateStamp).digest()
  const kRegion = createHmac('sha256', kDate).update(region).digest()
  const kService = createHmac('sha256', kRegion).update(service).digest()
  const kSigning = createHmac('sha256', kService).update('aws4_request').digest()
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex')
  return {
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Content-Sha256': hashedPayload,
  }
}

async function probeOnce(config, secret, { timeout = 15000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    let url = config.url
    const headers = { 'user-agent': 'AlphaTekX-RestoreEngine/1.0 (+security research)', accept: 'application/json' }
    if (config.auth === 'Bearer') headers.authorization = `Bearer ${secret}`
    if (config.auth === 'sigv4') {
      const [accessKey] = secret.length >= 20 ? [secret.slice(0, 20)] : [secret]
      const secretAccess = secret
      const signed = awsSigV4(accessKey, secretAccess, 'sts', 'us-east-1', 'GET', 'sts.amazonaws.com', '/', 'Action=GetCallerIdentity&Version=2011-06-15')
      Object.assign(headers, signed)
    }
    if (config.auth === 'none') url = `${config.url}${secret}/getMe`

    const res = await fetch(url, { method: config.method, headers, signal: controller.signal, redirect: 'manual' })
    const status = res.status
    let body = ''
    try {
      body = await res.text()
    } catch {
      /* body not needed */
    }
    let live = false
    let detail = ''
    if (config.auth === 'none' && /"ok"\s*:\s*true/i.test(body)) live = true
    else if (config.auth === 'sigv4') live = status === 200 && /GetCallerIdentityResult/i.test(body)
    else live = status === 200
    if (status === 429) detail = 'rate-limited (endpoint reachable)'
    if (status === 401 || status === 403) detail = 'invalid or revoked'
    return { statusCode: status, isLive: live, detail, bodyPreview: body.slice(0, 120) }
  } catch {
    return { statusCode: 0, isLive: false, detail: 'unreachable or timed out', bodyPreview: '' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Check which leaked secrets are still live on the vendor side.
 * @param {Array<{kind:string, value:string, keyName:string}>} candidates raw values held in-memory only
 * @param {{progress?:(pct:number,label:string)=>void}} [options]
 * @returns {Promise<Array<{kind:string, keyName:string, maskedValue:string, isLive:boolean, provider:string, note:string, latencyMs:number}>>}
 */
export async function liveVerifier(candidates, { progress = () => {} } = {}) {
  const unique = []
  for (const candidate of candidates || []) {
    const endpoint = READ_ENDPOINTS[candidate.kind]
    if (!endpoint || !candidate.value) continue
    const already = unique.some(u => u.kind === candidate.kind && u.value === candidate.value)
    if (!already) unique.push({ ...candidate, endpoint })
  }
  if (!unique.length) return []

  const results = []
  let index = 0
  for (const candidate of unique) {
    index += 1
    progress(Math.round((index / unique.length) * 100), `verifying ${candidate.kind.toLowerCase().replaceAll('_', ' ')}`)
    const started = Date.now()
    const probe = await probeOnce(candidate.endpoint, candidate.value)
    results.push({
      kind: candidate.kind,
      keyName: candidate.keyName || candidate.kind,
      maskedValue: maskSecret(candidate.value),
      isLive: probe.isLive,
      isLiveVerified: probe.statusCode !== 0,
      provider: candidate.endpoint.note,
      note: probe.isLive ? 'key is live right now' : (probe.detail || 'not live'),
      statusCode: probe.statusCode,
      latencyMs: Date.now() - started,
    })
  }
  return results
}

export default liveVerifier
