/**
 * SYSTEM X-RAY — SCANNER
 * 
 * Turns a repo at /tmp/github-{id} into a structured system_graph.json.
 * 
 * Handles 10k+ files via streaming directory walk (no full in-memory load).
 * Cache results in /tmp/xray-cache-{hash}.json.
 * 
 * Output: SystemGraph with stack, entryPoints, configs, dependencies, ownershipMap.
 */

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { queryVulnerabilities, type OsvBatchResult } from './osv-client.ts'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StackInfo {
  runtime: string[]       // ['node', 'python', 'go']
  frameworks: string[]    // ['nextjs', 'react', 'express', 'flask']
  languages: string[]     // ['typescript', 'javascript', 'python']
  tools: string[]         // ['docker', 'github-actions', 'vercel', 'terraform']
  packageManagers: string[] // ['npm', 'yarn', 'pnpm', 'pip', 'go-mod']
}

export interface VulnerabilityInfo {
  id: string
  package: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  summary: string
  fixedVersion?: string
  source: 'npm-audit' | 'osv'
  aliases: string[]
}

export interface EntryPoint {
  type: 'frontend-route' | 'backend-route' | 'api-endpoint' | 'cli' | 'script'
  path: string
  method?: string
  file: string
}

export interface ConfigFile {
  name: string
  path: string
  purpose: string
  exists: boolean
}

export interface Dependency {
  name: string
  version: string
  type: 'prod' | 'dev' | 'peer'
  source: string  // which config file
  vulnerabilities?: VulnerabilityInfo[]
}

export interface OwnershipEntry {
  domain: string       // auth, payment, db, frontend, infra, api, test
  files: string[]
  confidence: number   // 0-1
}

export interface SystemGraph {
  repoPath: string
  scannedAt: string
  totalFiles: number
  totalDirs: number
  stack: StackInfo
  entryPoints: EntryPoint[]
  configFiles: ConfigFile[]
  dependencies: Dependency[]
  vulnerabilities: VulnerabilityInfo[]
  ownershipMap: OwnershipEntry[]
  fileTree: { name: string; type: 'file' | 'dir'; children?: any[] } | null
  largeFileWarning: boolean
  scanDurationMs: number
}

// ─── Detection Rules ──────────────────────────────────────────────────────────

const STACK_RULES: Record<string, { detect: (files: Set<string>, dirs: Set<string>) => boolean; category: keyof StackInfo }> = {
  node: { detect: (f) => f.has('package.json') || f.has('node_modules'), category: 'runtime' },
  python: { detect: (f) => f.has('requirements.txt') || f.has('setup.py') || f.has('pyproject.toml') || f.has('Pipfile'), category: 'runtime' },
  go: { detect: (f) => f.has('go.mod'), category: 'runtime' },
  rust: { detect: (f) => f.has('Cargo.toml'), category: 'runtime' },
  java: { detect: (f) => f.has('pom.xml') || f.has('build.gradle'), category: 'runtime' },
  nextjs: { detect: (f, d) => f.has('next.config.js') || f.has('next.config.mjs') || f.has('next.config.ts'), category: 'frameworks' },
  react: { detect: (f) => f.has('react') && (f.has('jsx') || f.has('tsx')), category: 'frameworks' },
  vue: { detect: (f) => f.has('vue.config.js') || f.has('nuxt.config.js'), category: 'frameworks' },
  angular: { detect: (f) => f.has('angular.json'), category: 'frameworks' },
  svelte: { detect: (f) => f.has('svelte.config.js'), category: 'frameworks' },
  express: { detect: (f) => f.has('express') && f.has('package.json'), category: 'frameworks' },
  flask: { detect: (f) => f.has('flask') && f.has('requirements.txt'), category: 'frameworks' },
  django: { detect: (f) => f.has('manage.py') && f.has('settings.py'), category: 'frameworks' },
  fastapi: { detect: (f) => f.has('fastapi') && f.has('requirements.txt'), category: 'frameworks' },
  docker: { detect: (f) => f.has('Dockerfile') || f.has('docker-compose.yml') || f.has('docker-compose.yaml') || f.has('.dockerignore'), category: 'tools' },
  'github-actions': { detect: (d) => d.has('.github'), category: 'tools' },
  vercel: { detect: (f) => f.has('vercel.json'), category: 'tools' },
  netlify: { detect: (f) => f.has('netlify.toml'), category: 'tools' },
  terraform: { detect: (f) => f.has('main.tf') || f.has('terraform.tfstate'), category: 'tools' },
  npm: { detect: (f) => f.has('package.json') && f.has('package-lock.json'), category: 'packageManagers' },
  yarn: { detect: (f) => f.has('yarn.lock'), category: 'packageManagers' },
  pnpm: { detect: (f) => f.has('pnpm-lock.yaml'), category: 'packageManagers' },
  pip: { detect: (f) => f.has('requirements.txt'), category: 'packageManagers' },
  'go-mod': { detect: (f) => f.has('go.mod'), category: 'packageManagers' },
  typescript: { detect: (f) => f.has('tsconfig.json'), category: 'languages' },
  javascript: { detect: (f) => f.has('.eslintrc.js') || f.has('.eslintrc.json') || f.has('babel.config.js'), category: 'languages' },
  python_lang: { detect: (f) => f.has('setup.py') || f.has('pyproject.toml') || f.has('.python-version'), category: 'languages' },
}

const OWNERSHIP_RULES: { domain: string; patterns: RegExp[] }[] = [
  { domain: 'auth', patterns: [/auth/i, /login/i, /signup/i, /register/i, /session/i, /jwt/i, /passport/i, /oauth/i, /supabase/i, /clerk/i] },
  { domain: 'payment', patterns: [/payment/i, /billing/i, /stripe/i, /paystack/i, /checkout/i, /invoice/i, /subscription/i] },
  { domain: 'database', patterns: [/db/i, /database/i, /migration/i, /schema/i, /prisma/i, /sequelize/i, /typeorm/i, /knex/i, /supabase/i] },
  { domain: 'frontend', patterns: [/component/i, /page/i, /layout/i, /style/i, /\.css$/i, /\.scss$/i, /\.tsx$/i, /\.jsx$/i, /ui/i] },
  { domain: 'infra', patterns: [/docker/i, /ci/i, /cd/i, /deploy/i, /vercel/i, /render/i, /nginx/i, /terraform/i, /k8s/i, /\.github/i] },
  { domain: 'test', patterns: [/test/i, /spec/i, /\.test\./i, /\.spec\./i, /__test/i, /jest/i, /vitest/i, /cypress/i, /playwright/i] },
  { domain: 'api', patterns: [/api/i, /route/i, /endpoint/i, /controller/i, /handler/i, /middleware/i] },
]

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', '.cache', '__pycache__',
  '.venv', 'venv', 'target', '.tox', 'coverage', '.nyc_output', '.turbo',
])

const ENTRY_POINT_PATTERNS: { type: EntryPoint['type']; patterns: RegExp[] }[] = [
  { type: 'api-endpoint', patterns: [/app\/api\//i, /pages\/api\//i, /routes\//i, /api\//i] },
  { type: 'frontend-route', patterns: [/app\/[^/]+\/page\./i, /pages\//i, /src\/pages\//i, /src\/app\//i, /src\/routes\//i] },
  { type: 'cli', patterns: [/cli\//i, /bin\//i, /scripts\//i] },
  { type: 'script', patterns: [/scripts\//i, /tools\//i] },
]

const CONFIG_PATTERNS: { name: string; patterns: string[]; purpose: string }[] = [
  { name: '.env.example', patterns: ['.env.example', '.env.sample', '.env.template'], purpose: 'Environment variable template' },
  { name: '.env', patterns: ['.env', '.env.local', '.env.development'], purpose: 'Local environment config' },
  { name: 'docker-compose', patterns: ['docker-compose.yml', 'docker-compose.yaml', 'docker-compose.override.yml'], purpose: 'Docker Compose services' },
  { name: 'vercel.json', patterns: ['vercel.json'], purpose: 'Vercel deployment config' },
  { name: 'next.config', patterns: ['next.config.js', 'next.config.mjs', 'next.config.ts'], purpose: 'Next.js configuration' },
  { name: 'tsconfig.json', patterns: ['tsconfig.json'], purpose: 'TypeScript configuration' },
  { name: 'package.json', patterns: ['package.json'], purpose: 'Node.js dependencies' },
  { name: '.github/workflows', patterns: ['.github/workflows'], purpose: 'CI/CD pipeline' },
  { name: 'Dockerfile', patterns: ['Dockerfile'], purpose: 'Docker image build' },
  { name: 'requirements.txt', patterns: ['requirements.txt'], purpose: 'Python dependencies' },
  { name: 'go.mod', patterns: ['go.mod'], purpose: 'Go module definition' },
]

// ─── Streaming Directory Walker ───────────────────────────────────────────────

interface WalkResult {
  files: string[]
  dirs: string[]
  truncated: boolean
}

function walkDir(root: string, maxFiles: number = 15000): WalkResult {
  const files: string[] = []
  const dirs: string[] = []
  let truncated = false

  function walk(currentDir: string, depth: number) {
    if (truncated || depth > 20) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true })
    } catch {
      return // permission denied or broken symlink
    }

    for (const entry of entries) {
      if (truncated) return
      const fullPath = path.join(currentDir, entry.name)
      const relPath = path.relative(root, fullPath).replace(/\\/g, '/')

      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue
        if (entry.name.startsWith('.') && entry.name !== '.github') continue
        dirs.push(relPath)
        walk(fullPath, depth + 1)
      } else if (entry.isFile()) {
        files.push(relPath)
        if (files.length >= maxFiles) {
          truncated = true
          return
        }
      }
    }
  }

  walk(root, 0)
  return { files, dirs, truncated }
}

// ─── Stack Detection ──────────────────────────────────────────────────────────

function detectStack(fileSet: Set<string>, dirSet: Set<string>): StackInfo {
  const stack: StackInfo = {
    runtime: [],
    frameworks: [],
    languages: [],
    tools: [],
    packageManagers: [],
  }

  for (const [name, rule] of Object.entries(STACK_RULES)) {
    try {
      if (rule.detect(fileSet, dirSet)) {
        const key = rule.category
        if (!stack[key].includes(name)) {
          stack[key].push(name)
        }
      }
    } catch { /* skip broken rule */ }
  }

  // Deduplicate and clean
  for (const key of Object.keys(stack) as (keyof StackInfo)[]) {
    stack[key] = [...new Set(stack[key])]
  }

  return stack
}

// ─── Entry Points ─────────────────────────────────────────────────────────────

function detectEntryPoints(files: string[]): EntryPoint[] {
  const points: EntryPoint[] = []

  for (const file of files) {
    for (const rule of ENTRY_POINT_PATTERNS) {
      if (rule.patterns.some(p => p.test(file))) {
        let method: string | undefined
        if (rule.type === 'api-endpoint') {
          method = 'GET' // default
        }
        points.push({ type: rule.type, path: file, file, method })
        break
      }
    }
  }

  // Deduplicate by path
  const seen = new Set<string>()
  return points.filter(p => {
    if (seen.has(p.path)) return false
    seen.add(p.path)
    return true
  })
}

// ─── Config Files ─────────────────────────────────────────────────────────────

function detectConfigs(files: string[], root: string): ConfigFile[] {
  const configs: ConfigFile[] = []

  for (const rule of CONFIG_PATTERNS) {
    let found = false
    let foundPath = ''

    for (const pattern of rule.patterns) {
      // Check if it's a directory pattern
      if (pattern.endsWith('/')) {
        const dirPath = path.join(root, pattern)
        if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
          found = true
          foundPath = pattern
          break
        }
      } else {
        if (files.includes(pattern)) {
          found = true
          foundPath = pattern
          break
        }
      }
    }

    configs.push({ name: rule.name, path: foundPath || rule.patterns[0], purpose: rule.purpose, exists: found })
  }

  return configs
}

// ─── Dependencies ─────────────────────────────────────────────────────────────

function detectDependencies(files: string[], root: string): Dependency[] {
  const deps: Dependency[] = []

  // package.json
  if (files.includes('package.json')) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
      for (const [name, version] of Object.entries(pkg.dependencies || {})) {
        deps.push({ name, version: String(version), type: 'prod', source: 'package.json' })
      }
      for (const [name, version] of Object.entries(pkg.devDependencies || {})) {
        deps.push({ name, version: String(version), type: 'dev', source: 'package.json' })
      }
    } catch { /* corrupt package.json */ }
  }

  // requirements.txt
  if (files.includes('requirements.txt')) {
    try {
      const content = fs.readFileSync(path.join(root, 'requirements.txt'), 'utf8')
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*([=<>!]+.+)?/)
        if (match) {
          deps.push({ name: match[1], version: match[2] || 'any', type: 'prod', source: 'requirements.txt' })
        }
      }
    } catch { /* corrupt requirements.txt */ }
  }

  // go.mod
  if (files.includes('go.mod')) {
    try {
      const content = fs.readFileSync(path.join(root, 'go.mod'), 'utf8')
      const requireMatch = content.match(/require\s*\(([\s\S]*?)\)/)
      if (requireMatch) {
        for (const line of requireMatch[1].split('\n')) {
          const match = line.trim().match(/^(\S+)\s+(\S+)/)
          if (match) {
            deps.push({ name: match[1], version: match[2], type: 'prod', source: 'go.mod' })
          }
        }
      }
    } catch { /* corrupt go.mod */ }
  }

  return deps
}

// ─── Vulnerability Detection ──────────────────────────────────────────────────

function runNpmAudit(repoPath: string): VulnerabilityInfo[] {
  try {
    // Run npm audit --json in the repo directory
    const output = execSync('npm audit --json 2>/dev/null || true', {
      cwd: repoPath,
      encoding: 'utf8',
      timeout: 30_000,
    })

    const audit = JSON.parse(output)
    const vulns: VulnerabilityInfo[] = []

    // npm audit v2 format
    if (audit.vulnerabilities) {
      for (const [name, info] of Object.entries(audit.vulnerabilities) as [string, any][]) {
        const severity = info.severity?.toLowerCase() || 'medium'
        const fixAvail = info.fixAvailable
        const via = Array.isArray(info.via) ? info.via : []

        vulns.push({
          id: via.find((v: any) => typeof v === 'string') || `npm-audit-${name}`,
          package: name,
          severity: severity === 'info' ? 'low' : severity as any,
          summary: via.find((v: any) => typeof v === 'object')?.title || `${name} vulnerability`,
          fixedVersion: typeof fixAvail === 'object' ? fixAvail.version : undefined,
          source: 'npm-audit',
          aliases: [],
        })
      }
    }

    return vulns
  } catch {
    // npm audit not available or failed — return empty
    return []
  }
}

async function runOsvScan(
  dependencies: Dependency[],
  traceId: string = 'system-xray'
): Promise<OsvBatchResult[]> {
  // Filter to production dependencies with parseable versions
  const prodDeps = dependencies.filter(d =>
    d.type === 'prod' && /^\d/.test(d.version.replace(/^[^0-9]*/, ''))
  )

  if (prodDeps.length === 0) return []

  const packages = prodDeps.map(d => ({
    name: d.name,
    version: d.version.replace(/^[^0-9]*/, ''),
    ecosystem: 'npm' as const,
  }))

  return queryVulnerabilities(packages, traceId)
}

function mergeVulnerabilities(
  npmAuditVulns: VulnerabilityInfo[],
  osvResults: OsvBatchResult[]
): VulnerabilityInfo[] {
  const merged = new Map<string, VulnerabilityInfo>()

  // Add npm audit results first (they tend to be more specific)
  for (const v of npmAuditVulns) {
    const key = `${v.package}:${v.id}`
    if (!merged.has(key)) {
      merged.set(key, v)
    }
  }

  // Add OSV results, deduplicating by package + ID
  for (const result of osvResults) {
    for (const v of result.vulnerabilities) {
      const key = `${v.package}:${v.id}`
      if (!merged.has(key)) {
        merged.set(key, {
          id: v.id,
          package: v.package,
          severity: v.severity.toLowerCase() as any,
          summary: v.summary,
          fixedVersion: v.fixedVersion,
          source: 'osv',
          aliases: v.aliases,
        })
      }
    }
  }

  return Array.from(merged.values())
}

// ─── Ownership Map ────────────────────────────────────────────────────────────

function buildOwnershipMap(files: string[]): OwnershipEntry[] {
  const ownership: OwnershipEntry[] = []

  for (const rule of OWNERSHIP_RULES) {
    const matched: string[] = []

    for (const file of files) {
      const basename = path.basename(file)
      const dirname = path.dirname(file)

      for (const pattern of rule.patterns) {
        if (pattern.test(basename) || pattern.test(dirname) || pattern.test(file)) {
          matched.push(file)
          break
        }
      }
    }

    if (matched.length > 0) {
      ownership.push({
        domain: rule.domain,
        files: matched.slice(0, 100), // cap for large repos
        confidence: Math.min(1, matched.length / Math.max(5, files.length * 0.01)),
      })
    }
  }

  return ownership.sort((a, b) => b.files.length - a.files.length)
}

// ─── File Tree (compact) ──────────────────────────────────────────────────────

function buildCompactTree(files: string[], maxDepth: number = 3): SystemGraph['fileTree'] {
  const root: any = { name: '/', type: 'dir', children: [] }
  const nodeMap = new Map<string, any>([['', root]])

  for (const file of files.slice(0, 5000)) { // cap for tree rendering
    const parts = file.split('/')
    let current = root

    for (let i = 0; i < Math.min(parts.length - 1, maxDepth); i++) {
      const part = parts[i]
      const key = parts.slice(0, i + 1).join('/')
      if (!nodeMap.has(key)) {
        const node = { name: part, type: 'dir' as const, children: [] }
        nodeMap.set(key, node)
        current.children.push(node)
      }
      current = nodeMap.get(key)
    }
  }

  return root
}

// ─── Cache ────────────────────────────────────────────────────────────────────

function getCacheKey(repoPath: string): string {
  const hash = createHash('md5').update(repoPath).digest('hex').slice(0, 12)
  return `/tmp/xray-cache-${hash}.json`
}

function readCache(repoPath: string): SystemGraph | null {
  try {
    const cachePath = getCacheKey(repoPath)
    if (!fs.existsSync(cachePath)) return null
    const stat = fs.statSync(cachePath)
    const ageMs = Date.now() - stat.mtimeMs
    if (ageMs > 5 * 60 * 1000) return null // 5 min TTL
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'))
  } catch {
    return null
  }
}

function writeCache(repoPath: string, graph: SystemGraph): void {
  try {
    fs.writeFileSync(getCacheKey(repoPath), JSON.stringify(graph))
  } catch { /* best effort */ }
}

// ─── Main Entry ───────────────────────────────────────────────────────────────

export function scanRepo(repoPath: string, options?: { maxFiles?: number; useCache?: boolean }): SystemGraph {
  const startTime = Date.now()
  const maxFiles = options?.maxFiles ?? 15000
  const useCache = options?.useCache !== false

  // Check cache
  if (useCache) {
    const cached = readCache(repoPath)
    if (cached) return cached
  }

  // Walk directory tree (streaming, no full load)
  const { files, dirs, truncated } = walkDir(repoPath, maxFiles)
  const fileSet = new Set(files)
  const dirSet = new Set(dirs)

  // Detect everything
  const stack = detectStack(fileSet, dirSet)
  const entryPoints = detectEntryPoints(files)
  const configFiles = detectConfigs(files, repoPath)
  const dependencies = detectDependencies(files, repoPath)
  const ownershipMap = buildOwnershipMap(files)
  const fileTree = buildCompactTree(files)

  // Vulnerability detection (synchronous npm audit only for non-streaming)
  const npmAuditVulns = runNpmAudit(repoPath)
  const vulnerabilities = npmAuditVulns

  const graph: SystemGraph = {
    repoPath,
    scannedAt: new Date().toISOString(),
    totalFiles: files.length,
    totalDirs: dirs.length,
    stack,
    entryPoints,
    configFiles,
    dependencies,
    vulnerabilities,
    ownershipMap,
    fileTree,
    largeFileWarning: truncated,
    scanDurationMs: Date.now() - startTime,
  }

  // Cache result
  if (useCache) writeCache(repoPath, graph)

  return graph
}

/**
 * scanRepoStreaming — For 10k+ file repos. Returns partial graph progressively.
 * Emits log callbacks as it scans.
 */
export async function scanRepoStreaming(
  repoPath: string,
  onLog?: (msg: string) => void
): Promise<SystemGraph> {
  const startTime = Date.now()

  onLog?.('Walking directory tree...')
  const { files, dirs, truncated } = walkDir(repoPath, 15000)
  onLog?.(`Found ${files.length} files, ${dirs.length} dirs${truncated ? ' (truncated)' : ''}`)

  const fileSet = new Set(files)
  const dirSet = new Set(dirs)

  onLog?.('Detecting tech stack...')
  const stack = detectStack(fileSet, dirSet)
  onLog?.(`Stack: ${[...stack.runtime, ...stack.frameworks].join(', ') || 'unknown'}`)

  onLog?.('Finding entry points...')
  const entryPoints = detectEntryPoints(files)
  onLog?.(`Found ${entryPoints.length} entry points`)

  onLog?.('Scanning config files...')
  const configFiles = detectConfigs(files, repoPath)
  onLog?.(`Found ${configFiles.filter(c => c.exists).length}/${configFiles.length} config files`)

  onLog?.('Parsing dependencies...')
  const dependencies = detectDependencies(files, repoPath)
  onLog?.(`Found ${dependencies.length} dependencies`)

  // Vulnerability detection — npm audit + OSV
  onLog?.('Running npm audit...')
  const npmAuditVulns = runNpmAudit(repoPath)
  onLog?.(`npm audit: ${npmAuditVulns.length} vulnerabilities`)

  onLog?.('Querying OSV for known vulnerabilities...')
  const osvResults = await runOsvScan(dependencies, 'xray-scanner')
  const osvVulnCount = osvResults.reduce((sum, r) => sum + r.vulnerabilities.length, 0)
  onLog?.(`OSV: ${osvVulnCount} vulnerabilities found`)

  const vulnerabilities = mergeVulnerabilities(npmAuditVulns, osvResults)
  onLog?.(`Total unique vulnerabilities: ${vulnerabilities.length}`)

  // Attach vulnerabilities to individual dependencies
  for (const dep of dependencies) {
    dep.vulnerabilities = vulnerabilities.filter(v => v.package === dep.name)
  }

  onLog?.('Building ownership map...')
  const ownershipMap = buildOwnershipMap(files)
  onLog?.(`Mapped ${ownershipMap.length} ownership domains`)

  const fileTree = buildCompactTree(files)

  const graph: SystemGraph = {
    repoPath,
    scannedAt: new Date().toISOString(),
    totalFiles: files.length,
    totalDirs: dirs.length,
    stack,
    entryPoints,
    configFiles,
    dependencies,
    vulnerabilities,
    ownershipMap,
    fileTree,
    largeFileWarning: truncated,
    scanDurationMs: Date.now() - startTime,
  }

  // Cache
  writeCache(repoPath, graph)

  return graph
}
