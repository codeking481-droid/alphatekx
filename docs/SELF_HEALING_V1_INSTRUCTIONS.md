Self-Healing V1 — Instructions and vetting notes

1) Apply the SQL

 - Open your Supabase project -> SQL Editor
 - Paste the contents of `db/self_healing_v1.sql` and run it
 - Verify tables `workflow_runs` and `connections` exist, and `automations` has the new columns
 - Enable realtime replication for `workflow_runs`, `connections`, and `automations` in Supabase realtime settings

2) Safety notes

 - This migration does NOT drop or modify existing columns except adding new ones and creating new tables/indexes
 - Review policies/row-level security to ensure your app can read/write these tables from the server (service role key recommended for server operations)

3) Next steps for the repo changes

 - The server will insert `workflow_runs` and update `automations.health_status` on connector failures.
 - Frontend UI shows `plain_english_error` and `health_status` badges; users can resume or reconnect via existing connectors flow.

4) How to test once SQL is applied

 - Trigger an automation run that causes a connector error (e.g., revoke a token), then check `workflow_runs` contains a failed row and `automations.health_status` is set to `needs_reconnect` or `needs_attention`.
 - Test loop guard by simulating a rapid series of failures (insert many `workflow_runs` within 60s) and confirm automation is paused with `paused_loop` health status.
