/**
 * SERVER — DIAGNOSE ROUTE
 *
 * POST /api/diagnose
 * Takes repo id, loads system_graph.json + evidence bundle
 * Calls evidence-collector → hypothesis-generator → root-cause-ranker
 * Returns { hypotheses, primaryHypothesis, evidenceBundle }
 * Emits HYPOTHESIS_CREATED event
 */

import fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { collectEvidence } from '../diagnostic/evidence-collector.ts'
import { generateHypotheses } from '../diagnostic/hypothesis-generator.ts'
import { rankHypotheses } from '../diagnostic/root-cause-ranker.ts'
import { newTraceId } from '../alpha-core/audit-trail.ts'
import { emitRestorationStarted } from '../alpha-core/event-bus.ts'

// ─── SSE Writer Factory ───────────────────────────────────────────────────────

function createSseWriter(res) {
  return (data) => {
    try {
      res.write(data)
    } catch {
      // SSE write failed
    }
  }
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

export async function handleDiagnoseRoute(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  // Parse body
  let body = {}
  try {
    const chunks = []
    for await (const chunk of req) {
      chunks.push(chunk)
    }
    body = JSON.parse(Buffer.concat(chunks).toString())
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Invalid JSON body' }))
    return
  }

  const { scanId, repoId, healthReport, enrichedGraph } = body

  if (!scanId && !repoId) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Missing scanId or repoId' }))
    return
  }

  const restorationId = scanId || repoId
  const traceId = newTraceId()
  const repoPath = path.join(tmpdir(), `github-${restorationId}`)

  // Check repo exists
  if (!fs.existsSync(repoPath)) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Repository not found', repoPath }))
    return
  }

  // Set up SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  const sseWriter = createSseWriter(res)

  // Emit restoration started
  emitRestorationStarted(restorationId, sseWriter)

  try {
    // Step 1: Collect evidence
    sseWriter(`data: ${JSON.stringify({ type: 'log', text: 'Collecting evidence from repository...' })}\n\n`)
    const evidence = collectEvidence(
      repoPath,
      restorationId,
      healthReport,
      enrichedGraph,
      traceId,
      (msg) => sseWriter(`data: ${JSON.stringify({ type: 'log', text: msg })}\n\n`)
    )

    // Step 2: Generate hypotheses
    sseWriter(`data: ${JSON.stringify({ type: 'log', text: 'Generating hypotheses from evidence...' })}\n\n`)
    const hypotheses = await generateHypotheses(
      evidence,
      traceId,
      (msg) => sseWriter(`data: ${JSON.stringify({ type: 'log', text: msg })}\n\n`)
    )

    // Step 3: Rank hypotheses
    sseWriter(`data: ${JSON.stringify({ type: 'log', text: 'Ranking hypotheses by confidence and evidence quality...' })}\n\n`)
    const ranking = rankHypotheses(hypotheses, restorationId, sseWriter)

    // Send final result
    const result = {
      ok: true,
      hypotheses: ranking.ranked,
      primaryHypothesis: ranking.primary,
      evidenceBundle: {
        healthScore: evidence.healthScore,
        fileChangesCount: evidence.fileChanges.length,
        envIssuesCount: evidence.envIssues.length,
        vulnCount: evidence.dependencyVulns.length,
        testFailuresCount: evidence.testFailures.length,
        apiFailuresCount: evidence.apiFailures.length,
      },
      reasoningTrace: ranking.reasoningTrace,
    }

    sseWriter(`data: ${JSON.stringify({ type: 'diagnosis_complete', result })}\n\n`)
    sseWriter(`data: [DONE]\n\n`)

    res.end()
  } catch (err) {
    console.error('[DIAGNOSE] Error:', err)
    sseWriter(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`)
    sseWriter(`data: [DONE]\n\n`)
    res.end()
  }
}
