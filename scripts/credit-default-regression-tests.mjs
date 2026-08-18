import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative) => fs.readFileSync(path.resolve(root, relative), 'utf8')

const creditsFile = read('src/lib/credits.ts')
const authFile = read('src/pages/Auth.tsx')
const serverFile = read('server.mjs')

assert.match(creditsFile, /DEFAULT_CREDIT_BALANCE\s*=\s*1/)
assert.match(serverFile, /const DEFAULT_CREDITS = 1/)
assert.doesNotMatch(authFile, /10 free credits|10-credit bonus|10 free credits are ready/)
assert.doesNotMatch(serverFile, /setProfileMinimumCredits\(user,\s*config,\s*10\)/)
assert.doesNotMatch(serverFile, /minimum\s*===\s*10|minimum\s*>=\s*10/)

console.log('PASS credit defaults and bonus regressions checked')
