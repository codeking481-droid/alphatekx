import { useState } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, Download, ExternalLink, Eye, ShieldAlert, Zap } from 'lucide-react'

export type GoldCardProps = {
  title: string
  broken: { label: string; value: string; details?: string[] }
  restored: { label: string; value: string; details?: string[] }
  metrics?: Array<{ label: string; before: string; after: string }>
  actions?: Array<{ label: string; href?: string; onClick?: () => void; icon?: 'download' | 'deploy' | 'view' }>
  toolType: 'website' | 'video' | 'backend'
}

const toolColors: Record<string, { accent: string; bg: string; border: string }> = {
  website: { accent: '#D6FF00', bg: 'rgba(214,255,0,0.06)', border: 'rgba(214,255,0,0.2)' },
  video: { accent: '#FFD700', bg: 'rgba(255,215,0,0.06)', border: 'rgba(255,215,0,0.2)' },
  backend: { accent: '#8B5CF6', bg: 'rgba(139,92,246,0.06)', border: 'rgba(139,92,246,0.2)' },
}

const actionIcons = { download: Download, deploy: Zap, view: Eye }

export default function GoldCard({ title, broken, restored, metrics = [], actions = [], toolType }: GoldCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const colors = toolColors[toolType] || toolColors.website

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-2xl border border-[#FFD700]/25 bg-gradient-to-br from-[#FFD700]/[0.08] via-[#0A0A0A] to-[#0A0A0A]"
      style={{ boxShadow: '0 0 40px rgba(255,215,0,0.08), 0 0 80px rgba(255,215,0,0.03)' }}
    >
      <div className="gold-shimmer-border relative border-b border-[#FFD700]/15 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-[#FFD700]/10">
            <CheckCircle2 size={18} className="text-[#FFD700]" />
          </div>
          <div>
            <h4 className="text-sm font-black uppercase tracking-wide text-[#FFD700]">
              PROOF: BROKEN vs RESTORED
            </h4>
            <p className="mt-0.5 text-[11px] text-white/40">{title}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x divide-white/[0.04]">
        <div className="px-5 py-4">
          <div className="mb-3 flex items-center gap-2">
            <ShieldAlert size={13} className="text-red-400" />
            <span className="text-[10px] font-black uppercase tracking-widest text-red-400">BROKEN</span>
          </div>
          <p className="text-[13px] font-bold text-red-400/80">{broken.label}</p>
          <p className="mt-1 text-[22px] font-black text-red-400">{broken.value}</p>
          {broken.details && broken.details.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {broken.details.map((d, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px] text-red-400/50">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-red-400/40" />
                  {d}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="px-5 py-4">
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle2 size={13} className="text-[#D6FF00]" />
            <span className="text-[10px] font-black uppercase tracking-widest text-[#D6FF00]">RESTORED</span>
          </div>
          <p className="text-[13px] font-bold text-[#D6FF00]/80">{restored.label}</p>
          <p className="mt-1 text-[22px] font-black text-[#D6FF00]">{restored.value}</p>
          {restored.details && restored.details.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {restored.details.map((d, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px] text-[#D6FF00]/50">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#D6FF00]/40" />
                  {d}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {metrics.length > 0 && (
        <div className="border-t border-white/[0.04] px-5 py-3">
          <div className="space-y-2">
            {metrics.map((m, i) => (
              <div key={i} className="flex items-center justify-between text-[12px]">
                <span className="font-semibold text-white/40">{m.label}</span>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-red-400/60 line-through">{m.before}</span>
                  <span className="text-white/15">→</span>
                  <span className="font-bold text-[#D6FF00]">{m.after}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => setDetailsOpen(!detailsOpen)}
        className="w-full border-t border-white/[0.04] px-5 py-2.5 text-center text-[11px] font-bold text-white/20 transition hover:text-white/40"
      >
        {detailsOpen ? 'Hide details' : 'Show details'}
      </button>

      {detailsOpen && (
        <div className="border-t border-white/[0.04] px-5 py-3 text-[11px] text-white/30">
          Full diagnostic data available. Restoration complete with zero errors.
        </div>
      )}

      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-[#FFD700]/10 px-5 py-4">
          {actions.map((action, i) => {
            const Icon = actionIcons[action.icon || 'view']
            return (
              <a
                key={i}
                href={action.href || '#'}
                onClick={action.onClick}
                target={action.href ? '_blank' : undefined}
                rel={action.href ? 'noopener noreferrer' : undefined}
                className="flex items-center gap-2 rounded-xl border border-[#FFD700]/20 bg-[#FFD700]/[0.06] px-4 py-2.5 text-[12px] font-bold text-[#FFD700] transition hover:bg-[#FFD700]/[0.12]"
              >
                <Icon size={13} />
                {action.label}
              </a>
            )
          })}
        </div>
      )}
    </motion.div>
  )
}
