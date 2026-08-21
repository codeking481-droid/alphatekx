-- ALPHATEKX DEPLOYMENTS — permanent storage in Supabase (PostgreSQL)
-- Run this ONCE in: Supabase Dashboard → SQL Editor → New query → Run
--
-- After this, deployed sites survive Render redeploys forever.
-- Deploy URL is unchanged: https://alphatekx.name.ng/app/{name}

create extension if not exists pgcrypto;

create table if not exists public.deployments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  title       text,
  html        text not null,
  owner_id    text,
  owner_email text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists deployments_name_idx on public.deployments (name);
create index if not exists deployments_owner_idx on public.deployments (owner_id);

-- Keep updated_at fresh automatically on every update.
create or replace function public.set_deployments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists deployments_set_updated_at on public.deployments;
create trigger deployments_set_updated_at
  before update on public.deployments
  for each row execute function public.set_deployments_updated_at();

-- Row Level Security: the server writes with the service-role key (bypasses RLS).
-- No public policies — end users can never read or write other people's sites.
alter table public.deployments enable row level security;

comment on table public.deployments is 'AlphaTekX deployed sites — HTML stored permanently as UTF-8. Served at https://alphatekx.name.ng/app/{name}.';
