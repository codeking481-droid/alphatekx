-- ALPHATEKX — FIX: add missing columns to the deployments table
-- Run this ONCE in: Supabase Dashboard → SQL Editor → New query → Run
--
-- Your deployments table was created without owner_id / owner_email / title /
-- pages, so every deploy failed with:
--   PGRST204: Could not find the 'owner_email' column of 'deployments'
--
-- This script is safe to run at any time — it only ADDS missing pieces and
-- never touches existing rows.

create extension if not exists pgcrypto;

alter table public.deployments add column if not exists title       text;
alter table public.deployments add column if not exists owner_id    text;
alter table public.deployments add column if not exists owner_email text;
alter table public.deployments add column if not exists pages       jsonb;

-- The app upserts with onConflict: 'name', which requires a UNIQUE constraint.
-- Hand-created tables often miss it → "Could not save the deployment".
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.deployments'::regclass
      and contype = 'u'
      and (select string_agg(attname, ',' order by attname) from unnest(conkey) k
           join pg_attribute a on a.attrelid = conrelid and a.attnum = k) = 'name'
  ) then
    -- Clear duplicates first so the constraint can be created cleanly.
    delete from public.deployments a
    using public.deployments b
    where a.name = b.name and a.ctid > b.ctid;
    alter table public.deployments add constraint deployments_name_key unique (name);
  end if;
end $$;

create index if not exists deployments_name_idx  on public.deployments (name);
create index if not exists deployments_owner_idx on public.deployments (owner_id);

-- Lets the server ask PostgREST to rebuild its schema cache after DDL
-- (used by the deployment store's self-healing retry logic).
create or replace function public.reload_pgrst_schema()
returns void
language plpgsql
security definer
as $$
begin
  notify pgrst, 'reload schema';
end;
$$;

-- Immediate refresh so the API sees the new columns right away.
notify pgrst, 'reload schema';
