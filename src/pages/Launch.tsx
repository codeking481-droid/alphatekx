import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Download, ExternalLink, LoaderCircle, RotateCcw, Server, Ship, UploadCloud } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { publishCreationPath, slugifyCreation } from '../lib/deployCreation'
import { exportCreationZip } from '../lib/exportCreation'
import { getCreations, rollbackCreation, subscribeStore, updateCreation } from '../lib/missionStore'

const stages = ['Idea', 'Plan', 'Build', 'Test', 'Deploy', 'Live']
const envTemplate = '# Project environment\nVITE_SUPABASE_URL=\nVITE_SUPABASE_ANON_KEY=\n'

export default function Launch() {
  const [creations, setCreations] = useState(getCreations())
  const [selected, setSelected] = useState('')
  const [notice, setNotice] = useState('')
  const [domain, setDomain] = useState('')
  const [slug, setSlug] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [searchParams] = useSearchParams()

  useEffect(() => subscribeStore(() => setCreations(getCreations())), [])
  useEffect(() => {
    if (selected) return
    const requested = searchParams.get('creation')
    if (requested && creations.some(item => item.id === requested)) setSelected(requested)
    else if (creations[0]) setSelected(creations[0].id)
  }, [creations, searchParams, selected])
  const creation = creations.find(item => item.id === selected)
  useEffect(() => {
    setDomain(creation?.customDomain ?? '')
    setSlug(creation?.slug ?? slugifyCreation(creation?.title ?? 'my-app'))
    setNotice('')
  }, [creation?.id])

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
      updateCreation(creation.id, { slug: result.slug, published: true, status: 'live', deploymentUrl: result.url })
      setSlug(result.slug)
      setNotice(`Your app is live at ${result.url}`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Publication failed.')
    } finally {
      setPublishing(false)
    }
  }
  const copyLiveUrl = async () => {
    if (!creation?.deploymentUrl) return
    await navigator.clipboard.writeText(creation.deploymentUrl)
    setNotice('Live URL copied.')
  }
  const saveDomain = () => {
    if (!creation) return
    updateCreation(creation.id, { customDomain: domain })
    setNotice('Custom domain preference saved. DNS connection will be added in the subdomain phase.')
  }

  return <div className="min-h-screen px-5 py-8 md:px-10"><div className="mx-auto max-w-6xl">
    <h1 className="text-xl font-semibold md:text-2xl">Launch</h1>
    <p className="mt-2 text-sm text-gray-500">Publish a finished creation to a real AlphaTekX path.</p>
    <div className="mt-7 grid grid-cols-3 gap-2 lg:grid-cols-6">{stages.map(stage => <div key={stage} className="flex min-h-14 items-center gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm"><span className="grid size-6 place-items-center rounded-full bg-gray-100"><Check size={13}/></span><span className="text-xs">{stage}</span></div>)}</div>
    <section className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <select value={selected} onChange={event => setSelected(event.target.value)} className="field"><option value="">Choose a creation</option>{creations.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
      {creation ? <div className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">{creation.title}</h2><p className="mt-1 text-sm text-gray-500">{creation.files.length} files</p></div><span className="rounded-full bg-gray-100 px-3 py-1 text-xs capitalize">{creation.status}</span></div>
        {notice && <p role="status" className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">{notice}</p>}

        <div className="mt-6 rounded-xl border border-gray-200 p-5">
          <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-black text-white"><UploadCloud size={18}/></span><div><h3 className="text-sm font-semibold">Publish on AlphaTekX</h3><p className="mt-1 text-xs text-gray-500">Your app will be available at alphatekx.name.ng/app/your-slug.</p></div></div>
          <label className="mt-5 block text-xs font-medium text-gray-600" htmlFor="creation-slug">App address</label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row"><div className="flex min-h-11 min-w-0 flex-1 items-center rounded-lg border border-gray-300 bg-gray-50 px-3 text-sm"><span className="hidden text-gray-400 sm:inline">alphatekx.name.ng/app/</span><input id="creation-slug" value={slug} onChange={event => setSlug(slugifyCreation(event.target.value))} className="min-w-0 flex-1 bg-transparent outline-none" aria-label="Published app slug"/></div><button onClick={() => void publish()} disabled={publishing || !slug} className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-black px-5 text-sm font-medium text-white disabled:opacity-50">{publishing ? <LoaderCircle className="animate-spin" size={16}/> : <UploadCloud size={16}/>} {creation.deploymentUrl ? 'Republish' : 'Publish'}</button></div>
          {creation.deploymentUrl && <div className="mt-3 flex flex-wrap gap-2"><a href={creation.deploymentUrl} target="_blank" rel="noreferrer" className="launch-action"><ExternalLink size={15}/>Open live app</a><button onClick={() => void copyLiveUrl()} className="launch-action"><Copy size={15}/>Copy URL</button></div>}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><button onClick={() => void exportCreationZip(creation)} className="launch-action"><Download size={16}/>Project ZIP</button><button onClick={() => void handoff('Vercel')} className="launch-action"><ExternalLink size={16}/>Vercel</button><button onClick={() => void handoff('Render')} className="launch-action"><Server size={16}/>Render</button><button onClick={() => void handoff('Docker')} className="launch-action"><Ship size={16}/>Docker</button></div>
        <button onClick={() => void copyEnv()} className="launch-action mt-3"><Copy size={16}/>Copy environment template</button>
        <div className="mt-7 grid gap-4 lg:grid-cols-2"><div className="rounded-xl border border-gray-200 p-5"><h3 className="text-sm font-semibold">Database tables</h3><p className="mt-2 text-xs text-gray-500">Suggested tables for this creation.</p><div className="mt-4 flex flex-wrap gap-2">{tables.map(table => <span key={table} className="rounded-md bg-gray-100 px-3 py-2 font-mono text-xs">{table}</span>)}</div></div><div className="rounded-xl border border-gray-200 p-5"><h3 className="text-sm font-semibold">Custom domain</h3><div className="mt-4 flex gap-2"><input value={domain} onChange={event => setDomain(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-lg border border-gray-300 px-3 text-sm" placeholder="app.yourdomain.com"/><button onClick={saveDomain} className="rounded-lg bg-black px-4 text-sm font-medium text-white">Save</button></div></div></div>
        <h3 className="mt-7 text-sm font-semibold">Version history</h3><div className="mt-3 space-y-2">{(creation.versions ?? []).slice().reverse().map(version => <div key={version.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 p-4"><div><p className="text-sm font-medium">{version.label}</p><p className="mt-1 text-xs text-gray-500">{new Date(version.createdAt).toLocaleString()}</p></div><button onClick={() => { rollbackCreation(creation.id, version.id); setNotice(`Restored ${version.label}.`) }} className="flex min-h-10 items-center gap-2 rounded-lg border border-gray-300 px-3 text-xs"><RotateCcw size={14}/>Restore</button></div>)}</div>
      </div> : <div className="mt-6 rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">Build a mission first, then return here to launch it.</div>}
    </section>
  </div></div>
}
