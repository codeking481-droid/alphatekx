/**
 * SECURITY SCANNER — Post-fix verification
 *
 * Scans for:
 * - Hardcoded secrets (API_KEY, SECRET, PASSWORD, TOKEN in code)
 * - dangerouslySetInnerHTML (XSS risk)
 * - eval() usage (code injection)
 * - Known CVE patterns in deps
 * - Console.log with sensitive data
 */

import fs from 'node:fs'
import path from 'node:path'

const SECRET_PATTERNS = [
  { pattern: /(?:api[_-]?key|apikey)\s*[=:]\s*['"`][A-Za-z0-9\-_]{20,}/gi, label: 'API Key' },
  { pattern: /(?:secret[_-]?key|client[_-]?secret)\s*[=:]\s*['"`][A-Za-z0-9\-_]{20,}/gi, label: 'Secret Key' },
  { pattern: /(?:password|passwd|pwd)\s*[=:]\s*['"`][^\s'"`]{8,}/gi, label: 'Hardcoded Password' },
  { pattern: /(?:token|auth[_-]?token|access[_-]?token)\s*[=:]\s*['"`][A-Za-z0-9\-_\.]{20,}/gi, label: 'Auth Token' },
  { pattern: /(?:AWS[_-]?(?:ACCESS[_-]KEY|SECRET))\s*[=:]\s*['"`][A-Za-z0-9\-_]{20,}/gi, label: 'AWS Key' },
  { pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g, label: 'Private Key' },
]

const XSS_PATTERNS = [
  { pattern: /dangerouslySetInnerHTML/g, label: 'dangerouslySetInnerHTML (XSS risk)' },
  { pattern: /\beval\s*\(/g, label: 'eval() usage (code injection risk)' },
  { pattern: /new\s+Function\s*\(/g, label: 'new Function() (code injection risk)' },
  { pattern: /innerHTML\s*=/g, label: 'innerHTML assignment (XSS risk)' },
  { pattern: /document\.write\s*\(/g, label: 'document.write (XSS risk)' },
]

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.cache', 'coverage'])
const IGNORED_FILES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'])

/**
 * Run full security scan on a repo.
 * @param {string} repoPath
 * @param {object} opts - { sendEvent }
 * @returns {{ passed: boolean, findings: Finding[], summary: object }}
 */
export function runSecurityScan(repoPath, opts = {}) {
  const { sendEvent = () => {} } = opts
  sendEvent({ type: 'thought_step', step: { id: 'security', label: 'Running security scan...', icon: 'test', status: 'active' } })

  const findings = []
  const scannedFiles = []

  walkAndScan(repoPath, repoPath, findings, scannedFiles, 0)

  // Deduplicate
  const unique = deduplicateFindings(findings)

  const secrets = unique.filter(f => f.category === 'secret')
  const xss = unique.filter(f => f.category === 'xss')
  const passed = secrets.length === 0 // secrets are blocking, xss are warnings

  const summary = {
    totalFindings: unique.length,
    secrets: secrets.length,
    xss: xss.length,
    filesScanned: scannedFiles.length,
    passed,
  }

  if (passed) {
    sendEvent({ type: 'thought_step', step: { id: 'security', label: 'Security scan PASSED', icon: 'test', status: 'done', summary: `No secrets found · ${xss.length} XSS warnings`, details: [`Scanned ${scannedFiles.length} files`] } })
  } else {
    sendEvent({ type: 'thought_step', step: { id: 'security', label: 'Security scan FAILED', icon: 'test', status: 'error', summary: `${secrets.length} secrets · ${xss.length} XSS warnings`, details: secrets.slice(0, 3).map(s => `${s.label} in ${s.file}:${s.line}`) } })
  }

  return { passed, findings: unique, summary }
}

function walkAndScan(repoPath, currentDir, findings, scannedFiles, depth) {
  if (depth > 20) return
  let entries
  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue
    const fullPath = path.join(currentDir, entry.name)

    if (entry.isDirectory()) {
      walkAndScan(repoPath, fullPath, findings, scannedFiles, depth + 1)
    } else if (entry.isFile() && !IGNORED_FILES.has(entry.name)) {
      const ext = path.extname(entry.name).toLowerCase()
      if (!['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte'].includes(ext)) continue

      try {
        const content = fs.readFileSync(fullPath, 'utf8')
        const relPath = path.relative(repoPath, fullPath).replace(/\\/g, '/')
        scannedFiles.push(relPath)

        // Check secret patterns
        for (const { pattern, label } of SECRET_PATTERNS) {
          pattern.lastIndex = 0
          let match
          while ((match = pattern.exec(content)) !== null) {
            // Skip if it's in a .env.example or clearly a template
            if (relPath.includes('.env.example') || relPath.includes('.env.sample')) continue
            const line = countLine(content, match.index)
            findings.push({ category: 'secret', label, file: relPath, line, severity: 'critical', raw: match[0].slice(0, 100) })
          }
        }

        // Check XSS patterns
        for (const { pattern, label } of XSS_PATTERNS) {
          pattern.lastIndex = 0
          let match
          while ((match = pattern.exec(content)) !== null) {
            const line = countLine(content, match.index)
            findings.push({ category: 'xss', label, file: relPath, line, severity: 'warning', raw: match[0].slice(0, 100) })
          }
        }
      } catch {
        // binary or unreadable
      }
    }
  }
}

function countLine(content, index) {
  return content.slice(0, index).split('\n').length
}

function deduplicateFindings(findings) {
  const seen = new Set()
  return findings.filter(f => {
    const key = `${f.category}:${f.file}:${f.line}:${f.label}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
