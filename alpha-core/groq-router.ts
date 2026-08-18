/**
 * ALPHA CORE — GROQ ROUTER
 * 
 * The ONLY file that imports groq-sdk. All other modules call alphaCall().
 * Model-agnostic: swap provider by editing this file only.
 * 
 * AlphaModels:
 *   REASONING  = openai/gpt-oss-120b       (deep reasoning, fix generation)
 *   PLANNER    = llama-3.3-70b-versatile    (planning, step decomposition)
 *   SCANNER    = compound-beta-mini         (fast analysis, pattern detection)
 *   HEAVY      = compound-beta              (large-context analysis)
 *   SCRIPT     = mixtral-8x7b-32768         (script generation, lightweight)
 *   TRANSCRIBE = whisper-large-v3-turbo     (audio transcription)
 */

import { Groq } from 'groq-sdk'

// ─── Model Registry ───────────────────────────────────────────────────────────

export const AlphaModels = {
  REASONING: 'openai/gpt-oss-120b',
  PLANNER: 'llama-3.3-70b-versatile',
  SCANNER: 'compound-beta-mini',
  HEAVY: 'compound-beta',
  SCRIPT: 'mixtral-8x7b-32768',
  TRANSCRIBE: 'whisper-large-v3-turbo',
} as const

export type AlphaModelRole = keyof typeof AlphaModels
export type AlphaModelId = typeof AlphaModels[AlphaModelRole]

// ─── Groq Client (lazy singleton) ─────────────────────────────────────────────

let _groq: Groq | null = null

function getGroq(): Groq {
  if (!_groq) {
    _groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
  }
  return _groq
}

// ─── Router Configuration ─────────────────────────────────────────────────────

interface RouterConfig {
  temperature?: number
  maxTokens?: number
  responseFormat?: { type: 'json_object' }
}

const ROLE_DEFAULTS: Record<AlphaModelRole, RouterConfig> = {
  REASONING: { temperature: 0.3, maxTokens: 4096 },
  PLANNER: { temperature: 0.4, maxTokens: 2048 },
  SCANNER: { temperature: 0.2, maxTokens: 1024 },
  HEAVY: { temperature: 0.3, maxTokens: 4096 },
  SCRIPT: { temperature: 0.7, maxTokens: 2048 },
  TRANSCRIBE: { temperature: 0.0, maxTokens: 4096 },
}

// ─── Core Call Function ───────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AlphaCallResult {
  content: string
  model: string
  role: AlphaModelRole
  tokens?: { prompt: number; completion: number; total: number }
}

/**
 * alphaCall — The single entry point for all AI calls.
 * 
 * @param role - Which model role to use (REASONING, SCANNER, etc.)
 * @param messages - Chat messages array
 * @param config - Optional overrides (temperature, maxTokens, responseFormat)
 * @returns AlphaCallResult with content string and metadata
 */
export async function alphaCall(
  role: AlphaModelRole,
  messages: ChatMessage[],
  config?: RouterConfig
): Promise<AlphaCallResult> {
  const model = AlphaModels[role]
  const defaults = ROLE_DEFAULTS[role]
  const opts = { ...defaults, ...config }

  try {
    const resp = await getGroq().chat.completions.create({
      model,
      messages,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      ...(opts.responseFormat ? { response_format: opts.responseFormat } : {}),
    })

    const choice = resp.choices?.[0]
    const content = choice?.message?.content || ''
    const usage = resp.usage

    return {
      content,
      model,
      role,
      tokens: usage ? {
        prompt: usage.prompt_tokens,
        completion: usage.completion_tokens,
        total: usage.total_tokens,
      } : undefined,
    }
  } catch (err: any) {
    // Rate-limit fallback: if model-specific error, retry with REASONING
    const msg = String(err?.message || err)
    if (/tokens per day|rate limit reached/i.test(msg) && role !== 'REASONING') {
      console.warn(`[ALPHA-ROUTER] Rate limited on ${model}, falling back to ${AlphaModels.REASONING}`)
      const fallback = await getGroq().chat.completions.create({
        model: AlphaModels.REASONING,
        messages,
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
      })
      return {
        content: fallback.choices?.[0]?.message?.content || '',
        model: AlphaModels.REASONING,
        role: 'REASONING',
        tokens: fallback.usage ? {
          prompt: fallback.usage.prompt_tokens,
          completion: fallback.usage.completion_tokens,
          total: fallback.usage.total_tokens,
        } : undefined,
      }
    }
    throw err
  }
}

// ─── Convenience Wrappers ─────────────────────────────────────────────────────

/**
 * alphaChat — Call with JSON parsing. Returns parsed object or raw content.
 */
export async function alphaChat(
  role: AlphaModelRole,
  messages: ChatMessage[],
  config?: RouterConfig
): Promise<any> {
  const result = await alphaCall(role, messages, config)
  const raw = result.content
  try { return JSON.parse(raw) } catch { return { content: raw } }
}

/**
 * alphaText — Call and return plain text string.
 */
export async function alphaText(
  role: AlphaModelRole,
  messages: ChatMessage[],
  config?: RouterConfig
): Promise<string> {
  const result = await alphaCall(role, messages, config)
  return result.content
}

/**
 * alphaTranscribe — Audio transcription via Groq Whisper.
 * Uses Messages API (not Chat Completions).
 */
export async function alphaTranscribe(
  audioBuffer: Buffer,
  filename: string,
  mimeType: string = 'audio/wav'
): Promise<string> {
  const formData = new FormData()
  formData.append('file', new Blob([audioBuffer], { type: mimeType }), filename)
  formData.append('model', AlphaModels.TRANSCRIBE)
  formData.append('response_format', 'verbose_json')
  formData.append('temperature', '0')

  const apiKey = process.env.GROQ_API_KEY || ''
  const res = await fetch('https://api.groq.com/openai/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: formData,
    signal: AbortSignal.timeout(120_000),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Transcription failed (${res.status}): ${body.slice(0, 200)}`)
  }

  const data = await res.json() as any
  return data.text || ''
}

/**
 * getAvailableModels — List models available on Groq.
 */
export async function getAvailableModels(): Promise<string[]> {
  try {
    const resp = await getGroq().models.list()
    return (resp.data || []).map((m: any) => m.id)
  } catch {
    return Object.values(AlphaModels)
  }
}
