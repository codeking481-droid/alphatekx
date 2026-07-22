function escapeScriptTags(code: string) {
  return code.replace(/<\/script/gi, '<\\/script')
}

function stripMountCall(code: string) {
  return code.replace(/ReactDOM\.createRoot\([\s\S]*?\)\.render\s*\([\s\S]*?\);?\s*/gi, '')
}

function extractGeneratedCss(files?: { path: string; code: string }[]) {
  if (!files) return ''
  return files
    .filter((f) => f.path.toLowerCase().endsWith('.css'))
    .map((f) => f.code)
    .join('\n')
}

function navigationBridgeScript() {
  return `window.addEventListener('message',function(e){if(e.data&&e.data.type==='alpha-navigate'){const v=String(e.data.view||'').toLowerCase().trim();let b=document.querySelector('[data-view="'+v+'"]')||document.querySelector('[data-view="'+v+'"]');if(!b){var all=[...document.querySelectorAll('[data-view]')];b=all.find(x=>String(x.textContent||'').toLowerCase().trim()===v);}if(b){b.click();}else{window.location.hash='#'+v;}}});function alphaNavigate(v){window.postMessage({type:'alpha-navigate',view:v},'*');}`
}

function alphaApiBridgeScript() {
  return `window.ALPHA_APP_SLUG='preview';window.AlphaAPI={headers(){try{var raw=window.parent.localStorage.getItem('alphatekx:local-user');if(raw){var u=JSON.parse(raw);return{'x-local-user-id':String(u.id||''),'x-local-user-email':String(u.email||'')};}}catch{}return{};},url(entity,id){return '/api/apps/'+window.ALPHA_APP_SLUG+'/'+entity+(id?'/'+id:'');},async get(entity,id){var r=await fetch(this.url(entity,id),{headers:this.headers()});return r.json();},async post(entity,data){var r=await fetch(this.url(entity),{method:'POST',headers:Object.assign({},this.headers(),{'Content-Type':'application/json'}),body:JSON.stringify(data)});return r.json();},async put(entity,id,data){var r=await fetch(this.url(entity,id),{method:'PUT',headers:Object.assign({},this.headers(),{'Content-Type':'application/json'}),body:JSON.stringify(data)});return r.json();},async del(entity,id){var r=await fetch(this.url(entity,id),{method:'DELETE',headers:this.headers()});return r.json();}};`
}

function headerFixScript() {
  return `function alphaFixHeader(){const h=document.querySelector('header');if(!h)return;h.style.position='fixed';h.style.top='0';h.style.left='0';h.style.right='0';h.style.zIndex='9999';const hh=h.offsetHeight||56;let m=document.querySelector('main');if(!m||m===h){m=h.nextElementSibling||h.parentElement?.firstElementChild}if(m&&m!==h){const existing=parseInt(getComputedStyle(m).paddingTop||'0',10);m.style.paddingTop=Math.max(existing,hh)+'px';m.style.overflowY='auto';m.style.flex='1 1 0';m.style.minHeight='0'}setTimeout(()=>{h.style.position='fixed';h.style.top='0';h.style.left='0';h.style.right='0';},0);}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',alphaFixHeader);else setTimeout(alphaFixHeader,50);setTimeout(alphaFixHeader,400);`
}

function safeRuntimeScript() {
  return `function initAlphaSafeRuntime(){if(typeof React==='undefined'||typeof React.createElement==='undefined'){setTimeout(initAlphaSafeRuntime,50);return;}const orig=React.createElement;function isPlainObject(v){return v!==null&&typeof v==='object'&&!v.$$typeof&&Object.getPrototypeOf(v)===Object.prototype;}function sanitizeChild(c){if(c===null||c===undefined||typeof c==='string'||typeof c==='number'||typeof c==='boolean')return c;if(Array.isArray(c))return c.map(sanitizeChild);if(c&&c.$$typeof)return c;if(isPlainObject(c)){try{return '[Object: '+JSON.stringify(c).slice(0,160)+']';}catch{return '[Object]';}}return String(c);}React.createElement=function(type,props,...children){let safeProps=props||{};if(safeProps.children){safeProps={...safeProps,children:sanitizeChild(safeProps.children)};}safeProps.children=sanitizeChild(safeProps.children);const safeChildren=children.map(sanitizeChild);return orig.apply(this,[type,safeProps,...safeChildren]);};}initAlphaSafeRuntime();`
}

function errorBoundaryScript() {
  return `class AlphaErrorBoundary extends React.Component{constructor(props){super(props);this.state={error:null};}static getDerivedStateFromError(error){return{error};}componentDidCatch(error,info){if(window.parent)window.parent.postMessage({type:'alpha-preview-error',message:String(error&&error.message?error.message:error)},'*');}render(){if(this.state.error){const msg=String(this.state.error&&this.state.error.message?this.state.error.message:this.state.error);return React.createElement('div',{className:'alpha-error'},'Preview rendering error. Tap Refine and describe the fix.',React.createElement('pre',{style:{marginTop:8,fontSize:12,opacity:.8}},msg));}return this.props.children;}}`
}

export function previewDocument(code: string, appLike = false, files?: { path: string; code: string }[]) {
  const escaped = escapeScriptTags(code)
  const withoutMount = stripMountCall(escaped)
  const generatedCss = extractGeneratedCss(files)

  const bodyOverflow = appLike ? 'hidden' : 'auto'
  const rootCss = appLike
    ? 'height:100%;width:100%;overflow:hidden;display:flex;flex-direction:column;background:#0a0a0a;color:#fff'
    : 'min-height:100%;width:100%;display:flex;flex-direction:column;background:#0a0a0a;color:#fff'
  const mountScript = appLike
    ? "ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(AlphaErrorBoundary,null,React.createElement(App)));"
    : "ReactDOM.createRoot(document.getElementById('root')).render(React.createElement('div',{className:'alpha-mount bg-zinc-950 text-zinc-100'},React.createElement(AlphaErrorBoundary,null,React.createElement(App))));"

  return `<!doctype html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<script src="https://cdn.tailwindcss.com"></script>
<script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script src="/alpha-ui.js"></script>
<style>
  html,body{height:100%;margin:0;overflow:${bodyOverflow}}
  #root{${rootCss}}
  *{box-sizing:border-box;font-family:Inter,system-ui,sans-serif}
  .liquid-glass{background:rgba(255,255,255,0.1);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,0.2);border-radius:1rem;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5)}
  .alpha-error{margin:24px;padding:16px;border:1px solid #fecaca;border-radius:12px;background:#fef2f2;color:#991b1b;font:14px/1.5 system-ui;white-space:pre-wrap}
  .alpha-mount{min-height:100vh;width:100%;overflow-x:hidden;display:flex;flex-direction:column}
  .alpha-mount header,.alpha-mount>div>header,.alpha-mount>div>div>header{position:sticky;top:0;z-index:50}
  ${escapeScriptTags(generatedCss)}
</style>
</head>
<body>
<div id="root"></div>
<script>function showAlphaError(value){try{if(window.parent)window.parent.postMessage({type:'alpha-preview-error',message:String(value||'Runtime error')},'*');}catch{}const root=document.getElementById('root');root.innerHTML='<div class="alpha-error"><strong>Preview could not start.</strong><br>'+String(value||'Runtime error').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))+'</div>'}addEventListener('error',event=>showAlphaError(event.message));addEventListener('unhandledrejection',event=>showAlphaError(event.reason?.message||event.reason));${safeRuntimeScript()}${alphaApiBridgeScript()}${headerFixScript()}${navigationBridgeScript()}</script>
<script type="text/babel">${errorBoundaryScript()}${withoutMount}</script>
<script type="text/babel">try{var App = typeof AlphaApp !== 'undefined' ? AlphaApp : (typeof App !== 'undefined' ? App : null); if(!App) throw new Error('AlphaApp component not found');${mountScript}}catch(e){showAlphaError(e.message||e)}</script>
</body>
</html>`
}
