import { useEffect, useState } from 'react'
import { CheckCircle2, Eye, EyeOff, KeyRound, LoaderCircle, PlugZap, ShieldCheck, Trash2 } from 'lucide-react'
import { emptyProviderStatus, emptyUserKeys, getUserKeyStatus, removeUserKey, saveUserKeys, testUserKey, type ProviderName, type ProviderStatus, type UserKeys } from '../lib/userSettings'

const fields: { name: ProviderName; label: string; placeholder: string; testable: boolean }[] = [
  { name: 'openai', label: 'OpenAI API key', placeholder: 'sk-...', testable: true },
  { name: 'groq', label: 'Groq API key', placeholder: 'gsk_...', testable: true },
  { name: 'anthropic', label: 'Anthropic API key', placeholder: 'sk-ant-...', testable: true },
  { name: 'gemini', label: 'Gemini API key', placeholder: 'AIza...', testable: true },
  { name: 'supabase', label: 'Supabase service key', placeholder: 'eyJ...', testable: false },
  { name: 'paystack', label: 'Paystack secret key', placeholder: 'sk_live_...', testable: false },
]

export default function ApiKeys() {
  const [drafts, setDrafts] = useState<UserKeys>({ ...emptyUserKeys })
  const [status, setStatus] = useState<ProviderStatus>(emptyProviderStatus)
  const [visible, setVisible] = useState<Partial<Record<ProviderName, boolean>>>({})
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<ProviderName | null>(null)

  useEffect(() => {
    void getUserKeyStatus().then(setStatus).catch(error => setNotice(error instanceof Error ? error.message : 'Could not load keys.')).finally(() => setLoading(false))
  }, [])

  const save = async () => {
    const changes = Object.fromEntries(Object.entries(drafts).filter(([, value]) => value.trim())) as Partial<UserKeys>
    if (!Object.keys(changes).length) return setNotice('Enter a new key before saving. Existing keys are unchanged.')
    setSaving(true); setNotice('')
    try {
      setStatus(await saveUserKeys(changes))
      setDrafts({ ...emptyUserKeys })
      setNotice('Keys encrypted and saved. AlphaTekX never sends them back to your browser.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Save failed.') }
    finally { setSaving(false) }
  }

  const remove = async (provider: ProviderName) => {
    setNotice('')
    try { setStatus(await removeUserKey(provider)); setNotice(`${provider.toUpperCase()} key removed.`) }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Remove failed.') }
  }

  const test = async (provider: ProviderName) => {
    setTesting(provider); setNotice('')
    try { await testUserKey(provider); setNotice(`${provider.toUpperCase()} connected successfully.`) }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Connection test failed.') }
    finally { setTesting(null) }
  }

  return <main className="mx-auto max-w-3xl px-5 py-10">
    <header className="flex items-center gap-3"><KeyRound/><div><h1 className="text-xl font-semibold">API keys</h1><p className="text-sm text-white/55">Connect private provider keys for your AI workers.</p></div></header>
    <section className="mt-7 rounded-xl border border-white/[.12] liquid-glass p-5 shadow-sm sm:p-6">
      <div className="mb-6 flex gap-3 rounded-lg bg-white/[.04] p-4 text-sm text-white/70"><ShieldCheck className="mt-0.5 shrink-0" size={18}/><p>Keys are encrypted on the AlphaTekX server before storage. Saved values are masked and cannot be read back from this screen.</p></div>
      {loading ? <div className="grid min-h-48 place-items-center"><LoaderCircle className="animate-spin"/></div> : <div className="divide-y divide-gray-100">{fields.map(field => {
        const saved = status[field.name]
        return <div key={field.name} className="py-5 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-medium">{field.label}</p>{saved.configured ? <p className="mt-1 flex items-center gap-1.5 text-xs text-green-700"><CheckCircle2 size={14}/>Saved as {saved.masked}</p> : <p className="mt-1 text-xs text-white/55">Not connected</p>}</div>
            {saved.configured && <div className="flex gap-1">{field.testable && <button type="button" onClick={() => void test(field.name)} disabled={testing === field.name} className="flex min-h-11 items-center gap-2 rounded-lg border border-white/[.15] px-3 text-xs disabled:opacity-50">{testing === field.name ? <LoaderCircle className="animate-spin" size={15}/> : <PlugZap size={15}/>}Test</button>}<button type="button" onClick={() => void remove(field.name)} className="grid size-11 place-items-center rounded-lg border border-white/[.15]" aria-label={`Remove ${field.label}`}><Trash2 size={16}/></button></div>}
          </div>
          <div className="mt-3 flex rounded-lg border border-white/[.15] focus-within:border-[#E56B2D]"><input type={visible[field.name] ? 'text' : 'password'} autoComplete="off" value={drafts[field.name]} onChange={event => setDrafts({ ...drafts, [field.name]: event.target.value })} className="min-h-12 min-w-0 flex-1 rounded-l-lg px-3 outline-none" placeholder={saved.configured ? 'Enter a replacement key' : field.placeholder}/><button onClick={() => setVisible({ ...visible, [field.name]: !visible[field.name] })} className="grid size-12 place-items-center" type="button" aria-label={`${visible[field.name] ? 'Hide' : 'Show'} ${field.label}`}>{visible[field.name] ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div>
        </div>
      })}</div>}
      {notice && <p role="status" className="mt-5 rounded-lg bg-white/[.04] p-3 text-sm text-white/80">{notice}</p>}
      <button onClick={() => void save()} disabled={saving || loading} className="mt-6 min-h-12 w-full rounded-lg btn-alpha font-medium text-white disabled:opacity-50">{saving ? 'Encrypting and saving...' : 'Save new keys'}</button>
    </section>
  </main>
}
