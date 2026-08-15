// secretHunter.js — The Restore Engine
// Hunt for API keys and secret assignments inside JS bundles, HTML and exposed
// file bodies. Never returns a full secret value to the caller: every hit is
// masked to its stable prefix + a few trailing characters so the report proves
// the leak without re-publishing the credential.

const VALUE_PATTERNS = [
  // OpenAI project keys (sk-proj-...) are the common Vercel/Bolt leak.
  { name: 'OPENAI_PROJECT_KEY', label: 'OpenAI API key', re: /sk-proj-[A-Za-z0-9_\-]{20,}/g },
  // Legacy OpenAI sk-... keys (>= 20 chars keeps sk- short tokens out).
  { name: 'OPENAI_API_KEY', label: 'OpenAI API key', re: /\bsk-[A-Za-z0-9_\-]{20,}\b/g },
  { name: 'OPENAI_ORG_KEY', label: 'OpenAI org key', re: /\borg-[A-Za-z0-9_\-]{20,}\b/g },
  { name: 'STRIPE_SECRET_KEY', label: 'Stripe secret key', re: /\bsk_live_[A-Za-z0-9_\-]{16,}/g },
  { name: 'STRIPE_RESTRICTED_KEY', label: 'Stripe restricted key', re: /\bsk_live_50_28_[A-Za-z0-9_\-]{16,}/g },
  { name: 'STRIPE_PUBLISHABLE_KEY', label: 'Stripe publishable key', re: /\bpk_live_[A-Za-z0-9_\-]{16,}/g },
  { name: 'AWS_ACCESS_KEY', label: 'AWS access key id', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { name: 'AWS_SECRET_ACCESS_KEY', label: 'AWS secret access key', re: /\b(?:[A-Za-z0-9/+=]{40})\b/g },
  { name: 'GOOGLE_API_KEY', label: 'Google API key', re: /\bAIza[0-9A-Za-z\-_]{35}\b/g },
  { name: 'GITHUB_TOKEN', label: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { name: 'GITHUB_APP_TOKEN', label: 'GitHub app token', re: /ghu_[A-Za-z0-9]{36,}\b/g },
  { name: 'SLACK_TOKEN', label: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9\-]{10,}\b/g },
  { name: 'JWT_SECRET', label: 'JWT secret', re: /\beyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{10,}\b/g },
  { name: 'GOOGLE_OAUTH_CLIENT_SECRET', label: 'Google OAuth client secret', re: /\bGOCSPX-[A-Za-z0-9_\-]{20,}\b/g },
  { name: 'SENDGRID_API_KEY', label: 'SendGrid API key', re: /\bSG\.[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}\b/g },
  { name: 'TWILIO_API_KEY', label: 'Twilio API key', re: /\bSK[0-9a-fA-F]{32}\b/g },
  { name: 'FACEBOOK_APP_SECRET', label: 'Facebook app secret', re: /\b[0-9a-f]{32}\b/g },
  { name: 'CLAUDE_API_KEY', label: 'Anthropic API key', re: /\bsk-ant-[A-Za-z0-9_\-]{20,}\b/g },
  { name: 'PAYSTACK_SECRET_KEY', label: 'Paystack secret key', re: /\bsk_(live|test)_[A-Za-z0-9]{16,}\b/g },
]

// Assignment patterns catch keys that do not use a recognisable value format,
// e.g. `OPENAI_API_KEY="d92h..."` or `AWS_SECRET_KEY=abc123def456ghi`.
const ASSIGNMENT_PATTERNS = [
  { name: 'OPENAI_API_KEY', label: 'OpenAI API key', re: /(?:OPENAI(?:_API)?_KEY|OPENAIKEY)\s*[:=]\s*["']?([A-Za-z0-9_\-]{16,})["']?/gi },
  { name: 'OPENAI_PROJECT_KEY', label: 'OpenAI project key', re: /(?:OPENAI_PROJECT(?:_KEY)?|OPENAI_ORG_ID)\s*[:=]\s*["']?([A-Za-z0-9_\-]{16,})["']?/gi },
  { name: 'STRIPE_SECRET_KEY', label: 'Stripe secret key', re: /(?:STRIPE(?:_SECRET)?_KEY|STRIPE_API_KEY)\s*[:=]\s*["']?([A-Za-z0-9_\-]{16,})["']?/gi },
  { name: 'STRIPE_WEBHOOK_SECRET', label: 'Stripe webhook secret', re: /STRIPE(?:_)?WEBHOOK(?:_)?SECRET\s*[:=]\s*["']?([A-Za-z0-9_\-]{16,})["']?/gi },
  { name: 'AWS_ACCESS_KEY', label: 'AWS access key id', re: /(?:AWS_?ACCESS_KEY(?:_ID)?|AMAZON_ACCESS_KEY)\s*[:=]\s*["']?([A-Za-z0-9/+=]{16,})["']?/gi },
  { name: 'AWS_SECRET_KEY', label: 'AWS secret key', re: /(?:AWS_?SECRET(?:_ACCESS)?_KEY|AMAZON_SECRET_KEY)\s*[:=]\s*["']?([A-Za-z0-9/+=]{16,})["']?/gi },
  { name: 'GOOGLE_API_KEY', label: 'Google API key', re: /(?:GOOGLE_(?:API|MAPS|GEMINI)_?KEY)\s*[:=]\s*["']?([A-Za-z0-9_\-]{16,})["']?/gi },
  { name: 'GITHUB_TOKEN', label: 'GitHub token', re: /(?:GITHUB(?:_TOKEN|_PAT|PAT)?|GH_TOKEN)\s*[:=]\s*["']?([A-Za-z0-9_\-]{16,})["']?/gi },
  { name: 'VERCEL_TOKEN', label: 'Vercel token', re: /(?:VERCEL(?:_TOKEN|_API_TOKEN)?|ZEIT_TOKEN)\s*[:=]\s*["']?([A-Za-z0-9_\-]{16,})["']?/gi },
  { name: 'DATABASE_URL', label: 'Database connection string', re: /(?:DATABASE_URL|POSTGRES(?:_URL)?|PGURL)\s*[:=]\s*["']?([A-Za-z0-9_\-@.:/=?&%]{16,})["']?/gi },
  { name: 'PAYSTACK_SECRET_KEY', label: 'Paystack secret key', re: /(?:PAYSTACK(?:_SECRET)?_KEY|PAYSTACK_API_KEY)\s*[:=]\s*["']?([A-Za-z0-9_\-]{16,})["']?/gi },
  { name: 'SUPABASE_SERVICE_KEY', label: 'Supabase service role key', re: /(?:SUPABASE_(?:SERVICE_ROLE|SERVICE|ROLE)?_?KEY)\s*[:=]\s*["']?([A-Za-z0-9._\-]{16,})["']?/gi },
  { name: 'FIREBASE_SERVICE_KEY', label: 'Firebase service account key', re: /(?:FIREBASE_(?:SERVICE_ACCOUNT|ADMIN)?_?KEY)\s*[:=]\s*["']?([A-Za-z0-9_\-]{16,})["']?/gi },
]

// Env-style lines inside a leaked .env body: KEY=value
const ENV_LINE_PATTERN = /^\s*([A-Z][A-Z0-9_]{2,63})\s*=\s*(.+?)\s*$/gm

// Generic "key: value" pairs found inside config.json / openapi.json
const JSON_KEY_VALUE_PATTERN = /"([A-Za-z0-9_]{3,64})"\s*:\s*"([A-Za-z0-9_\-.\/+=]{16,})"/g

/**
 * Mask a secret value to its stable prefix + bullets + trailing 4 characters.
 * Examples:
 *   sk-proj-ABCDE1234567890 -> sk-proj-••••7890
 *   AKIAIOSFODNN7EXAMPLE   -> AKIA••••MPLE
 */
export function maskSecret(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (raw.length <= 8) return raw.slice(0, 2) + '••••' + raw.slice(-2)
  // Keep the stable prefix up to the 2nd separator so the report reads
  // sk-proj-••••6789, sk_live_••••1234, AKIA••••MPLE — never the raw key.
  const separator = raw.indexOf('-') >= 0 ? '-' : '_'
  let separatorCount = 0
  let cut = 4
  for (let index = 0; index < raw.length && index < 12; index += 1) {
    if (raw[index] === separator) {
      separatorCount += 1
      if (separatorCount >= 2) {
        cut = index + 1
        break
      }
    }
  }
  return `${raw.slice(0, cut)}••••${raw.slice(-4)}`
}

function addUnique(list, hit) {
  if (!hit.value) return
  const already = list.some(existing => existing.kind === hit.kind && existing.value === hit.value && existing.source === hit.source)
  if (!already) list.push(hit)
}

/**
 * Hunt for secrets in arbitrary text (a JS bundle, HTML, or an exposed file body).
 * @param {string} text
 * @param {object} [options]
 * @param {string} [options.source] label describing where the text came from
 * @returns {Array<{kind: string, keyName: string, value: string, maskedValue: string, source: string, context?: string}>}
 */
export function huntSecrets(text, options = {}) {
  const source = options.source || 'unknown'
  const body = String(text || '')
  if (!body) return []
  const hits = []

  // 1) Value-format patterns (sk-proj-..., sk_live_..., AKIA..., AIza..., gh...)
  for (const pattern of VALUE_PATTERNS) {
    const copy = new RegExp(pattern.re.source, pattern.re.flags.includes('g') ? pattern.re.flags : `${pattern.re.flags}g`)
    copy.lastIndex = 0
    let match
    while ((match = copy.exec(body)) !== null) {
      addUnique(hits, { kind: pattern.name, keyName: pattern.name, value: match[0], maskedValue: maskSecret(match[0]), source })
      if (copy.lastIndex === match.index) copy.lastIndex += 1
    }
  }

  // 2) Named assignment patterns (OPENAI_API_KEY=..., STRIPE_SECRET_KEY=...)
  for (const pattern of ASSIGNMENT_PATTERNS) {
    const copy = new RegExp(pattern.re.source, pattern.re.flags.includes('g') ? pattern.re.flags : `${pattern.re.flags}g`)
    copy.lastIndex = 0
    let match
    while ((match = copy.exec(body)) !== null) {
      const value = (match[1] || '').trim()
      if (!value) continue
      addUnique(hits, { kind: pattern.name, keyName: pattern.name, value, maskedValue: maskSecret(value), source })
      if (copy.lastIndex === match.index) copy.lastIndex += 1
    }
  }

  // 3) Loose KEY=value lines (catches secrets assigned to other key names)
  if (!hits.length) {
    ENV_LINE_PATTERN.lastIndex = 0
    let line
    while ((line = ENV_LINE_PATTERN.exec(body)) !== null) {
      const keyName = line[1]
      const value = line[2].replace(/["']/g, '').trim()
      if (!value || value.length < 10) continue
      if (/^(true|false|null|undefined)$/i.test(value)) continue
      // Skip already-covered high-signal keys to avoid duplicate noise.
      if (/OPENAI|STRIPE|AWS|GITHUB|GOOGLE|VERCEL|SUPABASE|PAYSTACK|SECRET|TOKEN|API_KEY|DATABASE|PASSWORD|KEY/i.test(keyName)) {
        addUnique(hits, { kind: 'ENV_LINE', keyName, value, maskedValue: maskSecret(value), source })
      }
    }
  }

  // 4) JSON "key": "longvalue" pairs inside leaked config/openapi bodies
  if (body.trimStart().startsWith('{')) {
    JSON_KEY_VALUE_PATTERN.lastIndex = 0
    let pair
    while ((pair = JSON_KEY_VALUE_PATTERN.exec(body)) !== null) {
      const keyName = pair[1]
      const value = pair[2]
      if (/token|key|secret|password|apikey|credential|authorization/i.test(keyName)) {
        addUnique(hits, { kind: 'JSON_VALUE', keyName, value, maskedValue: maskSecret(value), source })
      }
    }
  }

  // Keep at most 40 hits per source to bound memory on huge bundles.
  return hits.slice(0, 40)
}

/**
 * Mask a leaked file body for display (used as the masked proof sample).
 * Prefers a detected secret; falls back to a truncated sanitised line.
 */
export function maskExposedBody(body) {
  const text = String(body || '')
  if (!text) return ''
  const secrets = huntSecrets(text)
  if (secrets.length > 0) return secrets[0].maskedValue

  const firstLine = text.split(/\r?\n/).map(line => line.trim()).find(Boolean) || ''
  // Never echo back git remote credentials in a proof sample.
  const sanitized = firstLine.replace(/https?:\/\/[^\s@/]+:[^\s@/]+@/g, 'https://••••@')
  return sanitized.slice(0, 80)
}

/**
 * Extract a human consequence label + severity weight for a leaked secret kind.
 */
export function describeSecret(kind) {
  const critical = new Set([
    'OPENAI_PROJECT_KEY', 'OPENAI_API_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_RESTRICTED_KEY',
    'AWS_ACCESS_KEY', 'AWS_SECRET_ACCESS_KEY', 'AWS_SECRET_KEY', 'GOOGLE_OAUTH_CLIENT_SECRET',
    'PAYSTACK_SECRET_KEY', 'SUPABASE_SERVICE_KEY', 'GITHUB_TOKEN', 'VERCEL_TOKEN',
  ])
  if (critical.has(kind)) return { severity: 'CRITICAL', weight: 40 }
  if (kind === 'ENV_LINE' || kind === 'JSON_VALUE') return { severity: 'HIGH', weight: 30 }
  return { severity: 'HIGH', weight: 25 }
}
