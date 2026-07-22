import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const workspacesDir = path.resolve(root, 'build-workspaces')
const previewRunsDir = path.resolve(root, 'preview-runs')

const MAX_INSTALL_MS = 180_000
const MAX_TOOL_MS = 120_000
const SECRET_RE = /SECRET|KEY|TOKEN|PASSWORD|PRIVATE|APIKEY|CREDENTIAL|AUTH/i

export function rootDir() { return root }
export function previewRunsRoot() { return previewRunsDir }

export function sanitizeEnv(env = process.env) {
  const clean = { ...env }
  for (const key of Object.keys(clean)) {
    if (SECRET_RE.test(key)) delete clean[key]
  }
  clean.NODE_ENV = 'production'
  clean.npm_config_audit = 'false'
  clean.npm_config_fund = 'false'
  clean.npm_config_ignore_scripts = 'true'
  return clean
}

export function workspacePath(missionId, nonce = null) {
  const id = nonce || `${Date.now()}-${randomBytes(4).toString('hex')}`
  return path.resolve(workspacesDir, `${missionId}-${id}`)
}

export function ensureInside(target, base) {
  const resolved = path.resolve(target)
  if (!resolved.startsWith(path.resolve(base) + path.sep)) throw new Error(`Path traversal blocked: ${target}`)
  return resolved
}

export function readWorkspaceMeta(workspaceDir) {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(workspaceDir, '.alpha-metadata.json'), 'utf8'))
  } catch { return null }
}

export function createWorkspace({ missionId, ownerId, codeHash }) {
  const workspaceDir = workspacePath(missionId)
  if (fs.existsSync(workspaceDir)) {
    try { fs.rmSync(workspaceDir, { recursive: true, force: true }) } catch {}
  }
  fs.mkdirSync(workspaceDir, { recursive: true })
  fs.writeFileSync(path.resolve(workspaceDir, '.alpha-metadata.json'), JSON.stringify({
    missionId,
    ownerId: ownerId || 'anonymous',
    createdAt: new Date().toISOString(),
    codeHash,
  }), 'utf8')
  return { workspaceDir, missionId, ownerId }
}

export function cleanupOldWorkspaces(maxPerMission = 3) {
  try {
    if (!fs.existsSync(workspacesDir)) return
    const dirs = fs.readdirSync(workspacesDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => ({ name: e.name, dir: path.resolve(workspacesDir, e.name), stat: fs.statSync(path.resolve(workspacesDir, e.name)) }))
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
    const byMission = new Map()
    for (const entry of dirs) {
      const missionId = entry.name.split('-')[0]
      const list = byMission.get(missionId) || []
      list.push(entry)
      byMission.set(missionId, list)
    }
    for (const list of byMission.values()) {
      for (let i = maxPerMission; i < list.length; i++) {
        try { fs.rmSync(list[i].dir, { recursive: true, force: true }) } catch {}
      }
    }
  } catch {}
}

function resolveCommand(workspaceDir, command) {
  if (command === 'npm') {
    const candidates = [
      process.env.npm_execpath,
      path.resolve(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    ].filter(Boolean)
    const npmCli = candidates.find(candidate => fs.existsSync(candidate))
    if (npmCli) return { type: 'node', script: npmCli }
    return { type: 'exec', bin: process.platform === 'win32' ? 'npm.cmd' : 'npm' }
  }
  const candidates = {
    tsc: ['typescript', 'bin', 'tsc'],
    eslint: ['eslint', 'bin', 'eslint.js'],
    vite: ['vite', 'bin', 'vite.js'],
  }
  const parts = candidates[command]
  if (parts) {
    for (const base of [workspaceDir, root]) {
      const script = path.resolve(base, 'node_modules', ...parts)
      if (fs.existsSync(script)) return { type: 'node', script }
    }
  }
  const localBin = path.resolve(workspaceDir, 'node_modules', '.bin', command)
  if (fs.existsSync(localBin)) return { type: 'exec', bin: localBin }
  const rootBin = path.resolve(root, 'node_modules', '.bin', command)
  if (fs.existsSync(rootBin)) return { type: 'exec', bin: rootBin }
  return { type: 'exec', bin: command }
}

export function runCommand(workspaceDir, command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const { timeoutMs = MAX_TOOL_MS, signal, label = command, env = sanitizeEnv() } = options
    const resolved = resolveCommand(workspaceDir, command)
    const logLines = []
    const push = (data) => { logLines.push(data.toString()) }

    const child = resolved.type === 'node'
      ? spawn(process.execPath, [resolved.script, ...args], { cwd: workspaceDir, env, stdio: ['ignore', 'pipe', 'pipe'] })
      : spawn(resolved.bin, args, { cwd: workspaceDir, env, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' && resolved.bin.endsWith('.cmd') })

    child.stdout.on('data', push)
    child.stderr.on('data', push)

    let finished = false
    const finish = (ok, code) => {
      if (finished) return
      finished = true
      const log = logLines.join('')
      resolve({ ok, log, code, label, killed: child.killed })
    }

    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      push(`\n[${label}] Timed out after ${timeoutMs}ms`)
    }, timeoutMs)

    const abortHandler = () => {
      child.kill('SIGKILL')
      push(`\n[${label}] Cancelled`)
    }
    if (signal) {
      if (signal.aborted) { abortHandler(); return }
      signal.addEventListener('abort', abortHandler)
    }

    child.on('close', (code) => { clearTimeout(timer); if (signal) signal.removeEventListener('abort', abortHandler); finish(code === 0, code) })
    child.on('error', (err) => { clearTimeout(timer); if (signal) signal.removeEventListener('abort', abortHandler); push(`\n[${label}] ${err.message}`); finish(false, null) })
  })
}

export async function installDependencies(workspaceDir, signal) {
  return runCommand(workspaceDir, 'npm', ['install', '--ignore-scripts', '--include=dev', '--no-audit', '--no-fund', '--prefer-offline'], { label: 'npm install', timeoutMs: MAX_INSTALL_MS, signal, env: { ...sanitizeEnv(), npm_config_ignore_scripts: 'true', NODE_ENV: 'development' } })
}

export function copyTemplate(workspaceDir, templateDir) {
  if (!fs.existsSync(templateDir)) throw new Error(`Template not found: ${templateDir}`)
  const copy = (src, dest) => {
    fs.mkdirSync(dest, { recursive: true })
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      const srcPath = path.join(src, entry.name)
      const destPath = path.join(dest, entry.name)
      if (entry.isDirectory()) copy(srcPath, destPath)
      else fs.copyFileSync(srcPath, destPath)
    }
  }
  copy(templateDir, workspaceDir)
}

export function publishDist(workspaceDir, missionId) {
  const distDir = path.resolve(workspaceDir, 'dist')
  const targetDir = path.resolve(previewRunsDir, missionId)
  if (!fs.existsSync(distDir)) return false
  if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true })
  fs.mkdirSync(targetDir, { recursive: true })
  for (const entry of fs.readdirSync(distDir, { withFileTypes: true })) {
    const src = path.join(distDir, entry.name)
    const dest = path.join(targetDir, entry.name)
    if (entry.isDirectory()) fs.cpSync(src, dest, { recursive: true })
    else fs.copyFileSync(src, dest)
  }
  return true
}

export function servePreview(req, res, missionId) {
  const distDir = path.resolve(previewRunsDir, missionId)
  const indexHtml = path.resolve(distDir, 'index.html')
  if (!fs.existsSync(indexHtml)) return false

  const url = new URL(req.url || '/', 'http://localhost')
  const escapedId = String(missionId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const relative = url.pathname.replace(new RegExp(`^/preview/${escapedId}/?`), '') || 'index.html'
  const assetPath = path.resolve(distDir, relative)

  const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.json': 'application/json',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
  }

  function serve(filePath) {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false
    const ext = path.extname(filePath).toLowerCase()
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Frame-Options': 'SAMEORIGIN',
    })
    fs.createReadStream(filePath).pipe(res)
    return true
  }

  if (assetPath.startsWith(distDir + path.sep) && fs.existsSync(assetPath) && fs.statSync(assetPath).isFile()) {
    return serve(assetPath)
  }
  return serve(indexHtml)
}
