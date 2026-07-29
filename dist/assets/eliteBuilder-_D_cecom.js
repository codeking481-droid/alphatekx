import{g as o,p as r}from"./apiClient-bkiGLFn5.js";const l=2,u=/^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;function p(e,t="AlphaTekX build",n={}){const s=t.replace(/[<>&"']/g,""),i=JSON.stringify(String(e||"")).replace(/</g,"\\u003c"),a=JSON.stringify(n.slug||"preview"),c=n.selectMode===!0?"true":"false";return`<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src https://cdn.tailwindcss.com https://unpkg.com 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src https: data:; font-src https: data:; connect-src https:;"/>
  <title>${s}</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"><\/script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"><\/script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
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
      window.ALPHA_APP_SLUG = ${a};
      window.AlphaAPI = {
        url: function(entity,id){ return '/api/apps/'+encodeURIComponent(window.ALPHA_APP_SLUG)+'/'+encodeURIComponent(entity)+(id?'/'+encodeURIComponent(id):''); },
        get: async function(entity,id){ var response=await fetch(this.url(entity,id)); if(!response.ok) throw new Error('Data could not load'); return response.json(); },
        post: async function(entity,data){ var response=await fetch(this.url(entity),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}); if(!response.ok) throw new Error('Sign in is required to save data'); return response.json(); }
      };
      if (${c}) document.addEventListener('click', function(event) {
        event.preventDefault(); event.stopPropagation();
        var element = event.target;
        parent.postMessage({source:'alphatekx-builder',type:'element-clicked',tag:element.tagName,html:String(element.outerHTML||'').slice(0,500)}, '*');
      }, true);
      var source = ${i};
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
</html>`}async function m(e,t){return r("/api/builder/generate",{prompt:e,requestId:t},{timeoutMs:18e4})}async function y(){return o("/api/builder/projects")}async function g(e,t){return r("/api/builder/deploy",{id:e,slug:t})}async function f(e,t){return r("/api/builder/edit",{projectId:e,instruction:t},{timeoutMs:18e4})}async function b(e,t){return r("/api/builder/fix",{projectId:e,error:t},{timeoutMs:18e4})}async function h(e,t){return r("/api/builder/domain",{projectId:e,domain:t})}async function v(e){return o(`/api/builder/public/${encodeURIComponent(e)}`)}export{l as B,u as a,p as b,m as c,g as d,f as e,b as f,v as g,y as l,h as r};
