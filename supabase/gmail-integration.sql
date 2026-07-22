-- Run once in the Supabase SQL Editor before enabling Gmail on Render.
-- OAuth tokens written by server.mjs are AES-256-GCM encrypted before storage.
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
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
