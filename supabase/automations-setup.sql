-- Automation Setup Wizard table
CREATE TABLE IF NOT EXISTS public.automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic text NOT NULL,
  platforms text[] NOT NULL,
  post_time text NOT NULL,
  post_days text NOT NULL,
  timezone text NOT NULL DEFAULT 'Africa/Lagos',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users own automations" ON public.automations;
CREATE POLICY "users own automations"
  ON public.automations
  FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS automations_user_idx ON public.automations(user_id);