import { spawn } from 'node:child_process'

const port=4317
const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']})
let output=''; child.stdout.on('data',chunk=>{output+=chunk}); child.stderr.on('data',chunk=>{output+=chunk})
const wait=async()=>{for(let attempt=0;attempt<30;attempt+=1){try{const response=await fetch(`http://127.0.0.1:${port}/`);if(response.ok)return}catch{}await new Promise(resolve=>setTimeout(resolve,200))}throw new Error(`Server did not start. ${output}`)}
try{
  await wait()
  const deep=await fetch(`http://127.0.0.1:${port}/mission/render-smoke`)
  const api=await fetch(`http://127.0.0.1:${port}/api/alpha`,{method:'POST',headers:{'content-type':'application/json',origin:'https://alphatekx.name.ng','x-local-user-id':'smoke','x-local-user-email':'smoke@test.local'},body:JSON.stringify({prompt:'runtime smoke test',mode:'chat'})})
  const missing=await fetch(`http://127.0.0.1:${port}/api/not-real`)
  const invalidApp=await fetch(`http://127.0.0.1:${port}/app/INVALID-SLUG`)
  const publishRoute=await fetch(`http://127.0.0.1:${port}/api/creations/publish`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({creationId:'00000000-0000-0000-0000-000000000000',slug:'smoke-app'})})
  const previewSave=await fetch(`http://127.0.0.1:${port}/api/previews/smoke-preview`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:'Smoke Preview',code:'function AlphaApp(){return <div className="min-h-screen bg-[#0A0A0A] text-white"><h1>Smoke</h1></div>;}\nReactDOM.createRoot(document.getElementById("root")).render(<AlphaApp />);'})})
  const previewLoad=previewSave.ok?await fetch(`http://127.0.0.1:${port}/preview/smoke-preview`):null
  if(!deep.ok||!(await deep.text()).includes('id="root"'))throw new Error('SPA fallback failed')
  const apiBody=await api.json()
  if(api.headers.get('access-control-allow-origin')!=='https://alphatekx.name.ng')throw new Error('API CORS failed')
  const realSuccess=api.ok&&['openai','groq'].includes(apiBody.provider)&&typeof apiBody.text==='string'
  const honestProviderFailure=api.status===500&&typeof apiBody.error==='string'&&apiBody.error.length>0
  if(!realSuccess&&!honestProviderFailure)throw new Error(`Alpha API returned neither real OpenAI output nor an honest provider error: ${api.status}`)
  if(missing.status!==404||!missing.headers.get('content-type')?.includes('application/json'))throw new Error('Unknown API fallback failed')
  if(invalidApp.status!==404||!invalidApp.headers.get('content-type')?.includes('application/json'))throw new Error('Invalid published app route was not rejected')
  if(![401,503].includes(publishRoute.status))throw new Error(`Publish route did not enforce configuration/authentication: ${publishRoute.status}`)
  const previewText = previewLoad ? await previewLoad.text() : ''
  if(!previewSave.ok||!previewLoad||!previewLoad.ok||!previewText.includes('<script type="module"'))throw new Error(`Preview route failed: save=${previewSave.status} load=${previewLoad?.status}`)
  process.stdout.write(`RENDER_SMOKE_OK port=${port} deep=${deep.status} alpha=${api.status} unknownApi=${missing.status} app=${invalidApp.status} publish=${publishRoute.status} preview=${previewLoad.status}\n`)
} finally { child.kill('SIGTERM') }
