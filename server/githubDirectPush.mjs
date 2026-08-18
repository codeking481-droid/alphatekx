/**
 * GITHUB DIRECT PUSH — OAuth + API routes for applying fixes directly to main.
 * Card 8 in the Website Resurrector flow.
 *
 * Routes:
 *   GET  /api/auth/github              — redirect to GitHub OAuth
 *   GET  /api/auth/github/callback     — exchange code for token, set cookie
 *   GET  /api/github/status            — check if connected
 *   GET  /api/github/repos             — list user repos
 *   POST /api/github/apply-fix         — clone, backup, copy fixed files, push to main
 *   POST /api/github/rollback          — force-push backup branch to main
 */

import fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import simpleGit from 'simple-git'

// ─── Config ───────────────────────────────────────────────────────────────────

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || ''
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || ''
const GITHUB_CALLBACK_URL = process.env.GITHUB_CALLBACK_URL || 'https://alphatekx.name.ng/api/auth/github/callback'

// ─── In-memory state store (OAuth state nonces) ───────────────────────────────

const pendingStates = new Map() // state -> { expiresAt }
setInterval(() => {
  const now = Date.now()
  for (const [key, val] of pendingStates) {
    if (val.expiresAt < now) pendingStates.delete(key)
  }
}, 60_000)

// ─── Cookie helpers ───────────────────────────────────────────────────────────

function parseCookies(req) {
  const raw = req.headers.cookie || ''
  const out = {}
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.split('=')
    if (key) out[key.trim()] = rest.join('=').trim()
  }
  return out
}

function setCookie(res, name, value, maxAge = 86400 * 30) {
  const existing = res.getHeader('Set-Cookie') || []
  const cookies = Array.isArray(existing) ? existing : [existing]
  cookies.push(`${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`)
  res.setHeader('Set-Cookie', cookies)
}

function clearCookie(res, name) {
  setCookie(res, name, '', 0)
}

function getTokenFromRequest(req) {
  const cookies = parseCookies(req)
  return cookies['gh_token'] || null
}

// ─── JSON helper ──────────────────────────────────────────────────────────────

function jsonResponse(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

// ─── GitHub API helper ────────────────────────────────────────────────────────

async function githubApi(endpoint, token, opts = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `https://api.github.com${endpoint}`
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'AlphaTekX-Website-Resurrector',
      ...(opts.headers || {}),
    },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`GitHub API ${res.status}: ${body.slice(0, 300)}`)
  }
  return res.json()
}

// ─── Route: Redirect to GitHub OAuth ──────────────────────────────────────────

export function handleGitHubAuth(req, res) {
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return jsonResponse(res, 500, { error: 'GitHub OAuth not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.' })
  }

  const state = randomBytes(24).toString('hex')
  pendingStates.set(state, { expiresAt: Date.now() + 600_000 })

  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: GITHUB_CALLBACK_URL,
    scope: 'repo',
    state,
  })

  res.writeHead(302, { Location: `https://github.com/login/oauth/authorize?${params}` })
  res.end()
}

// ─── Route: GitHub OAuth Callback ─────────────────────────────────────────────

export async function handleGitHubCallback(req, res) {
  try {
    const parsed = new URL(req.url, 'http://localhost')
    const code = parsed.searchParams.get('code')
    const state = parsed.searchParams.get('state')

    if (!code || !state) {
      return jsonResponse(res, 400, { error: 'Missing code or state parameter' })
    }

    if (!pendingStates.has(state)) {
      return jsonResponse(res, 400, { error: 'Invalid or expired OAuth state' })
    }
    pendingStates.delete(state)

    // Exchange code for token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'AlphaTekX-Website-Resurrector',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      }),
      signal: AbortSignal.timeout(15_000),
    })

    const tokenData = await tokenRes.json()

    if (tokenData.error) {
      return jsonResponse(res, 400, { error: tokenData.error_description || tokenData.error })
    }

    const accessToken = tokenData.access_token
    if (!accessToken) {
      return jsonResponse(res, 400, { error: 'No access token received from GitHub' })
    }

    // Verify token works
    const user = await githubApi('/user', accessToken)

    // Set cookie and redirect to frontend
    setCookie(res, 'gh_token', accessToken, 86400 * 30)
    setCookie(res, 'gh_user', user.login, 86400 * 30)

    res.writeHead(302, { Location: '/?github=connected' })
    res.end()
  } catch (err) {
    console.error('[GITHUB-OAUTH] Callback error:', err.message)
    jsonResponse(res, 500, { error: 'OAuth callback failed: ' + err.message })
  }
}

// ─── Route: Check connection status ───────────────────────────────────────────

export async function handleGitHubStatus(req, res) {
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return jsonResponse(res, 200, { connected: false, configured: false, error: 'GitHub OAuth not configured on this server. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables.' })
  }
  const token = getTokenFromRequest(req)
  if (!token) return jsonResponse(res, 200, { connected: false, configured: true })

  try {
    const user = await githubApi('/user', token)
    jsonResponse(res, 200, { connected: true, user: { login: user.login, avatar_url: user.avatar_url } })
  } catch {
    clearCookie(res, 'gh_token')
    clearCookie(res, 'gh_user')
    jsonResponse(res, 200, { connected: false })
  }
}

// ─── Route: List repos ────────────────────────────────────────────────────────

export async function handleGitHubRepos(req, res) {
  const token = getTokenFromRequest(req)
  if (!token) return jsonResponse(res, 401, { error: 'Not connected to GitHub' })

  try {
    let allRepos = []
    let page = 1
    while (page <= 5) {
      const repos = await githubApi(`/user/repos?per_page=100&sort=updated&page=${page}`, token)
      allRepos = allRepos.concat(repos)
      if (repos.length < 100) break
      page++
    }

    const filtered = allRepos.map(r => ({
      full_name: r.full_name,
      default_branch: r.default_branch,
      private: r.private,
      description: r.description || '',
      updated_at: r.updated_at,
      html_url: r.html_url,
    }))

    jsonResponse(res, 200, { repos: filtered })
  } catch (err) {
    jsonResponse(res, 500, { error: 'Failed to fetch repos: ' + err.message })
  }
}

// ─── Route: Apply fix (direct push to main) ───────────────────────────────────

export async function handleGitHubApplyFix(req, res) {
  const token = getTokenFromRequest(req)
  if (!token) return jsonResponse(res, 401, { error: 'Not connected to GitHub' })

  let body = ''
  for await (const chunk of req) body += chunk

  let repoFullName, scanId
  try {
    const parsed = JSON.parse(body)
    repoFullName = parsed.repoFullName
    scanId = parsed.scanId
  } catch {
    return jsonResponse(res, 400, { error: 'Invalid JSON body' })
  }

  if (!repoFullName || !scanId) {
    return jsonResponse(res, 400, { error: 'repoFullName and scanId are required' })
  }

  const restoredDir = path.resolve(tmpdir(), `restore-${scanId}`, 'restored')
  if (!fs.existsSync(restoredDir)) {
    return jsonResponse(res, 404, { error: `No restored files found for scan ${scanId}. Run the scan first.` })
  }

  // SSE stream for progress
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  const sendEvent = (event) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`)
  }

  const githubDir = path.resolve(tmpdir(), `github-${scanId}`)
  const timestamp = Date.now().toString(36)
  const backupBranch = `backup-before-alphatekx-fix-${timestamp}`
  let cloned = false

  try {
    // Step 1: Get repo info
    sendEvent({ type: 'log', text: 'Connecting to repository...' })
    const repoInfo = await githubApi(`/repos/${repoFullName}`, token)
    const defaultBranch = repoInfo.default_branch || 'main'
    sendEvent({ type: 'log', text: `Default branch: ${defaultBranch}` })

    // Step 2: Clone
    sendEvent({ type: 'log', text: 'Cloning repository...' })
    // Clean up if exists
    if (fs.existsSync(githubDir)) {
      fs.rmSync(githubDir, { recursive: true, force: true })
    }
    fs.mkdirSync(githubDir, { recursive: true })

    const git = simpleGit(githubDir)
    // Clone using token as auth
    await git.clone(`https://${token}@github.com/${repoFullName}.git`, '.', { depth: 50 })
    cloned = true
    sendEvent({ type: 'log', text: 'Repository cloned.' })

    // Step 3: Create backup branch
    sendEvent({ type: 'log', text: `Creating backup branch: ${backupBranch}` })
    await git.checkoutLocalBranch(backupBranch)
    await git.push('origin', backupBranch, ['-u'])
    sendEvent({ type: 'log', text: `Backup branch pushed to origin.` })

    // Step 4: Checkout default branch
    sendEvent({ type: 'log', text: `Switching to ${defaultBranch}...` })
    await git.checkout(defaultBranch)

    // Step 5: Copy fixed files (overwrite)
    sendEvent({ type: 'log', text: 'Applying fixed files...' })
    const fixedFiles = copyDirSync(restoredDir, githubDir)
    sendEvent({ type: 'log', text: `${fixedFiles.length} file(s) updated: ${fixedFiles.join(', ')}` })

    // Step 6: Stage and commit
    sendEvent({ type: 'log', text: 'Committing changes...' })
    await git.add('./*')
    const diffSummary = await git.diff(['--cached', '--stat'])
    if (!diffSummary || diffSummary.trim() === '' || diffSummary.includes('0 file')) {
      sendEvent({ type: 'log', text: 'No changes to commit — files may already be up to date.' })
      sendEvent({ type: 'done', data: { backupBranch, noChanges: true } })
      cleanupDir(githubDir)
      if (!res.writableEnded) res.end()
      return
    }
    await git.commit(`AlphaTekX: Fix ${fixedFiles.length} file(s) — backup at ${backupBranch}`)

    // Step 7: Push to main
    sendEvent({ type: 'log', text: 'Pushing to main branch...' })
    try {
      await git.push('origin', defaultBranch)
    } catch (pushErr) {
      const msg = String(pushErr.message || pushErr)
      if (/protected/i.test(msg) || /403/i.test(msg) || /required status/i.test(msg)) {
        sendEvent({ type: 'error', message: 'Main branch is protected. Please unprotect it in GitHub Settings → Branches, or use the backup branch flow.' })
        sendEvent({ type: 'done', data: { backupBranch, protected: true, backupUrl: `https://github.com/${repoFullName}/tree/${backupBranch}` } })
        cleanupDir(githubDir)
        if (!res.writableEnded) res.end()
        return
      }
      throw pushErr
    }

    // Step 8: Get commit SHA
    const log = await git.log({ maxCount: 1 })
    const commitSha = log.latest?.hash || 'unknown'

    sendEvent({ type: 'log', text: 'Push complete! Your site should redeploy automatically.' })

    sendEvent({
      type: 'done',
      data: {
        backupBranch,
        backupUrl: `https://github.com/${repoFullName}/tree/${backupBranch}`,
        mainUrl: `https://github.com/${repoFullName}/commit/${commitSha}`,
        commitSha,
        liveUrl: repoInfo.homepage || `https://${repoFullName.split('/')[0]}.github.io/${repoFullName.split('/')[1]}`,
        filesChanged: fixedFiles.length,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[GITHUB-APPLY] Error:', msg)
    sendEvent({ type: 'error', message: msg })

    // If push failed but we have a backup, still return backup info
    sendEvent({ type: 'done', data: { backupBranch, error: true } })
  } finally {
    cleanupDir(githubDir)
    if (!res.writableEnded) res.end()
  }
}

// ─── Route: Rollback ──────────────────────────────────────────────────────────

export async function handleGitHubRollback(req, res) {
  const token = getTokenFromRequest(req)
  if (!token) return jsonResponse(res, 401, { error: 'Not connected to GitHub' })

  let body = ''
  for await (const chunk of req) body += chunk

  let repoFullName, backupBranch
  try {
    const parsed = JSON.parse(body)
    repoFullName = parsed.repoFullName
    backupBranch = parsed.backupBranch
  } catch {
    return jsonResponse(res, 400, { error: 'Invalid JSON body' })
  }

  if (!repoFullName || !backupBranch) {
    return jsonResponse(res, 400, { error: 'repoFullName and backupBranch are required' })
  }

  const githubDir = path.resolve(tmpdir(), `github-rollback-${Date.now().toString(36)}`)
  let cloned = false

  try {
    const repoInfo = await githubApi(`/repos/${repoFullName}`, token)
    const defaultBranch = repoInfo.default_branch || 'main'

    // Clone
    fs.mkdirSync(githubDir, { recursive: true })
    const git = simpleGit(githubDir)
    await git.clone(`https://${token}@github.com/${repoFullName}.git`, '.', { depth: 50 })
    cloned = true

    // Fetch backup branch
    await git.fetch('origin', backupBranch)

    // Force push backup to main
    await git.checkout(`origin/${backupBranch}`)
    await git.push('origin', defaultBranch, ['--force'])

    jsonResponse(res, 200, {
      success: true,
      message: `Rolled back to ${backupBranch}`,
      mainUrl: `https://github.com/${repoFullName}/tree/${defaultBranch}`,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    jsonResponse(res, 500, { error: 'Rollback failed: ' + msg })
  } finally {
    cleanupDir(githubDir)
  }
}

// ─── Utility: Recursive copy ──────────────────────────────────────────────────

function copyDirSync(src, dest) {
  const files = []
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true })
      files.push(...copyDirSync(srcPath, destPath))
    } else {
      fs.copyFileSync(srcPath, destPath)
      files.push(entry.name)
    }
  }
  return files
}

function cleanupDir(dir) {
  try {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
  } catch {}
}
