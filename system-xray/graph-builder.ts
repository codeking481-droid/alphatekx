/**
 * SYSTEM X-RAY — GRAPH BUILDER
 * 
 * Takes system_graph.json from scanner and builds:
 * - Architecture layers: Frontend → API → Services → DB → Infra
 * - Component dependencies (who imports whom)
 * - API map: method, path, file, auth, connected DB table
 * - DB map: tables/models, relationships, which service touches which
 * - Call graph: frontend page → API route → DB query
 * 
 * Uses alphaCall('SCANNER') for AI inference of missing links.
 * Logs inference to audit trail.
 */

import fs from 'node:fs'
import path from 'node:path'
import { alphaCall, type ChatMessage } from '../alpha-core/groq-router.ts'
import { auditThought, auditDecision, auditTool } from '../alpha-core/audit-trail.ts'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ArchLayer {
  name: string       // 'Frontend', 'API', 'Services', 'DB', 'Infra'
  files: string[]
  tech: string[]
}

export interface ComponentDep {
  from: string       // file or module
  to: string         // file or module
  type: 'import' | 'call' | 'event' | 'db-query'
  inferred: boolean  // true if inferred by AI
}

export interface ApiEndpoint {
  method: string
  path: string
  file: string
  authRequired: boolean
  connectedTables: string[]
}

export interface DbTable {
  name: string
  type: 'table' | 'model' | 'collection'
  file: string
  relationships: string[]
  touchedBy: string[]  // services that use this table
}

export interface CallGraphEntry {
  frontendPage: string
  apiRoute: string
  dbQuery: string
  services: string[]
}

export interface BlastRadius {
  package: string
  severity: string
  affectedFiles: string[]
  affectedLayers: string[]
  totalImpact: number  // number of files affected
}

export interface EnrichedGraph {
  scannerGraph: any
  layers: ArchLayer[]
  componentDeps: ComponentDep[]
  apiEndpoints: ApiEndpoint[]
  dbTables: DbTable[]
  callGraph: CallGraphEntry[]
  blastRadius: BlastRadius[]
  inferences: string[]
  enrichedAt: string
  buildDurationMs: number
}

// ─── Layer Detection ──────────────────────────────────────────────────────────

function buildLayers(graph: any): ArchLayer[] {
  const layers: ArchLayer[] = [
    { name: 'Frontend', files: [], tech: [] },
    { name: 'API', files: [], tech: [] },
    { name: 'Services', files: [], tech: [] },
    { name: 'DB', files: [], tech: [] },
    { name: 'Infra', files: [], tech: [] },
  ]

  const frontendPatterns = [/\.tsx?$/i, /\.jsx?$/i, /\.css$/i, /\.scss$/i, /component/i, /page/i, /layout/i, /ui/i]
  const apiPatterns = [/api\//i, /route/i, /endpoint/i, /controller/i, /handler/i, /middleware/i]
  const servicePatterns = [/service/i, /util/i, /helper/i, /lib/i, /core/i, /engine/i, /pipeline/i]
  const dbPatterns = [/migration/i, /schema/i, /model/i, /prisma/i, /db\//i, /database/i, /\.sql$/i]
  const infraPatterns = [/docker/i, /ci/i, /cd/i, /deploy/i, /vercel/i, /render/i, /\.github/i, /terraform/i, /nginx/i]

  for (const file of graph.entryPoints?.map((e: any) => e.file) || []) {
    if (frontendPatterns.some(p => p.test(file))) layers[0].files.push(file)
    else if (apiPatterns.some(p => p.test(file))) layers[1].files.push(file)
  }

  // Distribute all files across layers
  const allFiles = graph.fileTree ? extractAllFiles(graph.fileTree) : []

  for (const file of allFiles) {
    if (dbPatterns.some(p => p.test(file))) layers[3].files.push(file)
    else if (infraPatterns.some(p => p.test(file))) layers[4].files.push(file)
    else if (apiPatterns.some(p => p.test(file))) layers[1].files.push(file)
    else if (servicePatterns.some(p => p.test(file))) layers[2].files.push(file)
    else if (frontendPatterns.some(p => p.test(file))) layers[0].files.push(file)
  }

  // Add tech from stack
  if (graph.stack?.frameworks?.length) {
    const feFrameworks = graph.stack.frameworks.filter((f: string) => ['nextjs', 'react', 'vue', 'angular', 'svelte'].includes(f))
    const beFrameworks = graph.stack.frameworks.filter((f: string) => ['express', 'flask', 'django', 'fastapi'].includes(f))
    layers[0].tech = feFrameworks
    layers[1].tech = beFrameworks
  }
  if (graph.stack?.tools?.length) layers[4].tech = graph.stack.tools
  if (graph.stack?.runtime?.length) layers[2].tech = graph.stack.runtime

  // Deduplicate and cap
  for (const layer of layers) {
    layer.files = [...new Set(layer.files)].slice(0, 200)
  }

  return layers
}

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

// ─── API Endpoint Detection ───────────────────────────────────────────────────

function detectApiEndpoints(graph: any): ApiEndpoint[] {
  const endpoints: ApiEndpoint[] = []
  const routeFiles = graph.entryPoints?.filter((e: any) => e.type === 'api-endpoint') || []

  for (const ep of routeFiles) {
    // Try to extract method and path from file path
    const filePath = ep.file
    let method = 'GET'
    let apiPath = '/'

    // Next.js App Router: app/api/[...]/route.ts → /api/[...]/
    const appRouterMatch = filePath.match(/app\/(api\/.+?)\/route\.(ts|js|mjs)/)
    if (appRouterMatch) {
      apiPath = '/' + appRouterMatch[1].replace(/\[([^\]]+)\]/g, ':$1')
    }

    // Pages Router: pages/api/[...].ts → /api/[...]
    const pagesRouterMatch = filePath.match(/pages\/(api\/.+?)\.(ts|js|mjs)/)
    if (pagesRouterMatch) {
      apiPath = '/' + pagesRouterMatch[1]
    }

    // Express-style: routes/api/...
    const expressMatch = filePath.match(/routes?\/(.+?)\.(ts|js|mjs)/)
    if (expressMatch) {
      apiPath = '/' + expressMatch[1]
    }

    // Check if auth-related
    const authRequired = /auth|session|jwt|token|protected/i.test(filePath) ||
      graph.ownershipMap?.find((o: any) => o.domain === 'auth')?.files?.includes(filePath)

    endpoints.push({
      method,
      path: apiPath,
      file: filePath,
      authRequired: !!authRequired,
      connectedTables: [], // filled by AI inference
    })
  }

  return endpoints
}

// ─── DB Table Detection ───────────────────────────────────────────────────────

function detectDbTables(graph: any): DbTable[] {
  const tables: DbTable[] = []
  const dbFiles = graph.ownershipMap?.find((o: any) => o.domain === 'database')?.files || []

  for (const file of dbFiles) {
    // Prisma schema
    if (file.endsWith('schema.prisma') || file.endsWith('schema.ts')) {
      try {
        const content = fs.readFileSync(path.join(graph.repoPath, file), 'utf8')
        const modelMatches = content.matchAll(/model\s+(\w+)\s*\{/g)
        for (const match of modelMatches) {
          tables.push({
            name: match[1],
            type: 'model',
            file,
            relationships: [],
            touchedBy: [],
          })
        }
      } catch { /* can't read */ }
    }

    // SQL migrations
    if (file.endsWith('.sql')) {
      const name = path.basename(file, '.sql')
      tables.push({ name, type: 'table', file, relationships: [], touchedBy: [] })
    }

    // Schema files
    if (/schema\.(ts|js|mjs)/i.test(file)) {
      tables.push({ name: path.basename(file), type: 'model', file, relationships: [], touchedBy: [] })
    }
  }

  // Also check for MongoDB models
  const allFiles = graph.fileTree ? extractAllFiles(graph.fileTree) : []
  for (const file of allFiles) {
    if (/model\.(ts|js)/i.test(file) && !tables.some(t => t.file === file)) {
      tables.push({ name: path.basename(file), type: 'model', file, relationships: [], touchedBy: [] })
    }
  }

  return tables
}

// ─── Component Dependency Detection ───────────────────────────────────────────

function detectComponentDeps(graph: any): ComponentDep[] {
  const deps: ComponentDep[] = []
  const allFiles = graph.fileTree ? extractAllFiles(graph.fileTree) : []
  const tsFiles = allFiles.filter((f: string) => /\.(ts|tsx|js|mjs)$/i.test(f))

  // Check imports in a sample of files (max 500 for perf)
  const sample = tsFiles.slice(0, 500)

  for (const file of sample) {
    try {
      const content = fs.readFileSync(path.join(graph.repoPath, file), 'utf8')
      const importMatches = content.matchAll(/(?:import|require)\s*\(?['"]([^'"]+)['"]\)?/g)
      for (const match of importMatches) {
        const dep = match[1]
        // Skip node_modules imports
        if (!dep.startsWith('.') && !dep.startsWith('/')) continue
        deps.push({ from: file, to: dep, type: 'import', inferred: false })
      }
    } catch { /* can't read */ }
  }

  return deps.slice(0, 2000) // cap
}

// ─── Blast Radius Detection ───────────────────────────────────────────────────

function detectBlastRadius(graph: any, layers: ArchLayer[]): BlastRadius[] {
  const blastRadius: BlastRadius[] = []
  const vulnerabilities = graph.vulnerabilities || []

  if (vulnerabilities.length === 0) return blastRadius

  // Build a map of which files import which packages
  const packageImportMap = new Map<string, Set<string>>()
  const allFiles = graph.fileTree ? extractAllFiles(graph.fileTree) : []

  // Scan a sample of files for package imports
  const sample = allFiles.filter((f: string) => /\.(ts|tsx|js|mjs)$/i.test(f)).slice(0, 500)

  for (const file of sample) {
    try {
      const content = fs.readFileSync(path.join(graph.repoPath, file), 'utf8')

      // Match import/require statements for npm packages
      const importMatches = content.matchAll(/(?:import|require)\s*\(?['"]([^'"]+)['"]\)?/g)
      for (const match of importMatches) {
        const dep = match[1]
        // Skip relative imports
        if (dep.startsWith('.') || dep.startsWith('/')) continue

        // Extract package name (handle scoped packages)
        const pkgName = dep.startsWith('@')
          ? dep.split('/').slice(0, 2).join('/')
          : dep.split('/')[0]

        if (!packageImportMap.has(pkgName)) {
          packageImportMap.set(pkgName, new Set())
        }
        packageImportMap.get(pkgName)!.add(file)
      }
    } catch { /* can't read */ }
  }

  // For each vulnerability, find affected files
  for (const vuln of vulnerabilities) {
    const affectedFiles = Array.from(packageImportMap.get(vuln.package) || [])

    if (affectedFiles.length === 0) continue

    // Determine which layers are affected
    const affectedLayers = new Set<string>()
    for (const file of affectedFiles) {
      for (const layer of layers) {
        if (layer.files.some(f => file.startsWith(f) || f.startsWith(file))) {
          affectedLayers.add(layer.name)
        }
      }
    }

    blastRadius.push({
      package: vuln.package,
      severity: vuln.severity,
      affectedFiles,
      affectedLayers: Array.from(affectedLayers),
      totalImpact: affectedFiles.length,
    })
  }

  // Sort by impact (most files affected first)
  return blastRadius.sort((a, b) => b.totalImpact - a.totalImpact)
}

// ─── AI Inference ─────────────────────────────────────────────────────────────

async function inferMissingLinks(graph: EnrichedGraph, traceId: string): Promise<{ deps: ComponentDep[]; callGraph: CallGraphEntry[]; inferences: string[] }> {
  const inferences: string[] = []
  const extraDeps: ComponentDep[] = []
  const callGraph: CallGraphEntry[] = []

  // Build a compact summary for the AI
  const summary = {
    stack: graph.scannerGraph.stack,
    entryPoints: graph.apiEndpoints.slice(0, 30).map(e => ({ method: e.method, path: e.path, file: e.file })),
    dbTables: graph.dbTables.slice(0, 20).map(t => ({ name: t.name, type: t.type })),
    ownershipDomains: graph.scannerGraph.ownershipMap?.slice(0, 10).map((o: any) => ({
      domain: o.domain,
      fileCount: o.files.length,
      sampleFiles: o.files.slice(0, 5),
    })),
    layers: graph.layers.map(l => ({ name: l.name, fileCount: l.files.length, tech: l.tech })),
  }

  try {
    const prompt: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a software architecture analyzer. Given a codebase summary, infer:
1. Missing component dependencies (Service A depends on Service B)
2. Call graph entries (frontend page → API route → DB table)
3. Any architectural risks or anti-patterns

Return ONLY JSON: {
  "missingDeps": [{ "from": "file", "to": "file", "type": "import|call|event|db-query", "reason": "why" }],
  "callGraph": [{ "frontendPage": "page file", "apiRoute": "route path", "dbQuery": "table name", "services": ["service files"] }],
  "inferences": ["string explaining each inference"],
  "risks": ["architectural risk 1", "architectural risk 2"]
}`
      },
      {
        role: 'user',
        content: JSON.stringify(summary).slice(0, 6000),
      },
    ]

    const result = await alphaCall('SCANNER', prompt)
    const parsed = JSON.parse(result.content)

    if (parsed.missingDeps) {
      for (const d of parsed.missingDeps) {
        extraDeps.push({ from: d.from, to: d.to, type: d.type || 'call', inferred: true })
      }
    }

    if (parsed.callGraph) {
      callGraph.push(...parsed.callGraph)
    }

    if (parsed.inferences) {
      inferences.push(...parsed.inferences)
    }

    if (parsed.risks) {
      inferences.push(`Risks: ${parsed.risks.join('; ')}`)
    }

    auditThought(traceId, 'xray-graph-builder', `AI inferred ${extraDeps.length} deps, ${callGraph.length} call graph entries, ${inferences.length} inferences`)
  } catch (err: any) {
    inferences.push(`AI inference failed: ${err.message}`)
    auditDecision(traceId, 'xray-graph-builder', `AI inference skipped: ${err.message}`)
  }

  return { deps: extraDeps, callGraph, inferences }
}

// ─── Main Entry ───────────────────────────────────────────────────────────────

export async function buildGraph(
  graph: any,
  traceId: string,
  onLog?: (msg: string) => void
): Promise<EnrichedGraph> {
  const startTime = Date.now()

  onLog?.('Building architecture layers...')
  const layers = buildLayers(graph)

  onLog?.('Detecting API endpoints...')
  const apiEndpoints = detectApiEndpoints(graph)

  onLog?.('Detecting DB tables/models...')
  const dbTables = detectDbTables(graph)

  onLog?.('Scanning component dependencies...')
  const componentDeps = detectComponentDeps(graph)

  onLog?.('Calculating vulnerability blast radius...')
  const blastRadius = detectBlastRadius(graph, layers)
  onLog?.(`Blast radius: ${blastRadius.length} vulnerable packages affecting ${blastRadius.reduce((sum, b) => sum + b.totalImpact, 0)} files`)

  onLog?.('Running AI inference for missing links...')
  const { deps: inferredDeps, callGraph, inferences } = await inferMissingLinks(
    { scannerGraph: graph, layers, componentDeps, apiEndpoints, dbTables, callGraph: [], blastRadius: [], inferences: [], enrichedAt: '', buildDurationMs: 0 },
    traceId
  )

  // Add blast radius inferences
  if (blastRadius.length > 0) {
    const criticalBlast = blastRadius.filter(b => b.severity === 'critical' || b.severity === 'high')
    if (criticalBlast.length > 0) {
      inferences.push(`Critical blast radius: ${criticalBlast.map(b => `${b.package} (${b.severity}) affects ${b.totalImpact} files`).join('; ')}`)
    }
  }

  auditTool(traceId, 'xray-graph-builder', `Built enriched graph: ${layers.length} layers, ${apiEndpoints.length} endpoints, ${dbTables.length} tables, ${componentDeps.length + inferredDeps.length} deps, ${blastRadius.length} blast radius entries`)

  return {
    scannerGraph: graph,
    layers,
    componentDeps: [...componentDeps, ...inferredDeps],
    apiEndpoints,
    dbTables,
    callGraph,
    blastRadius,
    inferences,
    enrichedAt: new Date().toISOString(),
    buildDurationMs: Date.now() - startTime,
  }
}
