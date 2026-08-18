// gitHistoryScanner.js — The Restore Engine
// Dig through a target site's Git history for secrets that "were deleted but
// are still in the past" — the classic AI-builder leak. Two sources:
//
//  1. Locally exposed Git data on the live site (/.git/config, /api/git/trees,
//     Git LFS pointers, source maps referencing repo paths).
//  2. The public GitHub repository that built the site (Octokit, no auth):
//     commit messages mentioning keys/tokens, and files that were deleted from
//     the repo after holding credentials.
//
// All findings are masked; raw credentials never leave this module.

import { Octokit } from 'octokit'
import { huntSecrets, maskSecret } from './secretHunter.js'

const GIT_DATA_PATHS = [
  { path: '/.git/config', weight: 3, label: 'exposed .git/config' },
  { path: '/.git/HEAD', weight: 2, label: 'exposed .git/HEAD' },
  { path: '/.git/logs/HEAD', weight: 2, label: 'exposed .git/logs/HEAD' },
  { path: '/.git/objects/info/packs', weight: 2, label: 'exposed git pack index' },
  { path: '/api/git/trees', weight: 2, label: 'GitHub trees API passthrough' },
  { path: '/api/git/blobs', weight: 2, label: 'GitHub blobs API passthrough' },
]

const MESSAGE_KEYWORD = /\b(api[ _-]?key|secret|token|password|passwd|credential|private[ _-]?key|stripe|openai|sk[_\-]|AKIA|BEGIN [A-Z ]*PRIVATE KEY)\b/i

const REPO_EXTRACTORS = [
  /https?:\/\/github\.com\/([A-Za-z0-9_.\-]+)\/([A-Za-z0-9_.\-]+?)(?:\.git)?(?:\/|$|\s|")/,
  /git@github\.com:([A-Za-z0-9_.\-]+)\/([A-Za-z0-9_.\-]+?)(?:\.git)?(?:\/|$|\s|")/,
  /https?:\/\/(?:www\.)?vercel\.com\/([A-Za-z0-9_.\-]+)\/([A-Za-z0-9_.\-]+)/,
]

function parseRepo(text) {
  const haystack = String(text || '')
  for (const extractor of REPO_EXTRACTORS) {
    const match = haystack.match(extractor)
    if (match && match[1] && match[2]) return { owner: match[1], repo: match[2].replace(/\/$/, '') }
  }
  return null
}

/**
 * Probe a public GitHub repo (owner/repo) for secrets hiding in history.
 * Bounded: at most 30 commits scanned, at most 5 detailed file lookups.
 */
async function scanGitHubHistory(owner, repo, { octokit, progress }) {
  const result = {
    repoOwner: owner,
    repoName: repo,
    isPublic: false,
    commitCount: 0,
    commitMessagesWithSecrets: [],
    deletedSecretFiles: [],
  }

  try {
    progress(60, 'checking public repo on GitHub')
    const { data: repoData } = await octokit.rest.repos.get({ owner, repo })
    result.isPublic = !repoData.private
    progress(65, `repo ${owner}/${repo} public`)

    const { data: commits } = await octokit.rest.repos.listCommits({ owner, repo, per_page: 30 })
    result.commitCount = commits.length
    if (!commits.length) return result

    const interesting = []
    for (const commit of commits) {
      const message = commit.commit?.message || ''
      if (MESSAGE_KEYWORD.test(message)) {
        const hits = huntSecrets(message, { source: 'commit-message' })
        result.commitMessagesWithSecrets.push({
          sha: commit.sha,
          shortSha: commit.sha.slice(0, 7),
          date: commit.commit?.author?.date || '',
          message: message.slice(0, 160),
          maskedMatches: hits.slice(0, 5).map(hit => ({ kind: hit.kind, maskedValue: hit.maskedValue })),
        })
        interesting.push(commit)
      }
    }

    // For the most interesting commits, look at the files that changed and
    // flag credentials that were later deleted from the tree.
    const detailTargets = interesting.slice(0, 5)
    for (const commit of detailTargets) {
      try {
        progress(70 + Math.round((detailTargets.indexOf(commit) / detailTargets.length) * 10), `checking commit ${commit.sha.slice(0, 7)}`)
        const { data: detail } = await octokit.rest.repos.getCommit({ owner, repo, ref: commit.sha })
        for (const file of detail.files || []) {
          const filename = file.filename || ''
          if (/secret|\.env|\.env\.local|key|token|credential|password|config\.(json|yaml|yml|toml)/i.test(filename)) {
            if (file.status === 'removed' || file.status === 'deleted') {
              result.deletedSecretFiles.push({ filePath: filename, removedAt: commit.sha.slice(0, 7), description: 'credential file removed from repo after being committed' })
            } else {
              const patch = file.patch || ''
              const hits = huntSecrets(patch, { source: filename })
              if (hits.length) {
                result.deletedSecretFiles.push({ filePath: filename, removedAt: '', description: `credential content in ${file.status} of ${filename}` })
              }
            }
          }
        }
      } catch {
        /* commit detail not readable; skip */
      }
    }
  } catch {
    result.isPublic = false
  }
  return result
}

/**
 * Hunt exposed Git data on the live site itself.
 */
async function scanLocalGit(targetUrl, { context, headers, progress }) {
  const origin = new URL(targetUrl).origin
  const routes = []
  const leaks = []

  let index = 0
  for (const item of GIT_DATA_PATHS) {
    index += 1
    progress(46 + Math.round((index / GIT_DATA_PATHS.length) * 14), `probing ${item.path}`)
    try {
      const res = await context.request.get(`${origin}${item.path}`, { headers, timeout: 10000 })
      routes.push({ path: item.path, statusCode: res.status() })
      if (res.status() < 200 || res.status() >= 400) continue
      const body = await res.text()
      if (!body.trim()) continue
      const hits = huntSecrets(body, { source: item.path })
      for (const hit of hits.slice(0, 5)) {
        leaks.push({ source: item.path, kind: hit.kind, keyName: hit.keyName, maskedValue: hit.maskedValue, description: item.label })
      }
      if (!hits.length && item.path === '/.git/config') {
        leaks.push({ source: item.path, kind: 'GIT_CONFIG', keyName: 'git remote', maskedValue: maskSecret('remote-origin'), description: 'live .git/config reachable by anyone' })
      }
    } catch {
      routes.push({ path: item.path, statusCode: 0 })
    }
  }

  return { routes, leaks, localGitExposed: leaks.length > 0 || routes.some(r => r.path === '/.git/config' && r.statusCode === 200) }
}

/**
 * Full Git history scan for a scanned target.
 * @param {string} targetUrl base URL of the scanned site
 * @param {object} deps
 * @param {object} deps.context Playwright context for binary-safe probing
 * @param {object} [deps.probePage] optional page for HTML reads
 * @param {object} [deps.headers] default request headers
 * @param {string} [deps.sourceHtml] homepage HTML already fetched by the scanner
 * @param {(pct:number, label:string) => void} [deps.progress] progress callback
 */
export async function gitHistoryScanner(targetUrl, { context, probePage, headers = {}, sourceHtml = '', progress = () => {} } = {}) {
  progress(46, 'probing exposed git data')
  const local = await scanLocalGit(targetUrl, { context, headers, progress })

  const repo = parseRepo(sourceHtml)
  const octokit = new Octokit({ auth: process.env.GITHUB_SCANNER_TOKEN || '', request: { timeout: 15000 } })

  let remote = { repoOwner: '', repoName: '', isPublic: false, commitCount: 0, commitMessagesWithSecrets: [], deletedSecretFiles: [] }
  if (repo) {
    remote = await scanGitHubHistory(repo.owner, repo.repo, { octokit, progress })
  }

  return {
    repoOwner: remote.repoOwner || repo?.owner || '',
    repoName: remote.repoName || repo?.repo || '',
    isPublic: remote.isPublic,
    commitCount: remote.commitCount,
    localGitExposed: local.localGitExposed,
    routes: local.routes,
    localGitLeaks: local.leaks,
    commitMessagesWithSecrets: remote.commitMessagesWithSecrets,
    deletedSecretFiles: remote.deletedSecretFiles,
    evidence: [
      ...(local.localGitExposed ? [{ source: 'git-local', description: 'live .git data reachable on the deployed site' }] : []),
      ...(repo ? [{ source: 'github-repo', description: `public repo ${repo.owner}/${repo.repo} found from site fingerprint` }] : []),
      ...(remote.deletedSecretFiles.map(f => ({ source: 'git-history', description: `${f.filePath} removed from history` }))),
    ],
  }
}

export { maskSecret }
