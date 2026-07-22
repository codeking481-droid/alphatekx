import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const viteCli = path.resolve(root, 'node_modules', 'vite', 'bin', 'vite.js')
const git = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
  windowsHide: true,
})
const buildId = git.status === 0 && git.stdout.trim() ? git.stdout.trim() : 'dev'
const result = spawnSync(process.execPath, [viteCli, 'build'], {
  cwd: root,
  env: { ...process.env, VITE_BUILD_ID: buildId },
  stdio: 'inherit',
  windowsHide: true,
})

if (result.error) {
  process.stderr.write(`Failed to start Vite: ${result.error.message}\n`)
  process.exit(1)
}

process.exit(result.status ?? 1)
