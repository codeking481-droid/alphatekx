// repoScanner.mjs — whole-GitHub clone + scan every file, green card plain English
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { detectIssuesV2 } from './restorationEngineV2.mjs'
import { detectIssuesV3 } from './restorationEngineV3.mjs'
import { buildGreenCard } from './greenCard.mjs'

const TMP_ROOT = path.join(process.cwd(), '.tmp', 'repos')
const SKIP_DIRS = new Set(['node_modules','.git','dist','build','.next','vendor','.tmp'])

export async function scanRepo({ githubUrl, branch, token, maxFiles=500 }){
  const cleanUrl = githubUrl.replace(/^https?:\/\//,'').replace(/\.git$/,'')
  const repoName = cleanUrl.split('/').slice(-2).join('-') || 'repo'
  const tmpDir = path.join(TMP_ROOT, `${repoName}-${Date.now()}`)
  fs.mkdirSync(tmpDir, {recursive:true})

  // Clone
  let cloneUrl = githubUrl
  if(!/^https?:\/\//.test(cloneUrl)) cloneUrl = `https://github.com/${cloneUrl}`
  if(token) cloneUrl = cloneUrl.replace('https://', `https://oauth2:${token}@`)
  const args = ['clone','--depth','1']
  if(branch) args.push('--branch', branch)
  args.push(cloneUrl, tmpDir)
  const r = spawnSync('git', args, { timeout: 60_000, encoding:'utf8' })
  if(r.status!==0) throw new Error(`git clone failed: ${(r.stderr||r.stdout||'').slice(0,400)}`)

  // Inventory
  const files=[]
  function walk(dir){
    if(files.length>=maxFiles) return
    for(const ent of fs.readdirSync(dir, {withFileTypes:true})){
      if(files.length>=maxFiles) break
      if(SKIP_DIRS.has(ent.name)) continue
      const full=path.join(dir, ent.name)
      if(ent.isDirectory()) walk(full)
      else if(/\.(html|htm|js|jsx|ts|tsx|css|scss|json|md)$/i.test(ent.name)){
        const stat=fs.statSync(full)
        if(stat.size>500*1024) continue
        files.push(full)
      }
    }
  }
  walk(tmpDir)
  const findings=[]
  for(const f of files){
    try{
      const content=fs.readFileSync(f,'utf8')
      const rel=path.relative(tmpDir, f)
      if(/\.html?$/i.test(f)){
        const v2=detectIssuesV2(content)
        const v3=detectIssuesV3(content)
        for(const x of [...v2,...v3]) findings.push({ ...x, file: rel, page: rel })
      } else if(/\.css$/i.test(f)){
        if(!/@media/i.test(content) && /display:\s*(flex|grid)/i.test(content)) findings.push({ type:'no_media_queries', severity:'high', description:'No @media queries — phone layout broken', file: rel, line:1 })
        if((content.match(/\{/g)||[]).length !== (content.match(/\}/g)||[]).length) findings.push({ type:'css_unbalanced_braces', severity:'high', description:'Unclosed brace — rules after it dropped', file: rel, line:1 })
      } else if(/\.jsx?$/i.test(f)){
        try{ new Function(content) }catch(e){ findings.push({ type:'inline_js_syntax', severity:'critical', description: e.message.slice(0,120), file: rel, line:1 }) }
      }
    }catch{}
  }
  const greenCard = buildGreenCard({ site: githubUrl, pagesScanned: files.length, sitemapUsed:false, findings, beforeScore: Math.max(0,100-findings.length*2), afterScore: Math.max(0,100-findings.length) })
  return { tmpDir, filesScanned: files.length, findings, greenCard }
}
