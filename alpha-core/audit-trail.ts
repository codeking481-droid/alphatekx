/**
 * ALPHA CORE — AUDIT TRAIL
 * 
 * Logs every thought, action, tool call, and result to /tmp/alpha-audit.jsonl
 * Each restoration gets a traceId for correlation.
 * 
 * Append-only JSONL format for safe concurrent writes.
 */

import fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'

const AUDIT_DIR = tmpdir()
const AUDIT_FILE = path.join(AUDIT_DIR, 'alpha-audit.jsonl')

export type AuditLevel = 'thought' | 'action' | 'tool' | 'result' | 'error' | 'decision'

export interface AuditEntry {
  ts: string
  traceId: string
  level: AuditLevel
  module: string
  message: string
  data?: any
  durationMs?: number
}

// ─── Core Write ───────────────────────────────────────────────────────────────

function appendEntry(entry: AuditEntry): void {
  try {
    fs.appendFileSync(AUDIT_FILE, JSON.stringify(entry) + '\n')
  } catch {
    // Audit should never crash the pipeline
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * auditThought — Log an internal reasoning step.
 */
export function auditThought(traceId: string, module: string, message: string, data?: any): void {
  appendEntry({ ts: new Date().toISOString(), traceId, level: 'thought', module, message, data })
}

/**
 * auditAction — Log an action taken by the orchestrator.
 */
export function auditAction(traceId: string, module: string, message: string, data?: any): void {
  appendEntry({ ts: new Date().toISOString(), traceId, level: 'action', module, message, data })
}

/**
 * auditTool — Log a tool invocation (GitHub, Browser, etc).
 */
export function auditTool(traceId: string, module: string, message: string, data?: any): void {
  appendEntry({ ts: new Date().toISOString(), traceId, level: 'tool', module, message, data })
}

/**
 * auditResult — Log the result of an action/tool.
 */
export function auditResult(traceId: string, module: string, message: string, data?: any, durationMs?: number): void {
  appendEntry({ ts: new Date().toISOString(), traceId, level: 'result', module, message, data, durationMs })
}

/**
 * auditError — Log an error.
 */
export function auditError(traceId: string, module: string, message: string, data?: any): void {
  appendEntry({ ts: new Date().toISOString(), traceId, level: 'error', module, message, data })
}

/**
 * auditDecision — Log a decision point (e.g., chose approach A over B).
 */
export function auditDecision(traceId: string, module: string, message: string, data?: any): void {
  appendEntry({ ts: new Date().toISOString(), traceId, level: 'decision', module, message, data })
}

/**
 * getAuditTrail — Read all entries for a specific traceId.
 */
export function getAuditTrail(traceId: string): AuditEntry[] {
  try {
    const content = fs.readFileSync(AUDIT_FILE, 'utf8')
    return content.split('\n')
      .filter(line => line.trim())
      .map(line => {
        try { return JSON.parse(line) } catch { return null }
      })
      .filter((e): e is AuditEntry => e !== null && e.traceId === traceId)
  } catch {
    return []
  }
}

/**
 * getRecentAuditTrail — Read last N entries across all traces.
 */
export function getRecentAuditTrail(limit: number = 50): AuditEntry[] {
  try {
    const content = fs.readFileSync(AUDIT_FILE, 'utf8')
    const lines = content.split('\n').filter(line => line.trim())
    return lines.slice(-limit).map(line => {
      try { return JSON.parse(line) } catch { return null }
    }).filter((e): e is AuditEntry => e !== null)
  } catch {
    return []
  }
}

/**
 * newTraceId — Generate a unique trace ID for a restoration.
 */
export function newTraceId(): string {
  return `trace_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
