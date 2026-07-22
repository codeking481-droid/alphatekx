import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronRight, Code2, Copy, Download, ExternalLink, Globe, LoaderCircle, RotateCcw, Server, Ship, UploadCloud, X } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { deployPastedHtml, publishCreationPath, slugifyCreation } from '../lib/deployCreation'
import { exportCreationZip } from '../lib/exportCreation'
import { getCreations, hydrateMissionStore, rollbackCreation, subscribeStore, updateCreation } from '../lib/missionStore'

const stages = ['Idea', 'Plan', 'Build', 'Test', 'Deploy', 'Live']
const envTemplate = '# Project environment\nVITE_SUPABASE_URL=\nVITE_SUPABASE_ANON_KEY=\n'

type DeployInfo = {
  publicAppUrl: string
  serviceUrl: string
  serviceHostname: string
  wildcardDomain: string
  dnsRecords: Array<{ type: string; name: string; value: string; note: string }>
  instructions: string
}

export default function Launch() {
  const [creations, setCreations] = useState(getCreations())
  const [selected, setSelected] = useState('')
  const [notice, setNotice] = useState('')
  const [domain, setDomain] = useState('')
  const [slug, setSlug] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteDeploying, setPasteDeploying] = useState(false)
  const [pasteNotice, setPasteNotice] = useState('')
  const [pasteResult, setPasteResult] = useState<{ pathUrl: string; subdomainUrl: string } | null>(null)
  const [paste, setPaste] = useState({ title: '', slug: '', html: '' })
  const [searchParams] = useSearchParams()
  const [deployInfo, setDeployInfo] = useState<DeployInfo | null>(null)
  const [showDns, setShowDns] = useState(false)

  useEffect(() => subscribeStore(() => setCreations(getCreations())), [])
  useEffect(() => {
    if (selected) return
    const requested = searchParams.get('creation') || ''
    if (requested && creations.some(item => item.id === requested)) setSelected(requested)
    else if (creations[0]) setSelected(creations[0].id)
  }, [creations, searchParams, selected])
  const creation = creations.find(item => item.id === selected)
  useEffect(() => {
    setDomain(creation?.customDomain ?? '')
    setSlug(creation?.slug ?? slugifyCreation(creation?.title ?? 'my-app'))
    setNotice('')
  }, [creation?.id])

  useEffect(() => {
    void fetch('/api/deploy/info')
      .then(res => res.json())
      .then(data => setDeployInfo(data as DeployInfo))
      .catch(() => null)
  }, [])

  const tables = useMemo(() => {
    const code = (creation?.code ?? '').toLowerCase()
    return ['profiles', code.includes('order') ? 'orders' : null, code.includes('product') ? 'products' : null, code.includes('booking') ? 'bookings' : null, code.includes('message') ? 'messages' : null].filter(Boolean) as string[]
  }, [creation])

  const copyEnv = async () => { await navigator.clipboard.writeText(envTemplate); setNotice('Environment template copied.') }
  const handoff = async (target: 'Vercel' | 'Render' | 'Docker') => {
    if (!creation) return
    await exportCreationZip(creation)
    if (target === 'Vercel') window.open('https://vercel.com/new', '_blank', 'noopener,noreferrer')
    if (target === 'Render') window.open('https://dashboard.render.com/select-repo?type=web', '_blank', 'noopener,noreferrer')
    setNotice(`${target} package prepared and downloaded.`)
  }
  const publish = async () => {
    if (!creation || publishing) return
    setPublishing(true)
    setNotice('Publishing your app...')
    try {
      const result = await publishCreationPath(creation, slug)
      updateCreation(creation.id, { slug: result.slug, published: true, status: 'live', deploymentUrl: result.subdomainUrl || result.url, pathUrl: result.url })
      setSlug(result.slug)
      setNotice(`Your app is live at ${result.subdomainUrl || result.url}`)
      setShowDns(true)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Publication failed.')
    } finally {
      setPublishing(false)
    }
  }
  const copyLiveUrl = async (url?: string) => {
    if (!url) return
    await navigator.clipboard.writeText(url)
    setNotice('Live URL copied.')
  }
  const saveDomain = () => {
    if (!creation) return
    updateCreation(creation.id, { customDomain: domain })
    setNotice('Custom domain preference saved. DNS connection will be added in the subdomain phase.')
  }
  const deployCode = async () => {
    if (pasteDeploying) return
    setPasteDeploying(true)
    setPasteNotice('Deploying your HTML...')
    setPasteResult(null)
    try {
      const result = await deployPastedHtml(paste)
      setPasteResult(result)
      setPasteNotice('Your pasted code is deployed.')
      await hydrateMissionStore()
      setCreations(getCreations())
      setShowDns(true)
    } catch (error) {
      setPasteNotice(error instanceof Error ? error.message : 'Code deployment failed.')
    } finally {
      setPasteDeploying(false)
    }
  }
  const liveUrl = creation?.deploymentUrl
  const pathUrl = creation?.pathUrl || (creation?.slug ? `https://alphatekx.name.ng/app/${creation.slug}` : undefined)

  return <div className="min-h-screen px-4 py-8 md:px-10"><div className="mx-auto max-w-6xl">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold md:text-3xl">Launch</h1>
        <p className="mt-2 text-sm text-white/55">Publish a finished creation to a real <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-xs">*.alphatekx.name.ng</code> subdomain.</p>
      </div>
      <button onClick={() => { setPasteOpen(true); setPasteNotice(''); setPasteResult(null) }} className="flex min-h-11 items-center gap-2 rounded-full border border-white/[.15] bg-white/[0.05] px-4 text-sm font-medium transition-all hover:border-[#E56B2D] hover:bg-white/[0.08]"><Code2 size={16}/>Deploy pasted code</button>
    </div>

    <div className="mt-8 grid grid-cols-3 gap-2 lg:grid-cols-6">
      {stages.map((stage, index) => <div key={stage} className="flex min-h-14 items-center gap-2 rounded-xl border border-white/[.12] liquid-glass p-3 shadow-sm"><span className={`grid size-6 place-items-center rounded-full text-xs ${index === stages.length - 1 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/[.08]'}`}>{index === stages.length - 1 ? <Check size={13}/> : index + 1}</span><span className="text-xs font-medium">{stage}</span></div>)}
    </div>

    <section className="mt-6 rounded-2xl border border-white/[.12] liquid-glass p-5 shadow-sm md:p-8">
      <label className="block text-xs font-medium text-white/70">Choose a creation</label>
      <select value={selected} onChange={event => setSelected(event.target.value)} className="field mt-2">
        <option value="">Select a creation</option>
        {creations.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select>

      {creation ? <div className="mt-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{creation.title}</h2>
            <p className="mt-1 text-sm text-white/55">{creation.files.length} files generated</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${creation.status === 'live' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/[.08] text-zinc-300'}`}>{creation.status}</span>
        </div>

        {notice && <p role="status" className="rounded-lg border border-white/[.12] bg-white/[.04] p-3 text-sm">{notice}</p>}

        <div className="rounded-2xl border border-white/[.12] bg-white/[0.04] p-5">
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl btn-alpha text-white"><UploadCloud size={20}/></span>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold">Publish on AlphaTekX</h3>
              <p className="mt-1 text-sm text-white/55">Your app will be available at <span className="font-medium text-white/80">https://your-slug.alphatekx.name.ng</span>.</p>
            </div>
          </div>

          <label className="mt-5 block text-xs font-medium text-white/70" htmlFor="creation-slug">App address</label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <div className="flex min-h-12 min-w-0 flex-1 items-center rounded-xl border border-white/[.15] bg-white/[0.05] px-3 text-sm">
              <span className="hidden text-white/45 sm:inline">https://</span>
              <input id="creation-slug" value={slug} onChange={event => setSlug(slugifyCreation(event.target.value))} className="min-w-0 flex-1 bg-transparent px-1 text-zinc-100 outline-none" aria-label="Published app slug"/>
              <span className="hidden text-white/45 sm:inline">.alphatekx.name.ng</span>
            </div>
            <button onClick={() => void publish()} disabled={publishing || !slug} className="flex min-h-12 items-center justify-center gap-2 rounded-xl btn-alpha px-6 text-sm font-medium text-white transition-all disabled:opacity-50">
              {publishing ? <LoaderCircle className="animate-spin" size={16}/> : <UploadCloud size={16}/>} {creation.deploymentUrl ? 'Republish' : 'Publish'}
            </button>
          </div>

          {liveUrl && (
            <div className="mt-5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
              <p className="text-sm font-medium text-emerald-300">Your app is live</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <a href={liveUrl} target="_blank" rel="noreferrer" className="launch-action flex-1 justify-center gap-2"><Globe size={16}/>{liveUrl}</a>
                {pathUrl && <a href={pathUrl} target="_blank" rel="noreferrer" className="launch-action flex-1 justify-center gap-2"><ExternalLink size={16}/>Open path fallback</a>}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => void copyLiveUrl(liveUrl)} className="launch-action gap-2"><Copy size={15}/>Copy subdomain</button>
                {pathUrl && <button onClick={() => void copyLiveUrl(pathUrl)} className="launch-action gap-2"><Copy size={15}/>Copy fallback</button>}
              </div>
            </div>
          )}

          {showDns && deployInfo && (
            <div className="mt-5 rounded-xl border border-white/[.12] bg-white/[0.03] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold"><Globe size={16}/> Subdomain DNS setup</div>
              <p className="mt-2 text-sm text-white/55">To make every slug a real subdomain, add this wildcard record at your DNS provider and add <code className="rounded bg-white/[0.08] px-1">{deployInfo.wildcardDomain}</code> in your Render Dashboard.</p>
              <div className="mt-3 overflow-x-auto rounded-lg border border-white/[.12]">
                <table className="w-full text-left text-sm"><thead className="bg-white/[.04] text-xs text-white/55"><tr><th className="px-4 py-2">Type</th><th className="px-4 py-2">Name</th><th className="px-4 py-2">Value</th></tr></thead><tbody>{deployInfo.dnsRecords.map((record, i) => <tr key={i} className="border-t border-white/10"><td className="px-4 py-3 font-mono text-xs">{record.type}</td><td className="px-4 py-3 font-mono text-xs">{record.name}</td><td className="px-4 py-3 font-mono text-xs">{record.value}</td></tr>)}</tbody></table>
              </div>
              <button onClick={() => void copyLiveUrl(`CNAME * ${deployInfo.dnsRecords[0]?.value || ''}`)} className="launch-action mt-3 gap-2"><Copy size={15}/>Copy DNS record</button>
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <button onClick={() => void exportCreationZip(creation)} className="launch-action gap-2 justify-center"><Download size={16}/>Project ZIP</button>
          <button onClick={() => void handoff('Vercel')} className="launch-action gap-2 justify-center"><ExternalLink size={16}/>Vercel</button>
          <button onClick={() => void handoff('Render')} className="launch-action gap-2 justify-center"><Server size={16}/>Render</button>
          <button onClick={() => void handoff('Docker')} className="launch-action gap-2 justify-center"><Ship size={16}/>Docker</button>
        </div>
        <button onClick={() => void copyEnv()} className="launch-action w-full gap-2 justify-center"><Copy size={16}/>Copy environment template</button>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl border border-white/[.12] p-5">
            <h3 className="text-sm font-semibold">Database tables</h3>
            <p className="mt-2 text-xs text-white/55">Suggested tables for this creation.</p>
            <div className="mt-4 flex flex-wrap gap-2">{tables.map(table => <span key={table} className="rounded-md bg-white/[.08] px-3 py-2 font-mono text-xs">{table}</span>)}</div>
          </div>
          <div className="rounded-xl border border-white/[.12] p-5">
            <h3 className="text-sm font-semibold">Custom domain</h3>
            <div className="mt-4 flex gap-2"><input value={domain} onChange={event => setDomain(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-lg border border-white/[.15] bg-white/[0.05] px-3 text-sm text-zinc-100 outline-none" placeholder="app.yourdomain.com"/><button onClick={saveDomain} className="rounded-lg btn-alpha px-4 text-sm font-medium text-white">Save</button></div>
          </div>
        </div>

        <h3 className="text-sm font-semibold">Version history</h3>
        <div className="mt-3 space-y-2">{(creation.versions ?? []).slice().reverse().map(version => <div key={version.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[.12] p-4"><div><p className="text-sm font-medium">{version.label}</p><p className="mt-1 text-xs text-white/55">{new Date(version.createdAt).toLocaleString()}</p></div><button onClick={() => { rollbackCreation(creation.id, version.id); setNotice(`Restored ${version.label}.`) }} className="flex min-h-10 items-center gap-2 rounded-lg border border-white/[.15] px-3 text-xs transition-all hover:bg-white/[0.08]"><RotateCcw size={14}/>Restore</button></div>)}</div>
      </div> : <div className="mt-6 rounded-xl border border-dashed border-white/[.15] p-10 text-center"><div className="mx-auto grid size-12 place-items-center rounded-full bg-white/[0.05]"><UploadCloud size={20} className="text-white/40"/></div><h2 className="mt-4 font-semibold">No creation selected</h2><p className="mt-2 text-sm text-white/55">Build a mission first, then return here to launch it.</p></div>}
    </section>

    {pasteOpen && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4" onMouseDown={() => !pasteDeploying && setPasteOpen(false)}>
      <div className="my-6 w-full max-w-2xl rounded-2xl border border-white/[.12] liquid-glass p-6 shadow-xl sm:p-8" onMouseDown={event => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">Deploy pasted HTML</h2><p className="mt-1 text-sm text-white/55">Paste one complete HTML file. AlphaTekX will publish it as a standalone app.</p></div><button onClick={() => setPasteOpen(false)} disabled={pasteDeploying} className="grid size-11 shrink-0 place-items-center rounded-lg hover:bg-white/[.08] disabled:opacity-40" aria-label="Close pasted code deployment"><X size={18}/></button></div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-medium text-white/70">App name<input value={paste.title} onChange={event => { const title = event.target.value; setPaste(current => ({ ...current, title, slug: slugifyCreation(title) })) }} className="field mt-2" placeholder="My portfolio"/></label>
          <label className="text-xs font-medium text-white/70">Subdomain<input value={paste.slug} onChange={event => setPaste(current => ({ ...current, slug: slugifyCreation(event.target.value) }))} className="field mt-2" placeholder="my-portfolio"/></label>
        </div>
        <label className="mt-4 block text-xs font-medium text-white/70">Full HTML code<textarea value={paste.html} onChange={event => setPaste(current => ({ ...current, html: event.target.value }))} className="mt-2 min-h-72 w-full resize-y rounded-xl border border-white/[.15] bg-white/[0.05] p-3 font-mono text-xs leading-5 text-zinc-100 outline-none focus:border-[#E56B2D]" placeholder={'<!doctype html>\n<html>\n  <head>...</head>\n  <body>...</body>\n</html>'} spellCheck={false}/></label>
        <p className="mt-2 text-xs text-white/45">Maximum 900 KB. HTML, CSS, and JavaScript may all be included in this one file.</p>
        {pasteNotice && <p role="status" className="mt-4 rounded-lg border border-white/[.12] bg-white/[.04] p-3 text-sm">{pasteNotice}</p>}
        {pasteResult && (
          <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
            <p className="text-sm font-medium text-emerald-300">Pasted code is live</p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row"><a href={pasteResult.subdomainUrl} target="_blank" rel="noreferrer" className="launch-action flex-1 justify-center gap-2"><Globe size={15}/>Open {pasteResult.subdomainUrl}</a><a href={pasteResult.pathUrl} target="_blank" rel="noreferrer" className="launch-action flex-1 justify-center gap-2"><ExternalLink size={15}/>Open fallback</a></div>
            <button onClick={() => void copyLiveUrl(pasteResult.subdomainUrl)} className="launch-action mt-3 gap-2"><Copy size={15}/>Copy live URL</button>
          </div>
        )}
        <button onClick={() => void deployCode()} disabled={pasteDeploying || !paste.title.trim() || !paste.slug || !paste.html.trim()} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl btn-alpha px-5 text-sm font-medium text-white transition-all disabled:opacity-40">{pasteDeploying ? <LoaderCircle className="animate-spin" size={17}/> : <UploadCloud size={17}/>}Deploy code</button>
      </div>
    </div>}
  </div></div>
}
