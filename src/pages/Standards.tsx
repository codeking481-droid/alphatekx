import { Check, ShieldCheck } from 'lucide-react'

const standards = [
  'Every app uses liquid-glass design: bg-white/10, backdrop-blur-xl, border-white/20, rounded-2xl.',
  'Every button, form, and screen has loading, error, empty, and success states.',
  'All generated apps are responsive and work on mobile, tablet, and desktop.',
  'User data is persisted locally where appropriate and never sent to untrusted endpoints.',
  'No external imports in generated code beyond React, Tailwind, and standard browser APIs.',
  'Quality gates must pass before any app is published to a subdomain.',
  'Every mission produces a clarified Blueprint: Mission, Users, Systems, Roadmap.',
]

export default function Standards() {
  return (
    <div className="min-h-screen px-5 py-8 md:px-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center gap-3">
          <ShieldCheck size={24} className="text-emerald-500" />
          <h1 className="text-2xl font-semibold">Alpha Standards</h1>
        </div>
        <p className="text-sm text-white/55">These principles guide every mission Alpha engineers.</p>
        <div className="mt-6 space-y-3">
          {standards.map((standard, i) => (
            <div key={i} className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.05] p-4 backdrop-blur-2xl">
              <span className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-emerald-500/10 text-emerald-500"><Check size={12} /></span>
              <span className="text-sm leading-relaxed text-zinc-300">{standard}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
