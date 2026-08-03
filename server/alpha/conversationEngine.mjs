import { randomUUID } from 'node:crypto'
import { buildCapabilityPlan, detectCapability, isSupportedAction } from '../automation/capabilityRegistry.mjs'
import { calendarHasDuplicates } from '../automation/contentMemory.mjs'
import { listImageProviders } from '../automation/imageGateway.mjs'
import { selectHookExamples } from '../automation/viralHooks.mjs'
import { scheduledCreditCost } from '../schedulePricing.mjs'
import { connectorFeatureAccess, unavailableConnectorMessage, unavailablePromptConnector } from '../featureAccess.mjs'
import { classifyIntent, clarificationResponse, conversationalResponse, helpResponse, INTENT_CATEGORIES } from './intentClassifier.mjs'
import { ALPHATEKX_BRAIN, answerFromBrain } from './brainKnowledge.mjs'
import { normalizeAutomationLifecycle } from '../automation/lifecycle.mjs'

const STAGES = [
  'understanding',
  'gathering_information',
  'generating_content',
  'awaiting_content_review',
  'checking_capabilities',
  'awaiting_connection',
  'planning',
  'awaiting_approval',
  'ready_to_create',
  'created',
  'chatting',
  'blocked',
  'unsupported',
]

const PLATFORM_NAMES = {
  linkedin: 'LinkedIn',
  whatsapp: 'WhatsApp',
  youtube: 'YouTube',
  telegram: 'Telegram',
  slack: 'Slack',
  discord: 'Discord',
}

const SOCIAL_CONTENT_INTENTS = new Set([
  'social_content',
  'linkedin_posts',
  'content_campaign',
  'linkedin',
  'youtube',
  'whatsapp',
])

function nowIso() { return new Date().toISOString() }
function automationIdFor(conversation) {
  if (!conversation.automationId) conversation.automationId = randomUUID()
  return conversation.automationId
}

function conversationalReply(text) {
  const normalized = String(text || '').trim().toLowerCase().replace(/[!?.]+$/g, '').trim()
  if (/^(?:hi|hello|hey|good\s+(?:morning|afternoon|evening)|how\s+are\s+you|how(?:'s|\s+is)\s+it\s+going)$/.test(normalized)) {
    return conversationalResponse(text)
  }
  if (/^(?:thanks|thank\s+you|thank\s+you\s+alpha|thanks\s+alpha)$/.test(normalized)) {
    return 'You’re welcome! What would you like me to automate today?'
  }
  if (/^(?:what\s+can\s+(?:alphatekx|alpha)\s+do|what\s+do\s+you\s+do)$/.test(normalized)) {
    return conversationalResponse(text)
  }
  return ''
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next.toISOString().split('T')[0]
}

function parseTime(text) {
  const colonMatch = String(text).match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/i)
  const hourMatch = String(text).match(/\b(\d{1,2})\s*(am|pm)\b/i)
  const match = colonMatch || (hourMatch ? [hourMatch[0], hourMatch[1], '0', hourMatch[2]] : null)
  if (match) {
    let hour = parseInt(match[1], 10)
    const minute = parseInt(match[2] || '0', 10)
    const period = (match[3] || '').toLowerCase()
    if (period === 'pm' && hour !== 12) hour += 12
    if (period === 'am' && hour === 12) hour = 0
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) return { hour, minute, display: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}` }
  }
  const lower = String(text).toLowerCase()
  if (/\bnoon\b/.test(lower)) return { hour: 12, minute: 0, display: '12:00' }
  if (/\bmorning\b/.test(lower) || /\b8\s*am\b/.test(lower)) return { hour: 8, minute: 0, display: '08:00' }
  if (/\bafternoon\b/.test(lower)) return { hour: 13, minute: 0, display: '13:00' }
  if (/\bevening\b/.test(lower) || /\b6\s*pm\b/.test(lower)) return { hour: 18, minute: 0, display: '18:00' }
  if (/\bmidnight\b/.test(lower)) return { hour: 0, minute: 0, display: '00:00' }
  return null
}

function parseDuration(text) {
  const m = String(text).match(/for\s+(\d+)\s*(days?|weeks?|months?)/i)
  if (m) {
    const n = parseInt(m[1], 10)
    const unit = m[2].toLowerCase()
    if (unit.startsWith('week')) return n * 7
    if (unit.startsWith('month')) return n * 30
    return n
  }
  if (/for\s+(?:one|a)\s+week/i.test(text)) return 7
  if (/for\s+(?:one|a)\s+month/i.test(text)) return 30
  return null
}

function extractTimeFromText(text) {
  const time = parseTime(text)
  if (time) return time.display
  const lower = String(text).toLowerCase()
  if (/\bmorning\b/.test(lower)) return '08:00'
  if (/\bnoon\b/.test(lower)) return '12:00'
  if (/\bevening\b/.test(lower)) return '18:00'
  if (/\bnight\b/.test(lower)) return '20:00'
  return ''
}

const NUMBER_WORDS = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty']

function wordToNumber(text) {
  const lower = String(text).toLowerCase()
  for (let i = NUMBER_WORDS.length - 1; i >= 0; i--) {
    if (new RegExp(`\\b${NUMBER_WORDS[i]}\\b`).test(lower)) return i
  }
  return null
}

function extractDurationFromText(text) {
  const days = parseDuration(text)
  if (days) return days
  const lower = String(text).toLowerCase()
  const wordNum = wordToNumber(text)
  if (wordNum !== null && wordNum > 0) {
    if (/\b(week|weeks)\b/.test(lower)) return wordNum * 7
    if (/\b(month|months)\b/.test(lower)) return wordNum * 30
    return wordNum
  }
  if (/\bone\s+week\b/.test(lower)) return 7
  if (/\btwo\s+weeks\b/.test(lower)) return 14
  if (/\bone\s+month\b/.test(lower)) return 30
  if (/\bthirty\s+days\b/.test(lower)) return 30
  if (/\ba\s+week\b/.test(lower)) return 7
  if (/\ba\s+month\b/.test(lower)) return 30
  return null
}

function cleanBusiness(text) {
  return String(text || '')
    .replace(/^\s*(?:i\s+(?:sell|make|offer|run|own|have)|my\s+business\s+(?:is|offers?))\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function requestsSinglePost(prompt) {
  const lower = String(prompt || '').toLowerCase()
  if (/\b(every|each|daily|weekly|monthly|monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month)\b/.test(lower)) return false
  return /\b(?:create|generate|make|write)\s+(?:a(?:\s+(?:single|strong|great))?|one)\s+(?:linkedin\s+|medium\s+)?(?:post|article)\b/i.test(prompt) ||
    /\b(?:only|exactly)\s+one\s+posts?\b/i.test(prompt) ||
    /\bdo not schedule (?:a )?recurring campaign\b/i.test(prompt)
}

export function publishingModeFromPrompt(prompt) {
  const text = String(prompt || '').toLowerCase()
  const rejectsRecurring = /\b(?:do\s+not|don't|not)\s+(?:schedule\s+)?(?:a\s+)?recurring\b/.test(text)
  if (!rejectsRecurring && (/\b(?:every|each|daily|weekly|monthly|weekdays?|recurring|repeat)\b/.test(text) || /\bfor\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:days?|weeks?|months?)\b/.test(text))) return 'recurring'
  if (/\b(?:now|immediately|right\s+now|publish\s+now)\b/.test(text)) return 'once_now'
  if (/\b(?:today|tomorrow|tonight|schedule\s+(?:it\s+)?for|on\s+\d{4}-\d{2}-\d{2})\b/.test(text)) return 'once_later'
  return ''
}

export function heuristicParseRequest(prompt) {
  const lower = String(prompt || '').toLowerCase()
  const result = { intent: 'unknown', knownFields: {} }
  const hasPost = /\b(posts?|articles?|content)\b/.test(lower)
  const platformList = [
    { id: 'linkedin', test: /\blinkedin\b/ },
    { id: 'medium', test: /\bmedium\b/ },
    { id: 'threads', test: /\bthreads\b/ },
    { id: 'youtube', test: /\byoutube\b/ },
  ]
  const platforms = platformList
    .map(p => ({ ...p, match: lower.match(p.test) }))
    .filter(p => p.match)
    .sort((a, b) => (a.match?.index ?? Number.MAX_SAFE_INTEGER) - (b.match?.index ?? Number.MAX_SAFE_INTEGER))
    .map(p => p.id)
    .filter((platform, index, all) => all.indexOf(platform) === index)
  if (!hasPost) return result
  result.intent = 'social_content'
  result.knownFields.platforms = platforms

  const businessPatterns = [
    /\bbusiness\s*:\s*([^\n]+)/i,
    /\bintroducing\s+([^,.!?]+)/i,
    /\bmy\s+business\s+(?:is|offers?)\s+([^,.!?]+)/i,
    /\b(?:post|article)\s+(?:about|on)\s+([^,.!?]+)/i,
    /\babout\s+([^,.!?]+)/i,
  ]
  for (const re of businessPatterns) {
    const m = prompt.match(re)
    if (m) { result.knownFields.business = cleanBusiness(m[1]); break }
  }

  const explicitAudienceMatch = prompt.match(/\b(?:target(?:ed)?\s+audience|audience)(?:\s+is)?\s*[:=]\s*([^\.\n]+(?:,[^\.\n]+)*)/i)
  const goalAudienceMatch = prompt.match(/\bgoal\s*:\s*(?:attract|reach|target)\s+([^\.\n]+)/i)
  const genericAudienceMatch = prompt.match(/\bfor\s+(?!\d+\s*(?:days?|weeks?|months?)\b)([^\.\n]+(?:,[^\.\n]+)*)/i)
  if (explicitAudienceMatch) result.knownFields.audience = explicitAudienceMatch[1].trim().replace(/\s+/g, ' ')
  else if (goalAudienceMatch) result.knownFields.audience = goalAudienceMatch[1].trim().replace(/\s+/g, ' ')
  else if (/\bbuild\s+for\s+real\s+businesses\b/i.test(prompt)) result.knownFields.audience = 'real businesses, founders, and teams that need production-ready websites and automation'
  else if (genericAudienceMatch) result.knownFields.audience = genericAudienceMatch[1].trim().replace(/\s+/g, ' ')

  const toneMatch = prompt.match(/\btone(?:\s+is)?\s*[:=]?\s*([^\.\n]+)/i) ||
                    prompt.match(/(?:\bin a|\bwith a)\s+([^\.\n]+?)\s+\btone\b/i)
  if (toneMatch) result.knownFields.tone = toneMatch[1].trim().replace(/\s+/g, ' ')
  else if (/\badapt\s+(?:the\s+)?captions?\b/i.test(prompt) && platforms.length > 1) {
    result.knownFields.tone = 'platform-native: professional LinkedIn tone with a clear business focus'
  }

  const platformTimes = {}
  const platformTimePatterns = [
    ['linkedin', /\blinkedin\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i],
  ]
  for (const [platform, pattern] of platformTimePatterns) {
    const match = prompt.match(pattern)
    const parsed = match ? parseTime(match[1]) : null
    if (parsed) platformTimes[platform] = parsed.display
  }
  if (Object.keys(platformTimes).length) {
    result.knownFields.platformTimes = platformTimes
    result.knownFields.time = Object.values(platformTimes)[0]
  }

  const time = extractTimeFromText(prompt)
  if (time && !result.knownFields.time) result.knownFields.time = time

  const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].filter(day => new RegExp(`\\b${day}s?\\b`, 'i').test(prompt))
  if (weekdays.length) {
    result.knownFields.daysOfWeek = weekdays
    result.knownFields.frequency = 'weekly'
  } else if (/\bweekdays?\b/i.test(prompt)) result.knownFields.frequency = 'weekdays'
  else if (/\b(?:every\s+day|daily)\b/i.test(prompt)) result.knownFields.frequency = 'daily'
  else if (/\bpost times?\b[\s\S]*\bdaily\b/i.test(prompt)) result.knownFields.frequency = 'daily'
  else if (/\bmonthly\b|\bevery\s+month\b/i.test(prompt)) result.knownFields.frequency = 'monthly'

  const timezoneMatch = prompt.match(/\b(?:timezone\s*[:=]?\s*)?(WAT|UTC|GMT|Africa\/Lagos)\b/i) ||
    prompt.match(/\btimezone\s*[:=]\s*([A-Za-z_]+\/[A-Za-z_]+)\b/i)
  if (timezoneMatch) result.knownFields.timezone = timezoneMatch[1]
  const startMatch = prompt.match(/\bstart(?:ing)?\s+(?:on\s+)?(\d{4}-\d{2}-\d{2}|today|tomorrow)\b/i)
  if (startMatch) result.knownFields.startDate = startMatch[1].toLowerCase()
  else if (/\b(?:today\s+to|start\s+now|begin\s+now)\b/i.test(prompt)) result.knownFields.startDate = new Date().toISOString().split('T')[0]
  const endMatch = prompt.match(/\b(?:until|end(?:ing)?\s+(?:on\s+)?)(\d{4}-\d{2}-\d{2})\b/i)
  if (endMatch) result.knownFields.endDate = endMatch[1]
  const runMatch = prompt.match(/\b(?:for|stop\s+after)\s+(\d+)\s+(?:posts?|runs?)\b/i)
  if (runMatch) result.knownFields.totalPosts = Number(runMatch[1])
  if (/\buntil\s+paused\b/i.test(prompt)) {
    result.knownFields.endCondition = 'until_paused'
    result.knownFields.durationSource = 'user_explicit'
  }
  const ctaMatch = prompt.match(/\b(?:cta|call to action)\s*[:=]\s*([^\n.]+)/i)
  if (ctaMatch) result.knownFields.callToAction = ctaMatch[1].trim()

  const explicitPostCount = prompt.match(/\b(?:create|generate|make|write)(?:\s+only)?\s+(one|\d+)\s+(?:linkedin\s+|medium\s+)?posts?\b/i) ||
    prompt.match(/\b(?:only|exactly|total)\s+(one|\d+)\s+posts?\b/i)
  if (explicitPostCount) result.knownFields.totalPosts = explicitPostCount[1].toLowerCase() === 'one' ? 1 : Number(explicitPostCount[1])
  const isSinglePost = requestsSinglePost(prompt)
  const publishingMode = publishingModeFromPrompt(prompt)
  if (publishingMode) {
    result.knownFields.publishingMode = publishingMode
    result.knownFields.scheduleSource = 'user_explicit'
  }
  if ((isSinglePost && /\b(?:one|single|only|exactly|do not schedule)\b/i.test(prompt)) || result.knownFields.totalPosts === 1 || publishingMode === 'once_now' || publishingMode === 'once_later') {
    result.knownFields.totalPosts = 1
    result.knownFields.durationDays = 1
    result.knownFields.durationSource = publishingMode ? 'user_confirmed' : 'user_explicit'
    if (publishingMode === 'once_now' || publishingMode === 'once_later') result.knownFields.frequency = 'once'
  }
  const duration = /\b(?:days?|weeks?|months?)\b/i.test(prompt) ? extractDurationFromText(prompt) : null
  if (duration) {
    result.knownFields.durationDays = duration
    result.knownFields.durationSource = 'user_explicit'
  }
  if (publishingMode === 'once_later') {
    const date = new Date()
    if (/\btomorrow\b/i.test(prompt)) date.setDate(date.getDate() + 1)
    if (/\b(?:today|tomorrow)\b/i.test(prompt)) result.knownFields.startDate = date.toISOString().split('T')[0]
  }

  if (/\b(do not publish|until i approve|manual approval|review before publishing|approve it)\b/i.test(lower)) result.knownFields.approvalPreference = 'manual'
  else if (/\b(auto publish|publish automatically|auto approval)\b/i.test(lower)) result.knownFields.approvalPreference = 'auto'
  else if (platforms.includes('linkedin')) result.knownFields.approvalPreference = 'manual'
  if (/\b(with|add|include|generate|use)\s+(?:a |an )?(?:matching )?(?:image|picture|visual|photo)\b/i.test(prompt)) result.knownFields.includeImages = true
  if (/\b(?:without|no|do not use|don'?t use)\s+(?:an? )?(?:image|picture|visual|photo)s?\b/i.test(prompt)) result.knownFields.includeImages = false

  return result
}

function normalizePlatform(name) {
  const n = String(name).toLowerCase().replace(/\s+/g, '').replace(/^@/, '')
  if (n.includes('linkedin')) return 'linkedin'
  if (n.includes('telegram')) return 'telegram'
  if (n.includes('slack')) return 'slack'
  if (n.includes('whatsapp')) return 'whatsapp'
  if (n.includes('youtube')) return 'youtube'
  if (n.includes('discord')) return 'discord'
  return n
}

function computePostCredits(platforms, includeImage = false) {
  void includeImage
  if (platforms.length === 1 && platforms[0] === 'linkedin') return 3
  return Math.max(1, platforms.length)
}

function buildCron(timeDisplay, fallbackHour = 8) {
  const t = parseTime(timeDisplay) || { hour: fallbackHour, minute: 0 }
  return `${t.minute} ${t.hour} * * *`
}

const ALPHA_SYSTEM_IDENTITY = `You are Alpha, the intelligent automation brain of AlphaTekx.
Your job is to turn user goals into safe, valid, executable automations.
You can understand requests, ask one concise question at a time, generate original content, explain plans, suggest improvements, and help users manage automations.
Your available connection families include GitHub for code and repository work, Google Docs for documents and proposals, Google Sheets for orders and inventory, YouTube for approved video uploads, Discord for team messages, WhatsApp for customer communication, and Instagram/Facebook for approved social publishing.
Route explicit order or inventory requests to Google Sheets, document or proposal requests to Google Docs, repository or code requests to GitHub, team-chat requests to Discord, video publishing to YouTube, and social publishing to the named social platform. Use deterministic registered capabilities before model-based intent classification.
Never claim to have checked or changed an external service unless its registered tool returned a confirmed result. If the required account is disconnected, ask the user to connect it instead of improvising.
Stay concise. Match the user's language naturally; light Nigerian English or Pidgin is welcome when the user writes that way, but never force it or assume every user runs a fashion business.
You must distinguish between discussing an idea, generating content, planning an automation, waiting for information, waiting for app connection, waiting for approval, scheduling, executing, and confirming completion.
You must never say an action succeeded unless a registered tool or execution record confirms success.
You must never invent connected accounts, published posts, sent messages, uploaded videos, payment results, calendar events, spreadsheet updates, or automation executions.
Always respond in valid JSON when asked.`

function requiredMissingFields(intent, knownFields) {
  const missing = []
  if (SOCIAL_CONTENT_INTENTS.has(intent)) {
    if (!knownFields.platforms || !knownFields.platforms.length) missing.push({ field: 'platforms', question: 'Which platforms should Alpha post to? I will show which ones are connected before creating anything.', reason: 'Alpha must never assume a publishing platform.', required: true })
    if (!knownFields.business) missing.push({ field: 'business', question: 'What should the post be about? Tell me the product, business, offer, or message you want people to see.', reason: 'Alpha needs one clear subject before writing the post.', required: true })
    const untilPaused = knownFields.endCondition === 'until_paused'
    if (untilPaused && !knownFields.untilPausedConfirmed) missing.push({ field: 'untilPausedConfirmation', question: 'This schedule runs until paused. Should Alpha auto-pause when your credits finish, set a fixed limit, or wait while you buy more credits?', reason: 'Infinite schedules require an explicit credit-safety choice.', required: true })
    const mode = knownFields.publishingMode || ''
    const recurring = mode === 'recurring'
    if (!mode) missing.push({ field: 'publishingMode', question: 'Should I publish this once now, once on a date and time you choose, or repeatedly?', reason: 'I need the publishing mode before I create a safe schedule.', required: true })
    if (recurring && !knownFields.endDate && !knownFields.totalPosts && !knownFields.total_posts && !knownFields.durationDays && !knownFields.endCondition) missing.push({ field: 'endCondition', question: 'How long should this continue? Choose an end date, number of weeks, number of posts, or continue until paused.', reason: 'Recurring publishing needs a user-confirmed end condition.', required: true })
    if (recurring && !knownFields.frequency) missing.push({ field: 'frequency', question: 'How often should Alpha publish?', reason: 'Recurring publishing needs a user-confirmed frequency.', required: true })
    if ((recurring || mode === 'once_later') && !knownFields.time) missing.push({ field: 'time', question: 'What exact time should the post go out?', reason: 'Scheduled publishing needs a user-confirmed time.', required: true })
    if (recurring && !knownFields.timezone) missing.push({ field: 'timezone', question: 'Which timezone should I use? (for example Africa/Lagos)', reason: 'The server needs an exact timezone for reliable scheduling.', required: true })
    if (recurring && !knownFields.startDate) missing.push({ field: 'startDate', question: 'When should this campaign start?', reason: 'I need the first eligible publishing date.', required: true })
    if (mode === 'once_later' && !knownFields.timezone) missing.push({ field: 'timezone', question: 'Which timezone should I use for that scheduled time?', reason: 'The server needs an exact timezone for reliable scheduling.', required: true })
    if (mode === 'once_later' && !knownFields.startDate) missing.push({ field: 'startDate', question: 'What date should it be published?', reason: 'A one-time scheduled post needs an exact date.', required: true })
    if (!knownFields.audience) missing.push({ field: 'audience', question: 'Who should this post speak to?', reason: 'I need this to make the posts persuasive.', required: true })
    if (!knownFields.tone) missing.push({ field: 'tone', question: 'What tone should I use: professional, friendly, playful, bold, or persuasive?', reason: 'This determines how the content sounds.', required: true })
    if (recurring && !untilPaused && !knownFields.durationDays && !knownFields.duration_days && !knownFields.totalPosts && !knownFields.total_posts && !knownFields.endDate) missing.push({ field: 'durationDays', question: 'How long should it run: a number of days, weeks, months, or posts?', reason: 'This determines how many posts to generate.', required: true })
    return missing
  }

  if (intent === 'send_email') {
    if (!knownFields.to) missing.push({ field: 'to', question: 'What email address should receive this?', reason: 'An email recipient is required.', required: true })
    if (!knownFields.subject && !knownFields.topic) missing.push({ field: 'subject', question: 'What is the email about or what should the subject be?', reason: 'I need this to write the email.', required: true })
    if (!knownFields.time) missing.push({ field: 'time', question: 'When should the email be sent? (one-time, daily, weekly, or a specific time)', reason: 'I need a schedule.', required: false })
    return missing
  }

  if (intent === 'whatsapp_message') {
    if (!knownFields.to) missing.push({ field: 'to', question: 'Which approved test number should receive “Hi from AlphaTekx.”?', reason: 'The WhatsApp test needs one allowlisted recipient.', required: true })
    if (!knownFields.message) missing.push({ field: 'message', question: 'Confirm the message “Hi from AlphaTekx.”', reason: 'The first test supports only this exact reviewed message.', required: true })
    return missing
  }

  if (intent === 'telegram_message' || intent === 'slack_message') {
    if (!knownFields.to && !knownFields.chat_id && !knownFields.channel) missing.push({ field: 'to', question: 'Where should the message go? (chat ID, channel, or phone number)', reason: 'I need a destination.', required: true })
    if (!knownFields.message && !knownFields.topic) missing.push({ field: 'message', question: 'What should the message say?', reason: 'I need the message content.', required: true })
    if (!knownFields.time) missing.push({ field: 'time', question: 'When should it be sent?', reason: 'I need a schedule.', required: false })
    return missing
  }

  if (intent === 'calendar_summary') {
    if (!knownFields.to) missing.push({ field: 'to', question: 'What email should receive the summary?', reason: 'I need a recipient.', required: true })
    if (!knownFields.time) missing.push({ field: 'time', question: 'What time should the summary be sent? (e.g. 8 AM)', reason: 'I need a schedule time.', required: true })
    return missing
  }

  return []
}

function publishingModeQuestion() {
  return {
    field: 'publishingMode',
    question: 'Should Alpha publish this once now, once at a specific date and time, or as a recurring campaign?',
    reason: 'The publishing schedule must be explicitly confirmed before content is generated.',
    required: true,
  }
}

export function contentGenerationMissingFields(intent, knownFields = {}) {
  const missing = requiredMissingFields(intent, knownFields)
  const publishingMode = knownFields.publishingMode
  if (
    SOCIAL_CONTENT_INTENTS.has(intent) &&
    (!['once_now', 'once_later', 'recurring'].includes(publishingMode) || knownFields.scheduleSource === 'unresolved') &&
    !missing.some(item => item.field === 'publishingMode')
  ) {
    missing.unshift(publishingModeQuestion())
  }
  return missing
}

export function createConversationEngine(deps) {
  const {
    callLLMForRole,
    saveServerAgent,
    getServerAgent,
    getUserCredits,
    spendUserCredits,
    getIntegrationStatus,
    getSmartImage,
    executeAgent,
  } = deps

  function normalizeImageCommand(value) {
    return String(value || '')
      .replace(/\b(?:creaet|craete|cretae|creat)\b/gi, 'create')
      .replace(/\b(?:genrate|generat|genereate)\b/gi, 'generate')
  }

  function isDirectImageRequest(value) {
    const prompt = normalizeImageCommand(value)
    const asksForImage = /\b(?:image|picture|photo|visual|artwork|illustration)\b/i.test(prompt)
    const createsSomething = /\b(?:create|generate|make|draw|design|produce|show\s+me)\b/i.test(prompt)
    return asksForImage && createsSomething && !/\b(?:post|publish|schedule|automation|campaign)\b/i.test(prompt)
  }

  async function saveConversation(conversation) {
    conversation.updatedAt = nowIso()
    await saveServerAgent(conversation)
    return conversation
  }

  async function loadConversation(id, user) {
    const conversation = await getServerAgent(id, user.id)
    if (!conversation) throw new Error('Conversation not found')
    if (conversation.userId && conversation.userId !== user.id) throw new Error('Not authorized')
    return conversation
  }

  function addMessage(conversation, role, text, metadata = {}) {
    conversation.messages = conversation.messages || []
    conversation.messages.push({ role, text, ts: nowIso(), ...metadata })
  }

  function detectContradiction(known) {
    const freq = String(known.frequency || '').toLowerCase()
    const dayValues = [].concat(known.days || [], known.day || [], known.weekDays || [], known.daysOfWeek || []).filter(Boolean)
    const days = Array.isArray(dayValues) ? dayValues.map(d => String(d).toLowerCase()) : [String(dayValues || '')?.toLowerCase()].filter(Boolean)
    const everyDay = /\bevery\s+day\b|\bdaily\b/i.test(freq)
    const specificDay = days.length > 0 || /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b/i.test(freq)
    if (everyDay && specificDay) {
      return { contradiction: true, question: 'You said "every day" but also mentioned a specific day. Do you want the posts to go out every day, only on specific days, or something else? Please clarify.' }
    }
    const time = String(known.time || '').toLowerCase()
    const times = time.match(/\d{1,2}:\d{2}\s*(?:am|pm)?/gi) || []
    if (times && times.length > 1) {
      return { contradiction: true, question: `You mentioned multiple times (${times.join(', ')}). Which time should I use?` }
    }
    return { contradiction: false, question: '' }
  }

  async function understandRequest(conversation, promptOverride = '') {
    const prompt = normalizeImageCommand(promptOverride || conversation.originalRequest)
    const directImageRequest = isDirectImageRequest(prompt)
    if (directImageRequest) {
      conversation.intentClassification = { category: INTENT_CATEGORIES.conversation, confidence: 1, reason: 'direct_image_request' }
      conversation.intent = 'image_generation'
      conversation.confidence = 1
      conversation.currentGoal = ''
      conversation.knownFields = { imagePrompt: prompt }
      conversation.missingFields = []
      conversation.automationDraft = null
      conversation.conversationStage = 'chatting'
      if (typeof getSmartImage !== 'function') {
        addMessage(conversation, 'alpha', 'Image creation is temporarily unavailable. Nothing was charged—please retry when the image service is ready.')
        return
      }
      try {
        const image = await getSmartImage(
          { id: conversation.userId, email: conversation.userEmail },
          prompt,
          prompt,
          'media_library',
          { allowEphemeral: true },
        )
        if (!image?.image_url) throw new Error('The image provider did not return a verified image.')
        const saved = Boolean(image.image_storage_path)
        addMessage(conversation, 'alpha', `${saved ? 'I created and saved this image for you.' : 'I created this image for you.'}\n\n![Generated image](${image.image_url})`, {
          imageUrl: image.image_url,
          imageStoragePath: image.image_storage_path || undefined,
          imagePrompt: image.image_prompt || prompt,
          imageSource: image.image_source || 'matchmaker',
          persistenceWarning: image.persistence_warning || undefined,
        })
      } catch (error) {
        addMessage(conversation, 'alpha', `I couldn't create a verified image this time, so nothing was charged. ${error instanceof Error ? error.message : 'Please retry.'}`)
      }
      return
    }
    const brainAnswer = answerFromBrain(prompt)
    if (brainAnswer) {
      conversation.intentClassification = { category: INTENT_CATEGORIES.conversation, confidence: 1, reason: 'deterministic_brain_knowledge' }
      conversation.intent = INTENT_CATEGORIES.conversation
      conversation.confidence = 1
      conversation.currentGoal = ''
      conversation.knownFields = {}
      conversation.missingFields = []
      conversation.automationDraft = null
      conversation.conversationStage = 'chatting'
      addMessage(conversation, 'alpha', brainAnswer, { knowledgeSource: 'alphatekx-brain' })
      return
    }
    const classification = classifyIntent(prompt)
    conversation.intentClassification = classification
    conversation.intent = classification.category
    conversation.confidence = classification.confidence

    if (classification.category === INTENT_CATEGORIES.conversation || classification.category === INTENT_CATEGORIES.help) {
      conversation.currentGoal = ''
      conversation.knownFields = {}
      conversation.missingFields = []
      conversation.automationDraft = null
      conversation.conversationStage = 'chatting'
      addMessage(conversation, 'alpha', classification.category === INTENT_CATEGORIES.help ? helpResponse(prompt) : (conversationalResponse(prompt) || conversationalReply(prompt)))
      return
    }
    if (classification.category === INTENT_CATEGORIES.clarification) {
      conversation.currentGoal = prompt
      conversation.knownFields = {}
      conversation.missingFields = []
      conversation.automationDraft = null
      conversation.conversationStage = 'clarification'
      addMessage(conversation, 'alpha', clarificationResponse(prompt))
      return
    }
    if (classification.category !== INTENT_CATEGORIES.automation || classification.confidence < 0.8) {
      conversation.currentGoal = ''
      conversation.knownFields = {}
      conversation.missingFields = []
      conversation.automationDraft = null
      conversation.conversationStage = 'chatting'
      addMessage(conversation, 'alpha', 'I want to make sure I understand. Are you asking me to automate something, or would you like to ask a question?')
      return
    }
    addMessage(conversation, 'alpha', "Got it. I'll help you automate that. First, I need to check a few details.")
    const unavailable = unavailablePromptConnector({ email: conversation.userEmail }, prompt, true)
    if (unavailable) {
      conversation.intent = 'unavailable_capability'
      conversation.confidence = 1
      conversation.currentGoal = ''
      conversation.knownFields = {}
      conversation.missingFields = []
      conversation.automationDraft = null
      conversation.conversationStage = 'chatting'
      addMessage(conversation, 'alpha', unavailableConnectorMessage(unavailable))
      return
    }
    const capability = detectCapability(prompt)

    const fastHeuristic = heuristicParseRequest(prompt)
    if (capability?.id === 'gmail-attachments-to-drive') {
      const capabilityPlan = buildCapabilityPlan(prompt, { email: conversation.userEmail })
      conversation.intent = 'gmail_attachments_to_drive'
      conversation.confidence = 1
      conversation.currentGoal = capabilityPlan.interpretedGoal || prompt
      conversation.knownFields = extractKnownFieldsFromCapability(capabilityPlan)
      conversation.missingFields = []
      conversation.askedFields = conversation.askedFields || []
      await moveToPlanningOrContent(conversation)
      return
    }
    if (capability?.id === 'whatsapp-first-message') {
      const capabilityPlan = buildCapabilityPlan(prompt, { email: conversation.userEmail })
      conversation.intent = 'whatsapp_message'
      conversation.confidence = 1
      conversation.currentGoal = capabilityPlan.interpretedGoal || prompt
      conversation.knownFields = extractKnownFieldsFromCapability(capabilityPlan)
      conversation.missingFields = requiredMissingFields(conversation.intent, conversation.knownFields)
      conversation.askedFields = conversation.askedFields || []
      if (conversation.missingFields.length) {
        conversation.conversationStage = 'gathering_information'
        await askNextQuestion(conversation)
      } else {
        await moveToPlanningOrContent(conversation)
      }
      return
    }
    if (SOCIAL_CONTENT_INTENTS.has(fastHeuristic.intent)) {
      conversation.intent = fastHeuristic.intent
      conversation.confidence = 0.9
      conversation.currentGoal = fastHeuristic.knownFields.topic || prompt
      conversation.knownFields = normalizeKnownFields(fastHeuristic.knownFields, prompt)
      conversation.knownFields.platforms = conversation.knownFields.platforms || fastHeuristic.knownFields.platforms || []
      if (!conversation.knownFields.time) {
        const extractedTime = extractTimeFromText(prompt)
        if (extractedTime) conversation.knownFields.time = extractedTime
      }
      if (!conversation.knownFields.durationDays && !conversation.knownFields.duration_days) {
        const extractedDuration = extractDurationFromText(prompt)
        if (extractedDuration) conversation.knownFields.durationDays = extractedDuration
      }
      if (!conversation.knownFields.business) {
        const businessMatch = prompt.match(/my\s+business\s+(?:is|offers?)\s+([^,.!?]+)/i)
        if (businessMatch) conversation.knownFields.business = businessMatch[1].trim()
      }
      const missing = requiredMissingFields(conversation.intent, conversation.knownFields)
      const known = conversation.knownFields
      conversation.missingFields = missing.filter(m => {
        const value = known[m.field]
        if (Array.isArray(value)) return value.length === 0
        if (typeof value === 'boolean') return false
        return value === undefined || value === null || String(value).trim() === ''
      })
      conversation.askedFields = conversation.askedFields || []
      if (conversation.missingFields.length > 0) {
        conversation.conversationStage = 'gathering_information'
        await askNextQuestion(conversation)
      } else {
        await moveToPlanningOrContent(conversation)
      }
      return
    }

    const system = `${ALPHA_SYSTEM_IDENTITY}

Analyze the user's request and return a JSON object with:
- intent: one of social_content, send_email, gmail_attachments_to_drive, telegram_message, slack_message, whatsapp_message, calendar_summary, sheets_append, unsupported, unknown
- goal: a short rewritten goal in plain English
- confidence: 0 to 1
- platforms: array of platform names mentioned (linkedin, telegram, slack, gmail, google_sheets, google_calendar)
- business: business name or description if present
- audience: target audience if present
- tone: tone if present
- time: time of day if present (as a string like "9:00 AM")
- durationDays: number of days if present
- totalPosts: number of posts if present
- approvalPreference: "manual" or "auto" if mentioned
- knownFields: object of any values you already extracted
- missingFields: array of objects {field, question, reason, required} for the most important missing details
- unsupportedReason: short reason if the request cannot be done
- alternative: a short alternative suggestion if unsupported

If the user uses Nigerian English, slang, bad grammar, or misspellings, still extract the meaning.
Do not return placeholder text. Use the words the user actually provided.`

    let parsed = { intent: 'unknown', confidence: 0, missingFields: [], knownFields: {} }
    try {
      const res = await callLLMForRole('fast', system, `User request: "${prompt}"`, { jsonMode: true, maxTokens: 1000 })
      logModelCall(conversation, res, 'understand_request')
      parsed = res.result || parsed
    } catch (err) {
      try {
        const res = await callLLMForRole('reasoning', system, `User request: "${prompt}"`, { jsonMode: true, maxTokens: 1000 })
        logModelCall(conversation, res, 'understand_request_fallback')
        parsed = res.result || parsed
      } catch (err2) {
        console.error('[conversationEngine] understandRequest failed:', err, err2)
      }
    }

    const capabilityPlan = buildCapabilityPlan(prompt, { email: conversation.userEmail })
    if (capabilityPlan) {
        parsed.intent = mapCapabilityToIntent(capabilityPlan, parsed.intent)
      if (capabilityPlan.unsupported && parsed.intent !== 'social_content') {
        parsed.intent = 'unsupported'
        parsed.unsupportedReason = capabilityPlan.reason
        parsed.alternative = capabilityPlan.alternative
      }
      parsed.knownFields = { ...extractKnownFieldsFromCapability(capabilityPlan), ...parsed.knownFields }
    }

    const heuristic = heuristicParseRequest(prompt)
    if (SOCIAL_CONTENT_INTENTS.has(heuristic.intent)) {
      if (!SOCIAL_CONTENT_INTENTS.has(parsed.intent || '')) parsed.intent = heuristic.intent
      parsed.knownFields = { ...heuristic.knownFields, ...parsed.knownFields }
    }

    conversation.intent = parsed.intent || 'unknown'
    conversation.confidence = Number(parsed.confidence) || 0
    conversation.currentGoal = parsed.goal || conversation.originalRequest
    conversation.knownFields = normalizeKnownFields(parsed.knownFields || {}, prompt)
    conversation.knownFields.platforms = conversation.knownFields.platforms || parsed.platforms || []
    if (SOCIAL_CONTENT_INTENTS.has(conversation.intent)) {
      const explicitSchedule = heuristic.knownFields || {}
      for (const field of ['publishingMode', 'durationDays', 'totalPosts', 'frequency', 'daysOfWeek', 'time', 'timezone', 'startDate', 'endDate', 'endCondition', 'durationSource', 'scheduleSource']) {
        if (explicitSchedule[field] !== undefined) conversation.knownFields[field] = explicitSchedule[field]
        else delete conversation.knownFields[field]
      }
      conversation.knownFields.durationSource = explicitSchedule.durationSource || 'unresolved'
      conversation.knownFields.scheduleSource = explicitSchedule.scheduleSource || 'unresolved'
      conversation.knownFields.approvalPreference = 'manual'
    }

    if (!conversation.knownFields.time) {
      const extractedTime = extractTimeFromText(prompt)
      if (extractedTime) conversation.knownFields.time = extractedTime
    }
    if (!conversation.knownFields.durationDays && !conversation.knownFields.duration_days) {
      const extractedDuration = extractDurationFromText(prompt)
      if (extractedDuration) conversation.knownFields.durationDays = extractedDuration
    }
    if (!conversation.knownFields.business) {
      const businessMatch = prompt.match(/my\s+business\s+(?:is|offers?)\s+([^,.!?]+)/i)
      if (businessMatch) conversation.knownFields.business = businessMatch[1].trim()
    }

    if (conversation.intent === 'unsupported') {
      conversation.conversationStage = 'unsupported'
      conversation.approvalRequired = false
      conversation.pendingConnections = []
      conversation.selectedCapabilities = []
      addMessage(conversation, 'alpha', parsed.unsupportedReason ? `I can't do that yet: ${parsed.unsupportedReason}${parsed.alternative ? ` You could try: ${parsed.alternative}` : ''}` : "I can't do that yet. Try a supported automation like generating social posts, sending an email, or summarizing your calendar.")
      return
    }

    const contradiction = detectContradiction(conversation.knownFields)
    if (contradiction.contradiction) {
      conversation.conversationStage = 'clarification'
      conversation.clarificationQuestion = contradiction.question
      addMessage(conversation, 'alpha', contradiction.question)
      return
    }

    const missing = requiredMissingFields(conversation.intent, conversation.knownFields)
    const known = conversation.knownFields
    conversation.missingFields = missing.filter(m => {
      const value = known[m.field]
      if (Array.isArray(value)) return value.length === 0
      if (typeof value === 'boolean') return false
      return value === undefined || value === null || String(value).trim() === ''
    })
    conversation.askedFields = conversation.askedFields || []

    if (conversation.missingFields.length > 0) {
      conversation.conversationStage = 'gathering_information'
      await askNextQuestion(conversation)
    } else {
      await moveToPlanningOrContent(conversation)
    }
  }

  function mapCapabilityToIntent(capabilityPlan, fallback) {
    if (capabilityPlan.actions?.some(a => a.connector === 'linkedin')) return 'social_content'
    if (capabilityPlan.actions?.some(a => a.connector === 'gmail' && a.action === 'save_attachments_to_drive')) return 'gmail_attachments_to_drive'
    if (capabilityPlan.actions?.some(a => a.connector === 'gmail' || a.connector === 'email')) return 'send_email'
    if (capabilityPlan.actions?.some(a => a.connector === 'telegram')) return 'telegram_message'
    if (capabilityPlan.actions?.some(a => a.connector === 'slack')) return 'slack_message'
    if (capabilityPlan.actions?.some(a => a.connector === 'whatsapp')) return 'whatsapp_message'
    if (capabilityPlan.actions?.some(a => a.connector === 'google_sheets')) return 'sheets_append'
    if (capabilityPlan.actions?.some(a => a.connector === 'google_calendar' || a.connector === 'calendar')) return 'calendar_summary'
    return fallback
  }

  function extractKnownFieldsFromCapability(capabilityPlan) {
    const known = {}
    if (capabilityPlan.schedule?.time) known.time = capabilityPlan.schedule.time
    if (capabilityPlan.schedule?.durationDays) known.durationDays = capabilityPlan.schedule.durationDays
    if (capabilityPlan.schedule?.frequency) known.frequency = capabilityPlan.schedule.frequency
    if (capabilityPlan.actions?.length) {
      const action = capabilityPlan.actions[0]
      if (action.params?.to) known.to = action.params.to
      if (action.params?.chatId || action.params?.chat_id) known.chat_id = action.params.chatId || action.params.chat_id
      if (action.params?.channel) known.channel = action.params.channel
      if (action.params?.message) known.message = action.params.message
      if (action.params?.topic) known.topic = action.params.topic
    }
    return known
  }

  function normalizeKnownFields(raw, prompt) {
    const known = { ...raw }
    if (known.postTime) known.time = known.postTime
    if (known.postingTime) known.time = known.postingTime
    if (known.scheduleTime && !known.time) known.time = known.scheduleTime
    if (known.businessName) known.business = known.businessName
    if (known.targetAudience) known.audience = known.targetAudience
    if (known.audienceSegment) known.audience = known.audienceSegment
    if (known.numberOfPosts) known.totalPosts = known.numberOfPosts
    if (known.postLimit) known.totalPosts = known.postLimit
    if (known.maxPosts) known.totalPosts = known.maxPosts
    if (!known.durationDays) {
      const durationSource = String(known.duration || known.frequency || known.postLimit || known.maxPosts || known.numberOfPosts || '')
      const parsed = extractDurationFromText(durationSource) || extractDurationFromText(String(known.postsPerDay || ''))
      if (parsed) known.durationDays = parsed
    }
    if (known.totalPosts && !known.durationDays) {
      const postsPerDay = Number(known.postsPerDay) || 1
      known.durationDays = Math.ceil(Number(known.totalPosts) / postsPerDay)
    }
    if (known.platforms) {
      known.platforms = Array.isArray(known.platforms) ? known.platforms.map(normalizePlatform).filter(Boolean) : [normalizePlatform(known.platforms)].filter(Boolean)
    }
    if (known.time && !known.scheduleTime) known.scheduleTime = known.time
    if (known.duration_days) known.durationDays = known.duration_days
    if (known.total_posts) known.totalPosts = known.total_posts
    if (known.approval_preference) known.approvalPreference = known.approval_preference
    if (known.posts_per_day) known.postsPerDay = known.posts_per_day
    if (known.dontPost && !Array.isArray(known.dontPost)) known.dontPost = String(known.dontPost).split(',').map(s => s.trim()).filter(Boolean)
    if (known.business) known.business = cleanBusiness(known.business)
    if (!known.durationSource) known.durationSource = 'unresolved'
    if (!known.scheduleSource) known.scheduleSource = 'unresolved'
    return known
  }

  async function askNextQuestion(conversation) {
    let remaining = (conversation.missingFields || []).filter(m => !conversation.askedFields.includes(m.field))
    if (remaining.length === 0) {
      const stillMissing = conversation.missingFields || []
      if (!stillMissing.length) {
        // Never recursively re-enter planning from an empty question queue.
        // Inconsistent persisted state previously caused generateContent ->
        // askNextQuestion -> moveToPlanningOrContent -> generateContent forever.
        const fallback = SOCIAL_CONTENT_INTENTS.has(conversation.intent)
          ? publishingModeQuestion()
          : {
              field: 'clarification',
              question: 'What result should Alpha produce, and when should it run?',
              reason: 'I need one clear execution detail before continuing.',
              required: true,
            }
        conversation.missingFields = [fallback]
        conversation.askedFields = (conversation.askedFields || []).filter(field => field !== fallback.field)
        remaining = [fallback]
      } else {
        // A previous answer did not produce a usable value. Ask the unresolved
        // field again instead of recursively re-entering generation.
        const unresolved = stillMissing[0]
        conversation.askedFields = (conversation.askedFields || []).filter(field => field !== unresolved.field)
        remaining = [unresolved]
      }
    }
    const next = remaining[0]
    conversation.askedFields.push(next.field)
    if (next.field === 'untilPausedConfirmation') {
      const credits = Math.max(0, Number(await getUserCredits({ id: conversation.userId, email: conversation.userEmail })) || 0)
      const platforms = Math.max(1, conversation.knownFields.platforms?.length || 1)
      const runsPerWeek = conversation.knownFields.frequency === 'daily' ? 7 : conversation.knownFields.frequency === 'weekdays' ? 5 : 1
      const weeklyCost = platforms * runsPerWeek
      const weeks = weeklyCost ? Math.floor(credits / weeklyCost) : 0
      conversation.lastQuestion = next.field
      addMessage(conversation, 'alpha', credits < 1
        ? 'You have 0 credits. An until-paused automation needs at least 1 credit to start. Buy credits first, or choose a fixed plan after topping up.'
        : `You said “until paused,” so this can keep running. You have ${credits} credits, which covers about ${weeks} week${weeks === 1 ? '' : 's'} at ${weeklyCost} credit${weeklyCost === 1 ? '' : 's'} per week. Choose: A) run until paused and auto-pause when credits finish (recommended), B) set a fixed number of weeks, or C) buy more credits first.`, { field: next.field, credits, weeklyCost, estimatedWeeks: weeks })
      return
    }

    // The workflow owns its questions. Models write the content but may not
    // rename scheduler fields or reinterpret a duration as another photo prompt.
    conversation.lastQuestion = next.field
    addMessage(conversation, 'alpha', next.question, { field: next.field })
  }

  async function handleAnswer(conversation, text) {
    if (conversation.conversationStage !== 'gathering_information') return

    const field = conversation.lastQuestion
    if (!field) {
      addMessage(conversation, 'alpha', "I'm not sure what you're answering. Could you rephrase?")
      return
    }

    const system = `${ALPHA_SYSTEM_IDENTITY}

The user just answered a question. Extract values for any fields mentioned in the answer, including corrections to previously known fields.
If the user corrects a previous value (e.g. "Not 8 AM, use 6 PM" or "stop after five"), return the corrected values.
If the answer is contradictory or unsupported, set contradiction: true and include a clarificationQuestion.
Return JSON:
{
  "extracted": { "FIELD_NAME": "value", "otherField": "value" },
  "contradiction": false,
  "clarificationQuestion": ""
}`
    const context = `Original request: "${conversation.originalRequest}"\nKnown fields: ${JSON.stringify(conversation.knownFields)}\nQuestion asked: "${conversation.messages.slice(-2)[0]?.text}"\nUser answer: "${text}"\nField to extract: "${field}"`

    let extracted = fallbackExtract(field, text, conversation.knownFields)
    let contradiction = false
    let clarification = ''
    try {
      const res = await callLLMForRole('fast', system, context, { jsonMode: true, maxTokens: 1000 })
      logModelCall(conversation, res, 'extract_answer')
      const llmExtracted = res.result?.extracted || {}
      if (llmExtracted[field] !== undefined && String(llmExtracted[field]).trim()) {
        extracted[field] = llmExtracted[field]
      } else {
        for (const [k, v] of Object.entries(llmExtracted)) {
          if (v !== undefined && v !== null && String(v).trim()) extracted[k] = v
        }
      }
      contradiction = res.result?.contradiction || false
      clarification = res.result?.clarificationQuestion || ''
    } catch (err) {
      // keep fallback extraction
    }

    if (field === 'time') {
      const t = parseTime(text)
      if (t) extracted.time = t.display
      else {
        const simple = extractTimeFromText(text)
        if (simple) extracted.time = simple
      }
    }
    if (field === 'publishingMode') {
      const lower = text.toLowerCase()
      const scheduledTime = parseTime(text) || extractTimeFromText(text)
      if (/\b(?:now|immediately|publish once now)\b/.test(lower)) extracted.publishingMode = 'once_now'
      else if (/\b(?:later|schedule once|schedule it)\b/.test(lower)) extracted.publishingMode = 'once_later'
      else if (/\b(?:recurring|repeat|campaign)\b/.test(lower)) extracted.publishingMode = 'recurring'
      else if (scheduledTime) {
        extracted.publishingMode = 'once_later'
        extracted.time = typeof scheduledTime === 'string' ? scheduledTime : scheduledTime.display
      }
      else delete extracted.publishingMode
      if (extracted.publishingMode) {
        extracted.scheduleSource = 'user_confirmed'
        if (extracted.publishingMode !== 'recurring') {
          extracted.frequency = 'once'
          extracted.totalPosts = 1
          extracted.durationDays = 1
          extracted.durationSource = 'user_confirmed'
        }
      }
    }
    const explicitModeCorrection = publishingModeFromPrompt(text)
    if (explicitModeCorrection) {
      extracted.publishingMode = explicitModeCorrection
      extracted.scheduleSource = 'user_confirmed'
      if (explicitModeCorrection !== 'recurring') {
        extracted.frequency = 'once'
        extracted.totalPosts = 1
        extracted.durationDays = 1
        extracted.durationSource = 'user_confirmed'
      }
      if (explicitModeCorrection === 'once_now') {
        for (const staleField of ['time', 'startDate', 'endDate', 'endCondition', 'daysOfWeek']) {
          delete extracted[staleField]
          delete conversation.knownFields[staleField]
        }
      }
      contradiction = false
      clarification = ''
    }
    if (/\b(?:photo|image|picture|visual)\b/i.test(text)) extracted.includeImages = true
    if (field === 'durationDays' || field === 'duration_days') {
      const d = extractDurationFromText(text)
      if (d) extracted[field] = d
    }
    if (field === 'platforms') {
      const platforms = String(text).split(/[,\s]+and[,\s]+|[,;]/).map(normalizePlatform).filter(Boolean)
      if (platforms.length) extracted.platforms = platforms
    }
    if (field === 'approvalPreference') {
      const lower = text.toLowerCase()
      extracted.approvalPreference = /\b(auto|automatic|publish|yes)\b/.test(lower) ? 'auto' : 'manual'
    }
    if (field === 'timezone') {
      extracted.timezone = /\bWAT\b/i.test(text) ? 'Africa/Lagos' : text.trim()
    }
    if (field === 'startDate') {
      const base = new Date()
      if (/\btomorrow\b/i.test(text)) base.setDate(base.getDate() + 1)
      extracted.startDate = /\b(?:now|today|tomorrow)\b/i.test(text) ? base.toISOString().split('T')[0] : text.trim()
    }
    if (field === 'endCondition') {
      const count = text.match(/\b(\d+)\s*(?:posts?|runs?)\b/i)
      const date = text.match(/\b(\d{4}-\d{2}-\d{2})\b/)
      const duration = extractDurationFromText(text)
      if (count) extracted.totalPosts = Number(count[1])
      if (date) extracted.endDate = date[1]
      if (duration) extracted.durationDays = duration
      if (duration || count || date || /\buntil\s+paused\b/i.test(text)) extracted.durationSource = 'user_confirmed'
      extracted.endCondition = text.trim()
    }
    if (field === 'publishingMode') {
      contradiction = false
      clarification = ''
    }
    if (field === 'untilPausedConfirmation') {
      const choice = text.trim().toLowerCase()
      if (/^(?:a|option a)\b|auto.?pause|run until paused/.test(choice)) {
        const credits = Math.max(0, Number(await getUserCredits({ id: conversation.userId, email: conversation.userEmail })) || 0)
        if (credits < 1) {
          addMessage(conversation, 'alpha', 'You need at least 1 credit before an until-paused automation can start. Buy credits first; nothing has been created or charged.')
          return
        }
        const platformCount = Math.max(1, conversation.knownFields.platforms?.length || 1)
        const runsPerWeek = conversation.knownFields.frequency === 'daily' ? 7 : conversation.knownFields.frequency === 'weekdays' ? 5 : 1
        const totalRuns = Math.max(1, Math.floor(credits / platformCount))
        extracted.untilPausedConfirmed = true
        extracted.autoPauseOnCreditExhaustion = true
        extracted.endCondition = 'until_paused'
        extracted.totalPosts = totalRuns
        extracted.durationDays = Math.max(7, Math.ceil(totalRuns / runsPerWeek) * 7)
        extracted.durationSource = 'credit_bounded_until_paused'
      } else if (/^(?:b|option b)\b|fixed|weeks?/.test(choice)) {
        const weeks = Number(choice.match(/\b(\d+)\b/)?.[1] || 0)
        if (!weeks) {
          addMessage(conversation, 'alpha', 'How many weeks should the fixed schedule run?')
          return
        }
        extracted.untilPausedConfirmed = true
        extracted.endCondition = 'fixed_duration'
        extracted.durationDays = weeks * 7
        extracted.durationSource = 'user_confirmed'
      } else {
        addMessage(conversation, 'alpha', 'No automation has been created. Top up your credits, then choose A to run with automatic low-credit pausing or B for a fixed duration.')
        return
      }
    }

    if (clarification) {
      addMessage(conversation, 'alpha', clarification)
      return
    }

    if (contradiction) {
      addMessage(conversation, 'alpha', "Got it. I'll update that.")
    }

    if (field === 'publishingMode' && !['once_now', 'once_later', 'recurring'].includes(extracted.publishingMode)) {
      conversation.askedFields = (conversation.askedFields || []).filter(item => item !== field)
      conversation.lastQuestion = field
      addMessage(conversation, 'alpha', 'One-time is understood. Should I publish it now, or on a date and time you choose?', { field })
      return
    }

    Object.entries(extracted).forEach(([key, value]) => {
      if (value === undefined || value === null || String(value).trim() === '') return
      conversation.knownFields[key] = value
    })
    if (['time', 'timezone', 'startDate', 'frequency'].includes(field)) conversation.knownFields.scheduleSource = 'user_confirmed'

    conversation.knownFields = normalizeKnownFields(conversation.knownFields, text)

    conversation.missingFields = requiredMissingFields(conversation.intent, conversation.knownFields).filter(m => {
      const value = conversation.knownFields[m.field]
      if (Array.isArray(value)) return value.length === 0
      if (typeof value === 'boolean') return false
      return value === undefined || value === null || String(value).trim() === ''
    })

    if (conversation.missingFields.length > 0) {
      await askNextQuestion(conversation)
    } else {
      await moveToPlanningOrContent(conversation)
    }
  }

  function fallbackExtract(field, text, knownFields) {
    const lower = text.toLowerCase()
    const extracted = {}
    if (field === 'time') {
      const t = parseTime(text)
      if (t) extracted.time = t.display
    } else if (field === 'durationDays' || field === 'duration_days') {
      const d = extractDurationFromText(text)
      if (d) extracted[field] = d
    } else if (field === 'platforms') {
      extracted.platforms = String(text).split(/[,\s]+and[,\s]+|[,;]/).map(normalizePlatform).filter(Boolean)
    } else if (field === 'approvalPreference') {
      extracted.approvalPreference = /\b(auto|automatic|publish|yes)\b/.test(lower) ? 'auto' : 'manual'
    } else if (field === 'timezone') {
      extracted.timezone = /\bWAT\b/i.test(text) ? 'Africa/Lagos' : text.trim()
    } else if (field === 'startDate') {
      const date = new Date()
      if (/\btomorrow\b/i.test(text)) date.setDate(date.getDate() + 1)
      extracted.startDate = /\b(?:now|today|tomorrow)\b/i.test(text) ? date.toISOString().split('T')[0] : text.trim()
    } else if (field === 'endCondition') {
      const count = text.match(/\b(\d+)\s*(?:posts?|runs?)\b/i)
      const date = text.match(/\b(\d{4}-\d{2}-\d{2})\b/)
      if (count) extracted.totalPosts = Number(count[1])
      if (date) extracted.endDate = date[1]
      extracted.endCondition = text.trim()
    } else if (field === 'untilPausedConfirmation') {
      if (/^(?:a|option a)\b|auto.?pause|run until paused/.test(lower)) {
        extracted.untilPausedConfirmed = true
        extracted.autoPauseOnCreditExhaustion = true
        extracted.endCondition = 'until_paused'
      }
    } else {
      extracted[field] = text.trim()
    }
    return extracted
  }

  async function moveToPlanningOrContent(conversation) {
    if (SOCIAL_CONTENT_INTENTS.has(conversation.intent)) {
      conversation.conversationStage = 'generating_content'
      await generateContent(conversation)
      return
    }

    conversation.conversationStage = 'planning'
    const draft = await buildAutomationDraft(conversation)
    if (draft.status === 'awaiting_information' || !Array.isArray(draft.actions) || draft.actions.length === 0) {
      conversation.automationDraft = null
      conversation.requiredIntegrations = []
      conversation.approvalRequired = false
      conversation.conversationStage = 'unsupported'
      addMessage(conversation, 'alpha', "I can't create a reliable automation for that request yet. Try a supported LinkedIn publishing automation, or describe a different outcome.")
      return
    }
    conversation.automationDraft = draft
    conversation.requiredIntegrations = draft.integrations || []
    conversation.conversationStage = 'awaiting_approval'
    addMessage(conversation, 'alpha', `I've planned the automation: **${draft.name}**. It will ${draft.description}. Estimated cost: ${draft.creditsNeeded || 1} credit per run. Review it and approve when ready.`)
  }

  function logModelCall(conversation, res, stage) {
    conversation.aiCalls = conversation.aiCalls || []
    conversation.aiCalls.push({
      stage,
      provider: res.provider || '',
      model: res.model || '',
      role: res.role || '',
      generationMode: res.generationMode || 'model',
      latencyMs: res.latencyMs || 0,
      usage: res.usage || {},
      at: nowIso(),
    })
    conversation.generationMode = res.generationMode || 'model'
  }

  function validateCalendar(calendar, expectedPlatforms, expectedTotal, separatePlatformPosts = false) {
    if (!Array.isArray(calendar) || calendar.length < expectedTotal) return false
    const seenPlatforms = new Set()
    const validPosts = calendar.every(p => {
      const caps = p.captions || {}
      const captionEntries = typeof caps === 'object' ? Object.entries(caps) : []
      const quality = captionEntries.length > 0 && captionEntries.every(([platform, value]) => {
        const text = typeof value === 'string' ? value.trim() : ''
        const words = text.split(/\s+/).filter(Boolean).length
        const normalized = normalizePlatform(platform)
        if (normalized === 'linkedin') return words >= 1
        if (normalized === 'whatsapp') return words >= 100
        if (normalized === 'youtube') return words >= 300
        return words >= 40
      })
      const postPlatforms = Array.isArray(p.platforms) ? p.platforms.map(normalizePlatform).filter(Boolean) : []
      postPlatforms.forEach(platform => seenPlatforms.add(platform))
      const expected = separatePlatformPosts
        ? postPlatforms.length === 1 && captionEntries.some(([key]) => normalizePlatform(key) === postPlatforms[0])
        : expectedPlatforms.every(platform => captionEntries.some(([key]) => normalizePlatform(key) === normalizePlatform(platform)))
      return Number.isInteger(p.day) && p.day > 0 && Array.isArray(p.platforms) && p.platforms.length > 0 && quality && expected
    })
    return validPosts && expectedPlatforms.every(platform => seenPlatforms.has(normalizePlatform(platform)))
  }

  async function generateContent(conversation) {
    const known = conversation.knownFields || {}
    const publishingMode = known.publishingMode
    if (!['once_now', 'once_later', 'recurring'].includes(publishingMode) || known.scheduleSource === 'unresolved') {
      conversation.conversationStage = 'gathering_information'
      conversation.missingFields = contentGenerationMissingFields(conversation.intent, known)
      conversation.askedFields = (conversation.askedFields || []).filter(field => field !== 'publishingMode')
      await askNextQuestion(conversation)
      return
    }
    const isSinglePost = publishingMode === 'once_now' || publishingMode === 'once_later'
    const platforms = Array.isArray(known.platforms) ? known.platforms.filter(Boolean) : []
    if (!platforms.length) {
      conversation.conversationStage = 'gathering_information'
      conversation.missingFields = contentGenerationMissingFields(conversation.intent, known)
      await askNextQuestion(conversation)
      return
    }
    const businessName = known.business || known.businessName || ''
    const businessType = known.businessType || known.description || known.business || 'your business'
    const audience = known.audience || 'your audience'
    const tone = known.tone || 'friendly and professional'
    const time = known.time || ''
    const durationDays = isSinglePost ? 1 : Number(known.durationDays || known.duration_days || 0)
    let totalPosts = isSinglePost ? 1 : Number(known.totalPosts || known.total_posts || 0)
    if (!totalPosts && durationDays > 0) {
      const days = Array.isArray(known.daysOfWeek) ? known.daysOfWeek.length : 0
      if (known.frequency === 'weekly') totalPosts = Math.max(1, Math.ceil(durationDays / 7) * Math.max(1, days))
      else if (known.frequency === 'weekdays') totalPosts = Math.max(1, Math.floor(durationDays / 7) * 5 + Math.min(durationDays % 7, 5))
      else totalPosts = durationDays
    }
    if (!durationDays || !totalPosts || (!isSinglePost && (known.durationSource === 'unresolved' || !known.frequency || !known.time || !known.timezone || !known.startDate))) {
      conversation.conversationStage = 'gathering_information'
      conversation.missingFields = contentGenerationMissingFields(conversation.intent, known)
      await askNextQuestion(conversation)
      return
    }
    const platformTimes = known.platformTimes && typeof known.platformTimes === 'object' ? known.platformTimes : {}
    const separatePlatformPosts = platforms.length > 1 &&
      Object.keys(platformTimes).length >= platforms.length &&
      totalPosts >= durationDays * platforms.length
    const postsPerDay = Math.max(1, Math.ceil(totalPosts / durationDays))
    const dontPost = Array.isArray(known.dontPost) ? known.dontPost : []
    const automaticImagePlatforms = platforms.some(platform => ['linkedin'].includes(platform))
    const imageRequested = Boolean(known.includeImages || known.include_images || automaticImagePlatforms)
    const includeImages = imageRequested && (typeof getSmartImage === 'function' || listImageProviders().length > 0)

    const business = businessName || businessType
    const brand = { business, businessType, audience, tone, website: known.website || '', dontPost }
    const startDate = known.startDate || (isSinglePost ? new Date().toISOString().split('T')[0] : '')
    const endDate = known.endDate || (durationDays ? addDays(new Date(startDate), durationDays) : '')
    const timezone = known.timezone === 'WAT' ? 'Africa/Lagos' : (known.timezone || '')
    const baseHour = parseTime(time)?.hour ?? 0
    const scheduleSlots = []
    for (let i = 0; i < postsPerDay; i++) {
      const platform = platforms[i % platforms.length]
      const platformTime = parseTime(platformTimes[platform])
      const hour = platformTime?.hour ?? ((baseHour + i) % 24)
      const minute = platformTime?.minute ?? 0
      scheduleSlots.push({ label: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`, hour, minute, platform })
    }

    const meta = {
      platforms,
      slots: scheduleSlots,
      durationDays,
      postsPerDay,
      totalPosts,
      startDate,
      endDate,
      includeImages,
      imageRequested,
      timezone,
      frequency: known.frequency || (isSinglePost ? 'once' : 'daily'),
      daysOfWeek: known.daysOfWeek || [],
      frequencyText: isSinglePost ? 'One time' : `${known.frequency || 'daily'} for ${totalPosts} post(s)`,
      publishingMode,
      durationSource: known.durationSource,
      scheduleSource: known.scheduleSource,
      platformTimes,
      separatePlatformPosts,
    }
    const hookExamples = selectHookExamples(String(known.mission || known.outcome || business), 3)

    const system = `You are Alpha, a creative social media copywriter.
Generate original, engaging posts for the following brand and campaign.
Brand name: "${brand.business || businessType}".
Business type: ${businessType}.
Audience: ${audience}.
Original request: ${conversation.originalRequest}
Useful hook directions (adapt them; never invent claims):
${hookExamples.map(item => `- ${item.type}: ${item.text}`).join('\n')}
Stay focused on this product/service and audience. Do not replace the brand with AlphaTekx or drift into unrelated topics.
Each post should be unique, sound natural, and match the platform's style.
${separatePlatformPosts ? `Create exactly one calendar entry per platform per day (${platforms.length} entries each day). Each entry must contain only that platform in "platforms" and only that platform's caption. Use these platform times: ${JSON.stringify(platformTimes)}.` : 'Each calendar entry must include an adapted caption for every selected platform.'}
Return strict JSON with shape:
{
  "calendar": [
    {
      "day": 1,
      "slot": "morning",
      "scheduledAt": "ISO-8601",
      "platforms": ["linkedin"],
      "topic": "short topic label",
      "postType": "educational|product|story|cta",
      "captions": { "linkedin": "post text" }
    }
  ]
}

Mix: 40% educational, 30% product, 20% story, 10% CTA.
Include a CTA in ~70% of posts.
Avoid repeating the same opening sentence across posts.
Do not invent customer names, testimonials, or facts you cannot verify.
Platform minimum quality:
- Facebook: at least 200 words; conversational hook, useful story, three lessons, a closing question, and 3-5 relevant hashtags.
- LinkedIn: at least 180 words; professional hook, concrete value, clear CTA, and 3-5 relevant hashtags.
- X: 180-280 characters with hook, value, CTA, and 1-2 hashtags. If the idea needs more space, return a concise 2-3 part thread separated with new lines.
- Instagram: at least 150 words; hook, short story, three useful bullets, CTA question, and 10-15 relevant hashtags.
- WhatsApp: at least 100 words, friendly and useful, with a clear next step.
- YouTube: title 50-70 characters and a description of at least 300 words with searchable keywords and a CTA.

Avoid: ${dontPost.join(', ') || 'nothing specific'}.
Total posts: ${totalPosts}.`

    const strictSystem = `${system}\n\nCRITICAL: Return only the JSON object. Every post must have a unique opening line and a different call to action. Do not return markdown code fences.`

    let posts = []
    let generationMode = 'fallback'
    let lastError = null
    let providerLog = null
    const fallbackDays = new Set()

    async function generateCalendarRequest(requestSystem, requestMeta, expectedCount, stage) {
      const estimatedTokens = expectedCount === 1 ? 700 : Math.max(1800, Math.min(9000, expectedCount * 500 + 600))
      const res = await callLLMForRole('content', requestSystem, JSON.stringify({ brand, meta: requestMeta }), { jsonMode: true, maxTokens: estimatedTokens })
      logModelCall(conversation, res, stage)
      providerLog = { provider: res.provider, model: res.model, usage: res.usage, latencyMs: res.latencyMs }
      return res.result?.calendar
    }

    async function generateCampaignDay(day) {
      const daySystem = `${system}

CAMPAIGN BATCH: Generate ONLY day ${day} of ${durationDays}.
Return exactly ${platforms.length} entries for day ${day}: one entry for each of ${platforms.join(', ')}.
Do not generate any other campaign day. Every entry's "day" must be ${day}.`
      const dayMeta = { ...meta, campaignDay: day, durationDays: 1, totalPosts: platforms.length, postsPerDay: platforms.length }
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const requestSystem = attempt === 0 ? daySystem : `${daySystem}\n\nCRITICAL: Return only valid JSON. Meet every platform minimum and include every requested platform exactly once.`
          const calendar = await generateCalendarRequest(requestSystem, dayMeta, platforms.length, `generate_content_day_${day}${attempt ? '_retry' : ''}`)
          if (!validateCalendar(calendar, platforms, platforms.length, true)) throw new Error(`Model returned invalid or incomplete content for campaign day ${day}`)
          return calendar.slice(0, platforms.length).map(post => ({ ...post, day }))
        } catch (error) {
          lastError = error
          console.error(`[conversationEngine] campaign day ${day} attempt ${attempt + 1} failed:`, error)
        }
      }

      // A provider outage must not discard a complete campaign request. The
      // deterministic copy is deliberately held to the same quality validator.
      fallbackDays.add(day)
      const fallback = generateFallbackPosts(
        platforms,
        business,
        audience,
        tone,
        durationDays,
        platforms.length,
        scheduleSlots,
        startDate,
        timezone,
        includeImages,
        true,
      )
      return fallback.filter(post => post.day === day)
    }

    async function tryGenerate(strict = false) {
      if (separatePlatformPosts && durationDays > 1 && totalPosts > platforms.length) {
        const calendar = []
        // Keep provider pressure bounded while avoiding a long serial wait for
        // campaigns such as seven days across four platforms.
        for (let day = 1; day <= durationDays; day += 2) {
          const batchDays = [day, day + 1].filter(value => value <= durationDays)
          const batch = await Promise.all(batchDays.map(generateCampaignDay))
          batch.forEach(postsForDay => calendar.push(...postsForDay))
        }
        if (!validateCalendar(calendar, platforms, totalPosts, true)) throw new Error('Campaign batches did not produce a complete calendar')
        const modelCalendar = fallbackDays.size ? calendar.filter(post => !fallbackDays.has(Number(post.day))) : calendar
        const duplicate = calendarHasDuplicates(modelCalendar, conversation.automationDraft?.contentMemory || [])
        if (duplicate.duplicate) throw new Error(`Generated calendar repeated prior content (${duplicate.reason})`)
        return calendar
      }
      const estimatedTokens = totalPosts === 1 ? 700 : Math.max(1800, Math.min(9000, totalPosts * 300 + 600))
      const res = await callLLMForRole('content', strict ? strictSystem : system, JSON.stringify({ brand, meta }), { jsonMode: true, maxTokens: estimatedTokens })
      logModelCall(conversation, res, 'generate_content')
      providerLog = { provider: res.provider, model: res.model, usage: res.usage, latencyMs: res.latencyMs }
      if (validateCalendar(res.result?.calendar, platforms, totalPosts, separatePlatformPosts)) {
        const duplicate = calendarHasDuplicates(res.result.calendar, conversation.automationDraft?.contentMemory || [])
        if (duplicate.duplicate) throw new Error(`Generated calendar repeated prior content (${duplicate.reason})`)
        return res.result.calendar
      }
      throw new Error('Model returned invalid or incomplete calendar')
    }

    try {
      const calendar = await tryGenerate(false)
      posts = normalizeCalendar(calendar, platforms, scheduleSlots, startDate, timezone, postsPerDay, includeImages, meta)
      generationMode = fallbackDays.size ? 'fallback' : 'model'
    } catch (err) {
      lastError = err
      console.error('[conversationEngine] generateContent first attempt failed:', err)
      try {
        const calendar = await tryGenerate(true)
        posts = normalizeCalendar(calendar, platforms, scheduleSlots, startDate, timezone, postsPerDay, includeImages, meta)
        generationMode = fallbackDays.size ? 'fallback' : 'model'
      } catch (err2) {
        lastError = err2
        console.error('[conversationEngine] generateContent retry failed:', err2)
      }
    }

    if (!posts.length) {
      const linkedinOnly = platforms.length === 1 && platforms[0] === 'linkedin'
      const fallbackEnabled = !linkedinOnly && process.env.ALPHA_ENABLE_DETERMINISTIC_FALLBACK !== 'false'
      if (fallbackEnabled) {
        generationMode = 'fallback'
        posts = generateFallbackPosts(platforms, business, audience, tone, durationDays, postsPerDay, scheduleSlots, startDate, timezone, includeImages, separatePlatformPosts)
      } else {
        conversation.conversationStage = 'blocked'
        addMessage(conversation, 'alpha', 'Alpha’s content-generation models are temporarily unavailable. Your automation details have been saved, so you can continue without starting again.')
        return
      }
    }
    if (!validateCalendar(posts, platforms, totalPosts, separatePlatformPosts)) {
      conversation.conversationStage = 'blocked'
      addMessage(conversation, 'alpha', 'Alpha refused to schedule low-quality or incomplete content. Your plan is saved, nothing was published, and no credits were charged. Please regenerate when the content provider is available.')
      return
    }

    if (includeImages && typeof getSmartImage === 'function') {
      try {
        const imageGroups = separatePlatformPosts
          ? Array.from(new Set(posts.map(post => post.day))).map(day => ({ day, posts: posts.filter(post => post.day === day) }))
          : posts.map((post, index) => ({ day: index, posts: [post] }))
        for (let index = 0; index < imageGroups.length; index += 3) {
          const batch = imageGroups.slice(index, index + 3)
          const images = await Promise.all(batch.map(group => {
            const content = group.posts.map(post => [post.topic, ...Object.values(post.captions || {})].filter(Boolean).join('\n')).join('\n')
            return getSmartImage(
              { id: conversation.userId, email: conversation.userEmail },
              content,
              String(known.mission || known.outcome || conversation.currentGoal || conversation.originalRequest),
              String(group.posts[0]?.platforms?.[0] || platforms[0] || ''),
            )
          }))
          images.forEach((image, offset) => {
            if (!image?.image_url || !image?.image_storage_path) throw new Error('Image provider did not return a durable verified image.')
            batch[offset].posts.forEach(post => {
              post.imageUrl = image.image_url
              post.imageStoragePath = image.image_storage_path
              post.imagePrompt = image.image_prompt
              post.imageKeywords = image.image_keywords
              post.imageSource = image.image_source
            })
          })
        }
        if (posts.some(post => !post.imageUrl || !post.imageStoragePath)) throw new Error('At least one post is missing its durable matched image.')
      } catch (error) {
        conversation.conversationStage = 'blocked'
        addMessage(conversation, 'alpha', `Alpha prepared the content but could not attach a confirmed image, so nothing was scheduled and no credits were charged. ${error instanceof Error ? error.message : 'Please retry.'}`)
        return
      }
    }

    const totalCredits = generationMode === 'model' ? posts.reduce((s, p) => s + p.credits, 0) : 0

    conversation.generatedContent = posts.map(p => ({ ...p, approved: false, edited: false }))
    conversation.conversationStage = 'awaiting_content_review'
    conversation.approvalRequired = true
    conversation.generationMode = generationMode
    conversation.lastModelError = lastError && lastError.message ? lastError.message.slice(0, 200) : ''
    conversation.providerLog = providerLog

    const mission = String(known.mission || known.outcome || conversation.currentGoal || conversation.originalRequest)
    const contentPillars = Array.isArray(known.contentPillars) && known.contentPillars.length
      ? known.contentPillars
      : ['Education', 'Practical examples', 'Lessons and insights', 'Questions and discussion']
    const strategy = {
      summary: `Build consistent recognition with useful ${platforms.map(p => PLATFORM_NAMES[p] || p).join(' and ')} content for ${audience}.`,
      contentPillars,
      calendar: contentPillars.slice(0, 6).map((theme, index) => ({ week: index + 1, theme })),
    }
    const campaignName = isSinglePost
      ? `${platforms.map(p => PLATFORM_NAMES[p] || p).join(' + ')} post`
      : `${platforms.map(p => PLATFORM_NAMES[p] || p).join(' + ')} recurring content - ${totalPosts} posts`
    conversation.automationDraft = {
      id: automationIdFor(conversation),
      type: 'campaign',
      userId: conversation.userId,
      userEmail: conversation.userEmail,
      name: campaignName,
      description: `Generate and schedule ${totalPosts} posts for ${platforms.map(p => PLATFORM_NAMES[p] || p).join(', ')} for ${business}.`,
      originalRequest: conversation.originalRequest,
      interpretedGoal: conversation.currentGoal,
      mission,
      strategy,
      targetAudience: audience,
      tone,
      brandProfile: brand,
      knowledge: { business, businessType, website: known.website || '', approvedClaims: known.approvedClaims || [], prohibitedClaims: dontPost },
      contentMemory: [],
      approvalPolicy: 'explicit',
      trigger: { type: 'campaign', cron: 'campaign', nextRun: posts[0]?.scheduledAt },
      actions: [],
      status: 'awaiting_approval',
      approved: false,
      createdAt: conversation.createdAt,
      updatedAt: nowIso(),
      executionHistory: [],
      successRate: 0,
      permissions: platforms,
      creditsNeeded: totalCredits,
      creditsPerRun: 0,
      endCondition: known.endCondition === 'until_paused'
        ? { type: 'until_paused', autoPauseOnCreditExhaustion: true }
        : { type: known.endDate ? 'until_date' : 'num_executions', value: known.endDate || totalPosts, autoPauseOnCreditExhaustion: true },
      expectedExecutions: known.endCondition === 'until_paused' ? 'until paused (auto-pause when credits finish)' : totalPosts,
      estimatedCreditsFirstMonth: Math.min(totalCredits, Number(known.monthlyCreditEstimate || totalCredits)),
      executionsDone: 0,
      executionsTotal: totalPosts,
      generationMode,
      campaign: {
        name: campaignName,
        description: conversation.originalRequest,
        brand,
        meta,
        posts,
        totalCredits,
        status: 'pending_approval',
        charged: false,
        approved: false,
        autoPublish: false,
        generationMode,
        contentMemory: [],
      },
    }

    conversation.pendingConnections = []
    conversation.selectedCapabilities = platforms.map(p => `generate_${p}_content`)

    const status = await checkPublishingCapabilities(platforms, conversation.userId, conversation.userEmail)
    if (!status.allReady) {
      conversation.automationDraft.missing = [{ field: 'connection', step: 'Publishing', connector: status.missing.join(', '), reason: `I can generate the posts, but direct publishing to ${status.missing.join(', ')} is not available. You can copy the posts manually or connect the app later.` }]
    }

    const platformList = platforms.map(p => PLATFORM_NAMES[p] || p).join(', ')
    const currentCredits = Math.max(0, Number(await getUserCredits({ id: conversation.userId, email: conversation.userEmail })) || 0)
    const creditSummary = `Cost: ${totalCredits} credit${totalCredits === 1 ? '' : 's'}. Current balance: ${currentCredits}. Balance after every selected platform confirms: ${Math.max(0, currentCredits - totalCredits)}. Failed or unconfirmed posts are not charged.`
    if (generationMode === 'model') {
      addMessage(conversation, 'alpha', status.allReady
        ? `I generated ${posts.length} original post${posts.length === 1 ? '' : 's'} for ${platformList}. ${creditSummary} Review the final text and matched image, then explicitly approve it.`
        : `I generated ${posts.length} original post${posts.length === 1 ? '' : 's'} for ${platformList}. ${creditSummary} Review it now, then connect ${status.missing.join(', ')} before approval.`, { generatedCount: posts.length, totalCredits, currentCredits })
    } else {
      addMessage(conversation, 'alpha', `Alpha’s content-generation models are temporarily unavailable. Your automation details have been saved, so you can continue without starting again. I've prepared ${posts.length} starter posts you can edit, regenerate, or approve once the models are back.`, { generatedCount: posts.length, totalCredits })
    }
    if (imageRequested && !includeImages) addMessage(conversation, 'alpha', 'Image generation is not configured yet, so this plan will continue with text only and no image credits will be charged.')
  }

  function normalizeCalendar(calendar, platforms, scheduleSlots, startDate, timezone, postsPerDay, includeImages, meta = {}) {
    return calendar.map((p, i) => {
      const postPlatforms = Array.isArray(p.platforms) && p.platforms.length ? p.platforms.map(normalizePlatform).filter(Boolean) : platforms
      const day = Number(p.day) || Math.floor(i / postsPerDay) + 1
      const slot = scheduleSlots[(i % postsPerDay) % scheduleSlots.length] || scheduleSlots[0] || { label: '08:00', hour: 8, minute: 0 }
      const captions = {}
      for (const platform of postPlatforms) {
        const text = p.captions?.[platform] || p.captions?.[Object.keys(p.captions || {})[0]] || ''
        if (typeof text === 'string' && text.trim()) captions[platform] = text.trim()
      }
      const scheduledAt = meta.publishingMode === 'once_now'
        ? nowIso()
        : platforms.length === 1 && platforms[0] === 'linkedin'
        ? scheduleOccurrence(i, startDate, p.slot ? { label: p.slot, hour: parseTime(p.slot)?.hour || slot.hour, minute: parseTime(p.slot)?.minute || slot.minute } : slot, meta.frequency, meta.daysOfWeek, timezone)
        : meta.separatePlatformPosts
          ? scheduleDate(day, slot, startDate, timezone)
          : (p.scheduledAt || scheduleDate(day, p.slot ? { label: p.slot, hour: parseTime(p.slot)?.hour || slot.hour, minute: parseTime(p.slot)?.minute || slot.minute } : slot, startDate, timezone))
      const baseCredits = computePostCredits(postPlatforms, includeImages)
      return {
        id: p.id || randomUUID(),
        day,
        slot: p.slot || slot.label,
        scheduledAt,
        platforms: postPlatforms,
        topic: p.topic || '',
        postType: ['educational', 'product', 'story', 'cta'].includes(p.postType) ? p.postType : 'educational',
        captions,
        baseCredits,
        credits: scheduledCreditCost(baseCredits, scheduledAt),
        status: 'pending_approval',
        result: {},
      }
    }).slice(0, calendar.length)
  }

  function generateFallbackPosts(platforms, business, audience, tone, durationDays, postsPerDay, scheduleSlots, startDate, timezone, includeImages, separatePlatformPosts = false) {
    const posts = []
    for (let day = 1; day <= durationDays; day++) {
      for (let i = 0; i < postsPerDay; i++) {
        const slot = scheduleSlots[i % scheduleSlots.length]
        const types = ['educational', 'product', 'story', 'cta']
        const postType = types[(day + i) % types.length]
        const captions = {}
        const postPlatforms = separatePlatformPosts ? [platforms[i % platforms.length]] : platforms
        for (const platform of postPlatforms) {
          captions[platform] = generateFallbackCaption(platform, business, audience, tone, postType, day)
        }
        posts.push({
          id: randomUUID(),
          day,
          slot: slot.label,
          scheduledAt: scheduleDate(day, slot, startDate, timezone),
          platforms: postPlatforms,
          topic: `${postType} post`,
          postType,
          captions,
          credits: 0,
          status: 'pending_approval',
          result: {},
        })
      }
    }
    return posts
  }

  function scheduleDate(day, slot, startDate, timezone) {
    const [year, month, dayOfMonth] = startDate.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, dayOfMonth + day - 1))
    return zonedTimeToUtc(date, slot.hour, slot.minute, timezone)
  }

  function zonedTimeToUtc(date, hour, minute, timezone) {
    const desired = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, minute, 0)
    if (!timezone || timezone === 'UTC') return new Date(desired).toISOString()
    let candidate = desired
    try {
      for (let i = 0; i < 3; i++) {
        const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(candidate))
        const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
        const represented = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), 0)
        candidate += desired - represented
      }
    } catch { return new Date(desired).toISOString() }
    return new Date(candidate).toISOString()
  }

  function scheduleOccurrence(index, startDate, slot, frequency = 'once', daysOfWeek = [], timezone = 'UTC') {
    const [year, month, day] = startDate.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    const targetDays = daysOfWeek.map(name => ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(String(name).toLowerCase())).filter(value => value >= 0)
    if (frequency === 'monthly') date.setUTCMonth(date.getUTCMonth() + index)
    else if (frequency === 'weekly' && targetDays.length) {
      let found = -1
      while (found < index) {
        if (targetDays.includes(date.getUTCDay())) found += 1
        if (found < index) date.setUTCDate(date.getUTCDate() + 1)
      }
    } else if (frequency === 'weekdays') {
      let found = -1
      while (found < index) {
        if (date.getUTCDay() >= 1 && date.getUTCDay() <= 5) found += 1
        if (found < index) date.setUTCDate(date.getUTCDate() + 1)
      }
    } else date.setUTCDate(date.getUTCDate() + index)
    return zonedTimeToUtc(date, slot.hour, slot.minute, timezone)
  }

  function generateFallbackCaption(platform, business, audience, tone, postType, day) {
    const safeBusiness = String(business || 'this business').trim()
    const safeAudience = String(audience || 'growing teams').trim()
    const tag = safeBusiness.replace(/[^a-z0-9]/gi, '') || 'Business'
    const theme = {
      educational: 'a practical lesson that makes everyday work simpler',
      product: 'how the product turns a difficult task into a clear next step',
      story: 'why the team chose to solve this problem in the first place',
      cta: 'the next step for people who are ready to move from ideas to results',
    }[postType] || 'a practical way to get a better result'
    const opening = [
      `Day ${day}: Better results begin with a clearer system.`,
      `Day ${day}: A good idea becomes valuable when people can act on it.`,
      `Day ${day}: Consistency is easier when the right work happens at the right time.`,
      `Day ${day}: Growth should not depend on repeating the same manual task forever.`,
      `Day ${day}: The strongest tools make complex work feel surprisingly simple.`,
      `Day ${day}: Small teams deserve systems that help them operate with confidence.`,
      `Day ${day}: This is what practical automation should feel like.`,
    ][(day - 1) % 7]
    const platformOpening = `${opening.replace(/\.$/, '')} — ${PLATFORM_NAMES[normalizePlatform(platform)] || platform}.`
    const core = `${platformOpening}

Today we are focusing on ${theme}. ${safeBusiness} is designed for ${safeAudience}: people who want to spend less time managing repetitive steps and more time creating, serving customers, and growing with confidence.

Here are three useful principles to take away:

1. Start with the result you want, not a complicated list of tools.
2. Review the work before it goes live, so you stay in control.
3. Measure confirmed outcomes instead of relying on vague promises.

That approach matters because dependable work is not about doing more activity. It is about creating a repeatable process, checking the result, and improving what happens next. The tone should feel ${tone}, but the promise remains simple: useful work, clear approval, and an honest result.

If this sounds like the way your team wants to work, explore ${safeBusiness}, share the task you want to simplify, and see what a clearer workflow could unlock. What is the first repetitive task you would remove from your week?`
    return core
    if (platform === 'linkedin') {
      return `${core}

For founders and operators, the strategic advantage is not merely speed. It is the ability to build a consistent operating rhythm without losing judgment, brand standards, or accountability. A well-designed system should make ownership visible and success measurable.

#${tag} #Automation #FutureOfWork #BusinessGrowth`
    }
    return `${core}

Reply with the task you want to improve and the outcome you want to see. #${tag} #Automation`
  }

  async function checkPublishingCapabilities(platforms, userId, userEmail) {
    const missing = []
    for (const p of platforms) {
      const status = await getIntegrationStatus(userId, p, userEmail)
      if (!status?.ready) missing.push(p)
    }
    return { allReady: missing.length === 0, missing }
  }

  async function buildAutomationDraft(conversation) {
    const known = conversation.knownFields || {}
    const capabilityPlan = buildCapabilityPlan(conversation.originalRequest, { email: conversation.userEmail })
    if (capabilityPlan && !capabilityPlan.unsupported) {
      return finalizeAgentFromCapability(conversation, capabilityPlan)
    }

    const system = `${ALPHA_SYSTEM_IDENTITY}

Turn the user's goal into an automation plan. Return JSON:
{
  "name": "short title",
  "description": "one sentence",
  "trigger": { "type": "schedule", "cron": "..." },
  "actions": [{ "connector": "gmail", "action": "send_email", "label": "Send email", "params": {} }],
  "creditsNeeded": 3,
  "creditsPerStep": [{"step":"...","cost":1,"reason":"..."}],
  "integrations": ["Gmail"],
  "unsupported": false,
  "reason": "",
  "alternative": ""
}`
    const context = `User goal: ${conversation.currentGoal}\nKnown details: ${JSON.stringify(known)}`
    let plan = {}
    try {
      const res = await callLLMForRole('reasoning', system, context, { jsonMode: true, maxTokens: 1000 })
      logModelCall(conversation, res, 'build_plan')
      plan = res.result || {}
    } catch (err) {
      plan = { unsupported: true, reason: 'Could not build a plan from this request.', alternative: 'Try a simpler request like "Email me a daily summary".' }
    }

    if (plan.unsupported) {
      return {
        id: automationIdFor(conversation),
        name: 'Unsupported request',
        description: conversation.originalRequest,
        originalRequest: conversation.originalRequest,
        interpretedGoal: conversation.currentGoal,
        trigger: { type: 'schedule', cron: '0 0 8 * *' },
        actions: [],
        status: 'awaiting_information',
        missing: [{ field: 'unsupported', step: 'Plan', connector: 'system', reason: plan.reason || 'Unsupported' }],
        creditsNeeded: 0,
        creditsPerRun: 0,
      }
    }

    const actions = Array.isArray(plan.actions) ? plan.actions : []
    const supportedActions = actions.filter(a => isSupportedAction(a.connector, a.action))
    if (actions.length === 0 || supportedActions.length !== actions.length) {
      return {
        id: automationIdFor(conversation),
        name: 'Request needs a supported capability',
        description: conversation.originalRequest,
        originalRequest: conversation.originalRequest,
        interpretedGoal: conversation.currentGoal,
        trigger: { type: 'schedule', cron: '0 0 8 * *' },
        actions: [],
        status: 'awaiting_information',
        missing: [{ field: 'unsupported', step: 'Plan', connector: 'system', reason: 'Alpha cannot reliably perform every requested action yet.' }],
        creditsNeeded: 0,
        creditsPerRun: 0,
      }
    }
    return {
      id: automationIdFor(conversation),
      name: plan.name || conversation.currentGoal,
      description: plan.description || conversation.currentGoal,
      originalRequest: conversation.originalRequest,
      interpretedGoal: conversation.currentGoal,
      trigger: plan.trigger || { type: 'schedule', cron: buildCron(known.time) },
      actions: supportedActions,
      status: 'awaiting_approval',
      missing: [],
      creditsNeeded: Number(plan.creditsNeeded) || supportedActions.length || 1,
      creditsPerRun: Number(plan.creditsNeeded) || supportedActions.length || 1,
      creditsPerStep: plan.creditsPerStep || [],
      integrations: plan.integrations || [],
      permissions: Array.from(new Set(supportedActions.map(a => a.connector))),
      createdAt: conversation.createdAt,
      updatedAt: nowIso(),
      executionHistory: [],
      successRate: 0,
      executionsDone: 0,
      executionsTotal: null,
    }
  }

  function finalizeAgentFromCapability(conversation, plan) {
    const agent = {
      id: automationIdFor(conversation),
      name: plan.name || plan.title,
      description: plan.description,
      originalRequest: conversation.originalRequest,
      interpretedGoal: plan.interpretedGoal || plan.description,
      mission: conversation.knownFields?.mission || conversation.currentGoal || plan.description,
      strategy: { summary: plan.description || conversation.currentGoal, contentPillars: [], calendar: [] },
      userId: conversation.userId,
      userEmail: conversation.userEmail,
      trigger: plan.trigger,
      actions: plan.actions,
      status: plan.status || 'awaiting_approval',
      approved: plan.approved || false,
      missing: plan.missing || [],
      creditsNeeded: plan.creditsNeeded || plan.creditsPerRun || 1,
      creditsPerRun: plan.creditsPerRun || plan.creditsNeeded || 1,
      creditsPerStep: plan.creditsPerStep || [],
      schedule: plan.schedule,
      timezone: plan.timezone,
      startDate: plan.startDate,
      endDate: plan.endDate,
      duration: plan.duration,
      integrations: plan.integrations,
      requiredPermissions: plan.requiredPermissions,
      permissions: plan.requiredPermissions || Array.from(new Set((plan.actions || []).map(a => a.connector))),
      createdAt: conversation.createdAt,
      updatedAt: nowIso(),
      executionHistory: [],
      successRate: 0,
      executionsDone: 0,
      executionsTotal: plan.executionsTotal,
    }
    return agent
  }

  async function approveContent(conversation, itemIds = []) {
    if (!Array.isArray(conversation.generatedContent)) return
    if (itemIds.length === 0) {
      conversation.generatedContent.forEach(item => { item.approved = true })
    } else {
      conversation.generatedContent.forEach(item => { if (itemIds.includes(item.id)) item.approved = true })
    }

    const allApproved = conversation.generatedContent.every(item => item.approved)
    if (allApproved) {
      conversation.conversationStage = 'awaiting_approval'
      addMessage(conversation, 'alpha', 'All posts approved. I will prepare the campaign. You can activate it when ready.')
    } else {
      addMessage(conversation, 'alpha', 'Approved the selected posts. Review the rest when ready.')
    }
  }

  async function regenerateContent(conversation, itemIds = []) {
    if (!Array.isArray(conversation.generatedContent) || conversation.generatedContent.length === 0) return
    const known = conversation.knownFields || {}
    const business = known.business || 'your business'
    const audience = known.audience || 'your audience'
    const tone = known.tone || 'friendly and professional'
    const dontPost = Array.isArray(known.dontPost) ? known.dontPost : []

    const toRegen = itemIds.length
      ? conversation.generatedContent.filter(i => itemIds.includes(i.id))
      : conversation.generatedContent

    for (const item of toRegen) {
      const system = `You are Alpha, a creative copywriter. Rewrite the following social post in a ${tone} tone for ${audience}.
Platform: ${PLATFORM_NAMES[item.platforms[0]] || item.platforms[0]}.
Business: ${business}.
Post type: ${item.postType}.
Avoid: ${dontPost.join(', ') || 'nothing specific'}.
Return JSON: { "text": "..." }`
      try {
        const res = await callLLMForRole('content', system, `Original topic: ${item.topic}`, { jsonMode: true, maxTokens: 1000 })
        logModelCall(conversation, res, 'regenerate_post')
        if (res.result?.text) {
          for (const platform of item.platforms) {
            item.captions[platform] = res.result.text
          }
          item.edited = false
          item.generationMode = 'model'
        }
      } catch (err) {
        console.error('[conversationEngine] regenerateContent failed:', err)
        item.generationMode = 'fallback'
      }
    }
  }

  async function createAutomation(conversation, user) {
    const draft = conversation.automationDraft
    if (!draft) throw new Error('No automation draft to create')
    if (draft.campaign) {
      const meta = draft.campaign.meta || {}
      if (!['once_now', 'once_later', 'recurring'].includes(meta.publishingMode) || meta.scheduleSource === 'unresolved' || meta.durationSource === 'unresolved') {
        throw new Error('Choose and confirm the publishing schedule before approving this automation.')
      }
    }
    const draftConnectors = new Set([
      ...(draft.actions || []).map(action => action.connector),
      ...(draft.campaign?.meta?.platforms || []),
      ...(draft.campaign?.posts || []).flatMap(post => post.platforms || []),
    ])
    const blockedConnector = [...draftConnectors].find(connector => !connectorFeatureAccess(user, connector, true).enabled)
    if (blockedConnector) throw new Error(unavailableConnectorMessage(blockedConnector))

    draft.status = 'running'
    draft.approved = true
    draft.userId = user.id
    draft.userEmail = user.email
    if (draft.campaign) {
      draft.campaign.approved = true
      draft.campaign.status = 'running'
      draft.campaign.charged = false
      draft.campaign.posts.forEach(post => {
        if (['posted', 'publishing', 'cancelled'].includes(post.status)) return
        post.status = 'scheduled'
        post.approved = true
      })
    }
    draft.updatedAt = nowIso()
    const normalizedDraft = normalizeAutomationLifecycle(draft)
    draft.status = normalizedDraft.status
    draft.approved = normalizedDraft.approved
    if (draft.campaign && normalizedDraft.campaign) {
      draft.campaign = normalizedDraft.campaign
    }

    await saveServerAgent(draft)
    let finalAgent = draft
    const publishNow = draft.campaign?.meta?.publishingMode === 'once_now' || draft.campaign?.meta?.postingOption === 'now'
    if (publishNow && typeof executeAgent === 'function') {
      const execution = await executeAgent(draft, user)
      finalAgent = await getServerAgent(draft.id, user.id) || draft
      conversation.automationDraft = finalAgent
      if (execution.status === 'success' || execution.status === 'partial') {
        const confirmed = (execution.steps || []).flatMap(step => Object.entries(step.result || {}))
          .filter(([, result]) => result?.status === 'success' && result?.id)
          .map(([platform, result]) => `${platform}: ${result.id}`)
        addMessage(conversation, 'alpha', `Approved and published **${draft.name}**.${confirmed.length ? ` Confirmed provider ID${confirmed.length === 1 ? '' : 's'}: ${confirmed.join(', ')}.` : ''}`)
      } else {
        addMessage(conversation, 'alpha', `Approval was saved, but publication was not confirmed: ${execution.log || 'the provider did not confirm a post'}. No credit was charged for an unconfirmed post.`)
      }
    } else {
      conversation.automationDraft = finalAgent
      addMessage(conversation, 'alpha', `Automation **${draft.name}** is active.`)
    }
    conversation.conversationStage = 'created'
    conversation.status = 'completed'
    await saveConversation(conversation)
    return finalAgent
  }

  async function start(user, prompt) {
    const id = randomUUID()
    const conversation = {
      id,
      type: 'conversation',
      userId: user.id,
      userEmail: user.email,
      name: `Conversation: ${prompt.slice(0, 40)}`,
      description: prompt,
      originalRequest: prompt,
      currentGoal: prompt,
      intent: 'unknown',
      confidence: 0,
      knownFields: {},
      missingFields: [],
      askedFields: [],
      generatedContent: [],
      selectedCapabilities: [],
      requiredIntegrations: [],
      pendingConnections: [],
      approvalRequired: false,
      conversationStage: 'understanding',
      automationDraft: null,
      lastQuestion: '',
      messages: [],
      credits: { estimated: 0, spent: 0 },
      status: 'draft',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      executionHistory: [],
      successRate: 0,
      actions: [],
      trigger: { type: 'schedule', cron: '0 0 8 * *' },
      permissions: [],
    }
    addMessage(conversation, 'user', prompt)
    await understandRequest(conversation)
    await saveConversation(conversation)
    return conversation
  }

  async function continueConversation(id, user, text) {
    const conversation = await loadConversation(id, user)
    addMessage(conversation, 'user', text)
    if (isDirectImageRequest(text)) {
      conversation.originalRequest = normalizeImageCommand(text)
      conversation.currentGoal = conversation.originalRequest
      await understandRequest(conversation, conversation.originalRequest)
      await saveConversation(conversation)
      return conversation
    }
    const brainAnswer = answerFromBrain(text)
    if (brainAnswer) {
      addMessage(conversation, 'alpha', brainAnswer, { knowledgeSource: 'alphatekx-brain' })
      conversation.conversationStage = 'chatting'
      conversation.currentGoal = ''
      conversation.automationDraft = null
      await saveConversation(conversation)
      return conversation
    }
    const approvalRequested = /\b(?:approve|approved|activate|launch|start\s+campaign|go\s+ahead)\b/i.test(text)
    const recoverableStage = ['chatting', 'blocked', 'unsupported'].includes(conversation.conversationStage)
    const originalHeuristic = heuristicParseRequest(conversation.originalRequest || '')
    if (approvalRequested && recoverableStage && SOCIAL_CONTENT_INTENTS.has(originalHeuristic.intent)) {
      addMessage(conversation, 'alpha', 'The previous plan did not reach a valid review screen, so I am rebuilding it from your saved campaign details. Nothing will publish until the complete preview is ready and you approve it.')
      conversation.currentGoal = conversation.originalRequest
      conversation.intent = 'unknown'
      conversation.confidence = 0
      conversation.knownFields = {}
      conversation.missingFields = []
      conversation.askedFields = []
      conversation.generatedContent = []
      conversation.pendingConnections = []
      conversation.automationDraft = null
      conversation.approvalRequired = false
      conversation.conversationStage = 'understanding'
      await understandRequest(conversation, conversation.originalRequest)
      if (conversation.conversationStage === 'awaiting_content_review') {
        addMessage(conversation, 'alpha', 'Your campaign preview is ready again. Review the posts and images, then approve once more to activate it.')
      } else if (conversation.conversationStage === 'blocked') {
        addMessage(conversation, 'alpha', 'I still could not produce a complete verified preview, so I did not activate or charge anything. Use Regenerate when the content and image providers are ready.')
      }
      await saveConversation(conversation)
      return conversation
    }
    const hasPlanningContext = !['chatting', 'created', 'blocked', 'unsupported'].includes(conversation.conversationStage)
    const classification = classifyIntent(text, { hasPlanningContext })
    conversation.intentClassification = classification
    if (classification.category === INTENT_CATEGORIES.conversation || classification.category === INTENT_CATEGORIES.help) {
      addMessage(conversation, 'alpha', classification.category === INTENT_CATEGORIES.help ? helpResponse(text) : (conversationalResponse(text) || conversationalReply(text)))
      await saveConversation(conversation)
      return conversation
    }
    if (hasPlanningContext && classification.category === INTENT_CATEGORIES.unknown) {
      addMessage(conversation, 'alpha', 'I’m not certain how that relates to this automation. Could you rephrase it?')
      await saveConversation(conversation)
      return conversation
    }

    if (conversation.conversationStage === 'chatting') {
      conversation.originalRequest = text
      conversation.currentGoal = text
      await understandRequest(conversation, text)
    } else if (conversation.conversationStage === 'clarification') {
      const combined = `${conversation.originalRequest} ${text}`
      await understandRequest(conversation, combined)
    } else if (conversation.conversationStage === 'understanding' || conversation.conversationStage === 'gathering_information') {
      await handleAnswer(conversation, text)
    } else if (conversation.conversationStage === 'awaiting_content_review') {
      const lower = text.toLowerCase()
      if (/\b(approve all|approve everything|yes|all good|looks good)\b/.test(lower)) {
        await approveContent(conversation)
        await createAutomation(conversation, user)
      } else if (/\b(regenerate|rewrite|redo)\b/.test(lower)) {
        await regenerateContent(conversation)
      } else if (/\b(approve|yes)\b/.test(lower)) {
        await approveContent(conversation)
        await createAutomation(conversation, user)
      } else {
        addMessage(conversation, 'alpha', 'You can say "approve", "regenerate", or "edit post 3 to ...". One approval activates the reviewed plan.')
      }
    } else if (conversation.conversationStage === 'awaiting_approval' || conversation.conversationStage === 'ready_to_create') {
      const lower = text.toLowerCase()
      if (/\b(approve|yes|activate|go|start)\b/.test(lower)) {
        await createAutomation(conversation, user)
      } else if (/\b(edit|change)\b/.test(lower)) {
        addMessage(conversation, 'alpha', 'What would you like to change?')
      } else {
        addMessage(conversation, 'alpha', 'Say "approve" to activate, or tell me what to change.')
      }
    } else {
      addMessage(conversation, 'alpha', "I'm ready when you are. Say 'approve' to activate, or start a new automation.")
    }

    await saveConversation(conversation)
    return conversation
  }

  async function getConversation(id, user) {
    return loadConversation(id, user)
  }

  async function approveAndCreate(id, user) {
    const conversation = await loadConversation(id, user)
    if (conversation.conversationStage === 'awaiting_content_review') {
      await approveContent(conversation)
    }
    return createAutomation(conversation, user)
  }

  return {
    start,
    continue: continueConversation,
    get: getConversation,
    approveAndCreate,
    approveContent,
    regenerateContent,
    createAutomation,
  }
}

export { ALPHATEKX_BRAIN }
