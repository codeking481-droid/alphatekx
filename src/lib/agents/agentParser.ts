import { randomUUID } from '../utils'
import type { Agent, AgentAction, AgentTrigger, AgentStatus } from './types'

function buildCron(input: string): string {
  const lower = input.toLowerCase()
  const intervalMatch = lower.match(/every\s+(\d+)\s*minutes?/)
  if (intervalMatch) return `*/${intervalMatch[1]} * * * *`
  if (lower.includes('minute')) return '* * * * *'
  if (lower.includes('hour')) return '0 * * * *'
  if (lower.includes('morning') || lower.includes('8 am') || lower.includes('8:00')) return '0 8 * * *'
  if (lower.includes('evening') || lower.includes('6 pm') || lower.includes('6:00')) return '0 18 * * *'
  if (lower.includes('noon') || lower.includes('12 pm')) return '0 12 * * *'
  if (lower.includes('midnight') || lower.includes('12 am')) return '0 0 * * *'
  if (lower.includes('sunday')) return '0 9 * * 0'
  if (lower.includes('monday')) return '0 9 * * 1'
  if (lower.includes('friday')) return '0 9 * * 5'
  if (lower.includes('weekend')) return '0 10 * * 0,6'
  if (lower.includes('weekly')) return '0 9 * * 1'
  if (lower.includes('monthly')) return '0 9 1 * *'
  if (lower.includes('daily')) return '0 8 * * *'
  return '0 8 * * *'
}

function extractTimeHint(input: string): string {
  const match = input.match(/(\d{1,2})\s*(am|pm)/i)
  if (!match) return ''
  let hour = parseInt(match[1], 10)
  const period = match[2].toLowerCase()
  if (period === 'pm' && hour !== 12) hour += 12
  if (period === 'am' && hour === 12) hour = 0
  return `${hour.toString().padStart(2, '0')}:00`
}

function nextRunFromCron(cron: string): string {
  const now = new Date()
  const [minute, hour] = cron.split(' ').map(s => s.trim())
  const next = new Date(now.getTime() + 60_000)
  if (minute && minute !== '*') {
    if (minute.startsWith('*/')) {
      const step = parseInt(minute.slice(2), 10) || 1
      next.setMinutes(now.getMinutes() + (step - (now.getMinutes() % step) || step))
      next.setSeconds(0, 0)
    } else {
      next.setMinutes(parseInt(minute, 10))
    }
  }
  if (hour && hour !== '*') next.setHours(parseInt(hour, 10))
  if (next <= now) {
    if (minute && minute.startsWith('*/')) next.setMinutes(next.getMinutes() + parseInt(minute.slice(2), 10) || 1)
    else if (hour && hour !== '*') next.setDate(next.getDate() + 1)
    else next.setMinutes(next.getMinutes() + 1)
  }
  return next.toISOString()
}

function makeName(input: string): string {
  const clean = input.replace(/[.!?]/g, '').trim()
  return clean.slice(0, 60) || 'New Agent'
}

function detectActions(input: string, userEmail?: string): AgentAction[] {
  const lower = input.toLowerCase()
  const actions: AgentAction[] = []
  const platforms: Record<string, string> = {
    facebook: 'facebook',
    linkedin: 'linkedin',
    x: 'x',
    twitter: 'x',
    instagram: 'instagram',
    threads: 'threads',
    tiktok: 'tiktok',
    youtube: 'youtube',
    pinterest: 'pinterest',
    reddit: 'reddit',
    discord: 'discord',
    telegram: 'telegram',
  }

  const wantsGenerated = /\bai\b|generate|create.*(post|tip|message|content)|write/.test(lower)
  const quoteMatch = input.match(/["'“]([^"'”]+)["'”]/)
  const fixedText = quoteMatch ? quoteMatch[1] : ''
  const text = fixedText || input
  const aiPrompt = fixedText ? `a message like "${fixedText}"` : 'a relevant message'

  if (lower.includes('post') || lower.includes('publish') || lower.includes('share')) {
    const targets: string[] = []
    Object.keys(platforms).forEach(key => { if (lower.includes(key)) targets.push(platforms[key]) })
    if (!targets.length) targets.push('linkedin', 'x')
    const research = /news|search the internet|latest|trending|updates|what.*happening/.test(lower)
    const includeImage = /picture|image|photo|with a pic|including pictures|with an image/.test(lower)
    const topicMatch = input.match(/about\s+([^,.!?]+)/i) || input.match(/post\s+(?:news|an?\s+)?(?:about|on)?\s*([^,.!?]+)/i)
    const topic = topicMatch ? topicMatch[1].trim() : input
    targets.forEach(target => {
      const generated = wantsGenerated || !fixedText
      actions.push({ connector: target, action: target === 'x' ? 'tweet' : 'post', label: `Publish to ${target}`, params: { ...(generated ? { generate: true, prompt: aiPrompt } : { text }), ...(research ? { research: true, topic } : {}), ...(includeImage ? { image: true, topic } : {}) } })
    })
  }

  if (lower.includes('send email') || lower.includes('welcome email') || lower.includes('email me') || lower.includes('email them') || lower.includes('test email')) {
    const emailMatch = input.match(/[\w.-]+@[\w.-]+\.\w+/)
    const to = emailMatch ? emailMatch[0] : ''
    const generated = wantsGenerated || !fixedText
    actions.push({ connector: 'gmail', action: 'send_email', label: 'Send email', params: { to, subject: makeName(input), ...(generated ? { generate: true, prompt: aiPrompt } : { body: text }) } })
  }

  if (lower.includes('notion') && (lower.includes('create') || lower.includes('page'))) {
    actions.push({ connector: 'notion', action: 'create_page', label: 'Create Notion page', params: { title: makeName(input), content: input } })
  }

  if (lower.includes('github') && (lower.includes('summarize') || lower.includes('report') || lower.includes('commits'))) {
    actions.push({ connector: 'github', action: 'summarize_commits', label: 'Summarize GitHub commits', params: { repo: '', branch: 'main' } })
  }

  if (lower.includes('sheet') || lower.includes('spreadsheet') || lower.includes('log to google')) {
    actions.push({ connector: 'google_sheets', action: 'append_row', label: 'Append to Google Sheets', params: { values: [input, new Date().toISOString()] } })
  }

  if (lower.includes('slack') && lower.includes('send')) {
    const generated = wantsGenerated || !fixedText
    actions.push({ connector: 'slack', action: 'send_message', label: 'Send Slack message', params: generated ? { generate: true, prompt: aiPrompt } : { message: text } })
  }

  if (lower.includes('telegram')) {
    const generated = wantsGenerated || !fixedText
    actions.push({ connector: 'telegram', action: 'send_message', label: 'Send Telegram message', params: generated ? { generate: true, prompt: aiPrompt } : { message: text } })
  }

  if (lower.includes('whatsapp')) {
    const generated = wantsGenerated || !fixedText
    actions.push({ connector: 'whatsapp', action: 'send_message', label: 'Send WhatsApp message', params: generated ? { generate: true, prompt: aiPrompt } : { message: text } })
  }

  if (lower.includes('calendar') || lower.includes('event')) {
    actions.push({ connector: 'calendar', action: 'create_event', label: 'Create calendar event', params: { title: makeName(input) } })
  }

  if (lower.includes('backup') && lower.includes('database')) {
    actions.push({ connector: 'supabase', action: 'backup', label: 'Backup database', params: {} })
  }

  const genericMessage = !actions.length && (lower.includes('send me') || lower.includes('message me') || lower.includes('text me') || lower.includes('send a message') || lower.includes('send message'))
  if (genericMessage) {
    actions.push({ connector: 'gmail', action: 'send_email', label: 'Send email to me', params: { to: userEmail || '', subject: makeName(input), generate: true, prompt: aiPrompt } })
  }

  if (!actions.length) {
    const generated = wantsGenerated || !fixedText
    actions.push({ connector: 'gmail', action: 'send_email', label: 'Send notification email', params: { to: userEmail || '', subject: makeName(input), ...(generated ? { generate: true, prompt: aiPrompt } : { body: text }) } })
  }

  return actions
}

function extractUrl(input: string): string | undefined {
  const match = input.match(/https?:\/\/[^\s]+/)
  return match ? match[0] : undefined
}

export function createAgentFromNL(input: string, missionId?: string, user?: { id?: string; email?: string } | null): Agent {
  const lower = input.toLowerCase()
  const webhook = /\b(when|whenever|if someone|on purchase|on submit|webhook|form filled|new order|new sale|new user|new lead)\b/.test(lower)
  const monitor = /\b(monitor|uptime|watch|check.*website|is.*down)\b/.test(lower)

  let trigger: AgentTrigger
  if (webhook) {
    trigger = { type: 'webhook', event: 'webhook.received', nextRun: new Date().toISOString() }
  } else if (monitor) {
    const cron = buildCron(input)
    trigger = { type: 'monitor', cron, url: extractUrl(input) || 'https://example.com', nextRun: nextRunFromCron(cron) }
  } else {
    const cron = buildCron(input)
    trigger = { type: 'schedule', cron, nextRun: nextRunFromCron(cron) }
  }

  const actions = detectActions(input, user?.email).map(a => (a.connector === 'gmail' || a.connector === 'email') && user?.email && !a.params?.to ? { ...a, params: { ...a.params, to: user.email } } : a)
  const permissions = Array.from(new Set(actions.map(a => a.connector)))
  const totalMatch = input.match(/(\d+)\s*(?:times?|posts?|messages?|emails?|runs?|executions?|days?)/i)
  const executionsTotal = totalMatch ? Number(totalMatch[1]) || null : null
  const creditsNeeded = executionsTotal || 1

  return {
    id: randomUUID(),
    name: makeName(input),
    description: input,
    originalRequest: input,
    userId: user?.id,
    userEmail: user?.email,
    missionId,
    trigger,
    actions,
    status: 'running' as AgentStatus,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    executionHistory: [],
    successRate: 0,
    permissions,
    creditsNeeded,
    creditsPerRun: 1,
    executionsDone: 0,
    executionsTotal,
  }
}

export function suggestedAgentsForMission(goal: string): { title: string; description: string }[] {
  const lower = goal.toLowerCase()
  const suggestions: { title: string; description: string }[] = []
  if (/restaurant|food|menu|order|reservation/.test(lower)) {
    suggestions.push({ title: 'Weekly promotion poster', description: 'Every Friday at 10 AM post a weekly special to Facebook, Instagram, and X.' })
    suggestions.push({ title: 'Customer welcome email', description: 'When a new customer books a table send a welcome email.' })
    suggestions.push({ title: 'Uptime monitor', description: 'Every 5 minutes check the website and email me if it is down.' })
  }
  if (/store|shop|ecommerce|product|cart|checkout/.test(lower)) {
    suggestions.push({ title: 'New order summary', description: 'Every time a purchase is made send a Slack message and log it to Google Sheets.' })
    suggestions.push({ title: 'Abandoned cart reminder', description: 'Every evening email customers who left items in their cart.' })
  }
  if (/saas|dashboard|subscription|customer/.test(lower)) {
    suggestions.push({ title: 'Weekly MRR report', description: 'Every Monday summarize revenue and email the team.' })
    suggestions.push({ title: 'Churn alert', description: 'When a user cancels send a notification to Slack.' })
  }
  if (/portfolio|landing|blog|content|newsletter/.test(lower)) {
    suggestions.push({ title: 'Blog promotion', description: 'Every Tuesday publish a LinkedIn post linking to the latest article.' })
    suggestions.push({ title: 'Lead capture', description: 'When a contact form is submitted send an email and create a Notion page.' })
  }
  if (!suggestions.length) {
    suggestions.push({ title: 'Daily status report', description: 'Every morning at 8 AM email a summary of key metrics.' })
    suggestions.push({ title: 'Lead capture', description: 'When a contact form is submitted send an email and create a Notion page.' })
  }
  return suggestions.slice(0, 3)
}
