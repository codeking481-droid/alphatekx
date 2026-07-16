import { useEffect, useState } from 'react'
import { Eye, EyeOff, KeyRound } from 'lucide-react'
import { getUserKeys, saveUserKeys, type UserKeys } from '../lib/userSettings'

const fields: [keyof UserKeys, string, string][] = [
  ['openai', 'OpenAI API key', 'sk-...'],
  ['groq', 'Groq API key', 'gsk_...'],
  ['anthropic', 'Anthropic API key', 'sk-ant-...'],
  ['gemini', 'Gemini API key', 'AIza...'],
  ['supabase', 'Supabase service key', 'eyJ...'],
  ['paystack', 'Paystack secret key', 'sk_live_...'],
]

const emptyKeys: UserKeys = { openai: '', groq: '', anthropic: '', gemini: '', supabase: '', paystack: '' }

export default function ApiKeys() {
  const [keys, setKeys] = useState<UserKeys>(emptyKeys)
  const [visible, setVisible] = useState<Record<string, boolean>>({})
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { void getUserKeys().then(setKeys).catch(error => setNotice(error.message)) }, [])
  const save = async () => {
    setSaving(true); setNotice('')
    try { await saveUserKeys(keys); setNotice('Keys saved to your private Supabase settings.') }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Save failed') }
    finally { setSaving(false) }
  }
  return <div className="mx-auto max-w-2xl px-5 py-10"><div className="flex items-center gap-3"><KeyRound/><div><h1 className="text-xl font-semibold">API keys</h1><p className="text-sm text-gray-500">Connect your own AI providers and services.</p></div></div><div className="mt-7 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"><p className="mb-5 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">Keys are private through Supabase RLS. Current storage is encoded, not cryptographically encrypted; use restricted keys and rotate them regularly.</p><div className="space-y-5">{fields.map(([name,label,placeholder])=><label key={name} className="block"><span className="text-sm font-medium">{label}</span><div className="mt-2 flex rounded-lg border border-gray-300"><input type={visible[name]?'text':'password'} value={keys[name]} onChange={event=>setKeys({...keys,[name]:event.target.value})} className="min-h-12 min-w-0 flex-1 px-3 outline-none" placeholder={placeholder}/><button onClick={()=>setVisible({...visible,[name]:!visible[name]})} className="grid size-12 place-items-center" type="button" aria-label={`Show ${label}`}>{visible[name]?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></label>)}</div>{notice&&<p className="mt-4 text-sm text-gray-600">{notice}</p>}<button onClick={()=>void save()} disabled={saving} className="mt-6 min-h-12 w-full rounded-lg bg-black font-medium text-white disabled:opacity-50">{saving?'Saving...':'Save keys'}</button></div></div>
}
