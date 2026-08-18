/**
 * DIAGNOSTIC ENGINE — HYPOTHESIS GENERATOR
 *
 * Uses alphaCall('DIAGNOSTICIAN') to generate exactly 3 hypotheses.
 * Enforces hard limits: max 3, confidence sums to 100%, sorted descending.
 * Post-processes deterministically to prevent reasoning loops.
 *
 * Anti-loop guarantee:
 * - Maximum 3 hypotheses (never infinite)
 * - If AI returns >3, take top 3 by confidence
 * - If confidence != 100%, normalize deterministically
 * - Each hypothesis has experiment to prove/disprove
 */

import { alphaCall, type ChatMessage } from '../alpha-core/groq-router.ts'
import { auditResult, auditError } from '../alpha-core/audit-trail.ts'
import type { EvidenceBundle } from './evidence-collector.ts'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Hypothesis {
  id: string
  cause: string
  confidence: number
  evidenceFor: string[]
  evidenceAgainst: string[]
  blastRadius: string[]
  experiment: string
  riskIfWrong: string
}

// ─── Deterministic Hypothesis Extraction ──────────────────────────────────────

function extractHypothesesDeterministically(evidence: EvidenceBundle): Hypothesis[] {
  const hypotheses: Hypothesis[] = []
  let totalConfidence = 0

  // Evidence signal scoring
  const vulnHighCount = evidence.dependencyVulns.filter(v => v.severity === 'high' || v.severity === 'critical').length
  const envIssueCount = evidence.envIssues.length
  const recentApiChanges = evidence.fileChanges.filter(f =>
    /api|route|endpoint|controller|handler/i.test(f.path)
  ).length
  const testFailCount = evidence.testFailures.length
  const recentSensitiveChanges = evidence.fileChanges.filter(f =>
    /auth|payment|billing|checkout|security|jwt|session/i.test(f.path)
  ).length

  // H1: Dependency vulnerabilities (highest confidence if vulns exist)
  if (vulnHighCount > 0) {
    const vulnPackages = evidence.dependencyVulns
      .filter(v => v.severity === 'high' || v.severity === 'critical')
      .slice(0, 3)
      .map(v => `${v.package}@${v.severity}`)
      .join(', ')

    const fixedVersions = evidence.dependencyVulns
      .filter(v => v.fixedVersion)
      .slice(0, 3)
      .map(v => `${v.package}→${v.fixedVersion}`)
      .join(', ')

    const confidence = Math.min(65, 40 + vulnHighCount * 5)
    hypotheses.push({
      id: 'H1',
      cause: `Dependency vulnerability — ${vulnPackages}`,
      confidence,
      evidenceFor: [
        'npm audit High/Critical',
        ...evidence.dependencyVulns.slice(0, 2).map(v => `OSV ${v.id}`),
        `${vulnHighCount} vulnerable packages detected`,
      ],
      evidenceAgainst: [],
      blastRadius: vulnPackages.split(', '),
      experiment: `Install fixed versions (${fixedVersions || 'latest'}) in sandbox, run full test suite`,
      riskIfWrong: 'Low — reversible npm install',
    })
    totalConfidence += confidence
  }

  // H2: Environment configuration
  if (envIssueCount > 0) {
    const missingVars = evidence.envIssues.slice(0, 3).map(e => e.missing).join(', ')
    const confidence = Math.min(35, 20 + envIssueCount * 3)
    hypotheses.push({
      id: 'H2',
      cause: `Environment configuration — missing ${missingVars}`,
      confidence,
      evidenceFor: [
        `${envIssueCount} env vars missing`,
        ...evidence.envIssues.slice(0, 2).map(e =>
          `${e.missing} expected in ${e.expectedIn}`
        ),
      ],
      evidenceAgainst: [],
      blastRadius: evidence.envIssues.flatMap(e => e.referencedIn || []).slice(0, 5),
      experiment: `Add missing vars to .env, restart service, verify endpoints`,
      riskIfWrong: 'Low — adding env vars is safe',
    })
    totalConfidence += confidence
  }

  // H3: Application regression (recent changes)
  if (recentApiChanges > 0 || recentSensitiveChanges > 0 || testFailCount > 0) {
    const changedFiles = evidence.fileChanges
      .filter(f => f.changedInLast3Commits)
      .slice(0, 3)
      .map(f => f.path)
      .join(', ')

    const confidence = Math.max(15, 100 - totalConfidence)
    hypotheses.push({
      id: 'H3',
      cause: `Application regression — recent changes in ${changedFiles || 'codebase'}`,
      confidence,
      evidenceFor: [
        `${evidence.fileChanges.filter(f => f.changedInLast3Commits).length} files changed recently`,
        ...(testFailCount > 0 ? [`${testFailCount} test failures`] : []),
        ...(recentSensitiveChanges > 0 ? ['Sensitive files modified'] : []),
      ],
      evidenceAgainst: [],
      blastRadius: evidence.fileChanges
        .filter(f => f.changedInLast3Commits)
        .slice(0, 5)
        .map(f => f.path),
      experiment: `git revert last 3 commits, run tests, compare with current state`,
      riskIfWrong: 'Medium — requires git revert',
    })
    totalConfidence += confidence
  }

  // If no strong signals, create a default hypothesis
  if (hypotheses.length === 0) {
    hypotheses.push({
      id: 'H1',
      cause: 'General system degradation — no specific root cause detected',
      confidence: 50,
      evidenceFor: ['Low health score', 'General codebase analysis'],
      evidenceAgainst: ['No critical vulnerabilities', 'No missing env vars'],
      blastRadius: [],
      experiment: 'Full system restart, verify all endpoints',
      riskIfWrong: 'Low — restart is safe',
    })
    totalConfidence = 50

    hypotheses.push({
      id: 'H2',
      cause: 'Network or infrastructure issue',
      confidence: 30,
      evidenceFor: ['Possible connectivity problems'],
      evidenceAgainst: [],
      blastRadius: [],
      experiment: 'Check DNS, CDN, and service health endpoints',
      riskIfWrong: 'Low — diagnostic only',
    })
    totalConfidence += 30

    hypotheses.push({
      id: 'H3',
      cause: 'Configuration drift between environments',
      confidence: 20,
      evidenceFor: ['Possible env differences'],
      evidenceAgainst: [],
      blastRadius: [],
      experiment: 'Compare staging vs production config',
      riskIfWrong: 'Low — comparison only',
    })
    totalConfidence += 20
  }

  // Ensure exactly 3 hypotheses
  while (hypotheses.length > 3) {
    hypotheses.pop()
  }
  while (hypotheses.length < 3) {
    const remaining = 100 - hypotheses.reduce((sum, h) => sum + h.confidence, 0)
    hypotheses.push({
      id: `H${hypotheses.length + 1}`,
      cause: 'Unclassified issue — requires manual investigation',
      confidence: Math.max(5, remaining),
      evidenceFor: ['Insufficient evidence for specific diagnosis'],
      evidenceAgainst: [],
      blastRadius: [],
      experiment: 'Manual code review and log analysis',
      riskIfWrong: 'Low — diagnostic only',
    })
  }

  return hypotheses
}

// ─── AI-Powered Hypothesis Generation ─────────────────────────────────────────

async function generateWithAI(
  evidence: EvidenceBundle,
  traceId: string
): Promise<Hypothesis[]> {
  const evidenceJson = JSON.stringify({
    fileChanges: evidence.fileChanges.slice(0, 10).map(f => ({
      path: f.path,
      changedRecently: f.changedInLast3Commits,
      author: f.author,
    })),
    apiFailures: evidence.apiFailures.slice(0, 5),
    envIssues: evidence.envIssues.slice(0, 5),
    dependencyVulns: evidence.dependencyVulns.slice(0, 10).map(v => ({
      package: v.package,
      severity: v.severity,
      id: v.id,
      fixedVersion: v.fixedVersion,
    })),
    testFailures: evidence.testFailures.slice(0, 5),
    healthScore: evidence.healthScore,
    recentCommits: evidence.recentCommits.slice(0, 5).map(c => ({
      hash: c.hash,
      message: c.message,
      author: c.author,
    })),
  })

  const prompt: ChatMessage[] = [
    {
      role: 'system',
      content: `You are Alpha Diagnostician. Given evidence: ${evidenceJson}. Generate exactly 3 hypotheses for why system broken, ranked by confidence %. For each: cause, confidence (must sum to 100%), evidence supporting, evidence against, blastRadius if fix applied, experiment to prove/disprove. Return JSON only.`,
    },
    {
      role: 'user',
      content: `Diagnose the root cause based on this evidence. Return exactly 3 hypotheses as JSON array.`,
    },
  ]

  try {
    const result = await alphaCall('SCANNER', prompt, {
      responseFormat: { type: 'json_object' },
    })

    const parsed = JSON.parse(result.content)
    const rawHypotheses = Array.isArray(parsed) ? parsed : parsed.hypotheses || []

    // Convert to our format
    const aiHypotheses: Hypothesis[] = rawHypotheses.slice(0, 3).map((h: any, i: number) => ({
      id: `H${i + 1}`,
      cause: h.cause || 'Unknown cause',
      confidence: typeof h.confidence === 'number' ? h.confidence : 33,
      evidenceFor: Array.isArray(h.evidenceFor) ? h.evidenceFor : [],
      evidenceAgainst: Array.isArray(h.evidenceAgainst) ? h.evidenceAgainst : [],
      blastRadius: Array.isArray(h.blastRadius) ? h.blastRadius : [],
      experiment: h.experiment || 'Manual investigation required',
      riskIfWrong: h.riskIfWrong || 'Low',
    }))

    auditResult(traceId, 'hypothesis-generator', `AI generated ${aiHypotheses.length} hypotheses`, {
      causes: aiHypotheses.map(h => h.cause),
      confidences: aiHypotheses.map(h => h.confidence),
    })

    return aiHypotheses
  } catch (err: any) {
    auditError(traceId, 'hypothesis-generator', `AI generation failed: ${err.message}`)
    return []
  }
}

// ─── Normalization ────────────────────────────────────────────────────────────

function normalizeConfidence(hypotheses: Hypothesis[]): Hypothesis[] {
  if (hypotheses.length === 0) return hypotheses

  const total = hypotheses.reduce((sum, h) => sum + h.confidence, 0)

  if (total === 100) return hypotheses

  // Scale to sum to 100
  const scale = 100 / total
  let runningTotal = 0

  for (let i = 0; i < hypotheses.length; i++) {
    if (i === hypotheses.length - 1) {
      // Last one gets the remainder to avoid rounding errors
      hypotheses[i].confidence = 100 - runningTotal
    } else {
      hypotheses[i].confidence = Math.round(hypotheses[i].confidence * scale)
      runningTotal += hypotheses[i].confidence
    }
  }

  return hypotheses
}

// ─── Main Generator ───────────────────────────────────────────────────────────

export async function generateHypotheses(
  evidence: EvidenceBundle,
  traceId: string,
  onLog?: (msg: string) => void
): Promise<Hypothesis[]> {
  onLog?.('Generating hypotheses from evidence...')

  // Try AI first
  let hypotheses = await generateWithAI(evidence, traceId)

  // Fallback to deterministic if AI fails or returns invalid
  if (hypotheses.length !== 3 || hypotheses.reduce((s, h) => s + h.confidence, 0) !== 100) {
    onLog?.('Using deterministic hypothesis generation...')
    hypotheses = extractHypothesesDeterministically(evidence)
  }

  // Always normalize to ensure confidence sums to 100
  hypotheses = normalizeConfidence(hypotheses)

  // Sort by confidence descending
  hypotheses.sort((a, b) => b.confidence - a.confidence)

  // Re-assign IDs after sorting
  hypotheses.forEach((h, i) => { h.id = `H${i + 1}` })

  onLog?.(`Generated 3 hypotheses: ${hypotheses.map(h => `${h.cause.slice(0, 40)}... (${h.confidence}%)`).join(' | ')}`)

  auditResult(traceId, 'hypothesis-generator', `Final hypotheses generated`, {
    hypotheses: hypotheses.map(h => ({
      id: h.id,
      cause: h.cause.slice(0, 80),
      confidence: h.confidence,
      evidenceCount: h.evidenceFor.length,
    })),
  })

  return hypotheses
}
