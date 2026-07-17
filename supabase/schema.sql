create extension if not exists pgcrypto;

create table if not exists public.profiles (id uuid primary key references auth.users(id) on delete cascade, email text not null default '', credits integer not null default 100 check (credits >= 0), plan text not null default 'free', revenue numeric not null default 0 check (revenue >= 0), display_name text not null default '', created_at timestamptz not null default now());
alter table public.profiles add column if not exists revenue numeric not null default 0 check (revenue >= 0);
alter table public.profiles add column if not exists display_name text not null default '';
alter table public.profiles add column if not exists last_active_at timestamptz not null default now();
create table if not exists public.missions (id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade, title text not null, goal text not null, status text not null default 'active', progress integer not null default 0 check(progress between 0 and 100), created_at timestamptz not null default now());
create table if not exists public.messages (id uuid primary key, mission_id uuid not null references public.missions(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade, role text not null, content text not null, type text not null default 'chat', worker_id uuid, created_at timestamptz not null default now());
create table if not exists public.activities (id uuid primary key, mission_id uuid not null references public.missions(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade, text text not null, created_at timestamptz not null default now());
create table if not exists public.creations (id uuid primary key, mission_id uuid not null references public.missions(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade, owner_id uuid references auth.users(id) on delete cascade, slug text, title text not null, code text not null, type text not null, status text not null, files jsonb not null default '[]', published boolean not null default false, deployment_url text, created_at timestamptz not null default now());
alter table public.creations add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table public.creations add column if not exists slug text;
update public.creations set owner_id=user_id where owner_id is null;
create unique index if not exists creations_slug_unique on public.creations(slug) where slug is not null;
create table if not exists public.workers (id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade, name text not null, role text not null, purpose text not null, instructions text not null default '', memory jsonb not null default '[]', created_at timestamptz not null default now());
alter table public.workers add column if not exists provider text not null default 'groq';
alter table public.workers add column if not exists model text not null default '';
create table if not exists public.marketplace_items (id uuid primary key, creation_id uuid not null references public.creations(id) on delete cascade, owner_id uuid not null references auth.users(id) on delete cascade, title text not null, description text not null, creator text not null, category text not null, price_type text not null default 'free', price numeric not null default 0, rating numeric not null default 5, downloads integer not null default 0, code text not null, files jsonb not null default '[]', created_at timestamptz not null default now());
alter table public.creations add column if not exists versions jsonb not null default '[]';
alter table public.creations add column if not exists custom_domain text;
alter table public.marketplace_items add column if not exists revenue_earned numeric not null default 0;
alter table public.marketplace_items add column if not exists creator_id uuid references auth.users(id) on delete cascade;
create table if not exists public.mentor_progress (mission_id uuid primary key references public.missions(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,subject text not null,lessons jsonb not null default '[]',lessons_completed jsonb not null default '[]',quiz_scores jsonb not null default '{}',updated_at timestamptz not null default now());
create table if not exists public.marketplace_reviews(id uuid primary key default gen_random_uuid(),item_id uuid not null references public.marketplace_items(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,rating integer not null check(rating between 1 and 5),comment text not null check(char_length(comment) between 2 and 1000),created_at timestamptz not null default now(),unique(item_id,user_id));
create table if not exists public.marketplace_sales (id uuid primary key default gen_random_uuid(), item_id uuid not null references public.marketplace_items(id) on delete restrict, creator_id uuid not null references auth.users(id) on delete restrict, buyer_id uuid not null references auth.users(id) on delete restrict, title text not null, amount numeric not null default 0, creator_share numeric not null default 0, platform_share numeric not null default 0, payment_reference text unique, created_at timestamptz not null default now());
create table if not exists public.user_settings (user_id uuid primary key references auth.users(id) on delete cascade, api_keys jsonb not null default '{}', updated_at timestamptz not null default now());
create table if not exists public.user_integrations (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, provider text not null, access_token text not null, refresh_token text, expiry_date bigint, email text, scopes text[] not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,provider));
create table if not exists public.general_chat_threads (id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade, title text not null, messages jsonb not null default '[]', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.credit_purchases (reference text primary key, user_id uuid not null references auth.users(id) on delete cascade, amount integer not null check(amount > 0), credits integer not null check(credits > 0), plan text not null, created_at timestamptz not null default now());

alter table public.profiles enable row level security; alter table public.missions enable row level security; alter table public.messages enable row level security; alter table public.activities enable row level security; alter table public.creations enable row level security; alter table public.workers enable row level security; alter table public.marketplace_items enable row level security; alter table public.marketplace_sales enable row level security; alter table public.mentor_progress enable row level security; alter table public.marketplace_reviews enable row level security;
alter table public.user_settings enable row level security;
alter table public.user_integrations enable row level security;
alter table public.general_chat_threads enable row level security;
alter table public.credit_purchases enable row level security;

create policy "profile owner read" on public.profiles for select using (auth.uid()=id);
create policy "mission owner access" on public.missions for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "message owner access" on public.messages for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "activity owner access" on public.activities for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "creation owner access" on public.creations for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "published creations public read" on public.creations for select using (published=true);
create policy "worker owner access" on public.workers for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "marketplace public read" on public.marketplace_items for select using (true);
create policy "marketplace owner write" on public.marketplace_items for insert with check (auth.uid()=owner_id);
create policy "marketplace owner update" on public.marketplace_items for update using (auth.uid()=owner_id) with check (auth.uid()=owner_id);
create policy "marketplace owner delete" on public.marketplace_items for delete using (auth.uid()=owner_id);
create policy "sale participants read" on public.marketplace_sales for select using (auth.uid()=creator_id or auth.uid()=buyer_id);
create policy "mentor owner access" on public.mentor_progress for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy "review public read" on public.marketplace_reviews for select using(true);
create policy "review owner write" on public.marketplace_reviews for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy "settings owner access" on public.user_settings for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy "integration owner access" on public.user_integrations for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy "general chat owner access" on public.general_chat_threads for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy "credit purchase owner read" on public.credit_purchases for select using(auth.uid()=user_id);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into public.profiles(id,email,credits,plan) values(new.id,coalesce(new.email,''),100,'free') on conflict(id) do nothing; return new; end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
insert into public.profiles(id,email,credits,plan) select id,coalesce(email,''),100,'free' from auth.users on conflict(id) do nothing;

create or replace function public.spend_credits(amount integer) returns integer language plpgsql security definer set search_path=public as $$
declare balance integer;
begin
  if amount <= 0 then raise exception 'Invalid credit amount'; end if;
  insert into public.profiles(id,email,credits,plan)
  values(auth.uid(),coalesce(auth.jwt()->>'email',''),100,'free')
  on conflict(id) do nothing;
  update public.profiles set credits=credits-amount where id=auth.uid() and credits>=amount returning credits into balance;
  if balance is null then raise exception 'Insufficient credits'; end if;
  return balance;
end;
$$;
grant execute on function public.spend_credits(integer) to authenticated;

create or replace function public.ensure_user_profile() returns integer language plpgsql security definer set search_path=public as $$
declare balance integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.profiles(id,email,credits,plan)
  values(auth.uid(),coalesce(auth.jwt()->>'email',''),100,'free')
  on conflict(id) do nothing;
  select credits into balance from public.profiles where id=auth.uid();
  return balance;
end;
$$;
grant execute on function public.ensure_user_profile() to authenticated;

create or replace function public.complete_credit_purchase(p_user_id uuid, p_reference text, p_amount integer, p_credits integer, p_plan text)
returns integer language plpgsql security definer set search_path=public as $$
declare balance integer;
begin
  if p_reference is null or char_length(p_reference) < 4 then raise exception 'Invalid payment reference'; end if;
  insert into public.credit_purchases(reference,user_id,amount,credits,plan) values(p_reference,p_user_id,p_amount,p_credits,p_plan);
  insert into public.profiles(id,email,credits,plan) values(p_user_id,'',100,'free') on conflict(id) do nothing;
  update public.profiles set credits=credits+p_credits, plan=p_plan where id=p_user_id returning credits into balance;
  return balance;
exception when unique_violation then
  raise exception 'Payment reference already processed';
end;
$$;
revoke all on function public.complete_credit_purchase(uuid,text,integer,integer,text) from public, anon, authenticated;
grant execute on function public.complete_credit_purchase(uuid,text,integer,integer,text) to service_role;

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
