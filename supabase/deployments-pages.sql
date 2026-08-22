-- ALPHATEKX — whole-site deployments (multi-page hosting)
-- Adds a `pages` JSONB column so ONE deployment name can host an entire
-- restored site: {"/": html, "/about": html, "/pricing": html, ...}
-- Run this ONCE in the Supabase SQL editor (after deployments-table.sql).
-- Safe to re-run.

alter table public.deployments
  add column if not exists pages jsonb not null default '{}'::jsonb;

comment on column public.deployments.pages is 'Whole-site map: pathname → restored HTML. Empty object = single-page deployment.';
