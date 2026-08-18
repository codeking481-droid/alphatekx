-- Provider-neutral Composio connector persistence.
-- Tokens remain in Composio. AlphaTekx stores references and safe metadata only.

ALTER TABLE IF EXISTS public.connected_accounts
  ADD COLUMN IF NOT EXISTS connection_backend text NOT NULL DEFAULT 'native',
  ADD COLUMN IF NOT EXISTS toolkit_slug text,
  ADD COLUMN IF NOT EXISTS composio_connected_account_id text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'connected',
  ADD COLUMN IF NOT EXISTS display_label text,
  ADD COLUMN IF NOT EXISTS account_metadata jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS disconnected_at timestamptz;

CREATE INDEX IF NOT EXISTS connected_accounts_composio_lookup
  ON public.connected_accounts(user_id, toolkit_slug, connection_backend);

CREATE TABLE IF NOT EXISTS public.connector_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connected_account_id uuid REFERENCES public.connected_accounts(id) ON DELETE SET NULL,
  toolkit_slug text NOT NULL,
  capability_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('claimed', 'running', 'succeeded', 'failed')),
  approved_parameters_hash text,
  approval_id text NOT NULL,
  idempotency_key text NOT NULL,
  provider_execution_id text,
  result_metadata jsonb NOT NULL DEFAULT '{}',
  credits_charged integer NOT NULL DEFAULT 0,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS connector_executions_history
  ON public.connector_executions(user_id, toolkit_slug, created_at DESC);

ALTER TABLE public.connector_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users own connector executions" ON public.connector_executions;
CREATE POLICY "users own connector executions"
  ON public.connector_executions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Existing native rows are explicitly retained as native.
UPDATE public.connected_accounts
SET connection_backend = 'native'
WHERE connection_backend IS NULL;
