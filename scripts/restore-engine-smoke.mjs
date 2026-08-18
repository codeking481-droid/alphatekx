// Smoke test for the new Restore Engine modules (no browser required).
import { huntSecrets, shannonEntropy, maskSecret } from '../server/scanEngine/secretHunter.js'
import { calculateRisk, gradeFor } from '../server/scanEngine/riskScorer.js'
import { createProof } from '../server/scanEngine/proofEngine.js'
import { liveVerifier } from '../server/scanEngine/liveVerifier.js'
import { assertSafeUrl } from '../server/scanEngine/playwrightScanner.js'
import { makeCreditsWork, makeFixPlan } from '../server/scanEngine/fixEngine.js'

const results = []

// 1) secretHunter
const hit = huntSecrets('OPENAI_API_KEY="sk-proj-abcdef12345678901234567890abcdef1234567890"', { source: 'test' })[0]
results.push(['hunt openai', hit?.kind === 'OPENAI_PROJECT_KEY', hit?.maskedValue || 'none'])
const priv = huntSecrets('-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcw\n-----END PRIVATE KEY-----', { source: 'key' })
results.push(['private key detected', priv.some(h => h.kind.includes('PRIVATE_KEY')), priv[0]?.kind || 'MISS'])
const gh = huntSecrets('GITHUB_TOKEN=ghp_1234567890123456789012345678901234567890', { source: 't' })[0]
results.push(['github token', Boolean(gh), gh?.maskedValue || 'none'])
const entropyHi = shannonEntropy('a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8s9T0')
const entropyLo = shannonEntropy('the quick brown fox jumps over the lazy dog')
results.push(['entropy high>4.5', entropyHi > 4.5, entropyHi.toFixed(2)])
results.push(['entropy prose<4.5', entropyLo < 4.5, entropyLo.toFixed(2)])
const postgres = huntSecrets('DATABASE_URL=postgres://user:supersecretpw@db.example.com:5432/app', { source: 'env' })[0]
results.push(['postgres url', Boolean(postgres), postgres?.maskedValue || 'none'])

// 2) riskScorer
const risk = calculateRisk({ exposedPaths: [1, 2], secrets: [1, 2, 3], liveSecrets: [{ isLive: true }], deletedSecretFiles: [1] })
results.push(['risk score', risk.score > 0, `${risk.score} ${risk.grade} ${risk.verdict}`])
results.push(['grade F for critical', gradeFor(95) === 'F', gradeFor(95)])

// 3) proofEngine (writes PNG via sharp + qrcode)
try {
  const proof = await createProof({
    scanId: 'test_smoke',
    targetUrl: 'https://example.com',
    screenshotBefore: null,
    screenshotAfter: null,
    secrets: [{ kind: 'OPENAI_PROJECT_KEY', maskedValue: 'sk-proj-••••7890' }],
    exposedPaths: 2,
    riskScore: 82,
    verifyUrl: 'https://alphatekx.com/api/restore/proof/test_smoke/meta.json',
    verdict: 'RESOLVED',
  })
  results.push(['proof files', proof.files.length === 4, proof.files.join(', ')])
} catch (err) {
  results.push(['proof files', false, err instanceof Error ? err.message : String(err)])
}

// 4) liveVerifier — fake keys must come back NOT live
const live = await liveVerifier([{ kind: 'STRIPE_SECRET_KEY', keyName: 'STRIPE_SECRET_KEY', value: 'sk_live_REDACTED_TEST_KEY_00000000000000000' }])
results.push(['live verifier returns masked', live[0] && live[0].maskedValue.startsWith('sk_live_') && !live[0].isLive, JSON.stringify(live[0] || {})])

// 5) SSRF guard
const guardTests = [
  ['block 127.0.0.1', () => assertSafeUrl('http://127.0.0.1:4319/'), true],
  ['block localhost', () => assertSafeUrl('http://localhost/'), true],
  ['block metadata', () => assertSafeUrl('http://169.254.169.254/latest/meta-data/'), true],
  ['allow public', () => assertSafeUrl('https://example.com/'), false],
  ['allow private bypass', () => assertSafeUrl('http://127.0.0.1:4319/', { allowPrivate: true }), false],
  ['block file protocol', () => assertSafeUrl('file:///etc/passwd'), true],
]
for (const [name, fn, shouldThrow] of guardTests) {
  let threw = false
  try { fn() } catch { threw = true }
  results.push([name, threw === shouldThrow, `threw=${threw}`])
}

// 6) fixEngine gate
const free = makeCreditsWork({ plan: 'restore_starter', creditsRemaining: 0 }, { action: 'fix' })
results.push(['free plan blocked', free.blocked, free.reason])
const paid = makeCreditsWork({ plan: 'restore_guardian', creditsRemaining: 0 }, { action: 'fix' })
results.push(['guardian allowed', !paid.blocked, paid.reason])
const plan = await makeFixPlan({ user: { plan: 'restore_starter', creditsRemaining: 0 }, repo: { owner: '', name: '' }, scanId: 'rs_test123', targetUrl: 'https://example.com', gitOwner: '', gitRepo: '' })
results.push(['fix plan blocked', plan.status === 'blocked', plan.steps[0].description])

let failed = 0
for (const [name, ok, detail] of results) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ->  ${detail}`)
  if (!ok) failed += 1
}
console.log(failed === 0 ? '\nALL SMOKE TESTS PASSED' : `\n${failed} SMOKE TEST(S) FAILED`)
if (failed !== 0) process.exitCode = 1
