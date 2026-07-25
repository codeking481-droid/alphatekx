import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'apps')

try { fs.mkdirSync(dataDir, { recursive: true }) } catch {}

const appFile = (slug) => path.join(dataDir, `${slug}.json`)

function readApp(slug) {
  try { return JSON.parse(fs.readFileSync(appFile(slug), 'utf8')) } catch { return { entities: {}, createdAt: new Date().toISOString() } }
}

function writeApp(slug, data) {
  fs.writeFileSync(appFile(slug), JSON.stringify(data, null, 2))
}

function getRecords(slug, entity, query = {}) {
  const app = readApp(slug)
  const records = app.entities[entity] || []
  if (query.q) {
    const q = String(query.q).toLowerCase()
    return records.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(q)))
  }
  return records
}

function getRecord(slug, entity, id) {
  const records = getRecords(slug, entity)
  return records.find((r) => String(r.id) === String(id)) || null
}

function isOwner(record, userId, userEmail) {
  if (!userId && !userEmail) return false
  if (record.__ownerId && record.__ownerId !== userId) return false
  if (record.__ownerEmail && record.__ownerEmail !== userEmail) return false
  return true
}

function createRecord(slug, entity, data, user) {
  const app = readApp(slug)
  if (!app.entities[entity]) app.entities[entity] = []
  const record = {
    id: randomUUID(),
    ...data,
    __ownerId: user?.id || null,
    __ownerEmail: user?.email || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  app.entities[entity].push(record)
  app.updatedAt = new Date().toISOString()
  writeApp(slug, app)
  return { record, total: app.entities[entity].length }
}

function updateRecord(slug, entity, id, data, user, isAdmin) {
  const app = readApp(slug)
  const records = app.entities[entity] || []
  const index = records.findIndex((r) => String(r.id) === String(id))
  if (index === -1) return null
  const existing = records[index]
  if (!isAdmin && !isOwner(existing, user?.id, user?.email)) return { error: 'Not authorized', status: 403 }
  const record = { ...existing, ...data, id: existing.id, __ownerId: existing.__ownerId, __ownerEmail: existing.__ownerEmail, updatedAt: new Date().toISOString() }
  records[index] = record
  app.entities[entity] = records
  app.updatedAt = new Date().toISOString()
  writeApp(slug, app)
  return { record }
}

function deleteRecord(slug, entity, id, user, isAdmin) {
  const app = readApp(slug)
  const records = app.entities[entity] || []
  const index = records.findIndex((r) => String(r.id) === String(id))
  if (index === -1) return null
  if (!isAdmin && !isOwner(records[index], user?.id, user?.email)) return { error: 'Not authorized', status: 403 }
  records.splice(index, 1)
  app.entities[entity] = records
  app.updatedAt = new Date().toISOString()
  writeApp(slug, app)
  return { deleted: true, total: records.length }
}

function appEntitiesMigrationSql(slug) {
  return `-- Run this in your Supabase SQL Editor if you want data to live in Supabase instead of local files.
-- Replace {slug} with your app slug if you want per-app tables, or keep the generic app_entities table.

CREATE TABLE IF NOT EXISTS app_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_slug text NOT NULL,
  entity text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  owner_id uuid,
  owner_email text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_entities_app_entity ON app_entities(app_slug, entity);

-- Example policy (enable RLS manually in Supabase UI if needed):
-- ALTER TABLE app_entities ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Owners can manage their own rows" ON app_entities FOR ALL USING (owner_id = auth.uid());

-- For ${slug}, sample query:
-- SELECT * FROM app_entities WHERE app_slug = '${slug}' AND entity = 'products';
`
}

export { getRecords, getRecord, createRecord, updateRecord, deleteRecord, appEntitiesMigrationSql, readApp }
