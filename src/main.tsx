import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

const BUILD_ID = import.meta.env.VITE_BUILD_ID || 'dev'
console.log('AlphaTekX build:', BUILD_ID)

class ErrorBoundary extends React.Component<React.PropsWithChildren, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Alpha UI error:', error, info.componentStack)
  }
  render() {
    if (this.state.error) {
      return (
        <main className="grid min-h-screen place-items-center bg-white/[.04] p-6 text-white">
          <div className="max-w-md rounded-2xl border border-white/[.10] bg-white/[.04] p-8 text-center shadow-xl">
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
