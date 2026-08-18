-- Idempotent repair for production installations created before the
-- encrypted integration vault and scheduled Media Library queue.
-- Run once in the production Supabase SQL Editor.

begin;

create table if not exists public.connector_executions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  toolkit_slug text not null,
  capability_id text not null,
  status text not null default 'claimed',
  approval_id text not null,
  idempotency_key text not null,
  provider_execution_id text,
  result_metadata jsonb not null default '{}'::jsonb,
  credits_charged integer not null default 0,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(user_id, idempotency_key)
);
create index if not exists connector_executions_history
  on public.connector_executions(user_id, toolkit_slug, created_at desc);

create table if not exists public.user_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  access_token text not null,
  refresh_token text,
  expiry_date bigint,
  email text,
  scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, provider)
);

alter table public.user_integrations enable row level security;
drop policy if exists "integration owner access" on public.user_integrations;
create policy "integration owner access" on public.user_integrations
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table if exists public.media_library
  add column if not exists mime_type text,
  add column if not exists file_size bigint,
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists platform_target text[] not null default '{}',
  add column if not exists scheduled_for timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists provider_id text,
  add column if not exists execution_key text,
  add column if not exists claimed_at timestamptz,
  add column if not exists last_error text,
  add column if not exists thumbnail_path text;

create index if not exists idx_media_library_user_status
  on public.media_library(user_id, status, scheduled_for);
create unique index if not exists idx_media_library_execution_key
  on public.media_library(execution_key)
  where execution_key is not null;

notify pgrst, 'reload schema';

commit;
