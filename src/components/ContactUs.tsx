import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Move, Send, X } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { useAuthOptional } from '../lib/auth'

const ISSUE_OPTIONS = [
  'Payment - No credit',
  'Payment - about:blank#blocked',
  'Credits not showing',
  'Other',
] as const

function getReferenceFromUrl(locationSearch: string) {
  const params = new URLSearchParams(locationSearch)
  return params.get('reference') || params.get('ref') || localStorage.getItem('lastRef') || ''
}

export function openContactUs() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('alphatekx:open-contact-us'))
}

export function ContactForm({ compact = false, onSuccess }: { compact?: boolean; onSuccess?: () => void }) {
  const location = useLocation()
  const auth = useAuthOptional()
  const user = auth?.user ?? null
  const [form, setForm] = useState({
    name: '',
    email: '',
    issueType: ISSUE_OPTIONS[0],
    reference: '',
    message: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const nextName = (user && 'name' in user && user.name) || ''
    const nextEmail = user?.email || ''
    setForm((current) => ({
      ...current,
      name: current.name || nextName,
      email: current.email || nextEmail,
      reference: current.reference || getReferenceFromUrl(location.search),
    }))
  }, [location.search, user])

  const update = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) return
    setSubmitting(true)
    try {
      const payload = { ...form, reference: form.reference.trim() }
      if (payload.reference) localStorage.setItem('lastRef', payload.reference)
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Contact request failed.')
      setSuccess('Sent! 🎉 Your support request is received and our team will respond quickly.')
      setForm((current) => ({ ...current, message: '', reference: current.reference || payload.reference }))
      onSuccess?.()
    } catch (error) {
      setSuccess(error instanceof Error ? error.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={compact ? 'space-y-5' : 'space-y-5'}>
      <div className="space-y-2 text-center">
        <h3 className="text-[20px] font-bold text-white">Need help? We reply in 1 minute ⚡</h3>
        <p className="text-sm text-[#8A8A93]">Didn't see your credits? Don't panic - we got you!</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-left text-sm text-white/80">
            <span className="mb-1.5 block text-xs font-semibold text-[#8A8A93]">Name</span>
            <input value={form.name} onChange={(event) => update('name', event.target.value)} className="h-12 w-full rounded-xl border border-[#24242A] bg-[#0B0B0C] px-3 text-sm text-white placeholder:text-[#6A6A73] outline-none ring-0" placeholder="Your name" />
          </label>
          <label className="block text-left text-sm text-white/80">
            <span className="mb-1.5 block text-xs font-semibold text-[#8A8A93]">Email</span>
            <input value={form.email} onChange={(event) => update('email', event.target.value)} className="h-12 w-full rounded-xl border border-[#24242A] bg-[#0B0B0C] px-3 text-sm text-white placeholder:text-[#6A6A73] outline-none ring-0" placeholder="you@email.com" />
          </label>
        </div>

        <label className="block text-left text-sm text-white/80">
          <span className="mb-1.5 block text-xs font-semibold text-[#8A8A93]">Issue Type</span>
          <select value={form.issueType} onChange={(event) => update('issueType', event.target.value)} className="h-12 w-full rounded-xl border border-[#24242A] bg-[#0B0B0C] px-3 text-sm text-white outline-none">
            {ISSUE_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>

        <label className="block text-left text-sm text-white/80">
          <span className="mb-1.5 block text-xs font-semibold text-[#8A8A93]">Payment Reference</span>
          <input value={form.reference} onChange={(event) => update('reference', event.target.value)} className="h-12 w-full rounded-xl border border-[#24242A] bg-[#0B0B0C] px-3 text-sm text-white placeholder:text-[#6A6A73] outline-none ring-0" placeholder="alphatekx_... (from Paystack or URL)" />
        </label>

        <label className="block text-left text-sm text-white/80">
          <span className="mb-1.5 block text-xs font-semibold text-[#8A8A93]">Message</span>
          <textarea value={form.message} onChange={(event) => update('message', event.target.value)} rows={4} className="w-full rounded-xl border border-[#24242A] bg-[#0B0B0C] p-3 text-sm text-white placeholder:text-[#6A6A73] outline-none ring-0" placeholder="I paid ₦100 via Opay but no credit..." />
        </label>

        <button disabled={submitting} type="submit" className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold text-black transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-70">
          <Send size={16} /> {submitting ? 'Sending...' : 'Send - Reply in 1 min'}
        </button>

        {success && <p className="text-left text-sm text-emerald-300">{success}</p>}
      </form>
    </div>
  )
}

export default function ContactUs() {
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [position, setPosition] = useState({ x: 24, y: 24 })
  const [isMobile, setIsMobile] = useState(false)
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener('alphatekx:open-contact-us', handler)
    return () => window.removeEventListener('alphatekx:open-contact-us', handler)
  }, [])

  useEffect(() => {
    if (!open) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)')
    const update = () => setIsMobile(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!dragging || isMobile) return

    const handleMove = (event: MouseEvent) => {
      if (!dragStart.current) return
      const deltaX = event.clientX - dragStart.current.x
      const deltaY = event.clientY - dragStart.current.y
      dragStart.current = { x: event.clientX, y: event.clientY }
      setPosition((current) => ({ x: current.x + deltaX, y: current.y + deltaY }))
    }

    const handleUp = () => {
      dragStart.current = null
      setDragging(false)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [dragging, isMobile])



  if (location.pathname.startsWith('/auth')) return null

  const panelClassName = isMobile
    ? 'w-full max-w-none max-h-[92dvh] overflow-y-auto overscroll-contain rounded-t-[24px] border-t border-[#24242A] bg-[#151519] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(0,0,0,0.35)]'
    : 'fixed z-[10000] w-full max-w-[480px] max-h-[90dvh] overflow-y-auto overscroll-contain rounded-[24px] border border-[#24242A] bg-[#151519] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.35)]'

  // Floating draggable button removed — now lives in sidebar for 100% mobile fit. Modal only.

  if (!open) return null
  return (
        <div className={`fixed inset-0 z-[9999] flex ${isMobile ? 'items-end' : 'items-center'} justify-center bg-black/70 p-0 sm:p-4`} onClick={() => setOpen(false)}>
          <div
            ref={panelRef}
            className={panelClassName}
            style={isMobile ? undefined : { left: position.x, top: position.y, transform: 'translate(0, 0)' }}
            onMouseDown={(event) => {
              if (isMobile || (event.target as HTMLElement).closest('button, a, input, textarea, select')) return
              dragStart.current = { x: event.clientX, y: event.clientY }
              setDragging(true)
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-white/80">
                <Move size={14} className="text-[#FFD700]" /> Drag me around
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-full border border-[#24242A] bg-[#0B0B0C] text-[#8A8A93] hover:text-white">
                <X size={14} />
              </button>
            </div>
            <ContactForm compact onSuccess={() => setOpen(false)} />
          </div>
        </div>
  )
}
