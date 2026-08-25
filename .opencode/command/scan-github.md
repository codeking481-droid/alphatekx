---
description: Scan whole GitHub repo — clone, scan every file, 100% coverage, green card plain English, patch ready
agent: repo-scanner
---

Target: $ARGUMENTS

Scan the whole GitHub repo `$ARGUMENTS` (owner/repo or https://github.com/owner/repo):

- Clone shallow `--depth 1` to `.tmp/repos/`
- Inventory `**/*.{html,js,ts,css,json,md}` (skip node_modules/.git/dist, max 500 files)
- Per file: HTML→V2+V3, CSS→braces/media, JS→vm syntax, cross-file duplicate id + broken internal links
- Output `diagnosis-repo.md` + `GREEN_CARD.md` via `green-card-reporter` — plain English, money-first, `file:line` at end only

API: `POST /api/scan/github {githubUrl, branch?, token?}`

Begin whole-GitHub scan now. If clone fails, return `action_required: check_url` with git stderr, never fake.
