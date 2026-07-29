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
  versions?: { id: string; code: string; provider?: string; created_at: string }[]
  created_at?: string
}

export const BUILDER_COST = 2
export const BUILDER_SLUG = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/

export function cleanCodeForPreview(value: string) {
  let code = String(value || '')
  const iconBindings: string[] = []
  // Generated code is evaluated as a single browser component, never as an
  // ES module. Strip default, named, namespace, multiline, same-line, type,
  // and side-effect imports before Babel sees the source.
  const importPattern = /\bimport\s+(?:type\s+)?([\s\S]*?)\s+from\s+(['"])([^'"]+)\2\s*;?/g
  for (const match of code.matchAll(importPattern)) {
    if (match[3] !== 'lucide-react') continue
    const named = match[1].match(/\{([\s\S]*?)\}/)?.[1] || ''
    for (const entry of named.split(',')) {
      const parts = entry.trim().split(/\s+as\s+/i)
      const binding = parts[1] || parts[0]
      if (/^[A-Za-z_$][\w$]*$/.test(binding)) iconBindings.push(binding)
    }
  }
  code = code
    .replace(importPattern, '\n')
    .replace(/\bimport\s+(?:type\s+)?(['"])[^'"]+\1\s*;?/g, '\n')
    .replace(/\bexport\s+default\s+function\s+App\b/, 'function App')
    .replace(/\bexport\s+default\s+App\s*;?/g, '')
    .replace(/\bexport\s+default\s+(?=(?:function|class)\s+App\b)/g, '')
    .replace(/\bexport\s+default\s+(?=(?:const|let|var)\s+App\b)/g, '')
    .replace(/\bexport\s+(?=(?:const|let|var|function|class)\s+App\b)/g, '')
    .replace(/(?<!React\.)\b(useState|useEffect|useMemo|useReducer|useRef|useCallback|useContext)\s*\(/g, 'React.$1(')
    .trim()
  if (iconBindings.length) {
    const definitions = Array.from(new Set(iconBindings))
      .map(name => `const ${name} = (props = {}) => React.createElement("span", { ...props, "aria-hidden": true });`)
      .join('\n')
    code = `${definitions}\n${code}`
  }
  return code
}

export const normalizeBuilderRuntimeCode = cleanCodeForPreview

export function builderSrcDoc(code: string, title = 'AlphaTekX build', options: { slug?: string; selectMode?: boolean } = {}) {
  const safeTitle = title.replace(/[<>&"']/g, '')
  const encodedCode = JSON.stringify(cleanCodeForPreview(code)).replace(/</g, '\\u003c')
  const slug = JSON.stringify(options.slug || 'preview')
  const selectMode = options.selectMode === true ? 'true' : 'false'
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
      window.ALPHA_APP_SLUG = ${slug};
      window.AlphaAPI = {
        url: function(entity,id){ return '/api/apps/'+encodeURIComponent(window.ALPHA_APP_SLUG)+'/'+encodeURIComponent(entity)+(id?'/'+encodeURIComponent(id):''); },
        get: async function(entity,id){ var response=await fetch(this.url(entity,id)); if(!response.ok) throw new Error('Data could not load'); return response.json(); },
        post: async function(entity,data){ var response=await fetch(this.url(entity),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}); if(!response.ok) throw new Error('Sign in is required to save data'); return response.json(); }
      };
      if (${selectMode}) document.addEventListener('click', function(event) {
        event.preventDefault(); event.stopPropagation();
        var element = event.target;
        parent.postMessage({source:'alphatekx-builder',type:'element-clicked',tag:element.tagName,html:String(element.outerHTML||'').slice(0,500)}, '*');
      }, true);
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

export async function editBuild(projectId: string, instruction: string) {
  return postJson<{ project: BuilderProject; code: string; provider: string }>('/api/builder/edit', { projectId, instruction }, { timeoutMs: 180_000 })
}

export async function fixBuild(projectId: string, error: string) {
  return postJson<{ project: BuilderProject; code: string; provider: string }>('/api/builder/fix', { projectId, error }, { timeoutMs: 180_000 })
}

export async function requestBuilderDomain(projectId: string, domain: string) {
  return postJson<{ project: BuilderProject; domain: string; verification: { type: string; name: string; value: string } }>('/api/builder/domain', { projectId, domain })
}

export async function getPublicBuild(slug: string) {
  return getJson<{ project: BuilderProject & { code: string } }>(`/api/builder/public/${encodeURIComponent(slug)}`)
}
