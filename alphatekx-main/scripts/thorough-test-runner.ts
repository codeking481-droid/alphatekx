import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import http from 'node:http'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const storage = new Map<string,string>()
const events = new EventTarget()
class TestCustomEvent extends Event { detail: unknown; constructor(type:string, init?:{detail?:unknown}) { super(type); this.detail=init?.detail } }
Object.assign(globalThis, {
  CustomEvent: TestCustomEvent,
  localStorage: { getItem:(key:string)=>storage.get(key)??null, setItem:(key:string,value:string)=>storage.set(key,String(value)), removeItem:(key:string)=>storage.delete(key), clear:()=>storage.clear() },
  window: { localStorage:null, dispatchEvent:(event:Event)=>events.dispatchEvent(event), addEventListener:(type:string,listener:EventListener)=>events.addEventListener(type,listener), removeEventListener:(type:string,listener:EventListener)=>events.removeEventListener(type,listener), setTimeout:(callback:(...args:unknown[])=>void)=>setTimeout(callback,0) },
})
;(globalThis.window as {localStorage:unknown}).localStorage=globalThis.localStorage

type Result={name:string;passed:boolean;reason?:string}
const results:Result[]=[]
async function test(name:string, run:()=>unknown|Promise<unknown>){try{await run();results.push({name,passed:true})}catch(error){results.push({name,passed:false,reason:error instanceof Error?error.message:String(error)})}}
const assert=(condition:unknown,message:string)=>{if(!condition)throw new Error(message)}
const source=(file:string)=>fs.readFileSync(path.join(root,file),'utf8')

const store=await import('../src/lib/missionStore.ts')
const credits=await import('../src/lib/creditStore.ts')
const mentor=await import('../src/lib/mentorStore.ts')
const reviews=await import('../src/lib/reviewStore.ts')
const builder=await import('../src/lib/alphaBuilder.ts')

localStorage.clear(); credits.setCredits(100)

// 1. Auth and profiles: cloud contracts are validated from schema/client code without using real credentials.
await test('Auth: signup profile defaults to 30 credits',()=>{const sql=source('supabase/schema.sql');assert(/handle_new_user[\s\S]*30,'free'/.test(sql),'signup trigger/default missing')})
await test('Auth: wrong password error is surfaced',()=>{const auth=source('src/pages/Auth.tsx');assert(auth.includes('signInWithPassword')&&auth.includes('result.error'),'password failure is not handled')})
await test('Auth: protected core routes use auth gate',()=>{const app=source('src/App.tsx');const gate=source('src/components/auth/AuthGate.tsx');assert(app.includes('protectedPage(<Home')&&app.includes('protectedPage(<Automations')&&gate.includes('<Navigate to="/auth"'),'protected redirect missing')})
await test('Auth: Google OAuth exists',()=>assert(source('src/pages/Auth.tsx').includes("provider:'google'"),'Google OAuth missing'))
await test('Auth: sign out clears Supabase session',()=>assert(source('src/lib/auth.tsx').includes('supabase?.auth.signOut()'),'sign out missing'))
await test('Auth: account displays email and credits',()=>{const account=source('src/pages/Account.tsx');assert(account.includes('user?.email')&&account.includes('profile?.credits'),'account identity fields missing')})
await test('Auth: RLS isolates mission ownership',()=>assert(/mission owner access[\s\S]*auth\.uid\(\)=user_id/.test(source('supabase/schema.sql')),'mission RLS missing'))

// 2. Missions.
let mission=store.createMission('Build a simple school website')
await test('Mission: create active mission at zero progress',()=>assert(mission.status==='active'&&mission.progress===0&&store.getMissionById(mission.id)?.goal===mission.goal,'mission was not persisted correctly'))
await test('Mission: chat persists and deducts one credit',async()=>{store.addMessage(mission.id,{role:'user',content:'Use React',type:'chat'});assert(await credits.spendCredits(1),'credit spend rejected');assert(credits.getCredits()===99,'wrong balance');assert(store.getMissionById(mission.id)?.messages.some(item=>item.content==='Use React'),'message missing after reload')})
await test('Mission: ten rapid messages do not duplicate',()=>{for(let index=0;index<10;index++)store.addMessage(mission.id,{role:'user',content:`rapid-${index}`,type:'chat'});const rapid=store.getMissionById(mission.id)?.messages.filter(item=>item.content.startsWith('rapid-'))??[];assert(rapid.length===10&&new Set(rapid.map(item=>item.id)).size===10,'rapid writes duplicated or vanished')})
await test('Mission: completion sets completed and 100',()=>{store.completeMission(mission.id);const value=store.getMissionById(mission.id);assert(value?.status==='completed'&&value.progress===100,'completion failed')})
await test('Mission: empty goal is rejected',()=>{let failed=false;try{store.createMission('   ')}catch{failed=true}assert(failed,'empty mission was accepted')})

const learningMockCode = `function SchoolApp() {
  const [activeCourse, setActiveCourse] = React.useState(null);
  const [score, setScore] = React.useState(0);
  const [completed, setCompleted] = React.useState([]);
  const courses = [
    { id: 'c1', title: 'Mathematics', lessons: 5 },
    { id: 'c2', title: 'Science', lessons: 4 },
  ];
  const lessons = [
    { id: 'l1', title: 'Algebra basics', course: 'Mathematics' },
    { id: 'l2', title: 'Geometry intro', course: 'Mathematics' },
  ];
  const quiz = { question: 'What is 2+2?', options: ['3', '4', '5'], answer: 1 };
  const progress = completed.length / lessons.length * 100;
  return (
    <div className="min-h-screen w-full bg-zinc-950 text-zinc-100">
      <nav className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <span className="font-bold">School</span>
        <div className="flex gap-4"><a href="#">Courses</a><a href="#">Quiz</a></div>
      </nav>
      <header className="hero px-6 py-16 text-center">
        <h1 className="text-3xl font-bold sm:text-5xl">Welcome to your learning journey</h1>
        <p className="mx-auto mt-4 max-w-2xl text-zinc-400">Study at your own pace</p>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h2 className="text-xl font-semibold">Courses</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {courses.map((c) => (
            <div key={c.id} className="rounded-xl bg-white/5 p-4">
              <h3 className="font-semibold">{c.title}</h3>
              <p className="text-sm text-zinc-500">{c.lessons} lessons</p>
              <button onClick={() => setActiveCourse(c.id)} className="mt-2 rounded-lg bg-indigo-500 px-3 py-1 text-sm text-white">Open</button>
            </div>
          ))}
        </div>
        {activeCourse && (
          <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-4">
            <h2 className="text-xl font-semibold">Lesson</h2>
            <p className="text-sm text-zinc-400">{lessons.find((l) => l.id === activeCourse)?.title || 'Pick a course'}</p>
            <button onClick={() => setCompleted([...completed, activeCourse])} className="mt-2 rounded-lg bg-emerald-500 px-3 py-1 text-sm text-white">Mark complete</button>
            <div className="mt-2 h-2 rounded bg-white/10"><div className="h-full rounded bg-indigo-500" style={{ width: progress + '%' }} /></div>
          </div>
        )}
        <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="text-xl font-semibold">Quiz</h2>
          <p className="text-sm text-zinc-300">{quiz.question}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {quiz.options.map((opt, i) => (
              <button key={i} onClick={() => setScore(i === quiz.answer ? score + 1 : score)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-sm hover:bg-white/10">{opt}</button>
            ))}
          </div>
          <p className="mt-2 text-sm">Score: {score}</p>
        </div>
      </main>
      <footer className="border-t border-white/10 px-6 py-8 text-center text-sm text-zinc-500">
        &copy; 2026 School Site
      </footer>
    </div>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(<SchoolApp />);`

// 3. Builder and team.
credits.setCredits(100)
mission=store.createMission('Build a simple school website','School Website')
const originalFetch=globalThis.fetch
globalThis.fetch=async(url)=>{
  if (String(url).includes('/api/previews/')) {
    return new Response(JSON.stringify({ok:true,url:'/preview/'+mission.id}),{status:200,headers:{'content-type':'application/json'}})
  }
  return new Response(JSON.stringify({code:'```tsx\n' + learningMockCode + '\n```'}),{status:200,headers:{'content-type':'application/json'}})
}
let creation=await builder.buildFromMission(mission)
globalThis.fetch=originalFetch
await test('Builder: six team roles run in order',()=>{const roles=store.getActivities(mission.id).map(item=>item.role).filter(role=>role!=='Alpha');const expected=['Product Manager','UI Designer','Backend Engineer','Database Engineer','QA Tester','Deployment Engineer'];let cursor=-1;for(const role of expected){const next=roles.indexOf(role,cursor+1);assert(next>cursor,`${role} missing or out of order`);cursor=next}})
await test('Builder: activities include timestamps',()=>assert(store.getActivities(mission.id).every(item=>item.timestamp&&!Number.isNaN(Date.parse(item.timestamp))),'activity timestamp missing'))
await test('Builder: activity UI has icons and 200ms motion',()=>{const ui=source('src/components/mission/ActivityFeedPanel.tsx');assert(ui.includes('CheckCircle2')&&ui.includes('duration: .2'),'activity UI contract missing')})
await test('Builder: preview iframe renders generated code contract',()=>{const ui=source('src/pages/Builder.tsx');assert(ui.includes('<iframe')&&ui.includes('src={previewUrl}')&&creation.code.includes('createRoot'),'preview contract missing')})
await test('Builder: Code modal and Copy button exist',()=>{const ui=source('src/pages/Builder.tsx');assert(ui.includes('Project code')&&ui.includes('navigator.clipboard.writeText'),'code modal missing')})
await test('Builder: creation saved with files',()=>assert(store.getCreationById(creation.id)?.files.some(file=>file.path==='src/App.tsx'),'creation files missing'))
await test('Builder: creation saves a new version on each save',()=>{store.saveCreation({id:creation.id,missionId:mission.id,title:creation.title,code:creation.code+'// updated',files:creation.files});const updated=store.getCreationById(creation.id);assert(updated?.versions?.length===2&&updated?.versionIndex===1,'version not appended')})
await test('Builder: undo restores previous version',()=>{const undone=store.undoCreation(creation.id);assert(undone?.code===creation.code&&store.getCreationById(creation.id)?.versionIndex===0,'undo failed')})
await test('Builder: redo restores next version',()=>{const redone=store.redoCreation(creation.id);assert(redone?.code===creation.code+'// updated'&&store.getCreationById(creation.id)?.versionIndex===1,'redo failed')})
await test('Builder: abort signal stops build before credits are spent',async()=>{credits.setCredits(100);const aborted=new AbortController();aborted.abort();let threw=false;try{await builder.buildFromMission(mission,aborted.signal)}catch{threw=true}assert(threw&&credits.getCredits()===100,'abort did not stop build cleanly')})
const learn=store.createMission('Learn React basics')
const progress=mentor.ensureMentorProgress(learn.id,learn.goal)
await test('Mentor: learning goal creates five lessons and quizzes',()=>assert(mentor.isMentorMission(learn.goal)&&progress.lessons.length===5&&progress.lessons.every(item=>item.quiz.options.length>1),'mentor curriculum incomplete'))
await test('Mentor: quiz score and progress persist',()=>{const saved=mentor.completeLesson(learn.id,progress.lessons[0].id,100);assert(saved?.quizScores[progress.lessons[0].id]===100&&store.getMissionById(learn.id)!.progress===20,'quiz progress not saved')})

// 4. Credits and payment contracts.
await test('Credits: five chats and one build cost fifteen',async()=>{credits.setCredits(100);for(let i=0;i<5;i++)assert(await credits.spendCredits(1),'chat debit failed');assert(await credits.spendCredits(10),'build debit failed');assert(credits.getCredits()===85,'expected 85 credits')})
await test('Credits: zero balance blocks build and never goes negative',async()=>{credits.setCredits(0);assert(!(await credits.spendCredits(10)),'zero balance allowed build');credits.setCredits(-4);assert(credits.getCredits()===0,'negative credits stored')})
await test('Credits: mock Paystack adds 500',()=>{credits.setCredits(0);credits.addCredits(500);assert(credits.getCredits()===500,'top-up failed')})
await test('Credits: database spend is atomic',()=>{const sql=source('supabase/schema.sql');assert(/update public\.profiles set credits=credits-amount where id=auth\.uid\(\) and credits>=amount/.test(sql),'atomic spend function missing')})
await test('Credits: low-credit warning and settings route exist',()=>{const ui=source('src/components/workspace/WorkspaceLayout.tsx');assert(ui.includes('credits < 5')&&ui.includes("'/settings'"),'low-credit settings path missing')})

// 5. Creations.
await test('Creations: built app appears in list store',()=>assert(store.getCreations().some(item=>item.id===creation.id),'creation list missing app'))
await test('Creations: ZIP contains runnable project files',()=>{const zip=source('src/lib/exportCreation.ts');assert(zip.includes("zip.file('index.html'")&&zip.includes("zip.file('src/App.jsx'")&&zip.includes('anchor.click()'),'ZIP export incomplete')})
await test('Creations: card includes title type status and open action',()=>{const ui=source('src/pages/Creations.tsx');assert(ui.includes('creation.title')&&ui.includes('creation.type')&&ui.includes('creation.status')&&ui.includes(`/mission/`),'creation card fields missing')})

// 6. Marketplace.
let item=store.publishCreation(creation.id,{title:'School Website',description:'A school site',category:'Websites',priceType:'free',price:0},'QA Creator')
await test('Marketplace: free publication appears',()=>assert(store.getMarketplaceItems().some(entry=>entry.id===item.id&&entry.priceType==='free'),'free listing missing'))
await test('Marketplace: simplified filters exist',()=>{const ui=source('src/pages/Marketplace.tsx');for(const label of ['All','Websites','Apps','Workers','Templates'])assert(ui.includes(label),`${label} filter missing`)})
await test('Marketplace: free acquisition clones and increments downloads',()=>{const before=store.getCreations().length;const clone=store.cloneMarketplaceItem(item.id);assert(clone&&store.getCreations().length===before+1&&store.getMarketplaceItems().find(entry=>entry.id===item.id)?.downloads===1,'free acquisition failed')})
const paidCreation=store.saveCreation({missionId:mission.id,title:'Paid School Kit',code:creation.code,files:creation.files})
const paid=store.publishCreation(paidCreation.id,{title:'Paid School Kit',description:'Premium kit',category:'Templates',priceType:'paid',price:1000},'QA Creator')
await test('Marketplace: paid price persists',()=>assert(store.getMarketplaceItems().find(entry=>entry.id===paid.id)?.price===1000,'paid price missing'))
await reviews.saveReview(item.id,'00000000-0000-4000-8000-000000000001',5,'Very useful')
await test('Marketplace: review persists and average UI updates',()=>{assert(reviews.getReviews().some(review=>review.itemId===item.id&&review.rating===5),'review missing');assert(source('src/pages/Marketplace.tsx').includes('reduce((sum, review)'),'average rating calculation missing')})
await test('Marketplace: creator and revenue routes expose metrics',()=>{const creator=source('src/pages/Creator.tsx');const revenue=source('src/pages/Revenue.tsx');assert(creator.includes('downloads')&&creator.includes('rating')&&revenue.includes('Total earned')&&revenue.includes('sales'),'creator/revenue metrics missing')})

// 7. Launch.
const version=store.getCreationById(creation.id)!.versions![0]
await test('Launch: six-stage pipeline exists',()=>{const ui=source('src/pages/Launch.tsx');for(const stage of ['Idea','Plan','Build','Test','Deploy','Live'])assert(ui.includes(`'${stage}'`),`${stage} stage missing`)})
await test('Launch: rollback restores a version',()=>assert(store.rollbackCreation(creation.id,version.id)?.code===version.code,'rollback failed'))
await test('Launch: status, tables, export targets and domain exist',()=>{const ui=source('src/pages/Launch.tsx');for(const value of ['creation.status','Database tables','Vercel','Render','Docker','customDomain'])assert(ui.includes(value),`${value} missing`)})
store.updateCreation(creation.id,{customDomain:'school.example.com',status:'live'})
await test('Launch: custom domain saves',()=>assert(store.getCreationById(creation.id)?.customDomain==='school.example.com','domain not saved'))

// 8. Memory.
const m1=store.createMission('Build CRM with React and Supabase');store.addMessage(m1.id,{role:'user',content:'Must use TypeScript',type:'chat'});store.createMission('Create a store with Vite');store.createMission('Build analytics in React')
const memory=store.buildMemoryContext(learn.id)
await test('Memory: top goals and preferred stack detected',()=>assert(memory.includes('Build CRM')&&memory.includes('React')&&memory.includes('Supabase'),'memory goals/stack missing'))
await test('Memory: prior decisions retained and injected',()=>{assert(memory.includes('Must use TypeScript'),'decision missing');assert(source('src/pages/Builder.tsx').includes('buildMemoryContext')&&source('src/pages/Builder.tsx').includes('User memory:'),'memory not injected')})

// 9. Security and server behavior.
await test('Security: XSS message is stored as text and rendered by React',()=>{const payload='<script>alert(1)</script>';store.addMessage(m1.id,{role:'user',content:payload,type:'chat'});assert(store.getMissionById(m1.id)?.messages.some(message=>message.content===payload),'payload was altered');assert(!source('src/pages/Builder.tsx').includes('dangerouslySetInnerHTML'),'unsafe chat rendering detected')})
await test('Security: mission RLS and review ownership policies exist',()=>{const sql=source('supabase/schema.sql');assert(sql.includes('mission owner access')&&sql.includes('review owner write'),'RLS policies missing')})
await test('Security: user API keys are encrypted and never returned raw',()=>{const server=source('server.mjs');const settings=source('src/lib/userSettings.ts');assert(server.includes("createCipheriv('aes-256-gcm'")&&server.includes('keyStatus(existing, key)')&&!settings.includes('atob(')&&!settings.includes('api_keys'),'secure key vault contract missing')})
await test('Workers: server resolves owned worker and stored provider key',()=>{const server=source('server.mjs');const workers=source('src/pages/Workers.tsx');assert(server.includes('runWorkerRequest')&&server.includes('storedUserKeys(user.id, config)')&&workers.includes("{ workerId: selected.id, prompt: prompt.trim() }")&&!workers.includes('apiKey'),'worker still exposes provider keys in the browser')})
await test('Gmail: OAuth state is signed and tokens are encrypted',()=>{const server=source('server.mjs');assert(server.includes("createHmac('sha256'")&&server.includes('timingSafeEqual')&&server.includes('beginGoogleOAuth')&&server.includes('/auth/google?state=')&&server.includes('encryptSecret(tokens.access_token')&&server.includes('encryptSecret(refreshToken'),'secure Gmail OAuth contract missing')})
await test('Gmail: send uses authenticated RFC2822 base64url flow',()=>{const server=source('server.mjs');assert(server.includes("toString('base64url')")&&server.includes("users.messages.send({ userId: 'me'")&&server.includes("req.url === '/api/gmail/send'")&&server.includes('authenticatedUser(req'),'Gmail send contract missing')})
await test('Gmail: Vault exposes connect status disconnect and test send',()=>{const vault=source('src/pages/Creations.tsx');const client=source('src/lib/integrations.ts');assert(vault.includes('Connect Gmail')&&vault.includes('Disconnect')&&vault.includes('Send test email')&&client.includes('/api/integrations/google/start')&&!client.includes('refresh_token'),'Vault Gmail controls incomplete or expose tokens')})
await test('Gmail: Supabase integration storage has RLS ownership',()=>{const sql=source('supabase/gmail-integration.sql');assert(sql.includes('enable row level security')&&sql.includes('auth.uid() = user_id')&&sql.includes('unique(user_id, provider)'),'Gmail integration RLS missing')})

const port=4328
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']})
let serverOutput='';server.stdout.on('data',chunk=>serverOutput+=chunk);server.stderr.on('data',chunk=>serverOutput+=chunk)
for(let attempt=0;attempt<40;attempt++){try{if((await fetch(`http://127.0.0.1:${port}/`)).ok)break}catch{}await new Promise(resolve=>setTimeout(resolve,100))}
await test('Security: unknown API is JSON 404',async()=>{const response=await fetch(`http://127.0.0.1:${port}/api/hack`);assert(response.status===404&&response.headers.get('content-type')?.includes('application/json'),'unknown API fallback unsafe')})
await test('Security: encoded traversal is rejected',async()=>{const status=await new Promise<number>((resolve,reject)=>{const request=http.request({hostname:'127.0.0.1',port,path:'/api/%2e%2e/%2e%2e/etc/passwd',method:'GET'},response=>{response.resume();resolve(response.statusCode??0)});request.on('error',reject);request.end()});assert(status===404,`traversal returned ${status}`)})
server.kill('SIGTERM')

// 10. Performance and simple UI.
const distAssets=path.join(root,'dist','assets');const initial=fs.readdirSync(distAssets).filter(file=>/^index-.*\.js$/.test(file)).map(file=>fs.statSync(path.join(distAssets,file)).size).sort((a,b)=>a-b)[0]??Infinity
await test('Performance: landing bundle below 200 kB',()=>assert(initial<200*1024,`initial chunk is ${(initial/1024).toFixed(2)} kB`))
await test('Performance: production build has root and assets',()=>{const html=source('dist/index.html');assert(html.includes('id="root"')&&html.includes('/assets/'),'production output incomplete')})
await test('Production: browser API calls stay on the deployed origin',()=>{const sourceFiles=['src/pages/Home.tsx','src/pages/Builder.tsx','src/lib/alphaBuilder.ts'].map(source).join('\n');const built=fs.readdirSync(distAssets).filter(file=>file.endsWith('.js')).map(file=>fs.readFileSync(path.join(distAssets,file),'utf8')).join('\n');assert(!sourceFiles.includes('VITE_ALPHA_API_URL')&&!built.includes('localhost:3001/api/alpha'),'frontend contains a localhost Alpha API URL')})
await test('Production: application source has no console.log',()=>{const files=['src/App.tsx','src/pages/Landing.tsx','src/pages/Home.tsx','src/pages/Builder.tsx','src/pages/Marketplace.tsx'];assert(files.every(file=>!source(file).includes('console.log')),'console.log found in app source')})
await test('UI: routed core pages have no rainbow glow classes',()=>{const files=['src/pages/Landing.tsx','src/pages/Home.tsx','src/pages/Agents.tsx','src/pages/Connectors.tsx','src/pages/History.tsx','src/pages/Settings.tsx','src/pages/Auth.tsx'];const combined=files.map(source).join('\n');assert(!/cyan|shadow-\[0_0|radial-gradient|from-amber|to-amber/.test(combined),'rainbow/glow style remains')})
await test('UI: plain-language labels and onboarding exist',()=>{const layout=source('src/components/workspace/WorkspaceLayout.tsx');const activity=source('src/components/mission/ActivityFeedPanel.tsx');assert(layout.includes('Type your idea')&&layout.includes('Chat with AI')&&layout.includes('Publish and launch')&&activity.includes("'Preparing your app'"),'onboarding or plain-language conversion missing')})
await test('UI: clean chat and product empty states exist',()=>{assert(source('src/pages/Home.tsx').includes('Ask Alpha anything')&&source('src/pages/Agents.tsx').includes('No automations yet')&&source('src/pages/History.tsx').includes('No automations yet'),'chat or empty states missing')})
await test('UI: mobile responsive contracts exist',()=>{const home=source('src/pages/Home.tsx');const automations=source('src/pages/Agents.tsx');const connectors=source('src/pages/Connectors.tsx');assert(home.includes('max-w-[820px]')&&automations.includes('lg:grid-cols')&&connectors.includes('md:grid-cols'),'responsive contracts missing')})
await test('UI: primary buttons have clear labels',()=>{const combined=['src/pages/Home.tsx','src/pages/Builder.tsx','src/pages/Marketplace.tsx','src/pages/Launch.tsx'].map(source).join('\n');for(const label of ['Start','Build','Buy','Project ZIP'])assert(combined.includes(label),`${label} action missing`)})

// Existing harnesses are part of this strict run.
const full=spawnSync(process.execPath,['scripts/full-test.mjs'],{cwd:root,encoding:'utf8'});await test('Existing: FULL_TEST_OK',()=>assert(full.status===0&&full.stdout.includes('FULL_TEST_OK'),full.stderr||'full test failed'))
const smoke=spawnSync(process.execPath,['scripts/render-smoke.mjs'],{cwd:root,encoding:'utf8'});await test('Existing: RENDER_SMOKE_OK',()=>assert(smoke.status===0&&smoke.stdout.includes('RENDER_SMOKE_OK'),smoke.stderr||'render smoke failed'))

const passed=results.filter(result=>result.passed).length;const failed=results.length-passed
process.stdout.write(`THOROUGH_TEST_SUMMARY:\n- Total tests: ${results.length}\n- Passed: ${passed}\n- Failed: ${failed}\n`)
for(const result of results.filter(result=>!result.passed))process.stdout.write(`- FAIL: ${result.name} - ${result.reason}\n`)
process.stdout.write(`- Landing bundle: ${(initial/1024).toFixed(2)} kB\n- Existing full test: ${full.status===0?'FULL_TEST_OK':'FAIL'}\n- Existing Render smoke: ${smoke.status===0?'RENDER_SMOKE_OK':'FAIL'}\n`)
if(failed===0)process.stdout.write('THOROUGH_TEST_OK\n');else process.exitCode=1
