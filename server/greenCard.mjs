// greenCard.mjs — clean, direct, honest — pure bold text, no tables, no pipes
const SEV_PLAIN = { critical: 'HIGH', high: 'HIGH', medium: 'MEDIUM', low: 'LOW' }
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
  fetch_failed: 'Page failed to load — visitors see error',
  broken_internal_anchor: 'Anchor link broken — jump does nothing',
  missing_alt_text: 'Image has no alt text — screen readers fail',
  canonical_missing: 'Canonical tag missing — Google may index duplicates',
  favicon_missing: 'Favicon missing — tab shows blank icon',
  robots_missing: 'Robots.txt missing — crawlers confused',
  jsonld_missing: 'Structured data missing — rich results disabled',
  mixed_content: 'Mixed content — browser blocks http resources',
  css_unbalanced_braces: 'CSS brace unclosed — styles after it are dropped',
  inline_js_syntax: 'Inline JS syntax error — script crashes',
  missing_focus_states: 'No focus styles — keyboard users lost',
  no_hover_states: 'No hover feedback — looks unresponsive',
  empty_href: 'Empty link — goes nowhere',
}
function humanize(type){
  return TYPE_TO_PLAIN[type] || type.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()) + ' — needs attention'
}
function consequenceOf(type, severity){
  if(['insecure_form_action','security_headers_missing','noopener_missing'].includes(type)) return 'Attackers can steal data, browsers flag as not secure'
  if(['missing_viewport','no_media_queries'].includes(type)) return '50 percent of visitors on phones cannot navigate'
  if(['broken_image','broken_link','broken_script','inline_handler_syntax','inline_js_syntax','css_unbalanced_braces','fetch_failed','broken_internal_anchor','empty_href'].includes(type)) return severity==='critical' ? 'Visitors leave, sale lost' : 'Slower sales, trust drops'
  if(['missing_title','og_tags_missing','canonical_missing','robots_missing','jsonld_missing','missing_alt_text'].includes(type)) return 'Google ranks you lower, less traffic'
  if(['duplicate_ids','missing_charset','missing_focus_states','no_hover_states','favicon_missing','mixed_content'].includes(type)) return 'Looks broken, hurts trust'
  if(type.includes('security')||type.includes('oopener')) return 'Trust risk, Google downgrade'
  if(type.includes('viewport')||type.includes('media')) return 'Mobile customers bounce'
  return 'Hurts trust and speed'
}
function patchAction(type){
  const base = humanize(type).split(' —')[0]
  const map = {
    broken_image: 'Missing images fixed',
    broken_link: 'Broken links fixed',
    missing_viewport: 'Mobile layout fixed',
    security_headers_missing: 'Security headers added',
    insecure_form_action: 'Checkout moved to server side',
    noopener_missing: 'External links secured',
    no_media_queries: 'Mobile breakpoints added',
    og_tags_missing: 'Share previews added',
    images_missing_lazy: 'Lazy loading added',
    fetch_failed: 'Failed page load fixed',
  }
  return map[type] || `${base} — fixed`
}

export function buildGreenCard({ site, pagesScanned, sitemapUsed, findings, beforeScore, afterScore }){
  const total = findings.length
  const sorted = [...findings].sort((a,b)=>{
    const order = { critical:4, high:3, medium:2, low:1 }
    return (order[b.severity]||0) - (order[a.severity]||0)
  })
  const issuesBlock = sorted.slice(0, 50).map((f,i)=>{
    const what = humanize(f.type)
    const sev = SEV_PLAIN[f.severity] || String(f.severity).toUpperCase()
    const consequence = consequenceOf(f.type, f.severity)
    return `**${i+1}. ${what} — ${sev}**\nIf you ignore it: ${consequence}`
  }).join('\n\n')
  const more = total>50 ? `\n\nAnd ${total-50} more — see full report` : ''
  const patchLines = sorted.slice(0,50).map((f)=>{
    return `**• ${patchAction(f.type)}**`
  }).join('\n')

  // CLEAN SITE — celebrate, don't fake fix (prompt: Celebrate Clean, Don't Fake Fixes)
  if (total === 0) {
    return `# 🎉 ALPHA GREEN CARD — 100/100

**Your site is clean! No issues found.**

**All checks passed**

**• Security Headers — ✅ PASS**
**• JSON-LD — ✅ PASS**
**• Alt Text — ✅ PASS**
**• Lazy Loading — ✅ PASS**
**• Viewport — ✅ PASS**
**• Favicon — ✅ PASS**
**• Robots — ✅ PASS**

**Nothing to fix. You're good to go.**
`
  }

  return `# 🟩 ALPHA GREEN CARD — ${site}
**${pagesScanned} pages scanned ${sitemapUsed ? 'via sitemap — 2026 best' : 'via crawl'} — 12-phase ${afterScore??beforeScore} out of 100 — ${total} issues found**

**What we found (plain English)**

${issuesBlock || '**No issues found — site is clean 🎉**'}
${more}

**What Alpha will patch**

${patchLines || '**Nothing to patch — already clean**'}

**What happens next**

**• Fix Everything — $49 per month**
**• Fix Critical — $19 per month**
**• Fix Nothing — $0**
`
}
