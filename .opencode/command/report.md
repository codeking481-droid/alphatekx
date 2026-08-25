---
description: Generate report — if battle exists show ALPHA_BATTLE_REPORT.md, else precision ALPHA_RESTORATION_REPORT.md (plain English, BEFORE/AFTER, verification)
agent: battle-orchestrator
---

Target: $ARGUMENTS

Generate the report for $ARGUMENTS:

- If `.alphatekx/battle/ALPHA_BATTLE_REPORT.md` exists → display it (1-hour battle executive summary, 8-category breakdown, improvements, healing, validation). If `.alphatekx/battle/report.json` exists, summarize successRate/avgTime.
- Else → generate Alpha Restoration Report in plain English via alpha-precision-master: Summary (Total/Critical/Major/Minor/Fixed), Detailed Issues (Location file:line, Severity, What was broken, How fixed, Files changed), Code Changes BEFORE/AFTER with line numbers (minimal diff), Recommendations (optional), Verification ✅ with evidence (diagnosis.md + patches.md + unresolved.md + validation gate).

If neither exists and $ARGUMENTS is a battle target, run `node scripts/alpha-battle.mjs --quick` then report.

Begin report generation now.
