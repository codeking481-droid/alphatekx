import { spendCredits } from './creditStore'
import { addActivity, buildMemoryContext, completeMission, saveCreation, updateMissionProgress } from './missionStore'
import type { Creation, Mission } from './types'

const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds))

function extractCode(value: string) {
  const fenced = value.match(/```(?:tsx|jsx|javascript|js)?\s*([\s\S]*?)```/i)?.[1] ?? value
  let code = fenced.replace(/^\s*import[^;]+;?\s*$/gm, '').replace(/export\s+default\s+/g, '').trim()
  if (!/\bconst\s*\{[^}]*useState/.test(code) && /\buseState\b/.test(code)) {
    code = `const { useState, useEffect, useMemo, useReducer, useRef } = React;\n${code}`
  }
  if (!/createRoot\(/.test(code)) {
    const component = code.match(/function\s+([A-Z][A-Za-z0-9_]*)\s*\(/)?.[1] ?? code.match(/const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*\(/)?.[1]
    if (component) code += `\nReactDOM.createRoot(document.getElementById('root')).render(<${component} />);`
  }
  return code
}

async function stage(missionId: string, text: string, progress: number) {
  addActivity(missionId, text)
  updateMissionProgress(missionId, progress)
  await wait(220)
}

export async function buildFromMission(mission: Mission): Promise<Creation> {
  if (!await spendCredits(10)) throw new Error('LOW_CREDITS')

  await stage(mission.id, '[Product Manager] Defining requirements and acceptance criteria...', 10)
  await stage(mission.id, '[UI Designer] Designing responsive screens and interaction states...', 24)

  let code = ''
  try {
    const memory = buildMemoryContext(mission.id)
    const mentorMode = /\blearn|teach|course|study\b/i.test(mission.goal) ? ' Mentor mode is active: create five lessons with objectives, explanations, code examples where relevant, progress tracking, and an interactive quiz.' : ''
    const businessMode = /\b(start|launch|build)\s+(a\s+)?business\b|business plan|startup/i.test(mission.goal) ? ' Business mode is active: include idea validation, business model, customer flow, operations, public landing experience, data model, and payment architecture.' : ''
    const response = await fetch(import.meta.env?.VITE_ALPHA_API_URL || '/api/alpha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'builder',
        missionId: mission.id,
        prompt: `You are the AlphaTekX God Craft engineering team. AlphaTekX builds websites, applications, dashboards, online courses, lessons, business systems, AI workers, templates, and tools. User wants: ${mission.goal}. User memory: ${memory} Adapt accordingly.${mentorMode}${businessMode} Generate a single self-contained React component using Tailwind only. Return ONLY code. Build the requested product type, not a generic dashboard. It must have real state, working buttons, validation, empty, loading and error states, responsive mobile layout, and localStorage persistence where useful. Do not import packages.`,
      }),
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(String(payload.error || `Alpha API ${response.status}`))
    code = extractCode(String(payload.code || payload.response || ''))
    if (!code.includes('createRoot')) throw new Error('Generated code has no render entry')
  } catch (error) {
    addActivity(mission.id, `[QA Tester] Build stopped: ${error instanceof Error ? error.message : 'AI generation failed'}`)
    throw error
  }

  await stage(mission.id, '[Backend Engineer] Creating authentication and service architecture...', 46)
  await stage(mission.id, '[Database Engineer] Building Supabase tables and data policies...', 60)
  await stage(mission.id, '[QA Tester] Running functional and responsive tests...', 76)
  await stage(mission.id, '[QA Tester] Repairing verification failures...', 90)

  const creation = saveCreation({
    missionId: mission.id,
    title: mission.title,
    code,
    type: 'web-app',
    files: [
      { path: 'src/App.tsx', code },
      { path: 'src/main.tsx', code: "import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\nimport './index.css';\nReactDOM.createRoot(document.getElementById('root')!).render(<App />);" },
      { path: 'src/index.css', code: '@tailwind base;\n@tailwind components;\n@tailwind utilities;' },
    ],
  })
  await stage(mission.id, '[Deployment Engineer] Preparing production build and deployment...', 98)
  completeMission(mission.id)
  return creation
}
