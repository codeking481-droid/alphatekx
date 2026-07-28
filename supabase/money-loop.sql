-- Consent-aware Money Loop persistence.
-- Outreach remains approval-gated; this migration does not enable unsolicited DMs.

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  post_id text,
  provider_post_id text not null,
  provider_comment_id text not null,
  lead_name text,
  lead_handle text,
  lead_phone text,
  lead_email text,
  comment_text text not null,
  consent_keyword text,
  outreach_approved_at timestamptz,
  dm_sent boolean not null default false,
  dm_provider_id text,
  status text not null default 'new' check (status in ('new','contacted','qualified','closed','lost')),
  source_post_content text,
  estimated_value bigint not null default 0 check (estimated_value >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, platform, provider_comment_id)
);

create table if not exists public.content_performance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_post_id text not null,
  platform text not null,
  likes integer not null default 0 check (likes >= 0),
  comments integer not null default 0 check (comments >= 0),
  shares integer not null default 0 check (shares >= 0),
  views integer not null default 0 check (views >= 0),
  leads_generated integer not null default 0 check (leads_generated >= 0),
  engagement_rate double precision not null default 0 check (engagement_rate >= 0),
  hook_text text,
  hook_type text,
  image_type text,
  published_at timestamptz,
  measured_at timestamptz not null default now(),
  unique(user_id, platform, provider_post_id)
);

create table if not exists public.auto_dm_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  platform text not null,
  dm_text text not null,
  provider_id text,
  status text not null check (status in ('awaiting_approval','sending','sent','failed')),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id, lead_id, dm_text)
);

create table if not exists public.content_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  insight text not null,
  hook_type text,
  image_type text,
  best_time time,
  evidence jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_leads_user_created on public.leads(user_id, created_at desc);
create index if not exists idx_leads_user_status on public.leads(user_id, status);
create index if not exists idx_performance_user_measured on public.content_performance(user_id, measured_at desc);
create index if not exists idx_insights_user_created on public.content_insights(user_id, created_at desc);

alter table public.leads enable row level security;
alter table public.content_performance enable row level security;
alter table public.auto_dm_logs enable row level security;
alter table public.content_insights enable row level security;

drop policy if exists "leads owner read" on public.leads;
create policy "leads owner read" on public.leads for select using (auth.uid() = user_id);
drop policy if exists "leads owner update" on public.leads;
create policy "leads owner update" on public.leads for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "performance owner read" on public.content_performance;
create policy "performance owner read" on public.content_performance for select using (auth.uid() = user_id);
drop policy if exists "dm logs owner read" on public.auto_dm_logs;
create policy "dm logs owner read" on public.auto_dm_logs for select using (auth.uid() = user_id);
drop policy if exists "insights owner read" on public.content_insights;
create policy "insights owner read" on public.content_insights for select using (auth.uid() = user_id);
