/**
 * SecurityFindings — shows security scan results
 */

import { Shield, AlertTriangle, CheckCircle2, Eye } from 'lucide-react'

export default function SecurityFindings({ findings, summary }) {
  if (!findings || findings.length === 0) return null

  const secrets = findings.filter(f => f.category === 'secret')
  const xss = findings.filter(f => f.category === 'xss')
  const passed = summary?.passed ?? secrets.length === 0

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2">
          <Shield size={14} className={passed ? 'text-emerald-400' : 'text-amber-400'} />
          <span className="font-syne text-[12px] font-bold text-white">Security Scan</span>
        </div>
        <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
          passed ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
        }`}>
          {passed ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}
          {passed ? 'PASSED' : `${secrets.length} SECRETS`}
        </span>
      </div>

      <div className="p-4 space-y-3">
        {secrets.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-bold text-red-400">Hardcoded Secrets ({secrets.length})</p>
            <div className="space-y-1">
              {secrets.map((f, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-red-500/10 bg-red-500/[0.03] px-3 py-2">
                  <AlertTriangle size={10} className="shrink-0 text-red-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-red-300">{f.label}</p>
                    <p className="truncate text-[10px] text-white/30">{f.file}:{f.line}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {xss.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-bold text-amber-400">XSS / Injection Risks ({xss.length})</p>
            <div className="space-y-1">
              {xss.slice(0, 10).map((f, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-amber-500/10 bg-amber-500/[0.03] px-3 py-2">
                  <Eye size={10} className="shrink-0 text-amber-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-amber-300">{f.label}</p>
                    <p className="truncate text-[10px] text-white/30">{f.file}:{f.line}</p>
                  </div>
                </div>
              ))}
              {xss.length > 10 && (
                <p className="text-[10px] text-white/20">+{xss.length - 10} more</p>
              )}
            </div>
          </div>
        )}

        {passed && secrets.length === 0 && xss.length === 0 && (
          <div className="flex items-center gap-2 text-[12px] text-emerald-400/70">
            <CheckCircle2 size={14} />
            No security issues found. Scanned {summary?.filesScanned || 0} files.
          </div>
        )}
      </div>
    </div>
  )
}
