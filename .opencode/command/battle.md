---
description: Start 1-hour battle — 60-site stress test (8 categories), 6 phases, self-optimization, evolution. Use quick for 20-site fast run.
agent: battle-orchestrator
---

Target: $ARGUMENTS

Start the Alpha Omega 1-Hour Battle on target $ARGUMENTS (default: synthetic 60-site suite).

Execute via `node scripts/alpha-battle.mjs`:

- No arg → full battle (60 sites, ~12 min simulated): `node scripts/alpha-battle.mjs`
- `quick` → 20 sites fast: `node scripts/alpha-battle.mjs --quick`
- Custom: `node scripts/alpha-battle.mjs --sites 50`

Phases: 0 Prepare (suite + monitoring) → 1 Stress (batches of 5) → 2 Diagnostics → 3 Recursive Improvement (3 strategies) → 4 Predictive Healing (8 patterns) → 5 Validation (re-run) → 6 Report (`ALPHA_BATTLE_REPORT.md` + `.alphatekx/battle/report.json`).

Use `stress-tester` for parallel execution, enforce surgical minimal diff, Groq-only, validation gate mandatory.

Begin battle now. Stream progress and write live state to `.alphatekx/battle/state.json`.
