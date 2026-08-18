/**
 * SYSTEM X-RAY — OSV CLIENT
 * 
 * Queries OSV.dev for known vulnerabilities in dependencies.
 * No API key needed. Rate-limit: 100ms between calls. Max 50 packages per batch.
 * 
 * OSV Batch API: POST https://api.osv.dev/v1/querybatch
 * Single query: POST https://api.osv.dev/v1/query
 */

import { auditTool, auditError } from '../alpha-core/audit-trail.ts'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OsvVulnerability {
  id: string           // e.g. "GHSA-xxxx-xxxx-xxxx"
  summary: string
  details: string
  severity: string     // "CRITICAL", "HIGH", "MEDIUM", "LOW"
  package: string
  ecosystem: string    // "npm", "PyPI", "Go", "Maven"
  affectedVersions: string
  fixedVersion?: string
  published: string
  references: string[]
  aliases: string[]    // CVE IDs
}

export interface OsvBatchResult {
  package: string
  version: string
  vulnerabilities: OsvVulnerability[]
  error?: string
}

// ─── Rate Limiter ─────────────────────────────────────────────────────────────

let lastRequestMs = 0
const THROTTLE_MS = 100

async function throttle(): Promise<void> {
  const now = Date.now()
  const wait = THROTTLE_MS - (now - lastRequestMs)
  if (wait > 0) {
    await new Promise(resolve => setTimeout(resolve, wait))
  }
  lastRequestMs = Date.now()
}

// ─── Single Package Query ─────────────────────────────────────────────────────

async function queryOsvSingle(
  name: string,
  version: string,
  ecosystem: string = 'npm'
): Promise<OsvVulnerability[]> {
  await throttle()

  try {
    const res = await fetch('https://api.osv.dev/v1/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        package: { name, ecosystem },
        version,
      }),
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`OSV API ${res.status}: ${body.slice(0, 200)}`)
    }

    const data = await res.json() as any
    const vulns = data.vulns || []

    return vulns.map((v: any) => ({
      id: v.id || v.aliases?.[0] || 'unknown',
      summary: v.summary || v.details?.slice(0, 200) || 'No summary',
      details: v.details || '',
      severity: extractSeverity(v),
      package: name,
      ecosystem,
      affectedVersions: extractAffectedVersions(v),
      fixedVersion: extractFixedVersion(v),
      published: v.published || v.modified || '',
      references: (v.references || []).map((r: any) => r.url || ''),
      aliases: v.aliases || [],
    }))
  } catch (err: any) {
    throw new Error(`OSV query failed for ${name}@${version}: ${err.message}`)
  }
}

// ─── Batch Query (up to 50 packages) ─────────────────────────────────────────

async function queryOsvBatch(
  queries: { name: string; version: string; ecosystem: string }[]
): Promise<OsvBatchResult[]> {
  await throttle()

  const batchQueries = queries.map(q => ({
    package: { name: q.name, ecosystem: q.ecosystem },
    version: q.version,
  }))

  try {
    const res = await fetch('https://api.osv.dev/v1/querybatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queries: batchQueries }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`OSV batch API ${res.status}: ${body.slice(0, 200)}`)
    }

    const data = await res.json() as any
    const results = data.results || []

    return results.map((result: any, i: number) => {
      const query = queries[i]
      const vulns = (result.vulns || []).map((v: any) => ({
        id: v.id || v.aliases?.[0] || 'unknown',
        summary: v.summary || v.details?.slice(0, 200) || 'No summary',
        details: v.details || '',
        severity: extractSeverity(v),
        package: query.name,
        ecosystem: query.ecosystem,
        affectedVersions: extractAffectedVersions(v),
        fixedVersion: extractFixedVersion(v),
        published: v.published || v.modified || '',
        references: (v.references || []).map((r: any) => r.url || ''),
        aliases: v.aliases || [],
      }))

      return {
        package: query.name,
        version: query.version,
        vulnerabilities: vulns,
      }
    })
  } catch (err: any) {
    // Return error results for each query
    return queries.map(q => ({
      package: q.name,
      version: q.version,
      vulnerabilities: [],
      error: err.message,
    }))
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractSeverity(vuln: any): string {
  // Check severity array first
  if (vuln.severity?.length > 0) {
    const score = vuln.severity.find((s: any) => s.type === 'CVSS_V3' || s.type === 'CVSS_V2')
    if (score?.score) {
      const cvss = parseCvssScore(score.score)
      if (cvss >= 9) return 'CRITICAL'
      if (cvss >= 7) return 'HIGH'
      if (cvss >= 4) return 'MEDIUM'
      return 'LOW'
    }
  }

  // Check ecosystem_specific or database_specific
  const dbSpecific = vuln.database_specific?.severity
  if (dbSpecific) return dbSpecific.toUpperCase()

  return 'MEDIUM' // default
}

function parseCvssScore(vector: string): number {
  // Parse CVSS vector string to get base score
  const avMatch = vector.match(/AV:[A-Z]/)
  const acMatch = vector.match(/AC:[A-Z]/)
  const prMatch = vector.match(/PR:[A-Z]/)
  const uiMatch = vector.match(/UI:[A-Z]/)

  // Simplified scoring based on CVSS v3.1 components
  let score = 5.0 // base
  if (avMatch?.[0]?.includes('N')) score += 1.5
  if (acMatch?.[0]?.includes('L')) score += 1.0
  if (prMatch?.[0]?.includes('N')) score += 1.5
  if (uiMatch?.[0]?.includes('N')) score += 1.0

  return Math.min(10, score)
}

function extractAffectedVersions(vuln: any): string {
  const ranges = vuln.affected?.[0]?.versions || []
  if (ranges.length > 0) return ranges.join(', ')

  // Try to extract from ranges
  const rangeObj = vuln.affected?.[0]?.ranges?.[0]
  if (rangeObj?.events) {
    const introduced = rangeObj.events.find((e: any) => e.introduced)?.introduced
    const fixed = rangeObj.events.find((e: any) => e.fixed)?.fixed
    if (introduced && fixed) return `${introduced} - <${fixed}`
    if (introduced) return `>= ${introduced}`
  }

  return 'unknown'
}

function extractFixedVersion(vuln: any): string | undefined {
  const rangeObj = vuln.affected?.[0]?.ranges?.[0]
  if (rangeObj?.events) {
    const fixed = rangeObj.events.find((e: any) => e.fixed)?.fixed
    if (fixed) return fixed
  }
  return undefined
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * queryVulnerabilities — Check a list of packages for known vulnerabilities.
 * Automatically batches and throttles.
 * 
 * @param packages - Array of { name, version, ecosystem }
 * @param traceId - For audit trail
 * @returns Array of OsvBatchResult with vulnerability details
 */
export async function queryVulnerabilities(
  packages: { name: string; version: string; ecosystem?: string }[],
  traceId: string = 'system-xray'
): Promise<OsvBatchResult[]> {
  // Cap at 50 packages per batch
  const capped = packages.slice(0, 50)

  auditTool(traceId, 'osv-client', `Querying OSV for ${capped.length} packages`)

  // Normalize version strings (remove ^ ~ >= etc.)
  const normalized = capped.map(p => ({
    name: p.name,
    version: p.version.replace(/^[^0-9]*/, ''),
    ecosystem: p.ecosystem || 'npm',
  }))

  // Filter out packages with unparseable versions
  const valid = normalized.filter(p => /^\d/.test(p.version))
  const skipped = normalized.length - valid.length

  if (skipped > 0) {
    auditTool(traceId, 'osv-client', `Skipped ${skipped} packages with unparseable versions`)
  }

  // Batch query
  let results: OsvBatchResult[]
  if (valid.length <= 20) {
    // Small batch: single request
    results = await queryOsvBatch(valid)
  } else {
    // Large batch: split into chunks of 20
    results = []
    for (let i = 0; i < valid.length; i += 20) {
      const chunk = valid.slice(i, i + 20)
      const chunkResults = await queryOsvBatch(chunk)
      results.push(...chunkResults)
    }
  }

  // Add skipped packages as empty results
  for (const p of normalized.slice(valid.length)) {
    results.push({ package: p.name, version: p.version, vulnerabilities: [] })
  }

  const vulnCount = results.reduce((sum, r) => sum + r.vulnerabilities.length, 0)
  auditTool(traceId, 'osv-client', `OSV results: ${vulnCount} vulnerabilities found in ${results.length} packages`)

  return results
}

/**
 * querySinglePackage — Check one package for vulnerabilities.
 * Convenience wrapper for single queries.
 */
export async function querySinglePackage(
  name: string,
  version: string,
  ecosystem: string = 'npm'
): Promise<OsvVulnerability[]> {
  return queryOsvSingle(name, version, ecosystem)
}
