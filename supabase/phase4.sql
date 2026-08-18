alter table public.profiles add column if not exists revenue numeric not null default 0 check (revenue >= 0);
alter table public.profiles add column if not exists display_name text not null default '';
alter table public.creations add column if not exists versions jsonb not null default '[]';
alter table public.creations add column if not exists custom_domain text;
alter table public.marketplace_items add column if not exists revenue_earned numeric not null default 0;
alter table public.marketplace_items add column if not exists creator_id uuid references auth.users(id) on delete cascade;
update public.marketplace_items set creator_id=owner_id where creator_id is null;

create table if not exists public.mentor_progress (mission_id uuid primary key references public.missions(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,subject text not null,lessons jsonb not null default '[]',lessons_completed jsonb not null default '[]',quiz_scores jsonb not null default '{}',updated_at timestamptz not null default now());
alter table public.mentor_progress enable row level security;
drop policy if exists "mentor owner access" on public.mentor_progress;
create policy "mentor owner access" on public.mentor_progress for all using(auth.uid()=user_id) with check(auth.uid()=user_id);

create table if not exists public.marketplace_reviews(id uuid primary key default gen_random_uuid(),item_id uuid not null references public.marketplace_items(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,rating integer not null check(rating between 1 and 5),comment text not null check(char_length(comment) between 2 and 1000),created_at timestamptz not null default now(),unique(item_id,user_id));
alter table public.marketplace_reviews enable row level security;
drop policy if exists "review public read" on public.marketplace_reviews;
drop policy if exists "review owner write" on public.marketplace_reviews;
create policy "review public read" on public.marketplace_reviews for select using(true);
create policy "review owner write" on public.marketplace_reviews for all using(auth.uid()=user_id) with check(auth.uid()=user_id);

create table if not exists public.marketplace_sales (id uuid primary key default gen_random_uuid(), item_id uuid not null references public.marketplace_items(id) on delete restrict, creator_id uuid not null references auth.users(id) on delete restrict, buyer_id uuid not null references auth.users(id) on delete restrict, title text not null, amount numeric not null default 0, creator_share numeric not null default 0, platform_share numeric not null default 0, payment_reference text unique, created_at timestamptz not null default now());
alter table public.marketplace_sales enable row level security;
drop policy if exists "sale participants read" on public.marketplace_sales;
create policy "sale participants read" on public.marketplace_sales for select using (auth.uid()=creator_id or auth.uid()=buyer_id);

create or replace function public.complete_marketplace_purchase(p_item_id uuid, p_buyer_id uuid, p_reference text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare item public.marketplace_items%rowtype; mission_id uuid:=gen_random_uuid(); creation_id uuid:=gen_random_uuid(); creator_cut numeric; platform_cut numeric;
begin
  select * into item from public.marketplace_items where id=p_item_id for update;
  if item.id is null then raise exception 'Marketplace item not found'; end if;
  if p_reference is not null and exists(select 1 from public.marketplace_sales where payment_reference=p_reference) then raise exception 'Payment already processed'; end if;
  creator_cut:=round(item.price*.8,2); platform_cut:=item.price-creator_cut;
  insert into public.missions(id,user_id,title,goal,status,progress) values(mission_id,p_buyer_id,item.title||' Marketplace Copy','Acquired '||item.title||' from Alpha Marketplace','completed',100);
  insert into public.creations(id,mission_id,user_id,title,code,type,status,files) values(creation_id,mission_id,p_buyer_id,item.title,item.code,item.category,'ready',item.files);
  update public.marketplace_items set downloads=downloads+1,revenue_earned=revenue_earned+creator_cut where id=item.id;
  update public.profiles set revenue=revenue+creator_cut where id=item.owner_id;
  insert into public.marketplace_sales(item_id,creator_id,buyer_id,title,amount,creator_share,platform_share,payment_reference) values(item.id,item.owner_id,p_buyer_id,item.title,item.price,creator_cut,platform_cut,p_reference);
  return jsonb_build_object('creationId',creation_id,'downloads',item.downloads+1);
end; $$;
revoke all on function public.complete_marketplace_purchase(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.complete_marketplace_purchase(uuid,uuid,text) to service_role;
