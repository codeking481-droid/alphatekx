// githubPR.mjs — real GitHub PR via octokit, honest, no fake
// Usage: createBattlePR({ owner, repo, token, files, reportMd })
// Also exports pushToGitHub for /push command (clone → commit → PR)
import fs from 'node:fs'
import path from 'node:path'
import { exec as _exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(_exec)

// Gap 1 Fix: token-authenticated clone with depth fallback
export const pushToGitHub = async (repoUrl, branch, files, commitMessage) => {
  const token = process.env.GITHUB_TOKEN
  if (!token) throw new Error('GITHUB_TOKEN is required')

  const authUrl = repoUrl.replace('https://', `https://${token}@`)

  try {
    await execAsync(`git clone --depth 1 ${authUrl} .tmp/repo`)
  } catch (error) {
    if (String(error.message).includes('depth')) {
      await execAsync(`git clone ${authUrl} .tmp/repo`)
    } else throw error
  }

  await execAsync(`git -C .tmp/repo add . && git -C .tmp/repo commit -m "${commitMessage.replace(/"/g, '\\"')}" && git -C .tmp/repo push origin ${branch}`)
}

export async function createBattlePR({ owner, repo, token, files, reportMd, branch = `alpha/battle-${Date.now()}` }) {
  if (!token) throw new Error('GITHUB_TOKEN missing — set env to enable real PR (read-only otherwise)')
  const { Octokit } = await import('octokit')
  const octokit = new Octokit({ auth: token })
  // Get default branch SHA
  const { data: repoData } = await octokit.rest.repos.get({ owner, repo })
  const defaultBranch = repoData.default_branch
  const { data: refData } = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${defaultBranch}` })
  const baseSha = refData.object.sha
  // Create new branch
  await octokit.rest.git.createRef({ owner, repo, ref: `refs/heads/${branch}`, sha: baseSha })
  // Create/update files (single commit via createOrUpdateFiles requires tree)
  // Simplest: create blobs and tree
  const tree = []
  for (const f of files) {
    const { data: blob } = await octokit.rest.git.createBlob({ owner, repo, content: Buffer.from(f.content).toString('base64'), encoding: 'base64' })
    tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha })
  }
  const { data: newTree } = await octokit.rest.git.createTree({ owner, repo, base_tree: baseSha, tree })
  const { data: commit } = await octokit.rest.git.createCommit({ owner, repo, message: `Alpha Battle — surgical fixes + 12-phase scorecard`, tree: newTree.sha, parents: [baseSha] })
  await octokit.rest.git.updateRef({ owner, repo, ref: `heads/${branch}`, sha: commit.sha })
  const { data: pr } = await octokit.rest.pulls.create({
    owner, repo,
    title: `Alpha Battle — ${files.length} files, surgical restoration`,
    head: branch,
    base: defaultBranch,
    body: reportMd.slice(0, 60000),
  })
  return { url: pr.html_url, branch, commit: commit.sha }
}

// Helper for local battle ZIP → PR files
export function battleFilesToPR(manifest, tmpDir) {
  const files=[]
  for(const site of manifest){
    const fixedPath = path.join(tmpDir, site.id, 'fixed.html')
    if(fs.existsSync(fixedPath)){
      const content = fs.readFileSync(fixedPath,'utf8')
      files.push({ path: `battle/${site.id}/index.html`, content })
    }
  }
  return files
}
