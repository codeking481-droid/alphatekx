Integration test plan for Self-Healing V1

Goal: Verify that transient provider failures (401 auth, 429 rate limit, 5xx server errors) cause the expected self-healing behavior:

- Auth (401/403) -> automation is paused, `automations.health_status` set to `needs_reconnect` and `workflow_runs` records a failed run with `plain_english_error` instructing reconnect.
- Rate limit (429) -> task is retried with backoffs and `workflow_runs` contains retry entries; if retries exhausted, `automations.health_status` -> `needs_attention`.
- Server error (5xx) -> retried with backoff; transient success should record success and not charge credits.

Approach:

1. Unit/Component tests against `src/lib/selfHealing/*` using a mocked Supabase client to observe inserts/updates.
2. Integration test that starts `server.mjs` in a test mode with a local mock provider service and calls the public endpoints that cause provider executions.

Requirements to run locally:

- Node 18+
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` set for a test DB (or use local supabase emulation)
- Shell commands (PowerShell or bash)

Commands to run (future):

```bash
node scripts/integration/self-healing-runner.mjs
```

Next steps: implement the `self-healing-runner.mjs` harness to perform the tests above.
