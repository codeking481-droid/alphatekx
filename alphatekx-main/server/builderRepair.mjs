const REACT_HOOKS = ['useState', 'useEffect', 'useMemo', 'useReducer', 'useRef', 'useCallback', 'useContext']

function componentName(code) {
  const fn = code.match(/function\s+([A-Z][A-Za-z0-9_]*)\s*\(/)
  const arrow = code.match(/const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*/)
  return fn?.[1] || arrow?.[1] || 'AlphaApp'
}

export function repairCode(code, log) {
  let fixed = String(code || '')
  const lower = log.toLowerCase()

  // Ensure a default export exists
  if (!/export\s+default\s+/.test(fixed)) {
    fixed += `\nexport default ${componentName(fixed)};\n`
  }

  // React is not defined / React is not in scope
  if (lower.includes('react is not defined') || lower.includes('react is not in scope') || lower.includes("cannot read properties of undefined (reading 'usestate')")) {
    const used = REACT_HOOKS.filter((h) => new RegExp(`\\b${h}\\b`).test(fixed))
    if (used.length && !/import\s+React\s*,\s*\{\s*[^}]*\}\s*from\s+['"]react['"]/.test(fixed)) {
      fixed = `import React, { ${used.join(', ')} } from 'react';\n${fixed}`
    } else if (!/import\s+React\b/.test(fixed)) {
      fixed = `import React from 'react';\n${fixed}`
    }
  }

  // React hook called at the top level (outside component)
  if (lower.includes('invalid hook call') || lower.includes('hooks can only be called inside the body')) {
    const topLevelHook = fixed.match(/^(\s*)const\s+\[([^\]]+)\]\s*=\s*(use[A-Z][a-zA-Z]+)\s*\(/m)
    if (topLevelHook) {
      const indent = topLevelHook[1]
      const decl = topLevelHook[0]
      const hook = topLevelHook[3]
      // Find the component function and insert the declaration right after the opening brace
      const compMatch = fixed.match(/(function\s+[A-Z][a-zA-Z0-9_]*\(\)\s*\{)/)
      if (compMatch) {
        fixed = fixed.replace(compMatch[0], `${compMatch[0]}\n${indent}const [${topLevelHook[2]}] = ${hook}(`)
        fixed = fixed.replace(decl, '')
      }
    }
  }

  // Remove stray script tags that sometimes leak in
  fixed = fixed.replace(/<script[^>]*>|<\/script>/gi, '')

  // HTML attribute fixes for JSX
  fixed = fixed.replace(/\bclass\s*=\s*"/g, 'className="')
  fixed = fixed.replace(/\bclass\s*=\s*\{/g, 'className={')
  fixed = fixed.replace(/\bfor\s*=\s*"/g, 'htmlFor="')

  // Replace React.useHook with useHook when the direct import is present
  for (const hook of REACT_HOOKS) {
    fixed = fixed.replace(new RegExp(`\\bReact\\.${hook}\\b`, 'g'), hook)
  }

  // Remove accidental ReactDOM.createRoot calls left in the component file
  fixed = fixed.replace(/ReactDOM\.createRoot\(document\.getElementById\(['"]root['"]\)\)\.render\s*\([\s\S]*?\)\s*;?/g, '')

  // Remove accidental default export duplicates
  const exportMatches = [...fixed.matchAll(/export\s+default\s+([A-Za-z0-9_]+)\s*;?/g)]
  if (exportMatches.length > 1) {
    const keep = exportMatches[exportMatches.length - 1][0]
    fixed = fixed.replace(/export\s+default\s+[A-Za-z0-9_]+\s*;?/g, '')
    fixed += `\n${keep}\n`
  }

  return fixed
}

export function canRepair(log) {
  const l = log.toLowerCase()
  const repairable = [
    'react is not defined',
    'react is not in scope',
    'invalid hook call',
    'hooks can only be called inside the body',
    'cannot read properties of undefined',
    'is not defined',
    'is not a function',
    'cannot read',
  ]
  return repairable.some((p) => l.includes(p))
}
