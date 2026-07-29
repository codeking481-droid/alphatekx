import { getJson, postJson } from './apiClient'

export type BuilderProject = {
  id: string
  slug?: string | null
  title: string
  prompt: string
  code?: string
  provider?: string
  public_url?: string | null
  published?: boolean
  views?: number
  created_at?: string
}

export const BUILDER_COST = 2
export const BUILDER_SLUG = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/

export function builderSrcDoc(code: string, title = 'AlphaTekX build') {
  const safeTitle = title.replace(/[<>&"']/g, '')
  const encodedCode = JSON.stringify(String(code || '')).replace(/</g, '\\u003c')
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src https://cdn.tailwindcss.com https://unpkg.com 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src https: data:; font-src https: data:; connect-src https:;"/>
  <title>${safeTitle}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>html,body,#root{min-height:100%;margin:0}body{background:#09090f;color:#e9e7ff;font-family:Inter,ui-sans-serif,system-ui,sans-serif}#builder-error{display:none;padding:32px;color:#fecaca;background:#260b15;font:600 14px/1.6 ui-monospace,monospace}</style>
</head>
<body>
  <div id="root"></div><pre id="builder-error"></pre>
  <script>
    window.addEventListener('error', function(event) {
      var box = document.getElementById('builder-error');
      box.style.display = 'block';
      box.textContent = 'Preview could not render: ' + (event.message || 'Unknown runtime error');
      parent.postMessage({source:'alphatekx-builder',type:'error',message:event.message || 'Preview failed'}, '*');
    });
    try {
      var source = ${encodedCode};
      var compiled = Babel.transform(source + "\\n;ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));", {presets:['react']}).code;
      (0,eval)(compiled);
      parent.postMessage({source:'alphatekx-builder',type:'ready'}, '*');
    } catch (error) {
      var box = document.getElementById('builder-error');
      box.style.display = 'block';
      box.textContent = 'Preview could not render: ' + error.message;
      parent.postMessage({source:'alphatekx-builder',type:'error',message:error.message}, '*');
    }
  </script>
</body>
</html>`
}

export async function generateBuild(prompt: string, requestId: string) {
  return postJson<{ project: BuilderProject; code: string; provider: string; credits: number | null }>(
    '/api/builder/generate',
    { prompt, requestId },
    { timeoutMs: 180_000 },
  )
}

export async function listBuilds() {
  return getJson<{ projects: BuilderProject[] }>('/api/builder/projects')
}

export async function deployBuild(id: string, slug: string) {
  return postJson<{ project: BuilderProject; publicUrl: string }>('/api/builder/deploy', { id, slug })
}

export async function getPublicBuild(slug: string) {
  return getJson<{ project: BuilderProject & { code: string } }>(`/api/builder/public/${encodeURIComponent(slug)}`)
}
