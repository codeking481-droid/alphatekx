-- Atomic, idempotent Paystack settlement. Apply once in Supabase SQL Editor.
-- This is deliberately self-contained: older AlphaTekx installations may not
-- have either billing table yet.
create table if not exists public.credit_purchases (
  reference text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null check (amount > 0),
  credits integer not null check (credits > 0),
  plan text,
  created_at timestamptz not null default now()
);

create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  credits_added integer not null default 0 check (credits_added >= 0),
  credits_removed integer not null default 0 check (credits_removed >= 0),
  balance_after integer,
  reference text,
  automation_id text,
  reason text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists monthly_credits integer not null default 0;
alter table public.profiles add column if not exists purchased_credits integer not null default 0;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

alter table public.credit_purchases add column if not exists reference text;
alter table public.credit_purchases add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.credit_purchases add column if not exists amount integer;
alter table public.credit_purchases add column if not exists credits integer;
alter table public.credit_purchases add column if not exists plan text;
alter table public.credit_purchases add column if not exists balance_after integer;
alter table public.credit_purchases add column if not exists settled_at timestamptz;
alter table public.credit_purchases add column if not exists created_at timestamptz not null default now();

alter table public.credit_transactions add column if not exists user_id uuid references auth.users(id) on delete cascade;
-- Legacy AlphaTekx installations record the signed credit delta in `amount`
-- and enforce NOT NULL. Keep writing it alongside the newer split columns.
alter table public.credit_transactions add column if not exists amount integer not null default 0;
alter table public.credit_transactions add column if not exists type text;
alter table public.credit_transactions add column if not exists credits_added integer not null default 0;
alter table public.credit_transactions add column if not exists credits_removed integer not null default 0;
alter table public.credit_transactions add column if not exists balance_after integer;
alter table public.credit_transactions add column if not exists reference text;
alter table public.credit_transactions add column if not exists automation_id text;
alter table public.credit_transactions add column if not exists reason text;
alter table public.credit_transactions add column if not exists metadata jsonb not null default '{}';
alter table public.credit_transactions add column if not exists created_at timestamptz not null default now();

create unique index if not exists idx_credit_purchases_reference on public.credit_purchases(reference);
create index if not exists idx_credit_purchases_user on public.credit_purchases(user_id, created_at desc);
create index if not exists idx_credit_transactions_user on public.credit_transactions(user_id, created_at desc);

alter table public.credit_purchases enable row level security;
alter table public.credit_transactions enable row level security;

drop policy if exists "credit purchases owner read" on public.credit_purchases;
create policy "credit purchases owner read" on public.credit_purchases
  for select using (auth.uid() = user_id);
drop policy if exists "credit transactions owner read" on public.credit_transactions;
create policy "credit transactions owner read" on public.credit_transactions
  for select using (auth.uid() = user_id);

-- PostgreSQL does not allow CREATE OR REPLACE FUNCTION to rename input
-- parameters. Remove any legacy definition with this exact signature first;
-- purchase and transaction rows are unaffected.
drop function if exists public.settle_paystack_purchase_v2(uuid,text,integer,integer,text,text);

create or replace function public.settle_paystack_purchase_v2(
  p_user_id uuid,
  p_reference text,
  p_amount integer,
  p_credits integer,
  p_plan text,
  p_email text default ''
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  purchase_rec public.credit_purchases%rowtype;
  profile_rec public.profiles%rowtype;
  is_subscription boolean;
  legacy_unclassified integer;
  next_monthly integer;
  next_purchased integer;
  next_balance integer;
begin
  if p_user_id is null then raise exception 'Payment user is required'; end if;
  if p_reference is null or char_length(trim(p_reference)) < 4 then raise exception 'Invalid payment reference'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Invalid payment amount'; end if;
  if p_credits is null or p_credits <= 0 then raise exception 'Invalid credit amount'; end if;

  select * into purchase_rec
  from public.credit_purchases
  where reference = p_reference
  for update;

  if purchase_rec.reference is not null then
    if purchase_rec.user_id <> p_user_id
      or purchase_rec.amount <> p_amount
      or purchase_rec.credits <> p_credits
      or coalesce(purchase_rec.plan, '') <> coalesce(p_plan, '') then
      raise exception 'Payment reference metadata mismatch';
    end if;
    select * into profile_rec from public.profiles where id = p_user_id;
    return jsonb_build_object(
      'balance', coalesce(purchase_rec.balance_after, profile_rec.credits, 0),
      'duplicate', true,
      'credits_added', p_credits,
      'plan', coalesce(profile_rec.plan, p_plan, 'free')
    );
  end if;

  insert into public.profiles(id,email,credits,plan,monthly_credits,purchased_credits)
  values(p_user_id,coalesce(p_email,''),0,'free',0,0)
  on conflict(id) do nothing;

  select * into profile_rec from public.profiles where id = p_user_id for update;
  is_subscription := p_plan is not null and p_plan not in ('free', 'credits');
  legacy_unclassified := greatest(0,
    coalesce(profile_rec.credits,0) - coalesce(profile_rec.monthly_credits,0) - coalesce(profile_rec.purchased_credits,0));

  if is_subscription then
    next_monthly := p_credits;
    next_purchased := coalesce(profile_rec.purchased_credits,0) + legacy_unclassified;
  else
    next_monthly := coalesce(profile_rec.monthly_credits,0);
    next_purchased := coalesce(profile_rec.purchased_credits,0) + legacy_unclassified + p_credits;
  end if;
  next_balance := next_monthly + next_purchased;

  insert into public.credit_purchases(reference,user_id,amount,credits,plan,balance_after,settled_at)
  values(p_reference,p_user_id,p_amount,p_credits,p_plan,next_balance,now());

  update public.profiles set
    credits = next_balance,
    monthly_credits = next_monthly,
    purchased_credits = next_purchased,
    plan = case when is_subscription then p_plan else profile_rec.plan end,
    updated_at = now()
  where id = p_user_id;

  insert into public.credit_transactions(
    user_id,amount,type,credits_added,credits_removed,balance_after,reference,reason,metadata
  ) values(
    p_user_id,p_credits,
    case when is_subscription then 'subscription' else 'purchase' end,
    p_credits,0,next_balance,p_reference,
    case when is_subscription then 'Subscription: '||p_plan else 'Credit purchase' end,
    jsonb_build_object('plan',p_plan,'amount',p_amount,'provider','paystack','settlement','atomic_v2')
  );

  return jsonb_build_object(
    'balance', next_balance,
    'duplicate', false,
    'credits_added', p_credits,
    'plan', case when is_subscription then p_plan else profile_rec.plan end
  );
end;
$$;

revoke all on function public.settle_paystack_purchase_v2(uuid,text,integer,integer,text,text) from public, anon, authenticated;
grant execute on function public.settle_paystack_purchase_v2(uuid,text,integer,integer,text,text) to service_role;
notify pgrst, 'reload schema';
