import React from 'react'

const cx = (...classes) => classes.filter(Boolean).join(' ')

const icons = {
  menu: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  close: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  search: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  user: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  chevron: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
}

function Sidebar({ items = [], current, onChange, mobileOpen, onMobileClose, brand, className }) {
  const [open, setOpen] = React.useState(false)
  const active = mobileOpen || open
  const handle = (id) => { onChange?.(id); setOpen(false); onMobileClose?.() }
  return (
    <>
      <button onClick={() => setOpen(!open)} className="fixed left-4 top-3 z-50 rounded-lg bg-white/10 p-2 text-white md:hidden" aria-label="Menu">{icons.menu}</button>
      <aside className={cx('fixed inset-y-0 left-0 z-40 w-64 transform border-r border-white/10 bg-[#0A0A0A] p-4 transition-transform duration-200 md:static md:translate-x-0', active ? 'translate-x-0' : '-translate-x-full', className)}>
        <div className="mb-6 flex items-center justify-between px-2">
          <span className="text-lg font-bold text-white">{brand || 'Alpha'}</span>
          <button onClick={() => { setOpen(false); onMobileClose?.() }} className="rounded p-1 text-zinc-400 md:hidden">{icons.close}</button>
        </div>
        <nav className="space-y-1">
          {items.map((item) => (
            <button key={item.id} onClick={() => handle(item.id)} className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors', current === item.id ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white')}>
              <span className="grid h-6 w-6 place-items-center">{item.icon || icons.user}</span>
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      {active && <div onClick={() => { setOpen(false); onMobileClose?.() }} className="fixed inset-0 z-30 bg-black/60 md:hidden" />}
    </>
  )
}

function Topbar({ title, subtitle, children, className }) {
  return (
    <header className={cx('flex min-h-16 items-center justify-between gap-3 border-b border-white/10 bg-[#0A0A0A]/80 px-4 py-3 backdrop-blur-xl', className)}>
      <div className="min-w-0 pl-10 md:pl-0">
        <h2 className="truncate text-sm font-semibold text-white">{title}</h2>
        {subtitle && <p className="text-xs text-zinc-500">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </header>
  )
}

function Card({ title, children, className }) {
  return (
    <div className={cx('rounded-2xl border border-white/[0.08] bg-[#151515] p-4 text-zinc-100', className)}>
      {title && <h3 className="mb-3 text-sm font-semibold">{title}</h3>}
      {children}
    </div>
  )
}

function StatCard({ label, value, change, className }) {
  return (
    <div className={cx('rounded-2xl border border-white/[0.08] bg-[#151515] p-5', className)}>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-white">{value ?? 0}</div>
      {change !== undefined && <div className="mt-1 text-xs text-emerald-400">{change}</div>}
    </div>
  )
}

function Button({ children, onClick, variant = 'primary', className, type = 'button', disabled }) {
  const styles = {
    primary: 'bg-indigo-500 text-white hover:bg-indigo-400',
    secondary: 'bg-white/5 text-zinc-200 hover:bg-white/10 border border-white/10',
    danger: 'bg-red-500/20 text-red-300 hover:bg-red-500/30',
    ghost: 'text-zinc-400 hover:text-white hover:bg-white/5'
  }
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={cx('rounded-xl px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40', styles[variant] || styles.primary, className)}>
      {children}
    </button>
  )
}

function Input({ value, onChange, placeholder, type = 'text', className }) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={cx('w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-indigo-400/40', className)}
    />
  )
}

function Table({ columns = [], rows = [], onRowClick }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm text-zinc-300">
        <thead className="border-b border-white/10 text-xs text-zinc-500">
          <tr>{columns.map((c, i) => <th key={c.key || i} className="px-3 py-2 font-medium">{c.title}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((row, ri) => (
            <tr key={ri} onClick={() => onRowClick?.(row)} className="cursor-pointer hover:bg-white/[0.03]">
              {columns.map((c, ci) => {
                const raw = Array.isArray(row) ? row[ci] : row[c.key]
                const cell = c.render ? c.render(raw, row) : raw
                return <td key={c.key || ci} className="px-3 py-2">{typeof cell === 'object' && cell !== null && !React.isValidElement(cell) ? JSON.stringify(cell) : cell}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <div className="px-3 py-4 text-xs text-zinc-500">No data</div>}
    </div>
  )
}

function Kanban({ columns = [], cards = [], onMove }) {
  return (
    <div className="grid auto-cols-fr gap-4 md:grid-flow-col">
      {columns.map((col) => (
        <div key={col.id} className="min-w-0 rounded-2xl border border-white/10 bg-[#151515] p-3">
          <h4 className="mb-3 text-xs font-semibold uppercase text-zinc-500">{col.title}</h4>
          <div className="space-y-2">
            {cards.filter((c) => c.columnId === col.id).map((card) => (
              <div key={card.id} className="rounded-xl bg-white/5 p-3 text-sm text-zinc-200">{card.title}</div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Chart({ type = 'bar', data = [], labels = [] }) {
  const max = Math.max(1, ...data.map(Number))
  const safe = data.map((d) => Number(d) || 0)
  if (type === 'line') {
    const width = 300, height = 120, pad = 8
    const points = safe.map((d, i) => `${pad + (i * (width - pad * 2)) / Math.max(1, safe.length - 1)},${height - pad - (d / max) * (height - pad * 2)}`).join(' ')
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full" preserveAspectRatio="none">
        <polyline fill="none" stroke="#6366F1" strokeWidth="2" points={points} />
      </svg>
    )
  }
  if (type === 'pie' || type === 'doughnut') {
    const total = safe.reduce((a, b) => a + b, 0) || 1
    let acc = 0
    const colors = ['#6366F1', '#8B5CF6', '#EC4899', '#3B82F6', '#10B981', '#F59E0B']
    const arcs = safe.map((d, i) => {
      const start = (acc / total) * 360
      const angle = (d / total) * 360
      acc += d
      const rad = (Math.PI / 180) * (start + angle / 2 - 90)
      const x = 50 + 30 * Math.cos(rad)
      const y = 50 + 30 * Math.sin(rad)
      const large = angle > 180 ? 1 : 0
      const endX = 50 + 35 * Math.cos((Math.PI / 180) * (start + angle - 90))
      const endY = 50 + 35 * Math.sin((Math.PI / 180) * (start + angle - 90))
      const startX = 50 + 35 * Math.cos((Math.PI / 180) * (start - 90))
      const startY = 50 + 35 * Math.sin((Math.PI / 180) * (start - 90))
      const path = `M 50 50 L ${startX} ${startY} A 35 35 0 ${large} 1 ${endX} ${endY} Z`
      return <path key={i} d={path} fill={colors[i % colors.length]} opacity="0.85" />
    })
    return <svg viewBox="0 0 100 100" className="h-40 w-full">{arcs}</svg>
  }
  return (
    <div className="flex h-40 items-end gap-2">
      {safe.map((d, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1">
          <div className="w-full rounded-t bg-indigo-500/80 transition-all" style={{ height: `${(d / max) * 100}%` }} />
          {labels[i] && <span className="max-w-full truncate text-[10px] text-zinc-500">{labels[i]}</span>}
        </div>
      ))}
    </div>
  )
}

function Modal({ open, onClose, title, children }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-[#151515] p-5 text-zinc-100" onClick={(e) => e.stopPropagation()}>
        {title && <h3 className="mb-4 text-lg font-semibold">{title}</h3>}
        {children}
      </div>
    </div>
  )
}

function Tabs({ tabs = [], active, onChange }) {
  return (
    <div className="flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange?.(t.id)} className={cx('rounded-lg px-4 py-1.5 text-xs font-medium transition-colors', active === t.id ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white')}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

function Search({ value, onChange, placeholder }) {
  return (
    <div className="relative flex items-center">
      <span className="absolute left-3 text-zinc-500">{icons.search}</span>
      <input value={value} onChange={onChange} placeholder={placeholder} className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500" />
    </div>
  )
}

function Avatar({ name, image, size = 32 }) {
  const initials = String(name || '?').split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div className="grid place-items-center rounded-full bg-indigo-500 text-white" style={{ width: size, height: size, fontSize: Math.max(10, size / 3) }}>
      {image ? <img src={image} alt={name} className="h-full w-full rounded-full object-cover" /> : <span>{initials}</span>}
    </div>
  )
}

function Badge({ children, variant = 'default' }) {
  const styles = { default: 'bg-zinc-700 text-zinc-300', success: 'bg-emerald-500/20 text-emerald-300', warning: 'bg-amber-500/20 text-amber-300', danger: 'bg-red-500/20 text-red-300' }
  return <span className={cx('rounded-full px-2 py-0.5 text-[10px] font-medium', styles[variant] || styles.default)}>{children}</span>
}

function Empty({ message = 'No items yet' }) {
  return <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">{message}</div>
}

function Skeleton({ count = 3 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-10 w-full animate-pulse rounded-xl bg-white/5" />
      ))}
    </div>
  )
}

const AlphaUI = { Sidebar, Topbar, Card, StatCard, Button, Input, Table, Kanban, Chart, Modal, Tabs, Search, Avatar, Badge, Empty, Skeleton }

if (typeof window !== 'undefined') window.AlphaUI = AlphaUI

export default AlphaUI
