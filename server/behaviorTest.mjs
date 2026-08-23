/**
 * ALPHATEKX BEHAVIOR TESTS — prove the restored site actually WORKS.
 *
 * A health score says nothing is broken; these tests prove things WORK:
 * the page boots without crashes, content renders, forms submit, buttons
 * respond. Every assertion runs the restored HTML in a real headless
 * Chromium — the same standard a human QA engineer would apply.
 *
 * NEVER throws: any infrastructure failure degrades to "tests unavailable"
 * and the pipeline continues (scores still govern delivery).
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Static assertions that need no browser — cheap and always available.
 */
function staticChecks(html) {
  const checks = []
  const hasDoc = /<!doctype\s+html/i.test(html) || /<html[\s>]/i.test(html)
  checks.push({ name: 'document_structure', passed: hasDoc, detail: hasDoc ? 'valid HTML document' : 'missing <!DOCTYPE html>/<html>' })

  const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html)
  const bodyHtml = bodyMatch?.[1] || ''
  const visibleText = String(bodyHtml || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  checks.push({ name: 'visible_content', passed: visibleText.length >= 50, detail: `${visibleText.length} visible chars` })

  const anchors = [...html.matchAll(/href="#([\w-]+)"/gi)].map((m) => m[1])
  const missingAnchors = anchors.filter((id) => !new RegExp(`id=["']${id}["']`, 'i').test(html))
  checks.push({ name: 'anchor_targets', passed: missingAnchors.length === 0, detail: missingAnchors.length ? `dead anchors: ${missingAnchors.slice(0, 3).join(', ')}` : `${anchors.length} in-page anchors resolve` })

  return checks
}

/**
 * Boot the restored page in a real browser and exercise it like a user:
 * load → observe crashes → interact with forms and buttons → report.
 * @param {{html:string}} input
 * @returns {Promise<{available:boolean, total:number, passed:number, failed:Array<{name:string,detail:string}>, js_errors:number, notes:string[]}>}
 */
export async function runBehaviorTests(input = {}) {
  const out = { available: false, total: 0, passed: 0, failed: [], js_errors: 0, notes: [] }
  const html = String(input?.html || '')

  // Static layer always runs.
  const staticChecks0 = staticChecks(html)
  out.available = true
  for (const c of staticChecks0) {
    out.total++
    if (c.passed) out.passed++
    else out.failed.push({ name: c.name, detail: c.detail })
  }

  // Browser layer needs Playwright.
  let chromium = null
  try {
    const mod = await import('playwright')
    chromium = mod.default?.chromium || mod.chromium
  } catch {
    out.notes.push('Browser tests unavailable (Playwright missing) — static assertions only.')
    return out
  }
  if (!chromium) {
    out.notes.push('Browser tests unavailable — static assertions only.')
    return out
  }

  let tmpFile = null
  let browser = null
  try {
    tmpFile = path.join(os.tmpdir(), `alpha-behavior-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.html`)
    fs.writeFileSync(tmpFile, html, 'utf8')
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

    const jsErrors = []
    page.on('pageerror', (err) => jsErrors.push(String(err?.message || err).slice(0, 200)))

    await page.goto(`file:///${tmpFile.replace(/\\/g, '/')}`, { waitUntil: 'load', timeout: 20_000 }).catch((e) => out.notes.push(`navigation note: ${String(e?.message || e).slice(0, 100)}`))
    await page.waitForTimeout(1500)

    // 1. Boots clean — zero uncaught exceptions during load AND interaction.

    // 2. Real rendered content (browser-side truth, not regex).
    const domStats = await page.evaluate(() => ({
      textLen: (document.body?.innerText || '').replace(/\s+/g, ' ').trim().length,
      elements: document.querySelectorAll('*').length,
      imagesBroken: [...document.images].filter((img) => img.complete && img.naturalWidth === 0 && img.getAttribute('src')).length,
    })).catch(() => ({ textLen: 0, elements: 0, imagesBroken: -1 }))

    const record = (name, passed, detail) => {
      out.total++
      if (passed) out.passed++
      else out.failed.push({ name, detail })
    }

    record('boots_without_crashes', jsErrors.length === 0, jsErrors.length ? `${jsErrors.length} uncaught error(s): ${jsErrors.slice(0, 2).join(' | ')}` : 'zero runtime exceptions')
    record('dom_renders', domStats.elements > 5 && domStats.textLen >= 50, `${domStats.elements} elements · ${domStats.textLen} chars`)
    if (domStats.imagesBroken >= 0) {
      record('images_render', domStats.imagesBroken === 0, domStats.imagesBroken ? `${domStats.imagesBroken} broken image(s)` : 'all rendered images decode')
    }

    // 2b. Dynamic content honesty: a page that SHIPS a "Loading…" placeholder
    // must actually populate it once JS runs — otherwise behavior was amputated.
    const hadPlaceholders = />(?:[^<]*\b(?:loading|please wait)[^<]*)<\s*\/(?:div|span|p)>/i.test(html)
    if (hadPlaceholders) {
      const stuck = await page.evaluate(() =>
        [...document.querySelectorAll('div, span, p')]
          .filter((el) => el.offsetParent !== null && /^(?:\W*(?:loading|please wait)\W*)[^|<]{0,12}$/i.test((el.textContent || '').trim().slice(0, 40)))
          .length,
      ).catch(() => -1)
      if (stuck >= 0) {
        record('dynamic_content_loads', stuck === 0, stuck ? `${stuck} "Loading…" placeholder(s) never populated — page is an inert shell` : 'dynamic containers populated by the behavior layer')
      }
    }

    // 3. Forms accept input and submit without crashing.
    const forms = await page.$$('form').catch(() => [])
    let formFailures = 0
    for (let i = 0; i < Math.min(forms.length, 3); i++) {
      try {
        await forms[i].$$eval('input:not([type=hidden]):not([type=submit]):not([type=file])', (inputs) => {
          for (const inp of inputs.slice(0, 6)) {
            if (inp.type === 'checkbox' || inp.type === 'radio') inp.checked = true
            else inp.value = inp.type === 'email' ? 'test@example.com' : inp.type === 'tel' ? '+15550001111' : 'Alpha verification'
          }
        })
        const before = jsErrors.length
        await forms[i].evaluate((f) => f.requestSubmit()).catch(() => {})
        await page.waitForTimeout(400)
        if (jsErrors.length > before) formFailures++
      } catch {
        formFailures++
      }
    }
    record('forms_submit_cleanly', forms.length === 0 || formFailures === 0, forms.length ? `${forms.length} form(s) exercised${formFailures ? `, ${formFailures} crashed on submit` : ', none crashed on submit'}` : 'no forms on page')

    // 4. Buttons click without throwing.
    const buttons = await page.$$('button, [role=button]').catch(() => [])
    let buttonFailures = 0
    for (let i = 0; i < Math.min(buttons.length, 5); i++) {
      try {
        const before = jsErrors.length
        await buttons[i].click({ timeout: 1500 }).catch(() => {})
        await page.waitForTimeout(150)
        if (jsErrors.length > before) buttonFailures++
      } catch {
        /* unclickable (hidden/offscreen) is fine — only crashes count */
      }
    }
    record('buttons_click_cleanly', buttonFailures === 0, buttonFailures ? `${buttonFailures} click(s) threw errors` : `${Math.min(buttons.length, 5)} clickable element(s) exercised`)

    out.js_errors = jsErrors.length
    if (out.js_errors > 0) out.notes.push(`${out.js_errors} JS error(s) observed during the session.`)
    await page.close().catch(() => {})
  } catch (err) {
    out.notes.push(`Browser tests degraded: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    if (browser) await browser.close().catch(() => {})
    if (tmpFile) fs.unlink(tmpFile, () => {})
  }

  return out
}
