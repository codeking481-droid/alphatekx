-- One human-verification bonus per device fingerprint or Google identity.
-- Run this migration in the production Supabase SQL editor before deployment.

CREATE TABLE IF NOT EXISTS public.device_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint_hash TEXT NOT NULL UNIQUE,
  google_sub TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.google_signup_claims (
  google_sub TEXT PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_claims_fingerprint_hash
  ON public.device_claims(fingerprint_hash);
CREATE INDEX IF NOT EXISTS idx_device_claims_google_sub
  ON public.device_claims(google_sub);
CREATE INDEX IF NOT EXISTS idx_device_claims_user_id
  ON public.device_claims(user_id);

ALTER TABLE public.device_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_signup_claims ENABLE ROW LEVEL SECURITY;
-- No browser policy is intentional. Claims are checked only by the server.

ALTER TABLE public.profiles ALTER COLUMN credits SET DEFAULT 0;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles(id, email, credits, plan, monthly_credits, purchased_credits)
  VALUES(new.id, coalesce(new.email, ''), 0, 'free', 0, 0)
  ON CONFLICT(id) DO NOTHING;
  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE balance integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  INSERT INTO public.profiles(id, email, credits, plan, monthly_credits, purchased_credits)
  VALUES(auth.uid(), coalesce(auth.jwt()->>'email', ''), 0, 'free', 0, 0)
  ON CONFLICT(id) DO NOTHING;
  SELECT credits INTO balance FROM public.profiles WHERE id = auth.uid();
  RETURN balance;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ensure_user_profile() TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_device_bonus(
  p_user_id UUID,
  p_fingerprint_hash TEXT,
  p_google_sub TEXT,
  p_email TEXT
)
RETURNS TABLE(claimed BOOLEAN, reason TEXT, credits INTEGER, credits_added INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_claim public.device_claims%ROWTYPE;
  current_credits INTEGER;
  bonus_delta INTEGER;
  google_credit_added INTEGER := 0;
BEGIN
  IF p_user_id IS NULL OR length(trim(p_fingerprint_hash)) < 32 OR length(trim(p_google_sub)) < 2 THEN
    RAISE EXCEPTION 'Invalid human verification claim';
  END IF;

  -- Serialize competing requests for either identity before checking/inserting.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_fingerprint_hash, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_google_sub, 1));

  INSERT INTO public.profiles(id, email, credits, plan, monthly_credits, purchased_credits)
  VALUES(p_user_id, coalesce(p_email, ''), 0, 'free', 0, 0)
  ON CONFLICT(id) DO NOTHING;

  SELECT coalesce(p.credits, 0) INTO current_credits
  FROM public.profiles p
  WHERE p.id = p_user_id
  FOR UPDATE;

  INSERT INTO public.google_signup_claims(google_sub, user_id, email)
  VALUES(p_google_sub, p_user_id, p_email)
  ON CONFLICT DO NOTHING;
  IF FOUND THEN
    google_credit_added := 1;
    current_credits := current_credits + 1;
    UPDATE public.profiles
    SET credits = current_credits,
        purchased_credits = coalesce(purchased_credits, 0) + 1
    WHERE id = p_user_id;
    INSERT INTO public.credit_transactions(
      user_id, type, credits_added, balance_after, reference, reason, metadata
    ) VALUES (
      p_user_id, 'welcome', 1, current_credits, 'welcome-google:' || p_user_id::text,
      'Google signup tester credit', jsonb_build_object('source', 'google_signup')
    );
  END IF;

  SELECT * INTO existing_claim
  FROM public.device_claims
  WHERE fingerprint_hash = p_fingerprint_hash OR google_sub = p_google_sub
  LIMIT 1;

  IF existing_claim.id IS NOT NULL THEN
    RETURN QUERY SELECT
      false,
      CASE WHEN existing_claim.google_sub = p_google_sub
        THEN 'google_account_already_claimed'
        ELSE 'device_already_claimed'
      END,
      current_credits,
      google_credit_added;
    RETURN;
  END IF;

  INSERT INTO public.device_claims(fingerprint_hash, google_sub, user_id, email)
  VALUES(p_fingerprint_hash, p_google_sub, p_user_id, p_email);

  -- Google grants the first tester credit. Human verification raises a new
  -- account to a total of 10 without replacing purchased or earned credits.
  bonus_delta := greatest(0, 10 - current_credits);
  UPDATE public.profiles
  SET credits = current_credits + bonus_delta,
      purchased_credits = coalesce(purchased_credits, 0) + bonus_delta
  WHERE id = p_user_id;

  INSERT INTO public.credit_transactions(
    user_id, type, credits_added, balance_after, reference, reason, metadata
  ) VALUES (
    p_user_id,
    'welcome',
    bonus_delta,
    current_credits + bonus_delta,
    'device-human-bonus:' || p_user_id::text,
    'Device human-verification welcome bonus',
    jsonb_build_object('source', 'device_fingerprint')
  );

  RETURN QUERY SELECT true, 'bonus_unlocked', current_credits + bonus_delta, google_credit_added + bonus_delta;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_device_bonus(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_device_bonus(UUID, TEXT, TEXT, TEXT) TO service_role;
