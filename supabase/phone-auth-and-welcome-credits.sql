-- Firebase phone-to-Supabase identity bridge.
-- Only a keyed phone fingerprint is stored; raw phone numbers never enter this table.

CREATE TABLE IF NOT EXISTS public.phone_auth_links (
  phone_fingerprint text PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  internal_email text NOT NULL UNIQUE,
  firebase_uid text NOT NULL UNIQUE,
  verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.phone_auth_links ENABLE ROW LEVEL SECURITY;

-- No browser-facing policies: this table is service-role only.

