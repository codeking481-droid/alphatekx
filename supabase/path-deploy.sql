alter table public.creations
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

alter table public.creations
  add column if not exists slug text;

update public.creations
set owner_id = user_id
where owner_id is null;

create unique index if not exists creations_slug_unique
  on public.creations(slug)
  where slug is not null;

alter table public.creations enable row level security;

drop policy if exists "published creations public read" on public.creations;
create policy "published creations public read"
  on public.creations
  for select
  using (published = true);
