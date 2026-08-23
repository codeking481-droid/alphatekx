/**
 * ALPHATEKX RESTORE GIT — real version control for every restoration.
 *
 * Each restoration run becomes an actual git repository inside its artifacts
 * directory: the original damaged state is committed first, every repair
 * milestone lands as its own commit with a tag, and the final restored site
 * is tagged `restored-final`. Rollback is then just `git checkout <tag>`.
 *
 * Repo-local git config only — never touches the user's global setup.
 * NEVER throws: any failure degrades to unavailable and delivery continues.
 */

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const slug = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'milestone'

/**
 * @param {{dir:string, originalHtml:string, finalHtml:string, milestones?:Array<{label:string, html:string}>, meta?:object}} input
 * @returns {{available:boolean, reason?:string, commits:number, tags:string[], log:Array<{tag:string,message:string}>}}
 */
export function buildRestoreGitHistory({ dir, originalHtml, finalHtml, milestones = [], meta = {} }) {
  const out = { available: false, commits: 0, tags: [], log: [] }
  try {
    execFileSync('git', ['--version'], { stdio: 'pipe' })
  } catch {
    out.reason = 'git binary not available'
    return out
  }

  const run = (args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' }).toString().trim()
  try {
    // Fresh repo per restoration — artifacts dirs are unique per run.
    fs.rmSync(path.join(dir, '.git'), { recursive: true, force: true })
    run(['init', '-b', 'main'])
    run(['config', 'user.name', 'Alpha Restoration Agent'])
    run(['config', 'user.email', 'alpha@alphatekx.local'])

    const indexFile = path.join(dir, 'index.html')
    const commitAll = (message) => {
      run(['add', 'index.html'])
      // --allow-empty: consecutive milestones may produce identical files
      // (e.g. final state == last milestone) but the TAG is the rollback ref.
      run(['commit', '--allow-empty', '-m', message])
      out.commits++
    }

    // 1. The damaged original — the anchor every rollback hangs from.
    fs.writeFileSync(indexFile, String(originalHtml || ''), 'utf8')
    commitAll('chore: capture original damaged state')
    run(['tag', 'damaged-original'])
    out.tags.push('damaged-original')
    out.log.push({ tag: 'damaged-original', message: 'Original site as captured — redeploy this to undo everything' })

    // 2. One commit (+tag) per repair milestone, in execution order.
    let n = 0
    for (const m of milestones) {
      if (!m?.html || !m?.label) continue
      n++
      fs.writeFileSync(indexFile, String(m.html), 'utf8')
      const tag = `milestone-${n}-${slug(m.label)}`
      commitAll(`fix(cycle): ${m.label}`)
      run(['tag', tag])
      out.tags.push(tag)
      out.log.push({ tag, message: m.label })
    }

    // 3. The restored result.
    fs.writeFileSync(indexFile, String(finalHtml || ''), 'utf8')
    commitAll('fix: restoration complete — verified restored site')
    run(['tag', 'restored-final'])
    out.tags.push('restored-final')
    out.log.push({ tag: 'restored-final', message: 'Final verified restoration — this is what was delivered' })

    // Human-readable manifest so anyone can navigate the history.
    const manifest = {
      generated_at: new Date().toISOString(),
      ...meta,
      how_to_rollback: [
        'cd into this folder',
        'git log --oneline            # see every repair step',
        'git checkout damaged-original -- index.html   # full rollback',
        'git checkout <tag> -- index.html              # roll back one step',
      ],
      commits: out.commits,
      timeline: out.log,
    }
    fs.writeFileSync(path.join(dir, 'GIT_HISTORY.json'), JSON.stringify(manifest, null, 2), 'utf8')

    out.available = true
    return out
  } catch (err) {
    out.reason = err instanceof Error ? err.message : String(err)
    return out
  }
}
