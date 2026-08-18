/**
 * DIAGNOSTIC ENGINE — ROOT CAUSE RANKER
 *
 * Ranks hypotheses by confidence + evidence quality.
 * Selects primary hypothesis for first experiment.
 * Emits HYPOTHESIS_CREATED event.
 * Logs to audit-trail + reasoning-trace.
 */

import { auditDecision } from '../alpha-core/audit-trail.ts'
import { emitHypothesisCreated, emitReasoningTrace } from '../alpha-core/event-bus.ts'
import type { Hypothesis } from './hypothesis-generator.ts'

// ─── Evidence Quality Scoring ─────────────────────────────────────────────────

function evidenceQualityScore(hypothesis: Hypothesis): number {
  let score = 0

  // High confidence vulns count more
  for (const evidence of hypothesis.evidenceFor) {
    if (/critical|high/i.test(evidence)) score += 3
    else if (/npm audit|OSV|GHSA/i.test(evidence)) score += 2
    else if (/missing|changed recently/i.test(evidence)) score += 1
    else score += 0.5
  }

  // Penalty for evidence against
  score -= hypothesis.evidenceAgainst.length * 2

  // Bonus for specific experiments (not generic)
  if (hypothesis.experiment && hypothesis.experiment.length > 20) score += 1

  return Math.max(0, score)
}

// ─── Ranking ──────────────────────────────────────────────────────────────────

export interface RankedHypothesis extends Hypothesis {
  rank: number
  qualityScore: number
  isPrimary: boolean
}

export interface RankingResult {
  ranked: RankedHypothesis[]
  primary: RankedHypothesis
  reasoningTrace: {
    assessment: string
    hypotheses: { cause: string; confidence: number }[]
    evidence: string
    decision: string
  }
}

export function rankHypotheses(
  hypotheses: Hypothesis[],
  restorationId: string,
  sseWriter?: (data: string) => void
): RankingResult {
  // Score each hypothesis
  const scored = hypotheses.map(h => ({
    ...h,
    qualityScore: evidenceQualityScore(h),
  }))

  // Sort by: 1) confidence descending, 2) quality score descending
  scored.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence
    return b.qualityScore - a.qualityScore
  })

  // Assign ranks
  const ranked: RankedHypothesis[] = scored.map((h, i) => ({
    ...h,
    rank: i + 1,
    isPrimary: i === 0,
  }))

  const primary = ranked[0]

  // Build reasoning trace for UI
  const reasoningTrace = {
    assessment: `I found ${hypotheses.length} possible causes for the issue.`,
    hypotheses: ranked.map(h => ({
      cause: `${h.id}: ${h.cause}`,
      confidence: h.confidence,
    })),
    evidence: ranked
      .filter(h => h.evidenceFor.length > 0)
      .slice(0, 2)
      .map(h => `${h.evidenceFor[0]}`)
      .join(' + '),
    decision: `Testing highest-confidence hypothesis first (${primary.id}: ${primary.cause.slice(0, 50)}...)`,
  }

  // Emit HYPOTHESIS_CREATED event
  emitHypothesisCreated(
    restorationId,
    ranked.map(h => ({ cause: h.cause, confidence: h.confidence })),
    sseWriter
  )

  // Emit REASONING_TRACE event
  emitReasoningTrace(restorationId, reasoningTrace, sseWriter)

  // Log to audit trail
  auditDecision(restorationId, 'root-cause-ranker', `Ranked ${ranked.length} hypotheses. Primary: ${primary.id} (${primary.confidence}%)`, {
    ranked: ranked.map(h => ({
      id: h.id,
      cause: h.cause.slice(0, 80),
      confidence: h.confidence,
      qualityScore: h.qualityScore,
      isPrimary: h.isPrimary,
    })),
  })

  return { ranked, primary, reasoningTrace }
}
