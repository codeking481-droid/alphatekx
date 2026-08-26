-- Luxury onboarding popup — once per user, premium first impression
alter table public.profiles add column if not exists has_seen_onboarding boolean not null default false;
-- Allow users to mark onboarding as seen (client-side update)
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'profile owner update' and tablename = 'profiles') then
    create policy "profile owner update" on public.profiles for update using (auth.uid()=id) with check (auth.uid()=id);
  end if;
end $$;
-- Backfill: if you want existing users to NOT see popup, uncomment:
-- update public.profiles set has_seen_onboarding = true where has_seen_onboarding = false;
