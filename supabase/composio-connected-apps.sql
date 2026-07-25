-- Alpha Connector Connections
-- Stores references to Composio-powered connected accounts
-- No OAuth tokens stored here — only safe references

CREATE TABLE IF NOT EXISTS public.alpha_connected_apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  connection_id text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  provider_app_id text,
  metadata jsonb NOT NULL DEFAULT '{}',
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider)
);

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS idx_alpha_connected_apps_user 
  ON public.alpha_connected_apps(user_id, provider);

-- Execution history for connected app actions
CREATE TABLE IF NOT EXISTS public.alpha_connector_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  action text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  request_params jsonb NOT NULL DEFAULT '{}',
  response_data jsonb,
  error_message text,
  execution_time_ms integer,
  performed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alpha_connector_executions_user 
  ON public.alpha_connector_executions(user_id, performed_at DESC);

-- RLS
ALTER TABLE public.alpha_connected_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alpha_connector_executions ENABLE ROW LEVEL SECURITY;

-- Policies: users can only see their own data
CREATE POLICY "users own connected apps" 
  ON public.alpha_connected_apps 
  FOR ALL 
  USING (auth.uid() = user_id) 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users own executions" 
  ON public.alpha_connector_executions 
  FOR ALL 
  USING (auth.uid() = user_id) 
  WITH CHECK (auth.uid() = user_id);
