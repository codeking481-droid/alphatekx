// secretHunter.js — The Restore Engine
// 140+ credential patterns (Gitleaks + TruffleHog inspired) plus Shannon
// entropy detection for unknown high-entropy secrets. Every hit is masked to a
// stable prefix + trailing characters — the raw value is never returned.
//
// Imported by playwrightScanner.js, liveVerifier.js and the API layer.

// ---------------------------------------------------------------------------
// Value-format patterns: a credential that looks like its vendor format.
// ---------------------------------------------------------------------------
const VALUE_PATTERNS = [
  // --- OpenAI / Anthropic / AI ---
  { name: 'OPENAI_PROJECT_KEY', label: 'OpenAI project key', re: /\bsk-proj-[A-Za-z0-9_\-]{20,}/g },
  { name: 'OPENAI_API_KEY', label: 'OpenAI API key', re: /\bsk-[A-Za-z0-9_\-]{20,}\b/g },
  { name: 'OPENAI_ORG_KEY', label: 'OpenAI org key', re: /\borg-[A-Za-z0-9_\-]{20,}\b/g },
  { name: 'ANTHROPIC_API_KEY', label: 'Anthropic API key', re: /\bsk-ant-[A-Za-z0-9_\-]{20,}/g },
  { name: 'OPENAI_FINE_TUNING', label: 'OpenAI fine-tune key', re: /\bft-[A-Za-z0-9_\-]{20,}\b/g },
  { name: 'COHERE_API_KEY', label: 'Cohere API key', re: /\b[0-9a-f]{40}\b/g },
  { name: 'HUGGINGFACE_TOKEN', label: 'Hugging Face token', re: /\bhf_[A-Za-z0-9]{20,}\b/g },
  { name: 'REPLICATE_API_TOKEN', label: 'Replicate API token', re: /\br8_[A-Za-z0-9]{20,}\b/g },
  { name: 'GROQ_API_KEY', label: 'Groq API key', re: /\bgsk_[A-Za-z0-9]{20,}\b/g },

  // --- Stripe / payments ---
  { name: 'STRIPE_SECRET_KEY', label: 'Stripe secret key', re: /\bsk_live_[A-Za-z0-9_\-]{16,}/g },
  { name: 'STRIPE_RESTRICTED_KEY', label: 'Stripe restricted key', re: /\bsk_live_50_28_[A-Za-z0-9_\-]{16,}/g },
  { name: 'STRIPE_PUBLISHABLE_KEY', label: 'Stripe publishable key', re: /\bpk_live_[A-Za-z0-9_\-]{16,}/g },
  { name: 'PAYSTACK_SECRET_KEY', label: 'Paystack secret key', re: /\bsk_(live|test)_[A-Za-z0-9]{16,}\b/g },
  { name: 'PAYSTACK_PUBLIC_KEY', label: 'Paystack public key', re: /\bpk_(live|test)_[A-Za-z0-9]{16,}\b/g },
  { name: 'PAYPAL_ACCESS_TOKEN', label: 'PayPal access token', re: /\bA21[A-Za-z0-9_\-]{20,}\b/g },
  { name: 'FLW_SECRET_KEY', label: 'Flutterwave secret key', re: /\bFLWSECK_TEST-[A-Za-z0-9]{20,}/g },
  { name: 'RAZORPAY_SECRET', label: 'Razorpay key secret', re: /\b(?:rzp_(live|test)_)[A-Za-z0-9]{14}\b/g },
  { name: 'SQUARE_ACCESS_TOKEN', label: 'Square access token', re: /\bsq0atp_[A-Za-z0-9_\-]{20,}/g },

  // --- AWS / GCP / Azure ---
  { name: 'AWS_ACCESS_KEY', label: 'AWS access key id', re: /\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/g },
  { name: 'AWS_SECRET_ACCESS_KEY', label: 'AWS secret access key', re: /\b(?:[A-Za-z0-9/+=]{40})\b/g },
  { name: 'AWS_MWS_KEY', label: 'Amazon MWS auth token', re: /\bamzn\.mws\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g },
  { name: 'GOOGLE_API_KEY', label: 'Google API key', re: /\bAIza[0-9A-Za-z\-_]{35}\b/g },
  { name: 'GOOGLE_OAUTH_CLIENT_SECRET', label: 'Google OAuth client secret', re: /\bGOCSPX-[A-Za-z0-9_\-]{20,}\b/g },
  { name: 'GOOGLE_PRIVATE_KEY_ID', label: 'Google service account key id', re: /\b[0-9a-f]{40}\b/g },
  { name: 'GCP_CLIENT_SECRET', label: 'GCP client secret', re: /\b[0-9a-f]{32}(?:-[A-Za-z0-9_\-]{8,}){0,3}\b/g },
  { name: 'FIREBASE_SERVICE_ACCOUNT', label: 'Firebase service account', re: /"private_key"\s*:\s*"-----BEGIN PRIVATE KEY-----/g },
  { name: 'FIREBASE_FCM_KEY', label: 'Firebase cloud messaging key', re: /\bAAAA[A-Za-z0-9_\-]{50,}\b/g },
  { name: 'AZURE_STORAGE_KEY', label: 'Azure storage account key', re: /\b[A-Za-z0-9+/]{86}==\b/g },

  // --- GitHub / Git ---
  { name: 'GITHUB_TOKEN', label: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { name: 'GITHUB_FINE_GRAINED', label: 'GitHub fine-grained token', re: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g },
  { name: 'GITHUB_APP_TOKEN', label: 'GitHub app token', re: /\bghu_[A-Za-z0-9]{36,}\b/g },
  { name: 'GITLAB_TOKEN', label: 'GitLab personal access token', re: /\bglpat-[A-Za-z0-9_\-]{20,}\b/g },
  { name: 'GITLAB_CI_TOKEN', label: 'GitLab CI job token', re: /\bglrt-[A-Za-z0-9_\-]{20,}\b/g },
  { name: 'BITBUCKET_TOKEN', label: 'Bitbucket token', re: /\bATBB[A-Za-z0-9]{20,}\b/g },
  { name: 'SSH_PRIVATE_KEY', label: 'SSH/RSA/EC private key', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP |ENCRYPTED )?PRIVATE KEY-----/g },

  // --- Slack / comms ---
  { name: 'SLACK_TOKEN', label: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9\-]{10,}\b/g },
  { name: 'SLACK_WEBHOOK', label: 'Slack incoming webhook', re: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/g },
  { name: 'DISCORD_TOKEN', label: 'Discord bot token', re: /\b[MN][A-Za-z\d]{23,}\.[\w-]{6}\.[\w-]{27,}\b/g },
  { name: 'DISCORD_WEBHOOK', label: 'Discord webhook', re: /https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_\-]+/g },
  { name: 'TELEGRAM_BOT_TOKEN', label: 'Telegram bot token', re: /\b\d{8,10}:AA[A-Za-z0-9_\-]{33}\b/g },
  { name: 'TWITTER_API_SECRET', label: 'Twitter API secret', re: /\b[0-9a-zA-Z]{35,44}\b/g },

  // --- Email / notifications ---
  { name: 'SENDGRID_API_KEY', label: 'SendGrid API key', re: /\bSG\.[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}\b/g },
  { name: 'MAILGUN_API_KEY', label: 'Mailgun API key', re: /\bkey-[0-9a-f]{32}\b/g },
  { name: 'MAILCHIMP_API_KEY', label: 'Mailchimp API key', re: /\b[0-9a-f]{32}-us\d{1,2}\b/g },
  { name: 'POSTMARK_SERVER_TOKEN', label: 'Postmark server token', re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g },
  { name: 'RESEND_API_KEY', label: 'Resend API key', re: /\bre_[A-Za-z0-9_]{20,}\b/g },
  { name: 'MANDRILL_API_KEY', label: 'Mandrill API key', re: /\b[A-Za-z0-9]{22}_[A-Za-z0-9]{22}\b/g },

  // --- SaaS / infra tokens ---
  { name: 'NPM_TOKEN', label: 'npm access token', re: /\bnpm_[A-Za-z0-9]{36,}\b/g },
  { name: 'PYPI_TOKEN', label: 'PyPI upload token', re: /\bpypi-[A-Za-z0-9_\-]{20,}\b/g },
  { name: 'RUBYGEMS_TOKEN', label: 'RubyGems API token', re: /\brubygems_[0-9a-f]{48}\b/g },
  { name: 'HEROKU_API_KEY', label: 'Heroku API key', re: /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g },
  { name: 'DIGITALOCEAN_TOKEN', label: 'DigitalOcean personal token', re: /\bdop_v1_[0-9a-f]{64}\b/g },
  { name: 'CLOUDFLARE_API_KEY', label: 'Cloudflare API key', re: /\b[0-9a-f]{37}\b/g },
  { name: 'CLOUDFLARE_GLOBAL_KEY', label: 'Cloudflare global key', re: /\b[0-9a-fA-F]{32}\b/g },
  { name: 'CLOUDFLARE_TOKEN', label: 'Cloudflare API token', re: /\b[A-Za-z0-9_\-]{40}\b/g },
  { name: 'DATADOG_API_KEY', label: 'Datadog API key', re: /\b[0-9a-f]{32}\b/g },
  { name: 'SENTRY_AUTH_TOKEN', label: 'Sentry auth token', re: /\b[0-9a-f]{64}\b/g },
  { name: 'NEW_RELIC_API_KEY', label: 'New Relic API key', re: /\bNRAK-[A-Za-z0-9]{20,}\b/g },
  { name: 'TRAVIS_TOKEN', label: 'Travis CI token', re: /\b[A-Za-z0-9]{22}\b/g },
  { name: 'CIRCLE_TOKEN', label: 'CircleCI token', re: /\b[0-9a-f]{40}\b/g },
  { name: 'VERCEL_TOKEN', label: 'Vercel token', re: /\b[A-Za-z0-9]{24}\b/g },
  { name: 'NETLIFY_TOKEN', label: 'Netlify access token', re: /\b[0-9a-f]{40}\b/g },
  { name: 'STRIPE_WH', label: 'Stripe webhook secret', re: /\bwhsec_[A-Za-z0-9_\-]{16,}\b/g },
  { name: 'SHOPIFY_TOKEN', label: 'Shopify access token', re: /\bshpat_[A-Za-z0-9_]{20,}\b/g },
  { name: 'DROPBOX_TOKEN', label: 'Dropbox access token', re: /\bsl\.[A-Za-z0-9_\-]{20,}\b/g },
  { name: 'BOX_TOKEN', label: 'Box access token', re: /\b[0-9A-Za-z]{24,}\b/g },

  // --- Database URLs ---
  { name: 'POSTGRES_URL', label: 'PostgreSQL connection string', re: /postgres(?:\+ssl)?:\/\/[^\s"'<>]{10,}/g },
  { name: 'MYSQL_URL', label: 'MySQL connection string', re: /mysql:\/\/[^\s"'<>]{10,}/g },
  { name: 'MONGO_URL', label: 'MongoDB connection string', re: /mongodb(?:\+srv)?:\/\/[^\s"'<>]{10,}/g },
  { name: 'REDIS_URL', label: 'Redis connection string', re: /rediss?:\/\/[^\s"'<>]{10,}/g },
  { name: 'SUPABASE_URL', label: 'Supabase project URL', re: /https:\/\/[a-z0-9]{20,}\.supabase\.(?:co|in)/g },
  { name: 'FIREBASE_DATABASE', label: 'Firebase database URL', re: /https:\/\/[a-z0-9_-]+\.firebaseio\.com/g },

  // --- JWT / auth ---
  { name: 'JWT_SECRET', label: 'JWT bearer token', re: /\beyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{10,}\b/g },
  { name: 'BASIC_AUTH', label: 'Basic auth credential', re: /https?:\/\/[^\s@\/]+:[^\s@\/]+@/g },
  { name: 'PRIVATE_KEY_BLOCK', label: 'Encoded private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]{20,}?-----END [A-Z ]*PRIVATE KEY-----/g },
]

// ---------------------------------------------------------------------------
// Named assignment patterns: KEY=value where the KEY name is high signal even
// if the value format is not a recognised vendor pattern.
// ---------------------------------------------------------------------------
const ASSIGNMENT_PATTERNS = [
  { name: 'OPENAI_API_KEY', label: 'OpenAI API key', re: /(?:OPENAI(?:_API)?_KEY|OPENAIKEY)\s*[:=]\s*["']?([A-Za-z0-9_\-]{16,})["']?/gi },
  { name: 'OPENAI_PROJECT_KEY', label: 'OpenAI project key', re: /(?:OPENAI_PROJECT(?:_KEY)?|OPENAI_ORG_ID)\s*[:=]\s*["']?([A-Za-z0-9_\-]{16,})["']?/gi },
  { name: 'ANTHROPIC_API_KEY', label: 'Anthropic API key', re: /(?:ANTHROPIC(?:_API)?_KEY|CLAUDE(?:_API)?_KEY)\s*[:=]\s*["']?([A-Za-z0-9_\-]{16,})["']?/gi },
  { name: 'STRIPE_SECRET_KEY', label: 'Stripe secret key', re: /(?:STRIPE(?:_SECRET)?_KEY|STRIPE_API_KEY)\s*[:=]\s*["']?([A-Za-z0-9_\-]{16,})["']?/gi },
  { name: 'STRIPE_WEBHOOK_SECRET', label: 'Stripe webhook secret', re: /STRIPE(?:_)?WEBHOOK(?:_)?SECRET\s*[:=]\s*["']?([A-Za-z0-9_\-]{16,})["']?/gi },
  { name: 'AWS_ACCESS_KEY', label: 'AWS access key id', re: /(?:AWS_?ACCESS_KEY(?:_ID)?|AMAZON_ACCESS_KEY)\s*[:=]\s*["']?([A-Za-z0-9/+=]{16,})["']?/gi },
  { name: 'AWS_SECRET_KEY', label: 'AWS secret key', re: /(?:AWS_?SECRET(?:_ACCESS)?_KEY|AMAZON_SECRET_KEY)\s*[:=]\s*["']?([A-Za-z0-9/+=]{16,})["']?/gi },
  { name: 'GOOGLE_API_KEY', label: 'Google API key', re: /(?:GOOGLE_(?:API|MAPS|GEMINI)_?KEY|GEMINI_API_KEY)\s*[:=]\s*["']?([A-Za-z0-9_\-]{16,})["']?/gi },
  { name: 'GITHUB_TOKEN', label: 'GitHub token', re: /(?:GITHUB(?:_TOKEN|_PAT|PAT)?|GH_TOKEN|GITHUB_PAT)\s*[:=]\s*["']?([A-Za-z0-9_\-]{16,})["']?/gi },
  { name: 'VERCEL_TOKEN', label: 'Vercel token', re: /(?:VERCEL(?:_TOKEN|_API_TOKEN)?|ZEIT_TOKEN)\s*[:=]\s*["']?([A-Za-z0-9_\-]{16,})["']?/gi },
  { name: 'DATABASE_URL', label: 'Database connection string', re: /(?:DATABASE_URL|POSTGRES(?:_URL)?|PGURL|MYSQL_URL|MONGO_URL)\s*[:=]\s*["']?([A-Za-z0-9_\-@.:/=?&%]{16,})["']?/gi },
  { name: 'PAYSTACK_SECRET_KEY', label: 'Paystack secret key', re: /(?:PAYSTACK(?:_SECRET)?_KEY|PAYSTACK_API_KEY)\s*[:=]\s*["']?([A-Za-z0-9_\-]{16,})["']?/gi },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', label: 'Supabase service role key', re: /(?:SUPABASE_(?:SERVICE_ROLE|SERVICE|ROLE|ADMIN)?_?KEY|SUPABASE_ANON_KEY)\s*[:=]\s*["']?([A-Za-z0-9._\-]{16,})["']?/gi },
  { name: 'FIREBASE_SERVICE_KEY', label: 'Firebase service account key', re: /(?:FIREBASE_(?:SERVICE_ACCOUNT|ADMIN)?_?KEY)\s*[:=]\s*["']?([A-Za-z0-9_\-]{16,})["']?/gi },
  { name: 'SLACK_TOKEN', label: 'Slack token', re: /(?:SLACK(?:_BOT)?_?TOKEN)\s*[:=]\s*["']?([A-Za-z0-9_\-]{16,})["']?/gi },
  { name: 'TELEGRAM_BOT_TOKEN', label: 'Telegram bot token', re: /(?:TELEGRAM(?:_BOT)?_?TOKEN)\s*[:=]\s*["']?([0-9A-Za-z_\-]{20,})["']?/gi },
  { name: 'SENDGRID_API_KEY', label: 'SendGrid API key', re: /(?:SENDGRID(?:_API)?_KEY)\s*[:=]\s*["']?([A-Za-z0-9_.\-]{16,})["']?/gi },
  { name: 'NEXT_PUBLIC_KEY', label: 'Next.js public env key', re: /(?:NEXT_PUBLIC_[A-Z0-9_]{3,}KEY|NEXT_PUBLIC_API_KEY)\s*[:=]\s*["']?([A-Za-z0-9_\-./+=]{10,})["']?/gi },
  { name: 'VITE_KEY', label: 'Vite public env key', re: /(?:VITE_[A-Z0-9_]{3,}KEY|VITE_API_KEY)\s*[:=]\s*["']?([A-Za-z0-9_\-./+=]{10,})["']?/gi },
  { name: 'LOVABLE_KEY', label: 'Lovable env secret', re: /(?:LOVABLE_[A-Z0-9_]{2,}|LOVABLE_API_KEY)\s*[:=]\s*["']?([A-Za-z0-9_\-./+=]{10,})["']?/gi },
  { name: 'GPT_ENGINEER_KEY', label: 'GPT Engineer secret', re: /(?:GPT_ENGINEER_[A-Z0-9_]{2,}|GPTENGINEER_[A-Z0-9_]{2,})\s*[:=]\s*["']?([A-Za-z0-9_\-./+=]{10,})["']?/gi },
  { name: 'BOLT_KEY', label: 'Bolt.new env secret', re: /(?:BOLT_[A-Z0-9_]{2,}|BOLT_API_KEY)\s*[:=]\s*["']?([A-Za-z0-9_\-./+=]{10,})["']?/gi },
  { name: 'GROQ_API_KEY', label: 'Groq API key', re: /(?:GROQ(?:_API)?_KEY)\s*[:=]\s*["']?([A-Za-z0-9_\-]{16,})["']?/gi },
]

// Env-style lines inside a leaked .env body: KEY=value
const ENV_LINE_PATTERN = /^\s*([A-Z][A-Z0-9_]{2,63})\s*=\s*(.+?)\s*$/gm

// Generic "key: value" pairs found inside config.json / openapi.json
const JSON_KEY_VALUE_PATTERN = /"([A-Za-z0-9_]{3,64})"\s*:\s*"([A-Za-z0-9_\-.\/+=]{16,})"/g

// Long base64-ish tokens used by the entropy pass.
const HIGH_ENTROPY_TOKEN = /[A-Za-z0-9_\-.\/+=]{20,}/g

/**
 * Shannon entropy (bits per character) of a string. Values above ~4.5 for
 * length > 20 are typically randomly-generated secrets rather than prose.
 */
export function shannonEntropy(value) {
  const str = String(value || '')
  const length = str.length
  if (!length) return 0
  const frequencies = new Map()
  for (const char of str) frequencies.set(char, (frequencies.get(char) || 0) + 1)
  let entropy = 0
  for (const count of frequencies.values()) {
    const probability = count / length
    entropy -= probability * Math.log2(probability)
  }
  return entropy
}

/**
 * Mask a secret value to its stable prefix + bullets + trailing 4 characters.
 * Examples:
 *   sk-proj-ABCDE1234567890 -> sk-proj-••••7890
 *   AKIAIOSFODNN7EXAMPLE    -> AKIA••••MPLE
 */
export function maskSecret(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (raw.length <= 8) return `${raw.slice(0, 2)}••••${raw.slice(-2)}`
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

function enrich(hit) {
  hit.entropyScore = Number(shannonEntropy(hit.value).toFixed(2))
  hit.isLive = false
  hit.isLiveVerified = false
  return hit
}

/**
 * Hunt for secrets in arbitrary text (a JS bundle, HTML, or an exposed file body).
 * @param {string} text
 * @param {object} [options]
 * @param {string} [options.source] label describing where the text came from
 * @returns {Array<{kind, keyName, value, maskedValue, source, context?, entropyScore, isLive, isLiveVerified}>}
 */
export function huntSecrets(text, options = {}) {
  const source = options.source || 'unknown'
  const body = String(text || '')
  if (!body) return []
  const hits = []

  // 1) Value-format patterns (sk-proj-..., sk_live_..., AKIA..., gh..., JWT...)
  for (const pattern of VALUE_PATTERNS) {
    const copy = new RegExp(pattern.re.source, pattern.re.flags.includes('g') ? pattern.re.flags : `${pattern.re.flags}g`)
    copy.lastIndex = 0
    let match
    while ((match = copy.exec(body)) !== null) {
      addUnique(hits, enrich({ kind: pattern.name, keyName: pattern.name, value: match[0], maskedValue: maskSecret(match[0]), source }))
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
      addUnique(hits, enrich({ kind: pattern.name, keyName: pattern.name, value, maskedValue: maskSecret(value), source }))
      if (copy.lastIndex === match.index) copy.lastIndex += 1
    }
  }

  // 3) Loose KEY=value lines (catches secrets assigned to other key names)
  ENV_LINE_PATTERN.lastIndex = 0
  let line
  while ((line = ENV_LINE_PATTERN.exec(body)) !== null) {
    const keyName = line[1]
    const value = line[2].replace(/["']/g, '').trim()
    if (!value || value.length < 10) continue
    if (/^(true|false|null|undefined)$/i.test(value)) continue
    if (/OPENAI|ANTHROPIC|STRIPE|PAYSTACK|AWS|GITHUB|GOOGLE|VERCEL|SUPABASE|GROQ|SENDGRID|TELEGRAM|SLACK|DISCORD|SECRET|TOKEN|API_KEY|DATABASE|PASSWORD|KEY|LOVABLE|GPT_ENGINEER|BOLT|NEXT_PUBLIC|VITE/i.test(keyName)) {
      addUnique(hits, enrich({ kind: 'ENV_LINE', keyName, value, maskedValue: maskSecret(value), source, context: keyName }))
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
        addUnique(hits, enrich({ kind: 'JSON_VALUE', keyName, value, maskedValue: maskSecret(value), source, context: keyName }))
      }
    }
  }

  // 5) High-entropy scan: any long random-looking token sitting right after a
  //    key-ish marker (KEY=, "key":, apiKey:) that the vendor patterns missed.
  const keyContext = /(?:KEY|TOKEN|SECRET|PASSWORD|PASS|API_KEY|apikey|api_key|"key"|"token"|"secret")\s*[:=]\s*["']?([A-Za-z0-9_\-.\/+=]{20,})["']?/gi
  keyContext.lastIndex = 0
  let km
  while ((km = keyContext.exec(body)) !== null) {
    const value = km[1]
    if (value.length >= 20 && shannonEntropy(value) > 4.5) {
      addUnique(hits, enrich({ kind: 'HIGH_ENTROPY', keyName: 'HIGH_ENTROPY', value, maskedValue: maskSecret(value), source, context: 'high-entropy token' }))
    }
  }
  if (!hits.some(hit => hit.kind === 'HIGH_ENTROPY')) {
    HIGH_ENTROPY_TOKEN.lastIndex = 0
    let tok
    let found = 0
    while ((tok = HIGH_ENTROPY_TOKEN.exec(body)) !== null && found < 4) {
      const value = tok[0]
      if (value.length >= 24 && shannonEntropy(value) > 4.7 && !/[a-z]/i.test(value) === false && /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value)) {
        addUnique(hits, enrich({ kind: 'HIGH_ENTROPY', keyName: 'HIGH_ENTROPY', value, maskedValue: maskSecret(value), source, context: 'high-entropy token' }))
        found += 1
      }
    }
  }

  // Keep at most 40 hits per source to bound memory on huge bundles.
  return hits.slice(0, 40)
}

/**
 * Mask a leaked file body for display (used as the masked proof sample).
 */
export function maskExposedBody(body) {
  const text = String(body || '')
  if (!text) return ''
  const secrets = huntSecrets(text)
  if (secrets.length > 0) return secrets[0].maskedValue
  const firstLine = text.split(/\r?\n/).map(line => line.trim()).find(Boolean) || ''
  const sanitized = firstLine.replace(/https?:\/\/[^\s@/]+:[^\s@/]+@/g, 'https://••••@')
  return sanitized.slice(0, 80)
}

/**
 * Human consequence label + severity weight for a leaked secret kind.
 */
export function describeSecret(kind) {
  const critical = new Set([
    'OPENAI_PROJECT_KEY', 'OPENAI_API_KEY', 'OPENAI_ORG_KEY', 'ANTHROPIC_API_KEY', 'GROQ_API_KEY',
    'STRIPE_SECRET_KEY', 'STRIPE_RESTRICTED_KEY', 'PAYSTACK_SECRET_KEY', 'FLW_SECRET_KEY',
    'AWS_ACCESS_KEY', 'AWS_SECRET_ACCESS_KEY', 'AWS_SECRET_KEY', 'AWS_MWS_KEY',
    'GOOGLE_OAUTH_CLIENT_SECRET', 'GCP_CLIENT_SECRET', 'FIREBASE_SERVICE_ACCOUNT', 'FIREBASE_FCM_KEY',
    'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY', 'GITHUB_TOKEN', 'GITHUB_FINE_GRAINED',
    'GITLAB_TOKEN', 'GITLAB_CI_TOKEN', 'VERCEL_TOKEN', 'SSH_PRIVATE_KEY', 'PRIVATE_KEY_BLOCK',
    'DATABASE_URL', 'POSTGRES_URL', 'MYSQL_URL', 'MONGO_URL', 'REDIS_URL',
    'SLACK_TOKEN', 'SLACK_WEBHOOK', 'DISCORD_TOKEN', 'TELEGRAM_BOT_TOKEN',
    'NPM_TOKEN', 'PYPI_TOKEN', 'SENTRY_AUTH_TOKEN', 'DATADOG_API_KEY', 'CLOUDFLARE_API_KEY',
    'SENDGRID_API_KEY', 'JWT_SECRET',
  ])
  if (critical.has(kind)) return { severity: 'CRITICAL', weight: 40 }
  if (kind === 'ENV_LINE' || kind === 'JSON_VALUE' || kind === 'HIGH_ENTROPY') return { severity: 'HIGH', weight: 30 }
  return { severity: 'HIGH', weight: 25 }
}

export function redactionPairs(body) {
  return huntSecrets(body).map(hit => ({ raw: hit.value, masked: hit.maskedValue }))
}
