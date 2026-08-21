/**
 * ALPHATEKX LLM REPAIR AGENT — real intelligence inside the restoration loop.
 *
 * Rule-based fixes handle the mechanical damage. This agent handles the damage
 * rules can't touch: inline scripts that crash at runtime, blank-rendering
 * pages, and broken asset references that need judgement, not regex.
 *
 * Design guarantees ("no errors" contract):
 *   - Never throws into the pipeline: every failure degrades gracefully to
 *     rule-only mode and reports what happened.
 *   - The model NEVER rewrites the whole document. It returns bounded
 *     find→replace patches which are applied only on an exact, unique match.
 *   - Output is validated (JSON envelope, size caps) before anything touches
 *     the HTML.
 */

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
const REQUEST_TIMEOUT_MS = 45_000
const MAX_PATCH_CHARS = 40_000

function groqKeys() {
  return [
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY_1,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
    process.env.GROQ_API_KEY_4,
  ].map(k => String(k || '').trim()).filter(Boolean)
}

function openaiKeys() {
  return [process.env.OPENAI_API_KEY].map(k => String(k || '').trim()).filter(Boolean)
}

export function isLlmRepairConfigured() {
  return groqKeys().length > 0 || openaiKeys().length > 0
}

async function callChatCompletion(url, apiKey, model, system, user, maxTokens) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.1,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content
    if (!content) throw new Error('Empty completion')
    return content
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Ask the repair model a question expecting a JSON-object answer.
 * Provider order: Groq (fast, primary) → OpenAI (fallback). Two attempts each.
 * Returns parsed JSON object or null when every provider fails.
 */
export async function repairChat(system, user, { maxTokens = 4000 } = {}) {
  const attempts = []
  for (const key of groqKeys()) {
    attempts.push({ url: GROQ_URL, key, model: process.env.GROQ_BUILDER_MODEL || 'llama-3.3-70b-versatile' })
    break // one Groq key is enough; rotate only on failure below
  }
  for (const key of openaiKeys()) {
    attempts.push({ url: OPENAI_URL, key, model: 'gpt-4o-mini' })
    break
  }
  if (!attempts.length) return null

  for (const attempt of attempts) {
    for (let tryIndex = 0; tryIndex < 2; tryIndex++) {
      try {
        const content = await callChatCompletion(attempt.url, attempt.key, attempt.model, system, user, maxTokens)
        const parsed = JSON.parse(content)
        if (parsed && typeof parsed === 'object') return parsed
      } catch (err) {
        console.warn(`[LLM-REPAIR] ${attempt.model} attempt ${tryIndex + 1} failed:`, err instanceof Error ? err.message : err)
        await new Promise(r => setTimeout(r, 800 * (tryIndex + 1)))
      }
    }
  }
  return null
}

// ─── Context extraction ──────────────────────────────────────────────────────

/** Pull the <script>/<style> blocks most relevant to the reported damage. */
function extractRelevantBlocks(html, issueTexts) {
  const needles = issueTexts.map(t => String(t || '').toLowerCase()).filter(t => t.length > 8)
  const blocks = []
  const blockRe = /<(script|style)\b[^>]*>([\s\S]*?)<\/\1>/gi
  let m
  while ((m = blockRe.exec(html)) && blocks.length < 6) {
    const full = m[0]
    const lower = `${m[1]} ${m[2]}`.toLowerCase()
    const relevant = needles.some(n => lower.includes(n.slice(0, 60)))
    // Inline scripts are prime suspects for runtime crashes.
    const inlineScript = m[1].toLowerCase() === 'script' && !/\ssrc\s*=/i.test(full.slice(0, full.indexOf('>')))
    if (relevant || inlineScript) {
      blocks.push({ tag: m[1], start: m.index, end: m.index + full.length, text: full.slice(0, 6000) })
    }
  }
  return blocks
}

// ─── Batch repair ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the AlphaTekX Repair Agent, an elite web-restoration engineer.
You receive an HTML document excerpt plus a list of diagnosed runtime issues (JavaScript console errors, uncaught exceptions, failed subresources, blank renders).
Return STRICT JSON only, shaped exactly:
{"repairs":[{"issue_id":"...","action":"rewrite_block|remove_block|patch_html","find":"<exact substring from the document>","replace":"<corrected replacement>","explanation":"one sentence"}]}
Rules:
- "find" MUST be copied character-for-character from the provided document excerpt and MUST be unique in it. Keep "find" as short as possible while staying unique.
- "rewrite_block": replace a whole <script> or <style> block's contents with working code. Include the full block tags in find and replace.
- "remove_block": delete a hopelessly broken external script/style reference or dead code block. replace must be "".
- "patch_html": small surgical HTML fix.
- Never invent URLs, never add analytics or trackers, never change the site's design or copy.
- If an issue cannot be safely fixed, omit it from repairs.
- Maximum 8 repairs. If nothing is safe, return {"repairs":[]}.`

/**
 * Attempt AI repairs for issues rules could not fix.
 * @param {{html:string, issues:Array<{id,type,severity,description,before,fix}>, hostname:string}} input
 * @returns {Promise<{configured:boolean, attempted:boolean, applied:number, skipped:number, notes:string[], html:string}>}
 */
export async function llmRepairBatch(input) {
  const { html, issues, hostname = '' } = input
  const out = { configured: isLlmRepairConfigured(), attempted: false, applied: 0, skipped: 0, notes: [], html }

  if (!out.configured) {
    out.notes.push('No AI provider key configured — rule-based repairs only.')
    return out
  }
  if (!issues.length) return out

  const evidence = issues.slice(0, 8).map((i) =>
    `- [${i.id}] (${i.severity}) ${i.type}: ${i.description}${i.before ? ` | context: ${String(i.before).slice(0, 160)}` : ''}`
  ).join('\n')

  const blocks = extractRelevantBlocks(html, issues.flatMap(i => [i.description, i.before]))
  const docExcerptParts = []
  if (blocks.length) {
    docExcerptParts.push(...blocks.map(b => b.text))
  } else {
    docExcerptParts.push(html.slice(0, 24_000))
  }
  let docExcerpt = docExcerptParts.join('\n<!-- ---- -->\n')
  if (docExcerpt.length > 60_000) docExcerpt = docExcerpt.slice(0, 60_000)

  const user = `Site: ${hostname || '(unknown host)'}\n\nDiagnosed issues:\n${evidence}\n\nDocument excerpt:\n\`\`\`\n${docExcerpt}\n\`\`\`\n\nReturn the JSON repairs now.`

  out.attempted = true
  const answer = await repairChat(SYSTEM_PROMPT, user, { maxTokens: 6000 })
  if (!answer) {
    out.notes.push('AI providers unavailable — continuing without AI repairs.')
    return out
  }

  const repairs = Array.isArray(answer.repairs) ? answer.repairs.slice(0, 8) : []
  for (const r of repairs) {
    const find = typeof r?.find === 'string' ? r.find : ''
    const replace = typeof r?.replace === 'string' ? r.replace : ''
    if (!find || find.length > MAX_PATCH_CHARS || replace.length > MAX_PATCH_CHARS) {
      out.skipped++
      out.notes.push(`Skipped oversized patch for ${r?.issue_id || '?'}`)
      continue
    }
    const first = out.html.indexOf(find)
    if (first === -1) {
      out.skipped++
      out.notes.push(`Patch anchor not found for ${r?.issue_id || '?'} — skipped safely`)
      continue
    }
    if (out.html.indexOf(find, first + 1) !== -1) {
      out.skipped++
      out.notes.push(`Patch anchor not unique for ${r?.issue_id || '?'} — skipped safely`)
      continue
    }
    out.html = out.html.slice(0, first) + replace + out.html.slice(first + find.length)
    out.applied++
    out.notes.push(`${r?.action || 'patch'} applied: ${clipNote(r?.explanation || '')}`)
  }
  return out
}

function clipNote(text) {
  const s = String(text || '').trim()
  return s.length > 140 ? s.slice(0, 140) + '…' : s
}
