import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Bug, Camera, Download, FileText, Lock, Radar, ShieldCheck, Sparkles } from 'lucide-react'
import { getCredits, setCredits, hydrateCredits, subscribeCredits } from '../lib/creditStore'
import { useAuth } from '../lib/auth'
import CreditsExhaustedModal from '../components/CreditsExhaustedModal'
import ScanningOverlay from '../components/scan/ScanningOverlay'
import RestoreEngineWizard from '../components/scan/RestoreEngineWizard'

type ScanFinding = {
  id: string
  label: string
  detail: string
  consequence?: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  url?: string
  status?: number
  maskedProof?: string | null
  lineNumber?: number | null
  screenshot?: string | null
}

const SEVERITY_TONE: Record<string, string> = {
  critical: 'bg-rose-500/10 text-rose-300',
  high: 'bg-orange-500/10 text-orange-300',
  medium: 'bg-amber-500/10 text-amber-300',
  low: 'bg-sky-500/10 text-sky-300',
  info: 'bg-slate-500/10 text-slate-300',
}

export default function ScanPage() {
  const { user, loading: authLoading } = useAuth()
  const [url, setUrl] = useState('https://example-app.com')
  const [isScanning, setIsScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [findings, setFindings] = useState<ScanFinding[]>([])
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [scanId, setScanId] = useState<string | null>(null)
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
  const [showCreditsExhaustedModal, setShowCreditsExhaustedModal] = useState(false)
  const [mode, setMode] = useState<'report' | 'restore'>('report')
  const [restoreScan, setRestoreScan] = useState<any | null>(null)
  const [restorePlan, setRestorePlan] = useState<any | null>(null)
  const [fixResult, setFixResult] = useState<any | null>(null)
  const [isFixing, setIsFixing] = useState(false)
  const [verifyResult, setVerifyResult] = useState<any | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)

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

    const activeEmail = String(user?.email || '').trim().toLowerCase()
    if (authLoading || !activeEmail) {
      setScanError('Please sign in to continue scanning.')
      setStatus('Ready for inspection')
      return
    }

    if (mode === 'restore') {
      await handleRestoreScan(url.trim(), activeEmail)
      return
    }

    setIsScanning(true)
    setScanError(null)
    setStatus('Checking credit balance...')
    setProgress(5)
    setFindings([])
    setScanId(null)

    try {
      const checkResponse = await fetch('/api/check-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: activeEmail }),
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
        setShowCreditsExhaustedModal(true)
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
      let lastEventAt = Date.now()
      let staleMessageShown = false
      let receivedDone = false
      let receivedError: string | null = null

      const staleCheck = () => {
        const elapsedSinceEvent = Date.now() - lastEventAt
        if (elapsedSinceEvent > 90000) {
          throw new Error('The scan stopped responding. Please try again — the site may be blocking automated scanning.')
        }
        if (elapsedSinceEvent > 45000 && !staleMessageShown) {
          staleMessageShown = true
          setStatus('Still working... the site is responding slowly. Hang tight (up to ~75s).')
        }
      }

      while (true) {
        const { value, done, timedOut } = await Promise.race([
          reader.read(),
          new Promise((resolve) => setTimeout(() => resolve({ value: undefined, done: false, timedOut: true }), 5000)),
        ])
        if (timedOut) {
          staleCheck()
          continue
        }
        if (done) break
        lastEventAt = Date.now()

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''

        for (const part of parts) {
          const lines = part.split('\n').filter(Boolean)
          const event = lines.find((line) => line.startsWith('data:'))
          if (!event) continue

          try {
            const payload = JSON.parse(event.replace(/^data:\s*/, ''))

            if (payload.type === 'error' || payload.error) {
              receivedError = String(payload.error || 'Scan failed')
              setScanError(receivedError)
              setStatus('Ready for inspection')
              setProgress(0)
              setIsScanning(false)
              break
            }

            if (payload.type === 'progress') {
              setProgress(Number(payload.progress || 0))
              setStatus(payload.message || 'Scanning...')
            }

            if (payload.type === 'started') {
              setScanId(String(payload.scanId || ''))
            }

            if (payload.type === 'finding') {
              setFindings((current) => [{
                id: payload.id || `${payload.findingType || 'finding'}-${current.length}`,
                severity: payload.severity || 'info',
                label: payload.title || 'Finding',
                detail: payload.meaning || '',
                consequence: payload.consequence || '',
                url: payload.url,
                status: payload.status,
                maskedProof: payload.maskedProof ?? null,
                lineNumber: payload.lineNumber ?? null,
                screenshot: payload.screenshot ?? null,
              }, ...current])
            }

            if (payload.type === 'done') {
              receivedDone = true
              setStatus('Scan complete')
              setProgress(100)
              setScore(Number(payload.score ?? 0))
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

      // Stream ended without a completed scan (server timeout / proxy reset).
      if (!receivedDone) {
        if (!receivedError) {
          setScanError('The scan ended before it finished. Please try again — the site may be blocking automated scanning or the server timed out.')
          setStatus('Ready for inspection')
        }
        setIsScanning(false)
      }
    } catch (error) {
      setIsScanning(false)
      const errorMsg = error instanceof Error ? error.message : 'Scan failed'
      setScanError(`Error: ${errorMsg}`)
      setStatus('Ready for inspection')
    }
  }

  const handleRestoreScan = async (targetUrl: string, activeEmail: string) => {
    setIsScanning(true)
    setScanError(null)
    setFindings([])
    setRestoreScan(null)
    setStatus('Checking credit balance...')
    setProgress(8)
    resetRestoreActions()

    const controller = new AbortController()
    let abortedByTimeout = false
    const scanTimeout = setTimeout(() => {
      abortedByTimeout = true
      controller.abort()
    }, 150000)
    const heartbeat = setInterval(() => {
      setProgress((current) => Math.min(92, Math.max(current, 25) + 4))
      setStatus('Still scanning with a real browser — checking 25 sensitive files, JS bundles, git history and live keys. Can take up to ~90s.')
    }, 3500)
    const cleanup = () => {
      clearTimeout(scanTimeout)
      clearInterval(heartbeat)
    }

    try {
      const checkResponse = await fetch('/api/check-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: activeEmail }),
      })
      if (!checkResponse.ok) {
        const errorData = await checkResponse.json().catch(() => ({ error: 'Authentication required' }))
        cleanup()
        setScanError(errorData.error || 'Please log in to scan')
        setStatus('Ready for inspection')
        setIsScanning(false)
        setProgress(0)
        return
      }
      const checkData = await checkResponse.json()
      if ((checkData.credits || 0) < 1) {
        cleanup()
        setShowCreditsExhaustedModal(true)
        setStatus('Ready for inspection')
        setIsScanning(false)
        setProgress(0)
        return
      }

      setStatus('Launching a real browser...')
      setProgress(20)

      const scanResponse = await fetch('/api/restore/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: targetUrl,
          email: activeEmail,
          fingerprint: localStorage.getItem('device_fingerprint') || '',
        }),
        signal: controller.signal,
      })

      if (scanResponse.status === 402) {
        const errorData = await scanResponse.json().catch(() => ({ error: 'Insufficient credits' }))
        cleanup()
        setScanError(errorData.error || 'Insufficient credits. Purchase more to continue.')
        setStatus('Ready for inspection')
        setIsScanning(false)
        setProgress(0)
        return
      }
      if (scanResponse.status === 403) {
        const errorData = await scanResponse.json().catch(() => ({ error: 'Access denied' }))
        cleanup()
        setScanError(errorData.error || 'Free trial already used on this device. Please purchase credits.')
        setStatus('Ready for inspection')
        setIsScanning(false)
        setProgress(0)
        return
      }
      if (!scanResponse.ok) {
        const errorData = await scanResponse.json().catch(() => ({ error: 'Scan failed' }))
        cleanup()
        setScanError(errorData.error || `Scan failed (HTTP ${scanResponse.status})`)
        setStatus('Ready for inspection')
        setIsScanning(false)
        setProgress(0)
        return
      }

      const data = await scanResponse.json()
      cleanup()
      setProgress(100)
      setStatus('Scan complete')
      setRestoreScan(data.scan || null)
      setRestorePlan(data.plan || null)
      if (data.scanId) setScanId(String(data.scanId))
      setScannedUrl(String(data.scan?.url || targetUrl))
      setScore(data.scan?.score ?? null)
      setRisk(data.scan?.risk ?? null)

      if (data.creditsRemaining !== undefined) {
        const newBalance = Math.max(0, data.creditsRemaining)
        setCreditsState(newBalance)
        localStorage.setItem('user_credits', String(newBalance))
      }
      setIsScanning(false)
    } catch (error) {
      cleanup()
      setIsScanning(false)
      setProgress(0)
      if (error instanceof DOMException && error.name === 'AbortError') {
        setScanError(
          abortedByTimeout
            ? 'The scan took too long and was cancelled. The site may be slow or blocking automated scanning. Please try again.'
            : 'The scan was cancelled.'
        )
      } else {
        const errorMsg = error instanceof Error ? error.message : 'Scan failed'
        setScanError(`Error: ${errorMsg}`)
      }
      setStatus('Ready for inspection')
    }
  }

  const resetRestoreActions = () => {
    setFixResult(null)
    setVerifyResult(null)
  }

  const handleRunFix = async () => {
    if (!scanId || !user?.email) return
    setIsFixing(true)
    setScanError(null)
    try {
      const response = await fetch('/api/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: String(user.email).trim().toLowerCase(),
          scanId,
          maskedSecretsLabel: `${restoreScan?.liveSecrets?.filter((s: any) => s.isLive).length || 0} live secrets`,
        }),
      })
      const data = await response.json()
      if (!response.ok) setScanError(data.error || 'Fix failed')
      setFixResult(data.fix || null)
    } catch (error) {
      setScanError(`Error: ${error instanceof Error ? error.message : 'Fix failed'}`)
    } finally {
      setIsFixing(false)
    }
  }

  const handleVerify = async () => {
    if (!scanId || !user?.email) return
    setIsVerifying(true)
    setScanError(null)
    try {
      const response = await fetch(`/api/verify/${scanId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: String(user.email).trim().toLowerCase() }),
      })
      const data = await response.json()
      if (!response.ok) setScanError(data.error || 'Verification failed')
      else setVerifyResult(data)
    } catch (error) {
      setScanError(`Error: ${error instanceof Error ? error.message : 'Verification failed'}`)
    } finally {
      setIsVerifying(false)
    }
  }

  return (
    <main className="w-full bg-[#0A0A14] px-4 pb-10 pt-4 text-white sm:px-6 lg:px-8">
      <ScanningOverlay
        active={isScanning}
        target={url}
        progress={progress}
        message={status}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled((current) => !current)}
        inline
      />
      <div className="mx-auto w-full max-w-[1500px] rounded-[28px] border border-violet-300/20 bg-[radial-gradient(circle_at_top,_rgba(123,92,255,0.38),_rgba(17,19,31,0.9)_36%,_rgba(2,6,14,1)_72%)] p-3 shadow-[0_32px_120px_rgba(76,29,149,0.28)] ring-1 ring-white/5 backdrop-blur-sm sm:p-5">
        <header className="flex flex-col gap-4 rounded-[18px] border border-violet-300/20 bg-[#171922]/80 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] md:flex-row md:items-center md:justify-between md:px-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-300">Alpha scan</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.06em] text-white sm:text-4xl">Scan My Link — Report Only</h1>
          </div>
          <div className="flex items-center gap-3 self-start md:self-auto">
            <div className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-2">
              <div className="text-xs font-black uppercase tracking-[0.12em] text-emerald-300">{credits} Credits</div>
              <div className="text-[10px] text-emerald-200/70">1 per scan</div>
            </div>
            <div className="flex rounded-full border border-violet-300/20 bg-black/20 p-1">
              <button
                type="button"
                onClick={() => setMode('report')}
                className={`rounded-full px-3 py-1.5 text-xs font-black transition ${mode === 'report' ? 'bg-violet-500 text-white shadow-[0_10px_24px_rgba(109,40,217,0.4)]' : 'text-slate-400 hover:text-white'}`}
              >
                Report Only
              </button>
              <button
                type="button"
                onClick={() => setMode('restore')}
                className={`rounded-full px-3 py-1.5 text-xs font-black transition ${mode === 'restore' ? 'bg-rose-500 text-white shadow-[0_10px_24px_rgba(225,29,72,0.4)]' : 'text-slate-400 hover:text-white'}`}
              >
                Restore Engine
              </button>
            </div>
            <button
              type="button"
              onClick={handleScan}
              disabled={isScanning || !url.trim() || authLoading || !user?.email}
              className="rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-2.5 text-sm font-black text-white shadow-[0_18px_38px_rgba(109,40,217,0.4)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isScanning ? 'Scanning...' : authLoading ? 'Checking sign-in...' : !user?.email ? 'Sign in to scan' : 'Scan, Don\'t Touch'}
            </button>
          </div>
        </header>

        <section className="mt-6 rounded-[22px] border border-violet-300/20 bg-[#111522]/70 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <label className="sr-only" htmlFor="scan-url">Website URL</label>
            <input
              id="scan-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyPress={(event) => event.key === 'Enter' && handleScan()}
              placeholder="https://example-app.com"
              disabled={isScanning}
              className="min-h-[52px] flex-1 rounded-full border border-violet-200/15 bg-black/20 px-5 text-sm text-white placeholder:text-slate-500 outline-none ring-0 transition focus:border-violet-300/40 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handleScan}
              disabled={isScanning || !url.trim()}
              className="rounded-full bg-[#1a1c2d] px-5 py-3 text-sm font-black text-white ring-1 ring-violet-300/20 transition hover:bg-[#1f2133] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isScanning ? 'Scanning...' : 'Scan, Don\'t Touch'}
            </button>
          </div>
        </section>

        <section className="mt-8 grid gap-5 xl:grid-cols-[1.3fr_0.9fr]">
          <div className="rounded-[28px] border border-violet-200/20 bg-[#0b0d14]/80 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
            <div className="relative overflow-hidden rounded-[22px] border border-emerald-400/20 bg-[#07120e] p-3">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(52,211,153,0.12),transparent_52%)]" />
              {mode === 'restore' && restoreScan ? (
                <div className="relative h-[420px] overflow-hidden rounded-[18px] border border-white/10 bg-[#0a1111]">
                  {restoreScan.screenshotPath ? (
                    <img src={restoreScan.screenshotPath} alt={`Screenshot proof of ${restoreScan.url}`} className="h-full w-full object-cover object-top" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <div className="text-center">
                        <div className={`mx-auto mb-4 grid size-16 place-items-center rounded-full border ${restoreScan.isExposed ? 'border-rose-400/30 bg-rose-500/10 text-rose-300' : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'}`}>
                          {restoreScan.isExposed ? <Bug size={28} /> : <ShieldCheck size={28} />}
                        </div>
                        <p className="text-xl font-black text-white">{restoreScan.url}</p>
                      </div>
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-4 pt-12">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-black text-white">{restoreScan.url}</p>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${restoreScan.isExposed ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                        HTTP {restoreScan.statusCode} {restoreScan.isExposed ? 'EXPOSED' : 'CLEAN'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
              <div className="relative h-[420px] overflow-hidden rounded-[18px] border border-white/10 bg-[#0a1111]">
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full border border-emerald-400/30 bg-emerald-500/10 text-emerald-300">
                      <Radar size={28} />
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
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-violet-200/20 bg-[#0b0d14]/80 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-300">Live findings</p>
                <h2 className="mt-2 text-xl font-black text-white">{status}</h2>
              </div>
              <div className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-black text-emerald-300">{progress}%</div>
            </div>

            <div className="mt-5 space-y-3">
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
              {mode === 'restore' && restoreScan && !isScanning && (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-rose-400/15 bg-rose-500/5 p-3">
                    <div className="flex items-center gap-2 text-sm font-black text-white"><Bug size={16} className="text-rose-300" /> Exposure proof</div>
                    <p className="mt-2 text-xs leading-5 text-slate-300">{restoreScan.summary}</p>
                    {restoreScan.maskedValue && (
                      <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-400/20 bg-black/30 px-3 py-2">
                        <Lock size={14} className="shrink-0 text-rose-300" />
                        <code className="truncate font-mono text-xs text-rose-200">{restoreScan.maskedValue}</code>
                      </div>
                    )}
                  </div>

                  {restoreScan.exposedPaths?.length > 0 && (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Sensitive files returning HTTP 200</p>
                      <div className="mt-2 space-y-1.5">
                        {restoreScan.exposedPaths.map((path: any) => (
                          <div key={path.path} className="flex items-center justify-between gap-2 rounded-lg bg-rose-500/5 px-2.5 py-1.5">
                            <code className="truncate font-mono text-xs text-slate-200">{path.path}</code>
                            <div className="flex shrink-0 items-center gap-2">
                              {path.maskedValue && <span className="hidden truncate font-mono text-[10px] text-rose-300/80 sm:inline">{path.maskedValue}</span>}
                              <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-black text-rose-300">HTTP {path.statusCode}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {restoreScan.secrets?.length > 0 && (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Secrets found in JS bundles ({restoreScan.secrets.length})</p>
                      <div className="mt-2 space-y-1.5">
                        {restoreScan.secrets.slice(0, 6).map((secret: any, index: number) => (
                          <div key={`${secret.kind}-${index}`} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5">
                            <span className="truncate text-xs text-slate-200">{secret.kind}</span>
                            <code className="shrink-0 font-mono text-[10px] text-amber-300">{secret.maskedValue}</code>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {restorePlan && (
                    <div className="rounded-2xl border border-violet-400/15 bg-violet-500/5 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-300">Your plan</p>
                        <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-black text-violet-200">{restorePlan.name}</span>
                      </div>
                      <p className="mt-2 text-xs text-slate-300">{restorePlan.scans === Infinity || restorePlan.scans >= 999999 ? 'Unlimited scans' : `${restorePlan.scans} scans`} per billing cycle.</p>
                    </div>
                  )}
                </div>
              )}
              {!isScanning && !scanError && findings.length === 0 && (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-slate-400">No findings yet. Run the scan to inspect the target for leaks and performance risks.</div>
              )}
              {findings.map((finding) => (
                <div key={finding.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-black text-white">{finding.label}</p>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${SEVERITY_TONE[finding.severity] || SEVERITY_TONE.info}`}>
                      {finding.severity}
                    </span>
                  </div>
                  {finding.url && (
                    <p className="mt-2 break-all font-mono text-[11px] text-slate-400">
                      {finding.url}
                      {finding.status ? <span className="ml-2 text-emerald-300">{finding.status} OK</span> : null}
                    </p>
                  )}
                  {finding.maskedProof && (
                    <p className="mt-2 rounded-xl border border-rose-400/20 bg-rose-500/5 px-3 py-2 font-mono text-xs text-rose-200">
                      {finding.maskedProof}
                      {finding.lineNumber ? <span className="ml-2 text-rose-300/60">line {finding.lineNumber}</span> : null}
                    </p>
                  )}
                  <p className="mt-2 text-sm text-slate-300">{finding.detail}</p>
                  {finding.consequence && (
                    <p className="mt-2 text-sm font-semibold text-amber-200/90">{finding.consequence}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {mode === 'restore' && (
          <RestoreEngineWizard
            scan={restoreScan}
            scanId={scanId}
            isScanning={isScanning}
            progress={progress}
            status={status}
            plan={restorePlan}
            onRunFix={handleRunFix}
            isFixing={isFixing}
            fixResult={fixResult}
            onVerify={handleVerify}
            isVerifying={isVerifying}
            verifyResult={verifyResult}
          />
        )}

        <section className="mt-8 rounded-[30px] border border-violet-200/20 bg-[#0c0e15]/80 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
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
              {scanId && <div className="mt-1 font-mono text-[11px] text-slate-500">Scan ID: {scanId}</div>}
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

                    doc.setFontSize(20)
                    doc.text('Security Scan Report', 20, 20)
                    doc.setFontSize(10)
                    doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 32)
                    doc.text(`URL: ${scannedUrl}`, 20, 40)
                    doc.setFontSize(14)
                    doc.text(`Score: ${score}/100`, 20, 52)
                    doc.text(`Risk Level: ${risk}`, 20, 62)
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
                className="rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-2.5 text-sm font-black text-white shadow-[0_18px_38px_rgba(109,40,217,0.4)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download size={16} className="mr-2 inline" />
                Download PDF Report
              </button>
              <button type="button" disabled className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-black text-white opacity-60">Save to History</button>
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

        <CreditsExhaustedModal
          open={showCreditsExhaustedModal}
          onClose={() => setShowCreditsExhaustedModal(false)}
        />
      </div>
    </main>
  )
}
