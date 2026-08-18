/**
 * ALPHA CORE — BUDGET GUARD
 * 
 * Enforces token/cost limits per restoration.
 * Default: max $0.50 per restoration, max 100k tokens.
 * Prevents runaway AI costs.
 */

export interface BudgetConfig {
  maxCostUsd: number
  maxTokens: number
  maxAttempts: number
  warnThreshold: number // percentage (0-1) at which to warn
}

export interface BudgetState {
  traceId: string
  totalTokens: number
  totalCostUsd: number
  attempts: number
  startTime: number
  exceeded: boolean
  warned: boolean
}

// ─── Default Config ───────────────────────────────────────────────────────────

const DEFAULT_CONFIG: BudgetConfig = {
  maxCostUsd: 0.50,
  maxTokens: 100_000,
  maxAttempts: 3,
  warnThreshold: 0.8,
}

// ─── Groq Pricing (per 1M tokens, approximate) ────────────────────────────────

const PRICING: Record<string, { input: number; output: number }> = {
  'openai/gpt-oss-120b': { input: 0.60, output: 0.60 },
  'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
  'compound-beta-mini': { input: 0.10, output: 0.10 },
  'compound-beta': { input: 0.30, output: 0.30 },
  'mixtral-8x7b-32768': { input: 0.20, output: 0.20 },
  'whisper-large-v3-turbo': { input: 0.045, output: 0 }, // per minute
}

// ─── Active Budgets ───────────────────────────────────────────────────────────

const activeBudgets = new Map<string, BudgetState>()

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * createBudget — Initialize a budget tracker for a restoration.
 */
export function createBudget(traceId: string, config?: Partial<BudgetConfig>): BudgetState {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const state: BudgetState = {
    traceId,
    totalTokens: 0,
    totalCostUsd: 0,
    attempts: 0,
    startTime: Date.now(),
    exceeded: false,
    warned: false,
  }
  activeBudgets.set(traceId, state)
  return state
}

/**
 * estimateCost — Calculate cost in USD for a given token count and model.
 */
export function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = PRICING[model] || PRICING['openai/gpt-oss-120b']
  return (promptTokens * pricing.input + completionTokens * pricing.output) / 1_000_000
}

/**
 * recordUsage — Record token usage against a budget. Returns true if still within budget.
 */
export function recordUsage(
  traceId: string,
  model: string,
  promptTokens: number,
  completionTokens: number
): { allowed: boolean; state: BudgetState; warning?: string } {
  const state = activeBudgets.get(traceId)
  if (!state) return { allowed: true, state: { traceId, totalTokens: 0, totalCostUsd: 0, attempts: 0, startTime: Date.now(), exceeded: false, warned: false } }

  const cost = estimateCost(model, promptTokens, completionTokens)
  state.totalTokens += promptTokens + completionTokens
  state.totalCostUsd += cost

  const cfg = DEFAULT_CONFIG
  const tokenRatio = state.totalTokens / cfg.maxTokens
  const costRatio = state.totalCostUsd / cfg.maxCostUsd

  // Check if exceeded
  if (tokenRatio >= 1 || costRatio >= 1) {
    state.exceeded = true
    return { allowed: false, state, warning: `Budget exceeded: ${state.totalTokens}/${cfg.maxTokens} tokens, $${state.totalCostUsd.toFixed(4)}/$${cfg.maxCostUsd}` }
  }

  // Check if warning threshold hit
  const maxRatio = Math.max(tokenRatio, costRatio)
  if (maxRatio >= cfg.warnThreshold && !state.warned) {
    state.warned = true
    return { allowed: true, state, warning: `Budget warning: ${(maxRatio * 100).toFixed(0)}% consumed (${state.totalTokens} tokens, $${state.totalCostUsd.toFixed(4)})` }
  }

  return { allowed: true, state }
}

/**
 * recordAttempt — Increment attempt counter. Returns true if within limit.
 */
export function recordAttempt(traceId: string): { allowed: boolean; attempt: number } {
  const state = activeBudgets.get(traceId)
  if (!state) return { allowed: true, attempt: 1 }

  state.attempts += 1
  if (state.attempts > DEFAULT_CONFIG.maxAttempts) {
    state.exceeded = true
    return { allowed: false, attempt: state.attempts }
  }
  return { allowed: true, attempt: state.attempts }
}

/**
 * checkBudget — Quick check if budget is still available.
 */
export function checkBudget(traceId: string): BudgetState | null {
  return activeBudgets.get(traceId) || null
}

/**
 * finalizeBudget — Mark budget as complete, return final stats.
 */
export function finalizeBudget(traceId: string): BudgetState | null {
  const state = activeBudgets.get(traceId)
  if (!state) return null
  // Keep in map for audit, but could be cleaned up later
  return state
}

/**
 * cleanupBudget — Remove a budget from active tracking.
 */
export function cleanupBudget(traceId: string): void {
  activeBudgets.delete(traceId)
}

/**
 * getBudgetSummary — Get human-readable budget summary.
 */
export function getBudgetSummary(traceId: string): string {
  const state = activeBudgets.get(traceId)
  if (!state) return 'No budget found'
  const elapsed = ((Date.now() - state.startTime) / 1000).toFixed(1)
  return `${state.exceeded ? 'EXCEEDED' : 'OK'} | ${state.totalTokens} tokens | $${state.totalCostUsd.toFixed(4)} | ${state.attempts} attempts | ${elapsed}s`
}
