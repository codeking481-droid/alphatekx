import{al as m,r as l,j as t,L as u}from"./vendor-BonQoB1c.js";import{g as f}from"./apiClient-BPdrU1FB.js";import"./index-D3USMTjS.js";function h(n){var a;let e=String(n||"");const s=[],o=/\bimport\s+(?:type\s+)?([\s\S]*?)\s+from\s+(['"])([^'"]+)\2\s*;?/g;for(const i of e.matchAll(o)){if(i[3]!=="lucide-react")continue;const r=((a=i[1].match(/\{([\s\S]*?)\}/))==null?void 0:a[1])||"";for(const c of r.split(",")){const d=c.trim().split(/\s+as\s+/i),p=d[1]||d[0];/^[A-Za-z_$][\w$]*$/.test(p)&&s.push(p)}}return e=e.replace(o,`
`).replace(/\bimport\s+(?:type\s+)?(['"])[^'"]+\1\s*;?/g,`
`).replace(/\bexport\s+default\s+function\s+App\b/,"function App").replace(/\bexport\s+default\s+App\s*;?/g,"").replace(/\bexport\s+default\s+(?=(?:function|class)\s+App\b)/g,"").replace(/\bexport\s+default\s+(?=(?:const|let|var)\s+App\b)/g,"").replace(/\bexport\s+(?=(?:const|let|var|function|class)\s+App\b)/g,"").replace(/\b(?:window|globalThis)\.localStorage\b/g,"localStorage").replace(new RegExp("(?<!React\\.)\\b(useState|useEffect|useMemo|useReducer|useRef|useCallback|useContext)\\s*\\(","g"),"React.$1(").trim(),s.length&&(e=`${Array.from(new Set(s)).map(r=>`const ${r} = (props = {}) => React.createElement("span", { ...props, "aria-hidden": true });`).join(`
`)}
${e}`),e}function g(n,e="AlphaTekX build",s={}){const o=e.replace(/[<>&"']/g,""),a=JSON.stringify(h(n)).replace(/</g,"\\u003c"),i=JSON.stringify(s.slug||"preview"),r=s.selectMode===!0?"true":"false";return`<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src https://cdn.tailwindcss.com https://unpkg.com 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src https: data:; font-src https: data:; connect-src https:;"/>
  <title>${o}</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"><\/script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"><\/script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
  <style>html,body,#root{min-height:100%;margin:0}body{background:#09090f;color:#e9e7ff;font-family:Inter,ui-sans-serif,system-ui,sans-serif}#builder-error{display:none;padding:32px;color:#fecaca;background:#260b15;font:600 14px/1.6 ui-monospace,monospace}</style>
</head>
<body>
  <div id="root"></div><pre id="builder-error"></pre>
  <script>
    window.__alphaPreviewStorage = (function() {
      var values = Object.create(null);
      var storage = {
        getItem: function(key) {
          key = String(key);
          return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
        },
        setItem: function(key, value) {
          values[String(key)] = String(value);
        },
        removeItem: function(key) {
          delete values[String(key)];
        },
        clear: function() {
          values = Object.create(null);
        },
        key: function(index) {
          return Object.keys(values)[Number(index)] || null;
        }
      };
      Object.defineProperty(storage, 'length', {
        get: function() { return Object.keys(values).length; }
      });
      return storage;
    })();
    window.addEventListener('error', function(event) {
      var box = document.getElementById('builder-error');
      box.style.display = 'block';
      box.textContent = 'Preview could not render: ' + (event.message || 'Unknown runtime error');
      parent.postMessage({source:'alphatekx-builder',type:'error',message:event.message || 'Preview failed'}, '*');
    });
    window.addEventListener('unhandledrejection', function(event) {
      var message = event.reason && event.reason.message ? event.reason.message : String(event.reason || 'Async preview error');
      parent.postMessage({source:'alphatekx-builder',type:'error',message:message}, '*');
    });
    try {
      window.ALPHA_APP_SLUG = ${i};
      window.AlphaAPI = {
        url: function(entity,id){ return '/api/apps/'+encodeURIComponent(window.ALPHA_APP_SLUG)+'/'+encodeURIComponent(entity)+(id?'/'+encodeURIComponent(id):''); },
        get: async function(entity,id){ var response=await fetch(this.url(entity,id)); if(!response.ok) throw new Error('Data could not load'); return response.json(); },
        post: async function(entity,data){ var response=await fetch(this.url(entity),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}); if(!response.ok) throw new Error('Sign in is required to save data'); return response.json(); }
      };
      if (${r}) document.addEventListener('click', function(event) {
        event.preventDefault(); event.stopPropagation();
        var element = event.target;
        parent.postMessage({source:'alphatekx-builder',type:'element-clicked',tag:element.tagName,html:String(element.outerHTML||'').slice(0,500)}, '*');
      }, true);
      var source = "const localStorage = window.__alphaPreviewStorage;\\n" + ${a};
      var compiled = Babel.transform(source + "\\n;ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));", {presets:['react']}).code;
      (0,eval)(compiled);
      parent.postMessage({source:'alphatekx-builder',type:'ready'}, '*');
    } catch (error) {
      var box = document.getElementById('builder-error');
      box.style.display = 'block';
      box.textContent = 'Preview could not render: ' + error.message;
      parent.postMessage({source:'alphatekx-builder',type:'error',message:error.message}, '*');
    }
  <\/script>
</body>
</html>`}async function b(n){return f(`/api/builder/public/${encodeURIComponent(n)}`)}function w(){const{slug:n=""}=m(),[e,s]=l.useState(null),[o,a]=l.useState(""),i=l.useMemo(()=>e?g(e.code,e.title):"",[e]);return l.useEffect(()=>{let r=!0;return b(n).then(c=>{r&&s(c.project)}).catch(c=>{r&&a(c instanceof Error?c.message:"This app could not load.")}),()=>{r=!1}},[n]),l.useEffect(()=>{if(!e)return;document.title=`${e.title} · Built with AlphaTekX`;let r=document.querySelector('meta[name="description"]');r||(r=document.createElement("meta"),r.name="description",document.head.appendChild(r)),r.content=`Explore ${e.title}, built and deployed with AlphaTekX Builder.`},[e]),o?t.jsx("main",{className:"grid min-h-screen place-items-center bg-[#0A0A0F] p-6 text-center text-white",children:t.jsxs("div",{children:[t.jsx("h1",{className:"text-2xl font-black",children:"App not found"}),t.jsx("p",{className:"mt-3 text-sm font-semibold text-white/45",children:o}),t.jsx(u,{to:"/active-automations",className:"mt-6 inline-flex rounded-xl bg-violet-600 px-5 py-3 font-black",children:"Go to Active Automations"})]})}):e?t.jsxs("main",{className:"fixed inset-0 flex min-h-0 flex-col bg-[#0A0A0F]",children:[t.jsxs("header",{className:"flex h-10 shrink-0 items-center justify-between gap-3 border-b border-white/[.06] bg-[#1A1A23] px-3 text-[10px] text-white/50 sm:px-4 sm:text-xs",children:[t.jsxs("div",{className:"flex min-w-0 items-center gap-1.5",children:[t.jsx("span",{className:"hidden sm:inline",children:"Built with"}),t.jsx("strong",{className:"truncate font-black text-violet-300",children:"AlphaTekX Builder V3"}),t.jsx("span",{children:"·"}),t.jsxs("span",{className:"shrink-0",children:[e.views||0," views"]})]}),t.jsx(u,{to:`/builder?remix=${encodeURIComponent(e.slug||n)}`,className:"shrink-0 rounded-full bg-white px-3 py-1.5 font-black text-[#0A0A0F] transition hover:bg-white/90",children:"Remix this app"})]}),t.jsx("iframe",{title:e.title,sandbox:"allow-scripts allow-forms allow-modals",srcDoc:i,className:"min-h-0 w-full flex-1 border-0 bg-white",referrerPolicy:"no-referrer"})]}):t.jsx("main",{className:"grid min-h-screen place-items-center bg-[#0A0A0F] text-white",children:t.jsxs("div",{className:"text-center",children:[t.jsx("span",{className:"mx-auto block size-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent"}),t.jsxs("p",{className:"mt-4 text-sm font-semibold text-white/55",children:["Loading ",n,"…"]})]})})}export{w as default};
