-- RPC function to ensure user profile exists with initial 1 credit
CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  current_user_id uuid;
  current_user_email text;
BEGIN
  -- Get the current authenticated user
  current_user_id := auth.uid();
  current_user_email := (SELECT email FROM auth.users WHERE id = current_user_id);

  -- Exit early if not authenticated
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Insert profile if it doesn't exist, with 1 credit as default
  INSERT INTO public.profiles (id, email, credits, plan, display_name)
  VALUES (current_user_id, current_user_email, 1, 'free', '')
  ON CONFLICT (id) DO NOTHING;

  -- If the profile was created with 0 credits and this is first login, set to 1
  UPDATE public.profiles
  SET credits = CASE 
    WHEN credits = 0 AND created_at > NOW() - INTERVAL '1 minute' THEN 1
    ELSE credits
  END
  WHERE id = current_user_id AND credits = 0;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.ensure_user_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_user_profile() TO service_role;
