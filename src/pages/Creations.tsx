import { useEffect, useState } from 'react'
import { Download, ExternalLink, Rocket, Store, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { exportCreationZip } from '../lib/exportCreation'
import { getCreations, publishCreation, subscribeStore } from '../lib/missionStore'
import type { Creation } from '../lib/types'
import { useAuth } from '../lib/auth'

export default function Creations() {
  const [creations, setCreations] = useState<Creation[]>(getCreations())
  const [publishing, setPublishing] = useState<Creation | null>(null)
  const [details, setDetails] = useState({ title:'', description:'', category:'Web Apps', priceType:'free' as 'free'|'paid', price:0 })
  const navigate = useNavigate()
  const { user } = useAuth()
  useEffect(() => subscribeStore(() => setCreations(getCreations())), [])

  const openPublish = (creation: Creation) => { setPublishing(creation); setDetails({title:creation.title,description:`A ${creation.type} created with AlphaTekX.`,category:'Web Apps',priceType:'free',price:0}) }
  const publish = () => { if(!publishing)return; publishCreation(publishing.id,details,user?.email??'AlphaTekX Creator'); setPublishing(null) }
  const deploy = (creation: Creation) => navigate(`/launch?creation=${encodeURIComponent(creation.id)}`)

  return <Page title="Creations" subtitle="Everything Alpha has built across your missions.">{creations.length?<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{creations.map(creation=><article key={creation.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"><div className="grid aspect-[16/9] place-items-center border-b border-gray-200 bg-gray-50"><div className="text-center"><span className="text-xs text-gray-500">{creation.type}</span><h2 className="mt-2 text-xl font-semibold">{creation.title}</h2></div></div><div className="p-5"><div className="flex items-center justify-between"><span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs capitalize text-gray-600">{creation.status}</span>{creation.published&&<span className="text-xs text-gray-500">Published</span>}</div>{creation.deploymentUrl&&<a href={creation.deploymentUrl} target="_blank" rel="noreferrer" className="mt-3 block truncate text-xs text-gray-600 underline">{creation.deploymentUrl}</a>}<div className="mt-5 grid grid-cols-2 gap-2"><button onClick={()=>navigate(`/mission/${creation.missionId}`)} className="action"><ExternalLink size={15}/>Open</button><button onClick={()=>openPublish(creation)} className="action"><Store size={15}/>Publish</button><button onClick={()=>deploy(creation)} className="action"><Rocket size={15}/>Deploy</button><button onClick={()=>void exportCreationZip(creation)} className="action"><Download size={15}/>ZIP</button></div></div></article>)}</div>:<Empty/>}
    {publishing&&<div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onMouseDown={()=>setPublishing(null)}><div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-sm" onMouseDown={e=>e.stopPropagation()}><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Publish creation</h2><button onClick={()=>setPublishing(null)} className="grid size-11 place-items-center rounded-lg hover:bg-gray-50"><X size={18}/></button></div><div className="mt-5 space-y-3"><input value={details.title} onChange={e=>setDetails({...details,title:e.target.value})} className="field" placeholder="Title"/><textarea value={details.description} onChange={e=>setDetails({...details,description:e.target.value})} className="field h-28 py-3" placeholder="Description"/><select value={details.category} onChange={e=>setDetails({...details,category:e.target.value})} className="field"><option>Web Apps</option><option>Business</option><option>Education</option><option>Commerce</option><option>Productivity</option></select><div className="grid grid-cols-2 gap-2"><button onClick={()=>setDetails({...details,priceType:'free',price:0})} className={`min-h-11 rounded-lg border ${details.priceType==='free'?'border-black bg-black text-white':'border-gray-300'}`}>Free</button><button onClick={()=>setDetails({...details,priceType:'paid'})} className={`min-h-11 rounded-lg border ${details.priceType==='paid'?'border-black bg-black text-white':'border-gray-300'}`}>Paid</button></div>{details.priceType==='paid'&&<input type="number" min="0" value={details.price} onChange={e=>setDetails({...details,price:Number(e.target.value)})} className="field" placeholder="Price"/>}</div><button onClick={publish} className="mt-5 min-h-12 w-full rounded-lg bg-black font-medium text-white">Publish to Marketplace</button></div></div>}
  </Page>
}

function Page({title,subtitle,children}:{title:string;subtitle:string;children:React.ReactNode}){return <div className="min-h-screen px-5 py-8 md:px-10 md:py-10"><div className="mx-auto max-w-6xl"><h1 className="text-xl font-semibold md:text-2xl">{title}</h1><p className="mt-2 text-sm text-gray-500">{subtitle}</p><div className="mt-7">{children}</div></div></div>}
function Empty(){return <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-gray-300 bg-white text-center"><div><h2 className="text-base font-semibold">No creations yet</h2><p className="mt-2 text-sm text-gray-500">Complete a mission build and it will appear here.</p></div></div>}
