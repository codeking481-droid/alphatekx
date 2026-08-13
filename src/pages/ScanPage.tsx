import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Download, FileText, Radar, ShieldCheck, Sparkles } from 'lucide-react'

const scanSecrets = [
  'Scanning secrets...',
  'Leak found: sk_live_***',
  'Header drift detected',
  'Broken env var reference',
  'Performance bottleneck found',
]

export default function ScanPage() {
  const [url, setUrl] = useState('https://example-app.com')
  const [isScanning, setIsScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [findings, setFindings] = useState<Array<{ id: string; label: string; detail: string; severity: 'critical' | 'warning' | 'info' }>>([])
  const [score, setScore] = useState(92)
  const [status, setStatus] = useState('Ready for inspection')

  useEffect(() => {
    if (!isScanning) return
    const interval = window.setInterval(() => {
      setProgress((current) => {
        const next = Math.min(current + 9, 100)
        if (next >= 100) {
          setIsScanning(false)
          setStatus('Scan complete')
          setScore(68)
          setFindings([
            { id: '1', label: 'Secret leak', detail: 'Detected sk_live_ value exposed in frontend bundle.', severity: 'critical' },
            { id: '2', label: 'Broken env ref', detail: 'Missing NEXT_PUBLIC_API_BASE_URL fallback.', severity: 'warning' },
            { id: '3', label: 'SEO gap', detail: 'Meta description missing on landing page.', severity: 'info' },
          ])
        }
        return next
      })
    }, 400)

    return () => window.clearInterval(interval)
  }, [isScanning])

  const scoreTone = useMemo(() => {
    if (score >= 80) return 'text-emerald-300'
    if (score >= 60) return 'text-amber-300'
    return 'text-rose-300'
  }, [score])

  const handleScan = async () => {
    setIsScanning(true)
    setStatus('Scanning secrets...')
    setProgress(12)
    setFindings([])

    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })

      if (!response.ok && response.status === 402) {
        setStatus('Free scan limit reached')
        setIsScanning(false)
        setProgress(100)
        return
      }

      if (!response.ok) {
        throw new Error('Scan failed')
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No stream available')
      }
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''
        for (const part of parts) {
          const lines = part.split('\n').filter(Boolean)
          const event = lines.find((line) => line.startsWith('data:'))
          if (!event) continue
          const payload = JSON.parse(event.replace(/^data:\s*/, ''))
          if (payload.type === 'progress') {
            setProgress(Number(payload.progress || 0))
            setStatus(payload.message || 'Scanning...')
          }
          if (payload.type === 'finding') {
            setFindings((current) => [{
              id: payload.id || `${payload.code}-${current.length}`,
              severity: payload.severity || 'info',
              label: payload.title || 'Finding',
              detail: payload.detail || '',
            }, ...current])
          }
          if (payload.type === 'done' || payload.type === 'summary') {
            setStatus('Scan complete')
            setScore(Number(payload.score || 72))
            setIsScanning(false)
          }
        }
      }
    } catch {
      setIsScanning(false)
      setStatus('Scan failed safely')
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 text-white sm:px-6 lg:py-14">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-300">Alpha scan</p>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.06em] text-white sm:text-4xl">Scan My Link — Report Only</h1>
        </div>
        <button type="button" onClick={handleScan} className="btn-primary">
          Scan, Don&apos;t Touch
        </button>
      </header>

      <section className="mt-8 rounded-[28px] border border-white/10 bg-[#111214] p-4 shadow-[0_28px_70px_rgba(0,0,0,0.2)] sm:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <label className="sr-only" htmlFor="scan-url">Website URL</label>
          <input
            id="scan-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example-app.com"
            className="min-h-[52px] flex-1 rounded-full border border-white/10 bg-black/20 px-5 text-sm text-white placeholder:text-slate-500 outline-none"
          />
          <button type="button" onClick={handleScan} className="btn-primary min-w-[180px]">
            Scan, Don&apos;t Touch
          </button>
        </div>
      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-2">
        <div className="rounded-[30px] border border-white/10 bg-[#0E0F12] p-4 shadow-[0_26px_70px_rgba(0,0,0,0.18)]">
          <div className="relative overflow-hidden rounded-[24px] border border-emerald-400/20 bg-[#07120e] p-3">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(52,211,153,0.12),transparent_50%)]" />
            <div className="relative h-[340px] overflow-hidden rounded-[18px] border border-white/10 bg-[#0a1111]">
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full border border-emerald-400/30 bg-emerald-500/10 text-emerald-300">
                    <Radar size={26} />
                  </div>
                  <p className="text-xl font-black text-white">{url || 'example-app.com'}</p>
                  <p className="mt-2 text-sm text-slate-400">Smart scan visual</p>
                </div>
              </div>
              <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-emerald-400/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-emerald-500/15 to-transparent" />
              <div
                className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-300 to-transparent shadow-[0_0_18px_rgba(52,211,153,0.9)] transition-all duration-300"
                style={{ top: `${Math.min(progress, 100)}%` }}
              />
              <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)', backgroundSize: '100% 18px' }} />
            </div>
          </div>
        </div>

        <div className="rounded-[30px] border border-white/10 bg-[#0E0F12] p-4 shadow-[0_26px_70px_rgba(0,0,0,0.18)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-300">Live findings</p>
              <h2 className="mt-2 text-xl font-black text-white">{status}</h2>
            </div>
            <div className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-black text-emerald-300">{progress}%</div>
          </div>

          <div className="mt-5 space-y-3">
            {isScanning && scanSecrets.map((item, index) => (
              <div key={item} className="rounded-2xl border border-emerald-400/15 bg-emerald-500/5 p-3 text-sm text-emerald-100 transition-all" style={{ opacity: 0.4 + index * 0.2 }}>
                {item}
              </div>
            ))}
            {!isScanning && findings.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-slate-400">No findings yet. Run the scan to inspect the target for leaks and performance risks.</div>
            )}
            {!isScanning && findings.map((finding) => (
              <div key={finding.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-black text-white">{finding.label}</p>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${finding.severity === 'critical' ? 'bg-rose-500/10 text-rose-300' : finding.severity === 'warning' ? 'bg-amber-500/10 text-amber-300' : 'bg-sky-500/10 text-sky-300'}`}>
                    {finding.severity}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-300">{finding.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-[30px] border border-white/10 bg-[#0D0E12] p-5 shadow-[0_26px_70px_rgba(0,0,0,0.18)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Verdict</p>
            <div className="mt-2 flex items-center gap-3">
              <span className={`text-3xl font-black ${scoreTone}`}>{score}</span>
              <span className="text-sm text-slate-400">out of 100</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary">Download PDF Report</button>
            <button type="button" className="btn-primary">Save to History</button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-center gap-2 text-sm font-black text-white"><ShieldCheck size={16} className="text-emerald-300" /> Security</div>
            <p className="mt-2 text-sm text-slate-300">Secret key and env detection</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-center gap-2 text-sm font-black text-white"><Sparkles size={16} className="text-violet-300" /> Performance</div>
            <p className="mt-2 text-sm text-slate-300">Slow render and asset bottlenecks</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-center gap-2 text-sm font-black text-white"><FileText size={16} className="text-amber-300" /> SEO</div>
            <p className="mt-2 text-sm text-slate-300">Metadata, crawlability, and broken links</p>
          </div>
        </div>
      </section>
    </main>
  )
}
