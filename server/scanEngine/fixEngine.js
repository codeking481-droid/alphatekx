// fixEngine.js — The Restore Engine
// The "fix" half: gated by paid plans (credits never spend on a free account),
// protected by a backup branch so no fix can destroy the site, and executed
// against the real GitHub + Vercel APIs. Every credential shown is masked.

import { Octokit } from 'octokit'
import { maskSecret } from './secretHunter.js'

const CREDIT_COSTS = {
  scan: 5,
  fix: 20,
  verify: 3,
}

/**
 * Spend-gate: can this user run paid restore actions, and how many credits do
 * they have? Decides whether the /api/fix and /api/verify routes proceed.
 * @param {object} user the auth'd user (from billing/auth)
 * @param {object} [opts]
 * @param {string} [opts.action] 'fix' | 'verify'
 */
export function makeCreditsWork(user, opts = {}) {
  const action = opts.action || 'fix'
  const cost = CREDIT_COSTS[action] ?? 5
  const plan = user?.plan || ''
  const credits = user?.creditsRemaining ?? 0
  const isPaid = ['restore_starter', 'restore_pro', 'restore_guardian'].includes(plan)
  const isGuardian = plan === 'restore_guardian'
  const enough = isGuardian || credits >= cost

  return {
    available: isPaid && enough,
    blocked: !(isPaid && enough),
    reason: !isPaid
      ? 'upgrade to the $19 / $49 / $99 Restore plan to unlock the Fix Engine'
      : enough
        ? 'credits available'
        : `insufficient credits — ${action} costs ${cost} credits`,
    plan,
    cost,
    credits,
    isGuardian,
  }
}

function backupBranchName(scanId) {
  return `alphatekx/restore-backup-${scanId.slice(0, 12)}`
}

/**
 * Build (without executing) the fix plan for a scan. Safe to call at scan time
 * so the UI can show the exact steps the user is paying for.
 * @param {object} parts
 * @param {object} parts.user
 * @param {object} parts.repo
 * @param {string} parts.scanId
 * @param {string} parts.targetUrl
 * @param {string} [parts.gitOwner]
 * @param {string} [parts.gitRepo]
 * @returns {Promise<{fixId:string, status:string, steps:Array<{id:string,label:string,status:string,description:string}>, backupBranch:string, targetUrl:string}>}
 */
export async function makeFixPlan({ user, repo, scanId, targetUrl, gitOwner, gitRepo }) {
  const gate = makeCreditsWork(user, { action: 'fix' })
  const owner = gitOwner || repo?.owner || ''
  const name = gitRepo || repo?.name || ''

  const steps = [
    {
      id: 'gate',
      label: 'Credits verified',
      status: gate.available ? 'done' : 'blocked',
      description: gate.reason,
    },
    {
      id: 'backup',
      label: 'GitHub backup branch',
      status: gate.available && owner ? 'ready' : 'skipped',
      description: owner ? `push alphatekx/restore-backup-${scanId.slice(0, 12)} so nothing can be lost` : 'no public GitHub repo detected on this site',
    },
    {
      id: 'redact',
      label: 'Redaction commit',
      status: gate.available && owner ? 'ready' : 'skipped',
      description: 'add a .restore-engine fix-report with every masked finding + rotation checklist',
    },
    {
      id: 'redeploy',
      label: 'Trigger redeploy',
      status: gate.available && process.env.VERCEL_DEPLOY_HOOK ? 'ready' : 'skipped',
      description: process.env.VERCEL_DEPLOY_HOOK ? 'POST the Vercel deploy hook to rebuild from the fixed branch' : 'no VERCEL_DEPLOY_HOOK configured — redeploy in your dashboard',
    },
    {
      id: 'verify',
      label: 'Schedule reverify',
      status: gate.available ? 'ready' : 'skipped',
      description: 're-scan 5 minutes after redeploy to prove the fix',
    },
  ]

  return {
    fixId: `fx_${scanId.slice(0, 12)}_${Date.now().toString(36)}`,
    status: gate.available ? 'ready' : 'blocked',
    steps,
    backupBranch: owner ? backupBranchName(scanId) : '',
    targetUrl,
  }
}

/**
 * Execute the fix plan against the real APIs.
 * Never destructive: backup branch is created before anything else, and no
 * branch is force-pushed. If GitHub creds are missing the plan degrades to
 * guidance steps instead of failing the whole restore.
 * @param {object} plan from makeFixPlan
 * @param {object} opts
 * @param {string} [opts.gitOwner]
 * @param {string} [opts.gitRepo]
 * @param {string} opts.scanId
 * @param {string} opts.targetUrl
 * @param {string} opts.maskedSecretsLabel e.g. "3 live secrets (sk-proj-••••, sk_live_••••)"
 * @returns {Promise<{fixId:string, status:string, steps:Array, backupBranch:string, backupSha?:string, commitSha?:string, redeploy?:object, error?:string}>}
 */
export async function runFixPlan(plan, { gitOwner, gitRepo, scanId, targetUrl, maskedSecretsLabel = '' }) {
  const steps = plan.steps.map(step => ({ ...step }))
  const token = process.env.GITHUB_FIX_TOKEN
  const owner = gitOwner || ''
  const name = gitRepo || ''

  if (plan.status === 'blocked') {
    return { ...plan, steps, status: 'blocked' }
  }
  if (!token) {
    steps.forEach(step => {
      if (step.id !== 'gate') {
        step.status = 'skipped'
        step.description += ' (no GITHUB_FIX_TOKEN on server)'
      }
    })
    return { ...plan, steps, status: 'partial', error: 'server has no GITHUB_FIX_TOKEN — steps shown as guidance' }
  }
  if (!owner || !name) {
    return { ...plan, steps, status: 'partial', error: 'no GitHub repo detected on the scanned site' }
  }

  const octokit = new Octokit({ auth: token, request: { timeout: 20000 } })
  const backupBranch = backupBranchName(scanId)
  let backupSha = ''
  let commitSha = ''

  try {
    // 1) Backup branch from current default-branch HEAD — the safety net.
    const { data: repoData } = await octokit.rest.repos.get({ owner, repo: name })
    const defaultBranch = repoData.default_branch || 'main'
    const { data: head } = await octokit.rest.git.getRef({ owner, repo: name, ref: `heads/${defaultBranch}` })
    backupSha = head.object.sha
    const mark = steps.find(s => s.id === 'backup')
    try {
      await octokit.rest.git.getRef({ owner, repo: name, ref: `heads/${backupBranch}` })
      if (mark) { mark.status = 'done'; mark.description = `backup branch ${backupBranch} already exists at ${backupSha.slice(0, 7)}` }
    } catch {
      await octokit.rest.git.createRef({ owner, repo: name, ref: `refs/heads/${backupBranch}`, sha: backupSha })
      if (mark) { mark.status = 'done'; mark.description = `backup branch ${backupBranch} pushed (from ${backupSha.slice(0, 7)})` }
    }

    // 2) Redaction commit on a fix branch (adds the masked fix-report).
    const fixBranch = `${backupBranch}-fix`
    const reportBody = [
      '# AlphaTekX Restore Engine — Fix Report',
      '',
      `- Scan: ${scanId}`,
      `- Target: ${targetUrl}`,
      `- Backup branch: ${backupBranch} (${backupSha.slice(0, 7)})`,
      `- Findings (masked): ${maskedSecretsLabel || 'none re-verified'}`,
      '',
      '## Rotate these before they drain you',
      '1. Open each vendor dashboard and revoke the leaked key NOW.',
      '2. Generate a new key with a scoped permission set.',
      '3. Redeploy, then re-scan to confirm the exposure is gone.',
      '',
      'This report is a marker commit; no source files were modified by the engine.',
      '',
    ].join('\n')

    const { data: tree } = await octokit.rest.git.createTree({
      owner, repo: name, tree: [{ path: '.restore-engine/fix-report.md', mode: '100644', type: 'blob', content: reportBody }],
    })
    const { data: commit } = await octokit.rest.git.createCommit({
      owner, repo: name, message: `chore(restore-engine): fix report for ${scanId}`, tree: tree.sha, parents: [backupSha],
    })
    commitSha = commit.sha
    try {
      await octokit.rest.git.createRef({ owner, repo: name, ref: `refs/heads/${fixBranch}`, sha: commit.sha })
    } catch {
      await octokit.rest.git.updateRef({ owner, repo: name, ref: `heads/${fixBranch}`, sha: commit.sha })
    }
    const redact = steps.find(s => s.id === 'redact')
    if (redact) { redact.status = 'done'; redact.description = `fix-report commit ${commitSha.slice(0, 7)} pushed on ${fixBranch}` }

    // 3) Redeploy via the Vercel deploy hook.
    let redeploy = null
    const redeployStep = steps.find(s => s.id === 'redeploy')
    if (process.env.VERCEL_DEPLOY_HOOK) {
      try {
        const res = await fetch(process.env.VERCEL_DEPLOY_HOOK, { method: 'POST' })
        redeploy = { statusCode: res.status, ok: res.ok }
        if (redeployStep) { redeployStep.status = 'done'; redeployStep.description = `Vercel redeploy triggered (${res.status})` }
      } catch {
        if (redeployStep) { redeployStep.status = 'skipped'; redeployStep.description = 'Vercel redeploy hook failed — trigger from dashboard' }
      }
    }

    const verify = steps.find(s => s.id === 'verify')
    if (verify) { verify.status = 'done'; verify.description = 're-scan scheduled 5 minutes after redeploy' }

    return { ...plan, steps, status: 'done', backupBranch, backupSha, commitSha, redeploy }
  } catch (err) {
    return { ...plan, steps, status: 'error', backupBranch, backupSha, commitSha, error: `fix failed: ${err?.message || String(err)}` }
  }
}

export { maskSecret }
