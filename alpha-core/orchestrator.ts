/**
 * ALPHA CORE — ORCHESTRATOR
 * 
 * The central Reason → Plan → Act → Observe loop.
 * Every restoration flows through this loop.
 * 
 * Flow:
 *   1. REASON: Understand current state vs intended state
 *   2. PLAN: Generate a sequence of steps to close the gap
 *   3. ACT: Execute each step, observing results
 *   4. OBSERVE: Evaluate if gap is closed, loop or escalate
 * 
 * Max 3 attempts per restoration. Budget enforced at each step.
 */

import { randomBytes } from 'node:crypto'
import { alphaCall, type ChatMessage, type AlphaModelRole } from './groq-router.ts'
import {
  newTraceId,
  auditThought,
  auditAction,
  auditTool,
  auditResult,
  auditError,
  auditDecision,
} from './audit-trail.ts'
import {
  createBudget,
  recordUsage,
  recordAttempt,
  checkBudget,
  type BudgetState,
} from './budget-guard.ts'

// ─── Types ────────────────────────────────────────────────────────────────────

export type Phase = 'reason' | 'plan' | 'act' | 'observe' | 'done' | 'failed'

export interface Step {
  id: string
  description: string
  tool?: string
  params?: Record<string, any>
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped'
  result?: any
  error?: string
}

export interface OrchestratorState {
  traceId: string
  targetUrl: string
  phase: Phase
  steps: Step[]
  attempt: number
  maxAttempts: number
  reasoning: string
  plan: string
  observations: string[]
  fixed: boolean
  budget: BudgetState | null
  startTime: number
}

export interface OrchestratorCallbacks {
  onPhase?: (state: OrchestratorState) => void
  onStep?: (step: Step, state: OrchestratorState) => void
  onLog?: (msg: string) => void
  onError?: (err: string) => void
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function genStepId(): string {
  return `step_${randomBytes(4).toString('hex')}`
}

// ─── Core Loop ────────────────────────────────────────────────────────────────

/**
 * runOrchestration — Execute the full Reason→Plan→Act→Observe loop.
 * 
 * @param targetUrl - The URL being restored
 * @param context - Additional context (HTML, errors, scan results, etc.)
 * @param callbacks - Event handlers for streaming progress
 * @returns Final OrchestratorState
 */
export async function runOrchestration(
  targetUrl: string,
  context: Record<string, any>,
  callbacks?: OrchestratorCallbacks
): Promise<OrchestratorState> {
  const traceId = newTraceId()
  const budget = createBudget(traceId)

  const state: OrchestratorState = {
    traceId,
    targetUrl,
    phase: 'reason',
    steps: [],
    attempt: 1,
    maxAttempts: 3,
    reasoning: '',
    plan: '',
    observations: [],
    fixed: false,
    budget,
    startTime: Date.now(),
  }

  const log = (msg: string) => {
    callbacks?.onLog?.(msg)
    auditThought(traceId, 'orchestrator', msg)
  }

  try {
    // ─── ATTEMPT LOOP ──────────────────────────────────────────────────────
    while (state.attempt <= state.maxAttempts && !state.fixed) {
      if (state.attempt > 1) {
        log(`Retrying (attempt ${state.attempt}/${state.maxAttempts}) with updated evidence...`)
        auditDecision(traceId, 'orchestrator', `Retry attempt ${state.attempt}`, {
          previousObservations: state.observations,
        })
      }

      // ─── PHASE 1: REASON ────────────────────────────────────────────────
      state.phase = 'reason'
      callbacks?.onPhase?.(state)
      log('Phase: REASON — Understanding current vs intended state')

      const reasonPrompt: ChatMessage[] = [
        {
          role: 'system',
          content: `You are a restoration engine. Analyze the current state of a broken website and determine what's wrong.
Return ONLY JSON: {
  "currentState": "description of what's broken",
  "intendedState": "what it should look like",
  "gap": "what needs to change",
  "rootCause": "likely root cause",
  "confidence": 0.0-1.0
}`,
        },
        {
          role: 'user',
          content: `URL: ${targetUrl}\nContext: ${JSON.stringify(context).slice(0, 4000)}`,
        },
      ]

      const reasonResult = await alphaCall('REASONING', reasonPrompt)
      recordUsage(traceId, reasonResult.model, reasonResult.tokens?.prompt || 0, reasonResult.tokens?.completion || 0)
      state.reasoning = reasonResult.content
      log(`Reasoning: ${state.reasoning.slice(0, 200)}...`)

      // ─── PHASE 2: PLAN ──────────────────────────────────────────────────
      state.phase = 'plan'
      callbacks?.onPhase?.(state)
      log('Phase: PLAN — Generating fix steps')

      const planPrompt: ChatMessage[] = [
        {
          role: 'system',
          content: `You are a restoration planner. Given analysis of a broken site, create a step-by-step plan to fix it.
Return ONLY JSON: {
  "steps": [
    { "description": "what to do", "tool": "ai_fix|html_rewrite|redirect|config", "params": {} }
  ],
  "summary": "one-line summary of the plan"
}`,
        },
        {
          role: 'user',
          content: `URL: ${targetUrl}\nReasoning: ${state.reasoning}\nPrevious observations: ${state.observations.join('; ') || 'none'}`,
        },
      ]

      const planResult = await alphaCall('PLANNER', planPrompt)
      recordUsage(traceId, planResult.model, planResult.tokens?.prompt || 0, planResult.tokens?.completion || 0)
      state.plan = planResult.content
      log(`Plan: ${state.plan.slice(0, 200)}...`)

      // Parse steps from plan
      try {
        const parsed = JSON.parse(state.plan)
        state.steps = (parsed.steps || []).map((s: any) => ({
          id: genStepId(),
          description: s.description || 'Fix step',
          tool: s.tool || 'ai_fix',
          params: s.params || {},
          status: 'pending' as const,
        }))
      } catch {
        state.steps = [{
          id: genStepId(),
          description: 'Apply AI-generated fix',
          tool: 'ai_fix',
          params: {},
          status: 'pending',
        }]
      }

      log(`Plan has ${state.steps.length} step(s)`)
      auditAction(traceId, 'orchestrator', `Plan generated: ${state.steps.length} steps`)

      // ─── PHASE 3: ACT ───────────────────────────────────────────────────
      state.phase = 'act'
      callbacks?.onPhase?.(state)
      log('Phase: ACT — Executing fix steps')

      for (const step of state.steps) {
        if (checkBudget(traceId)?.exceeded) {
          log('Budget exceeded — stopping execution')
          auditError(traceId, 'orchestrator', 'Budget exceeded during act phase')
          break
        }

        step.status = 'running'
        callbacks?.onStep?.(step, state)
        log(`Executing: ${step.description}`)

        const actStart = Date.now()
        try {
          // Execute via AI (the actual tool dispatch happens in higher-level code)
          const actPrompt: ChatMessage[] = [
            {
              role: 'system',
              content: `You are a website fixer. Execute this step and return the result as JSON: { "success": true/false, "result": "...", "changes": ["file changes made"] }`,
            },
            {
              role: 'user',
              content: `Step: ${step.description}\nURL: ${targetUrl}\nContext: ${JSON.stringify(context).slice(0, 3000)}`,
            },
          ]

          const actResult = await alphaCall('REASONING', actPrompt)
          recordUsage(traceId, actResult.model, actResult.tokens?.prompt || 0, actResult.tokens?.completion || 0)

          step.status = 'success'
          step.result = actResult.content
          auditResult(traceId, 'orchestrator', `Step complete: ${step.description}`, step.result, Date.now() - actStart)
          log(`Step done: ${step.description}`)
        } catch (err: any) {
          step.status = 'failed'
          step.error = err.message || String(err)
          auditError(traceId, 'orchestrator', `Step failed: ${step.description}`, step.error)
          log(`Step failed: ${step.description} — ${step.error}`)
        }

        callbacks?.onStep?.(step, state)
      }

      // ─── PHASE 4: OBSERVE ───────────────────────────────────────────────
      state.phase = 'observe'
      callbacks?.onPhase?.(state)
      log('Phase: OBSERVE — Evaluating fix results')

      const observePrompt: ChatMessage[] = [
        {
          role: 'system',
          content: `You are a fix verifier. Evaluate whether the fix was successful.
Return ONLY JSON: {
  "fixed": true/false,
  "healthScore": 0-100,
  "regressions": ["any regressions found"],
  "summary": "evaluation summary"
}`,
        },
        {
          role: 'user',
          content: `URL: ${targetUrl}\nSteps executed: ${state.steps.map(s => `${s.description} [${s.status}]`).join(', ')}\nReasoning: ${state.reasoning}`,
        },
      ]

      const observeResult = await alphaCall('REASONING', observePrompt)
      recordUsage(traceId, observeResult.model, observeResult.tokens?.prompt || 0, observeResult.tokens?.completion || 0)

      let observation = ''
      let healthScore = 0
      try {
        const obs = JSON.parse(observeResult.content)
        observation = obs.summary || observeResult.content
        healthScore = obs.healthScore || 0
        state.fixed = obs.fixed === true
      } catch {
        observation = observeResult.content
        // If can't parse, assume not fixed
        state.fixed = false
      }

      state.observations.push(observation)
      log(`Observation: ${observation.slice(0, 200)} (health: ${healthScore}/100, fixed: ${state.fixed})`)
      auditDecision(traceId, 'orchestrator', `Observation: fixed=${state.fixed}, health=${healthScore}`, { observation, healthScore })

      if (!state.fixed && state.attempt < state.maxAttempts) {
        const attemptResult = recordAttempt(traceId)
        if (!attemptResult.allowed) {
          log(`Max attempts (${state.maxAttempts}) reached — cannot retry`)
          auditError(traceId, 'orchestrator', 'Max attempts exceeded')
          break
        }
        state.attempt = attemptResult.attempt
        log(`Fix not yet complete — will retry (attempt ${state.attempt}/${state.maxAttempts})`)
      }

      state.attempt++
    }

    // ─── FINALIZE ─────────────────────────────────────────────────────────
    state.phase = state.fixed ? 'done' : 'failed'
    callbacks?.onPhase?.(state)

    const elapsed = ((Date.now() - state.startTime) / 1000).toFixed(1)
    if (state.fixed) {
      log(`Restoration complete in ${elapsed}s after ${state.attempt - 1} attempt(s)`)
      auditAction(traceId, 'orchestrator', `Restoration complete`, { elapsed, attempts: state.attempt - 1 })
    } else {
      log(`Restoration failed after ${state.maxAttempts} attempt(s) in ${elapsed}s`)
      auditError(traceId, 'orchestrator', `Restoration failed`, { attempts: state.attempt - 1 })
    }
  } catch (err: any) {
    state.phase = 'failed'
    auditError(traceId, 'orchestrator', `Orchestration error: ${err.message}`)
    callbacks?.onError?.(err.message || String(err))
  }

  return state
}

// ─── Lightweight Loop (for streaming pipelines) ───────────────────────────────

/**
 * quickReason — Single REASON pass without full loop.
 * Used by streaming pipelines that just need analysis.
 */
export async function quickReason(targetUrl: string, context: Record<string, any>): Promise<string> {
  const result = await alphaCall('REASONING', [
    {
      role: 'system',
      content: 'You are a website health analyzer. Given scan data, identify issues and suggest fixes. Be concise.',
    },
    {
      role: 'user',
      content: `URL: ${targetUrl}\nContext: ${JSON.stringify(context).slice(0, 4000)}`,
    },
  ])
  return result.content
}
