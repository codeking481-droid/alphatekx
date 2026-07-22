import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './alpha-ui'
import './alpha-api'

function report(type, detail) {
  try {
    if (window.parent !== window) {
      window.parent.postMessage({ type, source: 'alphatekx-preview', detail }, '*')
    }
  } catch {}
}

window.addEventListener('error', (event) => {
  report('alphatekx:preview-runtime-error', String(event.message))
})

window.addEventListener('unhandledrejection', (event) => {
  report('alphatekx:preview-runtime-error', String(event.reason))
})

try {
  ReactDOM.createRoot(document.getElementById('root')).render(<App />)
  report('alphatekx:preview-mounted', { ok: true })
} catch (error) {
  report('alphatekx:preview-runtime-error', String(error instanceof Error ? error.message : error))
  const root = document.getElementById('root')
  if (root) {
    root.innerHTML = '<div style="padding:24px;color:#991b1b;background:#fef2f2;font-family:system-ui">This app could not start.<br>' + String(error instanceof Error ? error.message : error).replace(/[&<>]/g, (v) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[v])) + '</div>'
  }
}
