/**
 * MCP ENDPOINT — Model Context Protocol server for Alpha's restoration engine.
 *
 * Transport: streamable-http style JSON-RPC 2.0 at POST /mcp.
 * Any MCP-capable agent IDE (Cursor, Claude Desktop via connector, VS Code
 * agents…) can add `http://localhost:3001/mcp` and invoke:
 *
 *   alpha_check_site         — read-only diagnosis of a URL (score + issues)
 *   alpha_restore_site       — full surgical restoration, returns artifacts
 *   alpha_list_restorations  — recent restoration ids on this server
 */

import fs from 'node:fs'
import path from 'node:path'

const SERVER_INFO = { name: 'alphatekx-alpha', version: '1.0.0' }

const TOOL_DEFS = [
  {
    name: 'alpha_check_site',
    description: 'Read-only diagnosis of a website: health score, issue counts, and the top issues found. Never modifies anything.',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string', description: 'The site URL to diagnose' } },
      required: ['url'],
    },
  },
  {
    name: 'alpha_restore_site',
    description: 'Full surgical restoration of a broken website. Runs diagnosis, redacts exposed secrets, applies repairs, verifies behavior in a live browser, and returns a restoration id with download links.',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string', description: 'The broken site URL to restore' } },
      required: ['url'],
    },
  },
  {
    name: 'alpha_list_restorations',
    description: 'List recent restorations performed by this Alpha server (ids + timestamps).',
    inputSchema: { type: 'object', properties: {} },
  },
]

function normalizeTargetUrl(raw) {
  let url = String(raw || '').trim()
  if (!url) return ''
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url.replace(/^\/+/, '')
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) return ''
    return parsed.toString()
  } catch {
    return ''
  }
}

async function toolCheckSite(args) {
  const url = normalizeTargetUrl(args?.url)
  if (!url) throw new Error('A valid http(s) URL is required')
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AlphaTekXMCP/1.0)' },
    signal: AbortSignal.timeout(30_000),
    redirect: 'follow',
  })
  const html = await res.text()
  const { diagnose } = await import('./alphaRestorationPipeline.mjs')
  const d = await diagnose(html)
  return {
    url,
    httpStatus: res.status,
    score: Number(d?.score ?? 100),
    issuesFound: Number(d?.summary?.total ?? 0),
    critical: Number(d?.summary?.critical ?? 0),
    topIssues: (d?.issues || []).slice(0, 10).map((i) => ({ type: i.type, severity: i.severity, description: i.description })),
  }
}

async function toolRestoreSite(args) {
  const url = normalizeTargetUrl(args?.url)
  if (!url) throw new Error('A valid http(s) URL is required')
  const mod = await import('./alphaRestorationPipeline.mjs')
  const events = []
  await mod.runRestorationPipeline({
    targetUrl: url,
    mode: 'full',
    origin: process.env.PUBLIC_APP_URL || 'http://localhost:3001',
    cookieHeader: '',
    maxPages: 1,
    sendEvent: (event) => {
      if (['restore_complete', 'error', 'github_pr'].includes(event?.type)) events.push(event)
    },
    sendStep: () => {},
  })
  const complete = events.find((e) => e.type === 'restore_complete')
  if (!complete) {
    const failed = events.find((e) => e.type === 'error')
    throw new Error(failed ? String(failed.message) : 'Restoration did not complete')
  }
  const id = complete.restorationId
  return {
    restorationId: id,
    status: complete.data?.summary?.status,
    beforeScore: complete.data?.summary?.before_score,
    afterScore: complete.data?.summary?.after_score,
    issuesFixed: complete.data?.summary?.issues_fixed,
    issuesFound: complete.data?.summary?.issues_found,
    behaviorTests: complete.data?.agent?.behavior_tests,
    download: `/api/restore/v3/download?id=${id}&which=restored`,
    report: `/api/restore/v3/artifact/${id}/RESTORATION_REPORT.json`,
    githubPr: events.find((e) => e.type === 'github_pr')?.data?.prUrl || null,
  }
}

async function toolListRestorations() {
  const dir = path.resolve(process.cwd(), 'data', 'restorations')
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith('atk_'))
      .slice(-25)
      .map((e) => {
        let at = null
        try { at = fs.statSync(path.join(dir, e.name)).mtime.toISOString() } catch {}
        return { id: e.name, completedAt: at }
      })
    return { count: entries.length, restorations: entries.reverse() }
  } catch {
    return { count: 0, restorations: [] }
  }
}

async function callTool(name, args) {
  switch (name) {
    case 'alpha_check_site': return toolCheckSite(args)
    case 'alpha_restore_site': return toolRestoreSite(args)
    case 'alpha_list_restorations': return toolListRestorations(args)
    default: throw new Error(`Unknown tool: ${name}`)
  }
}

export async function handleMcpRoute(req, res) {
  let body = ''
  for await (const chunk of req) body += chunk
  let msg
  try {
    msg = JSON.parse(body)
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null }))
  }

  const reply = (result, error) => {
    if (!res.writableEnded) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(error ? { jsonrpc: '2.0', id: msg.id ?? null, error } : { jsonrpc: '2.0', id: msg.id ?? null, result }))
    }
  }

  // Notifications (no id) get no response body per JSON-RPC.
  if (msg.id === undefined || msg.id === null) {
    res.writeHead(202, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ jsonrpc: '2.0', result: null }))
  }

  try {
    switch (msg.method) {
      case 'initialize':
        return reply({
          protocolVersion: String(msg.params?.protocolVersion || '2025-06-18'),
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        })
      case 'ping':
        return reply({})
      case 'tools/list':
        return reply({ tools: TOOL_DEFS })
      case 'tools/call': {
        const name = String(msg.params?.name || '')
        const args = msg.params?.arguments || {}
        try {
          const data = await callTool(name, args)
          return reply({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data, isError: false })
        } catch (err) {
          return reply({
            content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }],
            isError: true,
          })
        }
      }
      default:
        return reply(undefined, { code: -32601, message: `Method not found: ${msg.method}` })
    }
  } catch (err) {
    return reply(undefined, { code: -32603, message: err instanceof Error ? err.message : 'Internal error' })
  }
}
