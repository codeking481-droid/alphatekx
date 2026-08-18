import assert from 'node:assert/strict'
import fs from 'node:fs'

const auth = fs.readFileSync(new URL('../src/lib/auth.tsx', import.meta.url), 'utf8')
const access = fs.readFileSync(new URL('../src/lib/adminAccess.ts', import.meta.url), 'utf8')
const signup = fs.readFileSync(new URL('../src/pages/Auth.tsx', import.meta.url), 'utf8')
const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')

const tests = [
  ['auth listener is stable across session updates', () => {
    assert.match(auth, /onAuthStateChange/)
    assert.match(auth, /\}, \[refreshProfile\]\)/)
    assert.doesNotMatch(auth, /\}, \[session\?\.user\?\.id\]\)/)
  }],
  ['profile migration failure does not sign an authenticated user out', () => {
    assert.match(auth, /Keep the user signed in/)
    assert.match(auth, /setProfile\(current => current \|\|/)
  }],
  ['all product administrators are recognized in the UI', () => {
    for (const email of ['iamdan4live@gmail.com', 'coderking555@gmail.com', 'codeking481@gmail.com', 'alphatekxcompany@gmail.com']) assert.ok(access.includes(email))
  }],
  ['administrator signup bypass is independent of profile schema', () => {
    assert.match(server, /Admin authority is derived from the authenticated identity/)
    assert.match(server, /credits: 999999, creditsAdded: 0, isAdmin: true/)
    for (const email of ['iamdan4live@gmail.com', 'coderking555@gmail.com', 'codeking481@gmail.com', 'alphatekxcompany@gmail.com']) assert.ok(server.includes(email))
    assert.match(server, /\.\.\.productAdminEmails/)
  }],
  ['Google signup uses one-tab OAuth and recovers from stale callbacks', () => {
    assert.match(auth, /window\.location\.assign\(data\.url\)/)
    assert.doesNotMatch(auth, /window\.open\(data\.url/)
    assert.match(auth, /GOOGLE_SIGNUP_PENDING_TTL_MS/)
    assert.match(signup, /clearGoogleSignupPending\(\)[\s\S]*setGoogleSignupPending\(false\)/)
  }],
  ['signup uses the responsive premium surface', () => {
    assert.match(signup, /min-h-\[100dvh\]/)
    assert.match(signup, /w-full max-w-2xl/)
    assert.match(signup, /min-h-\[48px\] w-full/)
  }],
]

let failed = 0
console.log('SIGNUP_RELIABILITY_TESTS:')
for (const [name, run] of tests) {
  try { run(); console.log(`- PASS: ${name}`) }
  catch (error) { failed += 1; console.log(`- FAIL: ${name} — ${error.message}`) }
}
console.log(`- Total: ${tests.length}, Passed: ${tests.length - failed}, Failed: ${failed}`)
if (failed) process.exit(1)
console.log('SIGNUP_RELIABILITY_TESTS_OK')
