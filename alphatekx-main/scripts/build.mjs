import { execFileSync, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

let buildId = 'dev'

try {
  const output = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
  if (output) buildId = output
} catch {}

const require = createRequire(import.meta.url)
const vitePackageJson = require.resolve('vite/package.json')
const viteBin = path.resolve(path.dirname(vitePackageJson), 'bin', 'vite.js')

const result = spawnSync(process.execPath, [viteBin, 'build'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_BUILD_ID: buildId,
  },
})

if (result.error) {
  console.error(result.error.message)
  process.exit(result.status ?? 1)
}

process.exit(result.status ?? 0)
