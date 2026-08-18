-- Durable automation state for the LinkedIn scheduler.
create table if not exists public.agents (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists agents_user_id_idx on public.agents(user_id);

create table if not exists public.agent_executions (
  id text primary key,
  agent_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_executions_agent_id_idx on public.agent_executions(agent_id);

alter table public.agents enable row level security;
alter table public.agent_executions enable row level security;

drop policy if exists "agent owner access" on public.agents;
create policy "agent owner access" on public.agents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "agent execution owner access" on public.agent_executions;
create policy "agent execution owner access" on public.agent_executions
  for all using (
    exists (
      select 1 from public.agents
      where agents.id = agent_executions.agent_id
        and agents.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.agents
      where agents.id = agent_executions.agent_id
        and agents.user_id = auth.uid()
    )
  );
