/**
 * ALPHA CORE — Entry Point
 * 
 * Import from here to access all alpha-core modules.
 * 
 * Usage:
 *   import { alphaCall, AlphaModels, runOrchestration, auditAction, createBudget } from './alpha-core/index.ts'
 */

export { AlphaModels, alphaCall, alphaChat, alphaText, alphaTranscribe, getAvailableModels } from './groq-router.ts'
export type { AlphaModelRole, AlphaModelId, AlphaCallResult, ChatMessage } from './groq-router.ts'

export { runOrchestration, quickReason } from './orchestrator.ts'
export type { Phase, Step, OrchestratorState, OrchestratorCallbacks } from './orchestrator.ts'

export {
  newTraceId,
  auditThought,
  auditAction,
  auditTool,
  auditResult,
  auditError,
  auditDecision,
  getAuditTrail,
  getRecentAuditTrail,
} from './audit-trail.ts'
export type { AuditLevel, AuditEntry } from './audit-trail.ts'

export {
  createBudget,
  estimateCost,
  recordUsage,
  recordAttempt,
  checkBudget,
  finalizeBudget,
  cleanupBudget,
  getBudgetSummary,
} from './budget-guard.ts'
export type { BudgetConfig, BudgetState } from './budget-guard.ts'
