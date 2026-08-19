/**
 * GOLD CARD — Restoration Certificate
 *
 * Black bg + gold gradient border + shimmer for $99 tier.
 * Shows: Before/After screenshots, security badges, certificate number, QR link.
 * Plain English report on the back side.
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Shield, CheckCircle2, AlertTriangle, ExternalLink, QrCode, Award, Lock } from 'lucide-react'

type SecurityFinding = {
  type: 'secret' | 'cve' | 'xss' | 'backdoor'
  label: string
  file: string
  line: number
  risk: 'high' | 'medium' | 'low'
  raw?: string
  cve?: string
  package?: string
  installed?: string
  fixed?: string
}

export type GoldCardProps = {
  tier?: 'free' | 'silver' | 'gold'
  screenshotBefore?: string | null
  screenshotAfter?: string | null
  prUrl?: string | null
  prNumber?: number | null
  branch?: string | null
  repoFullName?: string
  findings?: SecurityFinding[]
  summary?: {
    secrets: number
    cves: number
    xss: number
    backdoors: number
    highRisk: number
  }
  plainEnglish?: {
    wetinHappen: string[]
    wetinFitHappen: string[]
    wetinAlphaDo: string[]
  }
  restoredAt?: string
}

const tierStyles = {
  free: {
    border: 'border-white/10',
    bg: 'bg-white/[0.02]',
    glow: '',
    badge: 'FREE SCAN',
    badgeColor: 'text-white/30',
  },
  silver: {
    border: 'border-gray-300/30',
    bg: 'bg-gradient-to-br from-gray-300/[0.04] via-[#0A0A0A] to-[#0A0A0A]',
    glow: '0 0 30px rgba(200,200,200,0.04)',
    badge: 'SILVER RESTORED',
    badgeColor: 'text-gray-300',
  },
  gold: {
    border: 'border-transparent',
    bg: 'bg-gradient-to-br from-[#FFD700]/[0.08] via-[#0A0A0A] to-[#0A0A0A]',
    glow: '0 0 40px rgba(255,215,0,0.1), 0 0 80px rgba(255,215,0,0.04)',
    badge: 'GOLD CERTIFIED',
    badgeColor: 'text-[#FFD700]',
  },
}

function certNumber(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `ALPHA-GOLD-${y}-${m}${d}-${rand}`
}

export default function GoldCard({
  tier = 'gold',
  screenshotBefore,
  screenshotAfter,
  prUrl,
  prNumber,
  branch,
  repoFullName,
  findings = [],
  summary,
  plainEnglish,
  restoredAt,
}: GoldCardProps) {
  const [side, setSide] = useState<'front' | 'back'>('front')
  const styles = tierStyles[tier]
  const secrets = summary?.secrets ?? findings.filter(f => f.type === 'secret').length
  const cves = summary?.cves ?? findings.filter(f => f.type === 'cve').length
  const xssCount = summary?.xss ?? findings.filter(f => f.type === 'xss').length
  const backdoors = summary?.backdoors ?? findings.filter(f => f.type === 'backdoor').length
  const cert = certNumber()
  const date = restoredAt || new Date().toISOString().slice(0, 10)

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-2xl"
      style={{ boxShadow: styles.glow }}
    >
      {/* Gold gradient border (2px) */}
      <div
        className={`absolute inset-0 rounded-2xl ${styles.border === 'border-transparent' ? '' : styles.border}`}
        style={tier === 'gold' ? {
          background: 'linear-gradient(135deg, #FFD700, #FFA500, #FFD700)',
          padding: 2,
          borderRadius: '1rem',
        } : undefined}
      />

      {/* Shimmer animation for gold tier */}
      {tier === 'gold' && (
        <div
          className="absolute inset-0 rounded-2xl opacity-30"
          style={{
            background: 'linear-gradient(110deg, transparent 30%, rgba(255,215,0,0.15) 50%, transparent 70%)',
            backgroundSize: '200% 100%',
            animation: 'gold-shimmer 3s ease-in-out infinite',
          }}
        />
      )}

      <div className={`relative rounded-2xl ${styles.bg}`} style={{ margin: tier === 'gold' ? 2 : 0 }}>
        {/* === FRONT SIDE === */}
        {side === 'front' && (
          <>
            {/* Header */}
            <div className="border-b border-white/[0.06] px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Award size={16} className={tier === 'gold' ? 'text-[#FFD700]' : tier === 'silver' ? 'text-gray-300' : 'text-white/30'} />
                  <span className="font-syne text-[10px] font-bold uppercase tracking-[0.2em] text-[#FFD700]/70">Restoration Certificate</span>
                </div>
                <span className={`font-syne text-[10px] font-black uppercase tracking-wider ${styles.badgeColor}`}>
                  {styles.badge}
                </span>
              </div>
              <p className="mt-1 text-[13px] font-bold text-white">Secured & Verified by AlphaTekX</p>
              {repoFullName && (
                <p className="mt-0.5 text-[11px] text-white/25">{repoFullName} {branch ? `· ${branch}` : ''}</p>
              )}
            </div>

            {/* Before / After Screenshots */}
            {(screenshotBefore || screenshotAfter) && (
              <div className="grid grid-cols-2 divide-x divide-white/[0.06]">
                <div className="relative">
                  <div className="absolute left-2 top-2 z-10 rounded-md bg-red-500/80 px-2 py-0.5 text-[9px] font-bold text-white">BEFORE</div>
                  {screenshotBefore ? (
                    <img src={screenshotBefore} alt="Before fix" className="w-full object-cover" style={{ height: 180 }} />
                  ) : (
                    <div className="flex h-[180px] items-center justify-center bg-white/[0.02] text-[11px] text-white/15">No screenshot</div>
                  )}
                </div>
                <div className="relative">
                  <div className="absolute left-2 top-2 z-10 rounded-md bg-emerald-500/80 px-2 py-0.5 text-[9px] font-bold text-white">AFTER</div>
                  {screenshotAfter ? (
                    <img src={screenshotAfter} alt="After fix" className="w-full object-cover" style={{ height: 180 }} />
                  ) : (
                    <div className="flex h-[180px] items-center justify-center bg-white/[0.02] text-[11px] text-white/15">No screenshot</div>
                  )}
                </div>
              </div>
            )}

            {/* Security Badges */}
            <div className="border-t border-white/[0.06] px-5 py-3">
              <div className="grid grid-cols-4 gap-2">
                <Badge count={secrets} label="Secrets" color={secrets === 0 ? 'emerald' : 'red'} />
                <Badge count={cves} label="CVE" color={cves === 0 ? 'emerald' : 'amber'} />
                <Badge count={xssCount} label="XSS" color={xssCount === 0 ? 'emerald' : 'amber'} />
                <Badge count={backdoors} label="Backdoors" color={backdoors === 0 ? 'emerald' : 'red'} />
              </div>
            </div>

            {/* Certificate Info */}
            <div className="border-t border-white/[0.06] px-5 py-3">
              <div className="flex items-center justify-between text-[10px]">
                <div>
                  <span className="text-white/25">Restored: </span>
                  <span className="font-bold text-white/50">{date}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Lock size={10} className="text-white/20" />
                  <span className="font-mono text-white/30">{cert}</span>
                </div>
              </div>
              {prUrl && (
                <a
                  href={prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-[#FFD700]/70 hover:text-[#FFD700]"
                >
                  <QrCode size={12} />
                  View PR #{prNumber}
                  <ExternalLink size={10} />
                </a>
              )}
            </div>

            {/* Flip to Back */}
            <button
              onClick={() => setSide('back')}
              className="w-full border-t border-white/[0.06] px-5 py-2.5 text-center text-[11px] font-bold text-white/20 transition hover:text-white/40"
            >
              Read Plain English Report →
            </button>
          </>
        )}

        {/* === BACK SIDE (Plain English) === */}
        {side === 'back' && plainEnglish && (
          <>
            <div className="border-b border-white/[0.06] px-5 py-4">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-[#FFD700]" />
                <span className="font-syne text-[12px] font-bold text-white">What Alpha Found</span>
              </div>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Wetin Happen */}
              <Section
                title="Wetin Happen"
                icon={<AlertTriangle size={14} className="text-amber-400" />}
                color="amber"
                items={plainEnglish.wetinHappen}
              />

              {/* Wetin Fit Happen */}
              <Section
                title="Wetin For Happen If We No Fix Am"
                icon={<AlertTriangle size={14} className="text-red-400" />}
                color="red"
                items={plainEnglish.wetinFitHappen}
              />

              {/* Wetin Alpha Do */}
              <Section
                title="Wetin Alpha Do Now"
                icon={<CheckCircle2 size={14} className="text-emerald-400" />}
                color="emerald"
                items={plainEnglish.wetinAlphaDo}
              />
            </div>

            {/* Flip back */}
            <button
              onClick={() => setSide('front')}
              className="w-full border-t border-white/[0.06] px-5 py-2.5 text-center text-[11px] font-bold text-white/20 transition hover:text-white/40"
            >
              ← Back to Certificate
            </button>
          </>
        )}
      </div>

      {/* Shimmer keyframes (injected once) */}
      <style>{`
        @keyframes gold-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </motion.div>
  )
}

function Badge({ count, label, color }: { count: number; label: string; color: 'emerald' | 'amber' | 'red' }) {
  const colors = {
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', icon: <CheckCircle2 size={12} /> },
    amber: { bg: 'bg-amber-500/10', text: 'text-amber-400', icon: <AlertTriangle size={12} /> },
    red: { bg: 'bg-red-500/10', text: 'text-red-400', icon: <AlertTriangle size={12} /> },
  }
  const c = colors[color]
  return (
    <div className={`flex flex-col items-center gap-1 rounded-lg ${c.bg} px-2 py-2`}>
      <div className={c.text}>{count === 0 ? <CheckCircle2 size={14} /> : c.icon}</div>
      <span className={`text-[14px] font-black ${count === 0 ? 'text-emerald-400' : c.text}`}>{count}</span>
      <span className="text-[9px] text-white/30">{label}</span>
    </div>
  )
}

function Section({ title, icon, color, items }: { title: string; icon: React.ReactNode; color: string; items: string[] }) {
  const textColors: Record<string, string> = {
    amber: 'text-amber-200/80',
    red: 'text-red-200/80',
    emerald: 'text-emerald-200/80',
  }
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h4 className="font-syne text-[12px] font-bold text-white">{title}</h4>
      </div>
      <ul className="space-y-1.5 pl-5">
        {items.map((item, i) => (
          <li key={i} className={`text-[12px] leading-relaxed ${textColors[color] || 'text-white/60'}`}>
            <span className="mr-1.5 text-white/15">•</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
