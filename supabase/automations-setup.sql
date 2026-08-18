-- V1 Core Engine: Automations & Posts tables.
-- This migration is intentionally non-destructive: production automation and
-- execution evidence must survive every deployment and schema refresh.

CREATE TABLE IF NOT EXISTS public.automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic text NOT NULL,
  goal text NOT NULL DEFAULT '',
  platforms text[] NOT NULL DEFAULT '{}',
  audience text NOT NULL DEFAULT '',
  tone text NOT NULL DEFAULT '',
  post_length text NOT NULL DEFAULT 'medium' CHECK (post_length IN ('short','medium','long')),
  post_time text NOT NULL,
  post_days text[] NOT NULL DEFAULT '{}',
  timezone text NOT NULL DEFAULT 'Africa/Lagos',
  next_post_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users own automations" ON public.automations;
CREATE POLICY "users own automations" ON public.automations FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS automations_active_idx ON public.automations(status) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  image_url text NOT NULL DEFAULT '',
  platform text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','queued','posted','failed')),
  scheduled_for timestamptz,
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users own posts" ON public.posts;
CREATE POLICY "users own posts" ON public.posts FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS posts_automation_idx ON public.posts(automation_id);
