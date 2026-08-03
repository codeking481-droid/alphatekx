/**
 * Generate one high-quality social post via Groq.
 * Used by MatureAutomationWizard one-by-one generation loop.
 */
export default async function handler(req, res, deps = {}) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  try {
    const body = deps.body || req.alphaBody || {}
    const topic = String(body.topic || '').trim()
    const goal = String(body.goal || 'Engage audience').trim()
    const audience = String(body.audience || 'General audience').trim()
    const tone = String(body.tone || 'Professional').trim()
    const length = ['short', 'medium', 'long'].includes(body.length) ? body.length : 'medium'
    const platform = String(body.platform || 'linkedin').trim()
    const dayIndex = Number(body.dayIndex || body.index || 1)

    if (!topic) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Topic is required' }))
      return
    }

    const wordRule =
      length === 'short'
        ? 'EXACTLY 30-60 words. 2 punchy sentences + clear CTA.'
        : length === 'long'
          ? 'EXACTLY 150-250 words. Mature long write-up: hook + story + deep value + CTA. Not 2 lines.'
          : 'EXACTLY 80-120 words. Hook + 2 value points + CTA across 3 short paragraphs.'

    const maxTokens = length === 'long' ? 700 : length === 'medium' ? 400 : 220
    const system = `You are AlphaTekX, a world-class viral content writer for African and global audiences (Africa/Lagos timezone). ${wordRule} Count words carefully. No placeholders. No lorem ipsum. No markdown headings. Write ready-to-publish social copy only.`
    const user = `Write post #${dayIndex} for ${platform}.
Topic: ${topic}
Goal: ${goal}
Audience: ${audience}
Tone: ${tone}
Rules: ${wordRule}
Make this post unique from other days. Specific, useful, human. Africa/Lagos friendly language when natural.`

    let content = ''
    const callLLM = deps.callProvider
    if (typeof callLLM === 'function') {
      try {
        const result = await callLLM(
          'groq',
          [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          false,
          false,
          maxTokens,
          process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        )
        content = String(result?.data?.choices?.[0]?.message?.content || '').trim()
      } catch (err) {
        // fallback to direct fetch if callProvider fails
        content = await directGroq(system, user, maxTokens)
      }
    } else {
      content = await directGroq(system, user, maxTokens)
    }

    let wordCount = content.split(/\s+/).filter(Boolean).length
    const outOfRange =
      (length === 'short' && (wordCount < 25 || wordCount > 65)) ||
      (length === 'medium' && (wordCount < 80 || wordCount > 120)) ||
      (length === 'long' && wordCount < 140)

    if (outOfRange && content) {
      try {
        const fixPrompt = `Rewrite this post to be ${wordRule} Current word count: ${wordCount}. Keep the same idea and tone. Output only the rewritten post.\n\n${content}`
        if (typeof callLLM === 'function') {
          const fix = await callLLM(
            'groq',
            [{ role: 'user', content: fixPrompt }],
            false,
            false,
            maxTokens,
            process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
          )
          content = String(fix?.data?.choices?.[0]?.message?.content || content).trim()
        } else {
          content = await directGroq('Rewrite exactly to target length.', fixPrompt, maxTokens)
        }
        wordCount = content.split(/\s+/).filter(Boolean).length
      } catch {
        // keep original if rewrite fails
      }
    }

    if (!content || content.length < 20) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Empty generation from model' }))
      return
    }

    // Unique Pollination image URL for this post
    const styles = [
      'dark mode SaaS, neon blue glow, premium',
      'light mode, clean white, subtle gradient, professional',
      'abstract 3D, isometric, modern tech, vibrant',
    ]
    const style = styles[Math.floor(Math.random() * styles.length)]
    const seed = Math.floor(Math.random() * 9999999)
    const prompt = `${topic}, unique angle day ${dayIndex}, premium LinkedIn SaaS visual, ultra detailed 4k, cinematic lighting, modern SaaS gradient background (dark blue to electric blue), minimalist professional style, abstract tech elements, 2026 design trend, ${style}, no stock photo, no blurry, no watermark, no text, no words, no low quality, no cartoon, no old design`
    const imgPrompt = encodeURIComponent(prompt)
    const imageUrl = `https://gen.pollinations.ai/image/${imgPrompt}?model=flux&width=1200&height=628&enhance=true&nologo=true&seed=${seed}&t=${Date.now()}`

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        content,
        wordCount,
        target: length,
        imageUrl,
        seed,
        dayIndex,
        platform,
      }),
    )
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: err?.message || 'Generation failed' }))
  }
}

async function directGroq(system, user, maxTokens) {
  const key = process.env.GROQ_API_KEY || process.env.GROQ_API_KEY_1 || ''
  if (!key) throw new Error('GROQ_API_KEY not configured')
  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.85,
      max_tokens: maxTokens,
    }),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Groq error ${response.status}: ${text.slice(0, 200)}`)
  }
  const data = await response.json()
  return String(data?.choices?.[0]?.message?.content || '').trim()
}