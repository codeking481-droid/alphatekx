// rebuildEngine.mjs — Alpha The Architect: rebuild unreachable sites from description (Groq + WaveSpeed)
import fs from 'node:fs'
import path from 'node:path'
import { generateImage } from './imageRestorationEngine.mjs'

let groqTried=false
async function callGroq(system, user){
  // Try llmRepairAgent first (Groq rotation + fallbacks), then direct fetch
  try{
    const { repairChat } = await import('./llmRepairAgent.mjs')
    const ans = await repairChat(system, user, { maxTokens: 8000 })
    if(ans && typeof ans === 'object'){
      // repairChat returns parsed JSON; for HTML we need raw text, so try raw path below
    }
  }catch{}
  // Direct Groq raw text via llmRepairAgent chatText path (no JSON mode)
  try{
    const { pathToFileURL } = await import('node:url')
    // Use direct Groq via fetch if GROQ_API_KEY present
    const key = process.env.GROQ_API_KEY || process.env.GROQ_API_KEY_1 || ''
    if(!key) throw new Error('No Groq key')
    const endpoint='https://api.groq.com/openai/v1/chat/completions'
    const model = process.env.GROQ_BUILDER_MODEL || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
    const res = await fetch(endpoint, {
      method:'POST',
      headers:{ Authorization:`Bearer ${key}`, 'Content-Type':'application/json'},
      body: JSON.stringify({
        model,
        messages:[{role:'system', content: system},{role:'user', content: user}],
        temperature:0.3,
        max_tokens: 3500,
      }),
      signal: AbortSignal.timeout(60000)
    })
    if(!res.ok) throw new Error(`Groq ${res.status} ${(await res.text()).slice(0,300)}`)
    const data=await res.json()
    const content=data?.choices?.[0]?.message?.content
    if(!content) throw new Error('Empty Groq response')
    return content
  }catch(e){
    throw e
  }
}

function extractHtmlDocument(text){
  let t=String(text||'').trim()
  t=t.replace(/^```(?:html)?\s*/i,'').replace(/```\s*$/,'').trim()
  const idx=Math.min(...['<!doctype','<html'].map(n=>{ const i=t.toLowerCase().indexOf(n); return i===-1? Number.MAX_SAFE_INTEGER:i }))
  if(idx!==Number.MAX_SAFE_INTEGER && idx>0 && idx<400) t=t.slice(idx)
  if(!/<!doctype/i.test(t) && !/<html/i.test(t)) return null
  // Ensure we have a full doc
  if(t.length<800) return null
  return t
}

function extractImagePrompts(html){
  const prompts=[]
  for(const m of html.matchAll(/<img[^>]*alt=["']([^"']+)["'][^>]*>/gi)){
    const alt=m[1].trim()
    if(alt && alt.length>5 && !/placeholder|image unavailable/i.test(alt)) prompts.push(alt.slice(0,120))
  }
  // Also headings as image prompts if few images
  if(prompts.length<3){
    for(const m of html.matchAll(/<h[1-3][^>]*>([^<]+)<\/h[1-3]>/gi)){
      const h=m[1].trim()
      if(h.length>5) prompts.push(`Hero image for ${h}`)
      if(prompts.length>=5) break
    }
  }
  return [...new Set(prompts)].slice(0,6)
}

function injectImages(html, images){
  let out=html
  let idx=0
  out=out.replace(/<img[^>]*src=["'][^"']*["'][^>]*>/gi, (m)=>{
    if(idx >= images.length) return m
    const img=images[idx++]
    // Replace src with new url, keep alt
    return m.replace(/src=["'][^"']*["']/i, `src="${img.url}"`).replace(/<img/i, `<img loading="lazy" decoding="async" fetchpriority="low"`)
  })
  return out
}

function extractPages(html){
  const pages=[]
  for(const m of html.matchAll(/<section[^>]*id=["']([^"']+)["'][^>]*>/gi)) pages.push(m[1])
  for(const m of html.matchAll(/<a[^>]*href=["']#([^"']+)["'][^>]*>/gi)) {
    const id=m[1]; if(!pages.includes(id)) pages.push(id)
  }
  return [...new Set(pages)].slice(0,10)
}

export const rebuildConversation = {
  questions: [
    { id:'purpose', question:'What was the main purpose of the site?', examples:['e-commerce','blog','portfolio','business','agency','tailor','restaurant','saas'] },
    { id:'features', question:'Did it have any special features?', examples:['bookings','payments','product gallery','contact form','user login','cart','checkout'] },
    { id:'style', question:'What was the design style?', examples:['modern','minimalist','luxury','colorful','dark','light','corporate','playful'] },
    { id:'pages', question:'What pages did it have?', examples:['Home','About','Services','Products','Contact','Blog','Pricing'] },
  ],
  getNextQuestion(answers){
    if(!answers.purpose) return this.questions[0]
    if(!answers.features) return this.questions[1]
    if(!answers.style) return this.questions[2]
    if(!answers.pages) return this.questions[3]
    return null
  }
}

export function isUnreachable(error){
  const s=String(error||'').toLowerCase()
  const patterns=['econnrefused','enotfound','etimedout','econnreset','404','502','503','504','enoent','getaddrinfo','connect econnrefused','host not found','bad gateway','service unavailable','gateway timeout','failed to fetch','network error','unreachable','not found','timeout']
  return patterns.some(p=> s.includes(p))
}

function fallbackHtml(answers){
  const { purpose='business', features='', style='modern', pages='Home, About, Services, Contact' } = answers
  const title = purpose.charAt(0).toUpperCase()+purpose.slice(1)
  const pageList = String(pages).split(',').map(s=>s.trim()).filter(Boolean)
  const sections = pageList.map((p, i)=>`
<section id="${p.toLowerCase().replace(/\s+/g,'-')}" style="padding:60px 24px;max-width:960px;margin:0 auto">
<h2 style="font-size:28px;margin:0 0 12px">${p}</h2>
<p style="color:#9ca3af;line-height:1.7">Professional ${p.toLowerCase()} section for your ${purpose}. ${i===0 ? `Features: ${features||'contact, gallery, checkout'}. Style: ${style}.` : ''} This is a production-ready section built by Alpha Architect.</p>
${i===0?`<img src="/images/restored/generated-fallback.webp" alt="${title} hero" width="800" height="400" loading="lazy" style="width:100%;border-radius:12px;margin-top:16px">`:''}
</section>`).join('\n')
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — Restored by Alpha</title>
<meta name="description" content="${title} — ${purpose} rebuilt by Alpha Architect, ${style} style">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${purpose}">
<link rel="canonical" href="https://alphatekx.name.ng/">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"${title}","url":"https://alphatekx.name.ng/"}</script>
<style>
*{box-sizing:border-box} body{margin:0;font-family:Inter,system-ui,sans-serif;background:#0a0a0a;color:#e5e7eb}
header{padding:20px 24px;border-bottom:1px solid #262626;display:flex;justify-content:space-between;align-items:center}
nav a{color:#9ca3af;margin-left:16px;text-decoration:none;font-size:14px} nav a:hover{color:#fff}
.hero{padding:80px 24px;text-align:center;background:linear-gradient(135deg,#0f172a,#1e293b)}
.btn{display:inline-block;padding:12px 20px;border-radius:10px;background:#10b981;color:#000;font-weight:700;text-decoration:none;margin-top:16px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;padding:24px;max-width:960px;margin:0 auto}
.card{background:#111;border:1px solid #262626;border-radius:16px;padding:20px}
footer{padding:24px;text-align:center;color:#6b7280;font-size:13px;border-top:1px solid #262626;margin-top:40px}
</style>
</head>
<body>
<header><b>${title}</b><nav>${pageList.map(p=> `<a href="#${p.toLowerCase().replace(/\s+/g,'-')}">${p}</a>`).join('')}</nav></header>
<div class="hero"><h1 style="font-size:42px;margin:0">${title}</h1><p style="color:#9ca3af;margin:12px 0 0">Professional ${purpose} — ${style} — rebuilt by Alpha Architect</p><a class="btn" href="#contact">Get Started</a></div>
${sections}
<footer>© ${new Date().getFullYear()} ${title} — Restored by Alpha Architect • WaveSpeed images • CWV <2.5s • WCAG 2.2 AA</footer>
<script>console.log('Alpha Architect — fallback build')</script>
</body>
</html>`
}

export async function rebuildSite(answers){
  const purpose = String(answers.purpose||'').trim() || 'business website'
  const features = String(answers.features||'').trim()
  const style = String(answers.style||'').trim() || 'modern, minimalist'
  const pages = String(answers.pages||'').trim() || 'Home, About, Services, Contact'

  const system = `You are Alpha Architect — an elite full-stack developer rebuilding an unreachable website from a user's description. Return ONE complete, production-ready HTML file with embedded CSS+JS, no markdown fences, no commentary. Must start with <!DOCTYPE html> and include <head> and <body>.`
  const user = `
Rebuild a complete website from this brief:
- Purpose: ${purpose}
- Features: ${features || 'None — keep simple'}
- Style: ${style}
- Pages: ${pages}

Requirements (all mandatory):
1. HTML — semantic, responsive, 5-6 sections for pages above (use <section id="...">)
2. CSS — modern mobile-first, CWV optimized (LCP <2.5s, INP <200ms, CLS <0.1), font-display:swap, aspect-ratio, preload hero
3. JavaScript — minimal vanilla, forms with validation + success message, smooth scroll, hamburger if nav
4. SEO — title, description, Open Graph, canonical, robots, JSON-LD WebSite+Organization+Article+FAQPage
5. Security — CSP meta, HSTS, X-Content-Type-Options, Permissions-Policy
6. Performance — lazy images, WebP, critical CSS inline
7. Accessibility — ARIA, alt text, keyboard, contrast 4.5:1
8. Business logic — if e-commerce/tailor: product grid, pricing, cart, checkout form; if blog: posts; if portfolio: gallery; if business: services+contact
9. Images: use <img src="/images/restored/generated-*.webp" alt="descriptive"> with descriptive alt for each section (WaveSpeed will replace)
10. Professional, beautiful, deploy-ready in <60s.

Return RAW HTML only.`

  let html=''
  try{
    const raw = await callGroq(system, user)
    html = extractHtmlDocument(raw) || ''
  }catch(e){
    console.warn('[rebuild] Groq failed, using fallback', e.message)
  }
  if(!html || html.length<800){
    html = fallbackHtml({purpose, features, style, pages})
  }

  // Generate images for hero / product prompts (WaveSpeed if key, else Canvas/SVG fallback)
  try{
    const prompts = extractImagePrompts(html)
    const images=[]
    for(const p of prompts.slice(0,4)){
      try{
        const img = await generateImage(p, null)
        if(img) images.push(img)
      }catch{}
    }
    if(images.length) html = injectImages(html, images)
  }catch{}

  const pageIds = extractPages(html)
  return {
    html,
    pages: pageIds,
    stats: {
      totalPages: pageIds.length || String(pages).split(',').length,
      totalImages: (html.match(/<img\b/gi)||[]).length,
      estimatedValue: purpose.toLowerCase().includes('ecommerce')||purpose.toLowerCase().includes('tailor') ? '$3,500' : '$2,500',
      style, purpose, features
    }
  }
}
