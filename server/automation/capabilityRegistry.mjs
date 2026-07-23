const CAPABILITIES = [
  {
    id: 'linkedin-post',
    name: 'Publish LinkedIn Post',
    description: 'Generate, review, schedule, and publish a text post to a connected LinkedIn personal profile.',
    supported: true,
    requiredConnectors: ['linkedin'],
    patterns: [
      /(?:create|write|generate|publish|schedule|post).*(?:linkedin)/i,
      /linkedin.*(?:post|publish|schedule|content)/i,
    ],
  },
  {
    id: 'calendar-to-email',
    name: 'Daily Calendar Summary Email',
    description: 'Read today\'s Google Calendar events and email a schedule summary.',
    supported: true,
    requiredConnectors: ['google_calendar', 'gmail'],
    patterns: [
      /calendar.*(?:summary|summarize|email|send|mail)/i,
      /(?:email|send|mail).*calendar.*(?:summary|summarize|events|schedule)/i,
      /schedule.*(?:summary|summarize|email|send)/i,
      /summarize.*(?:calendar|schedule|events)/i,
      /read.*calendar.*email/i,
      /calendar.*morning/i,
      /(?:email|send|mail).*summary.*(?:calendar|schedule|events)/i,
      /(?:calendar|schedule|events).*summary.*(?:email|send|mail)/i,
      /(?:email|send|mail).*me.*(?:calendar|schedule|events)/i,
    ],
  },
  {
    id: 'gmail-to-telegram',
    name: 'Daily Gmail Summary to Telegram',
    description: 'Read unread Gmail messages, summarize them, and send the summary to Telegram.',
    supported: true,
    requiredConnectors: ['gmail', 'telegram'],
    patterns: [
      /gmail.*(?:summary|summarize|telegram)/i,
      /telegram.*gmail.*(?:summary|summarize|unread)/i,
      /summarize.*(?:unread\s*)?(?:emails?|gmail).*telegram/i,
      /send.*(?:gmail|email).*summary.*telegram/i,
    ],
  },
  {
    id: 'gmail-attachments-to-drive',
    name: 'Save Gmail Attachments to Google Drive',
    description: 'Find matching Gmail attachments and save each one to Google Drive without creating duplicates.',
    supported: true,
    requiredConnectors: ['gmail', 'google_drive'],
    patterns: [
      /(?:save|copy|move|upload|archive|backup|back\s*up).*(?:email|gmail|inbox|invoice|receipt).*(?:attachments?|files?).*(?:google\s*)?drive/i,
      /(?:email|gmail|inbox|invoice|receipt).*(?:attachments?|files?).*(?:to|in|into|on).*(?:google\s*)?drive/i,
      /(?:google\s*)?drive.*(?:email|gmail|inbox|invoice|receipt).*(?:attachments?|files?)/i,
      /(?:attachments?|attached\s+files?).*(?:from|in).*(?:email|gmail|inbox).*(?:to|in|into|on).*(?:google\s*)?drive/i,
    ],
  },
  {
    id: 'send-email',
    name: 'Send Email',
    description: 'Send an email to a recipient.',
    supported: true,
    requiredConnectors: ['gmail'],
    patterns: [
      /send\s+(?:an?\s+)?(?:email|mail)/i,
      /email\s+me/i,
      /send\s+me\s+(?:an?\s+)?(?:email|mail)/i,
      /welcome\s+email/i,
    ],
  },
  {
    id: 'post-telegram',
    name: 'Send Telegram Message',
    description: 'Send a message to a Telegram chat.',
    supported: true,
    requiredConnectors: ['telegram'],
    patterns: [
      /send.*(?:message|notification|alert).*telegram/i,
      /telegram.*(?:message|notification|alert)/i,
    ],
  },
  {
    id: 'post-slack',
    name: 'Send Slack Message',
    description: 'Send a message to a Slack channel.',
    supported: true,
    requiredConnectors: ['slack'],
    patterns: [
      /send.*(?:message|notification|alert).*slack/i,
      /slack.*(?:message|notification|alert)/i,
    ],
  },
  {
    id: 'append-sheets',
    name: 'Append to Google Sheets',
    description: 'Append a row to a Google Sheets spreadsheet.',
    supported: true,
    requiredConnectors: ['google_sheets'],
    patterns: [
      /(?:append|add|log).*google\s*sheets?/i,
      /(?:append|add|log).*spreadsheet/i,
      /sheets?.*(?:append|add|log)/i,
    ],
  },
  {
    id: 'facebook-post',
    name: 'Post to Facebook',
    description: 'Publish a post to a Facebook page.',
    supported: true,
    requiredConnectors: ['facebook'],
    patterns: [
      /post.*(?:to\s+)?facebook/i,
      /facebook\s*(?:post|publish)/i,
    ],
  },
  {
    id: 'instagram-post',
    name: 'Post to Instagram',
    description: 'Publish a post to Instagram.',
    supported: false,
    reason: 'Instagram integration is not available in this release.',
    alternative: 'Try Telegram, Slack, email, or a Google Sheets log.',
    patterns: [
      /post.*(?:to\s+)?instagram/i,
      /instagram\s*(?:post|publish)/i,
    ],
  },
]

function extractTime(text) {
  const clockMatch = text.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/i)
  const hourMatch = clockMatch ? null : text.match(/\b(\d{1,2})\s*(am|pm)\b/i)
  const match = clockMatch || hourMatch
  if (match) {
    let hour = parseInt(match[1], 10)
    const minute = clockMatch ? parseInt(match[2] || '0', 10) : 0
    const period = (clockMatch ? match[3] : match[2] || '').toLowerCase()
    if (period === 'pm' && hour !== 12) hour += 12
    if (period === 'am' && hour === 12) hour = 0
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) return { hour, minute, display: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}` }
  }
  const lower = String(text || '').toLowerCase()
  if (/\bnoon\b/.test(lower)) return { hour: 12, minute: 0, display: '12:00' }
  if (/\bmorning\b/.test(lower) || /\b8\s*am\b/.test(lower)) return { hour: 8, minute: 0, display: '08:00' }
  if (/\bafternoon\b/.test(lower)) return { hour: 13, minute: 0, display: '13:00' }
  if (/\bevening\b/.test(lower) || /\b6\s*pm\b/.test(lower)) return { hour: 18, minute: 0, display: '18:00' }
  if (/\bmidnight\b/.test(lower) || /\b12\s*am\b/.test(lower)) return { hour: 0, minute: 0, display: '00:00' }
  return null
}

function extractDuration(text) {
  const m = text.match(/for\s+(\d+)\s*(days?|weeks?|months?)/i)
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

function extractEmail(text) {
  const m = text.match(/[\w.-]+@[\w.-]+\.\w+/)
  return m ? m[0] : null
}

function extractTimezone(text) {
  const m = text.match(/\b(UTC|GMT|[A-Za-z_]+\/[A-Za-z_]+)\b/)
  return m ? m[1] : null
}

function buildCron(time, fallbackHour = 8) {
  const minute = time ? time.minute : 0
  const hour = time ? time.hour : fallbackHour
  return `${minute} ${hour} * * *`
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next.toISOString().split('T')[0]
}

function capabilityScore(text, capability) {
  let score = 0
  for (const pattern of capability.patterns) {
    if (pattern.test(text)) score += 1
  }
  return score
}

export function detectCapability(prompt) {
  const text = String(prompt || '')
  let best = null
  let bestScore = 0
  for (const c of CAPABILITIES) {
    const score = capabilityScore(text, c)
    if (score > bestScore) {
      bestScore = score
      best = c
    }
  }
  return best && bestScore > 0 ? best : null
}

function unsupportedResponse(capability, prompt) {
  return {
    unsupported: true,
    reason: capability.reason,
    alternative: capability.alternative,
    capabilityId: capability.id,
    capabilityName: capability.name,
    originalRequest: prompt,
    actions: [],
    trigger: { type: 'schedule', cron: '0 0 8 * *', nextRun: null },
    status: 'awaiting_information',
    approved: false,
    creditsNeeded: 0,
  }
}

function buildCalendarToEmailPlan(prompt, user, extracted) {
  const time = extracted.time || extractTime(prompt)
  const durationDays = extracted.duration || extractDuration(prompt) || 30
  const email = extracted.email || extractEmail(prompt) || user?.email || ''
  const timezone = extracted.timezone || extractTimezone(prompt) || user?.timezone || 'UTC'
  const cron = buildCron(time, 8)
  const startDate = new Date().toISOString().split('T')[0]
  const endDate = addDays(new Date(), durationDays)
  const missing = []
  if (!time) missing.push({ field: 'time', step: 'Schedule', connector: 'schedule', reason: 'What time should the summary be sent? (e.g. 8:00 AM)' })
  if (!email) missing.push({ field: 'to', step: 'Send summary email', connector: 'gmail', reason: 'Which email address should receive the calendar summary?', index: 0 })
  const name = 'Daily Calendar Summary Email'
  const actions = [{
    connector: 'google_calendar',
    action: 'email_summary',
    label: 'Read calendar and email summary',
    params: {
      to: email,
      timeZone: timezone,
      startDate,
      endDate,
      durationDays,
      generateSubject: true,
      bodyTemplate: 'today_list',
    },
  }]
  return {
    id: null,
    title: name,
    name,
    description: `Read today's Google Calendar events and email a schedule summary to ${email || 'the recipient'}.`,
    originalRequest: prompt,
    interpretedGoal: 'Email a daily summary of calendar events.',
    trigger: { type: 'schedule', cron, nextRun: null },
    schedule: { frequency: 'daily', cron, time: time ? time.display : undefined, timezone, startDate, endDate, durationDays },
    timezone,
    startDate,
    endDate,
    duration: `${durationDays} days`,
    integrations: ['Google Calendar', 'Gmail'],
    requiredPermissions: ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/gmail.send'],
    actions,
    status: missing.length ? 'awaiting_information' : 'awaiting_approval',
    approved: missing.length === 0,
    missing,
    creditsNeeded: 3,
    creditsPerRun: 3,
    creditsPerStep: [
      { step: 'Read Google Calendar', cost: 1, reason: 'Fetch today\'s events' },
      { step: 'Summarize schedule', cost: 1, reason: 'Generate a readable summary' },
      { step: 'Send Gmail summary', cost: 1, reason: 'Email the summary to the recipient' },
    ],
    notificationSettings: { onSuccess: true, onFailure: true, onRetry: true, channels: ['email'] },
    executionPolicy: 'run_until_end',
    retryPolicy: { maxRetries: 2, backoffMinutes: [1, 5] },
  }
}

function buildGmailToTelegramPlan(prompt, user, extracted) {
  const time = extracted.time || extractTime(prompt)
  const durationDays = extracted.duration || extractDuration(prompt) || 30
  const chatId = extracted.chatId || prompt.match(/-?\d{6,}|@\w+/)?.[0] || ''
  const timezone = extracted.timezone || extractTimezone(prompt) || user?.timezone || 'UTC'
  const cron = buildCron(time, 8)
  const startDate = new Date().toISOString().split('T')[0]
  const endDate = addDays(new Date(), durationDays)
  const missing = []
  if (!time) missing.push({ field: 'time', step: 'Schedule', connector: 'schedule', reason: 'What time should the summary be sent? (e.g. 8:00 AM)' })
  if (!chatId) missing.push({ field: 'chat_id', step: 'Send Telegram summary', connector: 'telegram', reason: 'Which Telegram chat or channel should receive the summary?', index: 0 })
  const name = 'Daily Gmail Summary to Telegram'
  const actions = [{
    connector: 'telegram',
    action: 'send_gmail_summary',
    label: 'Summarize Gmail and send to Telegram',
    params: { chatId, timeZone: timezone, startDate, endDate, durationDays, unreadOnly: true },
  }]
  return {
    id: null,
    title: name,
    name,
    description: `Read unread Gmail messages and send a summary to Telegram chat ${chatId || 'configured chat'}.`,
    originalRequest: prompt,
    interpretedGoal: 'Send a daily summary of unread Gmail to Telegram.',
    trigger: { type: 'schedule', cron, nextRun: null },
    schedule: { frequency: 'daily', cron, time: time ? time.display : undefined, timezone, startDate, endDate, durationDays },
    timezone,
    startDate,
    endDate,
    duration: `${durationDays} days`,
    integrations: ['Gmail', 'Telegram'],
    requiredPermissions: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send', 'Send Telegram messages'],
    actions,
    status: missing.length ? 'awaiting_information' : 'awaiting_approval',
    approved: missing.length === 0,
    missing,
    creditsNeeded: 4,
    creditsPerRun: 4,
    creditsPerStep: [
      { step: 'Read unread Gmail', cost: 1, reason: 'Fetch unread messages' },
      { step: 'Summarize emails', cost: 2, reason: 'Generate a concise summary' },
      { step: 'Send Telegram message', cost: 1, reason: 'Send summary to Telegram' },
    ],
    notificationSettings: { onSuccess: true, onFailure: true, onRetry: true, channels: ['email'] },
    executionPolicy: 'run_until_end',
    retryPolicy: { maxRetries: 2, backoffMinutes: [1, 5] },
  }
}

function buildSendEmailPlan(prompt, user, extracted) {
  const to = extracted.email || extractEmail(prompt) || user?.email || ''
  const subject = prompt.replace(/send\s+(?:an?\s+)?(?:email|mail)\s+(?:to\s+)?[\w.-]+@[\w.-]+\.\w+/i, '').replace(/to\s+me/i, '').trim() || 'Message from AlphaTekX'
  const missing = []
  if (!to) missing.push({ field: 'to', step: 'Send email', connector: 'gmail', reason: 'Who should receive this email?', index: 0 })
  return {
    id: null,
    title: 'Send Email',
    name: 'Send Email',
    description: `Send an email${to ? ` to ${to}` : ''}: ${subject}.`,
    originalRequest: prompt,
    interpretedGoal: 'Send an email.',
    trigger: { type: 'schedule', cron: '0 0 8 * *', nextRun: null },
    actions: [{
      connector: 'gmail',
      action: 'send_email',
      label: 'Send email',
      params: { to, subject, generate: true, prompt: subject },
    }],
    status: missing.length ? 'awaiting_information' : 'awaiting_approval',
    approved: missing.length === 0,
    missing,
    creditsNeeded: 2,
    creditsPerRun: 2,
    creditsPerStep: [
      { step: 'Generate email content', cost: 1, reason: 'Write the message' },
      { step: 'Send via Gmail', cost: 1, reason: 'Deliver the email' },
    ],
  }
}

function buildTelegramPlan(prompt, user, extracted) {
  const chatId = extracted.chatId || ''
  const missing = []
  if (!chatId) missing.push({ field: 'chat_id', step: 'Send Telegram message', connector: 'telegram', reason: 'Which Telegram chat should receive the message?', index: 0 })
  const message = prompt.replace(/send\s+(?:a\s+)?(?:message|notification|alert)\s+(?:to\s+)?telegram/i, '').replace(/telegram/i, '').trim() || 'Update from AlphaTekX'
  return {
    id: null,
    title: 'Send Telegram Message',
    name: 'Send Telegram Message',
    description: `Send a Telegram message${chatId ? ` to ${chatId}` : ''}: ${message}.`,
    originalRequest: prompt,
    interpretedGoal: 'Send a Telegram message.',
    trigger: { type: 'schedule', cron: '0 0 8 * *', nextRun: null },
    actions: [{
      connector: 'telegram',
      action: 'send_message',
      label: 'Send Telegram message',
      params: { chatId, message, generate: true, prompt: message },
    }],
    status: missing.length ? 'awaiting_information' : 'awaiting_approval',
    approved: missing.length === 0,
    missing,
    creditsNeeded: 2,
    creditsPerRun: 2,
    creditsPerStep: [
      { step: 'Generate message', cost: 1, reason: 'Write the message' },
      { step: 'Send Telegram', cost: 1, reason: 'Deliver to chat' },
    ],
  }
}

function buildSlackPlan(prompt, user, extracted) {
  const channel = extracted.channel || ''
  const missing = []
  if (!channel) missing.push({ field: 'channel', step: 'Send Slack message', connector: 'slack', reason: 'Which Slack channel should receive the message?', index: 0 })
  const message = prompt.replace(/send\s+(?:a\s+)?(?:message|notification|alert)\s+(?:to\s+)?slack/i, '').replace(/slack/i, '').trim() || 'Update from AlphaTekX'
  return {
    id: null,
    title: 'Send Slack Message',
    name: 'Send Slack Message',
    description: `Send a Slack message${channel ? ` to ${channel}` : ''}: ${message}.`,
    originalRequest: prompt,
    interpretedGoal: 'Send a Slack message.',
    trigger: { type: 'schedule', cron: '0 0 8 * *', nextRun: null },
    actions: [{
      connector: 'slack',
      action: 'send_message',
      label: 'Send Slack message',
      params: { channel, message, generate: true, prompt: message },
    }],
    status: missing.length ? 'awaiting_information' : 'awaiting_approval',
    approved: missing.length === 0,
    missing,
    creditsNeeded: 2,
    creditsPerRun: 2,
    creditsPerStep: [
      { step: 'Generate message', cost: 1, reason: 'Write the message' },
      { step: 'Send Slack', cost: 1, reason: 'Deliver to channel' },
    ],
  }
}

function buildSheetsPlan(prompt, user, extracted) {
  const spreadsheetId = extracted.spreadsheetId || ''
  const values = extracted.values || []
  const missing = []
  if (!spreadsheetId) missing.push({ field: 'spreadsheetId', step: 'Append to Google Sheets', connector: 'google_sheets', reason: 'Which spreadsheet should the row be appended to?', index: 0 })
  return {
    id: null,
    title: 'Append to Google Sheets',
    name: 'Append to Google Sheets',
    description: `Append a row to the Google Sheets spreadsheet${spreadsheetId ? ` ${spreadsheetId}` : ''}.`,
    originalRequest: prompt,
    interpretedGoal: 'Log a row to Google Sheets.',
    trigger: { type: 'schedule', cron: '0 0 8 * *', nextRun: null },
    actions: [{
      connector: 'google_sheets',
      action: 'append_row',
      label: 'Append row',
      params: { spreadsheetId, sheetName: 'Sheet1', values: values.length ? values : [new Date().toISOString(), prompt] },
    }],
    status: missing.length ? 'awaiting_information' : 'awaiting_approval',
    approved: missing.length === 0,
    missing,
    creditsNeeded: 1,
    creditsPerRun: 1,
    creditsPerStep: [{ step: 'Append row', cost: 1, reason: 'Write to spreadsheet' }],
  }
}

function buildLinkedInPlan(prompt, user, extracted) {
  const topicMatch = String(prompt).match(/(?:about|on)\s+([^,.!?]+)/i)
  const topic = topicMatch?.[1]?.trim() || ''
  const audienceMatch = String(prompt).match(/(?:for|audience(?:\s+is)?[:=]?)\s+([^,.!?]+)/i)
  const toneMatch = String(prompt).match(/(?:in a|with a|tone(?:\s+is)?[:=]?)\s+([^,.!?]+?)(?:\s+tone)?(?:[,.!?]|$)/i)
  const time = extracted.time || extractTime(prompt)
  const timezone = extracted.timezone || extractTimezone(prompt) || user?.timezone || ''
  const recurring = /\b(every|daily|weekly|monthly|weekdays?|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(prompt)
  const missing = []
  if (!topic) missing.push({ field: 'topic', step: 'Content', connector: 'linkedin', reason: 'What should the LinkedIn post be about?' })
  if (!audienceMatch?.[1]) missing.push({ field: 'audience', step: 'Content', connector: 'linkedin', reason: 'Who should this post speak to?' })
  if (!toneMatch?.[1]) missing.push({ field: 'tone', step: 'Content', connector: 'linkedin', reason: 'What tone should the post use?' })
  if (recurring && !time) missing.push({ field: 'time', step: 'Schedule', connector: 'schedule', reason: 'What time should the post be published?' })
  if (recurring && !timezone) missing.push({ field: 'timezone', step: 'Schedule', connector: 'schedule', reason: 'Which timezone should the schedule use?' })
  const cron = buildCron(time, 9)
  return {
    id: null,
    title: 'LinkedIn Personal Profile Post',
    name: 'LinkedIn Personal Profile Post',
    description: `Generate, review, and publish a LinkedIn text post${topic ? ` about ${topic}` : ''}.`,
    originalRequest: prompt,
    interpretedGoal: 'Publish approved text content to a connected LinkedIn personal profile.',
    trigger: { type: 'schedule', cron, nextRun: null },
    schedule: { frequency: recurring ? 'weekly' : 'once', cron, time: time?.display, timezone: timezone || 'UTC' },
    timezone: timezone || 'UTC',
    integrations: ['LinkedIn'],
    requiredPermissions: ['w_member_social'],
    actions: [{ connector: 'linkedin', action: 'post', label: 'Publish approved LinkedIn post', requiresApproval: true, approvalStatus: 'pending', params: { text: '', topic, audience: audienceMatch?.[1]?.trim() || '', tone: toneMatch?.[1]?.trim() || '', generate: true, profileType: 'personal' } }],
    status: missing.length ? 'awaiting_information' : 'awaiting_approval',
    approved: false,
    missing,
    creditsNeeded: 3,
    creditsPerRun: 3,
    creditsPerStep: [{ step: 'Generate and publish LinkedIn post', cost: 3, reason: 'AI writing and confirmed LinkedIn publishing' }],
    approvalPolicy: 'explicit',
    retryPolicy: { maxRetries: 3, backoffMinutes: [1, 5, 15] },
  }
}

function buildGmailAttachmentsToDrivePlan(prompt) {
  const invoiceOnly = /\binvoices?\b/i.test(prompt)
  const receiptOnly = /\breceipts?\b/i.test(prompt)
  const queryParts = ['has:attachment']
  if (invoiceOnly && receiptOnly) queryParts.push('{invoice receipt}')
  else if (invoiceOnly) queryParts.push('invoice')
  else if (receiptOnly) queryParts.push('receipt')
  const extension = String(prompt).match(/\b(pdf|csv|docx?|xlsx?|jpe?g|png|zip)\b/i)?.[1]?.toLowerCase()
  if (extension) queryParts.push(`filename:${extension}`)
  const sender = extractEmail(prompt)
  if (sender && /\b(?:from|sent\s+by|sender)\b/i.test(prompt)) queryParts.push(`from:${sender}`)
  if (/\bunread\b/i.test(prompt)) queryParts.push('is:unread')
  const query = queryParts.join(' ')
  const time = extractTime(prompt)
  const hourly = /\b(?:every\s+hour|hourly)\b/i.test(prompt)
  const daily = /\b(?:every\s+day|daily)\b/i.test(prompt)
  const cron = hourly ? '0 * * * *' : daily || time ? buildCron(time, 8) : '*/15 * * * *'
  const frequency = hourly ? 'hourly' : daily || time ? 'daily' : 'every_15_minutes'
  const filterLabel = invoiceOnly && receiptOnly ? 'invoice and receipt ' : invoiceOnly ? 'invoice ' : receiptOnly ? 'receipt ' : ''
  const name = invoiceOnly && !receiptOnly ? 'Save Invoice Attachments to Google Drive' : 'Save Gmail Attachments to Google Drive'
  return {
    id: null,
    title: name,
    name,
    description: `Check Gmail ${hourly ? 'hourly' : daily || time ? `daily${time ? ` at ${time.display}` : ''}` : 'every 15 minutes'} and save ${filterLabel}${extension ? `${extension.toUpperCase()} ` : ''}attachments to My Drive. Files already saved by this automation are skipped.`,
    originalRequest: prompt,
    interpretedGoal: 'Save matching Gmail attachments to Google Drive.',
    trigger: { type: 'schedule', cron, nextRun: null },
    schedule: { frequency, cron, time: time?.display, timezone: 'UTC' },
    integrations: ['Gmail', 'Google Drive'],
    requiredPermissions: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/drive',
    ],
    actions: [{
      connector: 'gmail',
      action: 'save_attachments_to_drive',
      label: 'Save matching Gmail attachments to Google Drive',
      params: { q: query, maxMessages: 20 },
    }],
    status: 'awaiting_approval',
    approved: true,
    missing: [],
    creditsNeeded: 1,
    creditsPerRun: 1,
    creditsPerStep: [
      { step: 'Save Gmail attachments to Drive', cost: 1, reason: 'Find, deduplicate, and upload matching attachments' },
    ],
    notificationSettings: { onSuccess: true, onFailure: true, onRetry: true, channels: ['email'] },
    executionPolicy: 'run_until_end',
    retryPolicy: { maxRetries: 2, backoffMinutes: [1, 5] },
  }
}

function buildFacebookPlan(prompt, user, extracted) {
  const topicMatch = String(prompt).match(/(?:about|on)\s+([^,.!?]+)/i)
  const topic = topicMatch?.[1]?.trim() || ''
  const audienceMatch = String(prompt).match(/(?:for|audience(?:\s+is)?[:=]?)\s+([^,.!?]+)/i)
  const toneMatch = String(prompt).match(/(?:in a|with a|tone(?:\s+is)?[:=]?)\s+([^,.!?]+?)(?:\s+tone)?(?:[,.!?]|$)/i)
  const missing = []
  if (!topic) missing.push({ field: 'topic', step: 'Content', connector: 'facebook', reason: 'What should the Facebook Page post be about?' })
  if (!audienceMatch?.[1]) missing.push({ field: 'audience', step: 'Content', connector: 'facebook', reason: 'Who should this post speak to?' })
  if (!toneMatch?.[1]) missing.push({ field: 'tone', step: 'Content', connector: 'facebook', reason: 'What tone should the post use?' })
  return {
    id: null,
    title: 'Facebook Page Post',
    name: 'Facebook Page Post',
    description: `Generate, review, and publish one Facebook Page text post${topic ? ` about ${topic}` : ''}.`,
    originalRequest: prompt,
    interpretedGoal: 'Publish one approved text post to a selected Facebook Page.',
    trigger: { type: 'campaign', cron: 'campaign', nextRun: null },
    schedule: { frequency: 'once', timezone: extracted.timezone || user?.timezone || 'UTC' },
    timezone: extracted.timezone || user?.timezone || 'UTC',
    integrations: ['Facebook'],
    requiredPermissions: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'],
    actions: [{ connector: 'facebook', action: 'post', label: 'Publish approved Facebook Page post', requiresApproval: true, approvalStatus: 'pending', params: { text: '', topic, audience: audienceMatch?.[1]?.trim() || '', tone: toneMatch?.[1]?.trim() || '', generate: true, profileType: 'page', totalPosts: 1 } }],
    status: missing.length ? 'awaiting_information' : 'awaiting_approval',
    approved: false,
    missing,
    creditsNeeded: 3,
    creditsPerRun: 3,
    creditsPerStep: [{ step: 'Generate and publish Facebook Page post', cost: 3, reason: 'AI writing and confirmed Facebook Page publishing' }],
    approvalPolicy: 'explicit',
    retryPolicy: { maxRetries: 3, backoffMinutes: [1, 5, 15] },
  }
}

export function buildCapabilityPlan(prompt, user = null, options = {}) {
  const text = String(prompt || '')
  const capability = detectCapability(text)
  if (!capability) return null
  const extracted = {
    time: options.time || extractTime(text),
    duration: options.duration || extractDuration(text),
    email: options.email || extractEmail(text),
    timezone: options.timezone || extractTimezone(text),
    chatId: options.chatId || '',
    channel: options.channel || '',
    spreadsheetId: options.spreadsheetId || '',
    values: options.values || [],
  }
  if (!capability.supported) return unsupportedResponse(capability, prompt)
  switch (capability.id) {
    case 'linkedin-post': return buildLinkedInPlan(prompt, user, extracted)
    case 'facebook-post': return buildFacebookPlan(prompt, user, extracted)
    case 'calendar-to-email': return buildCalendarToEmailPlan(prompt, user, extracted)
    case 'gmail-to-telegram': return buildGmailToTelegramPlan(prompt, user, extracted)
    case 'gmail-attachments-to-drive': return buildGmailAttachmentsToDrivePlan(prompt)
    case 'send-email': return buildSendEmailPlan(prompt, user, extracted)
    case 'post-telegram': return buildTelegramPlan(prompt, user, extracted)
    case 'post-slack': return buildSlackPlan(prompt, user, extracted)
    case 'append-sheets': return buildSheetsPlan(prompt, user, extracted)
    default: return null
  }
}

export function extractMissingFromAnswer(previousMissing, answer) {
  const text = String(answer || '')
  const updates = {}
  for (const m of previousMissing || []) {
    if (m.field === 'time') {
      const time = extractTime(text)
      if (time) updates['time'] = time.display
    } else if (m.field === 'email' || m.field === 'to') {
      const email = extractEmail(text)
      if (email) updates[m.index !== undefined ? `${m.index}:${m.field}` : m.field] = email
    } else if (m.field === 'timezone') {
      const tz = extractTimezone(text)
      if (tz) updates['timezone'] = tz
    } else if (m.field === 'chat_id') {
      const chatId = text.match(/\b\d{6,}\b|@\w+/)?.[0]
      if (chatId) updates[`${m.index}:chatId`] = chatId
    } else if (m.field === 'channel') {
      const channel = text.match(/#?\w+/)?.[0]
      if (channel) updates[`${m.index}:channel`] = channel
    }
  }
  return updates
}

export const SUPPORTED_CONNECTOR_ACTIONS = {
  gmail: ['send_email', 'save_attachments_to_drive'],
  email: ['send_email'],
  google_sheets: ['append_row', 'read_rows'],
  google_calendar: ['create_event', 'read_events', 'email_summary'],
  calendar: ['create_event', 'read_events', 'email_summary'],
  google_drive: ['upload_file'],
  github: ['create_issue', 'summarize_commits'],
  telegram: ['send_message', 'send_gmail_summary'],
  slack: ['send_message'],
  discord: ['send_message'],
  linkedin: ['post'],
  x: ['post', 'tweet'],
  facebook: ['post', 'tweet'],
  whatsapp: ['send_message'],
  notion: ['create_page', 'append_block'],
  supabase: ['insert_row', 'backup'],
  paystack: ['verify_payment'],
}

export function isSupportedAction(connector, action) {
  const list = SUPPORTED_CONNECTOR_ACTIONS[connector]
  if (!list) return false
  return list.includes(action)
}

export { CAPABILITIES, extractTime, extractDuration, extractEmail, extractTimezone, buildCron }
