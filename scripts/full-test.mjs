import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const runner=fileURLToPath(new URL('./full-test-runner.ts',import.meta.url));const result=spawnSync(process.execPath,['--import','tsx',runner],{stdio:'inherit',env:{...process.env}});if(result.status!==0){process.stderr.write(`FAIL: full integration test exited ${result.status}\n`);process.exit(result.status??1)}
