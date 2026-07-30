-- AlphaTekX Planner - Automation Plans & Runs
create table if not exists public.automation_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platforms text[] not null default '{}',
  task text not null default '',
  schedule jsonb not null default '{}'::jsonb,
  content_rules jsonb not null default '{}'::jsonb,
  safety jsonb not null default '{}'::jsonb,
  total_credits integer not null default 0,
  total_runs integer not null default 0,
  posts jsonb not null default '[]'::jsonb,
  status text not null default 'generating' check (status in ('generating','ready_for_confirmation','active','paused','completed','cancelled')),
  progress integer not null default 0 check (progress between 0 and 100),
  current_run integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.automation_plans(id) on delete cascade,
  run_number integer not null,
  scheduled_at timestamptz,
  per_platform_content jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','posted','failed','skipped')),
  created_at timestamptz not null default now()
);

alter table public.automation_plans enable row level security;
alter table public.automation_runs enable row level security;

create policy "automation plans owner access" on public.automation_plans for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "automation runs owner access" on public.automation_runs for all using (exists (select 1 from public.automation_plans where id=plan_id and user_id=auth.uid())) with check (exists (select 1 from public.automation_plans where id=plan_id and user_id=auth.uid()));

create index if not exists idx_automation_plans_user on public.automation_plans(user_id, created_at desc);
create index if not exists idx_automation_runs_plan on public.automation_runs(plan_id, run_number);