import { useEffect, useRef, useState } from 'react'
import { Check, Copy, ExternalLink, Globe, LoaderCircle, MessageSquare, RefreshCw, Rocket, Trash2, UploadCloud, Upload, X } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { checkDeployName, deleteDeployedSite, deploySite, listMyDeployedSites, slugifyCreation, type MyDeployedSite } from '../lib/deployCreation'
import { getCreations, hydrateMissionStore, subscribeStore, updateCreation } from '../lib/missionStore'

type DeployInfo = { publicAppUrl: string; serviceUrl: string; wildcardDomain: string; dnsRecords: Array<{ type: string; name: string; value: string }> }
type NameCheck = {
  state: 'idle' | 'too-short' | 'checking' | 'available' | 'owned' | 'taken'
  message: string
  suggestions: string[]
}

const initialCheck: NameCheck = { state: 'idle', message: '', suggestions: [] }

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
  const [nameCheck, setNameCheck] = useState<NameCheck>(initialCheck)
  const [deploying, setDeploying] = useState(false)
  const [deployResult, setDeployResult] = useState<{ url: string; subdomainUrl?: string; updated?: boolean } | null>(null)
  const [copied, setCopied] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const deploySectionRef = useRef<HTMLElement | null>(null)

  // ── MY SITES: every site this user deployed, saved on their side ──
  const [mySites, setMySites] = useState<MyDeployedSite[]>([])
  const [loadingSites, setLoadingSites] = useState(true)
  const [sitesError, setSitesError] = useState('')
  const [deletingSlug, setDeletingSlug] = useState('')

  const refreshMySites = async () => {
    try {
      setSitesError('')
      const sites = await listMyDeployedSites()
      setMySites(sites)
    } catch (err) {
      setSitesError(err instanceof Error ? err.message : 'Could not load your sites.')
    } finally {
      setLoadingSites(false)
    }
  }
  useEffect(() => { void refreshMySites() }, [])

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

  // ── NAME CHECKING SYSTEM: real-time availability as the user types ──
  useEffect(() => {
    const name = pasteSlug.trim()
    if (!name || name.length < 3) {
      setNameCheck(name ? { state: 'too-short', message: 'Type at least 3 characters', suggestions: [] } : initialCheck)
      return
    }
    setNameCheck({ state: 'checking', message: 'Checking availability...', suggestions: [] })
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const data = await checkDeployName(name)
        if (data.available) {
          setNameCheck({ state: 'available', message: `✅ "${name}" is available!`, suggestions: [] })
        } else if (data.owned) {
          setNameCheck({ state: 'owned', message: data.message || `✅ "${name}" is yours — deploying will update it`, suggestions: [] })
        } else {
          setNameCheck({
            state: 'taken',
            message: data.reason || `❌ "${name}" is taken.`,
            suggestions: data.suggestions || [],
          })
        }
      } catch (err) {
        setNameCheck({ state: 'idle', message: err instanceof Error ? err.message : 'Could not check name.', suggestions: [] })
      }
    }, 400)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [pasteSlug])

  const nameIsAvailable = nameCheck.state === 'available' || nameCheck.state === 'owned'
  const isOwnedName = nameCheck.state === 'owned'
  const canDeploy = nameIsAvailable && !!pasteTitle.trim() && !!pasteHtml.trim() && !deploying

  const copyUrl = async (url?: string) => {
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleFileUpload = async (file: File | undefined) => {
    if (!file) return
    if (file.size > 900_000) { setNotice('File must be smaller than 900 KB.'); return }
    try {
      // ALWAYS read uploads as UTF-8 — prevents encoding corruption
      const text = await file.text()
      if (!pasteTitle.trim()) setPasteTitle(file.name.replace(/\.html?$/i, '').slice(0, 60))
      setPasteHtml(text)
      setNotice(`Loaded ${file.name} (${(file.size / 1024).toFixed(1)} KB).`)
    } catch {
      setNotice('Could not read that file as UTF-8 text.')
    }
  }

  const publish = async () => {
    if (!creation || publishing) return
    setPublishing(true); setNotice('Publishing...')
    try {
      const { publishCreationPath } = await import('../lib/deployCreation')
      const result = await publishCreationPath(creation, slug)
      updateCreation(creation.id, { slug: result.slug, published: true, status: 'live', deploymentUrl: result.url, pathUrl: result.url })
      setSlug(result.slug); setNotice(`Live at ${result.url}`)
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Failed.') } finally { setPublishing(false) }
  }

  const deployCode = async () => {
    if (!canDeploy) return
    setDeploying(true); setDeployResult(null); setNotice('Deploying...')
    try {
      const result = await deploySite({ name: pasteSlug, title: pasteTitle, html: pasteHtml })
      setDeployResult({ url: result.url, subdomainUrl: result.subdomainUrl, updated: result.updated }); setNotice('')
      await hydrateMissionStore(); setCreations(getCreations())
      await refreshMySites()
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Deploy failed.') } finally { setDeploying(false) }
  }

  const resetDeploy = () => {
    setPasteHtml(''); setPasteTitle(''); setPasteSlug('')
    setDeployResult(null); setNotice(''); setNameCheck(initialCheck)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const startUpdateSite = (site: MyDeployedSite) => {
    resetDeploy()
    setPasteTitle(site.title || site.name)
    setPasteSlug(site.slug)
    setNotice(`Updating "${site.name}" — upload or paste the new HTML, then press Update Live Site.`)
    deploySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const startNewSite = () => {
    resetDeploy()
    deploySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const removeSite = async (site: MyDeployedSite) => {
    if (!window.confirm(`Delete "${site.name}" permanently? The live URL will stop working.`)) return
    setDeletingSlug(site.slug)
    try {
      await deleteDeployedSite(site.slug)
      setMySites(prev => prev.filter(s => s.slug !== site.slug))
      setNotice(`"${site.name}" was deleted.`)
      if (deployResult && pasteSlug === site.slug) resetDeploy()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Delete failed.')
    } finally {
      setDeletingSlug('')
    }
  }

  const liveUrl = creation?.deploymentUrl
  const pathUrl = creation?.pathUrl || (creation?.slug ? `https://alphatekx.name.ng/app/${creation.slug}` : undefined)

  const statusColor =
    nameCheck.state === 'available' ? 'text-emerald-400'
    : nameCheck.state === 'owned' ? 'text-lime-300'
    : nameCheck.state === 'taken' ? 'text-red-400'
    : nameCheck.state === 'checking' ? 'text-white/50'
    : 'text-white/35'

  return (
    <div className="min-h-screen px-4 py-8 md:px-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold md:text-4xl">Deploy</h1>
          <p className="mt-2 text-sm text-white/55">Pick a name, paste your HTML, and go live on alphatekx.name.ng/app/.</p>
        </div>

        {notice && (
          <p role="status" className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-violet-400/20 bg-violet-500/10 p-3 text-sm">
            <span>{notice}</span>
            <button onClick={() => setNotice('')} className="shrink-0 text-white/40 hover:text-white"><X size={14} /></button>
          </p>
        )}

        {/* ── MAIN: Name check → HTML → Deploy ── */}
        <section ref={deploySectionRef} className="rounded-2xl border border-violet-400/20 liquid-glass p-6 shadow-sm md:p-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-medium text-white/70">
              App name
              <input value={pasteTitle} onChange={e => { const t = e.target.value; setPasteTitle(t); setPasteSlug(slugifyCreation(t)) }} className="field mt-2 w-full" placeholder="My portfolio" />
            </label>
            <label className="text-xs font-medium text-white/70">
              Site name (URL)
              <div className="mt-2 flex min-h-12 items-center rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 text-sm focus-within:border-[#D6FF00]/60">
                <span className="shrink-0 text-white/45">alphatekx.name.ng/app/</span>
                <input value={pasteSlug} onChange={e => setPasteSlug(slugifyCreation(e.target.value))} className="min-w-0 flex-1 bg-transparent px-1 text-zinc-100 outline-none" placeholder="my-portfolio" />
                {nameCheck.state === 'checking' && <LoaderCircle size={14} className="shrink-0 animate-spin text-white/40" />}
                {(nameCheck.state === 'available' || nameCheck.state === 'owned') && <Check size={14} className="shrink-0 text-emerald-400" />}
                {nameCheck.state === 'taken' && <X size={14} className="shrink-0 text-red-400" />}
              </div>
            </label>
          </div>

          {/* Live availability status */}
          <div aria-live="polite" className={`mt-2 min-h-5 text-xs font-medium ${statusColor}`}>
            {nameCheck.message}
            {nameCheck.state === 'taken' && nameCheck.suggestions.length > 0 && (
              <span className="ml-1 inline-flex flex-wrap items-center gap-1.5 align-middle">
                <span className="text-white/40">Try:</span>
                {nameCheck.suggestions.map(s => (
                  <button key={s} onClick={() => setPasteSlug(s)} className="rounded-full border border-[#D6FF00]/30 bg-[#D6FF00]/10 px-2 py-0.5 font-mono text-[11px] text-[#D6FF00] transition hover:bg-[#D6FF00]/20">
                    {s}
                  </button>
                ))}
              </span>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 rounded-xl border border-violet-400/20 bg-violet-500/10 px-4 py-2.5 text-xs font-medium text-zinc-100 transition hover:bg-violet-500/20">
              <Upload size={14} />
              Upload .html file
            </button>
            <input ref={fileInputRef} type="file" accept=".html,.htm,text/html" className="hidden" onChange={e => void handleFileUpload(e.target.files?.[0])} />
            <span className="text-xs text-white/35">or paste below · max 900 KB · read as UTF-8</span>
          </div>

          <label className="mt-3 block text-xs font-medium text-white/70">
            HTML code
            <textarea value={pasteHtml} onChange={e => setPasteHtml(e.target.value)} className="mt-2 min-h-64 w-full resize-y rounded-xl border border-violet-400/20 bg-violet-500/10 p-3 font-mono text-xs leading-5 text-zinc-100 outline-none focus:border-[#D6FF00]" placeholder={'<!doctype html>\n<html>\n  <head>...</head>\n  <body>...</body>\n</html>'} spellCheck={false} />
          </label>

          {/* Deploy result */}
          {deployResult && (
            <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-emerald-300"><Check size={15} /> {deployResult.updated ? 'Your site was updated!' : 'Your site is live!'}</p>
              <p className="mt-1 break-all font-mono text-xs text-emerald-300/80">{deployResult.url}</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <a href={deployResult.url} target="_blank" rel="noreferrer" className="launch-action flex-1 justify-center gap-2"><Globe size={15}/>Open site</a>
                {deployResult.subdomainUrl && <a href={deployResult.subdomainUrl} target="_blank" rel="noreferrer" className="launch-action flex-1 justify-center gap-2"><ExternalLink size={15}/>Subdomain</a>}
                <button onClick={() => void copyUrl(deployResult.url)} className="launch-action flex-1 justify-center gap-2">{copied ? <Check size={14} className="text-emerald-400"/> : <Copy size={14}/>}{copied ? 'Copied!' : 'Copy URL'}</button>
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Link to="/chat" className="launch-action flex flex-1 items-center justify-center gap-2"><MessageSquare size={15}/>Go to Chat</Link>
                <button onClick={resetDeploy} className="launch-action flex flex-1 items-center justify-center gap-2"><UploadCloud size={14}/>{deployResult.updated ? 'Deploy another update' : 'Deploy another'}</button>
              </div>
              <p className="mt-3 text-center text-[11px] text-white/35">Want to scan, fix, or restore this site later? Ask Alpha in the chat — it can redeploy updates to this same address.</p>
            </div>
          )}

          {/* Action button — locked until the name is confirmed available or owned */}
          {!deployResult && (
            <button onClick={() => void deployCode()} disabled={!canDeploy}
              title={!nameIsAvailable ? 'Pick an available name first' : undefined}
              className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl btn-alpha px-6 text-sm font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-40">
              {deploying ? <LoaderCircle className="animate-spin" size={17}/> : <UploadCloud size={17}/>}
              {deploying ? 'Deploying...' : isOwnedName ? '🚀 Update Live Site' : nameIsAvailable ? '🚀 Deploy' : 'Deploy'}
            </button>
          )}
          {!deployResult && !nameIsAvailable && (
            <p className="mt-2 text-center text-[11px] text-white/35">The deploy button unlocks once your site name is confirmed available.</p>
          )}
        </section>

        {/* ── MY DEPLOYED SITES: saved on the user's side, with update/delete/new ── */}
        <section className="mt-6 rounded-2xl border border-violet-400/20 liquid-glass p-5 shadow-sm md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">My deployed sites</h2>
              <p className="mt-1 text-xs text-white/45">Saved to your account — update, delete, or deploy a new site anytime.</p>
            </div>
            <button onClick={startNewSite} className="flex items-center gap-2 rounded-xl btn-alpha px-4 py-2.5 text-xs font-medium text-white transition-all">
              <Rocket size={14} /> Deploy new site
            </button>
          </div>

          {loadingSites && (
            <p className="mt-5 flex items-center gap-2 text-sm text-white/45"><LoaderCircle size={15} className="animate-spin" /> Loading your sites...</p>
          )}
          {!loadingSites && sitesError && (
            <p className="mt-5 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{sitesError}</p>
          )}
          {!loadingSites && !sitesError && mySites.length === 0 && (
            <p className="mt-5 rounded-xl border border-violet-400/20 bg-violet-500/5 p-4 text-sm text-white/50">
              No sites yet. Deploy your first site above and it will appear here.
            </p>
          )}
          {!loadingSites && mySites.length > 0 && (
            <ul className="mt-5 space-y-3">
              {mySites.map(site => (
                <li key={site.slug} className="rounded-xl border border-violet-400/20 bg-violet-500/5 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold">{site.title}</h3>
                      <a href={site.url} target="_blank" rel="noreferrer" className="mt-0.5 block break-all font-mono text-xs text-[#D6FF00]/80 underline-offset-2 hover:underline">
                        {site.url}
                      </a>
                      <p className="mt-1 text-[11px] text-white/35">
                        {site.updatedAt ? `Updated ${new Date(site.updatedAt).toLocaleDateString()}` : 'Just deployed'}
                        {typeof site.sizeBytes === 'number' && site.sizeBytes > 0 ? ` · ${(site.sizeBytes / 1024).toFixed(1)} KB` : ''}
                      </p>
                    </div>
                    {site.subdomainUrl && (
                      <a href={site.subdomainUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-white/45 hover:text-white">
                        <ExternalLink size={13} /> Subdomain
                      </a>
                    )}
                  </div>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <a href={site.url} target="_blank" rel="noreferrer" className="launch-action flex flex-1 items-center justify-center gap-2"><Globe size={14} /> Open</a>
                    <button onClick={() => startUpdateSite(site)} className="launch-action flex flex-1 items-center justify-center gap-2"><RefreshCw size={14} /> Update</button>
                    <button
                      onClick={() => void removeSite(site)}
                      disabled={deletingSlug === site.slug}
                      className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-medium text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                    >
                      {deletingSlug === site.slug ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      {deletingSlug === site.slug ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
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
                    <span className="hidden text-white/45 sm:inline">alphatekx.name.ng/app/</span>
                    <input value={slug} onChange={e => setSlug(slugifyCreation(e.target.value))} className="min-w-0 flex-1 bg-transparent px-1 text-zinc-100 outline-none" />
                  </div>
                  <button onClick={() => void publish()} disabled={publishing || !slug} className="flex min-h-12 items-center justify-center gap-2 rounded-xl btn-alpha px-6 text-sm font-medium text-white transition-all disabled:opacity-50">
                    {publishing ? <LoaderCircle className="animate-spin" size={16}/> : <UploadCloud size={16}/>} Publish
                  </button>
                </div>
                {liveUrl && (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                    <p className="text-sm font-medium text-emerald-300">Live</p>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <a href={pathUrl || liveUrl} target="_blank" rel="noreferrer" className="launch-action flex-1 justify-center gap-2"><Globe size={15}/>{pathUrl || liveUrl}</a>
                      {liveUrl !== pathUrl && <a href={liveUrl} target="_blank" rel="noreferrer" className="launch-action flex-1 justify-center gap-2"><ExternalLink size={15}/>Subdomain</a>}
                    </div>
                    <button onClick={() => void copyUrl(pathUrl || liveUrl)} className="launch-action mt-2 gap-2"><Copy size={14}/>Copy</button>
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

        <p className="mt-6 text-center text-xs text-white/30">
          <Link to="/chat" className="underline underline-offset-2 hover:text-white/60">Back to chat</Link>
        </p>
      </div>
    </div>
  )
}
