-- AlphaTekx private media vault and generated-image cache.
-- Run in the Supabase SQL editor before enabling the Media Library UI.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media-library',
  'media-library',
  false,
  524288000,
  array['video/mp4', 'video/webm', 'video/quicktime', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.media_library (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  storage_path text not null,
  file_name text not null,
  file_type text not null check (file_type in ('video', 'image')),
  mime_type text not null,
  file_size bigint not null check (file_size >= 0 and file_size <= 524288000),
  title text,
  description text,
  tags text[] not null default '{}',
  platform_target text[] not null default '{}',
  status text not null default 'ready' check (status in ('ready', 'scheduled', 'processing', 'waiting_credits', 'published', 'failed')),
  scheduled_for timestamptz,
  published_at timestamptz,
  provider_id text,
  execution_key text,
  claimed_at timestamptz,
  last_error text,
  thumbnail_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, storage_path)
);

alter table public.media_library add column if not exists execution_key text;
alter table public.media_library add column if not exists claimed_at timestamptz;
alter table public.media_library add column if not exists last_error text;
alter table public.media_library drop constraint if exists media_library_status_check;
alter table public.media_library add constraint media_library_status_check
  check (status in ('ready', 'scheduled', 'processing', 'waiting_credits', 'published', 'failed'));

create index if not exists idx_media_library_user_created
  on public.media_library(user_id, created_at desc);
create index if not exists idx_media_library_user_status
  on public.media_library(user_id, status, scheduled_for);
create unique index if not exists idx_media_library_execution_key
  on public.media_library(execution_key) where execution_key is not null;

create table if not exists public.image_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  query_hash text not null,
  query text not null,
  storage_path text not null,
  prompt text not null,
  source text not null check (source in ('vault', 'pexels', 'pollinations')),
  created_at timestamptz not null default now(),
  unique(user_id, query_hash)
);

alter table public.media_library enable row level security;
alter table public.image_cache enable row level security;

drop policy if exists "media_library_select_own" on public.media_library;
create policy "media_library_select_own" on public.media_library
  for select using (auth.uid() = user_id);
drop policy if exists "media_library_insert_own" on public.media_library;
create policy "media_library_insert_own" on public.media_library
  for insert with check (auth.uid() = user_id);
drop policy if exists "media_library_update_own" on public.media_library;
create policy "media_library_update_own" on public.media_library
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "media_library_delete_own" on public.media_library;
create policy "media_library_delete_own" on public.media_library
  for delete using (auth.uid() = user_id);

drop policy if exists "image_cache_select_own" on public.image_cache;
create policy "image_cache_select_own" on public.image_cache
  for select using (auth.uid() = user_id);

drop policy if exists "media_objects_select_own" on storage.objects;
create policy "media_objects_select_own" on storage.objects
  for select using (
    bucket_id = 'media-library'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists "media_objects_insert_own" on storage.objects;
create policy "media_objects_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'media-library'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists "media_objects_delete_own" on storage.objects;
create policy "media_objects_delete_own" on storage.objects
  for delete using (
    bucket_id = 'media-library'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Make newly-created relations visible to PostgREST immediately.
notify pgrst, 'reload schema';
