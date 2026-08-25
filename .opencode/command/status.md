---
description: Show live battle status — phase, progress, success rate, avg time, mem/cpu from state.json and metrics.jsonl
agent: battle-orchestrator
---

Target: $ARGUMENTS

Show live battle status for $ARGUMENTS.

Read `.alphatekx/battle/state.json` and `.alphatekx/battle/metrics.jsonl`:

- If no battle has run: report "No battle found — run /battle or node scripts/alpha-battle.mjs"
- Else display: phase (preparing/stress/diagnostics/improve/heal/validate/report/done), done/total, successRate, avgTimeMs, memMB, startedAt, updatedAt, winner, prevented, reSuccess, reportPath.

Also tail last 5 lines of `metrics.jsonl` for live trend.

Use `node -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync('.alphatekx/battle/state.json','utf8')),null,2))"` and `tail` equivalent via `fs`.

Begin status check now.
