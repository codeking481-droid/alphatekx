import { randomUUID } from 'node:crypto'
import { buildCapabilityPlan, detectCapability, isSupportedAction } from '../automation/capabilityRegistry.mjs'

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
  'blocked',
  'unsupported',
]

const PLATFORM_NAMES = {
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  x: 'X',
  twitter: 'X',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  slack: 'Slack',
  discord: 'Discord',
}

const SOCIAL_CONTENT_INTENTS = new Set([
  'social_content',
  'facebook_posts',
  'linkedin_posts',
  'x_posts',
  'instagram_posts',
  'content_campaign',
  'facebook',
  'linkedin',
  'x',
  'instagram',
])

function nowIso() { return new Date().toISOString() }

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next.toISOString().split('T')[0]
}

function parseTime(text) {
  const match = String(text).match(/\b(\d{1,2}):(\d{2})?\s*(am|pm)?\b/i) || String(text).match(/\b(\d{1,2})\s*(am|pm)\b/i)
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
  return /\b(?:create|generate|make|write)\s+(?:a(?:\s+(?:single|strong|great))?|one)\s+(?:linkedin\s+|medium\s+|x\s+|twitter\s+|facebook\s+|instagram\s+)?(?:post|article)\b/i.test(prompt) ||
    /\b(?:only|exactly)\s+one\s+posts?\b/i.test(prompt) ||
    /\bdo not schedule (?:a )?recurring campaign\b/i.test(prompt)
}

function heuristicParseRequest(prompt) {
  const lower = String(prompt || '').toLowerCase()
  const result = { intent: 'unknown', knownFields: {} }
  const hasPost = /\b(post|article|content)\b/.test(lower)
  const platformList = [
    { id: 'linkedin', test: /\blinkedin\b/ },
    { id: 'medium', test: /\bmedium\b/ },
    { id: 'x', test: /(?:^|\s)x(?:\s|$|\.|,|!|\?)/ },
    { id: 'twitter', test: /\btwitter\b/ },
    { id: 'facebook', test: /\bfacebook\b/ },
    { id: 'instagram', test: /\binstagram\b/ },
    { id: 'threads', test: /\bthreads\b/ },
    { id: 'tiktok', test: /\btiktok\b/ },
    { id: 'youtube', test: /\byoutube\b/ },
  ]
  const platforms = platformList.filter(p => p.test.test(lower)).map(p => p.id === 'twitter' ? 'x' : p.id)
  if (!hasPost || platforms.length === 0) return result
  result.intent = 'social_content'
  result.knownFields.platforms = platforms

  const businessPatterns = [
    /\bintroducing\s+([^,.!?]+)/i,
    /\bmy\s+business\s+(?:is|offers?)\s+([^,.!?]+)/i,
    /\b(?:post|article)\s+(?:about|on)\s+([^,.!?]+)/i,
    /\babout\s+([^,.!?]+)/i,
  ]
  for (const re of businessPatterns) {
    const m = prompt.match(re)
    if (m) { result.knownFields.business = cleanBusiness(m[1]); break }
  }

  const audienceMatch = prompt.match(/\b(?:for|target(?:ed)?\s+audience(?:\s+is)?)\s*[:=]?\s*([^\.\n]+(?:,[^\.\n]+)*)/i) ||
                        prompt.match(/\baudience(?:\s+is)?\s*[:=]?\s*([^\.\n]+(?:,[^\.\n]+)*)/i)
  if (audienceMatch) result.knownFields.audience = audienceMatch[1].trim().replace(/\s+/g, ' ')

  const toneMatch = prompt.match(/\btone(?:\s+is)?\s*[:=]?\s*([^\.\n]+)/i) ||
                    prompt.match(/(?:\bin a|\bwith a)\s+([^\.\n]+?)\s+\btone\b/i)
  if (toneMatch) result.knownFields.tone = toneMatch[1].trim().replace(/\s+/g, ' ')

  const time = extractTimeFromText(prompt)
  if (time) result.knownFields.time = time

  const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].filter(day => new RegExp(`\\b${day}s?\\b`, 'i').test(prompt))
  if (weekdays.length) {
    result.knownFields.daysOfWeek = weekdays
    result.knownFields.frequency = 'weekly'
  } else if (/\bweekdays?\b/i.test(prompt)) result.knownFields.frequency = 'weekdays'
  else if (/\b(?:every\s+day|daily)\b/i.test(prompt)) result.knownFields.frequency = 'daily'
  else if (/\bmonthly\b|\bevery\s+month\b/i.test(prompt)) result.knownFields.frequency = 'monthly'

  const timezoneMatch = prompt.match(/\b(?:timezone\s*[:=]?\s*)?(UTC|GMT|WAT|[A-Za-z_]+\/[A-Za-z_]+)\b/i)
  if (timezoneMatch) result.knownFields.timezone = timezoneMatch[1]
  const startMatch = prompt.match(/\bstart(?:ing)?\s+(?:on\s+)?(\d{4}-\d{2}-\d{2}|today|tomorrow)\b/i)
  if (startMatch) result.knownFields.startDate = startMatch[1].toLowerCase()
  const endMatch = prompt.match(/\b(?:until|end(?:ing)?\s+(?:on\s+)?)(\d{4}-\d{2}-\d{2})\b/i)
  if (endMatch) result.knownFields.endDate = endMatch[1]
  const runMatch = prompt.match(/\b(?:for|stop\s+after)\s+(\d+)\s+(?:posts?|runs?)\b/i)
  if (runMatch) result.knownFields.totalPosts = Number(runMatch[1])
  const ctaMatch = prompt.match(/\b(?:cta|call to action)\s*[:=]\s*([^\n.]+)/i)
  if (ctaMatch) result.knownFields.callToAction = ctaMatch[1].trim()

  const explicitPostCount = prompt.match(/\b(?:create|generate|make|write)(?:\s+only)?\s+(one|\d+)\s+(?:linkedin\s+|medium\s+|x\s+|twitter\s+|facebook\s+|instagram\s+)?posts?\b/i) ||
    prompt.match(/\b(?:only|exactly)\s+(one|\d+)\s+posts?\b/i)
  if (explicitPostCount) result.knownFields.totalPosts = explicitPostCount[1].toLowerCase() === 'one' ? 1 : Number(explicitPostCount[1])
  const isSinglePost = requestsSinglePost(prompt)
  if (isSinglePost || result.knownFields.totalPosts === 1 || /\bdo not schedule (?:a )?recurring campaign\b/i.test(prompt)) {
    result.knownFields.totalPosts = 1
    result.knownFields.durationDays = 1
    result.knownFields.frequency = 'once'
  }
  const duration = /\b(?:days?|weeks?|months?)\b/i.test(prompt) ? extractDurationFromText(prompt) : null
  if (duration) result.knownFields.durationDays = duration

  if (/\b(do not publish|until i approve|manual approval|review before publishing|approve it)\b/i.test(lower)) result.knownFields.approvalPreference = 'manual'
  else if (/\b(auto publish|publish automatically|auto approval)\b/i.test(lower)) result.knownFields.approvalPreference = 'auto'
  else if (platforms.includes('linkedin')) result.knownFields.approvalPreference = 'manual'

  return result
}

function normalizePlatform(name) {
  const n = String(name).toLowerCase().replace(/\s+/g, '').replace(/^@/, '')
  if (n.includes('facebook')) return 'facebook'
  if (n.includes('linkedin')) return 'linkedin'
  if (n.includes('instagram')) return 'instagram'
  if (n === 'x' || n === 'twitter') return 'x'
  if (n.includes('telegram')) return 'telegram'
  if (n.includes('slack')) return 'slack'
  if (n.includes('whatsapp')) return 'whatsapp'
  if (n.includes('discord')) return 'discord'
  return n
}

function computePostCredits(platforms, includeImage = false) {
  let credits = 2 + platforms.length
  if (includeImage) credits += 2
  return credits
}

function buildCron(timeDisplay, fallbackHour = 8) {
  const t = parseTime(timeDisplay) || { hour: fallbackHour, minute: 0 }
  return `${t.minute} ${t.hour} * * *`
}

const ALPHA_SYSTEM_IDENTITY = `You are Alpha, the intelligent automation brain of AlphaTekx.
Your job is to turn user goals into safe, valid, executable automations.
You can understand requests, ask one concise question at a time, generate original content, explain plans, suggest improvements, and help users manage automations.
You must distinguish between discussing an idea, generating content, planning an automation, waiting for information, waiting for app connection, waiting for approval, scheduling, executing, and confirming completion.
You must never say an action succeeded unless a registered tool or execution record confirms success.
You must never invent connected accounts, published posts, sent messages, uploaded videos, payment results, calendar events, spreadsheet updates, or automation executions.
Always respond in valid JSON when asked.`

function requiredMissingFields(intent, knownFields) {
  const missing = []
  if (SOCIAL_CONTENT_INTENTS.has(intent)) {
    const linkedinOnly = Array.isArray(knownFields.platforms) && knownFields.platforms.length === 1 && knownFields.platforms[0] === 'linkedin'
    const recurring = linkedinOnly && ((knownFields.frequency && knownFields.frequency !== 'once') || (knownFields.daysOfWeek || []).length > 0)
    if (!knownFields.business) missing.push({ field: 'business', question: 'What does your business offer, or what is it about?', reason: 'I need this to generate relevant, original posts.', required: true })
    if (!knownFields.audience) missing.push({ field: 'audience', question: 'Who is your target customer or audience?', reason: 'I need this to make the posts persuasive.', required: true })
    if (!knownFields.tone) missing.push({ field: 'tone', question: 'What tone should the posts use? (e.g. professional, friendly, playful, bold, persuasive)', reason: 'This determines how the content sounds.', required: true })
    if ((!linkedinOnly || recurring) && !knownFields.time) missing.push({ field: 'time', question: 'What time should the posts go out? (e.g. 9:00 AM, morning, 6 PM)', reason: 'I need a schedule time.', required: true })
    if (recurring && !knownFields.timezone) missing.push({ field: 'timezone', question: 'Which timezone should I use? (for example Africa/Lagos)', reason: 'The server needs an exact timezone for reliable scheduling.', required: true })
    if (recurring && !knownFields.startDate) missing.push({ field: 'startDate', question: 'When should this LinkedIn schedule start?', reason: 'I need the first eligible publishing date.', required: true })
    if (recurring && !knownFields.endDate && !knownFields.totalPosts && !knownFields.total_posts) missing.push({ field: 'endCondition', question: 'When should it stop: on a date, or after how many posts?', reason: 'Recurring publishing needs a clear stopping condition.', required: true })
    if (!linkedinOnly && !knownFields.durationDays && !knownFields.duration_days && !knownFields.totalPosts && !knownFields.total_posts) missing.push({ field: 'durationDays', question: 'For how many days should I create posts?', reason: 'This determines how many posts to generate.', required: true })
    if (!knownFields.platforms || !knownFields.platforms.length) missing.push({ field: 'platforms', question: 'Which platform(s) should the posts be for? (Facebook, LinkedIn, X, Instagram, etc.)', reason: 'Each platform has a different style.', required: true })
    if (knownFields.approvalPreference === undefined || knownFields.approvalPreference === null) missing.push({ field: 'approvalPreference', question: 'Should I publish automatically after you approve each post, or do you want to review every post first?', reason: 'This controls the approval flow.', required: false })
    return missing
  }

  if (intent === 'send_email') {
    if (!knownFields.to) missing.push({ field: 'to', question: 'What email address should receive this?', reason: 'An email recipient is required.', required: true })
    if (!knownFields.subject && !knownFields.topic) missing.push({ field: 'subject', question: 'What is the email about or what should the subject be?', reason: 'I need this to write the email.', required: true })
    if (!knownFields.time) missing.push({ field: 'time', question: 'When should the email be sent? (one-time, daily, weekly, or a specific time)', reason: 'I need a schedule.', required: false })
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

export function createConversationEngine(deps) {
  const {
    callLLMForRole,
    saveServerAgent,
    getServerAgent,
    getUserCredits,
    spendUserCredits,
    getIntegrationStatus,
  } = deps

  async function saveConversation(conversation) {
    conversation.updatedAt = nowIso()
    await saveServerAgent(conversation)
    return conversation
  }

  async function loadConversation(id, user) {
    const conversation = await getServerAgent(id)
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
    const prompt = promptOverride || conversation.originalRequest
    const capability = detectCapability(prompt)

    const fastHeuristic = heuristicParseRequest(prompt)
    if (SOCIAL_CONTENT_INTENTS.has(fastHeuristic.intent) && requiredMissingFields(fastHeuristic.intent, fastHeuristic.knownFields).length === 0) {
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
- intent: one of social_content, send_email, telegram_message, slack_message, calendar_summary, sheets_append, unsupported, unknown
- goal: a short rewritten goal in plain English
- confidence: 0 to 1
- platforms: array of platform names mentioned (facebook, linkedin, x, instagram, telegram, slack, gmail, google_sheets, google_calendar)
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
      // Direct publishing to Facebook/Instagram is unsupported, but we can generate the content.
      if (capabilityPlan.capabilityId === 'facebook-post' || capabilityPlan.capabilityId === 'instagram-post') {
        parsed.intent = 'social_content'
        parsed.platforms = capabilityPlan.capabilityId === 'facebook-post' ? ['facebook'] : ['instagram']
      } else {
        parsed.intent = mapCapabilityToIntent(capabilityPlan, parsed.intent)
      }
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
    if (capabilityPlan.actions?.some(a => a.connector === 'facebook' || a.connector === 'linkedin' || a.connector === 'x' || a.connector === 'instagram')) return 'social_content'
    if (capabilityPlan.actions?.some(a => a.connector === 'gmail' || a.connector === 'email')) return 'send_email'
    if (capabilityPlan.actions?.some(a => a.connector === 'telegram')) return 'telegram_message'
    if (capabilityPlan.actions?.some(a => a.connector === 'slack')) return 'slack_message'
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
    if (!known.approvalPreference) known.approvalPreference = 'manual'
    return known
  }

  async function askNextQuestion(conversation) {
    const remaining = (conversation.missingFields || []).filter(m => !conversation.askedFields.includes(m.field))
    if (remaining.length === 0) {
      await moveToPlanningOrContent(conversation)
      return
    }
    const next = remaining[0]
    conversation.askedFields.push(next.field)

    const system = `${ALPHA_SYSTEM_IDENTITY}

Ask the user one concise, friendly question to get the missing detail. You may already know some fields; do not ask for those.
Return JSON: { "question": "..." }`
    const context = `Intent: ${conversation.intent}\nGoal: ${conversation.currentGoal}\nAlready known: ${JSON.stringify(conversation.knownFields)}\nMissing detail: ${next.field}\nWhy needed: ${next.reason}`

    try {
      const res = await callLLMForRole('fast', system, context, { jsonMode: true, maxTokens: 300 })
      logModelCall(conversation, res, 'ask_question')
      const question = res.result?.question || next.question
      conversation.lastQuestion = next.field
      addMessage(conversation, 'alpha', question, { field: next.field })
    } catch (err) {
      conversation.lastQuestion = next.field
      addMessage(conversation, 'alpha', next.question, { field: next.field })
    }
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
      extracted.startDate = /\b(?:today|tomorrow)\b/i.test(text) ? base.toISOString().split('T')[0] : text.trim()
    }
    if (field === 'endCondition') {
      const count = text.match(/\b(\d+)\s*(?:posts?|runs?)\b/i)
      const date = text.match(/\b(\d{4}-\d{2}-\d{2})\b/)
      if (count) extracted.totalPosts = Number(count[1])
      if (date) extracted.endDate = date[1]
      extracted.endCondition = text.trim()
    }

    if (clarification) {
      addMessage(conversation, 'alpha', clarification)
      return
    }

    if (contradiction) {
      addMessage(conversation, 'alpha', "Got it. I'll update that.")
    }

    Object.entries(extracted).forEach(([key, value]) => {
      if (value === undefined || value === null || String(value).trim() === '') return
      conversation.knownFields[key] = value
    })

    conversation.knownFields = normalizeKnownFields(conversation.knownFields, text)

    conversation.missingFields = conversation.missingFields.filter(m => {
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
      extracted.startDate = /\b(?:today|tomorrow)\b/i.test(text) ? date.toISOString().split('T')[0] : text.trim()
    } else if (field === 'endCondition') {
      const count = text.match(/\b(\d+)\s*(?:posts?|runs?)\b/i)
      const date = text.match(/\b(\d{4}-\d{2}-\d{2})\b/)
      if (count) extracted.totalPosts = Number(count[1])
      if (date) extracted.endDate = date[1]
      extracted.endCondition = text.trim()
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

  function validateCalendar(calendar, expectedPlatforms, expectedTotal) {
    if (!Array.isArray(calendar) || calendar.length < expectedTotal) return false
    return calendar.every(p => {
      const caps = p.captions || {}
      const hasCaption = typeof caps === 'object' && Object.keys(caps).some(k => typeof caps[k] === 'string' && caps[k].trim().length > 0)
      return Number.isInteger(p.day) && p.day > 0 && Array.isArray(p.platforms) && p.platforms.length > 0 && hasCaption
    })
  }

  async function generateContent(conversation) {
    const known = conversation.knownFields || {}
    const isSinglePost = requestsSinglePost(conversation.originalRequest || '')
    if (isSinglePost && !known.totalPosts && !known.total_posts && !known.durationDays && !known.duration_days) {
      known.totalPosts = 1
      known.durationDays = 1
    }
    const platforms = Array.isArray(known.platforms) && known.platforms.length ? known.platforms : ['facebook']
    const businessName = known.business || known.businessName || ''
    const businessType = known.businessType || known.description || known.business || 'your business'
    const audience = known.audience || 'your audience'
    const tone = known.tone || 'friendly and professional'
    const time = known.time || '08:00'
    const durationDays = Number(known.durationDays || known.duration_days || 7)
    const totalPosts = Number(known.totalPosts || known.total_posts || (durationDays * 1))
    const postsPerDay = Math.max(1, Math.ceil(totalPosts / durationDays))
    const dontPost = Array.isArray(known.dontPost) ? known.dontPost : []
    const includeImages = Boolean(known.includeImages || known.include_images)

    const business = businessName || businessType
    const brand = { business, businessType, audience, tone, website: known.website || '', dontPost }
    const startDate = known.startDate || new Date().toISOString().split('T')[0]
    const endDate = known.endDate || addDays(new Date(startDate), durationDays)
    const timezone = known.timezone === 'WAT' ? 'Africa/Lagos' : (known.timezone || 'UTC')
    const baseHour = parseTime(time)?.hour || 8
    const scheduleSlots = []
    for (let i = 0; i < postsPerDay; i++) {
      const hour = (baseHour + i) % 24
      scheduleSlots.push({ label: `${hour.toString().padStart(2, '0')}:00`, hour, minute: 0 })
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
      timezone,
      frequency: known.frequency || (isSinglePost ? 'once' : 'daily'),
      daysOfWeek: known.daysOfWeek || [],
      frequencyText: isSinglePost ? 'One time' : `${known.frequency || 'daily'} for ${totalPosts} post(s)`,
    }

    const system = `You are Alpha, a creative social media copywriter.
Generate original, engaging posts for the following brand and campaign.
Brand name: "${brand.business || businessType}".
Business type: ${businessType}.
Audience: ${audience}.
Original request: ${conversation.originalRequest}
Stay focused on this product/service and audience. Do not replace the brand with AlphaTekx or drift into unrelated topics.
Each post should be unique, sound natural, and match the platform's style.
Return strict JSON with shape:
{
  "calendar": [
    {
      "day": 1,
      "slot": "morning",
      "scheduledAt": "ISO-8601",
      "platforms": ["facebook"],
      "topic": "short topic label",
      "postType": "educational|product|story|cta",
      "captions": { "facebook": "post text" }
    }
  ]
}

Mix: 40% educational, 30% product, 20% story, 10% CTA.
Include a CTA in ~70% of posts.
Avoid repeating the same opening sentence across posts.
Do not invent customer names, testimonials, or facts you cannot verify.
Platform style:
- Facebook: short, friendly, 2-3 relevant hashtags
- LinkedIn: professional, 3-5 hashtags
- X: concise, punchy, 1-2 hashtags
- Instagram: visual, emoji-friendly, longer caption

Avoid: ${dontPost.join(', ') || 'nothing specific'}.
Total posts: ${totalPosts}.`

    const strictSystem = `${system}\n\nCRITICAL: Return only the JSON object. Every post must have a unique opening line and a different call to action. Do not return markdown code fences.`

    let posts = []
    let generationMode = 'fallback'
    let lastError = null
    let providerLog = null

    async function tryGenerate(strict = false) {
      const estimatedTokens = totalPosts === 1 ? 700 : Math.max(1200, Math.min(3000, totalPosts * 180 + 400))
      const res = await callLLMForRole('content', strict ? strictSystem : system, JSON.stringify({ brand, meta }), { jsonMode: true, maxTokens: estimatedTokens })
      logModelCall(conversation, res, 'generate_content')
      providerLog = { provider: res.provider, model: res.model, usage: res.usage, latencyMs: res.latencyMs }
      if (validateCalendar(res.result?.calendar, platforms, totalPosts)) {
        return res.result.calendar
      }
      throw new Error('Model returned invalid or incomplete calendar')
    }

    try {
      const calendar = await tryGenerate(false)
      posts = normalizeCalendar(calendar, platforms, scheduleSlots, startDate, timezone, postsPerDay, includeImages, meta)
      generationMode = 'model'
    } catch (err) {
      lastError = err
      console.error('[conversationEngine] generateContent first attempt failed:', err)
      try {
        const calendar = await tryGenerate(true)
        posts = normalizeCalendar(calendar, platforms, scheduleSlots, startDate, timezone, postsPerDay, includeImages, meta)
        generationMode = 'model'
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
        posts = generateFallbackPosts(platforms, business, audience, tone, durationDays, postsPerDay, scheduleSlots, startDate, timezone, includeImages)
      } else {
        conversation.conversationStage = 'blocked'
        addMessage(conversation, 'alpha', 'Alpha’s content-generation models are temporarily unavailable. Your automation details have been saved, so you can continue without starting again.')
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

    conversation.automationDraft = {
      id: conversation.id,
      type: 'campaign',
      userId: conversation.userId,
      userEmail: conversation.userEmail,
      name: `Social Content - ${durationDays} days`,
      description: `Generate and schedule ${totalPosts} posts for ${platforms.map(p => PLATFORM_NAMES[p] || p).join(', ')} for ${business}.`,
      originalRequest: conversation.originalRequest,
      interpretedGoal: conversation.currentGoal,
      trigger: { type: 'campaign', cron: 'campaign', nextRun: posts[0]?.scheduledAt },
      actions: [],
      status: 'awaiting_approval',
      approved: false,
      createdAt: conversation.createdAt,
      updatedAt: nowIso(),
      executionHistory: [],
      successRate: 100,
      permissions: platforms,
      creditsNeeded: totalCredits,
      creditsPerRun: 0,
      executionsDone: 0,
      executionsTotal: totalPosts,
      generationMode,
      campaign: {
        name: `Social Content - ${durationDays} days`,
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
      },
    }

    conversation.pendingConnections = []
    conversation.selectedCapabilities = platforms.map(p => `generate_${p}_content`)

    const status = await checkPublishingCapabilities(platforms, conversation.userId)
    if (!status.allReady) {
      conversation.automationDraft.missing = [{ field: 'connection', step: 'Publishing', connector: status.missing.join(', '), reason: `I can generate the posts, but direct publishing to ${status.missing.join(', ')} is not available. You can copy the posts manually or connect the app later.` }]
    }

    const platformList = platforms.map(p => PLATFORM_NAMES[p] || p).join(', ')
    if (generationMode === 'model') {
      addMessage(conversation, 'alpha', status.allReady
        ? `I generated ${posts.length} original post${posts.length === 1 ? '' : 's'} for ${platformList}. Review or improve the content, then explicitly approve it before scheduling or publishing.`
        : `I generated ${posts.length} original post${posts.length === 1 ? '' : 's'} for ${platformList}. Review it now, then connect ${status.missing.join(', ')} before approval.`, { generatedCount: posts.length, totalCredits })
    } else {
      addMessage(conversation, 'alpha', `Alpha’s content-generation models are temporarily unavailable. Your automation details have been saved, so you can continue without starting again. I've prepared ${posts.length} starter posts you can edit, regenerate, or approve once the models are back.`, { generatedCount: posts.length, totalCredits })
    }
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
      return {
        id: p.id || randomUUID(),
        day,
        slot: p.slot || slot.label,
        scheduledAt: platforms.length === 1 && platforms[0] === 'linkedin'
          ? scheduleOccurrence(i, startDate, p.slot ? { label: p.slot, hour: parseTime(p.slot)?.hour || slot.hour, minute: parseTime(p.slot)?.minute || slot.minute } : slot, meta.frequency, meta.daysOfWeek, timezone)
          : (p.scheduledAt || scheduleDate(day, p.slot ? { label: p.slot, hour: parseTime(p.slot)?.hour || slot.hour, minute: parseTime(p.slot)?.minute || slot.minute } : slot, startDate, timezone)),
        platforms: postPlatforms,
        topic: p.topic || '',
        postType: ['educational', 'product', 'story', 'cta'].includes(p.postType) ? p.postType : 'educational',
        captions,
        credits: computePostCredits(postPlatforms, includeImages),
        status: 'pending_approval',
        result: {},
      }
    }).slice(0, calendar.length)
  }

  function generateFallbackPosts(platforms, business, audience, tone, durationDays, postsPerDay, scheduleSlots, startDate, timezone, includeImages) {
    const posts = []
    for (let day = 1; day <= durationDays; day++) {
      for (let i = 0; i < postsPerDay; i++) {
        const slot = scheduleSlots[i % scheduleSlots.length]
        const types = ['educational', 'product', 'story', 'cta']
        const postType = types[(day + i) % types.length]
        const captions = {}
        for (const platform of platforms) {
          captions[platform] = generateFallbackCaption(platform, business, audience, tone, postType, day)
        }
        posts.push({
          id: randomUUID(),
          day,
          slot: slot.label,
          scheduledAt: scheduleDate(day, slot, startDate, timezone),
          platforms,
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
    const date = new Date(year, month - 1, dayOfMonth + day - 1, slot.hour, slot.minute, 0)
    return date.toISOString()
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
    const ctas = ['Learn more', 'Shop now', 'Book a session', 'DM us', 'Visit our store', 'Get started today']
    const cta = ctas[(day - 1) % ctas.length]
    if (postType === 'educational') return `Day ${day} tip: Quality service is the best marketing. When your ${audience} feels heard, they come back. #BusinessTips #SmallBusiness #${business.replace(/\s+/g, '')}`
    if (postType === 'product') return `Day ${day}: A quick look at what makes ${business} perfect for ${audience}. Ready when you are. ${cta}. #ProductSpotlight #${business.replace(/\s+/g, '')}`
    if (postType === 'story') return `Day ${day}: We started ${business} because we saw ${audience} needed better. Every post, every product, every message is for you. #OurStory #${business.replace(/\s+/g, '')}`
    return `Day ${day}: Big moves only. If you're part of ${audience}, this is for you. ${cta}. #CallToAction #${business.replace(/\s+/g, '')}`
  }

  async function checkPublishingCapabilities(platforms, userId) {
    const missing = []
    for (const p of platforms) {
      const status = await getIntegrationStatus(userId, p)
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
        id: conversation.id,
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
    return {
      id: conversation.id,
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
      successRate: 100,
      executionsDone: 0,
      executionsTotal: null,
    }
  }

  function finalizeAgentFromCapability(conversation, plan) {
    const agent = {
      id: conversation.id,
      name: plan.name || plan.title,
      description: plan.description,
      originalRequest: conversation.originalRequest,
      interpretedGoal: plan.interpretedGoal || plan.description,
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
      successRate: 100,
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

    const adminEmail = 'iamdan4live@gmail.com'
    const isAdmin = String(user.email || '').toLowerCase() === adminEmail
    const cost = draft.creditsNeeded || draft.creditsPerRun || draft.campaign?.totalCredits || 0
    const providerLog = conversation.providerLog || {}
    if (cost > 0 && !isAdmin) {
      const balance = await getUserCredits(user)
      if (balance < cost) throw new Error(`Insufficient credits. Need ${cost}, have ${balance}.`)
      const metadata = {
        conversationId: conversation.id,
        generationMode: draft.generationMode || conversation.generationMode || 'unknown',
        provider: providerLog.provider || '',
        model: providerLog.model || '',
        role: 'content',
        usage: providerLog.usage || {},
      }
      const ok = await spendUserCredits(user, cost, metadata)
      if (!ok) throw new Error('Could not charge credits')
      conversation.credits = conversation.credits || { estimated: 0, spent: 0 }
      conversation.credits.spent += cost
      if (draft.campaign) draft.campaign.charged = true
    }

    draft.status = 'running'
    draft.approved = true
    if (draft.campaign) {
      draft.campaign.approved = true
      draft.campaign.status = 'running'
      draft.campaign.posts.forEach(p => { if (p.status === 'pending_approval') p.status = 'scheduled' })
    }
    draft.updatedAt = nowIso()

    conversation.conversationStage = 'created'
    addMessage(conversation, 'alpha', `Automation **${draft.name}** is active. ${draft.campaign ? 'I cannot publish directly, so copy each post when it is due or connect the platform later.' : ''}`)

    await saveConversation(conversation)
    return draft
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
      successRate: 100,
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

    if (conversation.conversationStage === 'clarification') {
      const combined = `${conversation.originalRequest} ${text}`
      await understandRequest(conversation, combined)
    } else if (conversation.conversationStage === 'understanding' || conversation.conversationStage === 'gathering_information') {
      await handleAnswer(conversation, text)
    } else if (conversation.conversationStage === 'awaiting_content_review') {
      const lower = text.toLowerCase()
      if (/\b(approve all|approve everything|yes|all good|looks good)\b/.test(lower)) {
        await approveContent(conversation)
      } else if (/\b(regenerate|rewrite|redo)\b/.test(lower)) {
        await regenerateContent(conversation)
      } else if (/\b(approve|yes)\b/.test(lower)) {
        await approveContent(conversation)
      } else {
        addMessage(conversation, 'alpha', 'You can say "approve all", "regenerate", or "edit post 3 to ...".')
      }
    } else if (conversation.conversationStage === 'awaiting_approval') {
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
