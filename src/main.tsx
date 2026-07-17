import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

class ErrorBoundary extends React.Component<React.PropsWithChildren, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) return <main className="min-h-screen grid place-items-center bg-[#0A0A0A] p-6"><div className="liquid-glass max-w-lg rounded-2xl p-8 text-center"><h1 className="text-2xl font-bold text-white">This page needs a refresh</h1><p className="mt-3 text-white/65">An unexpected UI error occurred. Your app data was not changed.</p><button className="btn-alpha mt-6 rounded-full px-5 py-2.5 text-white" onClick={() => location.reload()}>Refresh</button></div></main>
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><BrowserRouter><App /></BrowserRouter></ErrorBoundary></React.StrictMode>)
