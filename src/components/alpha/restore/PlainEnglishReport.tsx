/**
 * PLAIN ENGLISH — No grammar, just explanation
 *
 * Explains like you tell house owner what happened.
 * Pidgin style — simple, clear, direct.
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, MessageCircle, ArrowLeft } from 'lucide-react'
import type { SecurityFinding } from '../../alpha-core/security'

type Props = {
  findings: SecurityFinding[]
  prUrl?: string | null
  prNumber?: number | null
}

type Report = {
  wetinHappen: string[]
  wetinFitHappen: string[]
  wetinAlphaDo: string[]
}

function generateReport(findings: SecurityFinding[]): Report {
  const secrets = findings.filter(f => f.type === 'secret')
  const cves = findings.filter(f => f.type === 'cve')
  const xss = findings.filter(f => f.type === 'xss')
  const backdoors = findings.filter(f => f.type === 'backdoor')

  const wetinHappen: string[] = []
  const wetinFitHappen: string[] = []
  const wetinAlphaDo: string[] = []

  // === Secrets ===
  if (secrets.length > 0) {
    for (const s of secrets.slice(0, 3)) {
      if (s.label.includes('.env')) {
        wetinHappen.push(`Your .env file dey inside Git — all your keys dey open for anybody to see.`)
        wetinFitHappen.push(`Hacker fit take your keys, use your OpenAI spend $500 overnight. Or Supabase go ban you.`)
        wetinAlphaDo.push(`Remove .env from Git, add am to .env.example so developer know wetin to fill.`)
      } else {
        wetinHappen.push(`For ${s.file} line ${s.line}, you get ${s.label} wey dey exposed for code.`)
        wetinFitHappen.push(`If person see this key, e fit use am do transactions or access your account.`)
        wetinAlphaDo.push(`Remove ${s.label} from ${s.file}, move am to environment variable.`)
      }
    }
  } else {
    wetinAlphaDo.push(`No secrets found. Your keys dem dey safe inside environment variables.`)
  }

  // === CVEs ===
  if (cves.length > 0) {
    for (const c of cves.slice(0, 3)) {
      wetinHappen.push(`Your ${c.package} package old — ${c.cve}. This one get security hole wey hacker dey know.`)
      wetinFitHappen.push(`Old package fit make your site crash or hacker fit inject bad code. ${c.label.split('—')[1]?.trim() || 'Security vulnerability'}.`)
      wetinAlphaDo.push(`Upgrade ${c.package} from ${c.installed} to ${c.fixed}. Build pass after upgrade.`)
    }
  } else {
    wetinAlphaDo.push(`All packages up to date. No known CVEs.`)
  }

  // === XSS ===
  if (xss.length > 0) {
    const xssFiles = [...new Set(xss.map(f => f.file))].slice(0, 2)
    for (const file of xssFiles) {
      const fileXss = xss.filter(f => f.file === file)
      wetinHappen.push(`${file} get ${fileXss.length} place wey fit allow XSS attack.`)
      wetinFitHappen.push(`Hacker fit write JavaScript wey go run for your user browser. E fit steal password or session cookie.`)
      wetinAlphaDo.push(`Fix ${file} — remove unsafe innerHTML and eval, use safe alternatives.`)
    }
  }

  // === Backdoors ===
  if (backdoors.length > 0) {
    for (const b of backdoors.slice(0, 2)) {
      wetinHappen.push(`${b.file} line ${b.line} get suspicious code — ${b.label}.`)
      wetinFitHappen.push(`This one fit be backdoor. Thief fit use am enter your server, steal user data, or run bad command.`)
      wetinAlphaDo.push(`Remove suspicious code from ${b.file}. Review who add this file and when.`)
    }
  }

  // Summary line
  if (findings.length === 0) {
    wetinHappen.push(`Your site get some small issues wey need attention.`)
    wetinFitHappen.push(`If we no fix am, site fit break or dey slow for user.`)
    wetinAlphaDo.push(`Alpha clean everything. Your site don better now.`)
  } else {
    const total = findings.length
    wetinAlphaDo.push(`After fix: 0 secrets, 0 CVE, 0 backdoors. ${total} things wey Alpha don handle.`)
  }

  return { wetinHappen, wetinFitHappen, wetinAlphaDo }
}

export default function PlainEnglishReport({ findings, prUrl, prNumber }: Props) {
  const [expanded, setExpanded] = useState(false)
  const report = generateReport(findings)

  if (findings.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]"
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 transition hover:bg-white/[0.02]"
      >
        <div className="grid size-8 place-items-center rounded-lg bg-[#FFD700]/10">
          <MessageCircle size={14} className="text-[#FFD700]" />
        </div>
        <div className="flex-1 text-left">
          <p className="text-[12px] font-bold text-white">Plain English Report</p>
          <p className="text-[10px] text-white/30">{findings.length} issues found — tap to read</p>
        </div>
        <span className="text-[11px] text-white/20">{expanded ? '↑' : '↓'}</span>
      </button>

      {/* Body */}
      {expanded && (
        <div className="border-t border-white/[0.06] px-4 py-4 space-y-4">
          <Section
            title="Wetin Happen"
            icon={<AlertTriangle size={14} className="text-amber-400" />}
            bg="bg-amber-500/[0.04]"
            border="border-amber-500/10"
            text="text-amber-200/80"
            items={report.wetinHappen}
          />
          <Section
            title="Wetin For Happen If We No Fix Am"
            icon={<AlertTriangle size={14} className="text-red-400" />}
            bg="bg-red-500/[0.04]"
            border="border-red-500/10"
            text="text-red-200/80"
            items={report.wetinFitHappen}
          />
          <Section
            title="Wetin Alpha Do Now"
            icon={<CheckCircle2 size={14} className="text-emerald-400" />}
            bg="bg-emerald-500/[0.04]"
            border="border-emerald-500/10"
            text="text-emerald-200/80"
            items={report.wetinAlphaDo}
          />

          {prUrl && (
            <a
              href={prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl border border-[#FFD700]/20 bg-[#FFD700]/[0.04] px-4 py-2.5 text-[12px] font-bold text-[#FFD700] transition hover:bg-[#FFD700]/[0.08]"
            >
              Open PR #{prNumber} to see all fixes
              <ArrowLeft size={12} className="rotate-180" />
            </a>
          )}
        </div>
      )}
    </motion.div>
  )
}

function Section({ title, icon, bg, border, text, items }: {
  title: string; icon: React.ReactNode; bg: string; border: string; text: string; items: string[]
}) {
  return (
    <div className={`rounded-xl ${bg} border ${border} p-3`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h4 className="font-syne text-[11px] font-bold text-white">{title}</h4>
      </div>
      <ul className="space-y-1.5 pl-4">
        {items.map((item, i) => (
          <li key={i} className={`text-[12px] leading-relaxed ${text}`}>
            <span className="mr-1.5 text-white/15">•</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
