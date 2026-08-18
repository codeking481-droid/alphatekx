/**
 * SYSTEM X-RAY — FAILURE DETECTOR
 * 
 * Takes enriched graph + git log + CI status and detects:
 * - Recent changes (files changed in last 3 commits)
 * - Risk signals (dependency drift, env missing, migration not run, API contract drift)
 * - Health score: 0-100
 * - Failure patterns (specific anti-patterns detected)
 * 
 * Health formula: 100 - (errors*10 + warnings*5 + recentRiskyChanges*3)
 */

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { auditAction, auditDecision, auditError } from '../alpha-core/audit-trail.ts'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Risk {
  id: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  category: string
  message: string
  file?: string
  suggestion: string
}

export interface FailurePattern {
  pattern: string
  description: string
  files: string[]
  severity: 'critical' | 'high' | 'medium' | 'low'
}

export interface RecentChange {
  commit: string
  author: string
  date: string
  message: string
  files: string[]
}

export interface HealthReport {
  healthScore: number
  risks: Risk[]
  failurePatterns: FailurePattern[]
  recentChanges: RecentChange[]
  stats: {
    totalRisks: number
    criticalRisks: number
    highRisks: number
    mediumRisks: number
    lowRisks: number
    recentCommits: number
    filesChangedRecently: number
  }
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  summary: string
  detectedAt: string
  detectionDurationMs: number
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

function gitDiffStat(repoPath: string, from: string, to: string = 'HEAD'): string {
  try {
    return execSync(
      `git diff --stat ${from}..${to}`,
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

// ─── Risk Detection ───────────────────────────────────────────────────────────

function detectRisks(graph: any, enrichedGraph: any, recentChanges: RecentChange[]): Risk[] {
  const risks: Risk[] = []
  let riskId = 0

  // 1. Missing env vars referenced in code
  const envExample = graph.configFiles?.find((c: any) => c.name === '.env.example')
  if (!envExample?.exists) {
    risks.push({
      id: `RISK_${++riskId}`,
      severity: 'high',
      category: 'configuration',
      message: 'No .env.example file — environment variables undocumented',
      suggestion: 'Create .env.example listing all required environment variables',
    })
  }

  // 2. Check for env vars in code that might not be in env.example
  if (envExample?.exists) {
    try {
      const envContent = fs.readFileSync(path.join(graph.repoPath, '.env.example'), 'utf8')
      const definedVars = new Set(envContent.split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split('=')[0].trim()))

      // Check .env file if exists
      const envFile = graph.configFiles?.find((c: any) => c.name === '.env')
      if (envFile?.exists) {
        try {
          const actualEnv = fs.readFileSync(path.join(graph.repoPath, '.env'), 'utf8')
          const actualVars = new Set(actualEnv.split('\n').filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => l.split('=')[0].trim()))
          for (const v of actualVars) {
            if (!definedVars.has(v)) {
              risks.push({
                id: `RISK_${++riskId}`,
                severity: 'medium',
                category: 'configuration',
                message: `Env var "${v}" in .env but not documented in .env.example`,
                suggestion: `Add ${v} to .env.example`,
              })
            }
          }
        } catch { /* can't read .env */ }
      }
    } catch { /* can't read .env.example */ }
  }

  // 3. Dependency issues
  const outdatedDeps = graph.dependencies?.filter((d: any) => {
    const ver = d.version.replace(/[^0-9.]/g, '')
    return ver && parseFloat(ver) < 1 && d.type === 'prod'
  }) || []

  if (outdatedDeps.length > 3) {
    risks.push({
      id: `RISK_${++riskId}`,
      severity: 'medium',
      category: 'dependencies',
      message: `${outdatedDeps.length} production dependencies with version < 1.0`,
      suggestion: 'Review and update outdated dependencies',
    })
  }

  // 4. No lockfile
  const hasLock = graph.dependencies?.some((d: any) => d.source === 'package.json') &&
    (graph.configFiles?.some((c: any) => c.name === 'package.json' && c.exists))
  const hasLockFile = graph.fileTree ? fileExists(graph.fileTree, 'package-lock.json') ||
    fileExists(graph.fileTree, 'yarn.lock') || fileExists(graph.fileTree, 'pnpm-lock.yaml') : false

  if (hasLock && !hasLockFile) {
    risks.push({
      id: `RISK_${++riskId}`,
      severity: 'high',
      category: 'dependencies',
      message: 'No lockfile found — dependency versions not pinned',
      suggestion: 'Run npm install to generate package-lock.json',
    })
  }

  // 5. No tests
  const testFiles = graph.ownershipMap?.find((o: any) => o.domain === 'test')?.files || []
  if (testFiles.length === 0 && graph.totalFiles > 20) {
    risks.push({
      id: `RISK_${++riskId}`,
      severity: 'high',
      category: 'quality',
      message: 'No test files detected in repository',
      suggestion: 'Add unit tests for critical paths',
    })
  }

  // 6. No CI/CD
  const hasCI = graph.configFiles?.some((c: any) => c.name === '.github/workflows' && c.exists)
  if (!hasCI && graph.totalFiles > 30) {
    risks.push({
      id: `RISK_${++riskId}`,
      severity: 'medium',
      category: 'infrastructure',
      message: 'No CI/CD pipeline detected',
      suggestion: 'Set up GitHub Actions for automated testing and deployment',
    })
  }

  // 7. Dockerfile but no .dockerignore
  const hasDockerfile = graph.configFiles?.some((c: any) => c.name === 'Dockerfile' && c.exists)
  const hasDockerignore = graph.configFiles?.some((c: any) => c.name === '.dockerignore' || c.path === '.dockerignore')
  if (hasDockerfile && !hasDockerignore) {
    risks.push({
      id: `RISK_${++riskId}`,
      severity: 'low',
      category: 'infrastructure',
      message: 'Dockerfile exists but no .dockerignore',
      suggestion: 'Add .dockerignore to exclude unnecessary files from Docker build context',
    })
  }

  // 8. Recent risky changes (auth/payment/DB files changed recently)
  const riskyPatterns = [/auth/i, /payment/i, /billing/i, /db/i, /database/i, /migration/i, /security/i, /jwt/i, /session/i]
  for (const change of recentChanges.slice(0, 5)) {
    const riskyFiles = change.files.filter(f => riskyPatterns.some(p => p.test(f)))
    if (riskyFiles.length > 0) {
      risks.push({
        id: `RISK_${++riskId}`,
        severity: 'high',
        category: 'recent-change',
        message: `Recent commit "${change.message.slice(0, 60)}" modified ${riskyFiles.length} sensitive file(s)`,
        file: riskyFiles[0],
        suggestion: `Review changes in: ${riskyFiles.slice(0, 3).join(', ')}`,
      })
    }
  }

  // 9. API contract drift: API endpoints changed but no frontend update
  const apiFiles = enrichedGraph?.apiEndpoints?.map((e: any) => e.file) || []
  const frontendFiles = enrichedGraph?.layers?.find((l: any) => l.name === 'Frontend')?.files || []
  const recentApiChanges = recentChanges.flatMap(c => c.files.filter(f => apiFiles.includes(f)))
  const recentFeChanges = recentChanges.flatMap(c => c.files.filter(f => frontendFiles.includes(f)))

  if (recentApiChanges.length > 0 && recentFeChanges.length === 0) {
    risks.push({
      id: `RISK_${++riskId}`,
      severity: 'medium',
      category: 'api-contract',
      message: `${recentApiChanges.length} API file(s) changed recently but no frontend updates`,
      suggestion: 'Verify API contract compatibility with frontend',
    })
  }

  // 10. Missing Dockerfile for Node.js project
  const isNodeProject = graph.stack?.runtime?.includes('node')
  if (isNodeProject && !hasDockerfile && graph.totalFiles > 50) {
    risks.push({
      id: `RISK_${++riskId}`,
      severity: 'low',
      category: 'infrastructure',
      message: 'Node.js project without Dockerfile',
      suggestion: 'Consider adding Dockerfile for consistent deployments',
    })
  }

  // 11. Vulnerability risks
  const vulnRisks = detectVulnerabilityRisks(graph, enrichedGraph)
  risks.push(...vulnRisks)

  return risks
}

// ─── Vulnerability Risk Detection ─────────────────────────────────────────────

function detectVulnerabilityRisks(graph: any, enrichedGraph: any): Risk[] {
  const risks: Risk[] = []
  let riskId = 1000 // Start from 1000 to avoid ID conflicts

  const vulnerabilities = graph.vulnerabilities || []
  if (vulnerabilities.length === 0) return risks

  // Group vulnerabilities by severity
  const critical = vulnerabilities.filter((v: any) => v.severity === 'critical')
  const high = vulnerabilities.filter((v: any) => v.severity === 'high')
  const medium = vulnerabilities.filter((v: any) => v.severity === 'medium')

  // Critical vulnerabilities
  if (critical.length > 0) {
    risks.push({
      id: `RISK_${++riskId}`,
      severity: 'critical',
      category: 'vulnerability',
      message: `${critical.length} critical vulnerabilities detected`,
      suggestion: 'Immediately update or remove affected packages',
    })

    // Check if critical vulns are in sensitive domains
    const authFiles = graph.ownershipMap?.find((o: any) => o.domain === 'auth')?.files || []
    const paymentFiles = graph.ownershipMap?.find((o: any) => o.domain === 'payment')?.files || []
    const dbFiles = graph.ownershipMap?.find((o: any) => o.domain === 'database')?.files || []

    for (const vuln of critical) {
      // Check blast radius for this package
      const blast = enrichedGraph?.blastRadius?.find((b: any) => b.package === vuln.package)
      if (blast?.affectedLayers?.some((l: string) => ['Frontend', 'API', 'DB'].includes(l))) {
        risks.push({
          id: `RISK_${++riskId}`,
          severity: 'critical',
          category: 'vulnerability',
          message: `Critical vulnerability in "${vuln.package}" affects sensitive layer`,
          suggestion: `Patch ${vuln.package} immediately — affects ${blast.totalImpact} files`,
        })
      }
    }
  }

  // High vulnerabilities
  if (high.length > 0) {
    risks.push({
      id: `RISK_${++riskId}`,
      severity: 'high',
      category: 'vulnerability',
      message: `${high.length} high-severity vulnerabilities detected`,
      suggestion: 'Schedule updates for affected packages within 48 hours',
    })
  }

  // Medium vulnerabilities (batch)
  if (medium.length > 5) {
    risks.push({
      id: `RISK_${++riskId}`,
      severity: 'medium',
      category: 'vulnerability',
      message: `${medium.length} medium-severity vulnerabilities detected`,
      suggestion: 'Plan dependency updates in next maintenance window',
    })
  }

  // Check for outdated packages with known vulns
  const depsWithVulns = graph.dependencies?.filter((d: any) =>
    d.vulnerabilities && d.vulnerabilities.length > 0
  ) || []

  if (depsWithVulns.length > 3) {
    risks.push({
      id: `RISK_${++riskId}`,
      severity: 'high',
      category: 'vulnerability',
      message: `${depsWithVulns.length} production dependencies have known vulnerabilities`,
      suggestion: 'Run npm audit fix or update packages manually',
    })
  }

  return risks
}

// ─── Failure Pattern Detection ────────────────────────────────────────────────

function detectFailurePatterns(graph: any, enrichedGraph: any, recentChanges: RecentChange[]): FailurePattern[] {
  const patterns: FailurePattern[] = []

  // Pattern 1: Auth service changed but tests not updated
  const authFiles = graph.ownershipMap?.find((o: any) => o.domain === 'auth')?.files || []
  const testFiles = graph.ownershipMap?.find((o: any) => o.domain === 'test')?.files || []
  const recentAuthChanges = recentChanges.flatMap(c => c.files.filter(f => authFiles.includes(f)))
  const recentTestChanges = recentChanges.flatMap(c => c.files.filter(f => testFiles.includes(f)))

  if (recentAuthChanges.length > 0 && recentTestChanges.length === 0) {
    patterns.push({
      pattern: 'auth-changed-no-tests',
      description: 'Authentication files modified but no test files updated',
      files: recentAuthChanges.slice(0, 5),
      severity: 'critical',
    })
  }

  // Pattern 2: package.json version bump but lockfile not updated
  const recentPkgChanges = recentChanges.flatMap(c => c.files.filter(f => f === 'package.json'))
  const recentLockChanges = recentChanges.flatMap(c =>
    c.files.filter(f => ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'].includes(f))
  )
  if (recentPkgChanges.length > 0 && recentLockChanges.length === 0) {
    patterns.push({
      pattern: 'pkg-bump-no-lockfile',
      description: 'package.json modified but lockfile not updated',
      files: ['package.json'],
      severity: 'high',
    })
  }

  // Pattern 3: Migration file exists but no schema reference
  const migrationFiles = graph.ownershipMap?.find((o: any) => o.domain === 'database')?.files?.filter((f: string) => /migration/i.test(f)) || []
  if (migrationFiles.length > 0) {
    const recentMigrationChanges = recentChanges.flatMap(c => c.files.filter(f => migrationFiles.includes(f)))
    if (recentMigrationChanges.length > 0) {
      patterns.push({
        pattern: 'recent-migration',
        description: 'Database migration recently modified — verify it has been applied',
        files: recentMigrationChanges.slice(0, 5),
        severity: 'high',
      })
    }
  }

  // Pattern 4: Config file changed but no deployment trigger
  const configFiles = ['vercel.json', 'docker-compose.yml', 'render.yaml', 'next.config.js', 'next.config.mjs']
  const recentConfigChanges = recentChanges.flatMap(c => c.files.filter(f => configFiles.includes(f)))
  if (recentConfigChanges.length > 0) {
    patterns.push({
      pattern: 'config-changed',
      description: 'Deployment configuration recently modified — verify redeployment',
      files: recentConfigChanges,
      severity: 'medium',
    })
  }

  // Pattern 5: Large number of files changed in single commit
  for (const change of recentChanges.slice(0, 3)) {
    if (change.files.length > 30) {
      patterns.push({
        pattern: 'large-changeset',
        description: `Commit "${change.message.slice(0, 40)}" changed ${change.files.length} files — high regression risk`,
        files: change.files.slice(0, 10),
        severity: 'medium',
      })
    }
  }

  // Pattern 6: Critical vulnerabilities in sensitive domains
  const vulnerabilities = graph.vulnerabilities || []
  const criticalVulns = vulnerabilities.filter((v: any) => v.severity === 'critical')
  if (criticalVulns.length > 0) {
    patterns.push({
      pattern: 'critical-vulnerabilities',
      description: `${criticalVulns.length} critical vulnerabilities detected — immediate patching required`,
      files: criticalVulns.slice(0, 5).map((v: any) => v.package),
      severity: 'critical',
    })
  }

  // Pattern 7: Vulnerabilities in auth/payment dependencies
  const sensitiveVulns = vulnerabilities.filter((v: any) => {
    const pkg = v.package.toLowerCase()
    return /auth|jwt|session|payment|stripe|paystack|crypto|oauth/i.test(pkg)
  })
  if (sensitiveVulns.length > 0) {
    patterns.push({
      pattern: 'sensitive-dependency-vulns',
      description: `Vulnerabilities in sensitive dependencies: ${sensitiveVulns.map((v: any) => v.package).join(', ')}`,
      files: sensitiveVulns.map((v: any) => v.package),
      severity: 'critical',
    })
  }

  return patterns
}

// ─── Health Score ─────────────────────────────────────────────────────────────

function calculateHealthScore(
  risks: Risk[],
  failurePatterns: FailurePattern[],
  recentChanges: RecentChange[],
  graph: any
): { score: number; grade: HealthReport['grade'] } {
  let deductions = 0

  // Risk deductions
  for (const risk of risks) {
    if (risk.severity === 'critical') deductions += 10
    else if (risk.severity === 'high') deductions += 7
    else if (risk.severity === 'medium') deductions += 4
    else deductions += 2
  }

  // Pattern deductions
  for (const pattern of failurePatterns) {
    if (pattern.severity === 'critical') deductions += 12
    else if (pattern.severity === 'high') deductions += 8
    else if (pattern.severity === 'medium') deductions += 5
    else deductions += 3
  }

  // Recent risky change deductions
  const riskyFiles = recentChanges.slice(0, 3).flatMap(c => c.files.length)
  deductions += Math.min(15, riskyFiles * 0.5)

  // Bonus for good practices
  if (graph.configFiles?.some((c: any) => c.name === '.env.example' && c.exists)) deductions -= 3
  if (graph.ownershipMap?.find((o: any) => o.domain === 'test')?.files?.length > 0) deductions -= 5
  if (graph.configFiles?.some((c: any) => c.name === '.github/workflows' && c.exists)) deductions -= 3

  // Vulnerability penalty — critical vulns in auth/payment/db get extra penalty
  const vulnerabilities = graph.vulnerabilities || []
  const criticalVulns = vulnerabilities.filter((v: any) => v.severity === 'critical')
  if (criticalVulns.length > 0) {
    deductions += 15 // Extra penalty for critical vulnerabilities
  }

  const score = Math.max(0, Math.min(100, Math.round(100 - deductions)))

  let grade: HealthReport['grade'] = 'F'
  if (score >= 90) grade = 'A'
  else if (score >= 80) grade = 'B'
  else if (score >= 65) grade = 'C'
  else if (score >= 50) grade = 'D'

  return { score, grade }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fileExists(tree: any, filename: string): boolean {
  if (!tree) return false
  if (tree.type === 'file' && tree.name === filename) return true
  if (tree.children) {
    return tree.children.some((c: any) => fileExists(c, filename))
  }
  return false
}

// ─── Main Entry ───────────────────────────────────────────────────────────────

export function detectFailures(
  graph: any,
  enrichedGraph: any,
  traceId: string,
  onLog?: (msg: string) => void
): HealthReport {
  const startTime = Date.now()

  onLog?.('Parsing git history...')
  const gitLogRaw = gitLog(graph.repoPath, 20)
  const recentChanges: RecentChange[] = gitLogRaw.split('\n').filter(Boolean).map(line => {
    const [commit, author, date, ...msgParts] = line.split('|')
    const files = gitLastCommitFiles(graph.repoPath)
    return {
      commit: commit?.slice(0, 8) || '',
      author: author || 'unknown',
      date: date || '',
      message: msgParts.join('|'),
      files,
    }
  })

  // Get files changed in last 3 commits
  const last3Commits = recentChanges.slice(0, 3)
  const filesChangedRecently = new Set(last3Commits.flatMap(c => c.files)).size

  onLog?.(`Found ${recentChanges.length} recent commits, ${filesChangedRecently} files changed recently`)

  onLog?.('Detecting risks...')
  const risks = detectRisks(graph, enrichedGraph, recentChanges)
  onLog?.(`Found ${risks.length} risks (${risks.filter(r => r.severity === 'critical').length} critical)`)

  onLog?.('Detecting failure patterns...')
  const failurePatterns = detectFailurePatterns(graph, enrichedGraph, recentChanges)
  onLog?.(`Found ${failurePatterns.length} failure patterns`)

  onLog?.('Calculating health score...')
  const { score, grade } = calculateHealthScore(risks, failurePatterns, recentChanges, graph)

  const stats = {
    totalRisks: risks.length,
    criticalRisks: risks.filter(r => r.severity === 'critical').length,
    highRisks: risks.filter(r => r.severity === 'high').length,
    mediumRisks: risks.filter(r => r.severity === 'medium').length,
    lowRisks: risks.filter(r => r.severity === 'low').length,
    recentCommits: recentChanges.length,
    filesChangedRecently,
  }

  const summary = stats.criticalRisks > 0
    ? `${stats.criticalRisks} critical risks detected. Health: ${score}/100 (${grade}). Immediate attention required.`
    : stats.highRisks > 0
      ? `${stats.highRisks} high risks detected. Health: ${score}/100 (${grade}). Review recommended.`
      : `System looks healthy. Health: ${score}/100 (${grade}). ${stats.totalRisks} minor items to address.`

  auditAction(traceId, 'xray-failure-detector', `Health: ${score}/100 (${grade}), Risks: ${risks.length}, Patterns: ${failurePatterns.length}`, stats)

  return {
    healthScore: score,
    risks,
    failurePatterns,
    recentChanges: recentChanges.slice(0, 10),
    stats,
    grade,
    summary,
    detectedAt: new Date().toISOString(),
    detectionDurationMs: Date.now() - startTime,
  }
}
