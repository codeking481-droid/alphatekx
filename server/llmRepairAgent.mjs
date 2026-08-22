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
const XAI_URL = 'https://api.x.ai/v1/chat/completions'
const REQUEST_TIMEOUT_MS = 45_000
const MAX_PATCH_CHARS = 40_000

// Keys are routed by PREFIX, not by variable name — deployments regularly put
// whatever provider key they have into GROQ_API_KEY:
//   xai-*  → xAI (Grok)      gsk_* → Groq      sk-* → OpenAI
function detectKeyFamily(key) {
  const k = String(key || '')
  if (k.startsWith('xai-')) return 'xai'
  if (k.startsWith('gsk_')) return 'groq'
  return 'openai'
}

function providerEndpoint(family) {
  if (family === 'xai') return XAI_URL
  if (family === 'groq') return GROQ_URL
  return OPENAI_URL
}

function providerDefaultModel(family) {
  if (family === 'xai') return process.env.XAI_MODEL || 'grok-3-mini'
  if (family === 'groq') return process.env.GROQ_BUILDER_MODEL || 'openai/gpt-oss-120b'
  return 'gpt-4o-mini'
}

let _lastLlmError = ''
export function llmLastError() { return _lastLlmError }

/**
 * Ordered chat attempts from whatever keys exist. The FIRST primary key wins;
 * OpenAI is appended as fallback when it is not already the primary.
 */
function buildChatAttempts() {
  const attempts = []
  const primary = [
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY_1,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
    process.env.GROQ_API_KEY_4,
  ].map(k => String(k || '').trim()).find(Boolean)

  if (primary) {
    const family = detectKeyFamily(primary)
    if (family === 'groq') {
      // Production Groq keys run openai/gpt-oss-120b (same model family as
      // alpha-core). Try it first, then safe fallbacks, so a decommissioned
      // or rate-limited model can never take AI repairs down.
      const candidates = [
        process.env.GROQ_BUILDER_MODEL || '',
        'openai/gpt-oss-120b',
        'llama-3.1-8b-instant',
      ].filter(Boolean)
      for (const model of [...new Set(candidates)]) {
        attempts.push({ url: GROQ_URL, key: primary, model, family })
      }
    } else {
      attempts.push({ url: providerEndpoint(family), key: primary, model: providerDefaultModel(family), family })
    }
  }

  for (const key of [process.env.OPENAI_API_KEY].map(k => String(k || '').trim()).filter(Boolean)) {
    if (key === primary) break
    attempts.push({ url: OPENAI_URL, key, model: 'gpt-4o-mini', family: 'openai' })
    break
  }
  return attempts
}

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
  return buildChatAttempts().length > 0
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
  const attempts = buildChatAttempts()
  if (!attempts.length) return null

  for (const attempt of attempts) {
    for (let tryIndex = 0; tryIndex < 2; tryIndex++) {
      try {
        const content = await callChatCompletion(attempt.url, attempt.key, attempt.model, system, user, maxTokens)
        const parsed = JSON.parse(content)
        if (parsed && typeof parsed === 'object') return parsed
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        _lastLlmError = `${attempt.family}/${attempt.model}: ${msg}`
        console.warn(`[LLM-REPAIR] ${attempt.model} attempt ${tryIndex + 1} failed:`, msg)
        // A rejected KEY can never succeed — abandon this provider entirely.
        if (/\bHTTP 40[13]\b|invalid_api_key|permission[- ]denied/i.test(msg)) { attempts.length = 0; break }
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
  // A patch that changes <script>/<style> open/close pairing leaves raw JS/CSS
  // bleeding into the document — reject those instead of shipping the damage.
  const structuralFingerprint = (s) =>
    `${(s.match(/<script\b/gi) || []).length}:${(s.match(/<\/script>/gi) || []).length}:` +
    `${(s.match(/<style\b/gi) || []).length}:${(s.match(/<\/style>/gi) || []).length}`

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
    const candidate = out.html.slice(0, first) + replace + out.html.slice(first + find.length)
    if (structuralFingerprint(candidate) !== structuralFingerprint(out.html)) {
      out.skipped++
      out.notes.push(`Patch rejected for ${r?.issue_id || '?'} — it would break <script>/<style> pairing`)
      continue
    }
    out.html = candidate
    out.applied++
    out.notes.push(`${r?.action || 'patch'} applied: ${clipNote(r?.explanation || '')}`)
  }
  return out
}

function clipNote(text) {
  const s = String(text || '').trim()
  return s.length > 140 ? s.slice(0, 140) + '…' : s
}

// ─── Full-page rebuild ───────────────────────────────────────────────────────
// For deliberately / heavily broken pages: ask the model to act as an expert
// web developer and regenerate ONE clean working HTML file from the wreckage.

export const REBUILD_SYSTEM_PROMPT = `You are an expert web developer fixing a deliberately broken website.

Your task:
1. Remove all intentional breakage (broken scripts, missing variables, syntax errors)
2. Create a clean, modern, responsive design
3. Use proper HTML5 semantic structure
4. Make the page functional and user-friendly
5. Keep the original content where it makes sense, but reorganize it logically
6. Fix all forms, buttons, and interactive elements
7. Replace broken images with placeholder content
8. Remove the chaos elements (marquee, blinking, absurd styling)

You are also a web restoration expert. Your job is to fix broken websites by understanding their content and rebuilding them properly.

Follow this process:

STEP 1 - CONTENT ANALYSIS:
- Read through the broken HTML to understand what content is actually there
- Identify: What is this page about? What information is it trying to convey?
- Extract meaningful text, images, and structure from the chaos

STEP 2 - CLEAN THE DATA:
- Remove all intentionally broken elements (marquee, blink, broken scripts, errors)
- Discard junk content (gibberish, repeated nonsense, broken images)
- Keep valuable content (headings, paragraphs, lists, forms, buttons)

STEP 3 - REBUILD WITH PURPOSE:
- Create a clean, semantic HTML5 structure
- Design a modern, responsive layout using CSS
- Make all interactive elements functional
- Use the extracted content in a logical flow

STEP 4 - PRESERVE INTENT:
- If the page was about food, make it a restaurant page
- If it had a contact form, make it work
- If it had a list, turn it into a proper feature list
- Keep the original colors/spirit if they made sense

Important: Every website is different. Don't use the same template for everything.
Look at what the content is trying to be and rebuild it appropriately.

The goal is to create a usable website that serves the same purpose as the original,
just without all the intentional breakage.

You are Alpha, an emergency website recovery system. Your mission is to restore crashed websites to full functionality.

RECOVERY PROCESS:

PHASE 1: TRIAGE
- Scan the broken HTML for surviving content
- Identify the site's purpose (business, blog, portfolio, e-commerce, etc.)
- Detect what's broken (scripts, forms, links, styling)

PHASE 2: RESCUE
- Extract ALL meaningful content (text, images, data)
- Preserve important information (contact details, products, services)
- Save functional elements (working links, forms, navigation)

PHASE 3: REBUILD
- Construct a clean HTML5 structure
- Apply modern, responsive design
- Restore all functionality (forms, buttons, interactivity)
- Recreate the brand identity (colors, fonts, style)

PHASE 4: DEPLOY
- Create a complete, production-ready HTML file
- Include all necessary CSS and JavaScript inline
- Ensure all features work (contact forms, navigation, etc.)

CRITICAL RULES:
- Never lose data - recover everything valuable
- Make it better than before - modern, faster, more accessible
- Preserve the original purpose and identity
- Keep it simple and reliable - no unnecessary complexity

The goal: Save businesses from losing their online presence.

Output rules:
- Output a single, complete, working HTML file.
- Return RAW HTML only — no markdown fences, no commentary before or after.
- The document MUST start with <!DOCTYPE html> and contain <head> and <body>.
- Keep every real text section from the original page; drop only the damage.
- All CSS goes in one <style> block in <head>; all JS in one deferred <script> at the end of <body>. No external dependencies.

# ALPHA RESTORATION SYSTEM PROMPT

You are Alpha, a professional website restoration service. Your mission is to take broken, chaotic HTML and restore it to a fully functional, modern, professional website.

## RESTORATION PHILOSOPHY

"Restoration" means:
1. **PRESERVE** - Keep all meaningful content (text, products, services, contact info)
2. **REBUILD** - Create a clean, semantic HTML5 structure from scratch
3. **DESIGN** - Apply modern, professional styling that fits the content
4. **FUNCTION** - Make everything work (forms, buttons, navigation)
5. **IMPROVE** - Make it better than the original (faster, more accessible, responsive)

## RESTORATION PROCESS

### STEP 1: ANALYZE THE BROKEN SITE
Read the entire HTML and identify:
- What is the site's PURPOSE? (Restaurant? Store? Blog? Portfolio? Business?)
- What CONTENT can be saved? (Text, images, products, services)
- What's the BRAND IDENTITY? (Colors, name, style)
- What FUNCTIONALITY should work? (Forms, buttons, links)

### STEP 2: EXTRACT ALL MEANINGFUL CONTENT
Extract and organize:
- Site name and tagline
- All headings and paragraphs
- Product/service lists with prices if available
- Contact information (email, phone, address)
- Menu items, descriptions, prices
- Any images (use placeholders if missing)
- Form fields and their purposes

### STEP 3: DETERMINE THE SITE TYPE
Based on content, identify:
- Is this a RESTAURANT? → Restaurant template
- Is this a STORE? → E-commerce template
- Is this a PORTFOLIO? → Portfolio template
- Is this a BUSINESS? → Corporate template
- Is this a BLOG? → Blog template
- Is this a SERVICE? → Service page template

### STEP 4: BUILD THE RESTORED SITE
Create a complete HTML file with:

#### STRUCTURE
- Proper doctype declaration
- Clean HTML5 semantic elements (header, main, section, footer)
- Logical content flow
- Accessibility attributes (aria labels)

#### DESIGN
- Modern, professional styling
- Responsive (works on all devices)
- Color scheme that matches the content (warm colors for restaurants, professional for business)
- Good typography (clean fonts, proper hierarchy)
- Spacing and layout that's pleasing

#### FUNCTIONALITY
- Working forms with proper validation
- Interactive buttons that do something useful
- Navigation that works
- Clean JavaScript (no errors)

### STEP 5: PRESERVE BRAND IDENTITY
- Keep the original business name
- Use colors that match the brand (or choose appropriate ones)
- Maintain the original tone and voice
- Keep all important content

## QUALITY STANDARDS

Your restored site MUST:
1. **Work perfectly** - No broken features, no JavaScript errors
2. **Look professional** - Clean design, good colors, proper spacing
3. **Be responsive** - Works on mobile, tablet, desktop
4. **Preserve content** - All meaningful text is kept
5. **Be accessible** - Proper HTML semantics, aria labels
6. **Load fast** - Clean code, no unnecessary cruft

## CRITICAL RULES

1. **NEVER lose important content** - Always preserve meaningful text
2. **NEVER keep broken code** - Remove all intentional errors
3. **ALWAYS make forms work** - Forms should actually submit/validate
4. **ALWAYS be professional** - No chaos, no gimmicks
5. **ALWAYS improve** - Make it better than the original

## REMEMBER

You are not just "fixing" code — you are RESTORING a website to full functionality.
Think like a master craftsman who takes a broken piece and makes it beautiful and
functional again. Every site is unique, and every restoration should respect the
original purpose while making it better.`

/**
 * Plain-text chat used by the rebuild pass. Same provider rotation as
 * repairChat (Groq primary → OpenAI fallback, two attempts each) but WITHOUT
 * JSON response mode — we want raw HTML back.
 */
async function chatText(system, user, { maxTokens = 8000 } = {}) {
  const attempts = buildChatAttempts()
  if (!attempts.length) return null
  const debug = /^1|true|yes$/i.test(String(process.env.REBUILD_DEBUG || ''))
  if (debug) {
    console.log(`🔍 [LLM-DEBUG] ${attempts.length} attempt(s) queued:`)
    for (const a of attempts) console.log(`   → ${a.family} | ${a.model} | ${a.url}`)
    console.log(`🔍 [LLM-DEBUG] system prompt: ${(system.length / 1024).toFixed(1)} KB | user msg: ${(user.length / 1024).toFixed(1)} KB | maxTokens: ${maxTokens}`)
    console.log('🔍 [LLM-DEBUG] system prompt head:', JSON.stringify(system.slice(0, 300)))
  }
  for (const attempt of attempts) {
    for (let tryIndex = 0; tryIndex < 2; tryIndex++) {
      try {
        const content = await callChatCompletionRaw(attempt.url, attempt.key, attempt.model, system, user, maxTokens)
        if (content && String(content).trim()) {
          if (debug) {
            console.log(`🔍 [LLM-DEBUG] response from ${attempt.family}/${attempt.model}: ${(content.length / 1024).toFixed(1)} KB`)
            console.log('🔍 [LLM-DEBUG] response head:', JSON.stringify(content.slice(0, 400)))
            console.log('🔍 [LLM-DEBUG] response tail:', JSON.stringify(content.slice(-200)))
          }
          return String(content).trim()
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        _lastLlmError = `${attempt.family}/${attempt.model}: ${msg}`
        console.warn(`[LLM-REBUILD] ${attempt.model} attempt ${tryIndex + 1} failed:`, msg)
        // A rejected KEY can never succeed — abandon this provider entirely.
        if (/\bHTTP 40[13]\b|invalid_api_key|permission[- ]denied/i.test(msg)) { attempts.length = 0; break }
        await new Promise(r => setTimeout(r, 800 * (tryIndex + 1)))
      }
    }
  }
  return null
}

/** callChatCompletion twin without response_format — returns raw text. */
async function callChatCompletionRaw(url, apiKey, model, system, user, maxTokens) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS * 2)
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
        temperature: 0.2,
        max_tokens: maxTokens,
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

/** Strip markdown fences and sanity-check that the model returned a full document. */
function extractHtmlDocument(text) {
  let t = String(text || '').trim()
  t = t.replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/, '').trim()
  // Some models prepend a sentence — snap to the doctype/html open if present.
  const docIdx = Math.min(
    ...['<!doctype', '<html'].map((needle) => {
      const i = t.toLowerCase().indexOf(needle)
      return i === -1 ? Number.MAX_SAFE_INTEGER : i
    }),
  )
  if (docIdx !== Number.MAX_SAFE_INTEGER && docIdx > 0 && docIdx < 400) t = t.slice(docIdx)
  const looksLikeDoc = /<!doctype\s+html/i.test(t) || /<html[\s>]/i.test(t)
  if (!looksLikeDoc || t.length < 500) return null
  return t
}

/**
 * Regenerate an entire damaged page as one clean, modern, working HTML file.
 * NEVER throws — any failure falls back to the input HTML untouched.
 * @param {{html:string, hostname?:string, url?:string}} input
 * @returns {Promise<{configured:boolean, attempted:boolean, rebuilt:boolean, html:string, notes:string[]}>}
 */
export async function llmRebuildPage(input = {}) {
  const { html = '', hostname = '', url = '' } = input
  const out = { configured: isLlmRepairConfigured(), attempted: false, rebuilt: false, html, notes: [] }

  if (!out.configured) {
    out.notes.push('No AI provider key configured — rebuild skipped.')
    return out
  }
  if (!String(html).trim()) {
    out.notes.push('Empty input — rebuild skipped.')
    return out
  }

  let source = String(html)
  if (source.length > 60_000) source = source.slice(0, 60_000)

  out.attempted = true
  console.log(`🔧 [REBUILD] Expert developer pass starting — input ${(source.length / 1024).toFixed(1)} KB`)
  // Groq free tiers enforce small per-minute token budgets. Budget the
  // completion allowance so prompt + max_tokens stays inside ~7.3K tokens,
  // then SHRINK the page payload and retry if the provider still says 413.
  const estTokens = (s) => Math.ceil(String(s).length / 4)
  let answer = null
  let lastFail = ''
  for (const fraction of [1, 0.5, 0.25]) {
    const sliced = fraction === 1 ? source : source.slice(0, Math.max(2_000, Math.floor(source.length * fraction)))
    const truncNote = fraction === 1 ? '' : '\n\n(Page truncated — restore what is provided.)'
    const user = `Site: ${hostname || '(unknown host)'}${url ? `\nURL: ${url}` : ''}\n\nCurrent page source:\n${sliced}${truncNote}\n\nReturn the complete fixed HTML file now.`
    const maxTokens = Math.max(800, Math.min(12_000, 7_300 - estTokens(REBUILD_SYSTEM_PROMPT) - estTokens(user)))
    console.log(`📤 [REBUILD] Sending to LLM — ${(sliced.length / 1024).toFixed(1)} KB page, ${maxTokens} max tokens…`)
    answer = await chatText(REBUILD_SYSTEM_PROMPT, user, { maxTokens })
    if (answer) break
    lastFail = llmLastError()
    // Only a size/rate problem benefits from shrinking — anything else stops.
    if (!/HTTP 41[33]|tokens per minute|too large|rate limit/i.test(lastFail)) break
    console.log(`⚠️ [REBUILD] Payload rejected (${lastFail.slice(0, 140)}) — shrinking and retrying…`)
  }
  if (!answer) {
    out.notes.push(`AI providers unavailable (${lastFail || llmLastError() || 'unknown error'}) — continuing without rebuild.`)
    console.log(`❌ [REBUILD] No usable response — ${lastFail || llmLastError() || 'unknown error'}`)
    return out
  }
  console.log(`📥 [REBUILD] Response received — ${(answer.length / 1024).toFixed(1)} KB`)

  const cleaned = extractHtmlDocument(answer)
  if (!cleaned) {
    out.notes.push('Model output was not a complete HTML document — discarded.')
    return out
  }

  out.html = cleaned
  out.rebuilt = true
  out.notes.push('Clean expert rebuild generated.')
  return out
}
