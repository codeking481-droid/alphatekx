create table if not exists public.features (
  id text primary key,
  name text not null,
  state text not null check (state in ('disabled','beta','public','maintenance')),
  category text not null default 'connector',
  stop_existing boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by text not null default 'system'
);

create table if not exists public.feature_beta_users (
  email text primary key,
  added_at timestamptz not null default now(),
  added_by text not null
);

create table if not exists public.feature_audit_log (
  id uuid primary key,
  feature_id text not null references public.features(id),
  old_state text not null,
  new_state text not null,
  stop_existing boolean not null,
  changed_at timestamptz not null default now(),
  changed_by text not null
);

alter table public.features enable row level security;
alter table public.feature_beta_users enable row level security;
alter table public.feature_audit_log enable row level security;

insert into public.features(id,name,state,category) values
('linkedin','LinkedIn','public','connector'),
('facebook','Facebook','beta','connector'),
('instagram','Instagram','beta','connector'),
('whatsapp','WhatsApp','beta','connector'),
('x','X','beta','connector'),
('tiktok','TikTok','disabled','connector'),
('google','Google','beta','connector'),
('gmail','Gmail','beta','connector'),
('google_sheets','Google Sheets','beta','connector'),
('google_calendar','Google Calendar','beta','connector'),
('google_drive','Google Drive','beta','connector'),
('telegram','Telegram','beta','connector'),
('slack','Slack','beta','connector'),
('discord','Discord','beta','connector'),
('company_builder','Company Builder','disabled','product'),
('image_generator','AI Image Generator','disabled','product'),
('video_generator','AI Video Generator','disabled','product')
on conflict(id) do nothing;
