-- Telegram V1 Native — Database Migration
-- Adds telegram_chat_bindings table and feature_flags table

-- 1. Telegram Chat Bindings (dedicated table for secure user-chat linking)
create table if not exists public.telegram_chat_bindings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  telegram_chat_id text not null,
  telegram_user_id bigint,
  telegram_username text,
  verified_at timestamptz not null default now(),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(telegram_chat_id),
  unique(user_id)
);

-- 2. Indexes for fast lookups
create index if not exists idx_telegram_bindings_user
  on public.telegram_chat_bindings(user_id)
  where is_active = true;

create index if not exists idx_telegram_bindings_chat
  on public.telegram_chat_bindings(telegram_chat_id)
  where is_active = true;

-- 3. RLS
alter table public.telegram_chat_bindings enable row level security;

create policy "telegram_binding owner read"
  on public.telegram_chat_bindings
  for select
  using (auth.uid() = user_id);

create policy "telegram_binding owner insert"
  on public.telegram_chat_bindings
  for insert
  with check (auth.uid() = user_id);

create policy "telegram_binding owner update"
  on public.telegram_chat_bindings
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "telegram_binding owner delete"
  on public.telegram_chat_bindings
  for delete
  using (auth.uid() = user_id);

-- Service role can manage all bindings (for webhook handler)
create policy "telegram_binding service all"
  on public.telegram_chat_bindings
  for all
  using (true)
  with check (true);

-- 4. Feature Flags table (database-controlled feature management)
create table if not exists public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  flag_name text not null unique,
  enabled boolean not null default false,
  beta_testers text[] not null default '{}',
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5. Default Telegram integration flag (disabled, admin-only beta)
insert into public.feature_flags (flag_name, enabled, beta_testers, description)
values ('telegram_integration', false, array['iamdan4live@gmail.com'], 'Telegram V1 native integration — bot connection and messaging')
on conflict (flag_name) do update
set beta_testers = excluded.beta_testers,
    description = excluded.description;

alter table public.feature_flags enable row level security;

create policy "feature_flags public read"
  on public.feature_flags
  for select
  using (true);

create policy "feature_flags admin write"
  on public.feature_flags
  for all
  using (true)
  with check (true);

-- Grant service role full access
grant all on public.telegram_chat_bindings to service_role;
grant all on public.feature_flags to service_role;
grant select on public.feature_flags to authenticated;
grant select on public.feature_flags to anon;
