import { Key, CreditCard, X } from 'lucide-react'

type Props = {
  open: boolean
  onClose: () => void
  onAddKey: () => void
  onUpgrade: () => void
}

export default function FreeLimitModal({ open, onClose, onAddKey, onUpgrade }: Props) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1A1A1A] p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Free Limit Reached!</h3>
          <button onClick={onClose} className="rounded p-1 text-white/50 hover:bg-white/10" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-white/70">You have used your 2 free posts with our master bots. To continue posting unlimited:</p>
        <div className="mt-6 grid gap-3">
          <button onClick={onAddKey} className="flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-400">
            <Key size={18} /> Add My Own Key — FREE Unlimited
          </button>
          <button onClick={onUpgrade} className="flex items-center justify-center gap-2 rounded-xl btn-alpha px-4 py-3 text-sm font-semibold text-white">
            <CreditCard size={18} /> Upgrade to Pro — 100 extra posts
          </button>
        </div>
      </div>
    </div>
  )
}
