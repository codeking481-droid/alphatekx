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
  views integer not null default 0 check (views >= 0),
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
alter table public.builder_projects add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_builder_projects_user_request
  on public.builder_projects(user_id, request_id) where request_id is not null;

create index if not exists idx_builder_projects_user_created
  on public.builder_projects(user_id, created_at desc);
create index if not exists idx_builder_projects_public_slug
  on public.builder_projects(slug) where published = true;

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
