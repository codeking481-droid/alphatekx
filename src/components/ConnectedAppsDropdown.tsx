import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown, Layers, Search, X } from 'lucide-react'
import { cn } from '../lib/utils'

export type ConnectedAppItem = {
  id: string
  name: string
  icon: ReactNode
  status: 'available' | 'coming-soon' | 'connected' | string
}

type Props = {
  title?: string
  subtitle?: string
  items: ConnectedAppItem[]
  defaultSelected?: string[]
  allowSetDefault?: boolean
  storageKey?: string
  onSelectionChange?: (ids: string[]) => void
}

const statusBadge = (status: string) => {
  if (status === 'connected') return { label: 'Connected', className: 'bg-emerald-500/15 text-emerald-400' }
  if (status === 'coming-soon') return { label: 'Coming Soon', className: 'bg-white/[0.15] text-white/55' }
  return { label: 'Available', className: 'bg-white/[0.15] text-white/55' }
}

export default function ConnectedAppsDropdown({
  title,
  subtitle,
  items,
  defaultSelected = [],
  allowSetDefault = true,
  storageKey = 'alphatekx-default-platforms',
  onSelectionChange,
}: Props) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>(defaultSelected)
  const [query, setQuery] = useState('')
  const [savedNotice, setSavedNotice] = useState('')
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) setSelected(parsed)
      }
    } catch {}
  }, [storageKey])

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  useEffect(() => {
    onSelectionChange?.(selected)
  }, [selected])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((app) => app.name.toLowerCase().includes(q))
  }, [query, items])

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id]))
    setSavedNotice('')
  }

  const clearAll = () => {
    setSelected([])
    setSavedNotice('')
  }

  const saveDefault = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(selected))
      setSavedNotice('Saved as default.')
    } catch {}
  }

  const selectedApps = useMemo(() => items.filter((app) => selected.includes(app.id)), [selected, items])
  const triggerIcon = selectedApps.length === 1 ? selectedApps[0].icon : <Layers size={20} />
  const triggerLabel = selectedApps.length === 0 ? 'Select platforms' : selectedApps.length === 1 ? selectedApps[0].name : `${selectedApps.length} platforms selected`

  return (
    <div className="mx-auto w-full max-w-2xl">
      {title && (
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">{title}</h2>
          {subtitle && <p className="mt-4 text-white/70">{subtitle}</p>}
        </div>
      )}

      <div ref={wrapperRef} className={cn('relative w-full', title && 'mt-12')}>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            'flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-4 text-left transition hover:bg-white/[0.08]',
            open && 'ring-1 ring-violet-500/50'
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className={cn('grid h-10 w-10 place-items-center rounded-xl', selectedApps.length ? 'bg-gradient-to-br from-violet-900/40 to-fuchsia-900/40 text-violet-300' : 'bg-white/[0.15] text-white/55')}>
              {triggerIcon}
            </span>
            <span className={cn('truncate font-medium', selectedApps.length ? 'text-white' : 'text-white/70')}>{triggerLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            {selectedApps.length > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); clearAll() }}
                className="rounded-lg p-1 text-white/50 hover:bg-white/10 hover:text-white"
                aria-label="Clear selection"
              >
                <X size={16} />
              </button>
            )}
            <ChevronDown size={20} className={cn('text-white/70 transition-transform', open && 'rotate-180')} />
          </div>
        </button>

        {open && (
          <div
            role="listbox"
            className="absolute left-0 right-0 top-full z-20 mt-2 flex max-h-96 flex-col rounded-2xl border border-white/10 bg-[#0B0215]/95 p-2 shadow-2xl backdrop-blur-2xl"
          >
            <div className="relative p-2 pb-1">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search platforms..."
                className="w-full rounded-xl border border-white/10 bg-white/[0.06] py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-violet-500/50"
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2 pt-1">
              {filtered.map((app) => {
                const isSelected = selected.includes(app.id)
                const badge = statusBadge(app.status)
                return (
                  <div
                    key={app.id}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => toggle(app.id)}
                    className={cn(
                      'flex cursor-pointer items-center justify-between rounded-xl border-b border-white/[0.06] px-3 py-3 transition last:border-0 hover:bg-white/[0.08]',
                      isSelected && 'bg-white/[0.08]'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          'grid h-5 w-5 place-items-center rounded-md border',
                          isSelected ? 'border-violet-500 bg-violet-500/20 text-violet-300' : 'border-white/20 text-transparent'
                        )}
                      >
                        <Check size={12} strokeWidth={3} />
                      </span>
                      <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/[0.15] text-white/55">
                        {app.icon}
                      </span>
                      <span className="text-sm font-medium text-white">{app.name}</span>
                    </div>
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', badge.className)}>{badge.label}</span>
                  </div>
                )
              })}
              {!filtered.length && (
                <p className="py-6 text-center text-sm text-white/50">No platforms match "{query}".</p>
              )}
            </div>

            {allowSetDefault && (
              <div className="border-t border-white/[0.08] p-2">
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={saveDefault}
                    disabled={selected.length === 0}
                    className="flex-1 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 transition hover:scale-[1.02] disabled:opacity-40"
                  >
                    Set as default
                  </button>
                  <button
                    onClick={clearAll}
                    className="rounded-xl border border-white/10 px-3 py-2 text-sm text-white/70 transition hover:bg-white/[0.08]"
                  >
                    Clear
                  </button>
                </div>
                {savedNotice && <p className="mt-2 text-center text-xs text-emerald-400">{savedNotice}</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
