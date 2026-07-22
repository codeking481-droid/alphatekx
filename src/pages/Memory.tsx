import { useEffect, useState } from 'react'
import { Brain, Database, Folder, Palette, Rocket, Server, ShieldCheck } from 'lucide-react'
import { readMemory, type CompanyMemory } from '../lib/companyMemory'

export default function Memory() {
  const [memory, setMemory] = useState<CompanyMemory>(() => readMemory())

  useEffect(() => {
    const handler = () => setMemory(readMemory())
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  return (
    <div className="min-h-screen px-5 py-8 md:px-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold">Company Memory</h1>
          <p className="mt-2 text-sm text-white/55">Everything Alpha has learned about your projects, systems, and brand.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <section className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 backdrop-blur-2xl">
            <div className="flex items-center gap-2 text-sm font-semibold"><Folder size={16} /> Projects</div>
            {memory.projects.length === 0 && <p className="mt-3 text-sm text-white/40">No projects stored yet. Start a mission to build your memory.</p>}
            <div className="mt-3 space-y-2">
              {memory.projects.slice(0, 10).map(p => (
                <div key={p.id} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
                  <div className="text-sm font-medium">{p.title}</div>
                  <div className="mt-1 text-xs text-white/55">{p.goal}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.systems.map(s => <span key={s} className="rounded-md bg-white/[0.08] px-2 py-1 text-[10px] text-zinc-300">{s}</span>)}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 backdrop-blur-2xl">
            <div className="flex items-center gap-2 text-sm font-semibold"><Server size={16} /> Architecture learned</div>
            {memory.architecture.length === 0 && <p className="mt-3 text-sm text-white/40">Alpha will record patterns from every build.</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {memory.architecture.map(a => <span key={a} className="flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-2 text-xs text-zinc-300"><Database size={13} /> {a}</span>)}
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 backdrop-blur-2xl md:col-span-2">
            <div className="flex items-center gap-2 text-sm font-semibold"><Palette size={16} /> Brand system</div>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <ColorSwatch label="Primary" value={memory.brand.primary} />
              <ColorSwatch label="Accent" value={memory.brand.accent} />
              <ColorSwatch label="Surface" value={memory.brand.surface} />
              <ColorSwatch label="Text" value={memory.brand.text} />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function ColorSwatch({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
      <div className="text-xs text-white/55">{label}</div>
      <div className="mt-2 flex items-center gap-2">
        <span className="h-6 w-6 rounded-full border border-white/10" style={{ background: value }} />
        <span className="font-mono text-xs">{value}</span>
      </div>
    </div>
  )
}
