-- AlphaTekX Elite Builder projects.
-- Draft source is private to its owner. Only explicitly published projects are
-- readable through the server's public /api/builder/public/:slug endpoint.
create table if not exists public.builder_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text unique,
  title text not null,
  prompt text not null,
  code text not null,
  provider text,
  request_id text not null,
  charged boolean not null default false,
  public_url text,
  published boolean not null default false,
  custom_domain text unique,
  domain_status text not null default 'none',
  domain_verification_token text,
  views integer not null default 0 check (views >= 0),
  likes integer not null default 0 check (likes >= 0),
  versions jsonb not null default '[]'::jsonb,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint builder_projects_slug_format check (
    slug is null or slug ~ '^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$'
  )
);

alter table public.builder_projects add column if not exists provider text;
alter table public.builder_projects add column if not exists request_id text;
alter table public.builder_projects add column if not exists charged boolean not null default false;
alter table public.builder_projects add column if not exists published boolean not null default false;
alter table public.builder_projects add column if not exists custom_domain text;
alter table public.builder_projects add column if not exists domain_status text not null default 'none';
alter table public.builder_projects add column if not exists domain_verification_token text;
alter table public.builder_projects add column if not exists updated_at timestamptz not null default now();
alter table public.builder_projects add column if not exists views integer not null default 0;
alter table public.builder_projects add column if not exists likes integer not null default 0;
alter table public.builder_projects add column if not exists versions jsonb not null default '[]'::jsonb;
alter table public.builder_projects add column if not exists is_public boolean not null default true;

create unique index if not exists idx_builder_projects_user_request
  on public.builder_projects(user_id, request_id) where request_id is not null;

create index if not exists idx_builder_projects_user_created
  on public.builder_projects(user_id, created_at desc);
create index if not exists idx_builder_projects_public_slug
  on public.builder_projects(slug) where published = true;

create or replace function public.increment_builder_views(slug_param text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_views integer;
begin
  update public.builder_projects
  set views = views + 1
  where slug = slug_param and published = true
  returning views into next_views;
  return coalesce(next_views, 0);
end;
$$;

revoke all on function public.increment_builder_views(text) from public;
grant execute on function public.increment_builder_views(text) to anon, authenticated;

alter table public.builder_projects enable row level security;

drop policy if exists "Builder owners can read projects" on public.builder_projects;
drop policy if exists "Builder owners can create projects" on public.builder_projects;
drop policy if exists "Builder owners can update projects" on public.builder_projects;
drop policy if exists "Builder owners can delete projects" on public.builder_projects;

create policy "Builder owners can read projects"
  on public.builder_projects for select
  using (auth.uid()::text = user_id::text);
create policy "Builder owners can create projects"
  on public.builder_projects for insert
  with check (auth.uid()::text = user_id::text);
create policy "Builder owners can update projects"
  on public.builder_projects for update
  using (auth.uid()::text = user_id::text)
  with check (auth.uid()::text = user_id::text);
create policy "Builder owners can delete projects"
  on public.builder_projects for delete
  using (auth.uid()::text = user_id::text);

revoke all on public.builder_projects from anon;
grant select, insert, update, delete on public.builder_projects to authenticated;

create table if not exists public.app_entities (
  id uuid primary key default gen_random_uuid(),
  app_slug text not null,
  entity text not null,
  data jsonb not null default '{}'::jsonb,
  owner_id uuid,
  owner_email text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_app_entities_app_entity on public.app_entities(app_slug, entity);
