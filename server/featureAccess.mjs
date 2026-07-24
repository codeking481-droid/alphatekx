export const ADMIN_TEST_EMAILS = new Set(['iamdan4live@gmail.com'])

export const PUBLIC_CONNECTOR_FEATURES = Object.freeze({
  linkedin: true,
  facebook: false,
  instagram: false,
  whatsapp: false,
  x: false,
  google: false,
  gmail: false,
  google_sheets: false,
  google_calendar: false,
  google_drive: false,
  telegram: false,
  slack: false,
  discord: false,
})

const PLATFORM_ALIASES = Object.freeze({
  twitter: 'x',
  sheets: 'google_sheets',
  calendar: 'google_calendar',
  drive: 'google_drive',
})

const PUBLIC_NAMES = Object.freeze({
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  x: 'X',
  google: 'Google',
  gmail: 'Gmail',
  google_sheets: 'Google Sheets',
  google_calendar: 'Google Calendar',
  google_drive: 'Google Drive',
  telegram: 'Telegram',
  slack: 'Slack',
  discord: 'Discord',
})

export function normalizeFeatureId(value) {
  const id = String(value || '').trim().toLowerCase()
  return PLATFORM_ALIASES[id] || id
}

export function isAdminTestUser(user, trustedIdentity = true) {
  return Boolean(trustedIdentity && ADMIN_TEST_EMAILS.has(String(user?.email || '').trim().toLowerCase()))
}

export function connectorFeatureAccess(user, connector, trustedIdentity = true) {
  const id = normalizeFeatureId(connector)
  const admin = isAdminTestUser(user, trustedIdentity)
  const publicEnabled = PUBLIC_CONNECTOR_FEATURES[id] === true
  return {
    id,
    name: PUBLIC_NAMES[id] || id,
    publicEnabled,
    admin,
    enabled: publicEnabled || admin,
    availability: publicEnabled ? 'available' : admin ? 'testing' : 'coming_soon',
  }
}

export function unavailableConnectorMessage(connector) {
  const id = normalizeFeatureId(connector)
  const name = PUBLIC_NAMES[id] || id
  return `${name} is currently being tested and is not publicly available yet. LinkedIn is available now.`
}

export function connectorsInPrompt(prompt) {
  const text = String(prompt || '').toLowerCase()
  const matches = []
  const patterns = [
    ['facebook', /\bfacebook\b/],
    ['instagram', /\binstagram\b/],
    ['whatsapp', /\bwhats\s*app\b|\bwhatsapp\b/],
    ['x', /\btwitter\b|\bpost\s+(?:on|to)\s+x\b|\bx\s+(?:post|automation|account)\b/],
    ['linkedin', /\blinked\s*in\b|\blinkedin\b/],
    ['telegram', /\btelegram\b/],
    ['slack', /\bslack\b/],
    ['discord', /\bdiscord\b/],
    ['gmail', /\bgmail\b/],
    ['google_drive', /\bgoogle\s+drive\b/],
    ['google_calendar', /\bgoogle\s+calendar\b/],
    ['google_sheets', /\bgoogle\s+sheets?\b/],
  ]
  for (const [id, pattern] of patterns) if (pattern.test(text)) matches.push(id)
  return matches
}

export function unavailablePromptConnector(user, prompt, trustedIdentity = true) {
  return connectorsInPrompt(prompt).find(id => !connectorFeatureAccess(user, id, trustedIdentity).enabled) || null
}

export function featureStatusForUser(user, trustedIdentity = true) {
  const result = {}
  for (const id of Object.keys(PUBLIC_CONNECTOR_FEATURES)) {
    result[id] = connectorFeatureAccess(user, id, trustedIdentity)
  }
  return { admin: isAdminTestUser(user, trustedIdentity), connectors: result }
}
