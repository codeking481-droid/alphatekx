/**
 * ALPHA CORE — EVENT BUS
 *
 * Event-driven engine for the Alpha Activity Stream.
 * Emits events, not UI instructions. Frontend decides visual.
 *
 * Events are:
 * - Logged to audit-trail.ts
 * - Sent via SSE to frontend
 * - Stored in /tmp/alpha-events-{id}.jsonl for Replay
 */

import fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { auditAction, auditTool, auditResult, auditError } from './audit-trail.ts'

// ─── Event Types ──────────────────────────────────────────────────────────────

export type AlphaEvent =
  | { type: 'RESTORATION_STARTED'; timestamp: string; data?: any }
  | { type: 'REPOSITORY_SCANNED'; timestamp: string; data: { totalFiles: number; stack: any; entryPoints: any[] } }
  | { type: 'FILE_OPENED'; timestamp: string; data: { path: string; contentPreview: string } }
  | { type: 'COMMAND_STARTED'; timestamp: string; data: { cmd: string } }
  | { type: 'COMMAND_FINISHED'; timestamp: string; data: { cmd: string; output: string; success: boolean } }
  | { type: 'BROWSER_OPENED'; timestamp: string; data: { url: string } }
  | { type: 'PAGE_NAVIGATED'; timestamp: string; data: { url: string; screenshotUrl?: string } }
  | { type: 'ERROR_DETECTED'; timestamp: string; data: { message: string; file?: string; line?: number } }
  | { type: 'HYPOTHESIS_CREATED'; timestamp: string; data: { hypotheses: { cause: string; confidence: number }[] } }
  | { type: 'EXPERIMENT_STARTED'; timestamp: string; data: { hypothesisId: number } }
  | { type: 'FILE_MODIFIED'; timestamp: string; data: { path: string; diff: string } }
  | { type: 'TEST_STARTED'; timestamp: string; data: { count: number } }
  | { type: 'TEST_FINISHED'; timestamp: string; data: { passed: number; failed: number } }
  | { type: 'COMPONENT_HEALTH_CHANGED'; timestamp: string; data: { component: string; oldHealth: string; newHealth: string } }
  | { type: 'VERIFICATION_PASSED'; timestamp: string; data?: any }
  | { type: 'RESTORATION_COMPLETED'; timestamp: string; data: { healthBefore: number; healthAfter: number; filesModified: number; testsPassed: number } }
  | { type: 'REASONING_TRACE'; timestamp: string; data: { assessment: string; hypotheses: { cause: string; confidence: number }[]; evidence: string; decision: string } }

export type AlphaEventHandler = (event: AlphaEvent) => void

// ─── Event Store ──────────────────────────────────────────────────────────────

interface EventStore {
  id: string
  events: AlphaEvent[]
  startTime: string
}

const stores = new Map<string, EventStore>()

function getOrCreateStore(id: string): EventStore {
  if (!stores.has(id)) {
    stores.set(id, {
      id,
      events: [],
      startTime: new Date().toISOString(),
    })
  }
  return stores.get(id)!
}

// ─── SSE Listeners ────────────────────────────────────────────────────────────

const sseListeners = new Map<string, Set<AlphaEventHandler>>()

// ─── Emit ─────────────────────────────────────────────────────────────────────

/**
 * emit — The single entry point for all Alpha events.
 *
 * @param restorationId - Unique ID for this restoration session
 * @param event - The event to emit
 * @param sseWriter - Optional SSE write function: (data: string) => void
 */
export function emit(
  restorationId: string,
  event: AlphaEvent,
  sseWriter?: (data: string) => void
): void {
  const store = getOrCreateStore(restorationId)

  // Store event
  store.events.push(event)

  // Log to audit trail
  const auditData = { eventType: event.type, ...(event.data || {}) }
  auditTool(restorationId, 'event-bus', `Event: ${event.type}`, auditData)

  // Write to events JSONL file for replay
  writeEventFile(restorationId, event)

  // Send via SSE
  if (sseWriter) {
    try {
      sseWriter(`data: ${JSON.stringify({ type: 'alpha_event', event })}\n\n`)
    } catch {
      // SSE write failed - continue silently
    }
  }

  // Notify direct listeners
  const listeners = sseListeners.get(restorationId)
  if (listeners) {
    for (const handler of listeners) {
      try {
        handler(event)
      } catch {
        // Handler error - continue
      }
    }
  }
}

// ─── Event File Persistence ───────────────────────────────────────────────────

function writeEventFile(restorationId: string, event: AlphaEvent): void {
  try {
    const eventsDir = tmpdir()
    const eventsFile = path.join(eventsDir, `alpha-events-${restorationId}.jsonl`)
    fs.appendFileSync(eventsFile, JSON.stringify(event) + '\n')
  } catch {
    // File write should never crash the pipeline
  }
}

/**
 * getEventTimeline — Read all events for a restoration session.
 * Used for replay functionality.
 */
export function getEventTimeline(restorationId: string): AlphaEvent[] {
  const store = stores.get(restorationId)
  if (store) return store.events

  // Fallback: read from file
  try {
    const eventsFile = path.join(tmpdir(), `alpha-events-${restorationId}.jsonl`)
    const content = fs.readFileSync(eventsFile, 'utf8')
    return content
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try { return JSON.parse(line) } catch { return null }
      })
      .filter((e): e is AlphaEvent => e !== null)
  } catch {
    return []
  }
}

// ─── Listener API ─────────────────────────────────────────────────────────────

/**
 * subscribe — Register a listener for a restoration session.
 * Returns unsubscribe function.
 */
export function subscribe(restorationId: string, handler: AlphaEventHandler): () => void {
  if (!sseListeners.has(restorationId)) {
    sseListeners.set(restorationId, new Set())
  }
  sseListeners.get(restorationId)!.add(handler)

  return () => {
    sseListeners.get(restorationId)?.delete(handler)
  }
}

// ─── Convenience Emitters ─────────────────────────────────────────────────────

export function emitRestorationStarted(id: string, sseWriter?: (data: string) => void): void {
  emit(id, { type: 'RESTORATION_STARTED', timestamp: new Date().toISOString() }, sseWriter)
}

export function emitRepositoryScanned(
  id: string,
  data: { totalFiles: number; stack: any; entryPoints: any[] },
  sseWriter?: (data: string) => void
): void {
  emit(id, { type: 'REPOSITORY_SCANNED', timestamp: new Date().toISOString(), data }, sseWriter)
}

export function emitFileOpened(
  id: string,
  filePath: string,
  contentPreview: string,
  sseWriter?: (data: string) => void
): void {
  emit(id, { type: 'FILE_OPENED', timestamp: new Date().toISOString(), data: { path: filePath, contentPreview } }, sseWriter)
}

export function emitCommandStarted(id: string, cmd: string, sseWriter?: (data: string) => void): void {
  emit(id, { type: 'COMMAND_STARTED', timestamp: new Date().toISOString(), data: { cmd } }, sseWriter)
}

export function emitCommandFinished(
  id: string,
  cmd: string,
  output: string,
  success: boolean,
  sseWriter?: (data: string) => void
): void {
  emit(id, { type: 'COMMAND_FINISHED', timestamp: new Date().toISOString(), data: { cmd, output, success } }, sseWriter)
}

export function emitBrowserOpened(id: string, url: string, sseWriter?: (data: string) => void): void {
  emit(id, { type: 'BROWSER_OPENED', timestamp: new Date().toISOString(), data: { url } }, sseWriter)
}

export function emitPageNavigated(
  id: string,
  url: string,
  screenshotUrl?: string,
  sseWriter?: (data: string) => void
): void {
  emit(id, { type: 'PAGE_NAVIGATED', timestamp: new Date().toISOString(), data: { url, screenshotUrl } }, sseWriter)
}

export function emitErrorDetected(
  id: string,
  message: string,
  file?: string,
  line?: number,
  sseWriter?: (data: string) => void
): void {
  emit(id, { type: 'ERROR_DETECTED', timestamp: new Date().toISOString(), data: { message, file, line } }, sseWriter)
}

export function emitHypothesisCreated(
  id: string,
  hypotheses: { cause: string; confidence: number }[],
  sseWriter?: (data: string) => void
): void {
  emit(id, { type: 'HYPOTHESIS_CREATED', timestamp: new Date().toISOString(), data: { hypotheses } }, sseWriter)
}

export function emitExperimentStarted(id: string, hypothesisId: number, sseWriter?: (data: string) => void): void {
  emit(id, { type: 'EXPERIMENT_STARTED', timestamp: new Date().toISOString(), data: { hypothesisId } }, sseWriter)
}

export function emitFileModified(id: string, filePath: string, diff: string, sseWriter?: (data: string) => void): void {
  emit(id, { type: 'FILE_MODIFIED', timestamp: new Date().toISOString(), data: { path: filePath, diff } }, sseWriter)
}

export function emitTestStarted(id: string, count: number, sseWriter?: (data: string) => void): void {
  emit(id, { type: 'TEST_STARTED', timestamp: new Date().toISOString(), data: { count } }, sseWriter)
}

export function emitTestFinished(id: string, passed: number, failed: number, sseWriter?: (data: string) => void): void {
  emit(id, { type: 'TEST_FINISHED', timestamp: new Date().toISOString(), data: { passed, failed } }, sseWriter)
}

export function emitComponentHealthChanged(
  id: string,
  component: string,
  oldHealth: string,
  newHealth: string,
  sseWriter?: (data: string) => void
): void {
  emit(id, { type: 'COMPONENT_HEALTH_CHANGED', timestamp: new Date().toISOString(), data: { component, oldHealth, newHealth } }, sseWriter)
}

export function emitVerificationPassed(id: string, sseWriter?: (data: string) => void): void {
  emit(id, { type: 'VERIFICATION_PASSED', timestamp: new Date().toISOString() }, sseWriter)
}

export function emitRestorationCompleted(
  id: string,
  data: { healthBefore: number; healthAfter: number; filesModified: number; testsPassed: number },
  sseWriter?: (data: string) => void
): void {
  emit(id, { type: 'RESTORATION_COMPLETED', timestamp: new Date().toISOString(), data }, sseWriter)
}

export function emitReasoningTrace(
  id: string,
  data: { assessment: string; hypotheses: { cause: string; confidence: number }[]; evidence: string; decision: string },
  sseWriter?: (data: string) => void
): void {
  emit(id, { type: 'REASONING_TRACE', timestamp: new Date().toISOString(), data }, sseWriter)
}
