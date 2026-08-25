// revenueEstimator.mjs — HONEST Green Card $ loss — only real revenue, no fake defaults
export const revenueEstimator = (findings, monthlyRevenue = null) => {
  const isHonest = monthlyRevenue !== null && monthlyRevenue !== undefined && Number(monthlyRevenue) > 0
  const honestRevenue = isHonest ? Number(monthlyRevenue) : null
  if (!isHonest) {
    const unknownIssues = findings.map(issue => ({
      ...issue,
      impact: 5,
      loss: 0,
      lossFormatted: 'Unknown — enter revenue to calculate',
    }))
    const sorted = [...unknownIssues].sort((a,b)=> 0)
    return {
      issues: unknownIssues,
      sorted,
      totalLoss: 0,
      totalLossFormatted: 'Unknown — enter revenue to calculate',
      top3Loss: 'Unknown — enter revenue to calculate',
      roiAll: 'Unknown',
      roiCritical: 'Unknown',
      actions: {
        fix_all: { price: 49, label: 'Fix All — $49/mo', desc: `Fix all ${findings.length} issues`, recover: 'Unknown — enter revenue to calculate' },
        fix_critical: { price: 19, label: 'Fix Critical — $19/mo', desc: 'Fix top 3 issues', recover: 'Unknown — enter revenue to calculate' },
        fix_none: { price: 0, label: 'Fix Nothing — $0', desc: 'Continue losing Unknown' },
      },
      isHonest: false,
    }
  }
  const impactMap = {
    broken_image: 0.10,
    broken_checkout: 0.50,
    broken_api: 0.30,
    mobile_layout_broken: 0.25,
    security_headers_missing: 0.15,
    slow_load_time: 0.20,
    missing_seo_tags: 0.10,
    broken_links: 0.05,
    broken_link: 0.05,
    accessibility_issues: 0.05,
    mixed_content: 0.10,
    no_media_queries: 0.20,
    missing_alt_text: 0.05,
    img_missing_alt: 0.05,
    empty_href: 0.03,
    duplicate_ids: 0.05,
    jsonld_missing: 0.10,
    missing_viewport: 0.15,
    og_tags_missing: 0.10,
    canonical_missing: 0.05,
    robots_missing: 0.03,
    favicon_missing: 0.02,
    insecure_form_action: 0.40,
    inline_handler_syntax: 0.15,
    inline_js_syntax: 0.15,
    css_unbalanced_braces: 0.05,
    missing_charset: 0.02,
    missing_title: 0.08,
    no_hover_states: 0.02,
    cwv_2026: 0.12,
    images_missing_lazy: 0.08,
    noopener_missing: 0.05,
    broken_internal_anchor: 0.04,
    missing_focus_states: 0.03,
    fetch_failed: 0.20,
  }
  const issuesWithLoss = findings.map(issue => {
    const impact = impactMap[issue.type] ?? 0.05
    const loss = honestRevenue * impact
    return {
      ...issue,
      impact: Math.round(impact * 100),
      loss,
      lossFormatted: `$${Math.round(loss).toLocaleString()}/month`,
    }
  })
  const sorted = [...issuesWithLoss].sort((a,b)=> b.loss - a.loss)
  const totalLoss = issuesWithLoss.reduce((sum, i) => sum + i.loss, 0)
  const top3Loss = sorted.slice(0,3).reduce((s,i)=> s+i.loss, 0)
  return {
    issues: issuesWithLoss,
    sorted,
    totalLoss,
    totalLossFormatted: `$${Math.round(totalLoss).toLocaleString()}/month`,
    top3Loss: `$${Math.round(top3Loss).toLocaleString()}/month`,
    roiAll: totalLoss >0 ? Math.round((totalLoss / 49) * 10)/10 : 0,
    roiCritical: top3Loss>0 ? Math.round((top3Loss / 19)*10)/10 : 0,
    actions: {
      fix_all: { price: 49, label: 'Fix All — $49/mo', desc: `Fix all ${findings.length} issues`, recover: `$${Math.round(totalLoss).toLocaleString()}/month` },
      fix_critical: { price: 19, label: 'Fix Critical — $19/mo', desc: 'Fix top 3 issues', recover: `$${Math.round(top3Loss).toLocaleString()}/month` },
      fix_none: { price: 0, label: 'Fix Nothing — $0', desc: `Continue losing ${`$${Math.round(totalLoss).toLocaleString()}/month`}` },
    },
    isHonest: true,
  }
}
