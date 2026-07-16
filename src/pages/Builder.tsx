import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, Code2, Copy, Eye, LoaderCircle, MessageCircle, X } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { buildFromMission } from '../lib/alphaBuilder'
import { spendCredits } from '../lib/creditStore'
import { addMessage, buildMemoryContext, getActivities, getCreationForMission, getMissionById, subscribeStore } from '../lib/missionStore'
import type { Activity, Creation, Mission } from '../lib/types'
import { findMentionedWorker } from '../lib/workerStore'
import ActivityFeedPanel from '../components/mission/ActivityFeedPanel'
import MentorPanel from '../components/mission/MentorPanel'
import { isMentorMission } from '../lib/mentorStore'

function previewDocument(code: string) {
  return `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="https://cdn.tailwindcss.com"></script><script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script><script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script><script src="https://unpkg.com/@babel/standalone/babel.min.js"></script><style>html,body,#root{min-height:100%;margin:0}*{box-sizing:border-box}</style></head><body><div id="root"></div><script type="text/babel">${code.replace(/<\/script/gi, '<\\/script')}</script></body></html>`
}

export default function Builder() {
  const { id = '' } = useParams()
  const [searchParams] = useSearchParams()
  const autoBuildStarted = useRef(false)
  const [mission, setMission] = useState<Mission | null>(() => getMissionById(id))
  const [activities, setActivities] = useState<Activity[]>(() => getActivities(id))
  const [creation, setCreation] = useState<Creation | null>(() => getCreationForMission(id))
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [building, setBuilding] = useState(false)
  const [showCode, setShowCode] = useState(false)
  const [showActivity, setShowActivity] = useState(true)
  const [notice, setNotice] = useState('')
  const [mobileView, setMobileView] = useState<'chat' | 'preview'>('chat')

  useEffect(() => subscribeStore(() => { setMission(getMissionById(id)); setActivities(getActivities(id)); setCreation(getCreationForMission(id)) }), [id])

  const runBuild = async () => {
    const current = getMissionById(id)
    if (!current || building) return
    setBuilding(true); setNotice('')
    try { setCreation(await buildFromMission(current)) }
    catch (error) { setNotice(error instanceof Error && error.message === 'LOW_CREDITS' ? 'You need 10 credits to build this mission.' : `Build stopped: ${error instanceof Error ? error.message : 'Unknown generation error'}`) }
    finally { setBuilding(false) }
  }

  useEffect(() => {
    if (searchParams.get('build') === '1' && mission && !creation && !autoBuildStarted.current) {
      autoBuildStarted.current = true
      void runBuild()
    }
  // The query flag intentionally triggers one build per page load.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mission?.id, creation?.id])

  const send = async () => {
    const content = input.trim()
    if (!content || pending || !mission) return
    if (!await spendCredits(1)) { setNotice('You need at least 1 credit to chat.'); return }
    setInput(''); setPending(true); setNotice('')
    const worker = findMentionedWorker(content)
    const memory = buildMemoryContext(id)
    const mentor = /\blearn|teach|course|study\b/i.test(mission.goal) ? 'Teacher mode: explain step-by-step and end with a short quiz.' : ''
    addMessage(id, { role: 'user', content, type: 'chat', workerId: worker?.id })
    try {
      const response = await fetch(import.meta.env.VITE_ALPHA_API_URL || '/api/alpha', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'chat', missionId: id, prompt: worker ? `Act as ${worker.name}, a ${worker.role} specialist. Purpose: ${worker.purpose}. Instructions: ${worker.instructions}. Mission: ${mission.goal}. User memory: ${memory} Adapt accordingly. ${mentor} User: ${content}` : `Mission goal: ${mission.goal}. User memory: ${memory} Adapt accordingly. ${mentor} User message: ${content}` }) })
      if (!response.ok) throw new Error(`API ${response.status}`)
      const data = await response.json()
      addMessage(id, { role: 'assistant', content: String(data.text || data.response || 'Alpha completed the request.'), type: 'chat', workerId: worker?.id })
      if (/\b(build|create|generate|make the app|start building)\b/i.test(content)) await runBuild()
    } catch { addMessage(id, { role: 'assistant', content: 'Alpha could not connect right now. Your message is saved, so you can try again.', type: 'chat' }) }
    finally { setPending(false) }
  }

  const preview = useMemo(() => creation?.code ? previewDocument(creation.code) : '', [creation])
  const chats = mission?.messages.filter(message => message.type === 'chat') ?? []
  if (!mission) return <div className="grid min-h-screen place-items-center bg-[#FAFAFA] p-6 text-center"><div><h1 className="text-xl font-semibold">Mission not found</h1><Link to="/workspace" className="mt-5 inline-flex rounded-lg bg-black px-5 py-3 text-sm text-white">Return to workspace</Link></div></div>

  return <div className="min-h-screen min-w-0 overflow-x-hidden bg-[#FAFAFA]">
    <header className="flex min-h-16 items-center justify-between gap-4 border-b border-gray-200 bg-white px-5"><div className="min-w-0"><div className="flex items-center gap-2"><span className={`size-2 rounded-full bg-black ${building ? 'animate-pulse' : ''}`}/><h1 className="truncate text-sm font-semibold">{mission.title}</h1></div><p className="mt-1 text-xs text-gray-500">{building ? 'AI team building your app' : `${mission.progress}% complete`}</p></div><div className="flex gap-2">{creation && <button onClick={() => setShowCode(true)} className="min-h-11 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium" type="button">Code</button>}<button onClick={() => void runBuild()} disabled={building} className="min-h-11 rounded-lg bg-black px-5 text-sm font-medium text-white disabled:opacity-50" type="button">{building ? 'Building...' : 'Build'}</button></div></header>
    {notice && <div className="border-b border-gray-200 bg-white px-5 py-3 text-center text-sm text-gray-700">{notice}</div>}
    <div className="grid grid-cols-2 border-b border-gray-200 bg-white p-2 lg:hidden"><button onClick={()=>setMobileView('chat')} className={`flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm ${mobileView==='chat'?'bg-black text-white':'text-gray-500'}`}><MessageCircle size={16}/>Chat</button><button onClick={()=>setMobileView('preview')} className={`flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm ${mobileView==='preview'?'bg-black text-white':'text-gray-500'}`}><Eye size={16}/>Preview</button></div>
    <div className="grid min-h-[calc(100vh-128px)] min-w-0 lg:grid-cols-[minmax(0,3fr)_minmax(360px,2fr)]">
      <section className={`${mobileView==='chat'?'flex':'hidden'} min-h-[calc(100vh-130px)] min-w-0 flex-col border-b border-gray-200 bg-[#FAFAFA] lg:flex lg:min-h-[620px] lg:border-b-0 lg:border-r`}>
        <div className="flex-1 space-y-4 overflow-y-auto p-5 md:p-6"><div className="max-w-[90%] rounded-xl border border-gray-200 bg-white p-4 text-sm leading-6 text-gray-700">I understand: <strong className="text-black">{mission.goal}</strong><br/><span className="text-gray-500">Tell me what to change, or say “build” when you are ready.</span></div>{chats.map(message => <div key={message.id} className={message.role === 'user' ? 'ml-auto max-w-[90%] rounded-xl bg-gray-200 p-4 text-sm text-gray-900' : 'max-w-[90%] rounded-xl border border-gray-200 bg-white p-4 text-sm leading-6 text-gray-700'}>{message.content}</div>)}{pending && <div className="flex items-center gap-2 text-sm text-gray-500"><LoaderCircle className="animate-spin" size={16}/>Alpha is responding...</div>}</div>
        <div className="border-t border-gray-200 bg-white p-4"><div className="rounded-xl border border-gray-300 bg-white p-2 focus-within:border-gray-500"><textarea value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() } }} className="h-20 w-full resize-none px-2 py-2 text-sm outline-none" placeholder="Message Alpha..."/><div className="flex justify-end"><button onClick={() => void send()} disabled={pending || !input.trim()} className="grid size-11 place-items-center rounded-lg bg-black text-white disabled:opacity-30" aria-label="Send"><ArrowUp size={18}/></button></div></div></div>
        <div className="border-t border-gray-200 bg-white"><button onClick={() => setShowActivity(value => !value)} className="flex min-h-12 w-full items-center justify-between px-5 text-sm font-medium" type="button"><span>Build progress</span><span className="text-xs text-gray-500">{activities.length} updates · {showActivity ? 'Hide' : 'Show'}</span></button>{showActivity && <ActivityFeedPanel activities={activities} building={building}/>} {isMentorMission(mission.goal) && <MentorPanel mission={mission}/>}</div>
      </section>
      <section className={`${mobileView==='preview'?'flex':'hidden'} min-h-[calc(100vh-130px)] min-w-0 flex-col bg-white p-3 sm:p-4 md:p-6 lg:flex lg:min-h-[620px]`}><div className="flex min-h-11 items-center gap-3 rounded-t-xl border border-gray-200 bg-gray-50 px-4"><span className="flex gap-1"><i className="size-2 rounded-full bg-gray-300"/><i className="size-2 rounded-full bg-gray-300"/><i className="size-2 rounded-full bg-gray-300"/></span><div className="min-w-0 flex-1 truncate rounded-md border border-gray-200 bg-white px-3 py-1.5 text-center text-xs text-gray-500">preview.alphatekx.app</div>{creation && <span className="text-xs text-gray-500">Ready</span>}</div><div className="min-h-0 flex-1 rounded-b-xl border-x border-b border-gray-200 bg-white">{preview ? <iframe title="Generated application" srcDoc={preview} sandbox="allow-scripts allow-forms allow-modals allow-same-origin" className="h-full min-h-[540px] w-full rounded-b-xl bg-white"/> : <EmptyPreview building={building}/>}</div></section>
    </div>
    {showCode && creation && <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onMouseDown={() => setShowCode(false)}><section className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm" onMouseDown={event => event.stopPropagation()}><div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold">Project code</h2><p className="mt-1 text-sm text-gray-500">{creation.files.length} files generated</p></div><div className="flex gap-2"><button onClick={() => navigator.clipboard.writeText(creation.code)} className="flex min-h-11 items-center gap-2 rounded-lg border border-gray-300 px-4 text-sm" type="button"><Copy size={15}/>Copy</button><button onClick={() => setShowCode(false)} className="grid size-11 place-items-center rounded-lg hover:bg-gray-50" aria-label="Close"><X size={18}/></button></div></div><div className="mt-4 flex gap-2 overflow-x-auto border-b border-gray-200 pb-3">{creation.files.map(file => <span key={file.path} className="shrink-0 rounded-md bg-gray-100 px-3 py-2 text-xs">{file.path}</span>)}</div><pre className="mt-4 min-h-0 flex-1 overflow-auto rounded-lg bg-[#111] p-4 font-mono text-xs leading-6 text-gray-200">{creation.code}</pre></section></div>}
  </div>
}

function EmptyPreview({ building }: { building: boolean }) { return <div className="grid h-full min-h-[540px] place-items-center p-8 text-center"><div>{building ? <LoaderCircle className="mx-auto animate-spin text-gray-600" size={32}/> : <Code2 className="mx-auto text-gray-300" size={32}/>}<h2 className="mt-4 text-xl font-semibold">{building ? 'Preparing your app...' : 'Your app will appear here'}</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-gray-500">{building ? 'Alpha is writing and checking your app.' : 'Click Build or say “build” in the chat to begin.'}</p></div></div> }
