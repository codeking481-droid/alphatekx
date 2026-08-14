// Hybrid scanner: attempts real browser scanning with graceful fallback to fetch-based approach

export function createHybridScanner(chromium) {
  function scanFinding(id, severity, title, detail, code) {
    return { id, severity, title, detail, code }
  }

  async function scanWithBrowser(normalizedUrl, baseUrl, hostname) {
    const discoveredAPIs = []
    const securityFindings = []
    const seoFindings = []
    let pageTitle = ''
    let metaDescription = ''
    let totalHeaders = 0
    let finalUrl = normalizedUrl
    let responseStatus = 0
    const findings = []

    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
    })
    const page = await context.newPage()

    page.on('request', (request) => {
      try {
        const resourceType = request.resourceType()
        if (!['xhr', 'fetch'].includes(resourceType)) return
        const requestUrl = new URL(request.url())
        if (!requestUrl || (!requestUrl.origin || requestUrl.origin !== baseUrl) && requestUrl.hostname !== hostname) return
        const endpoint = `${requestUrl.pathname}${requestUrl.search || ''}`
        if (!endpoint || endpoint === '/') return
        const lower = endpoint.toLowerCase()
        if (!/(\/api|\/auth|\/login|\/logout|\/graphql|\/v1|\/users|\/admin|\/dashboard)/.test(lower)) return
        if (!discoveredAPIs.includes(endpoint)) discoveredAPIs.push(endpoint)
      } catch {
        // Ignore malformed request URLs
      }
    })

    const response = await page.goto(normalizedUrl, {
      waitUntil: 'networkidle',
      timeout: 60000,
    })

    if (!response) {
      throw new Error('The target page did not return a valid response.')
    }

    responseStatus = response.status()
    finalUrl = response.url() || normalizedUrl
    totalHeaders = Object.keys(response.headers() || {}).length

    if (responseStatus === 403) {
      throw new Error('Access denied (HTTP 403). The site may be blocking automated scan traffic.')
    }
    if (responseStatus === 401) {
      throw new Error('Unauthorized (HTTP 401). This endpoint requires authentication.')
    }
    if (!response.ok()) {
      throw new Error(`Target responded with HTTP ${responseStatus}.`)
    }

    pageTitle = await page.title().catch(() => '')
    metaDescription =
      (await page.locator('meta[name="description"]').getAttribute('content').catch(() => null)) ||
      (await page.locator('meta[property="og:description"]').getAttribute('content').catch(() => null)) ||
      ''

    const h1Matches = await page.locator('h1').allTextContents().catch(() => [])
    const h2Matches = await page.locator('h2').allTextContents().catch(() => [])
    const h3Matches = await page.locator('h3').allTextContents().catch(() => [])
    const scriptSources = await page
      .$$eval('script[src]', (scripts) => scripts.map((script) => script.getAttribute('src')).filter(Boolean))
      .catch(() => [])
    const imageAltIssues = await page
      .$$eval('img', (images) =>
        images
          .filter((img) => !img.getAttribute('alt') || !img.getAttribute('alt').trim())
          .map((img) => img.getAttribute('src') || 'image')
      )
      .catch(() => [])

    for (const scriptSrc of scriptSources) {
      try {
        const scriptUrl = new URL(scriptSrc, baseUrl).toString()
        const scriptText = await fetch(scriptUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AlphaTekX/1.0)' },
          signal: AbortSignal.timeout(15000),
        })
          .then((res) => res.text())
          .catch(() => '')

        if (!scriptText) continue

        const routeRegex = /(?:["'`])((?:\/)(?:api|auth|login|logout|admin|dashboard|users|v1|graphql)[^"'`\s]*)?(?:["'`])/gi
        const matches = new Set()
        for (const match of scriptText.matchAll(routeRegex)) {
          const candidate = match[1] || match[0]
          if (candidate && /(\/api|\/auth|\/login|\/logout|\/admin|\/dashboard|\/users|\/v1|\/graphql)/i.test(candidate)) {
            matches.add(candidate.replace(/["'`]/g, ''))
          }
        }

        const generalPattern = /(?:"|')((?:\/|api\/|auth\/)[A-Za-z0-9_\-/]+)(?:"|')/gi
        for (const match of scriptText.matchAll(generalPattern)) {
          const candidate = match[1]
          if (candidate && /(\/api|\/auth|\/login|\/logout|\/admin|\/dashboard|\/users|\/v1|\/graphql|api\/)/i.test(candidate)) {
            matches.add(candidate)
          }
        }

        for (const candidate of matches) {
          if (!discoveredAPIs.includes(candidate)) discoveredAPIs.push(candidate)
        }
      } catch {
        // Continue scanning
      }
    }

    const sensitivePaths = ['/.env', '/.git/config', '/backup.sql', '/phpinfo.php', '/config.json']
    const probeContext = await browser.newContext({
      ignoreHTTPSErrors: true,
      userAgent: 'Mozilla/5.0 (compatible; AlphaTekX/1.0)',
    })
    try {
      for (const sensitivePath of sensitivePaths) {
        const probeUrl = new URL(sensitivePath, baseUrl).toString()
        try {
          const probeResponse = await probeContext.newPage().then(async (probePage) => {
            try {
              return await probePage.goto(probeUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
            } finally {
              await probePage.close().catch(() => {})
            }
          })

          if (probeResponse && probeResponse.status() === 200) {
            const finding = {
              type: 'security_exposure',
              severity: 'critical',
              path: sensitivePath,
              url: probeUrl,
              status: 200,
              message: `Sensitive file exposed: ${sensitivePath}`,
            }

            securityFindings.push(finding)
            findings.push(
              scanFinding(
                `exposed-${sensitivePath.replace(/[^a-z0-9]+/gi, '-').replace(/(^-|-$)/g, '')}`,
                'critical',
                `Sensitive file exposed: ${sensitivePath}`,
                `The file ${sensitivePath} is publicly accessible and should not be exposed.`,
                'EXPOSED_PATH'
              )
            )
          }
        } catch {
          // Ignore inaccessible files
        }
      }
    } finally {
      await probeContext.close().catch(() => {})
    }

    const sslValid = new URL(normalizedUrl).protocol === 'https:' && !!(response && response.securityDetails && response.securityDetails())
    seoFindings.push({
      type: 'metaDescription',
      ok: Boolean(metaDescription.trim()),
      value: metaDescription || 'Missing',
      message: metaDescription ? 'Meta description found.' : 'Meta description is missing.',
    })
    seoFindings.push({
      type: 'headingStructure',
      ok: h1Matches.length > 0,
      value: { h1: h1Matches, h2: h2Matches, h3: h3Matches },
      message: h1Matches.length > 0 ? 'H1/H2/H3 tags found.' : 'Missing H1 heading.',
    })
    seoFindings.push({
      type: 'imageAltText',
      ok: imageAltIssues.length === 0,
      value: imageAltIssues.slice(0, 10),
      message: imageAltIssues.length === 0 ? 'All images include alt text.' : `${imageAltIssues.length} images missing alt text.`,
    })
    seoFindings.push({
      type: 'sslCertificate',
      ok: sslValid,
      value: sslValid ? 'Valid TLS detected.' : 'TLS not confirmed.',
      message: sslValid ? 'HTTPS is active.' : 'HTTPS is not confirmed.',
    })

    if (!metaDescription) {
      findings.push(scanFinding('seo-description-missing', 'info', 'Missing meta description', 'Add meta description for SEO.', 'SEO_DESCRIPTION'))
    }
    if (h1Matches.length === 0) {
      findings.push(scanFinding('seo-h1-missing', 'warning', 'Missing H1 heading', 'Add H1 for accessibility and SEO.', 'SEO_H1'))
    }
    if (imageAltIssues.length > 0) {
      findings.push(scanFinding('seo-alt-missing', 'warning', `${imageAltIssues.length} images missing alt text`, 'Add alt text for accessibility.', 'SEO_ALT'))
    }

    const issueWeight = findings.reduce((score, item) => score + (item.severity === 'critical' ? 28 : item.severity === 'warning' ? 12 : 3), 0)
    const finalScore = Math.max(0, Math.min(100, 100 - issueWeight))
    const risk = finalScore >= 85 ? 'Low risk' : finalScore >= 70 ? 'Moderate risk' : finalScore >= 50 ? 'High risk' : 'Critical risk'

    await page.close().catch(() => {})
    await browser.close().catch(() => {})

    return {
      discoveredAPIs,
      securityFindings,
      seoFindings,
      pageTitle,
      metaDescription,
      totalHeaders,
      findings,
      score: finalScore,
      risk,
      totalFindings: findings.length,
      scannedUrl: finalUrl,
      responseStatus,
      rootDomain: new URL(finalUrl).hostname,
    }
  }

  async function scanWithFetch(normalizedUrl, baseUrl) {
    const findings = []
    const securityFindings = []
    const discoveredAPIs = []
    const seoFindings = []

    const fetchStartedAt = Date.now()
    let html = ''
    let finalUrl = normalizedUrl
    let responseStatus = 0

    const response = await fetch(normalizedUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://alphatekx.name.ng/',
      },
      signal: AbortSignal.timeout(25000),
      redirect: 'follow',
    })

    responseStatus = response.status
    finalUrl = response.url || normalizedUrl

    if (responseStatus === 403) {
      throw new Error('Access denied (HTTP 403). The site may be blocking automated scan traffic.')
    }
    if (responseStatus === 401) {
      throw new Error('Unauthorized (HTTP 401). This endpoint requires authentication.')
    }
    if (!response.ok) {
      throw new Error(`Target responded with HTTP ${responseStatus}.`)
    }

    html = await response.text()
    if (!html || html.trim().length === 0) {
      throw new Error('Received an empty HTML response from the target site.')
    }

    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || ''
    const metaDescription =
      (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i) || [])[1] ||
      (html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>/i) || [])[1] ||
      ''
    const h1Matches = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((match) => match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean)
    const h2Matches = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].map((match) => match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean)
    const h3Matches = [...html.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)].map((match) => match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean)
    const imgMatches = [...html.matchAll(/<img\b[^>]*src=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]).filter(Boolean)

    const ttfbMs = Math.max(0, Date.now() - fetchStartedAt)

    const secretPatterns = [
      { regex: /sk_live_[A-Za-z0-9]+/gi, label: 'Live secret key exposed', code: 'SECRET_LEAK' },
      { regex: /pk_live_[A-Za-z0-9]+/gi, label: 'Live publish key exposed', code: 'SECRET_LEAK' },
      { regex: /AKIA[0-9A-Z]{16}/g, label: 'AWS access key exposed', code: 'SECRET_LEAK' },
      { regex: /openai\s*[:=][\s"']*sk-[A-Za-z0-9]+/gi, label: 'OpenAI API key exposed', code: 'SECRET_LEAK' },
      { regex: /AIza[0-9A-Za-z\-_]{35}/g, label: 'Google API key exposed', code: 'SECRET_LEAK' },
    ]

    for (const pattern of secretPatterns) {
      if (pattern.regex.test(html)) {
        findings.push(scanFinding(`secret-${pattern.code}`, 'critical', pattern.label, 'Move secrets to server-only environment.', pattern.code))
      }
      pattern.regex.lastIndex = 0
    }

    const sensitivePaths = ['/.env', '/.git/config', '/config.json', '/backup.sql', '/phpinfo.php']
    for (const sensitivePath of sensitivePaths) {
      const probeUrl = new URL(sensitivePath, baseUrl).toString()
      try {
        const probeResponse = await fetch(probeUrl, {
          method: 'GET',
          redirect: 'follow',
          headers: { 'User-Agent': 'AlphaTekX-Scanner' },
          signal: AbortSignal.timeout(8000),
        })

        if (probeResponse.status === 200) {
          securityFindings.push({
            type: 'security_exposure',
            severity: 'critical',
            path: sensitivePath,
            url: probeUrl,
            status: 200,
            message: `Sensitive file exposed: ${sensitivePath}`,
          })
          findings.push(
            scanFinding(
              `exposed-${sensitivePath.replace(/[^a-z0-9]+/gi, '-').replace(/(^-|-$)/g, '')}`,
              'critical',
              `Sensitive file exposed: ${sensitivePath}`,
              `The file ${sensitivePath} is publicly accessible.`,
              'EXPOSED_PATH'
            )
          )
        }
      } catch {
        // Ignore missing files
      }
    }

    if (ttfbMs > 2500) {
      findings.push(scanFinding(`performance-${ttfbMs}`, 'warning', `Slow response: ${ttfbMs}ms`, `Server took ${ttfbMs}ms to respond.`, 'PERFORMANCE'))
    }

    if (h1Matches.length === 0) {
      findings.push(scanFinding('seo-h1', 'warning', 'Missing H1 heading', 'Add H1 for SEO and accessibility.', 'SEO_H1'))
    }

    if (!metaDescription) {
      findings.push(scanFinding('seo-description', 'info', 'Missing meta description', 'Add meta description for SEO.', 'SEO_DESCRIPTION'))
    }

    seoFindings.push({
      type: 'metaDescription',
      ok: Boolean(metaDescription.trim()),
      value: metaDescription || 'Missing',
      message: metaDescription ? 'Found.' : 'Missing.',
    })
    seoFindings.push({
      type: 'headingStructure',
      ok: h1Matches.length > 0,
      value: { h1: h1Matches, h2: h2Matches, h3: h3Matches },
      message: h1Matches.length > 0 ? 'H1/H2/H3 found.' : 'Missing H1.',
    })

    const issueWeight = findings.reduce((score, item) => score + (item.severity === 'critical' ? 28 : item.severity === 'warning' ? 12 : 3), 0)
    const finalScore = Math.max(0, Math.min(100, 100 - issueWeight))
    const risk = finalScore >= 85 ? 'Low risk' : finalScore >= 70 ? 'Moderate risk' : finalScore >= 50 ? 'High risk' : 'Critical risk'

    return {
      discoveredAPIs,
      securityFindings,
      seoFindings,
      pageTitle: title,
      metaDescription,
      totalHeaders: 0,
      findings,
      score: finalScore,
      risk,
      totalFindings: findings.length,
      scannedUrl: finalUrl,
      responseStatus,
      rootDomain: new URL(finalUrl).hostname,
    }
  }

  return async function runScanFromUrl(targetUrl) {
    const normalizedUrl = String(targetUrl || '').trim()
    if (!normalizedUrl) throw new Error('Missing URL')

    let parsed
    try {
      parsed = new URL(normalizedUrl)
    } catch {
      throw new Error('Please enter a valid http or https URL.')
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only http and https URLs are allowed.')

    const baseUrl = parsed.origin
    const hostname = parsed.hostname

    // Try browser scanning first
    try {
      console.log('[Scanner] Attempting real browser scan...')
      return await scanWithBrowser(normalizedUrl, baseUrl, hostname)
    } catch (browserErr) {
      console.warn('[Scanner] Browser scan failed, falling back to fetch:', browserErr instanceof Error ? browserErr.message : String(browserErr))
      // Fall back to fetch-based scanning
      try {
        console.log('[Scanner] Using fetch-based fallback scan...')
        return await scanWithFetch(normalizedUrl, baseUrl)
      } catch (fetchErr) {
        const message = fetchErr instanceof Error ? fetchErr.message : 'Scan failed.'
        if (message.includes('AbortSignal') || message.includes('timeout')) {
          throw new Error('Scan timed out. The website may be unresponsive.')
        }
        if (message.includes('fetch failed') || message.includes('ECONNREFUSED') || message.includes('ENOTFOUND')) {
          throw new Error('Failed to reach the site. Check the URL and ensure the site is online.')
        }
        throw new Error(message)
      }
    }
  }
}
