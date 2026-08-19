/**
 * ScreenshotComparison — Before/After side-by-side
 * Shows when both screenshots are captured.
 */

import { useState, useEffect } from 'react'
import { Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react'

export default function ScreenshotComparison({ beforeUrl, afterUrl, verified }) {
  const [loaded, setLoaded] = useState({ before: false, after: false })
  const [errors, setErrors] = useState({ before: false, after: false })
  const [activeTab, setActiveTab] = useState('side-by-side')

  useEffect(() => {
    setLoaded({ before: false, after: false })
    setErrors({ before: false, after: false })
  }, [beforeUrl, afterUrl])

  if (!beforeUrl && !afterUrl) return null

  const bothLoaded = (loaded.before || errors.before) && (loaded.after || errors.after)

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2">
          <Eye size={14} className="text-[#D6FF00]" />
          <span className="font-syne text-[12px] font-bold text-white">Screenshot Verification</span>
        </div>
        <div className="flex items-center gap-2">
          {verified !== null && (
            <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
              verified ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
            }`}>
              {verified ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
              {verified ? 'VERIFIED' : 'NEEDS REVIEW'}
            </span>
          )}
          {beforeUrl && afterUrl && (
            <div className="flex rounded-lg border border-white/[0.06] bg-white/[0.02]">
              <button
                onClick={() => setActiveTab('side-by-side')}
                className={`px-2 py-1 text-[10px] font-bold ${activeTab === 'side-by-side' ? 'text-[#D6FF00]' : 'text-white/30'}`}
              >
                Side by Side
              </button>
              <button
                onClick={() => setActiveTab('before')}
                className={`px-2 py-1 text-[10px] font-bold ${activeTab === 'before' ? 'text-[#D6FF00]' : 'text-white/30'}`}
              >
                Before
              </button>
              <button
                onClick={() => setActiveTab('after')}
                className={`px-2 py-1 text-[10px] font-bold ${activeTab === 'after' ? 'text-[#D6FF00]' : 'text-white/30'}`}
              >
                After
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="p-4">
        {activeTab === 'side-by-side' && beforeUrl && afterUrl ? (
          <div className="grid grid-cols-2 gap-3">
            <ScreenshotPanel label="Before" url={beforeUrl} onLoad={() => setLoaded(p => ({ ...p, before: true }))} onError={() => setErrors(p => ({ ...p, before: true }))} />
            <ScreenshotPanel label="After" url={afterUrl} onLoad={() => setLoaded(p => ({ ...p, after: true }))} onError={() => setErrors(p => ({ ...p, after: true }))} />
          </div>
        ) : (
          <div className="max-h-[400px] overflow-hidden rounded-xl">
            {(activeTab === 'before' || (!afterUrl && beforeUrl)) && beforeUrl && (
              <ScreenshotPanel label="Before" url={beforeUrl} full onLoad={() => setLoaded(p => ({ ...p, before: true }))} onError={() => setErrors(p => ({ ...p, before: true }))} />
            )}
            {(activeTab === 'after' || (!beforeUrl && afterUrl)) && afterUrl && (
              <ScreenshotPanel label="After" url={afterUrl} full onLoad={() => setLoaded(p => ({ ...p, after: true }))} onError={() => setErrors(p => ({ ...p, after: true }))} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ScreenshotPanel({ label, url, full, onLoad, onError }) {
  return (
    <div className={`relative overflow-hidden rounded-xl border border-white/[0.06] ${full ? 'max-h-[400px]' : ''}`}>
      <div className="absolute left-2 top-2 z-10 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white/70 backdrop-blur-sm">
        {label}
      </div>
      <img
        src={url}
        alt={`${label} screenshot`}
        className={`w-full ${full ? 'object-contain' : 'object-cover'} ${full ? 'h-auto' : 'h-48'}`}
        onLoad={onLoad}
        onError={onError}
        loading="lazy"
      />
    </div>
  )
}
