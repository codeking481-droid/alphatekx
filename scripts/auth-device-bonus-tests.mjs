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

test('Google credit and human verification are separate user choices', () => {
  assert.match(auth, /if \(!user \|\| !session\?\.access_token/)
  const welcomeEffect = auth.slice(auth.indexOf('welcomeCreditStarted.current'), auth.indexOf('const verifyHuman'))
  assert.match(welcomeEffect, /\/api\/auth\/welcome-credit\/google/)
  assert.doesNotMatch(welcomeEffect, /getDeviceFingerprint|\/api\/verify-bonus/)
  assert.match(auth, /onClick=\{\(\) => user \? void verifyHuman\(\) : void google\(true\)\}/)
  assert.match(auth, /disabled=\{!configured \|\| pending \|\| verifying\}/)
  assert.match(auth, /getDeviceFingerprint\(\)/)
  assert.match(auth, /fetch\('\/api\/verify-bonus'/)
  assert.match(auth, /fingerprintHash: fingerprint/)
  assert.match(auth, /navigate\('\/onboarding'/)
})

test('human-verification choice survives Google OAuth and resumes once', () => {
  assert.match(auth, /SIGNUP_CHOICE_KEY = 'alphatekx:signup-choice'/)
  assert.match(auth, /rememberSignupChoice\(verifyAfterSignIn \? HUMAN_VERIFICATION_CHOICE : null\)/)
  assert.match(auth, /pendingSignupChoice\(\) !== HUMAN_VERIFICATION_CHOICE/)
  assert.match(auth, /rememberSignupChoice\(null\)[\s\S]*void verifyHuman\(\)/)
  assert.match(auth, /!welcomeSettled \|\| verifying/)
})

test('FingerprintJS is isolated behind one cached helper', () => {
  assert.equal(pkg.dependencies['@fingerprintjs/fingerprintjs']?.length > 0, true)
  assert.match(fingerprint, /FingerprintJS\.load\(\)/)
  assert.match(fingerprint, /result\.visitorId/)
})

test('raw device fingerprints are hashed and never stored directly', () => {
  assert.match(server, /createHmac\('sha256'/)
  assert.match(server, /fingerprint_hash: fingerprintHash/)
  assert.doesNotMatch(server, /fingerprint_hash:\s*fingerprint[,}]/)
})

test('server derives Google subject and enforces five attempts per hour', () => {
  assert.match(server, /googleIdentitySubject\(user\)/)
  assert.match(server, /BONUS_RATE_WINDOW_MS = 60 \* 60 \* 1000/)
  assert.match(server, /BONUS_RATE_MAX = 5/)
  assert.match(server, /429/)
})

test('configured supervisors bypass device claims without weakening authentication', () => {
  assert.match(read('.env.example'), /SUPER_ADMIN_EMAILS=/)
  assert.match(server, /supervisorEmails\(\)\.has\(email\)/)
  assert.match(server, /credits: 999999, creditsAdded: 0/)
  assert.match(server, /isAdmin: true/)
  assert.match(auth, /Administrator access is active/)
  assert.match(auth, /Continue with 1 credit/)
  assert.match(migration, /Supervisor welcome-credit bypass/)
})

test('service-role device claim and credit award are durable and idempotent', () => {
  assert.match(migration, /fingerprint_hash TEXT NOT NULL UNIQUE/i)
  assert.match(migration, /google_sub TEXT NOT NULL UNIQUE/i)
  assert.match(server, /serviceRows\(config, 'device_claims'/)
  assert.match(server, /serviceHeaders\(config\.service\)/)
  assert.match(server, /google-welcome:/)
  assert.match(server, /markerSub/)
  assert.doesNotMatch(server, /serviceRows\(\s*config,\s*'credit_transactions'/)
  assert.doesNotMatch(server, /rest\/v1\/credit_transactions/)
  assert.doesNotMatch(server, /rest\/v1\/rpc\/(?:claim_device_bonus|grant_google_signup_credit|grant_supervisor_bonus)/)
  assert.doesNotMatch(server, /credits need the fingerprint-credits database migration/)
})

test('shared inputs keep readable text on wet-glass surfaces', () => {
  assert.match(css, /\.field,[\s\S]*background:\s*rgba\(59,130,246,.10\)/)
  assert.match(css, /\.field,[\s\S]*color:\s*#FFFFFF/)
  assert.match(css, /input:not\(\[type='checkbox'\]\)[\s\S]*textarea,\s*select/)
  assert.match(css, /background-color:\s*rgba\(255,255,255,.06\)\s*!important/)
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

if (!process.exitCode) process.stdout.write(`\n${passed}/10 auth device-bonus checks passed.\n`)
