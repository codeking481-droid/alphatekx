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

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
const XAI_URL = 'https://api.x.ai/v1/chat/completions'
const REQUEST_TIMEOUT_MS = 45_000
const MAX_PATCH_CHARS = 40_000

/**
 * Every slot that may hold a provider key. Groq slots come first because the
 * product is designed around free-tier Groq rotation: when one key's rate
 * budget is exhausted the next takes over seamlessly, and dedicated
 * xAI/OpenAI slots act as the final safety net.
 */
const KEY_SLOT_NAMES = [
  'GROQ_API_KEY',
  'GROQ_API_KEY_1',
  'GROQ_API_KEY_2',
  'GROQ_API_KEY_3',
  'GROQ_API_KEY_4',
  'XAI_API_KEY',
  'XAI_API_KEY_1',
  'OPENAI_API_KEY',
  'OPENAI_API_KEY_1',
]

// Keys are routed by PREFIX, not by variable name — deployments regularly put
// whatever provider key they have into GROQ_API_KEY:
//   xai-*  → xAI (Grok)      gsk_* → Groq      sk-* → OpenAI
function detectKeyFamily(key) {
  const k = String(key || '').trim()
  if (k.startsWith('xai-')) return 'xai'
  if (k.startsWith('gsk_')) return 'groq'
  if (k.startsWith('sk-')) return 'openai'
  // Unknown prefix: assume Groq — that is what deployments overwhelmingly
  // store here, and a wrong guess degrades to a logged HTTP rejection while
  // the next candidate takes over.
  return 'groq'
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

/** A key that can never succeed — drop it and keep rotating through the rest. */
function isKeyRejected(msg) {
  return /\bHTTP 40[13]\b|invalid_api_key|permission[- ]denied/i.test(String(msg || ''))
}

/** This key's budget is gone for now — hand off to the next slot instantly. */
function isRateLimited(msg) {
  return /\bHTTP 429\b|\bHTTP 413\b|tokens per minute|tokens per day|rate limit|too large|quota/i.test(String(msg || ''))
}

/** A decommissioned/unavailable model — retrying it can only waste time. */
function isModelMissing(msg) {
  return /model_not_found|model not found|does not exist|\bHTTP 404\b/i.test(String(msg || ''))
}

/**
 * Ordered chat attempts across EVERY configured key. All Groq-family keys
 * rotate first (each with the full model fallback chain), then xAI, then
 * OpenAI — so a rate-limited or dead key never takes AI repairs down.
 */
function buildChatAttempts() {
  const attempts = []
  for (const { key, family } of collectProviderKeys()) {
    if (family === 'groq') {
      // openai/gpt-oss-120b is the workhorse; gpt-oss-20b and compound-mini
      // are live fallbacks (llama-3.1-8b-instant was decommissioned by Groq).
      const candidates = [
        process.env.GROQ_BUILDER_MODEL || '',
        providerDefaultModel('groq'),
        'openai/gpt-oss-20b',
        'groq/compound-mini',
        'qwen/qwen3.6-27b',
      ].filter(Boolean)
      for (const model of [...new Set(candidates)]) {
        attempts.push({ url: GROQ_URL, key, model, family })
      }
    } else if (family === 'xai') {
      // grok-3-fast-mini was decommissioned; grok-3-mini + grok-3-fast are the
      // live candidates. A creditless team key fails fast via permission-denied.
      for (const model of [process.env.XAI_MODEL || 'grok-3-mini', 'grok-3-fast']) {
        attempts.push({ url: XAI_URL, key, model, family })
      }
    } else {
      attempts.push({ url: OPENAI_URL, key, model: providerDefaultModel('openai'), family })
    }
  }
  return attempts
}

/**
 * Every usable key, in priority order: all Groq slots first, then dedicated
 * xAI/OpenAI slots. Keys defined only inside .env/.env.local are rescued too
 * — a machine-level environment variable would otherwise shadow them forever.
 */
function collectProviderKeys() {
  const FAMILY_PRIORITY = { groq: 0, xai: 1, openai: 2 }
  const raw = KEY_SLOT_NAMES.map((n) => String(process.env[n] || '').trim()).filter(Boolean)
  raw.push(...extraFileKeys())
  const seen = new Set()
  return raw
    .filter((key) => (seen.has(key) ? false : (seen.add(key), true)))
    .map((key) => ({ key, family: detectKeyFamily(key) }))
    .sort((a, b) => FAMILY_PRIORITY[a.family] - FAMILY_PRIORITY[b.family])
}

let _extraFileKeysCache = null
function extraFileKeys() {
  if (_extraFileKeysCache) return _extraFileKeysCache
  const known = new Set(KEY_SLOT_NAMES.map((n) => String(process.env[n] || '').trim()).filter(Boolean))
  const out = []
  try {
    for (const name of ['.env.local', '.env']) {
      const p = path.resolve(MODULE_DIR, '..', name)
      if (!fs.existsSync(p)) continue
      for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = /^\s*(?:GROQ|XAI|OPENAI)[A-Z0-9_]*KEY[A-Z0-9_]*\s*=\s*(.+?)\s*$/.exec(line)
        const v = m?.[1]?.replace(/^["']|["']$/g, '').trim()
        if (v && !known.has(v)) out.push(v)
      }
    }
  } catch {}
  _extraFileKeysCache = out
  return out
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
 * Rotates across every configured Groq key, then xAI/OpenAI fallbacks.
 * Returns parsed JSON object or null when every provider fails.
 */
export async function repairChat(system, user, { maxTokens = 4000 } = {}) {
  const attempts = buildChatAttempts()
  if (!attempts.length) return null

  for (const attempt of attempts) {
    for (let tryIndex = 0; tryIndex < 2; tryIndex++) {
      try {
        const content = await callChatCompletion(attempt.url, attempt.key, attempt.model, system, user, maxTokens)
        const parsed = parseJsonLoose(content)
        if (parsed && typeof parsed === 'object') return parsed
        throw new Error('Response was not a valid JSON object')
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        _lastLlmError = `${attempt.family}/${attempt.model}: ${msg}`
        console.warn(`[LLM-REPAIR] ${attempt.family}/${attempt.model} attempt ${tryIndex + 1} failed:`, msg)
        // Dead keys, exhausted budgets and missing models can't be fixed by
        // retrying THIS candidate — move straight to the next key/model.
        if (isKeyRejected(msg) || isRateLimited(msg) || isModelMissing(msg)) break
        await new Promise(r => setTimeout(r, 800 * (tryIndex + 1)))
      }
    }
  }
  return null
}

/** JSON.parse first; fall back to scraping the first balanced {...} block. */
function parseJsonLoose(text) {
  try {
    return JSON.parse(String(text || ''))
  } catch {}
  return extractJsonObject(text)
}

// ─── Restoration strategist ──────────────────────────────────────────────────

const PLANNER_SYSTEM_PROMPT = `You are Alpha's restoration strategist. You receive a diagnosed list of website issues with severity ratings.
Produce an ordered execution plan that fixes the site with minimal, surgical changes.

Return STRICT JSON only, shaped exactly:
{"strategy":"one paragraph describing the overall approach","tasks":[{"id":"T1","title":"short imperative title","target_issue_types":["issue type from the input"],"approach":"how this gets fixed (rules vs AI surgical patch)","priority":1,"risk":"low|medium|high"}]}

Rules:
- Order tasks by impact: data loss, security and crash-level problems first, cosmetics last.
- Group related issue types into one task when they share a root cause.
- Prefer FEWER, well-scoped tasks over many tiny ones. Maximum 6 tasks.
- Every task must be independently verifiable.
- Output ONLY the JSON object.`

/**
 * Decompose a diagnosis into an ordered restoration plan. Falls back to a
 * deterministic severity-ordered plan when no AI provider is available or the
 * model returns junk — planning must NEVER be the reason a run fails.
 */
export async function llmPlanRestoration({ issues = [], score = 0, hostname = '', memoryContext = '' } = {}) {
  const out = { configured: isLlmRepairConfigured(), planned: false, strategy: '', tasks: [], source: 'rules' }

  // Deterministic baseline: unique issue types ordered by worst severity seen.
  const SEV_RANK = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
  const groups = new Map()
  for (const i of issues) {
    if (!i?.type) continue
    const g = groups.get(i.type) || { type: i.type, count: 0, worst: 'info' }
    g.count++
    if (SEV_RANK[i.severity] < SEV_RANK[g.worst]) g.worst = i.severity
    groups.set(i.type, g)
  }
  const baseTasks = [...groups.values()]
    .sort((a, b) => SEV_RANK[a.worst] - SEV_RANK[b.worst])
    .slice(0, 6)
    .map((g, idx) => ({
      id: `T${idx + 1}`,
      title: `Fix ${g.type.replace(/_/g, ' ')} (${g.count} issue${g.count > 1 ? 's' : ''})`,
      target_issue_types: [g.type],
      approach: 'Rule-based repair first, AI surgical patch only where rules cannot reach',
      priority: idx + 1,
      risk: g.worst === 'critical' ? 'high' : g.worst === 'high' ? 'medium' : 'low',
    }))
  out.tasks = baseTasks
  out.strategy = `Restore health from ${score}/100 by resolving ${baseTasks.length} issue group(s), most severe first.`

  if (!out.configured) return out

  try {
    const list = issues.slice(0, 20).map((i) => `- [${i.id}] (${i.severity}) ${i.type}: ${String(i.description || '').slice(0, 140)}`).join('\n')
    const user = `Site: ${hostname || '(unknown host)'}\nCurrent health score: ${score}/100\n\n${memoryContext ? `${memoryContext}\n\n` : ''}Diagnosed issues:\n${list}\n\nProduce the restoration plan now.`
    const answer = await repairChat(PLANNER_SYSTEM_PROMPT, user, { maxTokens: 2000 })
    if (!answer || !Array.isArray(answer.tasks) || !answer.tasks.length) return out
    const tasks = answer.tasks.slice(0, 6).map((t, idx) => ({
      id: String(t?.id || `T${idx + 1}`),
      title: clipNote(t?.title || `Task ${idx + 1}`, 90),
      target_issue_types: Array.isArray(t?.target_issue_types) ? t.target_issue_types.slice(0, 5).map(String) : [],
      approach: clipNote(t?.approach || '', 160),
      priority: Number(t?.priority) || idx + 1,
      risk: ['low', 'medium', 'high'].includes(t?.risk) ? t.risk : 'low',
    })).sort((a, b) => a.priority - b.priority)
    if (!tasks.length) return out
    out.planned = true
    out.source = 'ai'
    out.strategy = clipNote(answer.strategy || '', 300)
    out.tasks = tasks
    return out
  } catch {
    return out
  }
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

const SYSTEM_PROMPT = `You are Alpha — an elite Website Restoration Agent. You are not a website generator. You are not a redesign tool. You are a precision repair specialist.

Your only mission is to find real problems on websites and fix them with the smallest, safest, most accurate changes possible.

### Absolute Rules (Never Break These)

1. You NEVER rewrite or regenerate an entire page, component, or site.
2. You ONLY make the minimal change required to fix the specific issue.
3. Every fix must be expressed as a precise edit: an exact old -> new search-replace.
4. If you cannot make a safe minimal fix for a given issue, omit that issue entirely.
5. You treat exposed secrets (API keys, tokens, passwords) as critical emergencies.
6. You always verify your own work before answering.

### How You Operate

Phase 1 - Understand: locate each diagnosed problem inside the provided document excerpt. Never imagine code outside the excerpt.
Phase 2 - Diagnose Precisely: confirm the root cause; choose the smallest possible change that solves it; assess risk and confidence.
Phase 3 - Propose the Fix in STRICT JSON (schema below).
Phase 4 - Verify: re-check that every "old" string is copied exactly from the excerpt and appears at most once, and that "new" removes the original error without introducing new damage.

### Output Format

Return STRICT JSON only, shaped exactly:
{"fixes":[{"fix_id":"F-001","finding_id":"<issue id from the input>","severity":"critical|high|medium|low","title":"Short clear title","explanation":"Why this is broken and why this fix works","confidence":0.9,"risk":"low","changes":[{"file":"live-html","type":"search_replace|remove_secret","old":"EXACT substring copied character-for-character from the excerpt","new":"minimal corrected replacement","reason":"why this specific change"}],"verification_plan":"How we will confirm this is fixed","rollback_plan":"How to undo this change","notes":""}]}

Rules:
- "old" MUST be copied character-for-character from the provided excerpt and MUST be unique within it. Keep "old" as short as possible while staying unique.
- "new" must change ONLY what the repair requires. No reformatting, no redesign, no cosmetic "improvements".
- One finding_id may have several changes only if each change is independently minimal.
- Never invent URLs, never add analytics or trackers, never change the site's design or copy beyond the repair.
- Exposed secrets: severity = critical. Replace the secret value with a safe placeholder and warn in notes to rotate the key. NEVER leave the secret in "new".
- Maximum 8 fixes. If nothing can be fixed safely, return {"fixes":[]}.
- Output ONLY the JSON object.

### Personality & Communication

Be direct, technical, and calm. Never be vague. Never claim a fix works unless verified against the excerpt. Always show the exact change. If something is too risky or unclear, omit it.

### Final Directive

You are not here to make the site "look better" or recreate it. You are here to repair what is broken with surgical precision — exactly like an elite staff engineer would. When in doubt, do less. When confident, fix precisely. Always verify.`

/**
 * Attempt AI repairs for issues rules could not fix.
 * @param {{html:string, issues:Array<{id,type,severity,description,before,fix}>, hostname:string}} input
 * @returns {Promise<{configured:boolean, attempted:boolean, applied:number, skipped:number, notes:string[], html:string}>}
 */
export async function llmRepairBatch(input) {
  const { html, issues, hostname = '', memoryContext = '' } = input
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

  const user = `Site: ${hostname || '(unknown host)'}\n\n${memoryContext ? `${memoryContext}\n\n` : ''}Diagnosed issues:\n${evidence}\n\nDocument excerpt:\n\`\`\`\n${docExcerpt}\n\`\`\`\n\nReturn the JSON repairs now.`

  out.attempted = true
  const answer = await repairChat(SYSTEM_PROMPT, user, { maxTokens: 6000 })
  if (!answer) {
    out.notes.push('AI providers unavailable — continuing without AI repairs.')
    return out
  }

  // New doctrine format (fixes[] with structured changes) with graceful
  // support for the legacy repairs[] envelope.
  const rawFixes = Array.isArray(answer.fixes) ? answer.fixes : []
  const legacyRepairs = Array.isArray(answer.repairs) ? answer.repairs : []
  const ops = []
  for (const f of rawFixes.slice(0, 8)) {
    const label = [f?.title, f?.explanation].filter(Boolean).join(' — ')
    const changes = Array.isArray(f?.changes) ? f.changes.slice(0, 4) : []
    if (!changes.length && typeof f?.old === 'string') {
      ops.push({ issue_id: f?.finding_id || '?', action: 'search_replace', find: f.old, replace: typeof f?.new === 'string' ? f.new : '', explanation: label, critical: /secret|key|token|password/i.test(`${f?.title || ''} ${f?.explanation || ''}`) })
      continue
    }
    for (const c of changes) {
      const file = String(c?.file || 'live-html')
      if (!/live[-_]?html|^html$|^config$/i.test(file)) {
        out.skipped++
        out.notes.push(`Skipped non-HTML change (${file}) for ${f?.finding_id || '?'} — no source access in live mode`)
        continue
      }
      ops.push({ issue_id: f?.finding_id || '?', action: String(c?.type || 'search_replace'), find: String(c?.old ?? ''), replace: String(c?.new ?? ''), explanation: `${label}${c?.reason ? ` — ${c.reason}` : ''}`, critical: /secret|key|token|password/i.test(`${f?.title || ''} ${c?.reason || ''}`) })
    }
  }
  for (const r of legacyRepairs.slice(0, 8)) {
    ops.push({ issue_id: r?.issue_id || '?', action: r?.action || 'patch_html', find: String(r?.find ?? ''), replace: String(r?.replace ?? ''), explanation: String(r?.explanation || ''), critical: false })
  }

  // A patch that changes <script>/<style> open/close pairing leaves raw JS/CSS
  // bleeding into the document — reject those instead of shipping the damage.
  const structuralFingerprint = (s) =>
    `${(s.match(/<script\b/gi) || []).length}:${(s.match(/<\/script>/gi) || []).length}:` +
    `${(s.match(/<style\b/gi) || []).length}:${(s.match(/<\/style>/gi) || []).length}`

  let secretFlagged = false
  for (const op of ops.slice(0, 12)) {
    const find = op.find
    const replace = op.replace
    if (!find || find.length > MAX_PATCH_CHARS || replace.length > MAX_PATCH_CHARS) {
      out.skipped++
      out.notes.push(`Skipped oversized patch for ${op.issue_id}`)
      continue
    }
    const first = out.html.indexOf(find)
    if (first === -1) {
      out.skipped++
      out.notes.push(`Patch anchor not found for ${op.issue_id} — skipped safely`)
      continue
    }
    if (out.html.indexOf(find, first + 1) !== -1) {
      out.skipped++
      out.notes.push(`Patch anchor not unique for ${op.issue_id} — skipped safely`)
      continue
    }
    const candidate = out.html.slice(0, first) + replace + out.html.slice(first + find.length)
    if (structuralFingerprint(candidate) !== structuralFingerprint(out.html)) {
      out.skipped++
      out.notes.push(`Patch rejected for ${op.issue_id} — it would break <script>/<style> pairing`)
      continue
    }
    out.html = candidate
    out.applied++
    out.notes.push(`${op.action} applied: ${clipNote(op.explanation || '')}`)
    if (op.critical) secretFlagged = true
  }
  if (secretFlagged) {
    out.notes.unshift('⚠️ EXPOSED SECRET — this key is exposed. Remove it from client-side code and rotate it immediately.')
  }
  return out
}

function clipNote(text, cap = 140) {
  const s = String(text || '').trim()
  return s.length > cap ? s.slice(0, cap) + '…' : s
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
        console.warn(`[LLM-REBUILD] ${attempt.family}/${attempt.model} attempt ${tryIndex + 1} failed:`, msg)
        // Dead keys, exhausted budgets and missing models can't be fixed by
        // retrying THIS candidate — move straight to the next key/model.
        if (isKeyRejected(msg) || isRateLimited(msg) || isModelMissing(msg)) break
        await new Promise(r => setTimeout(r, 800 * (tryIndex + 1)))
      }
    }
  }
  return null
}

/**
 * chatText plus one patient retry: free-tier per-minute token budgets reset
 * quickly, so when EVERY key/model is rate-limited it pays to wait out the
 * window and make one final pass before giving up.
 */
async function chatTextWithRetry(system, user, opts = {}) {
  let answer = await chatText(system, user, opts)
  if (answer) return answer
  const fail = llmLastError()
  if (/tokens per minute|rate limit/i.test(fail)) {
    const waitMatch = /try again in ([\d.]+)s/i.exec(fail)
    const waitMs = Math.min(60_000, Math.max(15_000, Math.ceil(Number(waitMatch?.[1] || 20) * 1000)))
    console.log(`⏳ [LLM] Rate-limited across all keys — waiting ${(waitMs / 1000).toFixed(0)}s for budget reset, then one more pass…`)
    await new Promise(r => setTimeout(r, waitMs))
    return chatText(system, user, opts)
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

// ─── Chunked expert rebuild ──────────────────────────────────────────────────
// Groq free tiers enforce tiny per-minute token budgets, so one giant
// "rebuild this page" prompt gets rejected (HTTP 413/429). Instead the work is
// split into three small calls: inventory the content, build the structure,
// then optionally polish — each sized to fit the budget.

const MC_ANALYZE_PROMPT = `You are a website restoration analyst. You receive the source of a broken web page.
Inventory EVERY piece of salvageable content. Reply with STRICT JSON only, shaped exactly:
{"site_type":"restaurant|store|portfolio|business|blog|service|other","brand_name":"...","tagline":"...","purpose":"one sentence","palette":["#hex"],"blocks":[{"kind":"heading|paragraph|list|feature|testimonial|pricing|faq|gallery|nav|hero|about|contact|footer|other","text":"VERBATIM text from the page","items":["list items only"]}],"forms":[{"purpose":"contact|newsletter|signup|other","fields":["field names"]}],"links":[{"label":"...","href":"..."}]}
Rules:
- Copy text VERBATIM from the source; never invent content. Drop obvious junk (gibberish, repeated nonsense).
- Include navigation labels, headings, and footer/contact details.
- Use "" or [] when a field has no data.
- Output ONLY the JSON object.`

const MC_STRUCTURE_PROMPT = `You are an expert web developer performing a full website restoration.
You receive a content inventory (JSON) extracted from a broken page. Build ONE complete, modern, working HTML5 document that presents ALL inventoried content.
Output rules:
- RAW HTML only. No markdown fences, no commentary.
- The document MUST start with <!DOCTYPE html> and include <head> and <body>.
- All CSS in one <style> block inside <head>; all JS in one deferred <script> before </body>. No external dependencies.
- Modern responsive design (flexbox/grid), professional colors drawn from "palette" when present.
- Working navigation (smooth anchor scrolling), working forms (client-side validation plus a success message), buttons that respond.
- Semantic tags, aria attributes, alt text on images (inline SVG placeholders allowed).
- Preserve brand name, tagline and every content block. Do not invent businesses or products beyond the inventory.
- Clean, readable code.`

const MC_POLISH_PROMPT = `You are a meticulous senior front-end engineer reviewing a restored web page.
Fix anything broken or rough: JS errors, dead handlers, layout glitches, accessibility gaps, missing meta viewport/title.
Keep ALL existing content and the overall design. Do not remove sections.
Output rules: RAW HTML only, no fences, no commentary. Must remain a complete <!DOCTYPE html> document.`

const RECON_ANALYZE_PROMPT = `You are a front-end forensic analyst. A web page lost its JavaScript: the HTML shell survives (buttons, forms, containers) but the behavior layer is gone or was unrecoverable garbage.
From the ORIGINAL source you receive, inventory what the page was supposed to DO. Reply with STRICT JSON only, shaped exactly:
{"site_type":"store|app|dashboard|landing|other","data_assets":[{"name":"products|items|posts|...","json":[],"note":"verbatim data recovered from the source"}],"handlers_referenced":["function names referenced by onclick/onsubmit/addEventListener in the markup"],"containers":[{"selector":"#id or .class","intent":"what should render inside"}],"behaviors":["one line per intended behavior, e.g. 'add product to cart and update badge'"],"external_calls_to_avoid":["fake/broken API endpoints present in the original code"]}
Rules:
- Recover embedded data (arrays/objects) VERBATIM from the original scripts — prices, names, stock. This is gold; never drop it.
- List every handler name the surviving markup references.
- Behaviors must be concrete and implementable client-side with no network.
- Output ONLY the JSON object.`

const RECON_BUILD_PROMPT = `You are an expert front-end engineer writing a BEHAVIOR RESTORATION LAYER for a page that lost its JavaScript.
You receive: the analysis JSON of intended behaviors + the surviving HTML body structure. Produce ONE self-contained vanilla-JavaScript IIFE that restores the page's functionality.
Hard rules:
- RAW JavaScript only. No markdown fences, no commentary before or after the code.
- Vanilla ES2017, zero dependencies, zero network calls (never fetch any external API — if checkout/payment/auth was backed by a fake API, implement an honest local demo: validate, then show a clear message).
- Define EVERY handler listed as a global function on window (e.g. window.addToCart = ... AND function addToCart(...) hoisted) so existing onclick="..." attributes work again.
- Populate every container from the recovered data_assets (render product cards with name, price, stock, working Add-to-Cart buttons styled via the page's EXISTING css classes like 'product-card', 'price', 'btn').
- Remove/hide stuck "Loading..." placeholders once real content renders.
- Wire forms: prevent default, basic validation, honest success/error feedback inline (no alert spam — at most one alert where the original used one).
- Guard every getElementById/querySelector result against null.
- End the script with: window.__alphaBehaviors = [/* names of behaviors implemented */];
- Keep it compact but complete. Never use eval, new Function, document.write, or innerHTML with unsanitized external input (template literals over the recovered local data are fine).`

/** Pull the first balanced {...} object out of a model reply (fences/proof tolerated). */
function extractJsonObject(text) {
  const s = String(text || '')
  const start = s.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (!depth) {
        try {
          return JSON.parse(s.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

/**
 * Rebuild a damaged page via multiple SMALL calls so tight provider token
 * budgets can't kill the restoration. Never throws.
 * @param {{html?:string, hostname?:string, url?:string}} input
 * @returns {Promise<{configured:boolean, attempted:boolean, rebuilt:boolean, html:string, notes:string[]}>}
 */
export async function llmMultiCallRebuild(input = {}) {
  const { html = '', hostname = '', url = '' } = input
  const out = { configured: isLlmRepairConfigured(), attempted: false, rebuilt: false, html, notes: [] }

  if (!out.configured) {
    out.notes.push('No AI provider key configured — multi-call rebuild skipped.')
    return out
  }
  const source = String(html || '').trim()
  if (!source) {
    out.notes.push('Empty input — multi-call rebuild skipped.')
    return out
  }

  out.attempted = true
  console.log(`🧩 [MULTI-CALL] Chunked expert rebuild starting — input ${(source.length / 1024).toFixed(1)} KB`)
  const estTokens = (s) => Math.ceil(String(s).length / 4)
  const budgetTokens = (system, user) => Math.max(800, Math.min(11_000, 7_300 - estTokens(system) - estTokens(user)))

  // PHASE 1 — inventory the surviving content (small structured answer).
  const analyzeSlice = source.slice(0, 30_000)
  const analyzeUser = `Site: ${hostname || '(unknown host)'}${url ? `\nURL: ${url}` : ''}\n\nBroken page source:\n${analyzeSlice}\n\nInventory this page's salvageable content as specified.`
  let inventory = null
  for (let round = 0; round < 2 && !inventory; round++) {
    const ask = round === 0 ? analyzeUser : `${analyzeUser}\n\nIMPORTANT: reply with ONLY the JSON object — no prose, no code fences.`
    const raw = await chatText(MC_ANALYZE_PROMPT, ask, { maxTokens: budgetTokens(MC_ANALYZE_PROMPT, ask) })
    if (raw) inventory = extractJsonObject(raw)
  }
  if (!inventory || typeof inventory !== 'object' || !Array.isArray(inventory.blocks)) {
    out.notes.push(`Multi-call Phase 1 (analysis) did not return valid JSON (${llmLastError() || 'unknown error'}).`)
    console.log('❌ [MULTI-CALL] Phase 1 failed —', llmLastError())
    return out
  }
  console.log(`🧩 [MULTI-CALL] Phase 1 OK — ${inventory.blocks.length} content blocks inventoried (${inventory.site_type || 'unknown type'})`)

  // PHASE 2 — build the clean document from the compacted inventory.
  let inventoryText = JSON.stringify(inventory)
  if (inventoryText.length > 24_000) inventoryText = inventoryText.slice(0, 24_000)
  const structureUser = `Site: ${hostname || '(unknown host)'}${url ? `\nURL: ${url}` : ''}\n\nContent inventory:\n${inventoryText}\n\nBuild the complete restored HTML file from this inventory now.`
  const structureRaw = await chatTextWithRetry(MC_STRUCTURE_PROMPT, structureUser, { maxTokens: budgetTokens(MC_STRUCTURE_PROMPT, structureUser) })
  const structured = structureRaw ? extractHtmlDocument(structureRaw) : null
  if (!structured) {
    out.notes.push(`Multi-call Phase 2 (structure) did not return a full HTML document (${llmLastError() || 'unknown error'}).`)
    console.log('❌ [MULTI-CALL] Phase 2 failed —', llmLastError())
    return out
  }
  console.log(`🧩 [MULTI-CALL] Phase 2 OK — ${(structured.length / 1024).toFixed(1)} KB document built`)

  // PHASE 3 — polish pass, but only when the doc is small enough to resend.
  let finalHtml = structured
  if (finalHtml.length <= 14_000) {
    const polishUser = `Site: ${hostname || '(unknown host)'}\n\nCurrent restored page:\n${finalHtml}\n\nReview and polish it as specified. Return the complete improved HTML file.`
    const polishedRaw = await chatTextWithRetry(MC_POLISH_PROMPT, polishUser, { maxTokens: budgetTokens(MC_POLISH_PROMPT, polishUser) }).catch(() => null)
    const polished = polishedRaw ? extractHtmlDocument(polishedRaw) : null
    if (polished) {
      finalHtml = polished
      console.log(`🧩 [MULTI-CALL] Phase 3 OK — polished to ${(finalHtml.length / 1024).toFixed(1)} KB`)
    } else {
      out.notes.push('Polish pass skipped (provider unavailable) — keeping Phase 2 result.')
    }
  } else {
    out.notes.push('Polish pass skipped — document too large to resend within token budget.')
  }

  out.html = finalHtml
  out.rebuilt = true
  out.notes.push('Chunked expert rebuild completed.')
  return out
}

/**
 * Reconstruct a page's lost JavaScript behavior layer via multiple small calls
 * (ANALYZE → BUILD → optional CONTINUE). This is NOT a full-page rebuild: the
 * HTML shell, content and design stay untouched — only a <script> layer that
 * restores interactivity is produced. Never throws.
 * @param {{originalHtml?:string, workingHtml?:string, hostname?:string, url?:string}} input
 * @returns {Promise<{configured:boolean, attempted:boolean, reconstructed:boolean, code:string, functions:string[], notes:string[]}>}
 */
export async function llmReconstructInteractivity(input = {}) {
  const { originalHtml = '', workingHtml = '', hostname = '', url = '', errors = [], previousCode = '' } = input
  const out = { configured: isLlmRepairConfigured(), attempted: false, reconstructed: false, code: '', functions: [], notes: [] }
  if (!out.configured) {
    out.notes.push('No AI provider key configured — behavior reconstruction skipped.')
    return out
  }
  const orig = String(originalHtml || '')
  if (!orig.trim() || !String(workingHtml).trim()) {
    out.notes.push('Empty input — behavior reconstruction skipped.')
    return out
  }

  // Feed only the salvageable parts of the ORIGINAL: its scripts + interactive markup.
  const scripts = [...orig.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).filter((s) => s.replace(/\s+/g, '').length > 20)
  const interactiveMarkup = (() => {
    const body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(orig)?.[1] || orig
    return body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').slice(0, 18_000)
  })()
  const scriptDump = scripts.join('\n;\n').slice(0, 26_000)
  if (!scriptDump && !/onclick|onsubmit|onchange/i.test(interactiveMarkup)) {
    out.notes.push('No original scripts or inline handlers to reconstruct from.')
    return out
  }

  out.attempted = true
  console.log(`🧠 [RECON] Behavior reconstruction starting — ${scripts.length} dead script block(s), ${(scriptDump.length / 1024).toFixed(1)} KB of source`)

  // PHASE 1 — forensic analysis (small structured answer).
  const estTokens = (s) => Math.ceil(String(s).length / 4)
  const analyzeUser = `Site: ${hostname || '(unknown host)'}${url ? `\nURL: ${url}` : ''}\n\nOriginal scripts (broken/unparseable):\n${scriptDump || '(none survived)'}\n\nSurviving body markup:\n${interactiveMarkup}\n\nInventory what this page was supposed to do.`
  let analysis = null
  for (let round = 0; round < 2 && !analysis; round++) {
    const ask = round === 0 ? analyzeUser : `${analyzeUser}\n\nIMPORTANT: reply with ONLY the JSON object — no prose, no fences.`
    const raw = await chatText(RECON_ANALYZE_PROMPT, ask, { maxTokens: Math.max(800, Math.min(9_000, 7_300 - estTokens(RECON_ANALYZE_PROMPT) - estTokens(ask))) })
    if (raw) analysis = extractJsonObject(raw)
  }
  if (!analysis || typeof analysis !== 'object') {
    out.notes.push(`Reconstruction Phase 1 (analysis) failed (${llmLastError() || 'no valid JSON'}).`)
    console.log('❌ [RECON] Phase 1 failed —', llmLastError())
    return out
  }
  const dataCount = Array.isArray(analysis.data_assets) ? analysis.data_assets.length : 0
  console.log(`🧠 [RECON] Phase 1 OK — type=${analysis.site_type || '?'} · ${dataCount} data asset(s) · ${(analysis.handlers_referenced || []).length} handler(s)`)

  // PHASE 2 — build the behavior layer (with continuation rounds for size).
  const bodyStructure = (String(workingHtml).match(/<body\b[\s\S]*<\/body>/i) || [String(workingHtml)])[0].slice(0, 14_000)
  let analysisText = JSON.stringify(analysis)
  if (analysisText.length > 20_000) analysisText = analysisText.slice(0, 20_000)
  const healNote = errors.length
    ? `\n\nCRITICAL — your PREVIOUS script for this page crashed at runtime:\n${errors.slice(0, 4).map((e) => `- ${String(e).slice(0, 200)}`).join('\n')}\nPrevious attempt (excerpt):\n${String(previousCode).slice(0, 3_000)}\nFix EVERY listed error. Guard every DOM lookup, wrap risky boot logic in try/catch, and return the FULL corrected script.`
    : ''
  const buildUser = `Site: ${hostname || '(unknown host)'}\n\nBehavior analysis:\n${analysisText}\n\nSurviving body structure:\n${bodyStructure}${healNote}\n\nWrite the complete behavior restoration script now.`
  let code = ''
  for (let round = 0; round < 3; round++) {
    const ask = round === 0 ? buildUser : `Continue EXACTLY where the script stopped — no repetition, no commentary. Remaining part of the same IIFE:\n\n${code.slice(-1_200)}`
    const maxTokens = Math.max(900, Math.min(10_000, 7_300 - estTokens(RECON_BUILD_PROMPT) - estTokens(ask)))
    const chunk = await chatTextWithRetry(RECON_BUILD_PROMPT, ask, { maxTokens })
    if (!chunk) break
    code += (code ? '\n' : '') + chunk.trim()
    const compiled = tryCompile(cleanCodeFences(code))
    if (compiled.ok) break
    if (round === 2) { code = ''; break }
    console.log(`🧠 [RECON] Phase 2 round ${round + 1} incomplete (${compiled.error.slice(0, 80)}) — requesting continuation…`)
  }
  code = cleanCodeFences(code)
  const compiled = tryCompile(code)
  if (!code || !compiled.ok) {
    out.notes.push(`Reconstruction Phase 2 failed to produce compilable JS (${compiled.error || llmLastError() || 'empty response'}).`)
    console.log('❌ [RECON] Phase 2 failed —', compiled.error || llmLastError())
    return out
  }

  // Safety gate: no external network calls in restored behavior.
  const externalCalls = [...code.matchAll(/fetch\s*\(\s*['"`]([^'"`]+)/gi)]
    .map((m) => m[1])
    .filter((u) => /^https?:\/\//i.test(u))
  if (externalCalls.length) {
    out.notes.push(`Rejected generated code calling external APIs: ${externalCalls[0]}`)
    console.log('❌ [RECON] Safety gate — external fetch found:', externalCalls[0])
    return out
  }

  const fns = [...code.matchAll(/(?:function\s+([A-Za-z_$][\w$]*)\s*\()|(?:window\.([A-Za-z_$][\w$]*)\s*=)/g)]
    .map((m) => m[1] || m[2])
    .filter((n) => n && !['window', 'document'].includes(n))
  out.code = code
  out.functions = [...new Set(fns)]
  out.reconstructed = true
  out.notes.push(`Behavior layer rebuilt: ${out.functions.length} function(s), ${(code.length / 1024).toFixed(1)} KB`)
  console.log(`✅ [RECON] Behavior layer ready — ${out.functions.length} function(s): ${out.functions.slice(0, 8).join(', ')}${out.functions.length > 8 ? '…' : ''}`)
  return out
}

/** Strip markdown fences / stray prose around a raw-JS reply. */
function cleanCodeFences(text) {
  let s = String(text || '').trim()
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*$/gi, '')
  s = s.replace(/^```(?:javascript|js)?\s*/i, '').replace(/```\s*$/i, '')
  const firstBrace = s.search(/(?:^\s*\(function|\bfunction\s|\bconst\s|\blet\s|\bvar\s|\bwindow\.)/)
  if (firstBrace > 0 && firstBrace < 400) s = s.slice(firstBrace)
  return s.trim()
}

/** Compile-check JS without executing it. */
function tryCompile(code) {
  try {
    new Function(code)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
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
    answer = await chatTextWithRetry(REBUILD_SYSTEM_PROMPT, user, { maxTokens })
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
