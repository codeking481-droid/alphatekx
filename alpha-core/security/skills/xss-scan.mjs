/**
 * XSS SCAN — Find cross-site scripting vulnerabilities
 */

import fs from 'node:fs'
import path from 'node:path'

const XSS_PATTERNS = [
  { pattern: /dangerouslySetInnerHTML/g, label: 'dangerouslySetInnerHTML (XSS risk)', risk: 'high' },
  { pattern: /\beval\s*\(/g, label: 'eval() — code injection risk', risk: 'high' },
  { pattern: /new\s+Function\s*\(/g, label: 'new Function() — code injection risk', risk: 'high' },
  { pattern: /\.innerHTML\s*=/g, label: 'innerHTML assignment — XSS risk', risk: 'high' },
  { pattern: /\.outerHTML\s*=/g, label: 'outerHTML assignment — XSS risk', risk: 'high' },
  { pattern: /document\.write\s*\(/g, label: 'document.write — XSS risk', risk: 'medium' },
  { pattern: /document\.writeln\s*\(/g, label: 'document.writeln — XSS risk', risk: 'medium' },
  { pattern: /\.insertAdjacentHTML\s*\(/g, label: 'insertAdjacentHTML — XSS risk', risk: 'medium' },
  { pattern: /__html\s*:/g, label: '__html prop (dangerouslySetInnerHTML) — XSS risk', risk: 'high' },
]

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.cache', 'coverage'])
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte'])

function countLine(content, index) {
  return content.slice(0, index).split('\n').length
}

export function xssScan(repoPath) {
  const findings = []
  const seen = new Set()

  function walk(dir, depth) {
    if (depth > 15) return
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }

    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        walk(fullPath, depth + 1)
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (!SCAN_EXTENSIONS.has(ext)) continue

        try {
          const content = fs.readFileSync(fullPath, 'utf8')
          const relPath = path.relative(repoPath, fullPath).replace(/\\/g, '/')

          for (const { pattern, label, risk } of XSS_PATTERNS) {
            pattern.lastIndex = 0
            let match
            while ((match = pattern.exec(content)) !== null) {
              const line = countLine(content, match.index)
              const key = `${label}:${relPath}:${line}`
              if (seen.has(key)) continue
              seen.add(key)
              findings.push({ type: 'xss', label, file: relPath, line, risk, raw: match[0].slice(0, 80) })
            }
          }
        } catch {}
      }
    }
  }

  walk(repoPath, 0)
  return findings
}
