import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

function getProviderKey(name) {
  if (name === 'pollinations') return 'pollinations'
  return process.env[`${name.toUpperCase()}_API_KEY`] || process.env[`${name.toUpperCase()}_API_KEY_1`] || ''
}

async function callLLM(messages) {
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
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
      if (!res.ok) continue
      const data = await res.json()
      const content = String(data.choices?.[0]?.message?.content || '').trim()
      if (content) return content
    } catch { continue }
  }
  return null
}

export default async function handler(req, res) {
  const origin = req.headers.origin || ''
  const allowedOrigins = ['https://alphatekx.name.ng', 'https://www.alphatekx.name.ng', 'http://localhost:5173', 'http://localhost:3001']
  if (allowedOrigins.includes(origin) || origin.endsWith('.alphatekx.name.ng')) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const { planId, editedContent, platform, runNumber } = body
    if (!planId || !editedContent) return res.status(400).json({ error: 'planId and editedContent required' })

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { data: plan, error: planError } = await supabase
      .from('automation_plans')
      .select('*')
      .eq('id', planId)
      .single()

    if (planError || !plan) return res.status(404).json({ error: 'Plan not found' })

    const posts = [...(plan.posts || [])]
    const totalRuns = plan.total_runs

    // Update the edited run's content
    if (runNumber && posts[runNumber - 1]) {
      const targetPlatform = platform || plan.platforms?.[0] || 'linkedin'
      if (!posts[runNumber - 1].perPlatformContent) posts[runNumber - 1].perPlatformContent = {}
      posts[runNumber - 1].perPlatformContent[targetPlatform] = {
        ...posts[runNumber - 1].perPlatformContent[targetPlatform],
        content: editedContent,
      }
    }

    // Rewrite remaining hidden posts to match style
    const remainingPosts = posts.filter(p => p.runNumber > (runNumber || 1))
    let rewrittenCount = 0

    for (const post of remainingPosts) {
      for (const plat of Object.keys(post.perPlatformContent || {})) {
        const existingContent = post.perPlatformContent[plat]?.content || ''
        if (!existingContent) continue

        const systemPrompt = 'You are AlphaTekX style learner. Rewrite the following post to match the tone, style, and voice of the example provided. Keep the original topic and key information but adapt the writing style to match the example.'
        const userPrompt = `Example style:\n"""\n${editedContent}\n"""\n\nOriginal post to rewrite:\n"""\n${existingContent}\n"""\n\nReturn ONLY the rewritten content, no explanation.`

        try {
          const rewritten = await callLLM([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ])
          if (rewritten && rewritten.length > 10) {
            post.perPlatformContent[plat].content = rewritten
            rewrittenCount++
          }
        } catch { continue }
      }
    }

    // Save updated posts
    await supabase
      .from('automation_plans')
      .update({ posts, updated_at: new Date().toISOString() })
      .eq('id', planId)

    return res.status(200).json({
      success: true,
      rewrittenCount,
      totalHidden: remainingPosts.length,
    })
  } catch (error) {
    console.error('[Learn] Error:', error)
    return res.status(500).json({ error: error.message })
  }
}