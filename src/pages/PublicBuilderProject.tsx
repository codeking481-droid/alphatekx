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
    getPublicBuild(slug).then(result => { if (active) setProject(result.project) }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'This build could not load.') })
    return () => { active = false }
  }, [slug])
  useEffect(() => {
    if (!project) return
    document.title = `${project.title} · Built with AlphaTekX`
    let description = document.querySelector('meta[name="description"]') as HTMLMetaElement | null
    if (!description) { description = document.createElement('meta'); description.name = 'description'; document.head.appendChild(description) }
    description.content = `Explore ${project.title}, built and deployed with AlphaTekX Builder.`
  }, [project])
  if (error) return <main className="grid min-h-screen place-items-center bg-[#0A0A0F] p-6 text-center text-white"><div><h1 className="text-2xl font-black">Build unavailable</h1><p className="mt-3 text-sm font-semibold text-white/45">{error}</p><Link to="/" className="mt-6 inline-flex rounded-xl bg-violet-600 px-5 py-3 font-black">Visit AlphaTekX</Link></div></main>
  if (!project) return <main className="grid min-h-screen place-items-center bg-[#0A0A0F] text-sm font-black text-violet-300">Loading AlphaTekX build…</main>
  return <main className="fixed inset-0 bg-[#0A0A0F]"><iframe title={project.title} sandbox="allow-scripts allow-forms allow-modals" srcDoc={source} className="h-full w-full border-0 bg-white" referrerPolicy="no-referrer"/><Link to={`/builder?remix=${encodeURIComponent(project.slug||slug)}`} className="fixed bottom-4 right-4 z-20 rounded-full border border-white/15 bg-[#0A0A0F]/90 px-4 py-3 text-xs font-black text-white shadow-2xl backdrop-blur-xl transition hover:-translate-y-0.5">Remix this app with Alpha</Link></main>
}
