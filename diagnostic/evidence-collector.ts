/**
 * DIAGNOSTIC ENGINE — EVIDENCE COLLECTOR
 *
 * Collects deterministic evidence from:
 * - system_graph.json (from scanner)
 * - /tmp/alpha-events-{id}.jsonl (event log)
 * - git log (last 20 commits)
 * - CI logs (if available)
 * - File system observations
 *
 * NO AI GUESSING — only parse real files/logs.
 */

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { auditAction, auditResult } from '../alpha-core/audit-trail.ts'
import type { SystemGraph, VulnerabilityInfo } from '../system-xray/scanner.ts'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FileChange {
  path: string
  changedInLast3Commits: boolean
  author: string
  commitHash: string
  commitDate: string
}

export interface ApiFailure {
  endpoint: string
  error: string
  file?: string
  line?: number
}

export interface EnvIssue {
  missing: string
  expectedIn: string
  referencedIn?: string[]
}

export interface TestFailure {
  file: string
  error: string
  test?: string
}

export interface BrowserObservation {
  url: string
  errorMessage?: string
  screenshot?: string
}

export interface EvidenceBundle {
  fileChanges: FileChange[]
  apiFailures: ApiFailure[]
  envIssues: EnvIssue[]
  dependencyVulns: VulnerabilityInfo[]
  testFailures: TestFailure[]
  browserObservations: BrowserObservation[]
  healthScore: number
  risks: any[]
  failurePatterns: any[]
  recentCommits: { hash: string; author: string; date: string; message: string }[]
  collectedAt: string
  collectionDurationMs: number
}

// ─── Git Helpers ──────────────────────────────────────────────────────────────

function gitLog(repoPath: string, count: number = 20): string {
  try {
    return execSync(
      `git log --oneline -${count} --format="%H|%an|%ai|%s"`,
      { cwd: repoPath, encoding: 'utf8', timeout: 10000 }
    ).trim()
  } catch {
    return ''
  }
}

function gitDiffNameOnly(repoPath: string, from: string, to: string = 'HEAD'): string[] {
  try {
    const output = execSync(
      `git diff --name-only ${from}..${to}`,
      { cwd: repoPath, encoding: 'utf8', timeout: 10000 }
    ).trim()
    return output.split('\n').filter(Boolean)
  } catch {
    return []
  }
}

function gitLastCommitFiles(repoPath: string): string[] {
  try {
    const output = execSync(
      `git diff-tree --no-commit-id --name-only -r HEAD`,
      { cwd: repoPath, encoding: 'utf8', timeout: 10000 }
    ).trim()
    return output.split('\n').filter(Boolean)
  } catch {
    return []
  }
}

// ─── Environment Variable Detection ───────────────────────────────────────────

function detectEnvIssues(repoPath: string, files: string[]): EnvIssue[] {
  const issues: EnvIssue[] = []

  // Read .env.example if exists
  const envExamplePath = path.join(repoPath, '.env.example')
  let envExampleVars = new Set<string>()
  try {
    const content = fs.readFileSync(envExamplePath, 'utf8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx > 0) {
        envExampleVars.add(trimmed.slice(0, eqIdx).trim())
      }
    }
  } catch {
    // No .env.example
  }

  // Read .env if exists
  const envPath = path.join(repoPath, '.env')
  let envVars = new Set<string>()
  try {
    const content = fs.readFileSync(envPath, 'utf8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx > 0) {
        envVars.add(trimmed.slice(0, eqIdx).trim())
      }
    }
  } catch {
    // No .env
  }

  // Scan source code for process.env references
  const envRefsInCode = new Map<string, string[]>() // var -> files referencing it
  const codeFiles = files.filter(f => /\.(ts|tsx|js|mjs)$/i.test(f)).slice(0, 200)

  for (const file of codeFiles) {
    try {
      const content = fs.readFileSync(path.join(repoPath, file), 'utf8')
      const matches = content.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)
      for (const match of matches) {
        const varName = match[1]
        if (!envRefsInCode.has(varName)) {
          envRefsInCode.set(varName, [])
        }
        envRefsInCode.get(varName)!.push(file)
      }
    } catch {
      // can't read
    }
  }

  // Find vars in code not in .env or .env.example
  for (const [varName, referencedIn] of envRefsInCode) {
    if (!envVars.has(varName) && !envExampleVars.has(varName)) {
      issues.push({
        missing: varName,
        expectedIn: '.env or .env.example',
        referencedIn: [...new Set(referencedIn)].slice(0, 5),
      })
    } else if (!envVars.has(varName) && envExampleVars.has(varName)) {
      issues.push({
        missing: varName,
        expectedIn: '.env',
        referencedIn: [...new Set(referencedIn)].slice(0, 5),
      })
    }
  }

  return issues
}

// ─── Test Failure Detection ───────────────────────────────────────────────────

function detectTestFailures(repoPath: string): TestFailure[] {
  const failures: TestFailure[] = []

  // Try running tests and capture output
  try {
    // Check if package.json has test script
    const pkgPath = path.join(repoPath, 'package.json')
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
      if (pkg.scripts?.test) {
        // Run tests with JSON reporter if possible
        const output = execSync(
          'npm test -- --json 2>&1 || npm test 2>&1 || true',
          { cwd: repoPath, encoding: 'utf8', timeout: 60000, maxBuffer: 5 * 1024 * 1024 }
        )

        // Parse Jest JSON output
        try {
          const jestJson = JSON.parse(output)
          if (jestJson.testResults) {
            for (const result of jestJson.testResults) {
              for (const assertion of result.assertionResults || []) {
                if (assertion.status === 'failed') {
                  failures.push({
                    file: result.testFilePath || 'unknown',
                    error: assertion.failureMessages?.[0] || 'Test failed',
                    test: assertion.fullName,
                  })
                }
              }
            }
          }
        } catch {
          // Not JSON output, try parsing text output
          const lines = output.split('\n')
          for (const line of lines) {
            if (/FAIL|✕|✗|failed/i.test(line) && /\.(test|spec)\.(ts|tsx|js|jsx)/i.test(line)) {
              const fileMatch = line.match(/([\w/.-]+\.(test|spec)\.(ts|tsx|js|jsx))/i)
              failures.push({
                file: fileMatch?.[1] || 'unknown',
                error: line.trim(),
              })
            }
          }
        }
      }
    }
  } catch {
    // Tests not available or failed to run
  }

  return failures.slice(0, 50) // cap
}

// ─── Event Log Parsing ────────────────────────────────────────────────────────

function parseEventLog(restorationId: string): any[] {
  try {
    const eventsFile = path.join(tmpdir(), `alpha-events-${restorationId}.jsonl`)
    const content = fs.readFileSync(eventsFile, 'utf8')
    return content
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try { return JSON.parse(line) } catch { return null }
      })
      .filter(Boolean)
  } catch {
    return []
  }
}

// ─── Main Collector ───────────────────────────────────────────────────────────

export function collectEvidence(
  repoPath: string,
  restorationId: string,
  healthReport: any,
  enrichedGraph: any,
  traceId: string,
  onLog?: (msg: string) => void
): EvidenceBundle {
  const startTime = Date.now()

  onLog?.('Collecting evidence from repository...')

  // 1. Git history
  onLog?.('Analyzing git history...')
  const gitLogRaw = gitLog(repoPath, 20)
  const recentCommits = gitLogRaw.split('\n').filter(Boolean).map(line => {
    const [hash, author, date, ...msgParts] = line.split('|')
    return {
      hash: hash?.slice(0, 8) || '',
      author: author || 'unknown',
      date: date || '',
      message: msgParts.join('|'),
    }
  })

  // Files changed in last 3 commits
  const last3Files = new Set<string>()
  const fileChanges: FileChange[] = []
  for (const commit of recentCommits.slice(0, 3)) {
    try {
      const files = execSync(
        `git diff-tree --no-commit-id --name-only -r ${commit.hash}`,
        { cwd: repoPath, encoding: 'utf8', timeout: 5000 }
      ).trim().split('\n').filter(Boolean)
      for (const file of files) {
        last3Files.add(file)
        fileChanges.push({
          path: file,
          changedInLast3Commits: true,
          author: commit.author,
          commitHash: commit.hash,
          commitDate: commit.date,
        })
      }
    } catch {
      // skip
    }
  }

  onLog?.(`Found ${fileChanges.length} files changed in last 3 commits`)

  // 2. Environment issues
  onLog?.('Checking environment configuration...')
  const allFiles = enrichedGraph?.scannerGraph?.fileTree
    ? extractAllFiles(enrichedGraph.scannerGraph.fileTree)
    : []
  const envIssues = detectEnvIssues(repoPath, allFiles)
  onLog?.(`Found ${envIssues.length} environment issues`)

  // 3. Dependency vulnerabilities
  onLog?.('Collecting vulnerability data...')
  const dependencyVulns = enrichedGraph?.scannerGraph?.vulnerabilities || []
  onLog?.(`Found ${dependencyVulns.length} vulnerabilities`)

  // 4. Test failures
  onLog?.('Running test suite...')
  const testFailures = detectTestFailures(repoPath)
  onLog?.(`Found ${testFailures.length} test failures`)

  // 5. Browser observations (from event log)
  onLog?.('Parsing event log...')
  const events = parseEventLog(restorationId)
  const browserObservations: BrowserObservation[] = events
    .filter(e => e.type === 'PAGE_NAVIGATED' || e.type === 'ERROR_DETECTED')
    .map(e => ({
      url: e.data?.url || '',
      errorMessage: e.data?.message,
      screenshot: e.data?.screenshotUrl,
    }))

  // 6. API failures (from error events + recent changes to API files)
  const apiFailures: ApiFailure[] = events
    .filter(e => e.type === 'ERROR_DETECTED' && e.data?.file)
    .map(e => ({
      endpoint: e.data?.url || 'unknown',
      error: e.data?.message || 'Unknown error',
      file: e.data?.file,
      line: e.data?.line,
    }))

  // Also check for API files changed recently
  const apiFiles = enrichedGraph?.apiEndpoints?.map((e: any) => e.file) || []
  for (const file of fileChanges) {
    if (apiFiles.includes(file.path)) {
      apiFailures.push({
        endpoint: `Recent change in ${file.path}`,
        error: 'File modified in last 3 commits',
        file: file.path,
      })
    }
  }

  onLog?.(`Found ${apiFailures.length} API-related issues`)

  const duration = Date.now() - startTime

  const bundle: EvidenceBundle = {
    fileChanges: [...new Map(fileChanges.map(f => [f.path, f])).values()],
    apiFailures,
    envIssues,
    dependencyVulns,
    testFailures,
    browserObservations,
    healthScore: healthReport?.healthScore || 0,
    risks: healthReport?.risks || [],
    failurePatterns: healthReport?.failurePatterns || [],
    recentCommits,
    collectedAt: new Date().toISOString(),
    collectionDurationMs: duration,
  }

  auditResult(traceId, 'evidence-collector', `Evidence collected: ${bundle.fileChanges.length} file changes, ${bundle.envIssues.length} env issues, ${bundle.dependencyVulns.length} vulns, ${bundle.testFailures.length} test failures`, {
    fileChangesCount: bundle.fileChanges.length,
    envIssuesCount: bundle.envIssues.length,
    vulnCount: bundle.dependencyVulns.length,
    testFailuresCount: bundle.testFailures.length,
    apiFailuresCount: bundle.apiFailures.length,
  }, duration)

  return bundle
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractAllFiles(tree: any): string[] {
  const files: string[] = []
  if (!tree) return files
  if (tree.type === 'file') {
    files.push(tree.name)
  }
  if (tree.children) {
    for (const child of tree.children) {
      const prefix = tree.name === '/' ? '' : tree.name + '/'
      for (const f of extractAllFiles(child)) {
        files.push(prefix + f)
      }
    }
  }
  return files
}
