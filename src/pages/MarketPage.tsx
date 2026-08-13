import { useState } from 'react'
import { ArrowRight, MessageSquareText, ShoppingBag, Star } from 'lucide-react'

const products = [
  { id: 1, title: 'Restored SaaS landing page', category: 'Apps', price: '$19', rating: 4.9 },
  { id: 2, title: 'Cinematic product teaser', category: 'Videos', price: '$49', rating: 4.8 },
  { id: 3, title: 'Startup deck template', category: 'Templates', price: '$29', rating: 4.7 },
  { id: 4, title: 'AI workflow prompt pack', category: 'Templates', price: '$19', rating: 4.9 },
]

export default function MarketPage() {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'All' | 'Apps' | 'Videos' | 'Templates'>('All')

  const visible = products.filter((item) => {
    const matchesFilter = filter === 'All' || item.category === filter
    const matchesQuery = item.title.toLowerCase().includes(query.toLowerCase())
    return matchesFilter && matchesQuery
  })

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 text-white sm:px-6 lg:py-14">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-300">Alpha market</p>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.06em] text-white sm:text-4xl">Sell My Work — Market</h1>
        </div>
        <button type="button" className="btn-primary">List an item</button>
      </header>

      <section className="mt-8 rounded-[28px] border border-white/10 bg-[#101114] p-4 shadow-[0_28px_70px_rgba(0,0,0,0.18)] sm:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search restored items"
            className="min-h-[52px] flex-1 rounded-full border border-white/10 bg-black/20 px-5 text-sm text-white placeholder:text-slate-500 outline-none"
          />
          <div className="flex flex-wrap gap-2">
            {(['All', 'Apps', 'Videos', 'Templates'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.12em] transition ${filter === item ? 'bg-white text-black' : 'border border-white/10 bg-white/[0.02] text-slate-300'}`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {visible.map((product) => (
          <article key={product.id} className="group rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,19,22,0.98),rgba(12,12,14,0.96))] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.18)] transition hover:-translate-y-1 hover:border-violet-300/30">
            <div className="relative overflow-hidden rounded-[22px] border border-white/10 bg-[#17181b] p-3">
              <div className="flex aspect-[4/3] items-center justify-center rounded-[18px] bg-[radial-gradient(circle_at_top,rgba(124,92,255,0.18),transparent_58%),linear-gradient(135deg,#111214,#1a1b20)]">
                <ShoppingBag size={36} className="text-violet-300" />
              </div>
            </div>
            <div className="mt-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{product.category}</p>
                <h2 className="mt-2 text-lg font-black text-white">{product.title}</h2>
              </div>
              <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-1 text-xs font-black text-amber-300">{product.price}</span>
            </div>

            <div className="mt-4 flex items-center gap-2 text-sm text-slate-300">
              <Star size={15} className="fill-amber-300 text-amber-300" />
              {product.rating}
            </div>

            <div className="mt-5 grid gap-2">
              <button type="button" className="btn-primary">Buy Now</button>
              <button type="button" className="btn-primary">Preview</button>
              <button type="button" className="btn-primary flex items-center justify-center gap-2">
                <MessageSquareText size={16} /> Chat with Owner
              </button>
            </div>
          </article>
        ))}
      </section>
    </main>
  )
}
