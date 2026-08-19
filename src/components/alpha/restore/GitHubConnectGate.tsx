/**
 * GitHubConnectGate — shown after experiment passes, before push
 *
 * Requires user to:
 * 1. Connect GitHub OAuth
 * 2. Read warning about which repo to connect
 * 3. Check confirmation checkbox
 * 4. Select target repo
 * 5. Then enable push button
 */

import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, Github, CheckCircle2, Shield, ArrowRight } from 'lucide-react'

export default function GitHubConnectGate({ scanId, onConnected, sendEvent }) {
  const [connected, setConnected] = useState(false)
  const [repos, setRepos] = useState([])
  const [selectedRepo, setSelectedRepo] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    checkConnection()
  }, [])

  const checkConnection = async () => {
    try {
      const res = await fetch('/api/github/status')
      const data = await res.json()
      if (data.connected) {
        setConnected(true)
        loadRepos()
        sendEvent?.({ type: 'thought_step', step: { id: 'github-status', label: 'GitHub connected', icon: 'plan', status: 'done', summary: `Authenticated as ${data.login || 'user'}` } })
      }
    } catch {}
  }

  const loadRepos = async () => {
    try {
      const res = await fetch('/api/github/repos')
      const data = await res.json()
      setRepos(data.repos || [])
    } catch {}
  }

  const handleConnect = () => {
    window.open('/api/github/connect', '_blank', 'width=600,height=700')
    // Poll for connection
    const poll = setInterval(() => {
      checkConnection().then(() => {
        clearInterval(poll)
      })
    }, 2000)
    setTimeout(() => clearInterval(poll), 60000)
  }

  const handlePush = async () => {
    if (!selectedRepo || !confirmed) return
    setLoading(true)
    sendEvent?.({ type: 'thought_step', step: { id: 'github-push', label: 'Pushing fix to GitHub...', icon: 'plan', status: 'active' } })
    try {
      onConnected?.({ repoFullName: selectedRepo, scanId })
    } catch (err) {
      sendEvent?.({ type: 'thought_step', step: { id: 'github-push', label: 'Push failed', icon: 'plan', status: 'error', summary: err.message } })
    }
    setLoading(false)
  }

  if (!connected) {
    return (
      <div className="rounded-2xl border border-[#D6FF00]/20 bg-[#D6FF00]/[0.03] p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex size-10 items-center justify-center rounded-xl bg-[#D6FF00]/10">
            <Github size={20} className="text-[#D6FF00]" />
          </div>
          <div>
            <h3 className="font-syne text-sm font-bold text-white">Connect GitHub to apply fix</h3>
            <p className="text-[11px] text-white/40">OAuth — no password needed</p>
          </div>
        </div>
        <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" />
            <p className="text-[12px] leading-relaxed text-amber-200/80">
              <strong>Warning:</strong> Make sure the GitHub account you connect holds your <strong>FULL website repository</strong>.
              We will create branch <code className="rounded bg-white/10 px-1 py-0.5 text-[11px]">alphatekx/fix-xxx</code> — we will <strong>NOT</strong> push to main.
            </p>
          </div>
        </div>
        <button onClick={handleConnect} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#D6FF00] px-4 py-3 text-[13px] font-bold text-black transition hover:bg-[#C2E600]">
          <Github size={16} />
          Connect GitHub Account
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-[#D6FF00]/20 bg-[#D6FF00]/[0.03] p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10">
          <CheckCircle2 size={20} className="text-emerald-400" />
        </div>
        <div>
          <h3 className="font-syne text-sm font-bold text-white">GitHub Connected</h3>
          <p className="text-[11px] text-white/40">Select your website repository</p>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" />
          <p className="text-[12px] leading-relaxed text-amber-200/80">
            <strong>Warning:</strong> Make sure you select the repo holding your <strong>FULL website</strong> — not just a component or API folder.
            We will push to branch <code className="rounded bg-white/10 px-1 py-0.5 text-[11px]">alphatekx/fix-xxx</code> only.
          </p>
        </div>
      </div>

      <div className="mb-3 max-h-48 overflow-y-auto rounded-xl border border-white/[0.06] bg-white/[0.02]">
        {repos.map(repo => (
          <button
            key={repo.full_name}
            onClick={() => setSelectedRepo(repo.full_name)}
            className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
              selectedRepo === repo.full_name ? 'bg-[#D6FF00]/[0.08]' : 'hover:bg-white/[0.02]'
            }`}
          >
            <Github size={14} className={selectedRepo === repo.full_name ? 'text-[#D6FF00]' : 'text-white/30'} />
            <div className="min-w-0 flex-1">
              <p className={`truncate text-[12px] font-semibold ${selectedRepo === repo.full_name ? 'text-[#D6FF00]' : 'text-white/70'}`}>
                {repo.full_name}
              </p>
              {repo.description && <p className="mt-0.5 truncate text-[10px] text-white/30">{repo.description}</p>}
            </div>
            {selectedRepo === repo.full_name && <CheckCircle2 size={14} className="shrink-0 text-[#D6FF00]" />}
          </button>
        ))}
        {repos.length === 0 && <p className="px-4 py-6 text-center text-[12px] text-white/20">No repos found</p>}
      </div>

      <label className="mb-4 flex items-start gap-3 cursor-pointer rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition hover:bg-white/[0.04]">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={e => setConfirmed(e.target.checked)}
          disabled={!selectedRepo}
          className="mt-0.5 size-4 accent-[#D6FF00]"
        />
        <span className="text-[12px] text-white/60">
          I confirm <strong className="text-white/80">{selectedRepo || '...'}</strong> is my full website repository and I want to apply this fix.
        </span>
      </label>

      <button
        onClick={handlePush}
        disabled={!selectedRepo || !confirmed || loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#D6FF00] px-4 py-3 text-[13px] font-bold text-black transition hover:bg-[#C2E600] disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Shield size={14} />
        {loading ? 'Pushing...' : 'Apply Fix & Create PR'}
        <ArrowRight size={14} />
      </button>
    </div>
  )
}
