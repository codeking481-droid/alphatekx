-- Atomic, idempotent credit settlement for confirmed provider executions.
-- Apply after schema.sql and composio-connected-apps.sql.

alter table public.profiles
  add column if not exists monthly_credits integer not null default 0,
  add column if not exists purchased_credits integer not null default 0,
  add column if not exists monthly_credits_used integer not null default 0,
  add column if not exists total_credits_spent integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

alter table public.credit_transactions
  add column if not exists idempotency_key text,
  add column if not exists platform text,
  add column if not exists provider_id text,
  add column if not exists description text,
  add column if not exists status text not null default 'success';

create unique index if not exists idx_credit_transactions_execution_idempotency
  on public.credit_transactions(user_id, idempotency_key)
  where idempotency_key is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_credits_non_negative'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_credits_non_negative check (credits >= 0);
  end if;
end $$;

create or replace function public.deduct_credit_atomic(
  p_user_id uuid,
  p_amount integer,
  p_idempotency_key text,
  p_description text,
  p_platform text,
  p_provider_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_existing public.credit_transactions%rowtype;
  v_monthly_used integer := 0;
  v_purchased_used integer := 0;
  v_new_balance integer;
begin
  if p_user_id is null or coalesce(trim(p_idempotency_key), '') = '' then
    return jsonb_build_object('status', 'error', 'message', 'User and idempotency key are required');
  end if;
  if p_amount <= 0 then
    return jsonb_build_object('status', 'error', 'message', 'Amount must be positive');
  end if;

  select * into v_existing
  from public.credit_transactions
  where user_id = p_user_id and idempotency_key = p_idempotency_key
  limit 1;
  if v_existing.id is not null then
    return jsonb_build_object(
      'status', 'already_processed',
      'transaction_id', v_existing.id,
      'new_balance', v_existing.balance_after,
      'provider_id', v_existing.provider_id
    );
  end if;

  select * into v_profile
  from public.profiles
  where id = p_user_id
  for update;
  if v_profile.id is null then
    return jsonb_build_object('status', 'error', 'message', 'Profile not found');
  end if;
  if coalesce(v_profile.credits, 0) < p_amount then
    return jsonb_build_object('status', 'insufficient', 'balance', coalesce(v_profile.credits, 0));
  end if;

  -- Keep the optional monthly/purchased ledgers aligned where they are in use.
  if coalesce(v_profile.monthly_credits, 0) + coalesce(v_profile.purchased_credits, 0) >= p_amount then
    v_monthly_used := least(coalesce(v_profile.monthly_credits, 0), p_amount);
    v_purchased_used := p_amount - v_monthly_used;
  end if;
  v_new_balance := v_profile.credits - p_amount;

  update public.profiles
  set credits = v_new_balance,
      monthly_credits = greatest(0, monthly_credits - v_monthly_used),
      purchased_credits = greatest(0, purchased_credits - v_purchased_used),
      monthly_credits_used = monthly_credits_used + v_monthly_used,
      total_credits_spent = total_credits_spent + p_amount,
      updated_at = now()
  where id = p_user_id;

  insert into public.credit_transactions (
    user_id, type, credits_removed, balance_after, reference, reason, description,
    idempotency_key, platform, provider_id, status, metadata
  ) values (
    p_user_id, 'execution', p_amount, v_new_balance, p_idempotency_key,
    p_description, p_description, p_idempotency_key, p_platform, p_provider_id,
    'success', jsonb_build_object('platform', p_platform, 'provider_id', p_provider_id)
  )
  returning * into v_existing;

  return jsonb_build_object(
    'status', 'success',
    'new_balance', v_new_balance,
    'transaction_id', v_existing.id,
    'provider_id', p_provider_id
  );
exception
  when unique_violation then
    select * into v_existing
    from public.credit_transactions
    where user_id = p_user_id and idempotency_key = p_idempotency_key
    limit 1;
    return jsonb_build_object(
      'status', 'already_processed',
      'transaction_id', v_existing.id,
      'new_balance', v_existing.balance_after,
      'provider_id', v_existing.provider_id
    );
end;
$$;

revoke all on function public.deduct_credit_atomic(uuid, integer, text, text, text, text) from public;
revoke all on function public.deduct_credit_atomic(uuid, integer, text, text, text, text) from anon;
revoke all on function public.deduct_credit_atomic(uuid, integer, text, text, text, text) from authenticated;
grant execute on function public.deduct_credit_atomic(uuid, integer, text, text, text, text) to service_role;

alter table public.connector_executions
  drop constraint if exists connector_executions_status_check;
alter table public.connector_executions
  add constraint connector_executions_status_check
  check (status in ('claimed', 'running', 'provider_confirmed', 'succeeded', 'failed'));
