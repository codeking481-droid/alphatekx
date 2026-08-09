-- Self-Healing V1 SQL - run in Supabase SQL Editor
-- Creates workflow_runs and connections tables and adds self-healing columns to automations

CREATE TABLE IF NOT EXISTS workflow_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid references automations(id) on delete cascade,
  workflow_id uuid references automations(id) on delete cascade,
  user_id uuid,
  status text check (status in ('running','success','failed','failed_needs_attention','paused_loop')),
  error text,
  plain_english_error text,
  retry_count int default 0,
  execution_time_ms int,
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  provider text,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  status text default 'active',
  last_refreshed_at timestamptz,
  created_at timestamptz default now()
);

ALTER TABLE IF EXISTS automations ADD COLUMN IF NOT EXISTS paused_reason text;
ALTER TABLE IF EXISTS automations ADD COLUMN IF NOT EXISTS plain_english_error text;
ALTER TABLE IF EXISTS automations ADD COLUMN IF NOT EXISTS health_status text default 'healthy';
ALTER TABLE IF EXISTS automations ADD COLUMN IF NOT EXISTS version int default 1;
ALTER TABLE IF EXISTS automations ADD COLUMN IF NOT EXISTS previous_versions jsonb default '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_runs_auto_created ON workflow_runs(automation_id, created_at desc);

-- To enable realtime: enable replication for these tables inside Supabase realtime settings
