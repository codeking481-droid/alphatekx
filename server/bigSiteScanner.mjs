// bigSiteScanner.mjs — sitemap-first for big earning sites (100+ pages, 2026)
import fs from 'node:fs'
import path from 'node:path'
import { detectIssuesV2, applyFixesToHtmlV2, findBrokenResources } from './restorationEngineV2.mjs'
import { detectIssuesV3, applyV3Fixes } from './restorationEngineV3.mjs'
import { buildGreenCard } from './greenCard.mjs'
import { revenueEstimator } from './revenueEstimator.mjs'

const FETCH_TIMEOUT = 8000
const MAX_PAGES_DEFAULT = 100

async function fetchText(url){
  const r = await fetch(url, { headers:{'User-Agent':'Mozilla/5.0 AlphaBigSite/2026'}, signal: AbortSignal.timeout(FETCH_TIMEOUT), redirect:'follow' })
  if(!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.text()
}
async function fetchSitemapUrls(sitemapUrl){
  const xml = await fetchText(sitemapUrl)
  const urls=[]
  // sitemapindex
  for(const m of xml.matchAll(/<sitemap>\s*<loc>([^<]+)<\/loc>/gi)) urls.push({ type:'index', loc: m[1].trim() })
  if(urls.length) return urls
  // urlset
  for(const m of xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>/gi)) urls.push({ type:'url', loc: m[1].trim() })
  return urls
}
export async function discoverSitemapUrls(origin){
  const candidates=[]
  for(const p of ['/sitemap.xml','/sitemap_index.xml','/sitemap-index.xml','/sitemap.xml.gz']){
    try{
      const xml=await fetchText(origin+p)
      if(xml.includes('<urlset')||xml.includes('<sitemapindex')){ candidates.push(origin+p); break }
    }catch{}
  }
  try{
    const robots=await fetchText(origin+'/robots.txt')
    for(const m of robots.matchAll(/Sitemap:\s*(\S+)/gi)) candidates.push(m[1].trim())
  }catch{}
  // dedupe
  return [...new Set(candidates)]
}
export async function crawlBigSite(startUrl, maxPages=MAX_PAGES_DEFAULT){
  const origin = new URL(startUrl).origin
  let urls=[]
  let sitemapUsed=false
  // Try sitemap first
  try{
    const sitemaps=await discoverSitemapUrls(origin)
    for(const sm of sitemaps){
      try{
        const entries=await fetchSitemapUrls(sm)
        const indexes=entries.filter(e=>e.type==='index')
        if(indexes.length){
          for(const idx of indexes.slice(0,3)){
            try{
              const child=await fetchSitemapUrls(idx.loc)
              for(const c of child) if(c.type==='url') urls.push(c.loc)
            }catch{}
          }
        } else {
          for(const e of entries) if(e.type==='url') urls.push(e.loc)
        }
        if(urls.length) { sitemapUsed=true; break }
      }catch{}
    }
  }catch{}

  // Filter to 200 canonical only (HEAD check light)
  if(urls.length){
    urls=[...new Set(urls)].slice(0, maxPages)
  } else {
    // Fallback BFS crawl (same-origin)
    urls=[startUrl]
    const seen=new Set(urls)
    const queue=[startUrl]
    while(queue.length && urls.length < maxPages){
      const cur=queue.shift()
      try{
        const html=await fetchText(cur)
        for(const m of html.matchAll(/<a[^>]+href=["']([^"#]+)["']/gi)){
          try{
            const abs=new URL(m[1], cur)
            if(abs.origin!==origin) continue
            abs.hash=''
            const key=abs.toString()
            if(seen.has(key)) continue
            seen.add(key); queue.push(key); urls.push(key)
            if(urls.length>=maxPages) break
          }catch{}
        }
      }catch{}
    }
  }
  // Filter non-200 later during scan, but keep list
  urls=[...new Set(urls)].slice(0, maxPages)
  return { urls, sitemapUsed }
}

export async function scanBigSite(startUrl, maxPages=MAX_PAGES_DEFAULT){
  const { urls, sitemapUsed } = await crawlBigSite(startUrl, maxPages)
  const findings=[]
  const pages=[]
  // Batch 8 concurrency
  const batch=8
  for(let i=0;i<urls.length;i+=batch){
    const slice=urls.slice(i,i+batch)
    const results=await Promise.all(slice.map(async (u)=>{
      try{
        const html=await fetchText(u)
        const v2=detectIssuesV2(html)
        const v3=detectIssuesV3(html)
        const probe= await findBrokenResources(html, u).catch(()=>({findings:[], brokenRecords:[]}))
        const all=[...v2,...v3, ...probe.findings]
        return { url:u, html, findings:all, count: all.length }
      }catch(e){
        return { url:u, html:'', findings:[{type:'fetch_failed', severity:'high', description: String(e.message).slice(0,120), file:u, line:0}], count:1 }
      }
    }))
    for(const r of results){
      pages.push(r)
      for(const f of r.findings) findings.push({ ...f, page:r.url, file: r.url, line: f.line||0 })
    }
  }
  const beforeScore = Math.max(0, 100 - findings.length*2)
  const revenue = revenueEstimator(findings, 10000)
  const greenCard = buildGreenCard({ site: startUrl, pagesScanned: urls.length, sitemapUsed, findings, beforeScore, afterScore: beforeScore })
  return { urls, sitemapUsed, pages, findings, greenCard, beforeScore, revenue }
}
