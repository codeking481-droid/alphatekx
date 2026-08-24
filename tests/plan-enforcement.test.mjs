/**
 * PLAN ENFORCEMENT TESTS — the canonical pricing table, verified for real.
 *
 *   Free      $0    1 site · 1 scan · 1 fix  · 0 videos
 *   Starter   $9    1 site · 5 scans · 5 fixes · 0 videos
 *   Lite      $19   3 sites · 15 scans · 15 fixes · 3 videos
 *   Pro       $49   10 sites · unlimited · 25 videos
 *   Business  $99   25 sites · unlimited · unlimited videos
 *   Enterprise $199 unlimited everything
 *
 * Runs against the local JSON fallback store (no Supabase required);
 * the Supabase consume_plan_quota RPC enforces the identical logic in prod.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { checkQuota, consumeQuota, limitsFor } from '../server/restoreQuotas.mjs'
import { PLANS as BILLING_PLANS } from '../server/billing.mjs'

const STORE = path.resolve(process.cwd(), 'data', 'user-restore-quotas.json')
const testIds = new Set()

function uid() {
  const id = `u:plan-test-${Math.random().toString(36).slice(2, 10)}`
  testIds.add(id)
  return id
}

test.after(() => {
  try {
    const store = JSON.parse(fs.readFileSync(STORE, 'utf8'))
    let dirty = false
    for (const key of Object.keys(store)) {
      if (key.startsWith('u:plan-test-')) { delete store[key]; dirty = true }
    }
    if (dirty) fs.writeFileSync(STORE, JSON.stringify(store, null, 2))
  } catch { /* nothing to clean */ }
})

/**
 * Attempt `n` consumptions of `kind`; returns 0-based index of first block (n if none).
 * With stableHost=true every consumption targets the same hostname, so site caps
 * never fire and the test isolates the fix/scan limit itself.
 */
async function firstBlockAt(planId, kind, n, { stableHost = false } = {}) {
  const identity = uid()
  const hostBase = `${identity.replace(/[^a-z0-9]/gi, '')}.test`
  for (let i = 0; i < n; i++) {
    const hostname = stableHost ? `${hostBase}.example.com` : `${hostBase}-${i}.example.com`
    const verdict = await checkQuota({ identity, planId, hostname, kind })
    if (!verdict.ok) return { index: i, code: verdict.code }
    await consumeQuota({ identity, planId, hostname, kind })
  }
  return { index: n, code: null }
}

// ---------- Free ($0): 1 site · 1 scan · 1 fix · 0 videos ----------

test('free: second scan is blocked with QUOTA_SCANS_EXHAUSTED', async () => {
  const r = await firstBlockAt('free', 'scan', 3)
  assert.equal(r.index, 1)
  assert.equal(r.code, 'QUOTA_SCANS_EXHAUSTED')
})

test('free: second fix is blocked with QUOTA_FIXES_EXHAUSTED', async () => {
  const r = await firstBlockAt('free', 'fix', 3)
  assert.equal(r.index, 1)
  assert.equal(r.code, 'QUOTA_FIXES_EXHAUSTED')
})

test('free: video allowance is 0 (no video restoration)', () => {
  assert.equal(BILLING_PLANS.free.monthlyVideos, 0)
})

// ---------- Starter ($9): 1 site · 5 scans · 5 fixes · 0 videos ----------

test('starter($9): five scans pass, sixth blocked', async () => {
  const r = await firstBlockAt('lite_9', 'scan', 7)
  assert.equal(r.index, 5)
  assert.equal(r.code, 'QUOTA_SCANS_EXHAUSTED')
})

test('starter($9): five fixes pass, sixth blocked', async () => {
  const r = await firstBlockAt('lite_9', 'fix', 7, { stableHost: true })
  assert.equal(r.index, 5)
  assert.equal(r.code, 'QUOTA_FIXES_EXHAUSTED')
})

test('starter($9): a second distinct site is blocked at the site cap', async () => {
  const identity = uid()
  const first = await checkQuota({ identity, planId: 'lite_9', hostname: 'site-a.example.com' })
  assert.equal(first.ok, true)
  await consumeQuota({ identity, planId: 'lite_9', hostname: 'site-a.example.com' })
  // Same site again is still allowed even though fixes remain.
  const sameSite = await checkQuota({ identity, planId: 'lite_9', hostname: 'site-a.example.com' })
  assert.equal(sameSite.ok, true)
  // A brand-new site crosses the 1-site cap.
  const secondSite = await checkQuota({ identity, planId: 'lite_9', hostname: 'site-b.example.com' })
  assert.equal(secondSite.ok, false)
  assert.equal(secondSite.code, 'QUOTA_SITES_EXHAUSTED')
})

test('starter($9): video allowance is 0', () => {
  assert.equal(BILLING_PLANS.lite_9.monthlyVideos, 0)
})

// ---------- Lite ($19): 3 sites · 15 fixes · 3 videos ----------

test('lite($19): fourth distinct site is blocked at the site cap', async () => {
  const identity = uid()
  for (const host of ['s1.example.com', 's2.example.com', 's3.example.com']) {
    const v = await checkQuota({ identity, planId: 'video_19', hostname: host })
    assert.equal(v.ok, true)
    await consumeQuota({ identity, planId: 'video_19', hostname: host })
  }
  const fourth = await checkQuota({ identity, planId: 'video_19', hostname: 's4.example.com' })
  assert.equal(fourth.ok, false)
  assert.equal(fourth.code, 'QUOTA_SITES_EXHAUSTED')
})

test('lite($19): fifteen fixes on a registered site pass, sixteenth blocked', async () => {
  const r = await firstBlockAt('video_19', 'fix', 16, { stableHost: true })
  assert.equal(r.index, 15)
  assert.equal(r.code, 'QUOTA_FIXES_EXHAUSTED')
})

test('lite($19): video allowance is exactly 3', () => {
  assert.equal(BILLING_PLANS.video_19.monthlyVideos, 3)
})

// ---------- Pro ($49): 10 sites · unlimited fixes · 25 videos ----------

test('pro($49): eleventh distinct site is blocked at the site cap', async () => {
  const identity = uid()
  for (let i = 0; i < 10; i++) {
    const host = `p${i}.example.com`
    const v = await checkQuota({ identity, planId: 'video_49', hostname: host })
    assert.equal(v.ok, true)
    await consumeQuota({ identity, planId: 'video_49', hostname: host })
  }
  const eleventh = await checkQuota({ identity, planId: 'video_49', hostname: 'p10.example.com' })
  assert.equal(eleventh.ok, false)
  assert.equal(eleventh.code, 'QUOTA_SITES_EXHAUSTED')
})

test('pro($49): fixes are unlimited (20 consecutive fixes all pass)', async () => {
  const r = await firstBlockAt('video_49', 'fix', 20, { stableHost: true })
  assert.equal(r.index, 20)
  assert.equal(r.code, null)
})

test('pro($49): video allowance is exactly 25', () => {
  assert.equal(BILLING_PLANS.video_49.monthlyVideos, 25)
})

// ---------- Business ($99): 25 sites · unlimited fixes & videos ----------

test('business($99): twenty-sixth distinct site is blocked at the site cap', async () => {
  const identity = uid()
  for (let i = 0; i < 25; i++) {
    const host = `b${i}.example.com`
    const v = await checkQuota({ identity, planId: 'video_99', hostname: host })
    assert.equal(v.ok, true)
    await consumeQuota({ identity, planId: 'video_99', hostname: host })
  }
  const twentySixth = await checkQuota({ identity, planId: 'video_99', hostname: 'b25.example.com' })
  assert.equal(twentySixth.ok, false)
  assert.equal(twentySixth.code, 'QUOTA_SITES_EXHAUSTED')
})

test('business($99): video allowance is unlimited', () => {
  assert.equal(BILLING_PLANS.video_99.monthlyVideos, Infinity)
})

// ---------- Enterprise ($199): unlimited everything ----------

test('enterprise($199): sites, scans and fixes are all unlimited', async () => {
  const limits = limitsFor('enterprise_199')
  assert.equal(limits.sites, Infinity)
  assert.equal(limits.scans, Infinity)
  assert.equal(limits.fixes, Infinity)

  const r = await firstBlockAt('enterprise_199', 'fix', 30, { stableHost: true })
  assert.equal(r.index, 30)
  const s = await firstBlockAt('enterprise_199', 'scan', 30)
  assert.equal(s.index, 30)
})

test('enterprise($199): video allowance is unlimited', () => {
  assert.equal(BILLING_PLANS.enterprise_199.monthlyVideos, Infinity)
})

// ---------- Canonical naming lock ($9=Starter, $19=Lite) ----------

test('plan labels match the canonical naming everywhere', () => {
  assert.equal(limitsFor('lite_9').label, 'Starter')
  assert.equal(limitsFor('video_19').label, 'Lite')
  assert.equal(limitsFor('video_49').label, 'Pro')
  assert.equal(limitsFor('video_99').label, 'Business')
  assert.equal(limitsFor('enterprise_199').label, 'Enterprise')
})
