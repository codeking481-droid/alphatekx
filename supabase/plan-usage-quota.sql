-- ============================================================
-- PLAN USAGE QUOTA — durable, race-safe per-plan consumption
-- ============================================================
-- Replaces the ephemeral data/user-restore-quotas.json counters
-- with a Supabase-backed store that survives deploys.
--
-- Identity mirrors server/restoreQuotas.mjs:
--   signed-in users -> 'u:<userId>'   anonymous trials -> 'ip:<hash16>'
-- Period is the UTC month: 'YYYY-MM'
--
-- Limits are passed in per-call from PLAN_LIMITS (-1 = unlimited)
-- so this stays a dumb, plan-agnostic counter.

create table if not exists public.plan_usage (
  id uuid primary key default gen_random_uuid(),
  identity text not null,
  period text not null,
  fixes_used int not null default 0,
  scans_used int not null default 0,
  sites jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (identity, period)
);

alter table public.plan_usage enable row level security;
-- No RLS policies: accessible only via service role (server-side).

-- ------------------------------------------------------------
-- Atomic check-and-consume. Returns ok:false + code instead of
-- raising, so the server can map straight to HTTP 402 payloads.
-- ------------------------------------------------------------
create or replace function public.consume_plan_quota(
  p_identity text,
  p_period text,
  p_kind text,            -- 'fix' | 'scan'
  p_hostname text,        -- required for 'fix' site tracking
  p_fixes_limit int,      -- -1 = unlimited
  p_scans_limit int,      -- -1 = unlimited
  p_sites_limit int       -- -1 = unlimited
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.plan_usage%rowtype;
  v_is_new_site boolean;
begin
  insert into public.plan_usage (identity, period)
  values (p_identity, p_period)
  on conflict (identity, period) do nothing;

  select * into v_row
  from public.plan_usage
  where identity = p_identity and period = p_period
  for update;

  if p_kind = 'scan' then
    if p_scans_limit >= 0 and v_row.scans_used >= p_scans_limit then
      return jsonb_build_object(
        'ok', false,
        'code', 'QUOTA_SCANS_EXHAUSTED',
        'scans_used', v_row.scans_used,
        'scans_limit', p_scans_limit
      );
    end if;
    update public.plan_usage
      set scans_used = scans_used + 1, updated_at = now()
      where identity = p_identity and period = p_period;
    return jsonb_build_object('ok', true, 'scans_used', v_row.scans_used + 1);
  end if;

  -- p_kind = 'fix'
  if p_fixes_limit >= 0 and v_row.fixes_used >= p_fixes_limit then
    return jsonb_build_object(
      'ok', false,
      'code', 'QUOTA_FIXES_EXHAUSTED',
      'fixes_used', v_row.fixes_used,
      'fixes_limit', p_fixes_limit
    );
  end if;

  v_is_new_site := p_hostname is not null
    and not (v_row.sites ? p_hostname);
  if v_is_new_site and p_sites_limit >= 0
     and (select count(*) from jsonb_object_keys(v_row.sites)) >= p_sites_limit then
    return jsonb_build_object(
      'ok', false,
      'code', 'QUOTA_SITES_EXHAUSTED',
      'sites_used', (select count(*) from jsonb_object_keys(v_row.sites)),
      'sites_limit', p_sites_limit
    );
  end if;

  update public.plan_usage
    set fixes_used = fixes_used + 1,
        sites = case
          when p_hostname is not null then v_row.sites || jsonb_build_object(p_hostname, true)
          else v_row.sites
        end,
        updated_at = now()
    where identity = p_identity and period = p_period;

  return jsonb_build_object(
    'ok', true,
    'fixes_used', v_row.fixes_used + 1,
    'sites_used', (select count(*) from jsonb_object_keys(
      case when p_hostname is not null
        then v_row.sites || jsonb_build_object(p_hostname, true)
        else v_row.sites end))
  );
end;
$$;

-- ------------------------------------------------------------
-- Read-only counter lookup (for status endpoints / dashboards).
-- ------------------------------------------------------------
create or replace function public.get_plan_quota(
  p_identity text,
  p_period text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_build_object(
      'ok', true,
      'fixes_used', u.fixes_used,
      'scans_used', u.scans_used,
      'sites', u.sites,
      'sites_used', (select count(*) from jsonb_object_keys(u.sites)),
      'period', u.period
    ),
    jsonb_build_object('ok', true, 'fixes_used', 0, 'scans_used', 0, 'sites_used', 0, 'sites', '{}'::jsonb, 'period', p_period)
  )
  from (
    select * from public.plan_usage
    where identity = p_identity and period = p_period
    limit 1
  ) u;
$$;
