import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

function calculateTotalRuns(schedule) {
  const { startDate, time, frequency, duration, untilDate, weeklyDays } = schedule
  let start = new Date()
  if (startDate === 'tomorrow') start.setDate(start.getDate() + 1)
  else if (startDate && startDate !== 'today') start = new Date(startDate)

  const [h, m] = (time || '09:00').split(':').map(Number)
  start.setHours(h || 9, m || 0, 0, 0)

  let end
  if (duration === 'forever') return 30
  if (duration === 'untilDate' && untilDate) end = new Date(untilDate)
  else {
    const daysMap = { '7days': 7, '14days': 14, '30days': 30, '60days': 60, '90days': 90 }
    const days = daysMap[duration] || 30
    end = new Date(start.getTime() + days * 86400000)
  }

  const totalDays = Math.ceil((end.getTime() - start.getTime()) / 86400000)
  if (totalDays <= 0) return 1

  switch (frequency) {
    case 'daily': return totalDays
    case 'every2hours': return Math.ceil(totalDays * 12)
    case 'every6hours': return Math.ceil(totalDays * 4)
    case 'weekly': {
      if (weeklyDays && weeklyDays.length > 0) {
        let count = 0
        let cur = new Date(start)
        while (cur < end) {
          const d = cur.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase().slice(0, 3)
          if (weeklyDays.includes(d)) count++
          cur.setDate(cur.getDate() + 1)
        }
        return count || Math.ceil(totalDays / 7)
      }
      return Math.ceil(totalDays / 7)
    }
    default: return totalDays
  }
}

const PLATFORM_CREDITS = {
  linkedin: 5, gmail: 2, calendar: 1, instagram: 4, twitter: 3,
  youtube: 5, telegram: 2, outlook: 2, slack: 2, notion: 2,
}

function calculateCredits(platforms, runs) {
  let perRun = 0
  for (const p of platforms) perRun += PLATFORM_CREDITS[p.toLowerCase()] || 2
  return perRun * runs
}

function getProviderKey(name) {
  if (name === 'pollinations') return 'pollinations'
  const key = process.env[`${name.toUpperCase()}_API_KEY`] || process.env[`${name.toUpperCase()}_API_KEY_1`] || ''
  return key
}

async function callLLM(messages, jsonMode = false) {
  const providers = ['groq', 'openai', 'qwen', 'kimi', 'minimax', 'flatkey']
  for (const name of providers) {
    const key = getProviderKey(name)
    if (!key) continue
    try {
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }
      let url, body
      if (name === 'groq') {
        url = 'https://api.groq.com/openai/v1/chat/completions'
        body = { model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant', messages, temperature: 0.7, max_tokens: 2000 }
      } else if (name === 'openai') {
        url = 'https://api.openai.com/v1/chat/completions'
        body = { model: process.env.OPENAI_MODEL || 'gpt-4o-mini', messages, temperature: 0.7, max_completion_tokens: 2000 }
      } else continue
      if (jsonMode) body.response_format = { type: 'json_object' }
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
      if (!res.ok) continue
      const data = await res.json()
      const content = String(data.choices?.[0]?.message?.content || '').trim()
      if (content) return { provider: name, content }
    } catch { continue }
  }
  throw new Error('No AI provider available')
}

async function generateContent(platform, runNumber, rules, task) {
  const tone = rules.tone || 'professional'
  const topics = Array.isArray(rules.topics) ? rules.topics.join(', ') : 'general'
  const length = rules.postLength || 'medium'
  const lengthMap = { short: '150', medium: '300', long: '600+', 'viral long-form': '1000+' }
  const wordCount = lengthMap[length] || '300'
  const language = rules.language || 'English'
  const cta = rules.cta || ''

  let prompt
  if (platform === 'linkedin') {
    prompt = `Write day ${runNumber} LinkedIn post. Tone: ${tone}. Topics: ${topics}. Length: ${wordCount} words. Language: ${language}. CTA: ${cta}. Task: ${task}. Make it viral quality, no placeholders, no hashtags. Return ONLY the post text.`
  } else if (platform === 'gmail') {
    const action = rules.action || 'auto-reply'
    const replyTone = rules.replyTone || 'professional'
    prompt = `Write day ${runNumber} Gmail ${action}. Tone: ${replyTone}. Topics: ${topics}. Task: ${task}. Make it professional, no placeholders. Return ONLY the email text.`
  } else if (platform === 'twitter' || platform === 'x') {
    prompt = `Write day ${runNumber} X/Twitter post. Tone: ${tone}. Topics: ${topics}. Max 280 chars. Language: ${language}. Task: ${task}. Return ONLY the post text.`
  } else if (platform === 'instagram') {
    prompt = `Write day ${runNumber} Instagram caption. Tone: ${tone}. Topics: ${topics}. Length: ${wordCount} chars. Language: ${language}. Task: ${task}. Return ONLY the caption.`
  } else if (platform === 'telegram') {
    prompt = `Write day ${runNumber} Telegram message. Tone: ${tone}. Topics: ${topics}. Task: ${task}. Return ONLY the message text.`
  } else if (platform === 'slack') {
    prompt = `Write day ${runNumber} Slack message. Tone: ${tone}. Topics: ${topics}. Task: ${task}. Return ONLY the message text.`
  } else if (platform === 'youtube') {
    prompt = `Write day ${runNumber} YouTube video script/description. Tone: ${tone}. Topics: ${topics}. Task: ${task}. Return ONLY the script.`
  } else if (platform === 'notion') {
    prompt = `Write day ${runNumber} Notion page content. Tone: ${tone}. Topics: ${topics}. Task: ${task}. Return ONLY the content.`
  } else if (platform === 'outlook') {
    prompt = `Write day ${runNumber} Outlook email. Tone: ${tone}. Topics: ${topics}. Task: ${task}. Return ONLY the email text.`
  } else if (platform === 'calendar') {
    prompt = `Write day ${runNumber} Calendar briefing. Task: ${task}. Return ONLY the briefing text.`
  } else {
    prompt = `Write day ${runNumber} content for ${platform}. Tone: ${tone}. Topics: ${topics}. Task: ${task}. Return ONLY the content.`
  }

  try {
    const result = await callLLM([{ role: 'system', content: 'You are AlphaTekX content generator. Generate high-quality, original content. No placeholders, no filler.' }, { role: 'user', content: prompt }])
    return result.content
  } catch {
    return `Day ${runNumber} ${platform} post: ${task} - [Auto-generated by AlphaTekX]`
  }
}

function generateImagePrompt(platform, content, runNumber) {
  const clean = content.replace(/[^a-zA-Z0-9\s]/g, '').slice(0, 100)
  return `Professional ${platform} post illustration: ${clean} - style modern, clean, ${runNumber}`
}

export default async function handler(req, res) {
  // CORS
  const origin = req.headers.origin || ''
  const allowedOrigins = ['https://alphatekx.name.ng', 'https://www.alphatekx.name.ng', 'http://localhost:5173', 'http://localhost:3001']
  if (allowedOrigins.includes(origin) || origin.endsWith('.alphatekx.name.ng')) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const { platforms, task, schedule, contentRulesPerPlatform, safety, userId } = body

    if (!platforms || !platforms.length) return res.status(400).json({ error: 'Platforms required' })
    if (!schedule) return res.status(400).json({ error: 'Schedule required' })

    const totalRuns = calculateTotalRuns(schedule)
    const totalCredits = calculateCredits(platforms, totalRuns)

    // Create plan in DB
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { data: plan, error: planError } = await supabase
      .from('automation_plans')
      .insert({
        user_id: userId,
        platforms,
        task: task || '',
        schedule,
        content_rules: contentRulesPerPlatform || {},
        safety: safety || {},
        total_credits: totalCredits,
        total_runs: totalRuns,
        status: 'generating',
        progress: 0,
        current_run: 0,
        posts: [],
      })
      .select()
      .single()

    if (planError) return res.status(500).json({ error: planError.message })
    if (!plan) return res.status(500).json({ error: 'Failed to create plan' })

    const planId = plan.id
    const posts = []

    // Generate content for each run
    for (let i = 1; i <= totalRuns; i++) {
      const perPlatformContent = {}

      for (const platform of platforms) {
        const rules = contentRulesPerPlatform?.[platform] || {}
        const content = await generateContent(platform, i, rules, task)
        const imagePrompt = generateImagePrompt(platform, content, i)
        const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?width=1024&height=1024&seed=${i}`

        perPlatformContent[platform] = {
          content,
          imageUrl: rules.includeImage !== 'no' ? imageUrl : null,
          imagePrompt,
        }
      }

      const post = {
        runNumber: i,
        date: new Date(Date.now() + (i - 1) * 86400000).toISOString(),
        perPlatformContent,
        status: 'hidden',
      }
      posts.push(post)

      // Update progress
      const percent = Math.round((i / totalRuns) * 100)
      await supabase
        .from('automation_plans')
        .update({ progress: percent, current_run: i, posts, updated_at: new Date().toISOString() })
        .eq('id', planId)
    }

    // Mark as ready
    await supabase
      .from('automation_plans')
      .update({ status: 'ready_for_confirmation', progress: 100, posts, updated_at: new Date().toISOString() })
      .eq('id', planId)

    return res.status(200).json({
      planId,
      totalRuns,
      totalCredits,
      status: 'ready_for_confirmation',
    })
  } catch (error) {
    console.error('[Agent Generate] Error:', error)
    return res.status(500).json({ error: error.message || 'Generation failed' })
  }
}