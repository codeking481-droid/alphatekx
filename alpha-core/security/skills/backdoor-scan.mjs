/**
 * BACKDOOR SCAN — Find hidden backdoors and suspicious code
 */

import fs from 'node:fs'
import path from 'node:path'

const SUSPICIOUS_FILES = [
  'api/debug.js', 'api/debug.ts', 'api/test.js', 'api/internal.js',
  'debug.js', 'debug.ts', 'shell.js', 'exec.js', 'admin.js', 'admin.ts',
  'backdoor.js', 'inject.js', 'payload.js',
]

const BACKDOOR_PATTERNS = [
  { pattern: /child_process/g, label: 'child_process usage — OS command execution', risk: 'high' },
  { pattern: /\bexec\s*\(\s*['"`]/g, label: 'exec() with string command — command injection', risk: 'high' },
  { pattern: /\bexecSync\s*\(/g, label: 'execSync() — synchronous OS command', risk: 'high' },
  { pattern: /\bspawn\s*\(/g, label: 'spawn() — process creation', risk: 'medium' },
  { pattern: /['"`]([A-Za-z0-9+/]{80,}={0,2})['"`]/g, label: 'Large base64 string — possible payload', risk: 'high' },
  { pattern: /\beval\s*\(\s*(?:atob|btoa|Buffer\.from|decodeURI)/g, label: 'eval() with decode — likely obfuscation', risk: 'high' },
  { pattern: /(?:coinhive|cryptonight|coin-hive|coinimp|webminepool)/gi, label: 'Crypto miner reference', risk: 'high' },
  { pattern: /fetch\s*\(\s*['"`]https?:\/\/[^'"`]*\/log/gi, label: 'External logging endpoint — data exfiltration', risk: 'high' },
  { pattern: /\.send\s*\(\s*(?:req\.|params|query|body|cookies)/g, label: 'Data sending — possible exfiltration', risk: 'medium' },
  { pattern: /app\.(get|post|put|delete|use)\s*\(\s*['"`]\/(?:debug|admin|internal|hidden|secret)/gi, label: 'Hidden admin/debug route', risk: 'medium' },
  { pattern: /\\x[0-9a-f]{2}\\x[0-9a-f]{2}\\x[0-9a-f]{2}/g, label: 'Hex-escaped string — obfuscation', risk: 'medium' },
  { pattern: /String\.fromCharCode\s*\(/g, label: 'String.fromCharCode — obfuscation', risk: 'low' },
  { pattern: /\\u[0-9a-f]{4}\\u[0-9a-f]{4}\\u[0-9a-f]{4}/g, label: 'Unicode-escaped string — obfuscation', risk: 'low' },
]

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.cache', 'coverage', 'test', 'tests', '__tests__'])
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])

function countLine(content, index) {
  return content.slice(0, index).split('\n').length
}

export function backdoorScan(repoPath) {
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

          const isSuspiciousFile = SUSPICIOUS_FILES.some(sf =>
            relPath.toLowerCase().endsWith(sf) || relPath.toLowerCase().includes('/' + sf)
          )

          for (const { pattern, label, risk } of BACKDOOR_PATTERNS) {
            pattern.lastIndex = 0
            let match
            while ((match = pattern.exec(content)) !== null) {
              const line = countLine(content, match.index)
              const key = `${label}:${relPath}:${line}`
              if (seen.has(key)) continue
              seen.add(key)
              const finalRisk = isSuspiciousFile && risk !== 'high' ? 'high' : risk
              findings.push({
                type: 'backdoor',
                label: isSuspiciousFile ? `[SUSPICIOUS FILE] ${label}` : label,
                file: relPath, line, risk: finalRisk, raw: match[0].slice(0, 80),
              })
            }
          }
        } catch {}
      }
    }
  }

  walk(repoPath, 0)
  return findings
}
