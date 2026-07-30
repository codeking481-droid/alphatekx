-- Automation Setup Wizard table
DROP TABLE IF EXISTS public.automations CASCADE;
CREATE TABLE public.automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic text NOT NULL,
  goal text NOT NULL DEFAULT '',
  platforms text[] NOT NULL,
  audience text NOT NULL DEFAULT '',
  tone text NOT NULL DEFAULT '',
  content_types text[] NOT NULL DEFAULT '{}',
  post_time text NOT NULL,
  post_days text[] NOT NULL DEFAULT '{}',
  timezone text NOT NULL DEFAULT 'Africa/Lagos',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  credits_estimated integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users own automations" ON public.automations;
CREATE POLICY "users own automations"
  ON public.automations
  FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS automations_user_idx ON public.automations(user_id);