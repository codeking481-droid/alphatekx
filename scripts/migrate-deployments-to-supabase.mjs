#!/usr/bin/env node
/**
 * ALPHATEKX — MIGRATE FILESYSTEM DEPLOYMENTS TO SUPABASE (ONE-TIME)
 *
 * Moves every deployed site from data/deployments/deployed/*.json into the
 * permanent Supabase `deployments` table so they survive Render redeploys.
 * HTML is never stored on the filesystem again after this runs.
 *
 * Usage:
 *   node scripts/migrate-deployments-to-supabase.mjs [--dry-run]
 *
 * Requires SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_KEY
 * (or SUPABASE_SERVICE_ROLE_KEY) in .env / environment.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const deployedDir = join(root, 'data', 'deployments', 'deployed')
const dryRun = process.argv.includes('--dry-run')

// ─── Load .env without dependencies ──────────────────────────────────────────
function loadEnvFile() {
  const envPath = join(root, '.env')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!match) continue
    if (process.env[match[1]]) continue
  }
}
loadEnvFile()

const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
const key = String(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
if (!url || !key) {
  console.error('✖ Missing SUPABASE_URL / SUPABASE_SERVICE_KEY in .env')
  process.exit(1)
}

const db = createClient(url.replace(/\/$/, ''), key, { auth: { persistSession: false } })

// ─── Verify the deployments table exists ─────────────────────────────────────
console.log('→ Checking Supabase deployments table...')
{
  const { error } = await db.from('deployments').select('id').limit(1)
  if (error && (error.code === 'PGRST205' || error.code === '42P01' || /could not find the table|does not exist/i.test(error.message || ''))) {
    console.error('✖ The "deployments" table does not exist yet.')
    console.error('  Fix: open supabase/deployments-table.sql and run it once in the Supabase SQL editor.')
    process.exit(1)
  }
  if (error) {
    console.error('✖ Supabase error:', error.message)
    process.exit(1)
  }
}
console.log('✓ Table ready')

// ─── Collect legacy filesystem deployments ───────────────────────────────────
if (!existsSync(deployedDir)) {
  console.log(`No legacy directory at ${deployedDir} — nothing to migrate.`)
  process.exit(0)
}
const files = readdirSync(deployedDir).filter(f => f.endsWith('.json') && f !== 'deployments.json')
if (!files.length) {
  console.log('No legacy deployment files found — nothing to migrate.')
  process.exit(0)
}

let migrated = 0
let skipped = 0
let failed = 0

for (const file of files) {
  let data = null
  try { data = JSON.parse(readFileSync(join(deployedDir, file), 'utf8')) } catch { console.warn(`⚠ Corrupt file skipped: ${file}`); failed++; continue }
  const slug = String(data.slug || data.name || '').toLowerCase()
  const html = String(data.html ?? data.code ?? '')
  if (!slug || !/<(?:!doctype\s+html|html|body)[\s>]/i.test(html)) {
    console.warn(`⚠ No valid HTML in ${file} (slug: ${slug || '?'}) — skipped`)
    skipped++
    continue
  }
  const row = {
    name: slug,
    html,
    title: data.title ? String(data.title).slice(0, 120) : null,
    owner_id: data.ownerId ? String(data.ownerId) : null,
    owner_email: data.ownerEmail ? String(data.ownerEmail) : null,
  }
  if (data.id && /^[0-9a-f-]{36}$/i.test(String(data.id))) row.id = String(data.id)
  if (data.createdAt) row.created_at = new Date(data.createdAt).toISOString()

  if (dryRun) {
    console.log(`[dry-run] would migrate: ${slug} (${Buffer.byteLength(html, 'utf8')} bytes)`)
    migrated++
    continue
  }
  const { error } = await db.from('deployments').upsert(row, { onConflict: 'name' })
  if (error) {
    console.error(`✖ ${slug}: ${error.message}`)
    failed++
    continue
  }
  migrated++
  console.log(`✓ ${slug}`)
}

console.log('\n─────────────────────────────')
if (dryRun) console.log(`Dry run complete: ${migrated} would migrate, ${skipped} skipped.`)
else console.log(`Migration complete: ${migrated} migrated, ${skipped} skipped, ${failed} failed.`)
if (migrated > 0 && !dryRun) {
  console.log('\nNext steps:')
  console.log('  1. Spot-check a few sites at https://alphatekx.name.ng/app/{name}')
  console.log('  2. Keep data/deployments/deployed as a cold backup or delete it — the server no longer reads it.')
}
process.exit(failed > 0 ? 1 : 0)
