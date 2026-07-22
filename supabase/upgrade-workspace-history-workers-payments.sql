-- Run this once in Supabase SQL Editor before deploying this release.
alter table public.workers add column if not exists provider text not null default 'groq';
alter table public.workers add column if not exists model text not null default '';

create table if not exists public.general_chat_threads (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  messages jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.general_chat_threads enable row level security;
drop policy if exists "general chat owner access" on public.general_chat_threads;
create policy "general chat owner access" on public.general_chat_threads for all using(auth.uid()=user_id) with check(auth.uid()=user_id);

create table if not exists public.credit_purchases (
  reference text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null check(amount > 0),
  credits integer not null check(credits > 0),
  plan text not null,
  created_at timestamptz not null default now()
);
alter table public.credit_purchases enable row level security;
drop policy if exists "credit purchase owner read" on public.credit_purchases;
create policy "credit purchase owner read" on public.credit_purchases for select using(auth.uid()=user_id);

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
