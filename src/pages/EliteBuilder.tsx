import { useEffect, useMemo, useState } from 'react'
import { Check, Code2, Copy, ExternalLink, Eye, History, Image, LoaderCircle, Monitor, MousePointer2, Rocket, Sparkles, WandSparkles } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { BUILDER_COST, BUILDER_SLUG, builderSrcDoc, deployBuild, editBuild, fixBuild, generateBuild, getPublicBuild, listBuilds, requestBuilderDomain, type BuilderProject } from '../lib/eliteBuilder'
import { getCredits, setCredits } from '../lib/creditStore'
import { listMedia, type MediaItem } from '../lib/mediaLibrary'

const templates = [
  ['SaaS Landing', 'A conversion-focused SaaS landing page with product demo, social proof, pricing, FAQ and waitlist'],
  ['Portfolio', 'A premium creative portfolio with case studies, services, testimonials and contact form'],
  ['E-commerce', 'A luxury Lagos fashion store with collections, filters, cart and polished checkout experience'],
  ['Dashboard', 'A modern operations dashboard with metrics, charts, tasks, customers and useful filters'],
  ['AI App', 'An elegant AI workspace with conversations, prompt library, usage metrics and responsive sidebar'],
  ['Calculator', 'A beautiful interactive business calculator with editable inputs, breakdown and saved scenarios'],
  ['Waitlist', 'A viral product waitlist with referral progress, benefits, social proof and launch countdown'],
  ['Fashion OS', 'A complete Nigerian fashion business operating system with orders, measurements, inventory and customer follow-up'],
  ['Restaurant', 'A premium Lagos restaurant experience with menu, reservation, cart and order-success flow'],
  ['Creator Hub', 'A creator command centre with content calendar, campaign analytics, media vault and sponsor pipeline'],
] as const

type Tab = 'preview' | 'code' | 'deploy'

export default function EliteBuilder() {
  const [prompt, setPrompt] = useState('')
  const [project, setProject] = useState<BuilderProject | null>(null)
  const [code, setCode] = useState('')
  const [history, setHistory] = useState<BuilderProject[]>([])
  const [tab, setTab] = useState<Tab>('preview')
  const [slug, setSlug] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [notice, setNotice] = useState('')
  const [previewError, setPreviewError] = useState('')
  const [copied, setCopied] = useState(false)
  const [publicUrl, setPublicUrl] = useState('')
  const [selectMode, setSelectMode] = useState(false)
  const [selectedElement, setSelectedElement] = useState('')
  const [repairCount, setRepairCount] = useState(0)
  const [mediaOpen, setMediaOpen] = useState(false)
  const [media, setMedia] = useState<MediaItem[]>([])
  const [domain, setDomain] = useState('')
  const [domainHelp, setDomainHelp] = useState('')
  const [searchParams] = useSearchParams()
  const credits = getCredits()

  const preview = useMemo(() => builderSrcDoc(code, project?.title, { slug: project?.slug || 'preview', selectMode }), [code, project?.title, project?.slug, selectMode])
  const slugValid = BUILDER_SLUG.test(slug)

  const refreshHistory = async () => {
    setLoadingHistory(true)
    try { setHistory((await listBuilds()).projects || []) }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Build history could not load.') }
    finally { setLoadingHistory(false) }
  }

  useEffect(() => { void refreshHistory() }, [])
  useEffect(() => {
    const remix = searchParams.get('remix')
    if (!remix) return
    getPublicBuild(remix).then(({ project: source }) => {
      setPrompt(`Remix ${source.title} with a distinct visual identity and preserve its useful interactions.`)
      setCode(source.code); setProject(null); setNotice('Remix loaded. Describe your changes, then build a new private copy.')
    }).catch(() => setNotice('The remix source could not be loaded.'))
  }, [searchParams])
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.data?.source !== 'alphatekx-builder') return
      if (event.data.type === 'error') setPreviewError(String(event.data.message || 'Preview could not render.'))
      if (event.data.type === 'ready') setPreviewError('')
      if (event.data.type === 'element-clicked') { setSelectedElement(String(event.data.html || '')); setNotice(`You selected <${String(event.data.tag || 'element').toLowerCase()}>. Describe what should change.`) }
    }
    window.addEventListener('message', listener)
    return () => window.removeEventListener('message', listener)
  }, [])

  const build = async () => {
    const value = prompt.trim()
    if (value.length < 8) { setNotice('Describe the product and who it is for so Alpha can build it properly.'); return }
    if (credits < BUILDER_COST) { setNotice('You need 2 credits for a verified build. Buy credits to continue.'); return }
    setBusy(true); setNotice(''); setPreviewError(''); setPublicUrl('')
    try {
      const requestId = crypto.randomUUID()
      const result = await generateBuild(value, requestId)
      setProject(result.project)
      setCode(result.code)
      setSlug((result.project.title || 'alpha-build').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30))
      if (typeof result.credits === 'number') setCredits(result.credits)
      setTab('preview')
      setNotice(`Build complete with ${result.provider}. Two credits were charged after verification.`)
      await refreshHistory()
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Alpha is resting. Retry this build in a moment.') }
    finally { setBusy(false) }
  }

  const deploy = async () => {
    if (!project || !slugValid || busy) return
    setBusy(true); setNotice('')
    try {
      const result = await deployBuild(project.id, slug)
      setProject(result.project)
      setPublicUrl(result.publicUrl)
      setNotice('Your AlphaTekX build is live.')
      await refreshHistory()
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Deployment could not be completed.') }
    finally { setBusy(false) }
  }

  const revise = async (instruction = prompt) => {
    if (!project || instruction.trim().length < 3 || busy) return
    setBusy(true); setNotice('')
    try {
      const targeted = selectedElement ? `${instruction}\nSelected element: ${selectedElement}` : instruction
      const result = await editBuild(project.id, targeted)
      setProject(result.project); setCode(result.code); setPrompt(''); setSelectedElement(''); setTab('preview')
      setNotice(`Edit verified with ${result.provider}.`)
      await refreshHistory()
    } catch (error) { setNotice(error instanceof Error ? error.message : 'The edit could not be verified. Your current build is unchanged.') }
    finally { setBusy(false) }
  }

  useEffect(() => {
    if (!previewError || !project || repairCount >= 3 || busy) return
    const timer = window.setTimeout(async () => {
      setBusy(true); setNotice(`Alpha detected a runtime issue. Auto-repair ${repairCount + 1}/3…`)
      try {
        const result = await fixBuild(project.id, previewError)
        setProject(result.project); setCode(result.code); setPreviewError(''); setRepairCount(value=>value+1)
      } catch (error) { setRepairCount(value=>value+1); setNotice(error instanceof Error ? error.message : 'Auto-repair could not verify a safe change.') }
      finally { setBusy(false) }
    }, 700)
    return () => window.clearTimeout(timer)
  }, [previewError, project?.id, repairCount, busy])

  const openMedia = async () => {
    setMediaOpen(true)
    try { setMedia((await listMedia()).items.filter(item=>item.file_type==='image' && item.file_url)) }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Media Library could not load.') }
  }

  const useMedia = async (item: MediaItem) => {
    setMediaOpen(false)
    await revise(`Use this verified Media Library image prominently and preserve its exact URL: ${item.file_url}. Give it accessible alt text based on "${item.title || item.file_name}".`)
  }

  const configureDomain = async () => {
    if (!project || !domain.trim()) return
    try {
      const result = await requestBuilderDomain(project.id, domain)
      setDomainHelp(`Add TXT ${result.verification.name} = ${result.verification.value}. Alpha activates it only after DNS ownership is verified and the domain is mapped in Render.`)
    } catch (error) { setDomainHelp(error instanceof Error ? error.message : 'Domain setup could not start.') }
  }

  const downloadFile = (name: string, content: string, type = 'text/plain') => {
    const url = URL.createObjectURL(new Blob([content], { type }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click()
    window.setTimeout(()=>URL.revokeObjectURL(url), 500)
  }

  const exportSource = () => project && downloadFile(`${slug || 'alpha-build'}-App.jsx`, code, 'text/javascript')
  const exportPwa = () => project && downloadFile('manifest.webmanifest', JSON.stringify({ name: project.title, short_name: project.title.slice(0, 12), start_url: publicUrl || `/b/${slug}`, display: 'standalone', background_color: '#0A0A0F', theme_color: '#7C3AED', icons: [] }, null, 2), 'application/manifest+json')

  const selectProject = (item: BuilderProject) => {
    setProject(item); setPrompt(item.prompt); setCode(item.code || ''); setSlug(item.slug?.startsWith('draft-') ? '' : (item.slug || ''))
    setPublicUrl(item.public_url || ''); setTab('preview'); setNotice(''); setPreviewError('')
  }

  const copyCode = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true); window.setTimeout(() => setCopied(false), 1400)
  }

  return <div className="min-h-[calc(100dvh-4rem)] bg-[#0A0A0F] px-3 py-4 text-[#E9E7FF] sm:px-5 lg:px-7">
    <div className="mx-auto max-w-[1600px]">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#111119] px-5 py-4 shadow-2xl shadow-black/20">
        <div><div className="flex items-center gap-2"><WandSparkles className="text-violet-400" size={19}/><h1 className="text-xl font-black">Builder V2</h1><span className="rounded-full bg-violet-500/15 px-2 py-1 text-[9px] font-black tracking-wider text-violet-300">10×</span></div><p className="mt-1 text-xs font-semibold text-white/45">Built with AlphaTekX Builder · full-stack, self-healing and deployable</p></div>
        <div className="rounded-xl border border-violet-400/20 bg-violet-500/10 px-3.5 py-2 text-sm font-black text-violet-200">{credits} Credits</div>
      </header>

      <div className="grid min-h-[720px] overflow-hidden rounded-3xl border border-white/10 bg-[#111119] shadow-[0_30px_90px_rgba(0,0,0,.38)] lg:grid-cols-[minmax(310px,35%)_1fr]">
        <aside className="flex min-h-0 flex-col border-b border-white/10 bg-[#101017] lg:border-b-0 lg:border-r">
          <div className="space-y-5 p-4 sm:p-5">
            <div><label htmlFor="builder-prompt" className="text-xs font-black uppercase tracking-[.16em] text-white/45">{project?'Chat to edit':'What should Alpha build?'}</label>{selectedElement&&<p className="mt-2 rounded-lg bg-cyan-400/10 p-2 text-[10px] font-bold text-cyan-200">Element selected. Tell Alpha how it should change.</p>}<textarea id="builder-prompt" value={prompt} onChange={event=>setPrompt(event.target.value)} onKeyDown={event=>{if((event.metaKey||event.ctrlKey)&&event.key==='Enter'){event.preventDefault();project?void revise():void build()}}} rows={7} placeholder={project?'Try “make the navbar glassy”, “change the accent to pink”, or “add a checkout drawer”…':'Describe what you want to build… e.g. A luxury thrift fashion landing page for Lagos girls with shop, cart and checkout.'} className="mt-3 w-full resize-none rounded-2xl border border-white/10 bg-[#1A1A23] p-4 text-sm font-semibold leading-6 text-white outline-none placeholder:text-white/25 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"/></div>
            <div><p className="mb-2 text-[10px] font-black uppercase tracking-[.16em] text-white/35">Elite templates</p><div className="flex flex-wrap gap-2">{templates.map(([label,value])=><button key={label} onClick={()=>setPrompt(value)} className="rounded-full border border-white/10 bg-white/[.035] px-3 py-2 text-[11px] font-bold text-white/65 transition hover:border-violet-400/40 hover:bg-violet-500/10 hover:text-white">{label}</button>)}</div></div>
            <button onClick={()=>project?void revise():void build()} disabled={busy||prompt.trim().length<(project?3:8)||(!project&&credits<BUILDER_COST)} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#7C3AED] px-5 text-sm font-black text-white shadow-xl shadow-violet-950/35 transition hover:-translate-y-0.5 hover:bg-violet-500 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45">{busy?<><LoaderCircle className="animate-spin" size={18}/>Alpha is engineering…</>:<><Sparkles size={18}/>{project?'Apply verified edit':'Build with Alpha'} <span className="text-white/55">⌘↵</span></>}</button>
            <div className="grid grid-cols-2 gap-2"><button disabled={!project} onClick={()=>setSelectMode(value=>!value)} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border text-xs font-black disabled:opacity-30 ${selectMode?'border-cyan-300 bg-cyan-400/15 text-cyan-200':'border-white/10 bg-white/[.035] text-white/60'}`}><MousePointer2 size={15}/>{selectMode?'Select mode on':'Click to edit'}</button><button disabled={!project} onClick={()=>void openMedia()} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[.035] text-xs font-black text-white/60 disabled:opacity-30"><Image size={15}/>Use My Media</button></div>
            <div className="flex items-center justify-between text-[11px] font-bold text-white/40"><span>{project?'Edits preserve the current app':'Verified build'}</span><span>{project?'No rebuild':'2 credits'}</span></div>
            {notice&&<p className="rounded-xl border border-violet-400/15 bg-violet-500/10 p-3 text-xs font-semibold leading-5 text-violet-100">{notice}</p>}
          </div>
          <div className="min-h-0 flex-1 border-t border-white/10 p-4 sm:p-5"><div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[.14em] text-white/45"><History size={14}/>My builds</div><div className="max-h-64 space-y-2 overflow-y-auto pr-1 lg:max-h-[360px]">{loadingHistory?<div className="h-16 animate-pulse rounded-xl bg-white/5"/>:history.length===0?<p className="rounded-xl border border-dashed border-white/10 p-4 text-xs font-semibold text-white/30">Your verified builds will appear here.</p>:history.map(item=><button key={item.id} onClick={()=>selectProject(item)} className={`w-full rounded-xl border p-3 text-left transition ${project?.id===item.id?'border-violet-500/50 bg-violet-500/10':'border-white/5 bg-white/[.025] hover:bg-white/5'}`}><span className="block truncate text-xs font-black text-white/85">{item.title}</span><span className="mt-1 flex items-center justify-between text-[10px] font-semibold text-white/35"><span>{item.provider||'Alpha'}</span><span>{item.published?'Live':'Draft'}</span></span></button>)}</div></div>
        </aside>

        <section className="flex min-h-[620px] min-w-0 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#12121B] px-3 py-3 sm:px-4"><div className="flex rounded-xl border border-white/10 bg-black/20 p-1">{([['preview','Preview',Eye],['code','Code',Code2],['deploy','Deploy',Rocket]] as const).map(([id,label,Icon])=><button key={id} onClick={()=>setTab(id)} className={`flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-black transition ${tab===id?'bg-white/10 text-white':'text-white/40 hover:text-white/75'}`}><Icon size={14}/>{label}</button>)}</div>{project&&<span className="max-w-[220px] truncate text-xs font-bold text-white/35">{project.title}</span>}</div>

          <div className="relative min-h-0 flex-1 bg-[#09090E]">
            {!code&&<div className="absolute inset-0 grid place-items-center p-8 text-center"><div><span className="mx-auto grid size-16 place-items-center rounded-2xl border border-violet-400/20 bg-violet-500/10 text-violet-300"><Monitor size={28}/></span><h2 className="mt-5 text-xl font-black">Your live build appears here</h2><p className="mx-auto mt-2 max-w-sm text-sm font-semibold leading-6 text-white/35">Choose a template or describe your idea. Alpha will generate a verified, interactive React experience.</p></div></div>}
            {code&&tab==='preview'&&<div className="absolute inset-0 p-2 sm:p-3">{previewError&&<div className="absolute inset-x-4 top-4 z-10 rounded-xl border border-rose-400/20 bg-rose-950/90 p-3 text-xs font-bold text-rose-200">Preview issue: {previewError}</div>}<iframe title="Builder live preview" sandbox="allow-scripts allow-forms allow-modals" srcDoc={preview} className="h-full min-h-[580px] w-full rounded-xl border border-white/10 bg-white" referrerPolicy="no-referrer"/></div>}
            {code&&tab==='code'&&<div className="absolute inset-0 flex flex-col p-3"><div className="flex items-center justify-between rounded-t-xl border border-white/10 bg-[#15151F] px-4 py-3"><span className="flex items-center gap-2 text-xs font-bold text-white/45"><Code2 size={14}/>App.jsx</span><button onClick={()=>void copyCode()} className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-xs font-black hover:bg-white/10">{copied?<Check size={14}/>:<Copy size={14}/>} {copied?'Copied':'Copy'}</button></div><pre className="min-h-0 flex-1 overflow-auto rounded-b-xl border-x border-b border-white/10 bg-[#0B0B11] p-5 text-xs leading-6 text-cyan-100"><code>{code}</code></pre></div>}
            {code&&tab==='deploy'&&<div className="absolute inset-0 overflow-y-auto p-5 sm:p-8"><div className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-[#1A1A23] p-5 shadow-2xl sm:p-8"><span className="grid size-12 place-items-center rounded-2xl bg-violet-500/15 text-violet-300"><Rocket size={22}/></span><h2 className="mt-5 text-2xl font-black">Super Deploy</h2><p className="mt-2 text-sm font-semibold leading-6 text-white/40">Deploy, export, add a verified domain, or package the app as a PWA.</p><label className="mt-6 block text-xs font-black uppercase tracking-wider text-white/45">Public address</label><div className="mt-2 flex rounded-xl border border-white/10 bg-black/20 focus-within:border-violet-500"><span className="hidden items-center pl-4 text-xs font-bold text-white/30 sm:flex">alphatekx.name.ng/b/</span><input value={slug} onChange={event=>setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g,''))} maxLength={30} className="min-h-12 min-w-0 flex-1 bg-transparent px-4 text-sm font-black text-white outline-none" placeholder="my-app"/></div>{slug&&!slugValid&&<p className="mt-2 text-xs font-semibold text-amber-300">Use 3–30 lowercase letters, numbers, or hyphens.</p>}<button onClick={()=>void deploy()} disabled={!project||!slugValid||busy} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#7C3AED] font-black text-white disabled:opacity-40">{busy?<LoaderCircle className="animate-spin" size={17}/>:<Rocket size={17}/>}Deploy to AlphaTekX</button><div className="mt-3 grid grid-cols-2 gap-2"><button onClick={exportSource} className="min-h-11 rounded-xl border border-white/10 bg-white/5 text-xs font-black">Export source</button><button onClick={exportPwa} className="min-h-11 rounded-xl border border-white/10 bg-white/5 text-xs font-black">Make it a PWA</button></div><div className="mt-6 border-t border-white/10 pt-5"><label className="text-xs font-black uppercase tracking-wider text-white/45">Custom domain</label><div className="mt-2 flex gap-2"><input value={domain} onChange={event=>setDomain(event.target.value)} placeholder="app.yourbrand.com" className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 text-sm outline-none"/><button onClick={()=>void configureDomain()} className="rounded-xl bg-white/10 px-4 text-xs font-black">Verify</button></div>{domainHelp&&<p className="mt-2 break-words text-[11px] font-semibold leading-5 text-cyan-200">{domainHelp}</p>}</div>{publicUrl&&<div className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4"><div className="flex flex-col items-center gap-4 sm:flex-row"><img alt="QR code for deployed build" className="size-24 rounded-lg bg-white p-1" src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(publicUrl)}`}/><div className="min-w-0 flex-1"><p className="text-xs font-black text-emerald-300">Live now · {project?.views||0} views</p><a href={publicUrl} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 truncate text-sm font-bold text-white hover:text-violet-300">{publicUrl}<ExternalLink size={14}/></a></div></div></div>}</div></div>}
          </div>
        </section>
      </div>
      {mediaOpen&&<div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-4" onClick={()=>setMediaOpen(false)}><section className="max-h-[80vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/10 bg-[#111119] p-5" onClick={event=>event.stopPropagation()}><div className="flex items-center justify-between"><div><h2 className="text-lg font-black">Use My Media</h2><p className="text-xs font-semibold text-white/40">Choose an image and Alpha will integrate it into the current design.</p></div><button onClick={()=>setMediaOpen(false)} className="rounded-xl bg-white/5 px-3 py-2 text-xs font-black">Close</button></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">{media.length?media.map(item=><button key={item.id} onClick={()=>void useMedia(item)} className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 text-left"><img src={item.file_url||''} alt={item.title||item.file_name} className="aspect-square w-full object-cover"/><span className="block truncate p-3 text-xs font-black">{item.title||item.file_name}</span></button>):<p className="col-span-full rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-white/40">No previewable images are in your Media Library yet.</p>}</div></section></div>}
    </div>
  </div>
}
