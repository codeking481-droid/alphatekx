import{g as u,p as o}from"./apiClient-BRZkrBgh.js";const g=/^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;function d(t){var i;let e=String(t||"");const n=[],a=/\bimport\s+(?:type\s+)?([\s\S]*?)\s+from\s+(['"])([^'"]+)\2\s*;?/g;for(const r of e.matchAll(a)){if(r[3]!=="lucide-react")continue;const s=((i=r[1].match(/\{([\s\S]*?)\}/))==null?void 0:i[1])||"";for(const p of s.split(",")){const c=p.trim().split(/\s+as\s+/i),l=c[1]||c[0];/^[A-Za-z_$][\w$]*$/.test(l)&&n.push(l)}}return e=e.replace(a,`
`).replace(/\bimport\s+(?:type\s+)?(['"])[^'"]+\1\s*;?/g,`
`).replace(/\bexport\s+default\s+function\s+App\b/,"function App").replace(/\bexport\s+default\s+App\s*;?/g,"").replace(/\bexport\s+default\s+(?=(?:function|class)\s+App\b)/g,"").replace(/\bexport\s+default\s+(?=(?:const|let|var)\s+App\b)/g,"").replace(/\bexport\s+(?=(?:const|let|var|function|class)\s+App\b)/g,"").replace(/\b(?:window|globalThis)\.localStorage\b/g,"localStorage").replace(new RegExp("(?<!React\\.)\\b(useState|useEffect|useMemo|useReducer|useRef|useCallback|useContext)\\s*\\(","g"),"React.$1(").trim(),n.length&&(e=`${Array.from(new Set(n)).map(s=>`const ${s} = (props = {}) => React.createElement("span", { ...props, "aria-hidden": true });`).join(`
`)}
${e}`),e}function f(t,e="AlphaTekX build",n={}){const a=e.replace(/[<>&"']/g,""),i=JSON.stringify(d(t)).replace(/</g,"\\u003c"),r=JSON.stringify(n.slug||"preview"),s=n.selectMode===!0?"true":"false";return`<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src https://cdn.tailwindcss.com https://unpkg.com 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src https: data:; font-src https: data:; connect-src https:;"/>
  <title>${a}</title>
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
      window.ALPHA_APP_SLUG = ${r};
      window.AlphaAPI = {
        url: function(entity,id){ return '/api/apps/'+encodeURIComponent(window.ALPHA_APP_SLUG)+'/'+encodeURIComponent(entity)+(id?'/'+encodeURIComponent(id):''); },
        get: async function(entity,id){ var response=await fetch(this.url(entity,id)); if(!response.ok) throw new Error('Data could not load'); return response.json(); },
        post: async function(entity,data){ var response=await fetch(this.url(entity),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}); if(!response.ok) throw new Error('Sign in is required to save data'); return response.json(); }
      };
      if (${s}) document.addEventListener('click', function(event) {
        event.preventDefault(); event.stopPropagation();
        var element = event.target;
        parent.postMessage({source:'alphatekx-builder',type:'element-clicked',tag:element.tagName,html:String(element.outerHTML||'').slice(0,500)}, '*');
      }, true);
      var source = "const localStorage = window.__alphaPreviewStorage;\\n" + ${i};
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
</html>`}async function y(t,e){return o("/api/builder/generate",{prompt:t,requestId:e},{timeoutMs:18e4})}async function b(){return u("/api/builder/projects")}async function v(t,e){return o("/api/builder/deploy",{id:t,slug:e})}async function h(t,e){return o("/api/builder/edit",{projectId:t,instruction:e},{timeoutMs:18e4})}async function w(t,e){return o("/api/builder/fix",{projectId:t,error:e},{timeoutMs:18e4})}async function k(t,e){return o("/api/builder/domain",{projectId:t,domain:e})}async function x(t){return u(`/api/builder/public/${encodeURIComponent(t)}`)}export{g as B,y as a,f as b,v as d,h as e,w as f,x as g,b as l,k as r};
