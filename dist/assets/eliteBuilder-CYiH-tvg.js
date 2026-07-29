import{g as r,p as s}from"./apiClient-UVcgPNBC.js";const a=2,i=/^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;function d(e,t="AlphaTekX build"){const o=t.replace(/[<>&"']/g,""),n=JSON.stringify(String(e||"")).replace(/</g,"\\u003c");return`<!doctype html>
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
    window.addEventListener('error', function(event) {
      var box = document.getElementById('builder-error');
      box.style.display = 'block';
      box.textContent = 'Preview could not render: ' + (event.message || 'Unknown runtime error');
      parent.postMessage({source:'alphatekx-builder',type:'error',message:event.message || 'Preview failed'}, '*');
    });
    try {
      var source = ${n};
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
</html>`}async function l(e,t){return s("/api/builder/generate",{prompt:e,requestId:t},{timeoutMs:18e4})}async function p(){return r("/api/builder/projects")}async function u(e,t){return s("/api/builder/deploy",{id:e,slug:t})}async function m(e){return r(`/api/builder/public/${encodeURIComponent(e)}`)}export{a as B,i as a,d as b,m as c,u as d,l as g,p as l};
