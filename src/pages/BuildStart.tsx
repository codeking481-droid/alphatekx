import { useState } from 'react'
import { ArrowRight, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { createMission } from '../lib/missionStore'

export default function BuildStart() {
  const [idea, setIdea] = useState('')
  const navigate = useNavigate()
  const start = () => { if (!idea.trim()) return; const mission = createMission(idea.trim()); navigate(`/mission/${mission.id}?build=1`) }
  return <div className="mx-auto grid min-h-screen max-w-3xl place-items-center px-5 py-20"><div className="w-full"><Sparkles size={24}/><h1 className="mt-5 text-2xl font-semibold">What do you want Alpha to build?</h1><p className="mt-2 text-sm text-white/55">Describe the real app, website, dashboard, course, business tool, or AI worker you need.</p><div className="mt-7 rounded-2xl border border-white/[.15] liquid-glass p-3 shadow-sm"><textarea autoFocus value={idea} onChange={event => setIdea(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); start() } }} className="h-36 w-full resize-none px-2 py-2 outline-none" placeholder="For example: Build a barber booking app with services, available times, customer details, WhatsApp confirmation, and saved bookings..."/><div className="flex justify-end"><button onClick={start} disabled={!idea.trim()} className="flex min-h-11 items-center gap-2 rounded-lg btn-alpha px-5 text-sm text-white disabled:opacity-30">Start building <ArrowRight size={16}/></button></div></div></div></div>
}
