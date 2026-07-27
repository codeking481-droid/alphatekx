import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = file => fs.readFileSync(path.resolve(root, file), 'utf8')
const auth = read('src/pages/Auth.tsx')
const fingerprint = read('src/lib/fingerprint.ts')
const server = read('server.mjs')
const migration = read('supabase/fingerprint-credits.sql')
const css = read('src/index.css')
const settings = read('src/pages/Settings.tsx')
const pkg = JSON.parse(read('package.json'))

let passed = 0
function test(name, run) {
  try {
    run()
    passed += 1
    process.stdout.write(`PASS ${name}\n`)
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n${error.stack}\n`)
    process.exitCode = 1
  }
}

test('Google is the only sign-in provider shown', () => {
  assert.match(auth, /provider:\s*'google'/)
  assert.match(auth, /Sign in with Google/)
  assert.doesNotMatch(auth, /signInWithPassword|signUp\(|type="password"|Use email instead|Phone|Firebase/)
})

test('human verification runs after an authenticated Google session', () => {
  assert.match(auth, /if \(!user \|\| !session\?\.access_token/)
  assert.match(auth, /getDeviceFingerprint\(\)/)
  assert.match(auth, /fetch\('\/api\/verify-bonus'/)
  assert.match(auth, /navigate\('\/onboarding'/)
})

test('FingerprintJS is isolated behind one cached helper', () => {
  assert.equal(pkg.dependencies['@fingerprintjs/fingerprintjs']?.length > 0, true)
  assert.match(fingerprint, /FingerprintJS\.load\(\)/)
  assert.match(fingerprint, /result\.visitorId/)
})

test('raw device fingerprints are hashed and never stored directly', () => {
  assert.match(server, /createHmac\('sha256'/)
  assert.match(server, /p_fingerprint_hash: fingerprintHash/)
  assert.doesNotMatch(server, /p_fingerprint_hash:\s*fingerprint[,}]/)
})

test('server derives Google subject and enforces five attempts per hour', () => {
  assert.match(server, /googleIdentitySubject\(user\)/)
  assert.match(server, /BONUS_RATE_WINDOW_MS = 60 \* 60 \* 1000/)
  assert.match(server, /BONUS_RATE_MAX = 5/)
  assert.match(server, /429/)
})

test('database claim and credit award are atomic and idempotent', () => {
  assert.match(migration, /fingerprint_hash TEXT NOT NULL UNIQUE/i)
  assert.match(migration, /google_sub TEXT NOT NULL UNIQUE/i)
  assert.match(migration, /pg_advisory_xact_lock/g)
  assert.match(migration, /ON CONFLICT DO NOTHING/)
  assert.match(migration, /greatest\(0, 10 - current_credits\)/)
  assert.match(migration, /credit_transactions/)
})

test('shared inputs use visible dark text on white surfaces', () => {
  assert.match(css, /\.field,[\s\S]*background: #FFFFFF/)
  assert.match(css, /color: #0B0F19/)
  assert.match(css, /textarea, select/)
  assert.match(settings, /Signed in securely with Google/)
  assert.match(settings, /Connected login method[\s\S]*Google/)
  assert.doesNotMatch(settings, /text-white\/55|Email \/ Password/)
})

test('Firebase runtime and environment contracts are removed', () => {
  assert.equal(pkg.dependencies.firebase, undefined)
  assert.equal(pkg.dependencies['firebase-admin'], undefined)
  assert.doesNotMatch(read('.env.example'), /FIREBASE/)
  assert.equal(fs.existsSync(path.resolve(root, 'src/lib/firebasePhone.ts')), false)
  assert.equal(fs.existsSync(path.resolve(root, 'server/firebasePhoneAuth.mjs')), false)
})

if (!process.exitCode) process.stdout.write(`\n${passed}/8 auth device-bonus checks passed.\n`)
