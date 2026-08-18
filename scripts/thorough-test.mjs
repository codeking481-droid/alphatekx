import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const runner = fileURLToPath(new URL('./thorough-test-runner.ts', import.meta.url))
const result = spawnSync(process.execPath, ['--import', 'tsx', runner], { stdio: 'inherit', env: { ...process.env } })
process.exit(result.status ?? 1)
