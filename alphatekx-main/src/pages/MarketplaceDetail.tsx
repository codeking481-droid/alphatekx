import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, ShoppingBag, Share2, Star, CheckCircle, ExternalLink, LoaderCircle, Trash2 } from 'lucide-react'
import { fetchProduct, deleteProduct, startMarketplaceCheckout, type MarketplaceProduct } from '../lib/marketplace'
import { useAuth } from '../lib/auth'

export default function MarketplaceDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [product, setProduct] = useState<MarketplaceProduct | null>(null)
  const [loading, setLoading] = useState(true)
  const [buying, setBuying] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!id) return
    loadProduct()
  }, [id])

  async function loadProduct() {
    if (!id) return
    setLoading(true)
    try {
      const data = await fetchProduct(id)
      setProduct(data.product)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load product')
    } finally { setLoading(false) }
  }

  const buy = async () => {
    if (!product || !user) { setNotice('Sign in to buy.'); return }
    setBuying(true)
    setNotice('Opening secure checkout...')
    try {
      await startMarketplaceCheckout(product)
      await loadProduct()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Checkout failed')
    } finally { setBuying(false) }
  }

  const isOwner = () => {
    if (!product || !user) return false
    const userEmail = String((user as { email?: string }).email || '').toLowerCase()
    const isAdmin = userEmail === 'iamdan4live@gmail.com'
    return isAdmin || product.userId === (user as { id: string }).id || (userEmail && product.sellerEmail?.toLowerCase() === userEmail)
  }

  const share = async () => {
    const url = window.location.href
    try { await navigator.clipboard.writeText(url); setNotice('Link copied!') } catch { setNotice('Copy manually: ' + url) }
  }

  const remove = async () => {
    if (!product || !isOwner()) { setNotice('You can only delete your own products.'); return }
    if (!window.confirm('Delete this product? This cannot be undone.')) return
    setDeleting(true); setNotice('')
    try {
      await deleteProduct(product.id)
      navigate('/marketplace')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not delete product')
    } finally { setDeleting(false) }
  }

  if (loading) return <div className="grid min-h-screen place-items-center"><LoaderCircle className="animate-spin" size={32} /></div>
  if (!product) return <div className="p-8 text-center text-white/55">Product not found. <Link to="/marketplace" className="text-indigo-400 underline">Back to marketplace</Link></div>

  const previewUrl = product.hasAccess ? (product.previewUrl || product.demoUrl) : (product.demoUrl || product.previewUrl)

  return (
    <div className="min-h-screen p-5 pb-28 md:p-8">
      <div className="mx-auto max-w-6xl">
        <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-2 text-sm text-white/55 hover:text-white"><ArrowLeft size={16}/> Back</button>
        {notice && <div className="mb-5 rounded-xl border border-white/[.12] liquid-glass px-4 py-3 text-sm">{notice}</div>}
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-white/[.12] liquid-glass p-3 shadow-sm">
            <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-white/[.04]">
              {previewUrl ? (
                <iframe src={previewUrl} title={product.title} className="h-full w-full border-none" sandbox="allow-scripts allow-same-origin" />
              ) : product.thumbnail ? (
                <img src={product.thumbnail} alt={product.title} className="h-full w-full object-cover" />
              ) : <div className="grid h-full place-items-center text-white/30">No preview</div>}
            </div>
          </section>

          <section className="flex flex-col rounded-2xl border border-white/[.12] liquid-glass p-6 shadow-sm">
            <div className="text-xs font-medium text-indigo-300">{product.category}</div>
            <h1 className="mt-2 text-2xl font-bold md:text-3xl">{product.title}</h1>
            <div className="mt-3 flex items-center gap-3 text-sm text-white/55">
              <span className="flex items-center gap-1"><Star size={13} className="fill-amber-400 text-amber-400"/> 5.0</span>
              <span>{product.sales || 0} sold</span>
            </div>
            <p className="mt-4 whitespace-pre-line text-sm leading-6 text-white/70">{product.description}</p>

            <div className="mt-6 rounded-xl bg-white/[.04] p-4">
              <h3 className="text-sm font-semibold">What you get</h3>
              <ul className="mt-3 space-y-2 text-sm text-white/70">
                <li className="flex items-start gap-2"><CheckCircle size={15} className="mt-0.5 text-emerald-500"/> Full access to the live app</li>
                <li className="flex items-start gap-2"><CheckCircle size={15} className="mt-0.5 text-emerald-500"/> Instant delivery after payment</li>
                <li className="flex items-start gap-2"><CheckCircle size={15} className="mt-0.5 text-emerald-500"/> Support and future updates</li>
              </ul>
            </div>

            <div className="mt-auto pt-6">
              <div className="text-3xl font-bold">${product.priceUSD}</div>
              {product.hasAccess ? (
                <a href={previewUrl} target="_blank" rel="noreferrer" className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-medium text-white transition-transform hover:scale-[1.02]">
                  <ExternalLink size={16}/> Open your purchase
                </a>
              ) : (
                <button onClick={() => void buy()} disabled={buying} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-pink-500 text-sm font-medium text-white transition-transform hover:scale-[1.02] disabled:opacity-50">
                  {buying ? <LoaderCircle className="animate-spin" size={16}/> : <ShoppingBag size={16}/>}
                  {buying ? 'Processing...' : 'Buy now'}
                </button>
              )}
              <button onClick={() => void share()} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/[.15] text-sm font-medium transition-colors hover:bg-white/[.04]">
                <Share2 size={16}/> Share
              </button>
              {isOwner() && (
                <button onClick={() => void remove()} disabled={deleting} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/[.15] text-sm font-medium text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-50">
                  {deleting ? <LoaderCircle className="animate-spin" size={16}/> : <Trash2 size={16}/>} Delete listing
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
