---
title: "feat(self-healing): v1 self-healing engine — loop guard, retries, token refresh, time-machine, health UI"
labels: enhancement, automation, reliability
---

## Summary

This PR introduces the Self-Healing Engine V1 for AlphaTekX. It implements automatic resilience for automations and connector executions so that transient provider failures do not silently fail or incorrectly charge credits. Key capabilities:

- Loop guard to detect rapid repeated failures and pause automations.
- Plain-English error translator and smart retry/backoff logic.
- Token manager with auto-refresh and a reconnect API for manual fixes.
- Time-machine (version snapshots) and rollback API for automation configs.
- Health dashboard UI updates with realtime `workflow_runs` and `automations` health badges and actions (Reconnect / Retry Now).
- Global wrapper around `alphaConnector.executeProviderAction` to defer credit settlement and add retries for transient errors.
- DB migration: `db/self_healing_v1.sql` (creates `workflow_runs`, `connections`, adds fields to `automations`).

## Files changed (high level)

- `db/self_healing_v1.sql` — migration for workflow runs, connections, automations fields
- `src/lib/selfHealing/*` — `loopGuard`, `errorTranslator`, `smartRetry`, `tokenManager`, `timeMachine`
- `server.mjs` — wiring: loop guard checks, workflow_runs REST writes, global provider wrapper, self-healing integration points
- `src/pages/ActiveAutomations.tsx` — health UI: badges, Reconnect and Retry buttons, realtime subscriptions
- `api/connections/reconnect/route.ts` and `api/automations/[id]/rollback/route.ts` — reconnect and rollback endpoints
- `scripts/self-healing-tests.mjs` — repository static checks

## Checklist

- [x] DB migration file added (`db/self_healing_v1.sql`) — apply in Supabase/staging
- [x] Loop guard implemented and wired
- [x] Plain-English error translator + smart retry implemented and wired
- [x] Token refresh + reconnect API implemented
- [x] Time-machine + rollback implemented
- [x] Health dashboard UI + realtime updates implemented
- [x] Global provider wrapper added to reduce transient failures
- [x] Static tests added and passing: `node scripts/self-healing-tests.mjs` (5/5 pass)
- [x] Production build completed locally (`npm run build`)

## How to review / test locally

1. Ensure branch `pr/self-healing-v1-20260809-04` is checked out locally.
2. Run the static checks:

```bash
node scripts/self-healing-tests.mjs
npm run typecheck
npm run build
```

3. Optional: run the server locally and trigger provider failures (simulate 401/429/5xx) to observe `workflow_runs` entries and `automations.health_status` transitions.

## Notes & next steps

- Add integration tests that spin up a test server and mock provider responses (401/429/5xx) — optional but recommended.
- Add CI job to run `scripts/self-healing-tests.mjs` and optionally integration tests.
- Verify `db/self_healing_v1.sql` migration in staging before production deploy.

If you'd like, I can open the PR page for you or add integration tests next.
