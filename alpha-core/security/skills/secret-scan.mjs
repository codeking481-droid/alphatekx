/**
 * SECRET SCAN — Find hardcoded API keys, passwords, tokens
 */

import fs from 'node:fs'
import path from 'node:path'

const SECRET_PATTERNS = [
  { pattern: /sk_live_[A-Za-z0-9]{20,}/g, label: 'Stripe live key', risk: 'high' },
  { pattern: /sk_test_[A-Za-z0-9]{20,}/g, label: 'Stripe test key', risk: 'medium' },
  { pattern: /OPENAI_API_KEY\s*[=:]\s*['"][^'"]{20,}/g, label: 'OpenAI API key', risk: 'high' },
  { pattern: /SUPABASE_(?:URL|KEY|SERVICE_ROLE_KEY)\s*[=:]\s*['"][^'"]{10,}/g, label: 'Supabase key', risk: 'high' },
  { pattern: /(?:password|passwd|pwd)\s*[=:]\s*['"][^\s'"]{6,}/gi, label: 'Hardcoded password', risk: 'high' },
  { pattern: /(?:api[_-]?key|apikey)\s*[=:]\s*['"][A-Za-z0-9\-_]{16,}/gi, label: 'API key', risk: 'high' },
  { pattern: /(?:secret[_-]?key|client[_-]?secret)\s*[=:]\s*['"][A-Za-z0-9\-_]{16,}/gi, label: 'Secret key', risk: 'high' },
  { pattern: /(?:token|auth[_-]?token|access[_-]?token)\s*[=:]\s*['"][A-Za-z0-9\-_\.]{20,}/gi, label: 'Auth token', risk: 'high' },
  { pattern: /AWS_ACCESS_KEY_ID\s*[=:]\s*['"][A-Z0-9]{16}/g, label: 'AWS access key', risk: 'high' },
  { pattern: /AWS_SECRET_ACCESS_KEY\s*[=:]\s*['"][A-Za-z0-9/+=]{30,}/g, label: 'AWS secret key', risk: 'high' },
  { pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g, label: 'Private key', risk: 'high' },
  { pattern: /GH[_-]?(?:TOKEN|PAT)\s*[=:]\s*['"][A-Za-z0-9_]{30,}/g, label: 'GitHub token', risk: 'high' },
  { pattern: /(?:VERCEL|NETLIFY|CLOUDFLARE)[_-]?(?:TOKEN|API[_-]?KEY)\s*[=:]\s*['"][A-Za-z0-9\-_]{20,}/gi, label: 'Deployment token', risk: 'medium' },
  { pattern: /(?:DATABASE_URL|MONGODB_URI|REDIS_URL)\s*[=:]\s*['"](?:postgres|mongodb|redis):\/\/[^\s'"]+/g, label: 'Database connection string', risk: 'high' },
]

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.cache', 'coverage'])
const IGNORED_FILES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'secret-scan.mjs'])
const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte', '.json', '.yaml', '.yml', '.toml'])

function countLine(content, index) {
  return content.slice(0, index).split('\n').length
}

function isTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (TEXT_EXTENSIONS.has(ext)) return true
  const basename = path.basename(filePath)
  if (basename.startsWith('.env')) return true
  return false
}

export function secretScan(repoPath) {
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
        if (!isTextFile(fullPath)) continue
        if (IGNORED_FILES.has(entry.name)) continue

        try {
          const content = fs.readFileSync(fullPath, 'utf8')
          const relPath = path.relative(repoPath, fullPath).replace(/\\/g, '/')

          if (entry.name.startsWith('.env') && entry.name !== '.env.example' && entry.name !== '.env.sample') {
            const key = `env-file:${relPath}`
            if (!seen.has(key)) {
              seen.add(key)
              findings.push({ type: 'secret', label: '.env file committed to repository', file: relPath, line: 1, risk: 'high', raw: entry.name })
            }
          }

          for (const { pattern, label, risk } of SECRET_PATTERNS) {
            pattern.lastIndex = 0
            let match
            while ((match = pattern.exec(content)) !== null) {
              const line = countLine(content, match.index)
              const key = `${label}:${relPath}:${line}`
              if (seen.has(key)) continue
              seen.add(key)
              findings.push({ type: 'secret', label, file: relPath, line, risk, raw: match[0].slice(0, 80) })
            }
          }
        } catch {}
      }
    }
  }

  walk(repoPath, 0)
  return findings
}
