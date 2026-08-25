---
description: Surgical precision fix — minimal diff per defect, exact BEFORE/AFTER code with file:line instructions, verification gate
agent: precision-fixer
---

Target: $ARGUMENTS

Run the Precision Fixer surgical workflow on target $ARGUMENTS: read diagnosis.md, open each file at exact file:line, craft minimal BEFORE/AFTER hunks (one defect = one patch), preserve all healthy code byte-identical, apply sequentially with verification (build / grep / viewport), flag Tier 2 (CSP/HSTS) for confirmation, output patches.md + applied diff + unresolved.md if any.

Fix only what is broken. Nothing more. Nothing less. Begin now.
