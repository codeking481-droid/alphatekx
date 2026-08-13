import { useMemo, useState } from 'react'
import { ArrowRight, CheckCircle2, Download, FileText, ImageUp, Link2, ShieldAlert, Sparkles, Video } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

type ScanFinding = {
  id: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  detail: string
  code: string
}

type ScanSummary = {
  score: number
  risk: string
  totalFindings: number
  scannedUrl: string
}

const cards = [
  {
    title: 'SCAN MY LINK',
    subtitle: 'Report Only',
    icon: Link2,
    accent: 'from-violet-600 to-purple-500',
    description: 'Paste a broken app link and get a PDF report covering API leaks, secret keys, broken envs, and performance issues — no live-touch, no silent rebuilds.',
    button: 'Scan, Don\'t Touch',
    inputLabel: 'Paste link',
    output: 'PDF report of API leak, secret key, broken env, performance — report only, no touch link — more control',
  },
  {
    title: 'RESTORE MY VIDEO',
    subtitle: 'Heal My Broken Video',
    icon: Video,
    accent: 'from-cyan-500 to-blue-500',
    description: 'Upload unedited, broken, or shaky footage. Alpha rebuilds the edit into polished world-class output with voice-over, trimming, pacing, and long-to-short or short-to-long conversion.',
    button: 'Restore to World-Class',
    inputLabel: 'Upload unedited / broken / shaky video',
    output: 'Editor heals the cut, adds voice-over, and restores quality to MrBeast / IShowSpeed / Malva level without learning your style the slow way.',
  },
  {
    title: 'SELL MY WORK',
    subtitle: 'Market',
    icon: ImageUp,
    accent: 'from-amber-400 to-orange-500',
    description: 'Upload a restored app, edited video, or template and list it for sale. Set a price and publish to the marketplace for buyers.',
    button: 'Put For Sale',
    inputLabel: 'Upload app, video, or template',
    output: 'List for sale at $19 / $49 pricing and grow the restoration economy without a generic builder workflow.',
  },
] as const

function downloadReport(summary: ScanSummary | null, findings: ScanFinding[]) {
  const payload = {
    generatedAt: new Date().toISOString(),
    url: summary?.scannedUrl || 'unknown',
    score: summary?.score || 0,
    risk: summary?.risk || 'Unknown',
    findings,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'alpha-scan-report.json'
  anchor.click()
  URL.revokeObjectURL(url)
}

export default function Home() {
  const navigate = useNavigate()
  const [active, setActive] = useState<string | null>(null)
  const [scanUrl, setScanUrl] = useState('https://example-app.com')
  const [scanState, setScanState] = useState<'idle' | 'scanning' | 'done' | 'paywall'>('idle')
  const [scanProgress, setScanProgress] = useState(0)
  const [scanFindings, setScanFindings] = useState<ScanFinding[]>([])
  const [scanSummary, setScanSummary] = useState<ScanSummary | null>(null)
  const [scanError, setScanError] = useState('')
  const [scanPreviewUrl, setScanPreviewUrl] = useState('https://example-app.com')

  const defectCount = useMemo(() => scanFindings.filter(item => item.severity === 'critical').length, [scanFindings])

  const scanLink = async () => {
    const trimmed = scanUrl.trim()
    if (!trimmed) {
      setScanError('Paste a link to scan.')
      return
    }

    setScanError('')
    setScanState('scanning')
    setScanProgress(0)
    setScanFindings([])
    setScanSummary(null)
    setScanPreviewUrl(trimmed)

    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      })

      if (!response.ok && response.status === 402) {
        setScanState('paywall')
        setScanError('Add card to continue restoring. Free scans are limited to 1 per day.')
        return
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Scan failed.')
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      if (!reader) {
        throw new Error('Unable to stream scan results.')
      }

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''
        for (const part of parts) {
          const lines = part.split('\n')
          const event = lines.filter(line => line.startsWith('data:')).map(line => line.replace(/^data:\s*/, '')).join('')
          if (!event) continue
          const payload = JSON.parse(event)
          if (payload.type === 'progress') {
            setScanProgress(Number(payload.progress || 0))
            if (payload.message) setScanError(payload.message)
          }
          if (payload.type === 'finding') {
            setScanFindings(current => [{
              id: payload.id || `${payload.code}-${current.length}`,
              severity: payload.severity || 'info',
              title: payload.title || 'Finding',
              detail: payload.detail || '',
              code: payload.code || 'SCAN',
            }, ...current])
          }
          if (payload.type === 'done' || payload.type === 'summary') {
            setScanSummary({
              score: Number(payload.score || 0),
              risk: payload.risk || 'Unknown',
              totalFindings: Number(payload.totalFindings || 0),
              scannedUrl: payload.scannedUrl || trimmed,
            })
            setScanProgress(100)
            setScanState('done')
            setScanError('')
          }
          if (payload.type === 'paywall') {
            setScanState('paywall')
            setScanError(payload.message || 'Add card to continue restoring.')
          }
        }
      }
    } catch (error) {
      setScanState('idle')
      setScanError(error instanceof Error ? error.message : 'Scan failed.')
    }
  }

  return (
    <section className="min-h-full bg-violet-500/10 px-4 py-12 sm:px-6 lg:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-[#6D28D9] text-white shadow-[0_18px_40px_rgba(109,40,217,.3)]"><Sparkles size={29}/></span>
          <p className="mt-7 text-xs font-black uppercase tracking-[.2em] text-violet-300">Welcome to Alpha</p>
          <h1 className="mt-4 text-4xl font-black tracking-[-.05em] text-white sm:text-6xl">Where Broken Things Are Restored, Not Built</h1>
          <p className="mx-auto mt-5 max-w-3xl text-lg font-semibold leading-8 text-slate-400">No style-learning, only restoration — heal broken to world-class.</p>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon
            const isActive = active === card.title
            return (
              <div key={card.title} className={`rounded-[28px] border border-violet-400/20 bg-[#101114] p-5 shadow-[0_22px_60px_rgba(15,23,42,.18)] transition-all ${isActive ? 'ring-2 ring-violet-400/50' : ''}`}>
                <div className={`inline-flex rounded-full bg-gradient-to-r ${card.accent} p-3 text-white`}>
                  <Icon size={22} />
                </div>
                <div className="mt-5">
                  <p className="text-[10px] font-black uppercase tracking-[.18em] text-violet-300">{card.title}</p>
                  <h2 className="mt-2 text-2xl font-black text-white">{card.subtitle}</h2>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-300">{card.description}</p>

                <div className="mt-5 rounded-2xl border border-white/10 bg-white/[.02] p-3">
                  <label className="block text-[10px] font-black uppercase tracking-[.14em] text-slate-400">{card.inputLabel}</label>
                  {card.title === 'SCAN MY LINK' ? (
                    <input
                      value={scanUrl}
                      onChange={event => setScanUrl(event.target.value)}
                      placeholder="https://example-app.com"
                      className="mt-2 w-full min-h-[52px] rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none ring-0"
                    />
                  ) : (
                    <div className="mt-2 min-h-[64px] rounded-xl border border-dashed border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-500">
                      {card.title === 'RESTORE MY VIDEO' ? 'video-file.mp4' : 'app-or-template.zip'}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setActive(card.title)
                    if (card.title === 'SCAN MY LINK') {
                      void scanLink()
                    } else {
                      navigate('/automations')
                    }
                  }}
                  className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#6D28D9] px-4 text-sm font-black text-white shadow-[0_15px_35px_rgba(109,40,217,.28)] transition hover:-translate-y-0.5 hover:bg-[#5B21B6]"
                >
                  {card.button}
                  <ArrowRight size={17} />
                </button>

                <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-xs leading-5 text-emerald-100">
                  <div className="mb-1 flex items-center gap-2 font-black uppercase tracking-[.12em] text-emerald-300"><CheckCircle2 size={14} /> Output</div>
                  {card.output}
                </div>
              </div>
            )
          })}
        </div>

        {(scanState === 'scanning' || scanState === 'done' || scanState === 'paywall') && (
          <div className="mt-10 rounded-[30px] border border-violet-400/20 bg-[#0f1014] p-4 shadow-[0_30px_80px_rgba(15,23,42,.28)] sm:p-6">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[.2em] text-violet-300">Smart risk scan</p>
                <h2 className="mt-2 text-2xl font-black text-white">{scanState === 'paywall' ? 'Free scan limit reached' : scanState === 'done' ? 'Scan Complete' : 'SCANNING...'} {scanState !== 'paywall' ? `${scanProgress}%` : ''}</h2>
              </div>
              {scanSummary && (
                <div className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-sm font-black text-emerald-300">
                  Score {scanSummary.score}/100 · {scanSummary.risk}
                </div>
              )}
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-slate-950 p-3">
                <div className="relative h-[340px] overflow-hidden rounded-[18px] border border-white/10 bg-[#0b1118]">
                  {scanState === 'paywall' ? (
                    <div className="flex h-full items-center justify-center p-6 text-center text-slate-300">
                      <div>
                        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-amber-500/10 text-amber-300"><ShieldAlert size={28} /></div>
                        <div className="text-lg font-black text-white">Add card to continue restoring</div>
                        <p className="mt-2 text-sm text-slate-400">Free scans are limited to 1 per day. Paid $49 removes the watermark and unlocks 1080p/4K healing.</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <iframe
                        src={scanPreviewUrl}
                        title="Live site preview"
                        className="h-full w-full border-0 bg-white"
                        sandbox="allow-scripts allow-same-origin"
                      />
                      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(16,185,129,0.15),transparent_35%),linear-gradient(180deg,rgba(0,0,0,0.06),rgba(0,0,0,0.32))]" />
                      <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(180deg,rgba(255,255,255,0.05)_0,rgba(255,255,255,0.05)_1px,transparent_1px,transparent_4px)] opacity-60" />
                      <div className={`pointer-events-none absolute inset-0 ${defectCount > 0 ? 'bg-red-500/10' : 'bg-emerald-500/10'} mix-blend-screen`} />
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-[25%] bg-gradient-to-b from-emerald-400/10 to-transparent" />
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 animate-[scanline_2.5s_linear_infinite] bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_15px_rgba(52,211,153,0.9)]" />
                      {defectCount > 0 && (
                        <div className="pointer-events-none absolute inset-0 animate-[glitch_0.8s_steps(3,end)_infinite] bg-[linear-gradient(90deg,transparent_0%,rgba(239,68,68,0.15)_48%,transparent_52%)]" />
                      )}
                      <div className="absolute left-3 top-3 rounded-full border border-emerald-400/40 bg-black/40 px-2.5 py-1 text-[10px] font-black uppercase tracking-[.18em] text-emerald-300">
                        {scanState === 'done' ? 'REPORT READY' : 'LIVE SCAN'}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-[#101114] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-black uppercase tracking-[.18em] text-violet-300">Findings feed</p>
                  {scanSummary && (
                    <button
                      type="button"
                      onClick={() => downloadReport(scanSummary, scanFindings)}
                      className="inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-1.5 text-xs font-black text-violet-200"
                    >
                      <Download size={14} /> Download PDF Report
                    </button>
                  )}
                </div>

                <div className="mt-4 space-y-3">
                  {scanState === 'paywall' ? (
                    <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                      <div className="font-black uppercase tracking-[.12em] text-amber-300">Paywall</div>
                      <p className="mt-2 leading-6">Your free scan quota is used up for today. Upgrade to $49 to unlock unlimited scanning and remove the free watermark from restored videos.</p>
                    </div>
                  ) : scanFindings.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[.02] p-4 text-sm text-slate-400">
                      {scanState === 'scanning' ? 'Streaming live findings...' : 'No findings yet.'}
                    </div>
                  ) : (
                    scanFindings.map(finding => (
                      <div key={finding.id} className={`rounded-2xl border p-4 ${finding.severity === 'critical' ? 'border-rose-400/30 bg-rose-500/10' : finding.severity === 'warning' ? 'border-amber-400/30 bg-amber-500/10' : 'border-emerald-400/30 bg-emerald-500/10'}`}>
                        <div className="flex items-center justify-between gap-3">
                          <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[.14em] ${finding.severity === 'critical' ? 'bg-rose-500/20 text-rose-300' : finding.severity === 'warning' ? 'bg-amber-500/20 text-amber-200' : 'bg-emerald-500/20 text-emerald-300'}`}>
                            {finding.severity === 'critical' ? 'LEAKED SECRET' : finding.severity === 'warning' ? 'BROKEN LINK' : 'INFO'}
                          </span>
                          <span className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">{finding.code}</span>
                        </div>
                        <p className="mt-3 text-base font-black text-white">{finding.title}</p>
                        <p className="mt-1 text-sm leading-6 text-slate-200">{finding.detail}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {scanError && !scanState.includes('done') && (
              <p className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm font-medium text-rose-200">{scanError}</p>
            )}
          </div>
        )}

        <div className="mt-8 rounded-[28px] border border-amber-400/20 bg-amber-500/10 p-5 text-sm text-amber-100">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 shrink-0 text-amber-300" size={18} />
            <div>
              <p className="font-black uppercase tracking-[.12em] text-amber-300">Anti-abuse protection</p>
              <p className="mt-2 leading-6 text-amber-100/90">Free tier: 1 free scan, 1 free video restore with watermark and 720p, 3 history saves. Paid $49 removes watermark, unlocks 1080p/4K, unlimited history, and sell access. No credits = no restore. Free users are limited to 3 video restores per hour and must add a card to continue restoring.</p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-center text-xs font-black uppercase tracking-[.18em] text-slate-400">
          <FileText className="mr-2 text-violet-300" size={14} />
          Trusted restoration workflow — not a generic platform dump
        </div>
      </div>
    </section>
  )
}
