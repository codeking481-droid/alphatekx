---
description: Show live battle metrics — success rate, avg time, memory, cpu, error rate table + evolution triggers
agent: battle-orchestrator
---

Target: $ARGUMENTS

Show live metrics for battle $ARGUMENTS.

Read `.alphatekx/battle/metrics.jsonl` and `.alphatekx/battle/results.json`:

Produce table:

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Success rate | X% | >95% | ✅/⚠️ |
| Avg time | Xms | <30000ms | ✅/⚠️ |
| Memory | XMB | <1024MB | ✅/⚠️ |
| Error rate | X% | <5% | ✅/⚠️ |

And per-category breakdown from `results.json` if exists.

If metrics missing: "No metrics yet — battle not started. Run /battle."

Begin metrics display now.
