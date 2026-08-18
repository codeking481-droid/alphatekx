import { motion } from 'framer-motion'
import { ShieldAlert, CheckCircle2, ArrowRight, Camera, Loader2 } from 'lucide-react'
import { useState, useEffect } from 'react'

export type ProofData = {
  before: { url: string; status: number; lcp: string; errors: number; tech: string }
  after: { url: string; status: number; lcp: string; errors: number; tech: string; previewUrl: string }
  scanId: string
  fixesCount: number
  beforeScreenshot?: string
  afterScreenshot?: string
}

export default function GoldProofCard({ data }: { data: ProofData }) {
  const [tab, setTab] = useState<'broken' | 'restored'>('broken')

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-2xl border border-[#FFD700]/25 bg-gradient-to-br from-[#FFD700]/[0.08] via-[#0A0A0A] to-[#0A0A0A]"
      style={{ boxShadow: '0 0 40px rgba(255,215,0,0.08)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[#FFD700]/15 px-3 py-3 sm:px-5 sm:py-4">
        <div className="grid size-8 sm:size-10 place-items-center rounded-xl bg-[#FFD700]/10 shrink-0">
          <CheckCircle2 size={16} className="text-[#FFD700]" />
        </div>
        <div className="min-w-0">
          <h4 className="text-[12px] sm:text-sm font-black uppercase tracking-wide text-[#FFD700]">PROOF: BROKEN vs RESTORED</h4>
          <p className="mt-0.5 text-[10px] sm:text-[11px] text-white/40">{data.fixesCount} fix(es) applied</p>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-white/[0.04]">
        <button
          onClick={() => setTab('broken')}
          className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[10px] sm:text-[11px] font-bold uppercase tracking-widest transition ${
            tab === 'broken' ? 'border-b-2 border-red-400 text-red-400' : 'text-white/20 hover:text-white/40'
          }`}
        >
          <ShieldAlert size={11} />
          Broken
        </button>
        <button
          onClick={() => setTab('restored')}
          className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[10px] sm:text-[11px] font-bold uppercase tracking-widest transition ${
            tab === 'restored' ? 'border-b-2 border-[#D6FF00] text-[#D6FF00]' : 'text-white/20 hover:text-white/40'
          }`}
        >
          <CheckCircle2 size={11} />
          Restored
        </button>
      </div>

      {/* Content */}
      {tab === 'broken' ? (
        <div className="px-3 py-3 sm:px-5 sm:py-4">
          <div className="mb-3 flex items-center gap-2">
            <ShieldAlert size={12} className="text-red-400" />
            <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-red-400">BROKEN</span>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-lg bg-red-500/[0.06] px-2 py-2 text-center sm:px-3">
              <p className="text-[9px] sm:text-[10px] text-white/30">Status</p>
              <p className="mt-0.5 text-base sm:text-lg font-black text-red-400">{data.before.status || '---'}</p>
            </div>
            <div className="rounded-lg bg-red-500/[0.06] px-2 py-2 text-center sm:px-3">
              <p className="text-[9px] sm:text-[10px] text-white/30">LCP</p>
              <p className="mt-0.5 text-base sm:text-lg font-black text-red-400">{data.before.lcp}</p>
            </div>
            <div className="rounded-lg bg-red-500/[0.06] px-2 py-2 text-center sm:px-3">
              <p className="text-[9px] sm:text-[10px] text-white/30">Errors</p>
              <p className="mt-0.5 text-base sm:text-lg font-black text-red-400">{data.before.errors}</p>
            </div>
          </div>
          {/* Before screenshot from agent */}
          <div className="mt-3 overflow-hidden rounded-lg border border-white/[0.06] bg-[#0A0A0A]">
            {data.beforeScreenshot ? (
              <img
                src={data.beforeScreenshot}
                alt="Before fix"
                className="w-full object-contain"
                style={{ maxHeight: '50vw' }}
              />
            ) : data.scanId ? (
              <img
                src={`/api/restore/screenshots/${data.scanId}/01-homepage.jpg`}
                alt="Before fix"
                className="w-full object-contain"
                style={{ maxHeight: '50vw' }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            ) : (
              <div className="flex items-center justify-center py-8">
                <Camera size={20} className="text-white/10" />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="px-3 py-3 sm:px-5 sm:py-4">
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle2 size={12} className="text-[#D6FF00]" />
            <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-[#D6FF00]">RESTORED</span>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-lg bg-[#D6FF00]/[0.06] px-2 py-2 text-center sm:px-3">
              <p className="text-[9px] sm:text-[10px] text-white/30">Status</p>
              <p className="mt-0.5 text-base sm:text-lg font-black text-[#D6FF00]">{data.after.status}</p>
            </div>
            <div className="rounded-lg bg-[#D6FF00]/[0.06] px-2 py-2 text-center sm:px-3">
              <p className="text-[9px] sm:text-[10px] text-white/30">LCP</p>
              <p className="mt-0.5 text-base sm:text-lg font-black text-[#D6FF00]">{data.after.lcp}</p>
            </div>
            <div className="rounded-lg bg-[#D6FF00]/[0.06] px-2 py-2 text-center sm:px-3">
              <p className="text-[9px] sm:text-[10px] text-white/30">Errors</p>
              <p className="mt-0.5 text-base sm:text-lg font-black text-[#D6FF00]">{data.after.errors}</p>
            </div>
          </div>
          {/* After screenshot or fixed preview iframe */}
          <div className="mt-3 overflow-hidden rounded-lg border border-white/[0.06] bg-[#0A0A0A]">
            {data.afterScreenshot ? (
              <img
                src={data.afterScreenshot}
                alt="After fix"
                className="w-full object-contain"
                style={{ maxHeight: '50vw' }}
              />
            ) : data.scanId ? (
              <img
                src={`/api/restore/screenshots/${data.scanId}/fixed-homepage.jpg`}
                alt="After fix"
                className="w-full object-contain"
                style={{ maxHeight: '50vw' }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            ) : data.after.previewUrl ? (
              <iframe
                src={data.after.previewUrl}
                sandbox="allow-same-origin allow-scripts"
                className="w-full border-none"
                style={{ height: 200, border: 'none' }}
                title="Restored preview"
              />
            ) : (
              <div className="flex items-center justify-center py-8">
                <Camera size={20} className="text-white/10" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Metrics Bar */}
      <div className="border-t border-white/[0.04] px-3 py-2.5 sm:px-5 sm:py-3">
        <div className="space-y-1.5">
          {[
            { label: 'Status', before: `${data.before.status}`, after: `${data.after.status}` },
            { label: 'LCP', before: data.before.lcp, after: data.after.lcp },
            { label: 'Errors', before: String(data.before.errors), after: String(data.after.errors) },
          ].map((m, i) => (
            <div key={i} className="flex items-center justify-between text-[10px] sm:text-[11px]">
              <span className="font-semibold text-white/30">{m.label}</span>
              <div className="flex items-center gap-2">
                <span className="font-bold text-red-400/60 line-through">{m.before}</span>
                <ArrowRight size={10} className="text-white/15" />
                <span className="font-bold text-[#D6FF00]">{m.after}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
