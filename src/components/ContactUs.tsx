import { useEffect, useMemo, useState } from 'react'
import { Mail, MessageCircle, Send, X } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'

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

function buildWhatsAppLink(reference: string) {
  const base = 'https://wa.me/2349046802069?text=' + encodeURIComponent('Hi AlphaTekX I paid but no credit. Ref: ' + (reference || ''))
  return base
}

export function openContactUs() {
  window.dispatchEvent(new CustomEvent('alphatekx:open-contact-us'))
}

export function ContactForm({ compact = false, onSuccess }: { compact?: boolean; onSuccess?: () => void }) {
  const location = useLocation()
  const { user } = useAuth()
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

  const whatsappLink = useMemo(() => buildWhatsAppLink(form.reference), [form.reference])

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
      setSuccess('Sent! 🎉 We go reply in 1 minute via WhatsApp/Email. Your reference saved, we go add credit manually if needed.')
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

        <div className="pt-2 text-center text-sm text-[#8A8A93]">
          <span>Or chat us instantly:</span>
          <div className="mt-3 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
            <a href={whatsappLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-[#24242A] bg-[#0B0B0C] px-3 py-2 text-white hover:border-white/20">
              <MessageCircle size={14} className="text-emerald-400" /> WhatsApp
            </a>
            <a href="mailto:support@alphatekx.name.ng" className="inline-flex items-center gap-2 rounded-full border border-[#24242A] bg-[#0B0B0C] px-3 py-2 text-white hover:border-white/20">
              <Mail size={14} className="text-violet-300" /> support@alphatekx.name.ng
            </a>
          </div>
        </div>
      </form>
    </div>
  )
}

export default function ContactUs() {
  const location = useLocation()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener('alphatekx:open-contact-us', handler)
    return () => window.removeEventListener('alphatekx:open-contact-us', handler)
  }, [])

  if (location.pathname.startsWith('/auth')) return null

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 left-6 z-[9998] grid h-12 w-12 place-items-center rounded-full bg-white text-black shadow-[0_4px_12px_rgba(0,0,0,0.3)] transition hover:scale-[1.05]"
          aria-label="Contact support"
        >
          <MessageCircle size={20} />
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4">
          <div className="relative w-full max-w-[480px] rounded-[24px] border border-[#24242A] bg-[#151519] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
            <button type="button" onClick={() => setOpen(false)} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full border border-[#24242A] bg-[#0B0B0C] text-[#8A8A93] hover:text-white">
              <X size={14} />
            </button>
            <ContactForm compact onSuccess={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  )
}
