import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = path.resolve(root, 'data')
try { fs.mkdirSync(dataDir, { recursive: true }) } catch {}

const marketplaceProductsFile = path.resolve(dataDir, 'marketplace-products.json')
const marketplaceOrdersFile = path.resolve(dataDir, 'marketplace-orders.json')
const sellerWalletsFile = path.resolve(dataDir, 'seller-wallets.json')
const withdrawalsFile = path.resolve(dataDir, 'withdrawals.json')
const storeItemsFile = path.resolve(dataDir, 'store-items.json')
const pendingMarketplaceOrdersFile = path.resolve(dataDir, 'pending-marketplace-orders.json')
const uploadsDir = path.resolve(dataDir, 'uploads')
try { fs.mkdirSync(uploadsDir, { recursive: true }) } catch {}

const adminEmail = 'iamdan4live@gmail.com'

function loadEnv() {
  for (const filename of ['.env.local', '.env']) {
    try {
      for (const line of fs.readFileSync(path.resolve(root, filename), 'utf8').split(/\r?\n/)) {
        const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
        if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim()
      }
    } catch {}
  }
}
loadEnv()

function supabaseConfig() {
  return {
    url: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
    anon: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
    service: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_ADMIN_KEY || '',
  }
}

async function authenticatedUser(req, supabaseUrl, anonKey) {
  const authorization = String(req.headers.authorization || '')
  if (!authorization.toLowerCase().startsWith('bearer ')) return null
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: authorization } })
    return response.ok ? response.json() : null
  } catch { return null }
}

function localUserFromRequest(req) {
  const id = String(req.headers['x-local-user-id'] || '')
  const email = String(req.headers['x-local-user-email'] || '')
  if (id && email) return { id, email }
  const header = String(req.headers['x-local-user'] || '')
  if (header) {
    try {
      const parsed = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'))
      if (parsed.id && parsed.email) return { id: parsed.id, email: parsed.email }
    } catch {}
  }
  return null
}

async function currentOrLocalUser(req) {
  const config = supabaseConfig()
  const fromToken = await authenticatedUser(req, config.url, config.anon).catch(() => null)
  return fromToken || localUserFromRequest(req)
}

function readJsonFile(file, defaultValue = []) {
  try { if (!fs.existsSync(file)) return defaultValue; return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return defaultValue }
}
function writeJsonFile(file, data) {
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 2)); return true } catch { return false }
}

const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }
const readBody = (req) => new Promise((resolve, reject) => {
  let raw = ''
  req.on('data', chunk => { raw += chunk; if (raw.length > 1_000_000) reject(new Error('Request too large')) })
  req.on('end', () => { try { resolve(JSON.parse(raw || '{}')) } catch { reject(new Error('Invalid JSON')) } })
  req.on('error', reject)
})

const readProducts = () => readJsonFile(marketplaceProductsFile, [])
const writeProducts = (data) => writeJsonFile(marketplaceProductsFile, data)
const readOrders = () => readJsonFile(marketplaceOrdersFile, [])
const writeOrders = (data) => writeJsonFile(marketplaceOrdersFile, data)
const readWallets = () => readJsonFile(sellerWalletsFile, {})
const writeWallets = (data) => writeJsonFile(sellerWalletsFile, data)
const readWithdrawals = () => readJsonFile(withdrawalsFile, [])
const writeWithdrawals = (data) => writeJsonFile(withdrawalsFile, data)
const readStoreItems = () => readJsonFile(storeItemsFile, [])
const writeStoreItems = (data) => writeJsonFile(storeItemsFile, data)
const readPendingMarketplaceOrders = () => readJsonFile(pendingMarketplaceOrdersFile, {})
const writePendingMarketplaceOrders = (data) => writeJsonFile(pendingMarketplaceOrdersFile, data)

function publicAppUrl() { return String(process.env.PUBLIC_APP_URL || 'https://alphatekx.name.ng').replace(/\/$/, '') }

function generateThumbnail(title) {
  const colors = ['#6366F1', '#8B5CF6', '#EC4899', '#3B82F6', '#10B981', '#F59E0B', '#EF4444']
  const c1 = colors[title.length % colors.length]
  const c2 = colors[(title.length + 3) % colors.length]
  const letter = (title[0] || 'A').toUpperCase()
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="340"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs><rect width="600" height="340" fill="url(#g)"/><text x="300" y="200" font-family="Arial,sans-serif" font-size="120" font-weight="700" fill="white" text-anchor="middle">${letter}</text></svg>`
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
}

function slugify(value) {
  return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
}

function ensureWallet(userId) {
  const wallets = readWallets()
  if (!wallets[userId]) wallets[userId] = { userId, balance: 0, pendingBalance: 0, totalEarnings: 0, totalWithdrawn: 0, createdAt: new Date().toISOString() }
  writeWallets(wallets)
  return wallets[userId]
}

function creditWallet(userId, amount) {
  const wallets = readWallets()
  const w = wallets[userId] || { userId, balance: 0, pendingBalance: 0, totalEarnings: 0, totalWithdrawn: 0, createdAt: new Date().toISOString() }
  w.balance += amount
  w.totalEarnings += amount
  wallets[userId] = w
  writeWallets(wallets)
  return w
}

async function createProduct(req, res) {
  const user = await currentOrLocalUser(req)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const body = await readBody(req)
  const title = String(body.title || '').trim()
  const priceUSD = Math.max(0, Number(body.price) || 0)
  if (!title || priceUSD <= 0) return json(res, 400, { error: 'Title and price are required' })
  const category = String(body.category || 'Templates')
  const product = {
    id: randomUUID(),
    userId: user.id,
    sellerEmail: user.email,
    projectId: body.projectId ? String(body.projectId) : undefined,
    title,
    priceUSD,
    priceNGN: Math.round(priceUSD * 1500),
    description: String(body.description || '').trim(),
    thumbnail: String(body.thumbnail || '').trim() || generateThumbnail(title),
    previewUrl: String(body.previewUrl || '').trim() || `${publicAppUrl()}/app/${slugify(title)}`,
    demoUrl: String(body.demoUrl || '').trim(),
    category,
    sales: 0,
    revenue: 0,
    status: 'live',
    createdAt: new Date().toISOString(),
  }
  const products = readProducts()
  products.unshift(product)
  writeProducts(products)
  return json(res, 200, { product })
}

function listProducts(req, res) {
  const url = new URL(req.url || '/', 'http://localhost')
  const q = String(url.searchParams.get('q') || '').toLowerCase()
  const category = String(url.searchParams.get('category') || '')
  const sort = String(url.searchParams.get('sort') || 'sales')
  let products = readProducts().filter(p => p.status === 'live')
  if (category && category !== 'All') products = products.filter(p => p.category.toLowerCase() === category.toLowerCase())
  if (q) products = products.filter(p => (p.title + ' ' + p.description).toLowerCase().includes(q))
  if (sort === 'sales') products = [...products].sort((a, b) => (b.sales || 0) - (a.sales || 0))
  else if (sort === 'newest') products = [...products].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  else if (sort === 'price_asc') products = [...products].sort((a, b) => a.priceUSD - b.priceUSD)
  return json(res, 200, { products: products.map(p => ({ ...p, hasAccess: false })) })
}

async function getProduct(req, res, id) {
  const user = await currentOrLocalUser(req).catch(() => null)
  const product = readProducts().find(p => p.id === id)
  if (!product) return json(res, 404, { error: 'Product not found' })
  const orders = readOrders()
  const userEmail = user ? String(user.email || '').toLowerCase() : ''
  const isOwner = user && (product.userId === user.id || (userEmail && product.sellerEmail?.toLowerCase() === userEmail))
  const hasPurchased = user && orders.some(o => o.productId === id && (o.buyerId === user.id || (userEmail && o.buyerEmail?.toLowerCase() === userEmail)) && o.status === 'paid')
  const isAdmin = userEmail === adminEmail
  const hasAccess = isOwner || hasPurchased || isAdmin
  return json(res, 200, { product: { ...product, hasAccess } })
}

async function deleteProduct(req, res, id) {
  const user = await currentOrLocalUser(req)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const products = readProducts()
  const idx = products.findIndex(p => p.id === id)
  if (idx < 0) return json(res, 404, { error: 'Product not found' })
  const product = products[idx]
  const userEmail = String(user.email || '').toLowerCase()
  const isOwner = product.userId === user.id || (userEmail && product.sellerEmail?.toLowerCase() === userEmail)
  const isAdmin = userEmail === adminEmail
  if (!isOwner && !isAdmin) return json(res, 403, { error: 'You can only delete your own products' })
  products.splice(idx, 1)
  writeProducts(products)
  return json(res, 200, { ok: true })
}

async function buyProduct(req, res, id) {
  const user = await currentOrLocalUser(req)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const product = readProducts().find(p => p.id === id)
  if (!product) return json(res, 404, { error: 'Product not found' })
  if (product.userId === user.id) return json(res, 400, { error: 'You cannot buy your own product' })
  const amount = product.priceNGN * 100
  const secret = process.env.PAYSTACK_SECRET_KEY
  if (!secret) return json(res, 503, { error: 'Paystack secret key not configured' })
  const reference = `alphatekx_marketplace_${user.id.slice(0, 8)}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const pending = readPendingMarketplaceOrders()
  pending[reference] = { productId: id, buyerId: user.id, sellerId: product.userId, amount, status: 'pending', createdAt: new Date().toISOString() }
  writePendingMarketplaceOrders(pending)
  const callback = String(process.env.PAYSTACK_CALLBACK_URL || `${publicAppUrl()}/marketplace?payment=success`)
  const response = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, amount, reference, callback_url: callback, metadata: { product_id: id, buyer_id: user.id, seller_id: product.userId, type: 'marketplace' } })
  })
  const data = await response.json()
  if (!response.ok) return json(res, 502, { error: data.message || 'Paystack initialize failed' })
  return json(res, 200, { authorization_url: data.data.authorization_url, reference, amount, productId: id })
}

export async function fulfillMarketplaceOrder(reference, paystackData) {
  const pending = readPendingMarketplaceOrders()
  const order = pending[reference]
  if (!order) return null
  const product = readProducts().find(p => p.id === order.productId)
  if (!product) { delete pending[reference]; writePendingMarketplaceOrders(pending); return null }
  const existing = readOrders().find(o => o.paystackRef === reference)
  if (existing) return existing
  const sellerShare = (order.amount / 100 / 1500) * 0.7
  const platformFee = (order.amount / 100 / 1500) * 0.3
  const netUSD = Math.round(sellerShare * 100) / 100
  const orderRecord = {
    id: randomUUID(),
    productId: order.productId,
    buyerId: order.buyerId,
    sellerId: order.sellerId,
    amount: order.amount,
    paystackRef: reference,
    status: 'paid',
    createdAt: new Date().toISOString(),
  }
  const orders = readOrders()
  orders.unshift(orderRecord)
  writeOrders(orders)
  product.sales += 1
  product.revenue += order.amount
  const products = readProducts()
  const idx = products.findIndex(p => p.id === product.id)
  if (idx >= 0) { products[idx] = product; writeProducts(products) }
  creditWallet(order.sellerId, netUSD)
  delete pending[reference]
  writePendingMarketplaceOrders(pending)
  return orderRecord
}

async function verifyPayment(req, res) {
  const user = await currentOrLocalUser(req)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const body = await readBody(req)
  const reference = String(body.reference || '').trim()
  if (!reference) return json(res, 400, { error: 'Reference required' })
  const pending = readPendingMarketplaceOrders()
  const order = pending[reference]
  if (!order) return json(res, 404, { error: 'No pending marketplace order for this reference' })
  if (order.buyerId !== user.id) return json(res, 403, { error: 'Order does not belong to you' })
  const secret = process.env.PAYSTACK_SECRET_KEY
  if (!secret) return json(res, 503, { error: 'Paystack secret key not configured' })
  try {
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${secret}` } })
    const data = await response.json()
    if (!response.ok || data.data?.status !== 'success') return json(res, 400, { error: data.message || 'Payment not successful' })
    const fulfilled = await fulfillMarketplaceOrder(reference, data)
    if (!fulfilled) return json(res, 400, { error: 'Could not fulfill order' })
    const product = readProducts().find(p => p.id === fulfilled.productId)
    return json(res, 200, { success: true, order: fulfilled, product })
  } catch (error) { return json(res, 502, { error: error instanceof Error ? error.message : 'Verification failed' }) }
}

async function myProducts(req, res) {
  const user = await currentOrLocalUser(req)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const products = readProducts().filter(p => p.userId === user.id)
  return json(res, 200, { products })
}

async function myPurchases(req, res) {
  const user = await currentOrLocalUser(req)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const orders = readOrders().filter(o => o.buyerId === user.id && o.status === 'paid')
  const products = readProducts()
  const list = orders.map(o => {
    const p = products.find(x => x.id === o.productId) || { title: 'Unknown', previewUrl: '' }
    return { order: o, product: p }
  })
  return json(res, 200, { purchases: list })
}

async function earnings(req, res) {
  const user = await currentOrLocalUser(req)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const wallet = ensureWallet(user.id)
  const withdrawals = readWithdrawals().filter(w => w.userId === user.id)
  return json(res, 200, { wallet, withdrawals })
}

async function listBanks(req, res) {
  const secret = process.env.PAYSTACK_SECRET_KEY
  if (!secret) return json(res, 503, { error: 'Paystack secret key not configured' })
  try {
    const response = await fetch('https://api.paystack.co/bank', { headers: { Authorization: `Bearer ${secret}` } })
    const data = await response.json()
    if (!response.ok) throw new Error(data.message || 'Could not load banks')
    return json(res, 200, { banks: data.data || [] })
  } catch (error) { return json(res, 502, { error: error instanceof Error ? error.message : 'Bank list failed' }) }
}

async function verifyAccount(req, res) {
  const user = await currentOrLocalUser(req)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const body = await readBody(req)
  const accountNumber = String(body.accountNumber || '').trim()
  const bankCode = String(body.bankCode || '').trim()
  if (!accountNumber || !bankCode) return json(res, 400, { error: 'Account number and bank code required' })
  const secret = process.env.PAYSTACK_SECRET_KEY
  if (!secret) return json(res, 503, { error: 'Paystack secret key not configured' })
  try {
    const response = await fetch(`https://api.paystack.co/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`, { headers: { Authorization: `Bearer ${secret}` } })
    const data = await response.json()
    if (!response.ok || !data.status) throw new Error(data.message || 'Could not resolve account')
    return json(res, 200, { accountName: data.data.account_name, accountNumber, bankCode })
  } catch (error) { return json(res, 502, { error: error instanceof Error ? error.message : 'Account verification failed' }) }
}

async function withdraw(req, res) {
  const user = await currentOrLocalUser(req)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const body = await readBody(req)
  const amount = Math.max(0, Number(body.amount) || 0)
  const bankName = String(body.bankName || '').trim()
  const accountNumber = String(body.accountNumber || '').trim()
  const accountName = String(body.accountName || '').trim()
  const bankCode = String(body.bankCode || '').trim()
  if (!amount || amount < 10) return json(res, 400, { error: 'Minimum withdrawal is $10' })
  if (!bankName || !accountNumber || !accountName) return json(res, 400, { error: 'Bank details required' })
  const wallets = readWallets()
  const wallet = ensureWallet(user.id)
  const isAdmin = user.email?.toLowerCase() === adminEmail
  if (!isAdmin && wallet.balance < amount) return json(res, 400, { error: 'Insufficient balance' })
  if (wallet.balance >= amount) {
    wallet.balance -= amount
    wallet.pendingBalance += amount
  } else if (isAdmin) {
    wallet.pendingBalance += amount
  }
  wallets[user.id] = wallet
  writeWallets(wallets)
  const withdrawal = {
    id: randomUUID(),
    userId: user.id,
    sellerEmail: user.email,
    amount,
    bankName,
    accountNumber,
    accountName,
    bankCode,
    status: 'pending',
    createdAt: new Date().toISOString(),
  }
  const list = readWithdrawals()
  list.unshift(withdrawal)
  writeWithdrawals(list)
  return json(res, 200, { withdrawal, wallet })
}

async function adminWithdrawals(req, res) {
  const user = await currentOrLocalUser(req)
  if (!user || user.email?.toLowerCase() !== adminEmail) return json(res, 403, { error: 'Admin access required' })
  const list = readWithdrawals()
  return json(res, 200, { withdrawals: list })
}

async function markWithdrawalPaid(req, res, id) {
  const user = await currentOrLocalUser(req)
  if (!user || user.email?.toLowerCase() !== adminEmail) return json(res, 403, { error: 'Admin access required' })
  const body = await readBody(req)
  const list = readWithdrawals()
  const idx = list.findIndex(w => w.id === id)
  if (idx < 0) return json(res, 404, { error: 'Withdrawal not found' })
  const w = list[idx]
  if (w.status === 'pending') {
    const wallets = readWallets()
    const wallet = ensureWallet(w.userId)
    wallet.pendingBalance = Math.max(0, wallet.pendingBalance - w.amount)
    wallet.totalWithdrawn += w.amount
    wallets[w.userId] = wallet
    writeWallets(wallets)
    w.status = 'paid'
    w.paidAt = new Date().toISOString()
    w.paystackTransferCode = String(body.transferCode || body.proof || '')
    w.proof = String(body.proof || '')
    list[idx] = w
    writeWithdrawals(list)
  }
  return json(res, 200, { withdrawal: w })
}

// Store (Second Brain)

async function createStoreItem(req, res) {
  const user = await currentOrLocalUser(req)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const body = await readBody(req)
  const title = String(body.title || '').trim()
  const type = String(body.type || 'snippet')
  if (!title) return json(res, 400, { error: 'Title required' })
  const item = {
    id: randomUUID(),
    userId: user.id,
    title,
    type,
    content: String(body.content || ''),
    tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
    projectId: body.projectId ? String(body.projectId) : undefined,
    isFavorite: Boolean(body.isFavorite),
    usageCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  const items = readStoreItems()
  items.unshift(item)
  writeStoreItems(items)
  return json(res, 200, { item })
}

async function listStoreItems(req, res) {
  const user = await currentOrLocalUser(req)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const url = new URL(req.url || '/', 'http://localhost')
  const type = String(url.searchParams.get('type') || '')
  const q = String(url.searchParams.get('q') || '').toLowerCase()
  const tag = String(url.searchParams.get('tag') || '').toLowerCase()
  const sort = String(url.searchParams.get('sort') || 'recent')
  let items = readStoreItems().filter(i => i.userId === user.id)
  if (type && type !== 'All') items = items.filter(i => i.type === type)
  if (q) items = items.filter(i => (i.title + ' ' + i.content).toLowerCase().includes(q))
  if (tag) items = items.filter(i => i.tags.some(t => String(t).toLowerCase().includes(tag)))
  if (sort === 'recent') items = [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  else if (sort === 'most_used') items = [...items].sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
  else if (sort === 'favorites') items = [...items].sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite))
  return json(res, 200, { items })
}

async function updateStoreItem(req, res, id) {
  const user = await currentOrLocalUser(req)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const body = await readBody(req)
  const items = readStoreItems()
  const idx = items.findIndex(i => i.id === id && i.userId === user.id)
  if (idx < 0) return json(res, 404, { error: 'Item not found' })
  items[idx] = { ...items[idx], ...body, updatedAt: new Date().toISOString() }
  writeStoreItems(items)
  return json(res, 200, { item: items[idx] })
}

async function deleteStoreItem(req, res, id) {
  const user = await currentOrLocalUser(req)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const items = readStoreItems()
  const next = items.filter(i => !(i.id === id && i.userId === user.id))
  if (next.length === items.length) return json(res, 404, { error: 'Item not found' })
  writeStoreItems(next)
  return json(res, 200, { ok: true })
}

async function useStoreItem(req, res, id) {
  const user = await currentOrLocalUser(req)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const items = readStoreItems()
  const idx = items.findIndex(i => i.id === id && i.userId === user.id)
  if (idx < 0) return json(res, 404, { error: 'Item not found' })
  items[idx].usageCount = (items[idx].usageCount || 0) + 1
  items[idx].updatedAt = new Date().toISOString()
  writeStoreItems(items)
  return json(res, 200, { item: items[idx] })
}

function extForMime(mime) {
  const map = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg', 'application/pdf': '.pdf', 'video/mp4': '.mp4', 'audio/mpeg': '.mp3', 'text/plain': '.txt' }
  return map[String(mime).toLowerCase()] || ''
}

function mimeForExt(ext) {
  const map = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.txt': 'text/plain' }
  return map[ext.toLowerCase()] || 'application/octet-stream'
}

async function uploadStoreFile(req, res) {
  const user = await currentOrLocalUser(req)
  if (!user) return json(res, 401, { error: 'Authentication required' })
  const body = await readBody(req)
  let file = String(body.file || body.content || '')
  const name = String(body.name || 'upload')
  let mime = String(body.mime || 'application/octet-stream')
  const dataUrlMatch = file.match(/^data:([^;]+);base64,(.*)$/)
  if (dataUrlMatch) { mime = dataUrlMatch[1]; file = dataUrlMatch[2] }
  if (!file.trim()) return json(res, 400, { error: 'No file data provided' })
  const ext = extForMime(mime) || path.extname(name) || '.bin'
  const id = `${randomUUID()}${ext}`
  const filePath = path.resolve(uploadsDir, id)
  fs.writeFileSync(filePath, Buffer.from(file, 'base64'))
  const url = `/api/store/file/${id}`
  return json(res, 200, { id, url, name, mime, size: fs.statSync(filePath).size })
}

async function serveStoreFile(req, res, id) {
  const filePath = path.resolve(uploadsDir, id)
  if (!filePath.startsWith(uploadsDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return json(res, 404, { error: 'File not found' })
  const ext = path.extname(filePath)
  const mime = mimeForExt(ext)
  res.writeHead(200, { 'Content-Type': mime, 'Content-Length': fs.statSync(filePath).size })
  return fs.createReadStream(filePath).pipe(res)
}

export async function marketplaceHandler(req, res) {
  const url = new URL(req.url || '/', 'http://localhost')
  const pathname = url.pathname
  if (req.method === 'POST' && pathname === '/api/marketplace/products') { await createProduct(req, res); return true }
  if (req.method === 'GET' && pathname === '/api/marketplace/products') { await listProducts(req, res); return true }
  const productMatch = pathname.match(/^\/api\/marketplace\/products\/([^/]+)$/)
  if (productMatch) {
    if (req.method === 'GET') { await getProduct(req, res, productMatch[1]); return true }
    if (req.method === 'DELETE') { await deleteProduct(req, res, productMatch[1]); return true }
  }
  const buyMatch = pathname.match(/^\/api\/marketplace\/buy\/([^/]+)$/)
  if (req.method === 'POST' && buyMatch) { await buyProduct(req, res, buyMatch[1]); return true }
  if (req.method === 'POST' && pathname === '/api/marketplace/verify-payment') { await verifyPayment(req, res); return true }
  if (req.method === 'GET' && pathname === '/api/marketplace/my-products') { await myProducts(req, res); return true }
  if (req.method === 'GET' && pathname === '/api/marketplace/my-purchases') { await myPurchases(req, res); return true }
  if (req.method === 'GET' && pathname === '/api/marketplace/earnings') { await earnings(req, res); return true }
  if (req.method === 'POST' && pathname === '/api/marketplace/withdraw') { await withdraw(req, res); return true }
  if (req.method === 'POST' && pathname === '/api/marketplace/verify-account') { await verifyAccount(req, res); return true }
  if (req.method === 'GET' && pathname === '/api/marketplace/banks') { await listBanks(req, res); return true }
  if (req.method === 'GET' && pathname === '/api/admin/withdrawals') { await adminWithdrawals(req, res); return true }
  const adminPaidMatch = pathname.match(/^\/api\/admin\/withdrawals\/([^/]+)\/paid$/)
  if (req.method === 'POST' && adminPaidMatch) { await markWithdrawalPaid(req, res, adminPaidMatch[1]); return true }
  if (req.method === 'POST' && pathname === '/api/store/items') { await createStoreItem(req, res); return true }
  if (req.method === 'GET' && pathname === '/api/store/items') { await listStoreItems(req, res); return true }
  const storeItemMatch = pathname.match(/^\/api\/store\/items\/([^/]+)$/)
  if (req.method === 'PUT' && storeItemMatch) { await updateStoreItem(req, res, storeItemMatch[1]); return true }
  if (req.method === 'DELETE' && storeItemMatch) { await deleteStoreItem(req, res, storeItemMatch[1]); return true }
  const useMatch = pathname.match(/^\/api\/store\/items\/([^/]+)\/use$/)
  if (req.method === 'POST' && useMatch) { await useStoreItem(req, res, useMatch[1]); return true }
  if (req.method === 'POST' && pathname === '/api/store/upload') { await uploadStoreFile(req, res); return true }
  const fileMatch = pathname.match(/^\/api\/store\/file\/([^/]+)$/)
  if (req.method === 'GET' && fileMatch) { await serveStoreFile(req, res, fileMatch[1]); return true }
  return false
}
