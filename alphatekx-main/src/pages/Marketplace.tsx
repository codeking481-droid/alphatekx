import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { Search, Star, ShoppingBag, LayoutGrid, TrendingUp, Sparkles, LoaderCircle, Trash2 } from 'lucide-react'
import { fetchProducts, deleteProduct, startMarketplaceCheckout, verifyMarketplacePayment, type MarketplaceProduct } from '../lib/marketplace'
import { getReviews, hydrateReviews, type MarketplaceReview } from '../lib/reviewStore'
import { useAuth } from '../lib/auth'

const CATEGORIES = ['All', 'Websites', 'Apps', 'Workers', 'Templates']

const sortOptions = [
  { id: 'sales', label: 'Best selling' },
  { id: 'newest', label: 'Newest' },
  { id: 'price_asc', label: 'Price: low to high' },
]

export default function Marketplace() {
  const [products, setProducts] = useState<MarketplaceProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [sort, setSort] = useState('sales')
  const [buyingId, setBuyingId] = useState('')
  const [deletingId, setDeletingId] = useState('')
  const [notice, setNotice] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const [reviews, setReviews] = useState<MarketplaceReview[]>([])
  const { user } = useAuth()

  useEffect(() => {
    loadProducts()
    void hydrateReviews().then(() => setReviews(getReviews()))
    const reference = searchParams.get('reference')
    const payment = searchParams.get('payment')
    if (reference && payment === 'success') {
      verifyMarketplacePayment(reference).then(r => {
        if (r.success) { setNotice('Payment successful! Product added to your purchases.') }
        else { setNotice(r.error || 'Payment verification failed.') }
        setSearchParams({})
      })
    }
  }, [searchParams])

  async function loadProducts() {
    setLoading(true)
    try {
      const data = await fetchProducts({ q: query, category, sort })
      setProducts(data.products || [])
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load marketplace')
    } finally { setLoading(false) }
  }

  useEffect(() => {
    const t = setTimeout(loadProducts, 300)
    return () => clearTimeout(t)
  }, [query, category, sort])

  const productReviews = useMemo(() => {
    const map: Record<string, MarketplaceReview[]> = {}
    for (const review of reviews) { map[review.itemId] = [...(map[review.itemId] || []), review] }
    return map
  }, [reviews])

  const averageRating = (product: MarketplaceProduct) => {
    const list = productReviews[product.id] || product.reviews || []
    return list.length ? list.reduce((sum, review) => sum + review.rating, 0) / list.length : product.rating || 0
  }

  const filtered = useMemo(() => products, [products])

  const isProductOwner = (product: MarketplaceProduct) => {
    if (!user) return false
    const userEmail = String((user as { email?: string }).email || '').toLowerCase()
    const isAdmin = userEmail === 'iamdan4live@gmail.com'
    return isAdmin || product.userId === (user as { id: string }).id || (userEmail && product.sellerEmail?.toLowerCase() === userEmail)
  }

  const buy = async (product: MarketplaceProduct) => {
    if (!user) { setNotice('Sign in to buy.'); return }
    if (buyingId) return
    setBuyingId(product.id)
    setNotice('Opening secure checkout...')
    try {
      await startMarketplaceCheckout(product)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Checkout failed')
    } finally { setBuyingId('') }
  }

  const remove = async (productId: string) => {
    if (!window.confirm('Delete this product? This cannot be undone.')) return
    setDeletingId(productId)
    setNotice('')
    try {
      await deleteProduct(productId)
      setProducts(products.filter(p => p.id !== productId))
      setNotice('Product deleted.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not delete product')
    } finally { setDeletingId('') }
  }

  return (
    <div className="min-h-screen p-5 pb-28 md:p-8">
      <div className="mx-auto max-w-6xl">
        <section className="relative overflow-hidden rounded-2xl border border-white/[.12] bg-gradient-to-br from-indigo-600/20 via-violet-600/20 to-pink-600/20 p-6 md:p-10">
          <div className="relative z-10">
            <h1 className="text-2xl font-bold md:text-4xl">Sell what you build</h1>
            <p className="mt-2 max-w-xl text-sm text-white/70 md:text-base">From idea to income. List apps, templates, tools and SaaS kits built in AlphaTekX. Buyers get instant access.</p>
            <Link to="/marketplace/new" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-black transition-transform hover:scale-[1.02]">
              <Sparkles size={16}/> List your creation
            </Link>
          </div>
        </section>

        {notice && <div className="mt-5 rounded-xl border border-white/[.12] liquid-glass px-4 py-3 text-sm">{notice}</div>}

        <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center">
          <label className="flex min-h-12 flex-1 items-center gap-3 rounded-xl border border-white/[.12] liquid-glass px-4 shadow-sm">
            <Search size={16} className="text-white/45" />
            <input value={query} onChange={e => setQuery(e.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Search apps, templates, tools..." />
          </label>
          <select value={sort} onChange={e => setSort(e.target.value)} className="min-h-12 rounded-xl border border-white/[.12] bg-background px-3 text-sm outline-none">
            {sortOptions.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setCategory(c)} className={`min-h-9 shrink-0 rounded-full px-4 text-sm transition-all ${category === c ? 'btn-alpha text-white' : 'border border-white/[.15] liquid-glass text-white/80'}`}>
              {c}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1,2,3,4,5,6].map(i => <div key={i} className="h-80 animate-pulse rounded-2xl bg-white/[.08]" />)}
          </div>
        ) : filtered.length ? (
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map(product => (
              <article key={product.id} className="group flex flex-col overflow-hidden rounded-2xl border border-white/[.12] liquid-glass transition-all hover:-translate-y-1 hover:border-indigo-400/30 hover:shadow-xl">
                <Link to={`/marketplace/${product.id}`} className="relative aspect-[16/10] overflow-hidden bg-white/[.04]">
                  {product.thumbnail ? <img src={product.thumbnail} alt={product.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" /> : <LayoutGrid className="absolute inset-0 m-auto text-white/20" size={48} />}
                  <span className="absolute left-3 top-3 rounded-full bg-black/50 px-2.5 py-1 text-[10px] font-medium backdrop-blur-md">{product.category}</span>
                </Link>
                <div className="flex flex-1 flex-col p-5">
                  <Link to={`/marketplace/${product.id}`} className="text-base font-semibold leading-tight hover:text-indigo-300">{product.title}</Link>
                  <p className="mt-2 line-clamp-2 text-xs text-white/55">{product.description}</p>
                  <div className="mt-4 flex items-center gap-2 text-xs text-white/55">
                    <span className="flex items-center gap-1"><Star size={12} className="fill-amber-400 text-amber-400"/> {averageRating(product).toFixed(1)}</span>
                    <span className="flex items-center gap-1"><TrendingUp size={12}/> {product.sales || 0} sold</span>
                  </div>
                  <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/[.08] pt-4">
                    <strong className="text-lg font-bold">${product.priceUSD}</strong>
                    {isProductOwner(product) ? (
                      <button onClick={() => void remove(product.id)} disabled={deletingId === product.id} className="flex min-h-10 items-center gap-2 rounded-xl border border-white/[.15] px-4 text-sm font-medium text-white transition-transform hover:scale-[1.02] hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50">
                        {deletingId === product.id ? <LoaderCircle className="animate-spin" size={14}/> : <Trash2 size={14}/>}
                        {deletingId === product.id ? 'Deleting...' : 'Delete'}
                      </button>
                    ) : (
                      <button onClick={() => void buy(product)} disabled={buyingId === product.id} className="flex min-h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-pink-500 px-4 text-sm font-medium text-white transition-transform hover:scale-[1.02] disabled:opacity-50">
                        {buyingId === product.id ? <LoaderCircle className="animate-spin" size={14}/> : <ShoppingBag size={14}/>}
                        {buyingId === product.id ? 'Wait...' : 'Buy now'}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-16 grid min-h-72 place-items-center rounded-2xl border border-dashed border-white/[.15] liquid-glass text-center p-8">
            <div>
              <h2 className="text-xl font-semibold">Nothing here yet</h2>
              <p className="mt-3 text-sm text-white/55">Build an app in the AlphaTekX Builder, then list it here and earn 70% on every sale.</p>
              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link to="/builder" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-pink-500 px-5 text-sm font-semibold text-white shadow-lg transition-transform hover:scale-[1.02]">Build something</Link>
                <Link to="/marketplace/new" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/[.15] px-5 text-sm font-semibold text-white">List a product</Link>
              </div>
              <p className="mt-4 text-xs text-white/40">You keep 70% — AlphaTekX keeps 30%.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
