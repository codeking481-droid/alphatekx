export const INTENT_CATEGORIES = Object.freeze({
  conversation: 'conversation',
  automation: 'automation_request',
  followUp: 'follow_up_question',
  clarification: 'clarification',
  help: 'help',
  unknown: 'unknown',
})

function normalize(message) {
  return String(message || '').trim().replace(/\s+/g, ' ')
}

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
  /^(?:i\s+am|i'm)\s+tired[?!.]*$/i,
  /^i\s+(?:need|would\s+like)\s+(?:some\s+)?advice[?!.]*$/i,
  /^i\s+want\s+to\s+think\s+about\s+my\s+life[?!.]*$/i,
]

const ACTION_PATTERN = /\b(?:automate|automation|post|publish|schedule|send|email|mail|remind|notify|reply|respond|save|copy|move|upload|monitor|summarize|generate|create|append|share)\b/i
const AUTOMATION_SIGNAL_PATTERN = /\b(?:linkedin|gmail|email|calendar|telegram|facebook|instagram|whatsapp|slack|discord|google\s+drive|google\s+sheets|every|daily|weekly|monthly|morning|afternoon|evening|monday|tuesday|wednesday|thursday|friday|saturday|sunday|automatically|automation|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i
const INCOMPLETE_ACTION_PATTERNS = [
  /^(?:please\s+)?post\s+(?:for\s+me|something|it)?[.!]*$/i,
  /^(?:please\s+)?send\s+(?:it|something|a\s+message)?[.!]*$/i,
  /^(?:please\s+)?automate\s+(?:this|it)?[.!]*$/i,
  /^(?:please\s+)?remind\s+me[.!]*$/i,
  /^(?:please\s+)?schedule\s+(?:it|this)?[.!]*$/i,
]

const FOLLOW_UP_PATTERN = /^(?:yes|no|approve|approved|continue|cancel|regenerate|rewrite|shorter|longer|linkedin|facebook|instagram|whatsapp|telegram|slack|discord|x|twitter|every\s+\w+|daily|weekly|monthly|\d{1,2}(?::\d{2})?\s*(?:am|pm)?|[\w.+-]+@[\w.-]+\.\w+)[.!]*$/i

export function classifyIntent(message, context = {}) {
  const text = normalize(message)
  if (!text) return { category: INTENT_CATEGORIES.unknown, confidence: 0, reason: 'empty_message' }

  if (HELP_PATTERNS.some(pattern => pattern.test(text))) {
    return { category: INTENT_CATEGORIES.help, confidence: 0.99, reason: 'help_question' }
  }
  if (CONVERSATION_PATTERNS.some(pattern => pattern.test(text))) {
    return { category: INTENT_CATEGORIES.conversation, confidence: 0.99, reason: 'conversation_pattern' }
  }
  if (context.hasPlanningContext && (FOLLOW_UP_PATTERN.test(text) || !ACTION_PATTERN.test(text) || text.split(/\s+/).length <= 12)) {
    return { category: INTENT_CATEGORIES.followUp, confidence: 0.9, reason: 'active_planning_context' }
  }
  if (INCOMPLETE_ACTION_PATTERNS.some(pattern => pattern.test(text))) {
    return { category: INTENT_CATEGORIES.clarification, confidence: 0.95, reason: 'incomplete_action' }
  }

  const hasAction = ACTION_PATTERN.test(text)
  const hasAutomationSignal = AUTOMATION_SIGNAL_PATTERN.test(text)
  const explicitAutomation = /\b(?:automate|automation|automatically)\b/i.test(text)
  const confidence = hasAction && hasAutomationSignal ? 0.95 : explicitAutomation && hasAction ? 0.88 : hasAction ? 0.68 : 0.25
  if (confidence >= 0.8) return { category: INTENT_CATEGORIES.automation, confidence, reason: 'action_and_automation_signals' }
  return { category: INTENT_CATEGORIES.unknown, confidence, reason: hasAction ? 'incomplete_or_ambiguous_action' : 'no_automation_intent' }
}

export function conversationalResponse(message) {
  const text = normalize(message).toLowerCase().replace(/[!?.]+$/g, '')
  if (/^(?:hi|hello|hey|hiya|good\s+(?:morning|afternoon|evening))$/.test(text)) {
    return "Hi! 👋\nI'm Alpha, your automation assistant. Tell me something you'd like me to automate."
  }
  if (/^how\s+are\s+you$/.test(text)) return "I'm doing great! Thanks for asking. What would you like to automate today?"
  if (/^(?:what(?:'s|\s+is)\s+your\s+name|who\s+are\s+you|can\s+you\s+introduce\s+yourself)$/.test(text)) {
    return "I'm Alpha. I help you automate repetitive work like publishing on LinkedIn, sending emails, and scheduling recurring tasks."
  }
  if (/^who\s+(?:created|made|built)\s+you$|^who\s+is\s+your\s+creator$/.test(text)) {
    return 'Alpha was created by the AlphaTekx team to help people turn repetitive work into reliable automations.'
  }
  if (/^(?:thank\s+you|thanks|thank\s+you\s+alpha|thanks\s+alpha)$/.test(text)) return "You're welcome!"
  if (/^(?:i\s+am|i'm)\s+tired$/.test(text)) return "That sounds exhausting. If you tell me what's taking your time, I can help you decide whether any of it can be automated."
  if (/^i\s+(?:need|would\s+like)\s+(?:some\s+)?advice$/.test(text)) return 'Of course. What would you like advice about?'
  if (/^i\s+want\s+to\s+think\s+about\s+my\s+life$/.test(text)) return "I'm here to listen. What part of life would you like to think through?"
  if (/^tell\s+me\s+(?:a\s+)?joke$/.test(text)) return 'Why did the automation take a break? It needed time to process. 🙂'
  if (/^(?:what\s+can\s+(?:you|alpha|alphatekx)\s+do|tell\s+me\s+about\s+(?:alpha|alphatekx)|(?:please\s+)?explain\s+(?:alpha|alphatekx)(?:\s+to\s+me)?)$/.test(text)) {
    return 'I can help you plan and run approved automations, including LinkedIn publishing, scheduled work, and connected-app tasks. Tell me the result you want.'
  }
  return 'Glad to hear from you. What would you like me to automate today?'
}

export function helpResponse(message) {
  const text = normalize(message).toLowerCase()
  if (text.includes('connect linkedin')) return 'Open Connected Apps, choose LinkedIn, and approve the requested LinkedIn permissions. Alpha will show Connected only after the account is verified.'
  if (text.includes('credit')) return 'Credits are used only when Alpha completes chargeable work successfully. Planning and normal conversation are free. You can buy credits from Settings → Billing.'
  if (text.includes('automation')) return 'Describe the result you want. Alpha asks only for missing details, shows the plan for review, and creates it only after your approval.'
  return 'I can explain connections, credits, planning, scheduling, and managing automations. What would you like help with?'
}

export function clarificationResponse(message) {
  const text = normalize(message).toLowerCase()
  if (/\bpost\b/.test(text)) return 'Sure. Which platform would you like me to post on?'
  if (/\bsend\b/.test(text)) return 'Sure. What should I send, and where should I send it?'
  if (/\bremind\b/.test(text)) return 'Sure. What should I remind you about, and when?'
  if (/\bschedule\b/.test(text)) return 'Sure. What should I schedule, and for what date and time?'
  return 'What would you like Alpha to automate? Please include the action and where or when it should happen.'
}
