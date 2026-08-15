// Secret detection patterns and masking for the AlphaTekX real scanner.
// Raw secret values never leave this module: callers only receive masked proof.

export const SECRET_PATTERNS = [
  { type: 'OPENAI_KEY', label: 'OpenAI API key', regex: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}\b/g },
  { type: 'ANTHROPIC_KEY', label: 'Anthropic API key', regex: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { type: 'STRIPE_SECRET_KEY', label: 'Stripe live secret key', regex: /\bsk_live_[A-Za-z0-9]{16,}\b/g },
  { type: 'STRIPE_RESTRICTED_KEY', label: 'Stripe restricted key', regex: /\brk_live_[A-Za-z0-9]{16,}\b/g },
  { type: 'PAYSTACK_SECRET_KEY', label: 'Paystack live secret key', regex: /\bsk_live_[a-f0-9]{32,}\b/g },
  { type: 'AWS_ACCESS_KEY_ID', label: 'AWS access key ID', regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { type: 'AWS_SECRET_ACCESS_KEY', label: 'AWS secret access key', regex: /\baws_secret_access_key\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})\b/gi },
  { type: 'GOOGLE_API_KEY', label: 'Google API key', regex: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { type: 'GITHUB_TOKEN', label: 'GitHub token', regex: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { type: 'SLACK_TOKEN', label: 'Slack token', regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { type: 'SENDGRID_KEY', label: 'SendGrid API key', regex: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g },
  { type: 'TWILIO_KEY', label: 'Twilio account SID', regex: /\bAC[a-f0-9]{32}\b/g },
  { type: 'SUPABASE_SERVICE_ROLE_KEY', label: 'Supabase service-role key', regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}\b/g, validate: isServiceRoleJwt },
  { type: 'PRIVATE_KEY', label: 'Private key material', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g },
  { type: 'DATABASE_URL', label: 'Database connection string with password', regex: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:@/"']+:[^\s:@/"']+@[^\s/"']+/gi },
]

function decodeJwtPayload(token) {
  const segment = token.split('.')[1]
  if (!segment) return null
  try {
    const json = Buffer.from(segment.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    return JSON.parse(json)
  } catch {
    return null
  }
}

function isServiceRoleJwt(token) {
  const payload = decodeJwtPayload(token)
  return payload?.role === 'service_role'
}

// Renders sk-proj-abcdefgh1234 as sk-proj-••••1234 so the report proves possession
// without ever republishing a working credential.
export function maskSecret(rawValue) {
  const value = String(rawValue || '')
  if (!value) return ''

  const prefixMatch = value.match(/^(sk-(?:proj-|svcacct-|admin-|ant-)?|sk_live_|rk_live_|pk_live_|AKIA|ASIA|AIza|gh[pousr]_|xox[baprs]-|SG\.|AC|eyJ)/)
  const prefix = prefixMatch ? prefixMatch[1] : value.slice(0, 4)
  const tail = value.slice(-4)

  if (value.length <= prefix.length + 4) return `${prefix}••••`
  return `${prefix}••••${tail}`
}

function lineNumberOf(text, index) {
  let line = 1
  for (let i = 0; i < index && i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1
  }
  return line
}

// Raw/masked pairs for in-memory redaction (e.g. blanking secrets out of a
// screenshot before it is written to disk). Never persist or emit the raw side.
export function redactionPairs(text) {
  const body = String(text || '')
  if (!body) return []

  const pairs = new Map()
  for (const pattern of SECRET_PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags.includes('g') ? pattern.regex.flags : `${pattern.regex.flags}g`)
    let match = regex.exec(body)
    while (match !== null) {
      const raw = match[1] || match[0]
      if (raw && (!pattern.validate || pattern.validate(raw))) pairs.set(raw, maskSecret(raw))
      if (match[0] === '') regex.lastIndex += 1
      match = regex.exec(body)
    }
  }
  return [...pairs].map(([raw, masked]) => ({ raw, masked }))
}

// Scans a text body and returns masked matches. Raw secrets are discarded here.
export function findSecrets(text, source) {
  const body = String(text || '')
  if (!body) return []

  const seen = new Set()
  const results = []

  for (const pattern of SECRET_PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags.includes('g') ? pattern.regex.flags : `${pattern.regex.flags}g`)
    let match = regex.exec(body)
    while (match !== null) {
      const raw = match[1] || match[0]
      if (!pattern.validate || pattern.validate(raw)) {
        const maskedProof = pattern.type === 'PRIVATE_KEY' || pattern.type === 'DATABASE_URL'
          ? `${raw.slice(0, 12)}••••`
          : maskSecret(raw)
        const key = `${pattern.type}:${maskedProof}:${source}`
        if (!seen.has(key)) {
          seen.add(key)
          results.push({
            type: pattern.type,
            label: pattern.label,
            maskedProof,
            source,
            lineNumber: lineNumberOf(body, match.index),
            length: raw.length,
          })
        }
      }
      if (match[0] === '') regex.lastIndex += 1
      match = regex.exec(body)
    }
  }

  return results
}
