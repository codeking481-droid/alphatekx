import { useEffect, useState } from 'react'
import { Check, Copy, ExternalLink, Globe, LoaderCircle, UploadCloud, Wrench, X } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { deployPastedHtml, slugifyCreation } from '../lib/deployCreation'
import { getCreations, hydrateMissionStore, subscribeStore, updateCreation } from '../lib/missionStore'

type DeployInfo = { publicAppUrl: string; serviceUrl: string; wildcardDomain: string; dnsRecords: Array<{ type: string; name: string; value: string }> }

export default function Launch() {
  const [creations, setCreations] = useState(getCreations())
  const [selected, setSelected] = useState('')
  const [notice, setNotice] = useState('')
  const [domain, setDomain] = useState('')
  const [slug, setSlug] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [pasteHtml, setPasteHtml] = useState('')
  const [pasteTitle, setPasteTitle] = useState('')
  const [pasteSlug, setPasteSlug] = useState('')
  const [deploying, setDeploying] = useState(false)
  const [deployResult, setDeployResult] = useState<{ pathUrl: string; subdomainUrl: string } | null>(null)
  const [restoreRunning, setRestoreRunning] = useState(false)
  const [restoreSteps, setRestoreSteps] = useState<Array<{ label: string; status: string; summary?: string }>>([])
  const [restoredHtml, setRestoredHtml] = useState<string | null>(null)
  const [searchParams] = useSearchParams()
  const [deployInfo, setDeployInfo] = useState<DeployInfo | null>(null)

  useEffect(() => subscribeStore(() => setCreations(getCreations())), [])
  useEffect(() => {
    const requested = searchParams.get('creation') || ''
    if (requested && creations.some(c => c.id === requested)) setSelected(requested)
    else if (creations[0]) setSelected(creations[0].id)
  }, [creations, searchParams])
  const creation = creations.find(c => c.id === selected)
  useEffect(() => { if (creation) { setDomain(creation.customDomain ?? ''); setSlug(creation.slug ?? slugifyCreation(creation.title ?? 'my-app')); setNotice('') } }, [creation?.id])
  useEffect(() => { void fetch('/api/deploy/info').then(r => r.json()).then(d => setDeployInfo(d as DeployInfo)).catch(() => null) }, [])

  const copyUrl = async (url?: string) => { if (url) { await navigator.clipboard.writeText(url); setNotice('URL copied.') } }
  const publish = async () => {
    if (!creation || publishing) return
    setPublishing(true); setNotice('Publishing...')
    try {
      const { publishCreationPath } = await import('../lib/deployCreation')
      const result = await publishCreationPath(creation, slug)
      updateCreation(creation.id, { slug: result.slug, published: true, status: 'live', deploymentUrl: result.subdomainUrl || result.url, pathUrl: result.url })
      setSlug(result.slug); setNotice(`Live at ${result.subdomainUrl || result.url}`)
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Failed.') } finally { setPublishing(false) }
  }

  const deployCode = async () => {
    if (deploying || !pasteTitle.trim() || !pasteSlug || !pasteHtml.trim()) return
    setDeploying(true); setDeployResult(null); setNotice('Deploying...')
    try {
      const result = await deployPastedHtml({ title: pasteTitle, slug: pasteSlug, html: pasteHtml })
      setDeployResult(result); setNotice('Deployed!')
      await hydrateMissionStore(); setCreations(getCreations())
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Deploy failed.') } finally { setDeploying(false) }
  }

  const restoreWithAlpha = async () => {
    if (restoreRunning || !pasteHtml.trim()) return
    setRestoreRunning(true); setRestoreSteps([]); setRestoredHtml(null); setNotice('')
    try {
      const res = await fetch('/api/restore/paste-html', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html: pasteHtml }) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const reader = res.body?.getReader(); if (!reader) throw new Error('No body')
      const decoder = new TextDecoder(); let buffer = ''
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'thought_step' && event.step) {
              setRestoreSteps(prev => { const idx = prev.findIndex(s => s.label === event.step.label); if (idx >= 0) { const n = [...prev]; n[idx] = { label: event.step.label, status: event.step.status, summary: event.step.summary }; return n } return [...prev, { label: event.step.label, status: event.step.status, summary: event.step.summary }] })
            }
            if (event.type === 'fixprompt' && event.scanSummary?.fixedHtml) {
              setRestoredHtml(event.scanSummary.fixedHtml); setPasteHtml(event.scanSummary.fixedHtml)
              setNotice(`Alpha fixed ${event.scanSummary.errorsFound} issues.`)
            }
          } catch {}
        }
      }
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Restore failed.') } finally { setRestoreRunning(false) }
  }

  const liveUrl = creation?.deploymentUrl
  const pathUrl = creation?.pathUrl || (creation?.slug ? `https://alphatekx.name.ng/app/${creation.slug}` : undefined)

  return (
    <div className="min-h-screen px-4 py-8 md:px-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold md:text-4xl">Deploy</h1>
          <p className="mt-2 text-sm text-white/55">Paste your HTML, pick a name, and go live on a real subdomain.</p>
        </div>

        {notice && <p role="status" className="mb-6 rounded-xl border border-violet-400/20 bg-violet-500/10 p-3 text-sm text-center">{notice}</p>}

        {/* ── MAIN: Paste & Deploy ── */}
        <section className="rounded-2xl border border-violet-400/20 liquid-glass p-6 shadow-sm md:p-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-medium text-white/70">
              App name
              <input value={pasteTitle} onChange={e => { const t = e.target.value; setPasteTitle(t); setPasteSlug(slugifyCreation(t)) }} className="field mt-2 w-full" placeholder="My portfolio" />
            </label>
            <label className="text-xs font-medium text-white/70">
              Subdomain
              <div className="mt-2 flex min-h-12 items-center rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 text-sm">
                <input value={pasteSlug} onChange={e => setPasteSlug(slugifyCreation(e.target.value))} className="min-w-0 flex-1 bg-transparent px-1 text-zinc-100 outline-none" placeholder="my-portfolio" />
                <span className="shrink-0 text-white/45">.alphatekx.name.ng</span>
              </div>
            </label>
          </div>

          <label className="mt-4 block text-xs font-medium text-white/70">
            HTML code
            <textarea value={pasteHtml} onChange={e => setPasteHtml(e.target.value)} className="mt-2 min-h-64 w-full resize-y rounded-xl border border-violet-400/20 bg-violet-500/10 p-3 font-mono text-xs leading-5 text-zinc-100 outline-none focus:border-[#D6FF00]" placeholder={'<!doctype html>\n<html>\n  <head>...</head>\n  <body>...</body>\n</html>'} spellCheck={false} />
          </label>
          <p className="mt-1 text-xs text-white/40">Max 900 KB. HTML, CSS, and JS all in one file.</p>

          {/* Restore with Alpha steps */}
          {restoreSteps.length > 0 && (
            <div className="mt-4 rounded-xl border border-[#D6FF00]/20 bg-[#D6FF00]/5 p-4">
              <p className="text-xs font-medium text-[#D6FF00] mb-3">Alpha's Analysis</p>
              <div className="space-y-1.5">
                {restoreSteps.map((step, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={`size-1.5 rounded-full shrink-0 ${step.status === 'done' ? 'bg-emerald-400' : step.status === 'active' ? 'bg-[#D6FF00] animate-pulse' : step.status === 'error' ? 'bg-red-400' : 'bg-zinc-600'}`} />
                    <span className="text-white/70">{step.label}</span>
                    {step.summary && <span className="text-white/40 ml-auto truncate max-w-[180px]">{step.summary}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Deploy result */}
          {deployResult && (
            <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
              <p className="text-sm font-medium text-emerald-300">Your site is live!</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <a href={deployResult.subdomainUrl} target="_blank" rel="noreferrer" className="launch-action flex-1 justify-center gap-2"><Globe size={15}/>Open {deployResult.subdomainUrl}</a>
                {deployResult.pathUrl && <a href={deployResult.pathUrl} target="_blank" rel="noreferrer" className="launch-action flex-1 justify-center gap-2"><ExternalLink size={15}/>Fallback</a>}
              </div>
              <button onClick={() => void copyUrl(deployResult.subdomainUrl)} className="launch-action mt-2 gap-2"><Copy size={14}/>Copy URL</button>
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-5 flex gap-3">
            <button onClick={() => void restoreWithAlpha()} disabled={restoreRunning || !pasteHtml.trim()} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-[#D6FF00]/30 bg-[#D6FF00]/10 px-5 text-sm font-medium text-[#D6FF00] transition-all disabled:opacity-40 hover:bg-[#D6FF00]/20">
              {restoreRunning ? <LoaderCircle className="animate-spin" size={17}/> : <Wrench size={17}/>}
              {restoreRunning ? 'Alpha fixing...' : restoredHtml ? 'Re-run fix' : 'Restore with Alpha'}
            </button>
            <button onClick={() => void deployCode()} disabled={deploying || !pasteTitle.trim() || !pasteSlug || !pasteHtml.trim()} className="flex min-h-12 items-center justify-center gap-2 rounded-xl btn-alpha px-6 text-sm font-medium text-white transition-all disabled:opacity-40">
              {deploying ? <LoaderCircle className="animate-spin" size={17}/> : <UploadCloud size={17}/>}
              {restoredHtml ? 'Deploy fixed' : 'Deploy'}
            </button>
          </div>
        </section>

        {/* ── EXISTING CREATIONS ── */}
        {creations.length > 0 && (
          <section className="mt-6 rounded-2xl border border-violet-400/20 liquid-glass p-5 shadow-sm md:p-8">
            <h2 className="text-sm font-semibold">Existing creations</h2>
            <select value={selected} onChange={e => setSelected(e.target.value)} className="field mt-3 w-full">
              <option value="">Select a creation</option>
              {creations.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            {creation && (
              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold">{creation.title}</h3>
                    <p className="text-xs text-white/50">{creation.files.length} files</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${creation.status === 'live' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-violet-500/10 text-zinc-300'}`}>{creation.status}</span>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="flex min-h-12 min-w-0 flex-1 items-center rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 text-sm">
                    <span className="hidden text-white/45 sm:inline">https://</span>
                    <input value={slug} onChange={e => setSlug(slugifyCreation(e.target.value))} className="min-w-0 flex-1 bg-transparent px-1 text-zinc-100 outline-none" />
                    <span className="hidden text-white/45 sm:inline">.alphatekx.name.ng</span>
                  </div>
                  <button onClick={() => void publish()} disabled={publishing || !slug} className="flex min-h-12 items-center justify-center gap-2 rounded-xl btn-alpha px-6 text-sm font-medium text-white transition-all disabled:opacity-50">
                    {publishing ? <LoaderCircle className="animate-spin" size={16}/> : <UploadCloud size={16}/>} Publish
                  </button>
                </div>
                {liveUrl && (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                    <p className="text-sm font-medium text-emerald-300">Live</p>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <a href={liveUrl} target="_blank" rel="noreferrer" className="launch-action flex-1 justify-center gap-2"><Globe size={15}/>{liveUrl}</a>
                      {pathUrl && <a href={pathUrl} target="_blank" rel="noreferrer" className="launch-action flex-1 justify-center gap-2"><ExternalLink size={15}/>Fallback</a>}
                    </div>
                    <button onClick={() => void copyUrl(liveUrl)} className="launch-action mt-2 gap-2"><Copy size={14}/>Copy</button>
                  </div>
                )}
                <div className="flex gap-2">
                  <label className="flex min-h-10 flex-1 items-center gap-2 rounded-lg border border-violet-400/20 bg-violet-500/10 px-3 text-sm">
                    <Globe size={14} className="shrink-0 text-white/40" />
                    <input value={domain} onChange={e => setDomain(e.target.value)} className="min-w-0 flex-1 bg-transparent text-zinc-100 outline-none" placeholder="Custom domain" />
                  </label>
                  <button onClick={() => { if (creation) { updateCreation(creation.id, { customDomain: domain }); setNotice('Domain saved.') } }} className="rounded-lg btn-alpha px-4 text-sm font-medium text-white">Save</button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
