-- ALPHATEKX SITE MEMORY — the restoration agent remembers every site it fixes.
-- Run this ONCE in: Supabase Dashboard → SQL Editor → New query → Run
--
-- One row per hostname: how many times Alpha restored it, best/last health
-- scores, and a rolling history of recent runs. The agent reads this at the
-- start of every restoration ("welcome back — last time I fixed X") and
-- writes to it after every run.

create extension if not exists pgcrypto;

create table if not exists public.restoration_memory (
  id          uuid primary key default gen_random_uuid(),
  hostname    text not null unique,
  url         text,
  scans       integer not null default 0,
  best_score  integer not null default 0,
  last_score  integer not null default 0,
  last_run_at timestamptz,
  history     jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists restoration_memory_hostname_idx on public.restoration_memory (hostname);

create or replace function public.set_restoration_memory_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists restoration_memory_set_updated_at on public.restoration_memory;
create trigger restoration_memory_set_updated_at
  before update on public.restoration_memory
  for each row execute function public.set_restoration_memory_updated_at();

-- Service-role key bypasses RLS; no public policies.
alter table public.restoration_memory enable row level security;

comment on table public.restoration_memory is 'AlphaTekX agent memory — per-site restoration history feeding "welcome back" context into future scans.';
