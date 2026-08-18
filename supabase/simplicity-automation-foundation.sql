-- Backward-compatible normalized memory for long-running automations.
-- Existing agents.data records remain authoritative and require no destructive migration.
create table if not exists public.automation_content_memory (
  id uuid primary key default gen_random_uuid(),
  automation_id text not null references public.agents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  content text not null,
  content_fingerprint text not null,
  semantic_topic text,
  hook text,
  cta text,
  hashtags text[] not null default '{}',
  image_concept text,
  image_asset_id uuid,
  scheduled_at timestamptz,
  published_at timestamptz,
  provider_post_id text,
  status text not null default 'draft',
  credits_used integer not null default 0,
  user_edits jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists automation_content_memory_owner_idx on public.automation_content_memory(user_id, automation_id);
create index if not exists automation_content_memory_fingerprint_idx on public.automation_content_memory(automation_id, content_fingerprint);

create table if not exists public.automation_image_assets (
  id uuid primary key default gen_random_uuid(),
  automation_id text not null references public.agents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  model text,
  storage_url text not null,
  prompt text not null,
  concept text,
  width integer,
  height integer,
  status text not null default 'ready',
  credits_used integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.automation_content_memory enable row level security;
alter table public.automation_image_assets enable row level security;

drop policy if exists "automation content memory owner access" on public.automation_content_memory;
create policy "automation content memory owner access" on public.automation_content_memory
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "automation image asset owner access" on public.automation_image_assets;
create policy "automation image asset owner access" on public.automation_image_assets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
