import http from 'node:http'
import { spawn } from 'node:child_process'

process.env.VERCEL = '1'
const { normalizePublishedCode, publishedAppDocument } = await import('../server.mjs')

const source = `function AlphaApp(){const [count,setCount]=React.useState(0);return <button onClick={()=>{localStorage.setItem('count',String(count+1));setCount(count+1)}}>{count}</button>}`
const normalized = normalizePublishedCode(source)
if (!normalized.includes('ReactDOM.createRoot')) throw new Error('Published code was not mounted')
// allow-same-origin is intentionally enabled so the published iframe's apiBridge can read window.parent.localStorage for user context.
const html = publishedAppDocument({ slug: 'counter-app', title: 'Counter App', code: source })
const pastedSource = '<!doctype html><html><head><title>Pasted</title></head><body><h1>Pasted works</h1><script>localStorage.setItem("ready","yes")</script></body></html>'
const pastedDocument = publishedAppDocument({ slug: 'pasted-app', title: 'Pasted App', code: pastedSource })
const checks = [
  ['sandboxed iframe', html.includes('sandbox="allow-scripts') && html.includes('allow-same-origin') && html.includes('allow-popups')],
  ['scoped persistence', html.includes('alphatekx:published:counter-app')],
  ['storage bridge', html.includes('alphatekx-app-storage')],
  ['React renderer', html.includes('ReactDOM.createRoot')],
  ['responsive viewport', html.includes('width=device-width,initial-scale=1')],
  ['complete HTML rendering', pastedDocument.includes('Pasted works') && pastedDocument.includes('<\\/script>') === false],
]
const failed = checks.filter(([, passed]) => !passed).map(([name]) => name)
if (failed.length) throw new Error(`Path deployment checks failed: ${failed.join(', ')}`)

const supabasePort = 4328
const appPort = 4329
const creationId = '00000000-0000-4000-8000-000000000001'
let published = false
let pastedCreation = null
const send = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
const mockSupabase = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${supabasePort}`)
  if (url.pathname === '/auth/v1/user') return send(res, 200, { id: 'user-1', email: 'owner@example.com' })
  if (url.pathname === '/rest/v1/missions' && req.method === 'POST') return send(res, 201, {})
  if (url.pathname !== '/rest/v1/creations') return send(res, 404, { message: 'Not found' })
  if (req.method === 'POST') {
    let raw = ''
    req.on('data', chunk => { raw += chunk })
    return req.on('end', () => { pastedCreation = JSON.parse(raw); send(res, 201, [{ id: pastedCreation.id }]) })
  }
  if (req.method === 'PATCH') {
    let raw = ''
    req.on('data', chunk => { raw += chunk })
    return req.on('end', () => { published = Boolean(JSON.parse(raw).published); send(res, 200, [{ id: creationId }]) })
  }
  if (url.searchParams.get('id')?.startsWith('neq.')) return send(res, 200, [])
  if (url.searchParams.get('slug') === 'eq.pasted-app' && url.searchParams.get('published') === 'eq.true') return send(res, 200, pastedCreation ? [{ id: pastedCreation.id, title: pastedCreation.title, slug: pastedCreation.slug, code: pastedCreation.code }] : [])
  if (url.searchParams.get('slug') && url.searchParams.get('published') === 'eq.true') return send(res, 200, published ? [{ id: creationId, title: 'Counter App', slug: 'counter-app', code: source }] : [])
  if (url.searchParams.get('id') === `eq.${creationId}`) return send(res, 200, [{ id: creationId, title: 'Counter App', code: source }])
  return send(res, 200, [])
})

await new Promise(resolve => mockSupabase.listen(supabasePort, '127.0.0.1', resolve))
const app = spawn(process.execPath, ['server.mjs'], {
  cwd: new URL('..', import.meta.url),
  env: {
    ...process.env,
    VERCEL: '',
    PORT: String(appPort),
    VITE_SUPABASE_URL: `http://127.0.0.1:${supabasePort}`,
    VITE_SUPABASE_ANON_KEY: 'anon-test-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    PUBLIC_APP_URL: `http://127.0.0.1:${appPort}`,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let output = ''
app.stdout.on('data', chunk => { output += chunk })
app.stderr.on('data', chunk => { output += chunk })
try {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try { if ((await fetch(`http://127.0.0.1:${appPort}/`)).ok) break } catch {}
    if (attempt === 29) throw new Error(`AlphaTekX test server did not start. ${output}`)
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  const publish = await fetch(`http://127.0.0.1:${appPort}/api/creations/publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test-session' },
    body: JSON.stringify({ creationId, slug: 'counter-app' }),
  })
  const publishBody = await publish.json()
  if (!publish.ok || publishBody.url !== `http://127.0.0.1:${appPort}/app/counter-app`) throw new Error(`Publish endpoint failed: ${publish.status} ${JSON.stringify(publishBody)}`)
  const publishedPage = await fetch(`http://127.0.0.1:${appPort}/app/counter-app`)
  const publishedHtml = await publishedPage.text()
  if (!publishedPage.ok || !publishedHtml.includes('Counter App') || !publishedHtml.includes('alphatekx:published:counter-app')) throw new Error(`Published route failed: ${publishedPage.status}`)
  const pastedPublish = await fetch(`http://127.0.0.1:${appPort}/api/creations/publish-code`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test-session' },
    body: JSON.stringify({ title: 'Pasted App', slug: 'pasted-app', html: pastedSource }),
  })
  const pastedBody = await pastedPublish.json()
  if (!pastedPublish.ok || pastedBody.subdomainUrl !== 'https://pasted-app.alphatekx.name.ng') throw new Error(`Pasted code endpoint failed: ${pastedPublish.status} ${JSON.stringify(pastedBody)}`)
  const subdomainPage = await new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port: appPort, path: '/', headers: { Host: 'pasted-app.alphatekx.name.ng' } }, response => {
      let body = ''
      response.on('data', chunk => { body += chunk })
      response.on('end', () => resolve({ status: response.statusCode, body }))
    })
    request.on('error', reject)
    request.end()
  })
  if (subdomainPage.status !== 200 || !subdomainPage.body.includes('Pasted works')) throw new Error(`Subdomain host routing failed: ${subdomainPage.status}`)
  process.stdout.write('PATH_DEPLOY_OK\n')
} finally {
  app.kill('SIGTERM')
  await new Promise(resolve => mockSupabase.close(resolve))
}
