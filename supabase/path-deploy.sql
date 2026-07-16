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
