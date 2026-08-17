export type IntentCategory = 'conversation' | 'automation_request' | 'follow_up_question' | 'clarification' | 'help' | 'unknown'

export type Capability = {
  id: string
  name: string
  description: string
  supported: boolean
  requiredConnectors: string[]
  patterns: RegExp[]
  alternative?: string
  reason?: string
}

export const PLATFORM_CAPS: Capability[] = [
  {
    id: 'github-pull-request',
    name: 'Build a GitHub change',
    description: 'Prepare code on a new branch and open a pull request for review.',
    supported: true,
    requiredConnectors: ['github'],
    patterns: [
      /(?:build|add|fix|change|implement).*(?:code|github|repository|repo|pull request|\bpr\b)/i,
      /(?:github|repository|repo).*(?:build|add|fix|change|implement)/i,
    ],
  },
  {
    id: 'github-issue',
    name: 'Create GitHub issue',
    description: 'Create an issue in a connected GitHub repository.',
    supported: true,
    requiredConnectors: ['github'],
    patterns: [
      /(?:create|open|file|add).*(?:github\s+)?issue/i,
      /(?:github|repository|repo).*(?:create|open|file).*(?:issue|ticket)|(?:issue|ticket).*(?:github|repository|repo)/i,
    ],
  },
  {
    id: 'linkedin-post',
    name: 'Publish LinkedIn post',
    description: 'Compose, review, and publish a post to your connected LinkedIn profile.',
    supported: true,
    requiredConnectors: ['linkedin'],
    patterns: [
      /(?:create|write|generate|publish|schedule|post).*(?:linkedin)/i,
      /linkedin.*(?:post|publish|schedule|content)/i,
    ],
  },
  {
    id: 'calendar-summary',
    name: 'Daily calendar summary email',
    description: 'Read calendar events and email a schedule summary.',
    supported: true,
    requiredConnectors: ['google_calendar', 'gmail'],
    patterns: [
      /calendar.*(?:summary|summarize|email|send|mail)/i,
      /(?:email|send|mail).*calendar.*(?:summary|summarize|events|schedule)/i,
    ],
  },
  {
    id: 'gmail-attachments-to-drive',
    name: 'Save Gmail attachments to Google Drive',
    description: 'Find matching Gmail attachments and save them to Google Drive.',
    supported: true,
    requiredConnectors: ['gmail', 'google_drive'],
    patterns: [
      /(?:save|copy|move|upload|archive|backup|back\s*up).*(?:email|gmail|inbox|invoice|receipt).*(?:attachments?|files?).*(?:google\s*)?drive/i,
      /(?:attachments?|attached\s+files?).*(?:from|in).*(?:email|gmail|inbox).*(?:to|in|into|on).*(?:google\s*)?drive/i,
    ],
  },
  {
    id: 'send-email',
    name: 'Send email',
    description: 'Send an email to a recipient through a connected Gmail account.',
    supported: true,
    requiredConnectors: ['gmail'],
    patterns: [
      /send\s+(?:an?\s+)?(?:email|mail)/i,
      /email\s+me/i,
      /send\s+me\s+(?:an?\s+)?(?:email|mail)/i,
    ],
  },
  {
    id: 'google-doc',
    name: 'Create Google document',
    description: 'Create a reviewed document in Google Docs.',
    supported: true,
    requiredConnectors: ['googledocs'],
    patterns: [
      /(?:create|write|draft|make).*(?:google\s+)?doc(?:ument)?/i,
      /(?:google\s+)?docs?.*(?:create|write|draft|make|proposal|brief)/i,
    ],
  },
  {
    id: 'discord-message',
    name: 'Send Discord message',
    description: 'Send a reviewed message to a connected Discord channel.',
    supported: true,
    requiredConnectors: ['discord'],
    patterns: [
      /(?:send|post|publish).*(?:message|update|alert|notification).*(?:to\s+)?discord/i,
      /discord.*(?:send|post|publish).*(?:message|update|alert|notification)/i,
    ],
  },
  {
    id: 'whatsapp-first-message',
    name: 'Send WhatsApp first message',
    description: 'Send the approved first WhatsApp message to one connected recipient.',
    supported: true,
    requiredConnectors: ['whatsapp'],
    patterns: [
      /send.*(?:hi from alphatekx|test message).*whatsapp/i,
      /whatsapp.*(?:hi from alphatekx|first message|test message)/i,
    ],
  },
  {
    id: 'telegram-message',
    name: 'Send Telegram message',
    description: 'Send a message to a Telegram chat.',
    supported: true,
    requiredConnectors: ['telegram'],
    patterns: [
      /send.*(?:message|notification|alert).*telegram/i,
      /telegram.*(?:message|notification|alert)/i,
    ],
  },
  {
    id: 'slack-message',
    name: 'Send Slack message',
    description: 'Send a message to a connected Slack channel or user.',
    supported: true,
    requiredConnectors: ['slack'],
    patterns: [
      /send.*(?:message|notification|alert).*slack/i,
      /slack.*(?:send|post|publish).*(?:message|notification|alert)/i,
    ],
  },
  {
    id: 'append-sheets',
    name: 'Append to Google Sheets',
    description: 'Append a row to a connected Google Sheets spreadsheet.',
    supported: true,
    requiredConnectors: ['google_sheets'],
    patterns: [
      /(?:append|add|log).*google\s*sheets?/i,
      /(?:append|add|log).*spreadsheet/i,
      /sheets?.*(?:append|add|log)/i,
    ],
  },
]

const normalize = (text: string) => String(text || '').trim().replace(/\s+/g, ' ')

const HELP_PATTERNS = [
  /\bhow\s+(?:do|can)\s+i\s+connect\b/i,
  /^(?:please\s+)?help\s+me\s+connect\b/i,
  /\bhow\s+do\s+credits?\s+work\b/i,
  /\bwhere\s+(?:do|can)\s+i\s+(?:buy|get|purchase)\s+credits?\b/i,
  /\bhow\s+do\s+automations?\s+work\b/i,
  /\bhow\s+(?:do|can)\s+i\s+(?:use|create|pause|resume|delete|schedule)\b/i,
]

const CONVERSATION_PATTERNS = [
  /^(?:hi|hello|hey|hiya|good\s+(?:morning|afternoon|evening))[!?.]*$/i,
  /^how\s+are\s+you[!?.]*$/i,
  /^(?:what(?:'s|\s+is)\s+your\s+name|who\s+are\s+you|can\s+you\s+introduce\s+yourself)[?!.]*$/i,
  /^(?:who\s+(?:created|made|built)\s+you|who\s+is\s+your\s+creator)[?!.]*$/i,
  /^(?:thank\s+you|thanks|thank\s+you\s+alpha|thanks\s+alpha)[!?.]*$/i,
  /^(?:nice|awesome|great|cool|okay|ok)[!?.]*$/i,
  /^tell\s+me\s+(?:a\s+)?joke[!?.]*$/i,
  /^(?:what\s+can\s+(?:you|alpha|alphatekx)\s+do|tell\s+me\s+about\s+(?:alpha|alphatekx))[?!.]*$/i,
  /^(?:please\s+)?explain\s+(?:alpha|alphatekx)(?:\s+to\s+me)?[?!.]*$/i,
]

const ACTION_PATTERN = /\b(?:automate|automation|post|publish|schedule|send|email|mail|remind|notify|reply|respond|save|copy|move|upload|monitor|summarize|generate|create|append|share)\b/i
const AUTOMATION_SIGNAL_PATTERN = /\b(?:linkedin|gmail|email|calendar|telegram|whatsapp|slack|discord|google\s+drive|google\s+sheets|every|daily|weekly|monthly|morning|afternoon|evening|monday|tuesday|wednesday|thursday|friday|saturday|sunday|automatically|automation|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i
const INCOMPLETE_ACTION_PATTERNS = [
  /^(?:please\s+)?post\s+(?:for\s+me|something|it)?[.!]*$/i,
  /^(?:please\s+)?send\s+(?:it|something|a\s+message)?[.!]*$/i,
  /^(?:please\s+)?automate\s+(?:this|it)?[.!]*$/i,
  /^(?:please\s+)?remind\s+me[.!]*$/i,
  /^(?:please\s+)?schedule\s+(?:it|this)?[.!]*$/i,
]
const FOLLOW_UP_PATTERN = /^(?:yes|no|approve|approved|continue|cancel|regenerate|rewrite|shorter|longer|linkedin|whatsapp|telegram|slack|discord|every\s+\w+|daily|weekly|monthly|\d{1,2}(?::\d{2})?\s*(?:am|pm)?|[\w.+-]+@[\w.-]+\.\w+)[.!]*$/i

function matchText(patterns: RegExp[], text: string) {
  return patterns.filter(pattern => pattern.test(text)).map(pattern => pattern.source)
}

export function classifyIntent(
  message: string,
  context: { hasPlanningContext?: boolean } = {},
) {
  const text = normalize(message)
  if (!text) return { category: 'unknown' as IntentCategory, confidence: 0, reason: 'empty_message' }

  if (HELP_PATTERNS.some(pattern => pattern.test(text))) {
    return { category: 'help' as IntentCategory, confidence: 0.99, reason: 'help_question' }
  }

  if (CONVERSATION_PATTERNS.some(pattern => pattern.test(text))) {
    return { category: 'conversation' as IntentCategory, confidence: 0.99, reason: 'conversation_pattern' }
  }

  if (INCOMPLETE_ACTION_PATTERNS.some(pattern => pattern.test(text))) {
    return { category: 'clarification' as IntentCategory, confidence: 0.95, reason: 'incomplete_action' }
  }

  if (context.hasPlanningContext && FOLLOW_UP_PATTERN.test(text)) {
    return { category: 'follow_up_question' as IntentCategory, confidence: 0.9, reason: 'planning_follow_up' }
  }

  const hasAction = ACTION_PATTERN.test(text)
  const hasAutomationSignal = AUTOMATION_SIGNAL_PATTERN.test(text)
  const explicitAutomation = /\b(?:automate|automation|automatically)\b/i.test(text)
  const confidence = hasAction && hasAutomationSignal ? 0.95 : explicitAutomation && hasAction ? 0.88 : hasAction ? 0.68 : 0.25

  if (confidence >= 0.8) {
    return { category: 'automation_request' as IntentCategory, confidence, reason: 'action_and_automation_signals' }
  }

  return { category: 'unknown' as IntentCategory, confidence, reason: hasAction ? 'incomplete_or_ambiguous_action' : 'no_automation_intent' }
}

export function detectCapability(prompt: string) {
  const text = normalize(prompt)
  let best: Capability | null = null
  let bestScore = 0
  for (const capability of PLATFORM_CAPS) {
    let score = 0
    for (const pattern of capability.patterns) {
      if (pattern.test(text)) score += 1
    }
    if (capability.id === 'github-issue' && /\b(?:issue|ticket)\b/i.test(text)) {
      score += 2
    }
    if (score > bestScore) {
      bestScore = score
      best = capability
    }
  }
  return bestScore > 0 ? best : null
}

export function describeCapabilityMatch(prompt: string) {
  const capability = detectCapability(prompt)
  if (!capability) return null
  const matchedPatterns = capability.patterns.filter(pattern => pattern.test(normalize(prompt))).map(pattern => pattern.source)
  let score = matchedPatterns.length
  if (capability.id === 'github-issue' && /\b(?:issue|ticket)\b/i.test(prompt)) score += 2

  return {
    capability,
    matchedPatterns,
    score,
  }
}
