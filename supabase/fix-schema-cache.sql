-- ALPHATEKX — PostgREST schema-cache auto-heal (run ONCE in the Supabase SQL editor)
--
-- Your deployments table already exists; this only adds the helper the server
-- calls when PostgREST's schema cache goes stale and reports the table as
-- "missing". Safe to run at any time — it never touches your data.

create or replace function public.reload_pgrst_schema()
returns void
language plpgsql
security definer
as $$
begin
  notify pgrst, 'reload schema';
end;
$$;

-- Immediate refresh so the API sees every current table right away.
notify pgrst, 'reload schema';
