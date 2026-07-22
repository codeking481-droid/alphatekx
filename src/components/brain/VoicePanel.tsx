import { useEffect, useRef, useState } from 'react'
import { Mic, Pause, Play, Square, Volume2, VolumeX, Loader2, AlertCircle, Languages } from 'lucide-react'
import { postJson } from '../../lib/apiClient'

interface Props {
  user?: { email?: string } | null
}

type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: any) => void) | null
  onerror: ((event: any) => void) | null
  onend: (() => void) | null
}

function getRecognition(): Recognition | null {
  const win = window as any
  const ctor = win.SpeechRecognition || win.webkitSpeechRecognition
  if (!ctor) return null
  const r = new ctor() as Recognition
  r.continuous = true
  r.interimResults = true
  return r
}

export default function VoicePanel({ user }: Props) {
  const [recording, setRecording] = useState(false)
  const [paused, setPaused] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interim, setInterim] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [language, setLanguage] = useState('en-US')
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null)
  const [speaking, setSpeaking] = useState(false)
  const recognitionRef = useRef<Recognition | null>(null)
  const finalRef = useRef('')

  useEffect(() => {
    const synth = window.speechSynthesis
    const loadVoices = () => setVoices(synth.getVoices())
    loadVoices()
    if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = loadVoices
    return () => { if (synth.onvoiceschanged === loadVoices) synth.onvoiceschanged = null }
  }, [])

  useEffect(() => {
    if (!recording) return
    const r = getRecognition()
    if (!r) { setError('Speech recognition is not supported in this browser.'); setRecording(false); return }
    recognitionRef.current = r
    r.lang = language
    finalRef.current = transcript
    r.onresult = (event: any) => {
      let final = finalRef.current
      let interimText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) final += t
        else interimText += t
      }
      finalRef.current = final
      setTranscript(final)
      setInterim(interimText)
    }
    r.onerror = (event: any) => {
      if (event.error === 'not-allowed') setError('Microphone permission denied.')
      else if (event.error === 'no-speech') setError('No speech detected.')
      else if (event.error === 'network') setError('Network error. Try again.')
      else setError(`Speech error: ${event.error}`)
      setRecording(false)
      setPaused(false)
    }
    r.onend = () => { if (recording && !paused) setRecording(false) }
    try { r.start() } catch {}
    return () => { try { r.abort() } catch {} }
  }, [recording, language, paused, transcript])

  const start = async () => {
    setError(''); setInterim(''); setResult(null)
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true })
      setRecording(true)
    } catch { setError('Microphone access denied or no microphone found.') }
  }

  const stop = () => {
    setRecording(false); setPaused(false)
    recognitionRef.current && (recognitionRef.current.onend = null)
    try { recognitionRef.current?.stop() } catch {}
  }

  const pause = () => {
    setPaused(true)
    try { recognitionRef.current?.stop() } catch {}
  }

  const resume = () => {
    setPaused(false)
    setRecording(true)
  }

  const cancel = () => {
    setRecording(false); setPaused(false); setTranscript(''); setInterim('')
    try { recognitionRef.current?.abort() } catch {}
  }

  const send = async () => {
    if (!transcript.trim()) return
    setBusy(true); setError(''); setResult(null)
    try {
      const data = await postJson<Record<string, unknown>>('/api/brain/voice', { transcript: transcript.trim() })
      setResult(data)
    } catch (err: any) { setError(err.message || 'Voice processing failed.') }
    finally { setBusy(false) }
  }

  const speak = (text: string) => {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    if (voice) u.voice = voice
    u.lang = language
    u.onstart = () => setSpeaking(true)
    u.onend = () => setSpeaking(false)
    u.onerror = () => setSpeaking(false)
    window.speechSynthesis.speak(u)
  }

  const stopSpeaking = () => {
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }

  const answerText = result && (typeof result.answer === 'string' ? result.answer : typeof result.command === 'string' ? result.command : JSON.stringify(result, null, 2))

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.05] p-5">
      <h2 className="flex items-center gap-2 text-lg font-medium"><Mic size={18} className="text-indigo-400"/>Voice to Action</h2>
      <p className="mt-1 text-sm text-white/55">Speak to Alpha. It will transcribe, process, and respond.</p>

      {error && <div className="mt-4 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200"><AlertCircle size={16}/>{error}</div>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!recording && !paused && (
          <button onClick={start} disabled={busy} className="btn-alpha flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm text-white disabled:opacity-50"><Mic size={16}/> Start recording</button>
        )}
        {recording && (
          <>
            <span className="flex h-3 w-3 rounded-full bg-red-500 animate-pulse" />
            <button onClick={pause} className="flex min-h-11 items-center gap-2 rounded-xl border border-white/[.15] px-4 text-sm transition hover:bg-white/[0.06]"><Pause size={16}/> Pause</button>
            <button onClick={stop} className="flex min-h-11 items-center gap-2 rounded-xl border border-white/[.15] px-4 text-sm transition hover:bg-white/[0.06]"><Square size={16} className="fill-current"/> Stop</button>
            <button onClick={cancel} className="flex min-h-11 items-center gap-2 rounded-xl border border-white/[.15] px-4 text-sm transition hover:bg-rose-500/10 hover:border-rose-500/30"><VolumeX size={16}/> Cancel</button>
          </>
        )}
        {paused && (
          <>
            <button onClick={resume} className="btn-alpha flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm text-white"><Play size={16}/> Resume</button>
            <button onClick={stop} className="flex min-h-11 items-center gap-2 rounded-xl border border-white/[.15] px-4 text-sm transition hover:bg-white/[0.06]"><Square size={16} className="fill-current"/> Finish</button>
          </>
        )}
        {transcript && !recording && !busy && (
          <button onClick={send} disabled={busy} className="flex min-h-11 items-center gap-2 rounded-xl border border-white/[.15] px-4 text-sm transition hover:bg-white/[0.06] disabled:opacity-50">{busy ? <Loader2 className="animate-spin" size={16}/> : 'Send to Alpha'}</button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Languages size={14} className="text-white/40" />
          <select value={language} onChange={e => setLanguage(e.target.value)} className="rounded-lg border border-white/[.12] bg-black/20 px-2 py-1 text-sm outline-none">
            <option value="en-US">English (US)</option>
            <option value="en-GB">English (UK)</option>
            <option value="es-ES">Spanish</option>
            <option value="fr-FR">French</option>
            <option value="de-DE">German</option>
            <option value="pt-BR">Portuguese</option>
            <option value="zh-CN">Chinese</option>
            <option value="yo-NG">Yoruba</option>
            <option value="ig-NG">Igbo</option>
            <option value="ha-NG">Hausa</option>
          </select>
        </div>
      </div>

      <div className="mt-4 min-h-[120px] rounded-xl border border-white/10 bg-black/20 p-4 text-sm">
        {transcript || interim ? (
          <p className="whitespace-pre-wrap">{transcript}<span className="text-white/40">{interim}</span></p>
        ) : (
          <p className="text-white/40">Your speech will appear here...</p>
        )}
      </div>

      {result && (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4 text-sm">
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap">{answerText}</pre>
          <div className="mt-3 flex gap-2">
            <button onClick={() => answerText && speak(answerText)} disabled={speaking} className="flex min-h-9 items-center gap-2 rounded-lg border border-white/[.12] px-3 text-xs transition hover:bg-white/[0.06] disabled:opacity-50">{speaking ? <VolumeX size={14}/> : <Volume2 size={14}/>} {speaking ? 'Speaking...' : 'Read aloud'}</button>
            {speaking && <button onClick={stopSpeaking} className="flex min-h-9 items-center gap-2 rounded-lg border border-white/[.12] px-3 text-xs transition hover:bg-white/[0.06]"><Square size={14} className="fill-current"/> Stop</button>}
          </div>
        </div>
      )}

      {voices.length > 0 && (
        <div className="mt-4 flex items-center gap-2 text-xs text-white/55">
          <span>Voice:</span>
          <select value={voice?.name || ''} onChange={e => setVoice(voices.find(v => v.name === e.target.value) || null)} className="rounded border border-white/[.12] bg-black/20 px-2 py-1 text-xs outline-none">
            <option value="">Default</option>
            {voices.map(v => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
          </select>
        </div>
      )}
    </section>
  )
}
