// greenCard.mjs — plain English, green card, money-first, no code jargon + $ loss
import { revenueEstimator } from './revenueEstimator.mjs'
const SEV_PLAIN = { critical: 'Needs fix today (loses money)', high: 'Fix this week', medium: 'Fix soon', low: 'Nice to have' }
const TYPE_TO_PLAIN = {
  broken_image: 'Photo missing — shows empty box',
  broken_link: 'Link goes nowhere — clicking does nothing',
  broken_script: 'Script broken — button does nothing',
  missing_viewport: 'Phone layout broken — content overflows',
  missing_title: 'Google title missing — ranking hurt',
  noopener_missing: 'New tab link unsafe — opened page can control this page',
  insecure_form_action: 'Checkout sends over http — card data not encrypted',
  duplicate_ids: 'Same ID twice — screen readers + Google confused',
  inline_handler_syntax: 'Click code broken — button throws instead of acting',
  missing_charset: 'Charset missing — letters may garble',
  no_media_queries: 'No phone breakpoints — looks broken on mobile',
  security_headers_missing: 'Security headers missing — injection risk',
  og_tags_missing: 'Share preview missing — links look bare',
  images_missing_lazy: 'Images load eagerly — slows first paint',
  // fallback: humanize
}
function humanize(type){
  return TYPE_TO_PLAIN[type] || type.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()) + ' — needs attention'
}
function costOf(type, severity){
  if(['broken_image','broken_link','inline_handler_syntax','insecure_form_action'].includes(type)) return severity==='critical' ? 'Lost sale, customer leaves' : 'Slower sales'
  if(type.includes('security')||type.includes('noopener')) return 'Trust risk, Google downgrade'
  if(type.includes('viewport')||type.includes('media')) return 'Mobile customers bounce'
  if(type.includes('title')||type.includes('og')||type.includes('canonical')||type.includes('sitemap')) return 'Slower Google indexing, less traffic'
  return 'Hurts trust + speed'
}
export function buildGreenCard({ site, pagesScanned, sitemapUsed, findings, beforeScore, afterScore, monthlyRevenue=10000 }){
  const total = findings.length
  const rev = revenueEstimator(findings, monthlyRevenue)
  const byType = {}
  for(const f of findings) byType[f.type]=(byType[f.type]||0)+1
  const top = Object.entries(byType).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([t,c])=> `${c}× ${humanize(t).split(' —')[0]}`).join(', ')
  const oneSentence = top ? `Your site loses sales because ${top.toLowerCase()}.` : 'Your site is mostly healthy — a few small fixes.'
  const rows = rev.sorted.slice(0, 50).map((f,i)=>{
    const where = f.file ? `${f.file}:${f.line||''}` : (f.page||'page')
    const what = humanize(f.type)
    return `| ${i+1} | ${where} | ${SEV_PLAIN[f.severity]||f.severity} | ${what} | **${f.lossFormatted}** |`
  }).join('\n')
  const more = total>50 ? `\n*…and ${total-50} more — see full report.json*` : ''
  const patchLines = rev.sorted.slice(0,50).map((f,i)=>{
    const file = f.file ? `${f.file}:${f.line||''}` : (f.page||'')
    return `- ${humanize(f.type).split(' —')[0]} — **${f.lossFormatted}** — file: ${file}`
  }).join('\n')
  return `# 🟩 ALPHA GREEN CARD — ${site}
**${pagesScanned} pages scanned ${sitemapUsed ? 'via sitemap — 2026 best' : 'via crawl'} — 12-phase ${afterScore??beforeScore}/100 — ${total} issues found**

**Estimated monthly revenue loss: ${rev.totalLossFormatted} — Fix cost: $49/mo — ROI: ${rev.roiAll}x — recover ${rev.totalLossFormatted} for $49**

**Top 3 by $ loss:**
${rev.sorted.slice(0,3).map((f,i)=> `${i+1}. **${humanize(f.type).split(' —')[0]}** — ${f.lossFormatted} — ${f.file||f.page||''}`).join('\n') || '- None'}

> **Click Fix to recover ${rev.totalLossFormatted}. Top 3 alone cost ${rev.top3Loss}.**

**In one sentence:** ${oneSentence}

**What this costs you (plain English + $):**
${rev.sorted.slice(0,3).map(f=> `- ${humanize(f.type)} → **${f.lossFormatted}**`).join('\n') || '- Small fixes, no lost sales yet'}

**Full analysis — every error in plain English (no code) + $ loss:**

| # | Where | How bad | What we found (plain English) | What it costs you |
|---|---|---|---|---|
${rows}
${more}

**What Alpha will patch — when you say "fix":**
${patchLines || '- Nothing to patch — already clean'}
${total>50?`\n*Full patch ZIP: ${pagesScanned} pages + originals/ + report.json*` : ''}

**What happens next:**
- **Fix Everything — $49/mo** → recover **${rev.totalLossFormatted}** (ROI ${rev.roiAll}x)
- **Fix Critical — $19/mo** → recover **${rev.top3Loss}** (top 3, ROI ${rev.roiCritical}x)
- **Fix Nothing — $0** → continue losing **${rev.totalLossFormatted}**

**Verification (after fix):**
- ✅ Photos load (no 404) — LCP <2.5s
- ✅ Buttons/links work — no dead clicks
- ✅ Google finds canonical + sitemap — 12-phase 100/100

*Engineer view: file:line at end of each row. Founder view: read first 3 columns + $.*
`
}
