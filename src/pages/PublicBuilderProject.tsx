import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { builderSrcDoc, getPublicBuild, type BuilderProject } from '../lib/eliteBuilder'

export default function PublicBuilderProject() {
  const { slug = '' } = useParams()
  const [project, setProject] = useState<(BuilderProject & { code: string }) | null>(null)
  const [error, setError] = useState('')
  const source = useMemo(() => project ? builderSrcDoc(project.code, project.title) : '', [project])

  useEffect(() => {
    let active = true
    getPublicBuild(slug)
      .then(result => { if (active) setProject(result.project) })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'This app could not load.') })
    return () => { active = false }
  }, [slug])

  useEffect(() => {
    if (!project) return
    document.title = `${project.title} · Built with AlphaTekX`
    let description = document.querySelector('meta[name="description"]') as HTMLMetaElement | null
    if (!description) {
      description = document.createElement('meta')
      description.name = 'description'
      document.head.appendChild(description)
    }
    description.content = `Explore ${project.title}, built and deployed with AlphaTekX Builder.`
  }, [project])

  if (error) return <main className="grid min-h-screen place-items-center bg-[#0A0A0F] p-6 text-center text-white"><div><h1 className="text-2xl font-black">App not found</h1><p className="mt-3 text-sm font-semibold text-white/45">{error}</p><Link to="/builder" className="mt-6 inline-flex rounded-xl bg-violet-600 px-5 py-3 font-black">Go to Builder</Link></div></main>
  if (!project) return <main className="grid min-h-screen place-items-center bg-[#0A0A0F] text-white"><div className="text-center"><span className="mx-auto block size-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent"/><p className="mt-4 text-sm font-semibold text-white/55">Loading {slug}…</p></div></main>

  return <main className="fixed inset-0 flex min-h-0 flex-col bg-[#0A0A0F]">
    <header className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-white/[.06] bg-[#1A1A23] px-3 text-[10px] text-white/50 sm:px-4 sm:text-xs">
      <div className="flex min-w-0 items-center gap-1.5"><span className="hidden sm:inline">Built with</span><strong className="truncate font-black text-violet-300">AlphaTekX Builder V3</strong><span>·</span><span className="shrink-0">{project.views || 0} views</span></div>
      <Link to={`/builder?remix=${encodeURIComponent(project.slug || slug)}`} className="shrink-0 rounded-full bg-white px-3 py-1.5 font-black text-[#0A0A0F] transition hover:bg-white/90">Remix this app</Link>
    </header>
    <iframe title={project.title} sandbox="allow-scripts allow-forms allow-modals" srcDoc={source} className="min-h-0 w-full flex-1 border-0 bg-white" referrerPolicy="no-referrer"/>
  </main>
}
