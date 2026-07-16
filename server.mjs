import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function loadEnv() {
  try { for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim() } } catch {}
}
loadEnv()
const port = Number(process.env.PORT || 3001)
const root = path.dirname(fileURLToPath(import.meta.url))
const distRoot = path.resolve(root, 'dist')
const key = (name) => process.env[`${name}_1`] || process.env[name] || ''
const fetchJson = async (url, options, timeout = 45000) => {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout)
  try { const response = await fetch(url, { ...options, signal: controller.signal }); const data = await response.json(); if (!response.ok) throw new Error(data.error?.message || `HTTP ${response.status}`); return data } finally { clearTimeout(timer) }
}
const allowedOrigins = new Set(['https://alphatekx.name.ng', 'https://www.alphatekx.name.ng', 'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'])
const applyCors = (req, res) => {
  const origin = String(req.headers.origin || '')
  if (allowedOrigins.has(origin)) res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
}
const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }
const readBody = (req) => new Promise((resolve, reject) => { let raw=''; req.on('data',(chunk)=>{raw+=chunk;if(raw.length>1_000_000)reject(new Error('Request too large'))}); req.on('end',()=>{try{resolve(JSON.parse(raw||'{}'))}catch{reject(new Error('Invalid JSON'))}}); req.on('error',reject) })

export async function verifyPaystack(req, res) {
  applyCors(req,res)
  const secret = process.env.PAYSTACK_SECRET_KEY || ''
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!secret || !supabaseUrl || !anonKey || !serviceKey) return json(res, 503, { error:'Payment verification is not configured.' })
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : await readBody(req)
    const reference = String(body.reference || '')
    if (!reference) return json(res, 400, { error:'Missing payment reference.' })
    const verified = await fetchJson(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers:{ Authorization:`Bearer ${secret}` } })
    if (verified.data?.status !== 'success' || verified.data?.currency !== 'NGN') return json(res, 400, { error:'Payment was not successful.' })
    const plan = verified.data.amount === 800000 ? 'pro' : verified.data.amount === 200000 ? 'free' : null
    const purchased = verified.data.amount === 800000 ? 2500 : verified.data.amount === 200000 ? 500 : 0
    if (!plan || !purchased) return json(res, 400, { error:'Unknown AlphaTekX payment amount.' })
    const bearer = String(req.headers.authorization || '')
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers:{ apikey:anonKey, Authorization:bearer } })
    if (!userResponse.ok) return json(res, 401, { error:'Authentication required.' })
    const user = await userResponse.json()
    const profileResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=credits`, { headers:{ apikey:serviceKey, Authorization:`Bearer ${serviceKey}` } })
    const profiles = await profileResponse.json()
    const credits = Number(profiles?.[0]?.credits ?? 100) + purchased
    const update = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}`, { method:'PATCH', headers:{ apikey:serviceKey, Authorization:`Bearer ${serviceKey}`, 'Content-Type':'application/json', Prefer:'return=minimal' }, body:JSON.stringify({credits,plan}) })
    if (!update.ok) return json(res, 500, { error:'Could not add credits.' })
    return json(res, 200, { verified:true, credits, plan })
  } catch (error) { return json(res, 500, { error:error instanceof Error ? error.message : 'Verification failed.' }) }
}

async function authenticatedUser(req, supabaseUrl, anonKey) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, { headers:{ apikey:anonKey, Authorization:String(req.headers.authorization || '') } })
  return response.ok ? response.json() : null
}

export async function purchaseMarketplace(req, res) {
  applyCors(req,res)
  const secret=process.env.PAYSTACK_SECRET_KEY||''; const supabaseUrl=process.env.VITE_SUPABASE_URL||process.env.SUPABASE_URL||''; const anonKey=process.env.VITE_SUPABASE_ANON_KEY||process.env.SUPABASE_ANON_KEY||''; const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY||''
  if(!supabaseUrl||!anonKey||!serviceKey) return json(res,503,{error:'Marketplace settlement is not configured.'})
  try {
    const body=req.body&&typeof req.body==='object'?req.body:await readBody(req); const itemId=String(body.itemId||''); const reference=body.reference?String(body.reference):null
    if(!itemId) return json(res,400,{error:'Missing marketplace item.'})
    const user=await authenticatedUser(req,supabaseUrl,anonKey); if(!user) return json(res,401,{error:'Authentication required.'})
    const itemResponse=await fetch(`${supabaseUrl}/rest/v1/marketplace_items?id=eq.${encodeURIComponent(itemId)}&select=id,price,price_type`,{headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`}})
    const item=(await itemResponse.json())?.[0]; if(!item) return json(res,404,{error:'Marketplace item not found.'})
    if(item.price_type==='paid') {
      if(!secret||!reference) return json(res,400,{error:'A verified Paystack payment is required.'})
      const verified=await fetchJson(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,{headers:{Authorization:`Bearer ${secret}`}})
      if(verified.data?.status!=='success'||verified.data?.currency!=='NGN'||verified.data?.amount!==Math.round(Number(item.price)*100)) return json(res,400,{error:'Payment amount does not match this item.'})
    } else if(reference) return json(res,400,{error:'Free items do not require payment.'})
    const rpc=await fetch(`${supabaseUrl}/rest/v1/rpc/complete_marketplace_purchase`,{method:'POST',headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json'},body:JSON.stringify({p_item_id:itemId,p_buyer_id:user.id,p_reference:reference})})
    const result=await rpc.json(); if(!rpc.ok) return json(res,400,{error:result.message||'Purchase could not be completed.'})
    return json(res,200,result)
  } catch(error) { return json(res,500,{error:error instanceof Error?error.message:'Marketplace purchase failed.'}) }
}
const isYoutube = (p) => /youtube|video|watch|tutorial/i.test(p)
const EMERGENCY_TRANSLATOR_CODE = `export default function TranslatorApp(){const [input,setInput]=React.useState('Hello world');const [from,setFrom]=React.useState('en');const [to,setTo]=React.useState('es');const [output,setOutput]=React.useState('');const [search,setSearch]=React.useState('');const [history,setHistory]=React.useState(()=>{try{return JSON.parse(localStorage.getItem('translator_history')||'[]')}catch{return []}});React.useEffect(()=>{try{localStorage.setItem('translator_history',JSON.stringify(history))}catch{}},[history]);const filtered=React.useMemo(()=>history.filter(h=>h.input.toLowerCase().includes(search.toLowerCase())||h.output.toLowerCase().includes(search.toLowerCase())),[history,search]);const total=history.reduce((sum)=>sum+1,0);const translate=()=>{const words={hello:'hola',world:'mundo',good:'bueno',morning:'mañana'};const value=input.toLowerCase().split(' ').map(w=>words[w]||w).join(' ');setOutput(value);setHistory(items=>[{id:Date.now(),input,output:value,from,to},...items].slice(0,30))};const clear=()=>{setHistory([]);setOutput('');try{localStorage.removeItem('translator_history')}catch{}};return <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 p-6"><div className="mx-auto max-w-5xl"><h1 className="mb-2 text-4xl font-bold">🌐 Alpha Translator</h1><p className="mb-6 text-slate-600">{total} translations saved locally</p><div className="grid gap-6 md:grid-cols-2"><section className="rounded-3xl bg-white p-6 shadow-xl"><div className="mb-4 flex gap-3"><select value={from} onChange={e=>setFrom(e.target.value)} className="rounded-full border p-2"><option value="en">English</option><option value="es">Spanish</option></select><select value={to} onChange={e=>setTo(e.target.value)} className="rounded-full border p-2"><option value="es">Spanish</option><option value="en">English</option></select></div><textarea value={input} onChange={e=>setInput(e.target.value)} className="h-36 w-full rounded-2xl border p-4" placeholder="Type text..."/><button onClick={translate} className="mt-4 w-full rounded-full bg-indigo-600 py-3 font-bold text-white">Translate</button></section><section className="rounded-3xl bg-white p-6 shadow-xl"><h2 className="mb-3 text-xl font-bold">Translation</h2><div className="min-h-36 rounded-2xl bg-slate-50 p-4">{output||'Your translation appears here'}</div><button onClick={()=>navigator.clipboard?.writeText(output)} className="mt-4 rounded-full border px-4 py-2">Copy</button><button onClick={clear} className="ml-2 rounded-full bg-red-50 px-4 py-2 text-red-600">Clear</button></section></div><section className="mt-6 rounded-3xl bg-white p-6 shadow-xl"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-bold">History</h2><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search history..." className="rounded-full border px-4 py-2"/></div>{filtered.map(item=><div key={item.id} className="flex justify-between border-b py-3"><span>{item.input} → {item.output}</span><button onClick={()=>setHistory(items=>items.filter(x=>x.id!==item.id))} className="text-red-600">Delete</button></div>)}</section></div></div>}`
export async function handleAlpha(prompt, mode = 'chat') {
  if (isYoutube(prompt) && key('YOUTUBE_API_KEY')) {
    const q = encodeURIComponent(prompt.replace(/youtube|video|watch|tutorial/gi, '').trim() || prompt)
    const data = await (await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=5&q=${q}&key=${key('YOUTUBE_API_KEY')}`)).json()
    const videos = (data.items || []).map((v) => ({ title: v.snippet.title, channel: v.snippet.channelTitle, url: `https://www.youtube.com/watch?v=${v.id.videoId}`, thumbnail: v.snippet.thumbnails?.medium?.url }))
    return { text: videos.length ? `Here are videos I found for “${prompt}”:\n\n${videos.map((v, i) => `${i + 1}. ${v.title} — ${v.url}`).join('\n')}` : 'No YouTube videos were found.', videos }
  }
  if (/(search|latest|news|look up|internet|web)/i.test(prompt) && key('TAVILY_API_KEY')) {
    const data = await (await fetch('https://api.tavily.com/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: key('TAVILY_API_KEY'), query: prompt, search_depth: 'advanced', max_results: 5, include_answer: true }) })).json()
    const sources = (data.results || []).map((r) => `- ${r.title}: ${r.url}`).join('\n')
    return { text: `${data.answer || 'Here is what I found:'}\n\nSources:\n${sources}` }
  }
  const groq = key('GROQ_API_KEY')
  if (groq) {
    const system = mode === 'builder' ? 'You are AlphaTekx Senior Staff Engineer. Output ONLY a fenced tsx code block containing one production React component. No imports. Use real 6-12 item state, useMemo search with toLowerCase includes, Math.max guards, localStorage persistence in try/catch, reduce totals/stats, and real onClick mutations. Build polished 400-700 line apps, never static mockups.' : 'You are AlphaTekx assistant. Answer clearly and helpfully.'
    const data = await fetchJson('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groq}` }, body: JSON.stringify({ model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile', messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], temperature: mode === 'builder' ? 0.2 : 0.5, max_tokens: mode === 'builder' ? 8000 : 2000 }) })
    if (data.error) throw new Error(data.error.message || 'Provider error')
    const generated = data.choices?.[0]?.message?.content || ''
    if (mode === 'builder' && !generated.includes('useState')) return { code: EMERGENCY_TRANSLATOR_CODE, response: EMERGENCY_TRANSLATOR_CODE, success: true, fallback: true }
    return mode === 'builder' ? { code: generated } : { text: generated || 'The AI returned no text.' }
  }
  const openai = key('OPENAI_API_KEY')
  if (openai && mode !== 'builder') {
    const data = await fetchJson('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openai}` }, body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', messages: [{ role: 'system', content: 'You are Alphatekx, a precise and helpful AI assistant. Explain clearly, use concise structure, and ask a clarifying question only when genuinely needed.' }, { role: 'user', content: prompt }], temperature: 0.5, max_tokens: 2000 }) })
    return { text: data.choices?.[0]?.message?.content || 'The AI returned no text.' }
  }
  if (mode === 'builder') return { code: EMERGENCY_TRANSLATOR_CODE, response: EMERGENCY_TRANSLATOR_CODE, success: true }
  return { text: 'AI is not configured yet. Add a provider key to .env.local, or open Builder to generate a working app locally.' }
}
const server = http.createServer(async (req, res) => {
  console.info(`[AlphaTekX] ${req.method} ${req.url}`)
  applyCors(req,res)
  if (req.method === 'OPTIONS') return json(res, 204, {})
  if (req.method === 'POST' && req.url === '/api/paystack/verify') return verifyPaystack(req, res)
  if (req.method === 'POST' && req.url === '/api/marketplace/purchase') return purchaseMarketplace(req, res)
  if (req.method !== 'POST' || req.url !== '/api/alpha') {
    if (req.url?.startsWith('/api/')) return json(res, 404, { error: 'API route not found' })
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 404, { error: 'Not found' })
    let pathname = '/'; try { pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname) } catch {}
    if (pathname.split('/').includes('..') || /%2e/i.test(req.url || '')) return json(res, 404, { error: 'Not found' })
    const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
    const candidate = path.resolve(distRoot, requested)
    const insideDist = candidate === distRoot || candidate.startsWith(`${distRoot}${path.sep}`)
    const file = insideDist && fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : path.resolve(distRoot, 'index.html')
    if (!fs.existsSync(file)) return json(res, 404, { error: 'Build not found. Run npm run build.' })
    const ext = path.extname(file)
    const type = ext === '.js' ? 'text/javascript; charset=utf-8' : ext === '.css' ? 'text/css; charset=utf-8' : ext === '.svg' ? 'image/svg+xml' : ext === '.json' ? 'application/json' : ext === '.webp' ? 'image/webp' : ext === '.png' ? 'image/png' : 'text/html; charset=utf-8'
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable' })
    if(req.method==='HEAD') return res.end()
    return fs.createReadStream(file).pipe(res)
  }
  let raw = ''; req.on('data', (c) => { raw += c }); req.on('end', async () => { let body = {}; try { body = JSON.parse(raw || '{}'); console.info(`[AlphaTekX] mission=${body.missionId || 'general'} mode=${body.mode || 'chat'}`); json(res, 200, await handleAlpha(String(body.prompt || ''), body.mode)) } catch (e) { console.error('API ALPHA ERROR', e); if (body.mode === 'builder') json(res, 200, { code: EMERGENCY_TRANSLATOR_CODE, response: EMERGENCY_TRANSLATOR_CODE, success: true, fallback: true }); else json(res, 200, { text: 'The AI service is temporarily unavailable.' }) } })
})
if (!process.env.VERCEL) server.listen(port, () => {
  console.info(`[AlphaTekX] God Craft OS server listening on ${port}`)
  console.info('[AlphaTekX] POST /api/alpha')
  console.info('[AlphaTekX] GET /* -> dist SPA')
})
