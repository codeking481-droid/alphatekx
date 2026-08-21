// restorationEngine.mjs — session-based 10-step interactive Restoration Engine.
// State machine: IDLE -> SCANNING -> SCAN_COMPLETE -> GENERATING_FIXES -> FIXES_READY
//   -> APPLYING_FIXES -> RESTORATION_COMPLETE -> OPTION_SELECTED -> VERIFYING -> DONE
// Routes (mounted under /api/engine/):
//   POST /api/engine/session         create a session -> { sessionId }
//   GET  /api/engine/state           ?sessionId=  full snapshot
//   POST /api/engine/scan            { sessionId, url }
//   GET  /api/engine/scan/status     ?sessionId=
//   POST /api/engine/fix             { sessionId }
//   POST /api/engine/approve         { sessionId, approved, disabled? }
//   POST /api/engine/delivery        { sessionId, option: github|download|code|deploy }
//   POST /api/engine/action-complete { sessionId }              (copy-code gate)
//   POST /api/engine/github          { sessionId, repo, token? } -> pr_url
//   GET  /api/engine/download        ?sessionId= -> restored.zip
//   GET  /api/engine/code            ?sessionId= -> fixed HTML text
//   POST /api/engine/deploy          { sessionId, name, title? } -> url
//   POST /api/engine/verify          { sessionId } re-scans target URL
//   GET  /api/engine/verify/status   ?sessionId=

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import { FileHandler, sanitizeEncoding, validateHtml } from './scanEngine/fileUtils.js'
import { createMinimalZip } from './websiteRestoreStream.mjs'

const SESSION_TTL_MS = 24 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 15_000
const MAX_HTML_BYTES = 900_000

const SEVERITY_DEDUCTION = { critical: 15, high: 10, medium: 5, low: 2 }

const SECRET_PATTERNS = [
  { type: 'GITHUB_TOKEN', label: 'GitHub token', regex: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { type: 'OPENAI_KEY', label: 'OpenAI API key', regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { type: 'AWS_ACCESS_KEY', label: 'AWS access key', regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { type: 'SLACK_TOKEN', label: 'Slack token', regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { type: 'GENERIC_SECRET', label: 'Hardcoded secret or password', regex: /(?:password|passwd|secret|api_?key|auth_?token)\s*[:=]\s*["']([^"'\s]{8,})["']/gi },
]

function maskSecret(value) {
  const raw = String(value || '')
  if (raw.length <= 8) return 'REDACTED'
  return `${raw.slice(0, 3)}****${raw.slice(-4)}`
}

export function createRestorationEngine(deps = {}) {
  const sessions = new Map()
  const log = deps.log || (() => {})

  function pruneSessions() {
    const cutoff = Date.now() - SESSION_TTL_MS
    for (const [id, session] of sessions) {
      if (session.updatedAt < cutoff) {
        sessions.delete(id)
        try { fs.rmSync(session.workDir, { recursive: true, force: true }) } catch {}
      }
    }
  }

  function getSession(sessionId) {
    return sessions.get(String(sessionId || '')) || null
  }

  function touch(session) {
    session.updatedAt = Date.now()
  }

  function json(res, status, payload) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(payload))
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let data = ''
      req.on('data', (chunk) => {
        data += chunk
        if (data.length > 2_000_000) {
          reject(new Error('Payload too large'))
          req.destroy()
        }
      })
      req.on('end', () => {
        try { resolve(data ? JSON.parse(data) : {}) } catch { reject(new Error('Invalid JSON body')) }
      })
      req.on('error', reject)
    })
  }

  function errorResponse(res, status, error, actionRequired = '', retry = true) {
    return json(res, status, { step: 'error', error, action_required: actionRequired, retry })
  }

  function buildSummary(session) {
    return {
      issues_found: session.findings.length,
      issues_fixed: session.appliedFixes,
      files_modified: session.filesModified,
      before_score: session.beforeScore,
      after_score: session.afterScore,
    }
  }

  function successResponse(session, message, actions = []) {
    return {
      step: session.state.toLowerCase(),
      status: 'success',
      state: session.state,
      summary: buildSummary(session),
      message,
      actions,
    }
  }

  function normalizeTargetUrl(raw) {
    let value = String(raw || '').trim()
    if (!value) return null
    if (!/^https?:\/\//i.test(value)) value = `https://${value}`
    try {
      const parsed = new URL(value)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
      if (!parsed.hostname || parsed.hostname.length > 253) return null
      return parsed.toString()
    } catch {
      return null
    }
  }

  async function fetchPage(url) {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AlphaTekxRestoreEngine/1.0)', Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    const contentType = String(response.headers.get('content-type') || '')
    const text = await response.text()
    return { ok: response.ok, status: response.status, finalUrl: response.url || url, contentType, html: text }
  }

  function detectIssues(html) {
    const findings = []
    let counter = 0
    const add = (type, severity, description, count = 1, evidence = '') => {
      findings.push({ id: `f-${++counter}`, type, severity, description, count, evidence: evidence.slice(0, 200) })
    }

    const hasBom = typeof html === 'string' && html.charCodeAt(0) === 0xFEFF
    const hasNullBytes = typeof html === 'string' && html.includes('\u0000')
    const hasCjk = typeof html === 'string' && /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(html)
    const hasReplacement = typeof html === 'string' && /\uFFFD/.test(html)
    if (hasBom || hasNullBytes || hasCjk || hasReplacement) {
      const causes = [hasBom && 'BOM prefix', hasNullBytes && 'null bytes', hasCjk && 'CJK characters', hasReplacement && 'replacement characters'].filter(Boolean).join(', ')
      add('corrupted_encoding', 'critical', `Encoding corruption detected (${causes}). File must be re-saved as clean UTF-8.`)
    }

    for (const pattern of SECRET_PATTERNS) {
      const matches = [...String(html).matchAll(pattern.regex)].filter((m) => (m[1] || '') !== 'REDACTED')
      if (matches.length) {
        const sample = maskSecret(matches[0][1] || matches[0][0])
        add('leaked_secret', 'critical', `${pattern.label} exposed in page source (${matches.length} occurrence${matches.length > 1 ? 's' : ''}, e.g. ${sample}).`, matches.length, sample)
      }
    }

    const mixedContent = [...String(html).matchAll(/(?:src|href)\s*=\s*["']http:\/\/(?!localhost|127\.0\.0\.1)[^"']+["']/gi)]
    if (mixedContent.length) {
      add('mixed_content', 'high', `${mixedContent.length} insecure http:// resource reference${mixedContent.length > 1 ? 's' : ''} will trigger browser mixed-content warnings.`, mixedContent.length, mixedContent[0][0])
    }

    if (!/<meta[^>]+charset/i.test(html)) {
      add('missing_charset', 'high', 'No charset declaration found. Browsers may misinterpret encoding.')
    }
    if (!/<meta[^>]+name=["']viewport["']/i.test(html)) {
      add('missing_viewport', 'medium', 'No viewport meta tag. Page will not render correctly on mobile devices.')
    }
    if (!/<title>[^<]*\S[^<]*<\/title>/i.test(html)) {
      add('missing_title', 'medium', 'Missing or empty <title> tag.')
    }
    if (!/<html[^>]*\slang\s*=/i.test(html)) {
      add('missing_lang', 'low', '<html> tag has no lang attribute (accessibility/SEO).')
    }
    if (!/<meta[^>]+name=["']description["'][^>]+content\s*=\s*["'][^"']+\S/i.test(html)) {
      add('missing_description', 'low', 'Missing meta description tag (SEO).')
    }
    const imgsWithoutAlt = [...String(html).matchAll(/<img(?![^>]*\balt\s*=)[^>]*>/gi)]
    if (imgsWithoutAlt.length) {
      add('img_missing_alt', 'low', `${imgsWithoutAlt.length} <img> tag${imgsWithoutAlt.length > 1 ? 's' : ''} without alt attribute (accessibility).`, imgsWithoutAlt.length)
    }

    return findings
  }

  function scoreFor(findings) {
    let score = 100
    for (const finding of findings) {
      score -= SEVERITY_DEDUCTION[finding.severity] || 2
      if (finding.count > 1) score -= Math.min(10, (finding.count - 1))
    }
    return Math.max(0, Math.min(100, score))
  }

  function generateFixes(session) {
    const fixes = []
    for (const finding of session.findings) {
      fixes.push({
        findingId: finding.id,
        type: finding.type,
        severity: finding.severity,
        description: fixDescriptionFor(finding),
        original: finding.evidence || finding.description,
        fixed: fixPreviewFor(finding),
      })
    }
    return fixes
  }

  function fixDescriptionFor(finding) {
    switch (finding.type) {
      case 'corrupted_encoding': return 'Strip BOM, null bytes, and replacement characters; enforce clean UTF-8.'
      case 'leaked_secret': return 'Redact exposed secret values with REDACTED placeholders.'
      case 'mixed_content': return 'Upgrade insecure http:// resource URLs to https://.'
      case 'missing_charset': return 'Inject <meta charset="utf-8"> into <head>.'
      case 'missing_viewport': return 'Inject responsive viewport meta tag.'
      case 'missing_title': return 'Insert a descriptive <title> tag.'
      case 'missing_lang': return 'Add lang="en" to the <html> tag.'
      case 'missing_description': return 'Insert meta description tag.'
      case 'img_missing_alt': return 'Add alt attributes to all <img> tags.'
      default: return 'Apply deterministic repair.'
    }
  }

  function fixPreviewFor(finding) {
    switch (finding.type) {
      case 'corrupted_encoding': return '<file saved as clean UTF-8, no BOM>'
      case 'leaked_secret': return 'password = "REDACTED"'
      case 'mixed_content': return 'src="https://..."'
      case 'missing_charset': return '<meta charset="utf-8">'
      case 'missing_viewport': return '<meta name="viewport" content="width=device-width, initial-scale=1">'
      case 'missing_title': return '<title>Restored Site</title>'
      case 'missing_lang': return '<html lang="en">'
      case 'missing_description': return '<meta name="description" content="Restored by AlphaTekX">'
      case 'img_missing_alt': return '<img src="..." alt="">'
      default: return '(auto-repair)'
    }
  }

  function applyFixesToHtml(html, enabledTypes) {
    let out = String(html)
    const applied = []

    if (enabledTypes.has('corrupted_encoding')) {
      out = sanitizeEncoding(out)
      out = out.replace(/^\uFEFF/, '').replace(/\u0000/g, '').replace(/\uFFFD/g, '')
      applied.push('corrupted_encoding')
    }
    if (enabledTypes.has('leaked_secret')) {
      for (const pattern of SECRET_PATTERNS) {
        out = out.replace(pattern.regex, (match, captured) => {
          if (captured) return match.replace(captured, 'REDACTED')
          return match.slice(0, 3) + 'REDACTED'
        })
      }
      applied.push('leaked_secret')
    }
    if (enabledTypes.has('mixed_content')) {
      out = out.replace(/((?:src|href)\s*=\s*["'])http:\/\/(?!localhost|127\.0\.0\.1)([^"']+["'])/gi, '$1https://$2')
      applied.push('mixed_content')
    }
    if (enabledTypes.has('img_missing_alt')) {
      out = out.replace(/<img((?![^>]*\balt\s*=)[^>]*)>/gi, '<img$1 alt="">')
      applied.push('img_missing_alt')
    }
    if (enabledTypes.has('missing_lang') && !/<html[^>]*\slang\s*=/i.test(out)) {
      out = out.replace(/<html(\s|>)/i, (match, tail) => `<html lang="en"${tail === '>' ? ' ' : ''}${tail}`)
      applied.push('missing_lang')
    }
    if (enabledTypes.has('missing_charset') && !/<meta[^>]+charset/i.test(out)) {
      if (/<head[^>]*>/i.test(out)) out = out.replace(/<head([^>]*)>/i, (m) => `${m}\n  <meta charset="utf-8">`)
      else out = `<head>\n  <meta charset="utf-8">\n</head>\n${out}`
      applied.push('missing_charset')
    }
    if (enabledTypes.has('missing_viewport') && !/<meta[^>]+name=["']viewport["']/i.test(out)) {
      if (/<head[^>]*>/i.test(out)) out = out.replace(/<head([^>]*)>/i, (m) => `${m}\n  <meta name="viewport" content="width=device-width, initial-scale=1">`)
      else out = `<head>\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n</head>\n${out}`
      applied.push('missing_viewport')
    }
    if (enabledTypes.has('missing_title') && !/<title>[^<]*\S[^<]*<\/title>/i.test(out)) {
      const titleTag = '<title>Restored Site</title>'
      if (/<head[^>]*>/i.test(out)) out = out.replace(/<head([^>]*)>/i, (m) => `${m}\n  ${titleTag}`)
      else out = `<head>\n  ${titleTag}\n</head>\n${out}`
      applied.push('missing_title')
    }
    if (enabledTypes.has('missing_description') && !/<meta[^>]+name=["']description["']/i.test(out)) {
      const descTag = '<meta name="description" content="Restored by AlphaTekX Restore Engine">'
      if (/<head[^>]*>/i.test(out)) out = out.replace(/<head([^>]*)>/i, (m) => `${m}\n  ${descTag}`)
      else out = `<head>\n  ${descTag}\n</head>\n${out}`
      applied.push('missing_description')
    }

    out = sanitizeEncoding(out)
    return { html: out, applied }
  }

  function writeSessionFiles(session, reportExtra = {}) {
    const workDir = session.workDir
    const restoredPath = path.join(workDir, 'restored', 'index.html')
    const backupPath = path.join(workDir, 'rollback', 'original.html')
    const reportPath = path.join(workDir, 'report.json')

    FileHandler.writeFile(restoredPath, session.restoredHtml)
    FileHandler.writeFile(backupPath, session.originalHtml)
    FileHandler.writeFile(reportPath, JSON.stringify({
      sessionId: session.id,
      url: session.url,
      generatedAt: new Date().toISOString(),
      beforeScore: session.beforeScore,
      afterScore: session.afterScore,
      findings: session.findings,
      appliedFixes: session.appliedFixList,
      ...reportExtra,
    }, null, 2))

    session.restoredPath = restoredPath
    session.backupPath = backupPath
    session.reportPath = reportPath
    session.filesModified = 1
    return { restoredPath, backupPath, reportPath }
  }

  function getGhToken(req, bodyToken) {
    if (bodyToken) return String(bodyToken)
    const cookieHeader = String(req.headers.cookie || '')
    for (const part of cookieHeader.split(';')) {
      const idx = part.indexOf('=')
      if (idx === -1) continue
      const key = part.slice(0, idx).trim()
      if (key === 'gh_token') return decodeURIComponent(part.slice(idx + 1).trim())
    }
    return null
  }

  async function ghApi(endpoint, token, opts = {}) {
    const response = await fetch(`https://api.github.com${endpoint}`, {
      method: opts.method || 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'alphatekx-restore-engine',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(20_000),
    })
    const data = await response.json().catch(() => ({}))
    return { status: response.status, ok: response.ok, data }
  }

  async function createGitHubPullRequest(token, repoFullName, html, sourceUrl) {
    const safeRepo = String(repoFullName || '').replace(/^\/+|\/+$/g, '')
    if (!/^[\w.-]+\/[\w.-]+$/.test(safeRepo)) throw Object.assign(new Error('Repository must look like owner/repo.'), { actionRequired: 'invalid_repo' })

    const repoInfo = await ghApi(`/repos/${safeRepo}`, token)
    if (!repoInfo.ok) throw Object.assign(new Error(repoInfo.status === 404 ? `Repository ${safeRepo} not found (or token lacks access).` : `GitHub API error (${repoInfo.status}).`), { actionRequired: repoInfo.status === 404 ? 'check_repo' : 'retry_github' })
    const defaultBranch = repoInfo.data.default_branch || 'main'

    const refInfo = await ghApi(`/repos/${safeRepo}/git/ref/heads/${encodeURIComponent(defaultBranch)}`, token)
    if (!refInfo.ok) throw Object.assign(new Error(`Could not read base branch ${defaultBranch}.`), { actionRequired: 'retry_github' })
    const baseSha = refInfo.data?.object?.sha
    if (!baseSha) throw Object.assign(new Error('Base branch SHA missing.'), { actionRequired: 'retry_github' })

    const branch = `alphatekx-fix-${Date.now()}`
    const createRef = await ghApi(`/repos/${safeRepo}/git/refs`, token, { method: 'POST', body: { ref: `refs/heads/${branch}`, sha: baseSha } })
    if (!createRef.ok) throw Object.assign(new Error(createRef.data?.message || 'Could not create fix branch.'), { actionRequired: 'retry_github' })

    const existing = await ghApi(`/repos/${safeRepo}/contents/index.html?ref=${encodeURIComponent(branch)}`, token)
    const putBody = {
      message: `AlphaTekX Restore Engine: apply UTF-8-safe fixes\n\nSource: ${sourceUrl}`,
      content: Buffer.from(html, 'utf8').toString('base64'),
      branch,
    }
    if (existing.status === 200 && existing.data?.sha) putBody.sha = existing.data.sha
    const put = await ghApi(`/repos/${safeRepo}/contents/index.html`, token, { method: 'PUT', body: putBody })
    if (!put.ok) throw Object.assign(new Error(put.data?.message || 'Could not commit fixed index.html.'), { actionRequired: 'retry_github' })

    const pr = await ghApi(`/repos/${safeRepo}/pulls`, token, {
      method: 'POST',
      body: {
        title: 'AlphaTekX: UTF-8-safe restoration fixes',
        head: branch,
        base: defaultBranch,
        body: `Automated restoration fixes generated by the AlphaTekX Restore Engine.\n\n- Source scanned: ${sourceUrl}\n- Encoding enforced as clean UTF-8 (BOM/null-byte free, no CJK mojibake)\n- Review and merge to apply.`,
      },
    })
    if (!pr.ok) throw Object.assign(new Error(pr.data?.message || 'Could not open pull request.'), { actionRequired: 'retry_github' })

    return { prUrl: pr.data.html_url, prNumber: pr.data.number, branch, baseBranch: defaultBranch, repo: safeRepo }
  }

  function requireState(session, allowed, actionRequired) {
    if (!allowed.includes(session.state)) {
      throw Object.assign(new Error(`Action not available in current state (${session.state}).`), { status: 409, actionRequired })
    }
  }

  async function handleScan(req, res, body) {
    const session = getSession(body.sessionId)
    if (!session) return errorResponse(res, 404, 'Session not found. Create a session first.', 'new_session')
    requireState(session, ['IDLE', 'SCAN_COMPLETE'], 'restart_flow')
    const url = normalizeTargetUrl(body.url)
    if (!url) return errorResponse(res, 400, 'Enter a valid http(s) URL.', 'enter_url')

    session.state = 'SCANNING'
    session.url = url
    touch(session)

    let page
    try {
      page = await fetchPage(url)
    } catch (err) {
      session.state = 'IDLE'
      touch(session)
      log(`[engine] scan fetch failed for ${url}: ${err.message}`)
      return errorResponse(res, 502, `Could not reach ${url} (${err.message}).`, 'check_url')
    }
    if (!page.html || !page.html.trim()) {
      session.state = 'IDLE'
      touch(session)
      return errorResponse(res, 502, 'Target returned an empty page.', 'check_url')
    }

    session.originalHtml = page.html
    session.finalUrl = page.finalUrl
    session.findings = detectIssues(session.originalHtml)
    session.beforeScore = scoreFor(session.findings)
    session.fixes = []
    session.enabledFixes = []
    session.restoredHtml = ''
    session.appliedFixes = 0
    session.appliedFixList = []
    session.filesModified = 0
    session.afterScore = null
    session.option = null
    session.actionCompleted = false
    session.deliveryResult = null
    session.verifyResult = null
    session.state = 'SCAN_COMPLETE'
    touch(session)

    return json(res, 200, successResponse(session, `Scan complete: ${session.findings.length} issue${session.findings.length === 1 ? '' : 's'} found.`, [
      { id: 'generate_fixes', label: 'Generate Fixes', endpoint: 'POST /api/engine/fix' },
    ]))
  }

  function handleScanStatus(req, res, urlObj) {
    const session = getSession(urlObj.searchParams.get('sessionId'))
    if (!session) return errorResponse(res, 404, 'Session not found.', 'new_session')
    return json(res, 200, {
      step: session.state.toLowerCase(),
      status: 'success',
      state: session.state,
      url: session.url,
      scanning: session.state === 'SCANNING',
      summary: buildSummary(session),
      message: session.state === 'SCANNING' ? 'Scan in progress...' : `State: ${session.state}`,
      actions: [],
    })
  }

  function handleFix(req, res, body) {
    const session = getSession(body.sessionId)
    if (!session) return errorResponse(res, 404, 'Session not found.', 'new_session')
    requireState(session, ['SCAN_COMPLETE'], 'run_scan_first')
    if (!session.findings.length) return errorResponse(res, 409, 'No issues were found, so there is nothing to fix.', 'skip_to_delivery')

    session.state = 'GENERATING_FIXES'
    touch(session)
    session.fixes = generateFixes(session)
    session.enabledFixes = session.fixes.map((f) => f.findingId)
    session.state = 'FIXES_READY'
    touch(session)

    return json(res, 200, successResponse(session, `${session.fixes.length} fix${session.fixes.length === 1 ? '' : 'es'} generated. Review and approve.`, [
      { id: 'approve', label: 'Approve & Apply Fixes', endpoint: 'POST /api/engine/approve' },
    ]))
  }

  function handleApprove(req, res, body) {
    const session = getSession(body.sessionId)
    if (!session) return errorResponse(res, 404, 'Session not found.', 'new_session')
    requireState(session, ['FIXES_READY'], 'generate_fixes_first')
    if (body.approved !== true) return errorResponse(res, 400, 'Fixes must be explicitly approved (approved: true).', 'approve_fixes')

    const disabled = new Set(Array.isArray(body.disabled) ? body.disabled : [])
    const enabledIds = session.fixes.map((f) => f.findingId).filter((id) => !disabled.has(id))
    const enabledTypes = new Set(session.fixes.filter((f) => enabledIds.includes(f.findingId)).map((f) => f.type))

    session.state = 'APPLYING_FIXES'
    touch(session)

    const { html: fixedHtml, applied } = applyFixesToHtml(session.originalHtml, enabledTypes)
    const validation = validateHtml(fixedHtml)
    if (!validation.valid) {
      session.state = 'FIXES_READY'
      touch(session)
      return errorResponse(res, 500, `UTF-8 validation failed after applying fixes: ${validation.reason}`, 'retry_apply')
    }
    if (!FileHandler.isEnglish(fixedHtml)) {
      session.state = 'FIXES_READY'
      touch(session)
      return errorResponse(res, 500, 'Fixed HTML contains corrupted non-English characters. Aborting write.', 'retry_apply')
    }

    session.restoredHtml = fixedHtml
    session.appliedFixList = applied
    session.appliedFixes = enabledIds.length
    session.enabledFixes = enabledIds

    try {
      writeSessionFiles(session)
    } catch (err) {
      session.state = 'FIXES_READY'
      touch(session)
      return errorResponse(res, 500, `Could not write restored files: ${err.message}`, 'retry_apply')
    }

    session.state = 'RESTORATION_COMPLETE'
    touch(session)
    log(`[engine] session ${session.id}: applied ${applied.length} fix categories, score ${session.beforeScore}`)

    return json(res, 200, successResponse(session, `Restoration complete. ${enabledIds.length} fix${enabledIds.length === 1 ? '' : 'es'} applied with UTF-8 enforcement.`, [
      { id: 'github', label: 'Create GitHub Pull Request' },
      { id: 'download', label: 'Download ZIP' },
      { id: 'code', label: 'Copy Fixed Code' },
      { id: 'deploy', label: 'Deploy Live' },
    ]))
  }

  function handleDelivery(req, res, body) {
    const session = getSession(body.sessionId)
    if (!session) return errorResponse(res, 404, 'Session not found.', 'new_session')
    requireState(session, ['RESTORATION_COMPLETE', 'OPTION_SELECTED'], 'apply_fixes_first')
    const option = String(body.option || '').toLowerCase()
    if (!['github', 'download', 'code', 'deploy'].includes(option)) {
      return errorResponse(res, 400, 'option must be one of github | download | code | deploy.', 'choose_option')
    }
    session.option = option
    session.actionCompleted = false
    session.deliveryResult = null
    session.state = 'OPTION_SELECTED'
    touch(session)
    return json(res, 200, successResponse(session, `Delivery option selected: ${option}. Complete the action to continue.`, []))
  }

  function handleActionComplete(req, res, body) {
    const session = getSession(body.sessionId)
    if (!session) return errorResponse(res, 404, 'Session not found.', 'new_session')
    requireState(session, ['OPTION_SELECTED'], 'choose_option')
    if (session.option !== 'code') return errorResponse(res, 409, 'Manual completion is only used for the copy-code option.', 'choose_option')
    session.actionCompleted = true
    session.deliveryResult = { copied: true }
    touch(session)
    return json(res, 200, successResponse(session, 'Fixed code copied. You can continue to verification.', []))
  }

  async function handleGithub(req, res, body) {
    const session = getSession(body.sessionId)
    if (!session) return errorResponse(res, 404, 'Session not found.', 'new_session')
    requireState(session, ['OPTION_SELECTED'], 'choose_option')
    if (session.option !== 'github') return errorResponse(res, 409, 'Selected option is not github.', 'choose_option')
    const token = getGhToken(req, body.token)
    if (!token) return errorResponse(res, 401, 'No GitHub token. Connect GitHub first or pass token in the request body.', 'connect_github')
    if (!body.repo) return errorResponse(res, 400, 'Repository is required (owner/repo).', 'select_repo')

    try {
      const result = await createGitHubPullRequest(token, body.repo, session.restoredHtml, session.url)
      session.deliveryResult = result
      session.actionCompleted = true
      touch(session)
      return json(res, 200, successResponse(session, `Pull request #${result.prNumber} created on ${result.repo}.`, [
        { id: 'open_pr', label: 'Open Pull Request', url: result.prUrl },
      ]))
    } catch (err) {
      return errorResponse(res, err.status || 502, err.message, err.actionRequired || 'retry_github')
    }
  }

  function handleDownload(req, res, urlObj) {
    const session = getSession(urlObj.searchParams.get('sessionId'))
    if (!session) return errorResponse(res, 404, 'Session not found.', 'new_session')
    if (!['OPTION_SELECTED'].includes(session.state) || !session.restoredPath) {
      return errorResponse(res, 409, 'Apply fixes before downloading.', 'apply_fixes_first')
    }
    if (session.option !== 'download') return errorResponse(res, 409, 'Selected option is not download.', 'choose_option')

    const zipPath = path.join(session.workDir, 'restored.zip')
    createMinimalZip(zipPath, [
      { name: 'index.html', data: session.restoredHtml },
      { name: 'README.txt', data: `AlphaTekX Restore Engine\nSource: ${session.url}\nGenerated: ${new Date().toISOString()}\nBefore score: ${session.beforeScore}\nExtract and upload index.html to your hosting provider.\n` },
    ])
    session.deliveryResult = { zipPath }
    session.actionCompleted = true
    touch(session)

    const zipBuffer = fs.readFileSync(zipPath)
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Length': zipBuffer.length,
      'Content-Disposition': `attachment; filename="restored-${session.id}.zip"`,
      'Cache-Control': 'no-store',
    })
    res.end(zipBuffer)
    return true
  }

  function handleCode(req, res, urlObj) {
    const session = getSession(urlObj.searchParams.get('sessionId'))
    if (!session) return errorResponse(res, 404, 'Session not found.', 'new_session')
    if (!session.restoredHtml) return errorResponse(res, 409, 'Apply fixes first.', 'apply_fixes_first')
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(session.restoredHtml)
    return true
  }

  async function handleDeploy(req, res, body) {
    const session = getSession(body.sessionId)
    if (!session) return errorResponse(res, 404, 'Session not found.', 'new_session')
    requireState(session, ['OPTION_SELECTED'], 'choose_option')
    if (session.option !== 'deploy') return errorResponse(res, 409, 'Selected option is not deploy.', 'choose_option')
    if (typeof deps.publishPasted !== 'function') return errorResponse(res, 500, 'Deploy backend unavailable.', 'contact_support')

    const user = typeof deps.requireUser === 'function' ? await deps.requireUser(req) : null
    if (!user) return errorResponse(res, 401, 'Sign in to deploy.', 'sign_in')

    const result = await deps.publishPasted({ name: String(body.name || ''), title: String(body.title || ''), html: session.restoredHtml })
    if (!result || result.status !== 200) {
      const message = result?.body?.error || 'Deploy failed.'
      const taken = result?.status === 409
      return errorResponse(res, result?.status || 500, message, taken ? 'choose_name' : 'retry_deploy')
    }

    session.deliveryResult = { deployUrl: result.body.url, name: result.body.slug || body.name }
    session.actionCompleted = true
    touch(session)
    return json(res, 200, successResponse(session, `Site deployed at ${result.body.url}`, [
      { id: 'open_site', label: 'Open Live Site', url: result.body.url },
    ]))
  }

  async function handleVerify(req, res, body) {
    const session = getSession(body.sessionId)
    if (!session) return errorResponse(res, 404, 'Session not found.', 'new_session')
    requireState(session, ['OPTION_SELECTED'], 'choose_option')
    if (!session.actionCompleted) {
      return errorResponse(res, 409, 'Complete your chosen delivery action before verifying.', 'complete_action')
    }

    session.state = 'VERIFYING'
    touch(session)

    const verifyTarget = session.deliveryResult?.deployUrl || session.url
    let liveStatus = null
    let degraded = false
    if (session.deliveryResult?.deployUrl) {
      try {
        const page = await fetchPage(verifyTarget)
        liveStatus = page.status
      } catch (err) {
        degraded = true
        log(`[engine] verify could not reach ${verifyTarget}: ${err.message}`)
      }
    }

    const remainingFindings = detectIssues(session.restoredHtml)
    session.afterScore = scoreFor(remainingFindings)
    session.verifyResult = {
      target: verifyTarget,
      liveStatus,
      degraded,
      remainingIssues: remainingFindings.length,
      remaining: remainingFindings,
      utf8Clean: FileHandler.isEnglish(session.restoredHtml) && validateHtml(session.restoredHtml).valid,
    }
    session.state = 'DONE'
    touch(session)

    return json(res, 200, successResponse(session, degraded
      ? `Verification complete: restored code has ${remainingFindings.length} remaining issue${remainingFindings.length === 1 ? '' : 's'} (live site unreachable, verified delivered artifact).`
      : `Verification complete: restored code scores ${session.afterScore}/100 with ${remainingFindings.length} remaining issue${remainingFindings.length === 1 ? '' : 's'}.`))
  }

  function handleVerifyStatus(req, res, urlObj) {
    const session = getSession(urlObj.searchParams.get('sessionId'))
    if (!session) return errorResponse(res, 404, 'Session not found.', 'new_session')
    return json(res, 200, {
      step: session.state.toLowerCase(),
      status: 'success',
      state: session.state,
      verifying: session.state === 'VERIFYING',
      summary: buildSummary(session),
      verifyResult: session.verifyResult,
      message: session.state === 'VERIFYING' ? 'Re-scanning target...' : `State: ${session.state}`,
      actions: [],
    })
  }

  function handleState(req, res, urlObj) {
    const session = getSession(urlObj.searchParams.get('sessionId'))
    if (!session) return errorResponse(res, 404, 'Session not found.', 'new_session')
    return json(res, 200, {
      step: session.state.toLowerCase(),
      status: 'success',
      state: session.state,
      sessionId: session.id,
      url: session.url,
      findings: session.findings,
      fixes: session.fixes,
      enabledFixes: session.enabledFixes,
      option: session.option,
      actionCompleted: session.actionCompleted,
      deliveryResult: session.deliveryResult,
      verifyResult: session.verifyResult,
      summary: buildSummary(session),
      message: `State: ${session.state}`,
      actions: [],
    })
  }

  return async function engineRoute(req, res) {
    if (!String(req.url || '').startsWith('/api/engine/')) return false
    pruneSessions()

    const urlObj = new URL(req.url, 'http://localhost')
    const route = urlObj.pathname

    try {
      if (req.method === 'POST' && route === '/api/engine/session') {
        const id = randomUUID()
        const session = {
          id,
          state: 'IDLE',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          url: '',
          originalHtml: '',
          findings: [],
          beforeScore: null,
          fixes: [],
          enabledFixes: [],
          restoredHtml: '',
          appliedFixes: 0,
          appliedFixList: [],
          filesModified: 0,
          afterScore: null,
          workDir: path.join(os.tmpdir(), `restore-engine-${id}`),
          option: null,
          actionCompleted: false,
          deliveryResult: null,
          verifyResult: null,
        }
        sessions.set(id, session)
        json(res, 200, { step: 'idle', status: 'success', state: 'IDLE', sessionId: id, message: 'Session created.', actions: [], summary: { issues_found: 0, issues_fixed: 0, files_modified: 0, before_score: null, after_score: null } })
        return true
      }

      if (req.method === 'GET' && route === '/api/engine/state') { await handleState(req, res, urlObj); return true }
      if (req.method === 'POST' && route === '/api/engine/scan') { await handleScan(req, res, await readBody(req)); return true }
      if (req.method === 'GET' && route === '/api/engine/scan/status') { await handleScanStatus(req, res, urlObj); return true }
      if (req.method === 'POST' && route === '/api/engine/fix') { await handleFix(req, res, await readBody(req)); return true }
      if (req.method === 'POST' && route === '/api/engine/approve') { await handleApprove(req, res, await readBody(req)); return true }
      if (req.method === 'POST' && route === '/api/engine/delivery') { await handleDelivery(req, res, await readBody(req)); return true }
      if (req.method === 'POST' && route === '/api/engine/action-complete') { await handleActionComplete(req, res, await readBody(req)); return true }
      if (req.method === 'POST' && route === '/api/engine/github') { await handleGithub(req, res, await readBody(req)); return true }
      if (req.method === 'GET' && route === '/api/engine/download') return handleDownload(req, res, urlObj)
      if (req.method === 'GET' && route === '/api/engine/code') return handleCode(req, res, urlObj)
      if (req.method === 'POST' && route === '/api/engine/deploy') { await handleDeploy(req, res, await readBody(req)); return true }
      if (req.method === 'POST' && route === '/api/engine/verify') { await handleVerify(req, res, await readBody(req)); return true }
      if (req.method === 'GET' && route === '/api/engine/verify/status') { await handleVerifyStatus(req, res, urlObj); return true }

      errorResponse(res, 404, `Unknown engine route: ${req.method} ${route}`, 'check_endpoint')
      return true
    } catch (err) {
      log(`[engine] error on ${req.method} ${route}: ${err.message}`)
      errorResponse(res, err.status || 500, err.message || 'Engine failure.', err.actionRequired || 'retry')
      return true
    }
  }
}
