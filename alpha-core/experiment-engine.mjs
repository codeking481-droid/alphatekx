/**
 * EXPERIMENT ENGINE — Sandbox Fix + Build Verification
 *
 * Copies a repo to /tmp/github-{id}-experiment, applies a hypothesis fix,
 * runs npm install + build to verify. If build passes, marks as WINNER.
 */

import fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * Run an experiment: copy repo, apply fix, test build.
 * @param {string} repoPath - original cloned repo path
 * @param {object} hypothesis - { id, title, fix: { files: {path,content}[], description } }
 * @param {object} opts - { restorationId, sendEvent }
 * @returns {{ passed: boolean, experimentPath: string, buildOutput: string, durationMs: number }}
 */
export async function runExperiment(repoPath, hypothesis, opts = {}) {
  const { restorationId = 'unknown', sendEvent = () => {} } = opts
  const experimentId = `${restorationId}-experiment`
  const experimentPath = path.join(tmpdir(), `github-${experimentId}`)
  const startMs = Date.now()

  sendEvent({ type: 'thought_step', step: { id: 'experiment', label: 'Setting up experiment sandbox...', icon: 'test', status: 'active' } })

  // Step 1: Clean + copy repo
  try {
    if (fs.existsSync(experimentPath)) {
      fs.rmSync(experimentPath, { recursive: true, force: true })
    }
    fs.mkdirSync(experimentPath, { recursive: true })
    copyDirSync(repoPath, experimentPath, ['node_modules', '.git', 'dist', 'build', '.next'])
    sendEvent({ type: 'thought_step', step: { id: 'experiment-copy', label: 'Sandbox created', icon: 'test', status: 'done', summary: `Copied to ${experimentId}` } })
  } catch (err) {
    sendEvent({ type: 'thought_step', step: { id: 'experiment-copy', label: 'Sandbox copy failed', icon: 'test', status: 'error', summary: err.message } })
    return { passed: false, experimentPath, buildOutput: err.message, durationMs: Date.now() - startMs }
  }

  // Step 2: Apply fix files
  sendEvent({ type: 'thought_step', step: { id: 'experiment-apply', label: 'Applying hypothesis fix...', icon: 'plan', status: 'active' } })
  const fixFiles = hypothesis.fix?.files || []
  let appliedCount = 0
  for (const file of fixFiles) {
    try {
      const filePath = path.join(experimentPath, file.path)
      const dir = path.dirname(filePath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(filePath, file.content, 'utf8')
      appliedCount++
    } catch (err) {
      sendEvent({ type: 'thought_step', step: { id: `experiment-file-${appliedCount}`, label: `Failed: ${file.path}`, icon: 'plan', status: 'error', summary: err.message?.slice(0, 100) } })
    }
  }
  sendEvent({ type: 'thought_step', step: { id: 'experiment-apply', label: 'Fix applied', icon: 'plan', status: 'done', summary: `${appliedCount}/${fixFiles.length} files modified` } })

  // Step 3: npm install
  sendEvent({ type: 'thought_step', step: { id: 'experiment-install', label: 'Installing deps in sandbox...', icon: 'plan', status: 'active' } })
  let installOk = false
  try {
    await execFileAsync('npm', ['install', '--prefer-offline', '--no-audit', '--no-fund'], {
      cwd: experimentPath, timeout: 120_000, encoding: 'utf8', windowsHide: true,
    })
    installOk = true
    sendEvent({ type: 'thought_step', step: { id: 'experiment-install', label: 'Sandbox deps installed', icon: 'plan', status: 'done' } })
  } catch (err) {
    sendEvent({ type: 'thought_step', step: { id: 'experiment-install', label: 'Sandbox install failed', icon: 'plan', status: 'error', summary: err.message?.slice(0, 200) } })
  }

  // Step 4: npm run build
  sendEvent({ type: 'thought_step', step: { id: 'experiment-build', label: 'Building in sandbox...', icon: 'test', status: 'active' } })
  let buildOk = false
  let buildOutput = ''
  if (installOk) {
    try {
      const result = await execFileAsync('npm', ['run', 'build'], {
        cwd: experimentPath, timeout: 120_000, encoding: 'utf8', windowsHide: true,
        env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=1024' },
      })
      buildOk = true
      buildOutput = result.stdout?.slice(0, 2000) || 'Build OK'
      sendEvent({ type: 'thought_step', step: { id: 'experiment-build', label: 'Sandbox build PASSED', icon: 'test', status: 'done', summary: `${hypothesis.title || 'Fix'} verified` } })
    } catch (err) {
      buildOutput = ((err.stdout || '') + '\n' + (err.stderr || '')).slice(0, 2000)
      sendEvent({ type: 'thought_step', step: { id: 'experiment-build', label: 'Sandbox build FAILED', icon: 'test', status: 'error', summary: err.message?.slice(0, 200) } })
    }
  } else {
    buildOutput = 'Skipped: npm install failed'
  }

  const passed = buildOk
  const durationMs = Date.now() - startMs

  if (passed) {
    sendEvent({ type: 'thought_step', step: { id: 'experiment-result', label: 'EXPERIMENT PASSED', icon: 'test', status: 'done', summary: `"${hypothesis.title}" — build verified`, details: [`Fix: ${appliedCount} files`, `Duration: ${(durationMs / 1000).toFixed(1)}s`] } })
  } else {
    sendEvent({ type: 'thought_step', step: { id: 'experiment-result', label: 'EXPERIMENT FAILED', icon: 'test', status: 'error', summary: `"${hypothesis.title}" — build failed`, details: [buildOutput.slice(0, 300)] } })
  }

  return { passed, experimentPath, buildOutput: buildOutput.slice(0, 2000), durationMs }
}

/**
 * Deep analysis: run npm install && npm run build on the original repo to capture errors.
 */
export async function deepBuildAnalysis(repoPath, sendEvent = () => {}) {
  sendEvent({ type: 'thought_step', step: { id: 'deep-build', label: 'Deep build analysis...', icon: 'test', status: 'active' } })

  let buildOutput = ''
  let installOutput = ''

  try {
    const install = await execFileAsync('npm', ['install', '--prefer-offline', '--no-audit', '--no-fund'], {
      cwd: repoPath, timeout: 120_000, encoding: 'utf8', windowsHide: true,
    })
    installOutput = (install.stdout || '').slice(0, 1000)
  } catch (err) {
    installOutput = ((err.stdout || '') + '\n' + (err.stderr || '')).slice(0, 1000)
    sendEvent({ type: 'thought_step', step: { id: 'deep-install', label: 'npm install errors', icon: 'plan', status: 'error', summary: installOutput.slice(0, 200) } })
    return { buildOk: false, installOutput, buildOutput: '', errors: parseBuildErrors(installOutput) }
  }

  try {
    await execFileAsync('npm', ['run', 'build'], {
      cwd: repoPath, timeout: 120_000, encoding: 'utf8', windowsHide: true,
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=1024' },
    })
    buildOutput = 'Build passed'
    sendEvent({ type: 'thought_step', step: { id: 'deep-build', label: 'Build passed', icon: 'test', status: 'done', summary: 'No errors' } })
    return { buildOk: true, installOutput, buildOutput, errors: [] }
  } catch (err) {
    buildOutput = ((err.stdout || '') + '\n' + (err.stderr || '')).slice(0, 3000)
    const errors = parseBuildErrors(buildOutput)
    sendEvent({ type: 'thought_step', step: { id: 'deep-build', label: `Build failed: ${errors.length} errors`, icon: 'test', status: 'error', summary: errors.slice(0, 3).map(e => e.message).join(' | ') } })
    return { buildOk: false, installOutput, buildOutput, errors }
  }
}

function parseBuildErrors(output) {
  const errors = []
  // Common build error patterns
  const patterns = [
    /ERROR\s+(?:in\s+)?(.+?):(\d+):\d+\s*\n\s*(.+)/gm,       // Vite/Webpack
    /Error:\s+(.+)/gm,                                           // Generic
    /Cannot find module\s+'([^']+)'/gm,                          // Missing module
    /Module not found:\s+(.+)/gm,                                 // Webpack missing
    /Property\s+'(\w+)'\s+does not exist/gm,                     // TS errors
    /Type\s+'([^']+)'\s+is not assignable/gm,                    // TS type errors
  ]

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(output)) !== null) {
      errors.push({
        file: match[1] || '',
        line: match[2] ? parseInt(match[2]) : 0,
        message: match[3] || match[1] || match[0],
        raw: match[0].slice(0, 300),
      })
    }
  }

  return errors.slice(0, 50)
}

function copyDirSync(src, dest, ignoreDirs = []) {
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    if (ignoreDirs.includes(entry.name)) continue
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true })
      copyDirSync(srcPath, destPath, ignoreDirs)
    } else {
      try { fs.copyFileSync(srcPath, destPath) } catch {}
    }
  }
}
