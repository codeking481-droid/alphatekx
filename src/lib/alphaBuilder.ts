import { spendCredits } from './creditStore'
import { addActivity, buildMemoryContext, completeMission, saveCreation, updateMissionProgress } from './missionStore'
import type { Creation, Mission } from './types'
import { postJson } from './apiClient'

const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds))

export function extractCode(value: string) {
  const blocks = [...value.matchAll(/```(?:tsx|jsx|javascript|js)?\s*([\s\S]*?)```/gi)]
  const fenced = blocks.find(match => /function\s+AlphaApp|const\s+AlphaApp/.test(match[1]))?.[1] ?? blocks[0]?.[1] ?? value
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

export function validateGeneratedApp(code: string) {
  const errors: string[] = []
  if (!/function\s+[A-Z]|const\s+[A-Z][A-Za-z0-9_]*\s*=/.test(code)) errors.push('missing a React component')
  if (!/createRoot\(/.test(code)) errors.push('missing a render entry')
  if (!/useState|useReducer/.test(code)) errors.push('missing application state')
  if (!/onClick|onSubmit|onChange/.test(code)) errors.push('missing working interactions')
  if (/\bTODO\b|coming soon|onClick=\{\(\)\s*=>\s*\{?\s*\}?\}/i.test(code)) errors.push('contains unfinished or dead functionality')
  if (/^\s*import\s|^\s*export\s/m.test(code)) errors.push('contains unsupported module syntax')
  if (!/ReactDOM\.createRoot\(document\.getElementById\(['"]root['"]\)\)\.render\(/.test(code)) errors.push('missing a valid preview mount')
  if (!/[})];?\s*$/.test(code)) errors.push('appears truncated')
  return errors
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
    const contract = `You are the AlphaTekX senior product engineering team. First infer the exact product type and its core user journey. User wants: ${mission.goal}. User memory: ${memory} Adapt accordingly.${mentorMode}${businessMode} Generate one self-contained React component using Tailwind only. Return ONLY code. Build the requested product, never a generic dashboard. Use realistic domain content. Every button and form must work. Include validation, loading, error and empty states, responsive mobile layout, accessible labels, and localStorage persistence where data should survive refresh. Do not import packages, use undefined icons, include TODOs, or claim external actions succeeded.`
    let validationErrors: string[] = []
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const payload = await postJson<{ code?: string; response?: string }>('/api/alpha', { mode: 'builder', missionId: mission.id, prompt: attempt === 0 ? contract : `${contract}\nThe previous build was rejected because it was ${validationErrors.join(', ')}. Rebuild from scratch and fix every issue.` }, { timeoutMs: 120_000 })
      code = extractCode(String(payload.code || payload.response || ''))
      validationErrors = validateGeneratedApp(code)
      if (validationErrors.length === 0) break
      addActivity(mission.id, `[QA Tester] Repairing: ${validationErrors.join(', ')}...`)
    }
    if (validationErrors.length) throw new Error(`Generated app failed verification: ${validationErrors.join(', ')}`)
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
