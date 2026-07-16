import { spawn } from 'node:child_process'

const port=4317
const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']})
let output=''; child.stdout.on('data',chunk=>{output+=chunk}); child.stderr.on('data',chunk=>{output+=chunk})
const wait=async()=>{for(let attempt=0;attempt<30;attempt+=1){try{const response=await fetch(`http://127.0.0.1:${port}/`);if(response.ok)return}catch{}await new Promise(resolve=>setTimeout(resolve,200))}throw new Error(`Server did not start. ${output}`)}
try{
  await wait()
  const deep=await fetch(`http://127.0.0.1:${port}/mission/render-smoke`)
  const api=await fetch(`http://127.0.0.1:${port}/api/alpha`,{method:'POST',headers:{'content-type':'application/json',origin:'https://alphatekx.name.ng'},body:JSON.stringify({prompt:'runtime smoke test',mode:'chat'})})
  const missing=await fetch(`http://127.0.0.1:${port}/api/not-real`)
  if(!deep.ok||!(await deep.text()).includes('id="root"'))throw new Error('SPA fallback failed')
  const apiBody=await api.json()
  if(api.headers.get('access-control-allow-origin')!=='https://alphatekx.name.ng')throw new Error('API CORS failed')
  const realSuccess=api.ok&&['openai','groq'].includes(apiBody.provider)&&typeof apiBody.text==='string'
  const honestProviderFailure=api.status===500&&typeof apiBody.error==='string'&&apiBody.error.length>0
  if(!realSuccess&&!honestProviderFailure)throw new Error(`Alpha API returned neither real OpenAI output nor an honest provider error: ${api.status}`)
  if(missing.status!==404||!missing.headers.get('content-type')?.includes('application/json'))throw new Error('Unknown API fallback failed')
  process.stdout.write(`RENDER_SMOKE_OK port=${port} deep=${deep.status} alpha=${api.status} unknownApi=${missing.status}\n`)
} finally { child.kill('SIGTERM') }
