import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

const BUILD_ID = import.meta.env.VITE_BUILD_ID || 'dev'
console.log('AlphaTekX build:', BUILD_ID)

const staleChunkReloadKey = `alphatekx:chunk-reload:${BUILD_ID}`
function recoverFromStaleDeploymentChunk() {
  try {
    if (sessionStorage.getItem(staleChunkReloadKey)) return false
    sessionStorage.setItem(staleChunkReloadKey, new Date().toISOString())
  } catch {
    // A blocked sessionStorage must not prevent recovery.
  }
  window.location.reload()
  return true
}

window.addEventListener('vite:preloadError', event => {
  event.preventDefault()
  recoverFromStaleDeploymentChunk()
})

class ErrorBoundary extends React.Component<React.PropsWithChildren, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Alpha UI error:', error, info.componentStack)
    if (/failed to fetch dynamically imported module|loading chunk|chunkloaderror/i.test(String(error?.message || error))) {
      recoverFromStaleDeploymentChunk()
    }
  }
  render() {
    if (this.state.error) {
      return (
        <main className="grid min-h-screen place-items-center bg-violet-500/10 p-6 text-white">
          <div className="max-w-md rounded-2xl border border-violet-400/20 bg-violet-500/10 p-8 text-center shadow-xl">
            <p className="text-lg font-black">Something went wrong. Please refresh.</p>
            <p className="mt-2 text-sm font-semibold text-slate-400">Your work is still safe.</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-5 rounded-xl bg-[#6D28D9] px-5 py-3 text-sm font-black text-white transition hover:bg-[#5B21B6]"
            >
              Refresh AlphaTekx
            </button>
          </div>
        </main>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
)
