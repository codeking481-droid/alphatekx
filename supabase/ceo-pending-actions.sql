create table if not exists public.ceo_pending_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  data jsonb not null default '{}'::jsonb,
  suggested_action text not null default '',
  actions jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending','executing','approved','rejected','failed')),
  source_key text not null,
  result jsonb,
  error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_key)
);

create index if not exists idx_ceo_pending_actions_user_status
  on public.ceo_pending_actions(user_id, status, created_at desc);

alter table public.ceo_pending_actions enable row level security;

drop policy if exists "Users read own CEO actions" on public.ceo_pending_actions;
create policy "Users read own CEO actions"
  on public.ceo_pending_actions for select
  using (auth.uid() = user_id);
