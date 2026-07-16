import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

class ErrorBoundary extends React.Component<React.PropsWithChildren, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) return <main className="min-h-screen grid place-items-center bg-[#F8F9FF] p-6"><div className="glass max-w-lg p-8 text-center"><h1 className="text-2xl font-bold text-slate-900">This page needs a refresh</h1><p className="mt-3 text-slate-600">An unexpected UI error occurred. Your app data was not changed.</p><button className="mt-6 rounded-full bg-blue-600 px-5 py-2.5 text-white" onClick={() => location.reload()}>Refresh</button></div></main>
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><BrowserRouter><App /></BrowserRouter></ErrorBoundary></React.StrictMode>)
