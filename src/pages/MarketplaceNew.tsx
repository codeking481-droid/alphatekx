import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { ArrowLeft, LoaderCircle, Sparkles, Tag, DollarSign, Type, FileText, Image as ImageIcon } from 'lucide-react'
import { createProduct, MARKETPLACE_CATEGORIES, type MarketplaceProduct } from '../lib/marketplace'

export default function MarketplaceNew() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [product, setProduct] = useState<Partial<MarketplaceProduct>>({
    title: decodeURIComponent(searchParams.get('title') || ''),
    priceUSD: 10,
    description: '',
    category: 'Templates',
    previewUrl: decodeURIComponent(searchParams.get('previewUrl') || ''),
    demoUrl: decodeURIComponent(searchParams.get('demoUrl') || ''),
    thumbnail: decodeURIComponent(searchParams.get('thumbnail') || ''),
  })

  const submit = async () => {
    if (!product.title || !product.priceUSD || Number(product.priceUSD) <= 0) {
      setNotice('Enter a title and price.')
      return
    }
    setSaving(true)
    setNotice('')
    try {
      const data = await createProduct({
        title: product.title,
        price: Number(product.priceUSD),
        description: product.description,
        category: product.category,
        previewUrl: product.previewUrl,
        demoUrl: product.demoUrl,
        thumbnail: product.thumbnail,
      })
      navigate(`/marketplace/${data.product.id}`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not list product')
    } finally { setSaving(false) }
  }

  return (
    <div className="min-h-screen p-5 pb-28 md:p-8">
      <div className="mx-auto max-w-2xl">
        <Link to="/marketplace" className="mb-4 flex items-center gap-2 text-sm text-white/55 hover:text-white"><ArrowLeft size={16}/> Marketplace</Link>
        <h1 className="text-2xl font-bold">List your creation</h1>
        <p className="text-sm text-white/55">Turn your app, template or tool into a product buyers can purchase instantly.</p>

        {notice && <div className="mt-5 rounded-xl border border-white/[.12] liquid-glass px-4 py-3 text-sm">{notice}</div>}

        <div className="mt-6 space-y-4 rounded-2xl border border-white/[.12] liquid-glass p-5 md:p-7">
          <label className="block">
            <span className="flex items-center gap-2 text-sm font-medium"><Type size={14}/> Title</span>
            <input value={product.title} onChange={e => setProduct(p => ({ ...p, title: e.target.value }))} className="mt-2 min-h-12 w-full rounded-xl border border-white/[.12] bg-background px-4 text-sm outline-none focus:border-indigo-500" placeholder="e.g. SaaS Dashboard Kit" />
          </label>

          <label className="block">
            <span className="flex items-center gap-2 text-sm font-medium"><DollarSign size={14}/> Price (USD)</span>
            <input type="number" min={1} value={product.priceUSD} onChange={e => setProduct(p => ({ ...p, priceUSD: Number(e.target.value) }))} className="mt-2 min-h-12 w-full rounded-xl border border-white/[.12] bg-background px-4 text-sm outline-none focus:border-indigo-500" placeholder="10" />
          </label>

          <label className="block">
            <span className="flex items-center gap-2 text-sm font-medium"><Tag size={14}/> Category</span>
            <select value={product.category} onChange={e => setProduct(p => ({ ...p, category: e.target.value }))} className="mt-2 min-h-12 w-full rounded-xl border border-white/[.12] bg-background px-4 text-sm outline-none focus:border-indigo-500">
              {MARKETPLACE_CATEGORIES.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="flex items-center gap-2 text-sm font-medium"><FileText size={14}/> Description</span>
            <textarea value={product.description} onChange={e => setProduct(p => ({ ...p, description: e.target.value }))} rows={5} className="mt-2 w-full rounded-xl border border-white/[.12] bg-background px-4 py-3 text-sm outline-none focus:border-indigo-500" placeholder="What does it do? Who is it for?" />
          </label>

          <label className="block">
            <span className="flex items-center gap-2 text-sm font-medium"><ImageIcon size={14}/> Thumbnail URL (optional)</span>
            <input value={product.thumbnail} onChange={e => setProduct(p => ({ ...p, thumbnail: e.target.value }))} className="mt-2 min-h-12 w-full rounded-xl border border-white/[.12] bg-background px-4 text-sm outline-none focus:border-indigo-500" placeholder="https://..." />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Live preview URL</span>
            <input value={product.previewUrl} onChange={e => setProduct(p => ({ ...p, previewUrl: e.target.value }))} className="mt-2 min-h-12 w-full rounded-xl border border-white/[.12] bg-background px-4 text-sm outline-none focus:border-indigo-500" placeholder="https://alphatekx.name.ng/app/your-app" />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Demo URL (public preview)</span>
            <input value={product.demoUrl} onChange={e => setProduct(p => ({ ...p, demoUrl: e.target.value }))} className="mt-2 min-h-12 w-full rounded-xl border border-white/[.12] bg-background px-4 text-sm outline-none focus:border-indigo-500" placeholder="https://..." />
          </label>

          <button onClick={() => void submit()} disabled={saving} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-pink-500 text-sm font-medium text-white transition-transform hover:scale-[1.02] disabled:opacity-50">
            {saving ? <LoaderCircle className="animate-spin" size={16}/> : <Sparkles size={16}/>}
            {saving ? 'Publishing...' : 'Publish listing'}
          </button>
        </div>
      </div>
    </div>
  )
}
