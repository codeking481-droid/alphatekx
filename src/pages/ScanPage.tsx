import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Download, FileText, Radar, ShieldCheck, Sparkles } from 'lucide-react'
import { getCredits, setCredits, hydrateCredits, subscribeCredits } from '../lib/creditStore'

const SCAN_PHASES = [
  'Validating target URL...',
  'Fetching public HTML and metadata...',
  'Analyzing HTML for secrets...',
  'Checking sensitive file paths...',
  'Inspecting internal links...',
  'Evaluating page performance...',
  'Scanning SEO metadata...',
  'Generating security verdict...',
]

export default function ScanPage() {
  const [url, setUrl] = useState('https://example-app.com')
  const [isScanning, setIsScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [findings, setFindings] = useState<Array<{ id: string; label: string; detail: string; severity: 'critical' | 'warning' | 'info' }>>([])
  const [score, setScore] = useState<number | null>(null)
  const [risk, setRisk] = useState<string | null>(null)
  const [scannedUrl, setScannedUrl] = useState('')
  const [status, setStatus] = useState('Ready for inspection')
  const [credits, setCreditsState] = useState(() => {
    // Initialize from creditStore on mount (do NOT default to 3)
    return getCredits() || 0
  })
  const [scanError, setScanError] = useState<string | null>(null)
  const [isLoadingCredits, setIsLoadingCredits] = useState(false)

  const scoreTone = useMemo(() => {
    if (score === null || score === undefined) return 'text-slate-400'
    if (score >= 80) return 'text-emerald-300'
    if (score >= 60) return 'text-amber-300'
    return 'text-rose-300'
  }, [score])

  useEffect(() => {
    // Load and hydrate credits on mount
    let unsubscribe: (() => void) | null = null
    
    const loadCredits = async () => {
      try {
        // First try to hydrate from API/database for authenticated users
        const hydratedBalance = await hydrateCredits()
        console.log('[ScanPage] Hydrated balance from API:', hydratedBalance)
        setCreditsState(hydratedBalance)
      } catch (err) {
        // If hydration fails, don't fall back to localStorage
        console.error('[ScanPage] Credit hydration failed:', err instanceof Error ? err.message : err)
      } finally {
        setIsLoadingCredits(false)
      }
    }

    loadCredits()

    // Subscribe to credit changes (from other components)
    unsubscribe = subscribeCredits(() => {
      const updated = getCredits()
      console.log('[ScanPage] Credits updated via subscription:', updated)
      setCreditsState(updated)
    })

    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [])

  const handleScan = async () => {
    if (!url.trim()) {
      setScanError('Please enter a valid URL')
      return
    }

    setIsScanning(true)
    setScanError(null)
    setStatus('Checking credit balance...')
    setProgress(5)
    setFindings([])

    try {
      // First, check credits and email
      const checkResponse = await fetch('/api/check-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: localStorage.getItem('user_email') || '' }),
      })

      if (!checkResponse.ok) {
        const errorData = await checkResponse.json().catch(() => ({ error: 'Authentication required' }))
        setScanError(errorData.error || 'Please log in to scan')
        setStatus('Ready for inspection')
        setIsScanning(false)
        setProgress(0)
        return
      }

      const checkData = await checkResponse.json()
      const userEmail = checkData.email
      const currentCredits = checkData.credits || 0

      if (currentCredits < 1) {
        setScanError('No credits available. Purchase credits to continue scanning.')
        setStatus('Ready for inspection')
        setIsScanning(false)
        setProgress(0)
        return
      }

      // Now run the scan with email
      setStatus('Validating target URL...')
      setProgress(12)

      const scanResponse = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          email: userEmail,
          fingerprint: localStorage.getItem('device_fingerprint') || '',
        }),
      })

      // Handle payment required (insufficient credits)
      if (scanResponse.status === 402) {
        const errorData = await scanResponse.json().catch(() => ({ error: 'Insufficient credits' }))
        setScanError(errorData.error || 'Insufficient credits. Purchase more to continue.')
        setStatus('Ready for inspection')
        setIsScanning(false)
        setProgress(0)
        return
      }

      // Handle free trial already used on device
      if (scanResponse.status === 403) {
        const errorData = await scanResponse.json().catch(() => ({ error: 'Access denied' }))
        setScanError(errorData.error || 'Free trial already used on this device. Please purchase credits.')
        setStatus('Ready for inspection')
        setIsScanning(false)
        setProgress(0)
        return
      }

      // Handle other errors
      if (!scanResponse.ok) {
        const errorData = await scanResponse.json().catch(() => ({ error: 'Scan failed' }))
        const errorMessage = errorData.error || `Scan failed (HTTP ${scanResponse.status})`
        setScanError(errorMessage)
        setStatus('Ready for inspection')
        setIsScanning(false)
        setProgress(0)
        return
      }

      // Handle streaming response
      const reader = scanResponse.body?.getReader()
      if (!reader) {
        setScanError('No response stream available')
        setStatus('Ready for inspection')
        setIsScanning(false)
        setProgress(0)
        return
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

          try {
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

            if (payload.type === 'done') {
              setStatus('Scan complete')
              setProgress(100)
              setScore(Number(payload.score || 72))
              setRisk(String(payload.risk || 'Medium risk'))
              setScannedUrl(String(payload.scannedUrl || ''))
              
              // Update credits from backend response (do NOT use localStorage)
              if (payload.creditsRemaining !== undefined) {
                const newBalance = Math.max(0, payload.creditsRemaining)
                console.log('[ScanPage] Credits updated from scan: ', newBalance)
                setCreditsState(newBalance)
                // Store in localStorage for UI consistency only, backend is source of truth
                localStorage.setItem('user_credits', String(newBalance))
              }
              
              setIsScanning(false)
            }
          } catch (parseError) {
            console.warn('Failed to parse payload:', parseError)
          }
        }
      }
    } catch (error) {
      setIsScanning(false)
      const errorMsg = error instanceof Error ? error.message : 'Scan failed'
      setScanError(`Error: ${errorMsg}`)
      setStatus('Ready for inspection')
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 text-white sm:px-6 lg:py-14">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-300">Alpha scan</p>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.06em] text-white sm:text-4xl">Scan My Link — Report Only</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-2">
            <div className="text-xs font-black uppercase tracking-[0.12em] text-emerald-300">{credits} Credits</div>
            <div className="text-[10px] text-emerald-200/70">3 per scan</div>
          </div>
          <button 
            type="button" 
            onClick={handleScan}
            disabled={isScanning || !url.trim()}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isScanning ? 'Scanning...' : 'Scan, Don\'t Touch'}
          </button>
        </div>
      </header>

      <section className="mt-8 rounded-[28px] border border-white/10 bg-[#111214] p-4 shadow-[0_28px_70px_rgba(0,0,0,0.2)] sm:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <label className="sr-only" htmlFor="scan-url">Website URL</label>
          <input
            id="scan-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyPress={(event) => event.key === 'Enter' && handleScan()}
            placeholder="https://example-app.com"
            disabled={isScanning}
            className="min-h-[52px] flex-1 rounded-full border border-white/10 bg-black/20 px-5 text-sm text-white placeholder:text-slate-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button 
            type="button" 
            onClick={handleScan} 
            disabled={isScanning || !url.trim()}
            className="btn-primary min-w-[180px] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isScanning ? 'Scanning...' : 'Scan, Don\'t Touch'}
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
            {isScanning && (
              <div className="space-y-2">
                {SCAN_PHASES.slice(0, Math.ceil((progress / 100) * SCAN_PHASES.length)).map((phase, index) => (
                  <div key={phase} className="rounded-2xl border border-emerald-400/15 bg-emerald-500/5 p-3 text-sm text-emerald-100 transition-all" style={{ opacity: 0.4 + (index / SCAN_PHASES.length) * 0.6 }}>
                    ✓ {phase}
                  </div>
                ))}
              </div>
            )}
            {scanError && (
              <div className="space-y-2">
                <div className="rounded-2xl border border-rose-400/15 bg-rose-500/5 p-3 text-sm text-rose-100">
                  ⚠️ {scanError}
                </div>
                {scanError.toLowerCase().includes('chatgpt') || scanError.toLowerCase().includes('http 403') || scanError.toLowerCase().includes('access denied') ? (
                  <div className="rounded-2xl border border-amber-400/15 bg-amber-500/5 p-3 text-sm text-amber-100">
                    💡 <strong>Tip:</strong> Some sites like ChatGPT use bot detection. Try scanning a public portfolio, blog, or company site instead. Any site accessible to the public without login should work.
                  </div>
                ) : scanError.toLowerCase().includes('timeout') ? (
                  <div className="rounded-2xl border border-amber-400/15 bg-amber-500/5 p-3 text-sm text-amber-100">
                    💡 <strong>Tip:</strong> The site took too long to respond. Try again with a faster, more responsive website.
                  </div>
                ) : scanError.toLowerCase().includes('invalid') || scanError.toLowerCase().includes('valid http or https') ? (
                  <div className="rounded-2xl border border-amber-400/15 bg-amber-500/5 p-3 text-sm text-amber-100">
                    💡 <strong>Tip:</strong> Make sure your URL starts with http:// or https:// (e.g., <code className="font-mono">https://example.com</code>)
                  </div>
                ) : null}
              </div>
            )}
            {!isScanning && !scanError && findings.length === 0 && (
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
            {score !== null && risk ? (
              <>
                <div className="mt-2 flex items-center gap-3">
                  <span className={`text-3xl font-black ${scoreTone}`}>{score}</span>
                  <span className="text-sm text-slate-400">out of 100</span>
                </div>
                <div className="mt-2 text-sm font-semibold">
                  <span className="text-slate-300">Risk: </span>
                  <span className={risk.includes('Low') ? 'text-emerald-300' : risk.includes('Moderate') ? 'text-amber-300' : 'text-rose-300'}>{risk}</span>
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm text-slate-400">Run a scan to see security verdict</p>
            )}
            <div className="mt-3 text-xs text-slate-400">Credits remaining: <span className="text-emerald-300 font-black">{credits}</span></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button 
              type="button" 
              onClick={async () => {
                if (findings.length === 0) {
                  alert('Run a scan first to generate a report')
                  return
                }
                try {
                  const { jsPDF } = await import('jspdf')
                  const doc = new jsPDF()
                  
                  // Title
                  doc.setFontSize(20)
                  doc.text('Security Scan Report', 20, 20)
                  
                  // Date and URL
                  doc.setFontSize(10)
                  doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 32)
                  doc.text(`URL: ${scannedUrl}`, 20, 40)
                  
                  // Score and Risk
                  doc.setFontSize(14)
                  doc.text(`Score: ${score}/100`, 20, 52)
                  doc.text(`Risk Level: ${risk}`, 20, 62)
                  
                  // Findings Section
                  doc.setFontSize(12)
                  doc.text('Findings:', 20, 76)
                  
                  let yPos = 86
                  doc.setFontSize(9)
                  
                  for (const finding of findings) {
                    const severity = finding.severity.toUpperCase()
                    doc.text(`[${severity}] ${finding.label}`, 20, yPos)
                    yPos += 6
                    
                    const lines = doc.splitTextToSize(finding.detail, 170)
                    for (const line of lines) {
                      doc.text(line, 22, yPos)
                      yPos += 5
                    }
                    yPos += 3
                    
                    if (yPos > 270) {
                      doc.addPage()
                      yPos = 20
                    }
                  }
                  
                  doc.save(`scan-report-${new Date().toISOString().split('T')[0]}.pdf`)
                } catch (error) {
                  console.error('PDF download error:', error)
                  alert('Failed to download PDF. Please try again.')
                }
              }}
              disabled={findings.length === 0}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download size={16} className="inline mr-2" />
              Download PDF Report
            </button>
            <button type="button" disabled className="btn-primary opacity-50 cursor-not-allowed">Save to History</button>
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
