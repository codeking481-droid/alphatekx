// aiBuilderHunter.js — The Restore Engine
// Identify which AI builder generated a target site (Lovable, v0.dev, Bolt.new,
// Cursor, GitHub Copilot, Replit) and hunt their leak-prone artifact endpoints
// (Lovable uploads, Supabase REST, Vercel/Netlify config, generated env files).
//
// Imported by the /api/scan pipeline. Uses the caller's Playwright context for
// binary-safe probing. All leaks are masked; raw secrets never leave the file.

import { huntSecrets, maskSecret, shannonEntropy } from './secretHunter.js'

export const BUILDER_ARTIFACTS = [
  { path: '/env.js', weight: 2, label: 'env.js bundle' },
  { path: '/env-config.js', weight: 2, label: 'env-config.js bundle' },
  { path: '/runtime-config.js', weight: 2, label: 'runtime-config.js bundle' },
  { path: '/config.js', weight: 1, label: 'config.js bundle' },
  { path: '/lovable-uploads/', weight: 3, label: 'Lovable uploads directory' },
  { path: '/uploads/', weight: 2, label: 'generated uploads directory' },
  { path: '/uploads/images/', weight: 2, label: 'generated upload images' },
  { path: '/supabase/config.toml', weight: 2, label: 'Supabase project config' },
  { path: '/vercel.json', weight: 1, label: 'Vercel project config' },
  { path: '/netlify.toml', weight: 1, label: 'Netlify project config' },
  { path: '/_redirects', weight: 1, label: 'Netlify redirects' },
  { path: '/_headers', weight: 1, label: 'Netlify headers' },
  { path: '/components.json', weight: 1, label: 'shadcn component config' },
  { path: '/supabase/functions/.env', weight: 3, label: 'Supabase functions env' },
]

function probeStatus(response) {
  if (!response) return { statusCode: 0, ok: false }
  return { statusCode: response.status(), ok: response.ok() || [301, 302, 307, 308].includes(response.status()) }
}

/**
 * Probe builder artifact endpoints on a target origin.
 * @param {string} targetUrl base URL of the scanned site
 * @param {object} deps
 * @param {object} deps.context Playwright BrowserContext (for binary-safe requests)
 * @param {object} [deps.probePage] optional page used to read JS bundle bodies
 * @param {object} [deps.headers] default request headers
 * @param {(pct:number, label:string) => void} [deps.progress] progress callback
 */
export async function aiBuilderHunter(targetUrl, { context, probePage, headers = {}, progress = () => {} } = {}) {
  const origin = new URL(targetUrl).origin
  const evidence = []
  const routes = []
  const leaks = []

  const probe = async (relPath) => {
    try {
      const res = await context.request.get(`${origin}${relPath}`, { headers, timeout: 10000 })
      const { statusCode, ok } = probeStatus(res)
      routes.push({ path: relPath, statusCode })
      if (!ok || statusCode < 200 || statusCode >= 400) return null
      const contentType = (res.headers()['content-type'] || '')
      let body = ''
      if (contentType.includes('application/json') || contentType.includes('text/') || contentType.includes('javascript')) {
        body = await res.text()
      } else {
        const buf = await res.body()
        body = buf.toString('utf8')
      }
      return { relPath, statusCode, contentType, body }
    } catch {
      routes.push({ path: relPath, statusCode: 0 })
      return null
    }
  }

  const secretsIn = (text, source) => huntSecrets(text, { source })
    .map(hit => ({ source, kind: hit.kind, keyName: hit.keyName, maskedValue: hit.maskedValue, entropyScore: hit.entropyScore }))

  let index = 0
  for (const artifact of BUILDER_ARTIFACTS) {
    index += 1
    progress((index / BUILDER_ARTIFACTS.length) * 40, `probing ${artifact.path}`)
    const found = await probe(artifact.path)
    if (!found) continue
    evidence.push({ path: artifact.path, statusCode: found.statusCode, source: 'builder-artifact', description: artifact.label })
    const foundSecrets = secretsIn(found.body, artifact.path)
    leaks.push(...foundSecrets)
    if (artifact.path.includes('uploads') && /<(?:a|td)[^>]*>([^<]+)<\/\1>/i.test(found.body)) {
      evidence.push({ path: artifact.path, statusCode: found.statusCode, source: 'directory-listing', description: 'public directory listing exposing uploaded files' })
    }
  }

  // Supabase REST health probe (the builder default database).
  try {
    const supabase = await probe('/rest/v1/')
    if (supabase && supabase.body && /Supabase/i.test(supabase.body)) {
      evidence.push({ path: '/rest/v1/', statusCode: supabase.statusCode, source: 'supabase-rest', description: 'exposed Supabase PostgREST endpoint' })
    }
  } catch {
    /* ignore */
  }

  const usesSupabase = evidence.some(e => e.source === 'supabase-rest' || e.path.includes('/supabase/'))
  const usesVercel = evidence.some(e => e.path === '/vercel.json' || e.path === '/api/')
  const usesNetlify = evidence.some(e => e.path === '/netlify.toml' || e.path === '/_redirects')

  const htmlChecks = [
    { re: /lovable/i, builder: 'lovable', score: 1 },
    { re: /v0\.dev|v0 user|@v0/i, builder: 'v0', score: 1 },
    { re: /bolt\.new|bolt\.ai|boltnew/i, builder: 'bolt', score: 1 },
    { re: /cursor\.com|cursor(?:bot)?/i, builder: 'cursor', score: 1 },
    { re: /github copilot|copilot(?: ?watch)/i, builder: 'copilot', score: 1 },
    { re: /replit/i, builder: 'replit', score: 1 },
  ]

  let builder = 'unknown'
  let builderScore = 0
  if (usesSupabase) builderScore += 1
  if (usesVercel) builderScore += 0.5
  if (usesNetlify) builderScore += 0.5
  for (const check of htmlChecks) {
    if (new RegExp(check.re.source, check.re.flags.includes('i') ? check.re.flags : `${check.re.flags}i`).test(JSON.stringify(evidence.map(e => e.path)) + ' ' + leaks.map(l => l.source).join(' '))) {
      builderScore += check.score
      if (check.score > builderScore - check.score || builder === 'unknown') {
        if (!builder || builderScore >= 1) builder = check.builder
      }
    }
  }

  if (builder === 'unknown' && usesSupabase) builder = 'lovable'

  progress(45, 'builder fingerprints scanned')

  return {
    builder,
    builderConfidence: Math.min(1, builderScore / 2),
    usesSupabase,
    usesVercel,
    usesNetlify,
    routes,
    evidence,
    leaks,
  }
}

export { maskSecret, shannonEntropy }
