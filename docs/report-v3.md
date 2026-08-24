# AlphaTekX Restoration v3.0 — Engineering Report

**Engine:** `server/restorationEngineV3.mjs` · **Mounted at:** `/api/engine/v3/*` in `server.mjs`
**Status:** All suites green — v3: 52/52 · v2: 115/115 · v1: 81/81
**Test command:** `npm run test:restore-v3`

---

## 1. What was built and why

v2.0 restored single pages across 36 issue classes. v3.0 composes **on top of** v2 (zero
regression risk to the proven core) and closes the remaining gap between "restores a page"
and "restores a site". Every addition below was driven by a concrete failure mode that
v2 could not see or safely fix.

### 1.1 Deep detection & fixing layer (`detectIssuesV3` / `applyV3Fixes`)

| Issue class | Severity | Fix behavior |
|---|---|---|
| `duplicate_ids` | medium | Removes the `id` attribute from every occurrence after the first; first (canonical) element keeps its styling, labels, and JS bindings |
| `missing_focus_states` | low | Injects a `:focus-visible` outline layer (`#005fcc`, 2px offset) — WCAG 2.4.7 keyboard visibility |
| `noopener_missing` | medium | Appends `rel="noopener noreferrer"` to `target="_blank"` anchors lacking it (reverse-tabnabbing defense); anchors that already have `rel="noopener"` are left byte-identical |
| `insecure_form_action` | high | Upgrades `form action="http://…"` to https (checkout/credential protection; v2 only covered `src`/`href`) |
| `broken_internal_anchor` | medium | Unwraps `href="#x"` links whose target id/name does not exist **and** which no inline script references — keeping the visible text. Hash-routed SPA fragments (e.g. `#/dashboard`) are detected via script-reference analysis and preserved untouched |
| `iframe_missing_title` | low | Derives an accessible `title` from the src basename (e.g. `/embed/player` → "Player") or falls back to "Embedded content" |
| `inline_handler_syntax` | critical | V8-compiles every inline `on*=` handler; handlers that fail to compile are removed (original preserved in rollback artifact) so clicking stops throwing |
| `jsonld_missing` | low | Injects schema.org `WebSite` JSON-LD built from the resolved title/description/canonical |

### 1.2 Verify-retry loop

After the combined v2+v3 passes, the engine re-scans with **both** detectors and re-applies
idempotent fixes for anything still standing — up to `MAX_VERIFY_ITERATIONS = 3`. Whatever
survives is reported in `unresolved[]` with page attribution. Nothing is ever faked clean.

### 1.3 Probe findings integration (bug found & fixed during hardening)

v3 initially built its v2 fix-enablement set from *static* detection only — the four probe-only
classes (`broken_script/style/link/image`) silently skipped dead-resource surgery. The suite
caught it; probe findings are now merged into both the fix plan and the reported findings.

### 1.4 Multi-page restoration (site mode)

`POST /api/engine/v3/restore { url, multiPage: true, maxPages? }`

- Crawls same-origin links breadth-first (default cap 8 pages, hard cap 15)
- Probes and restores each page independently (own resource context, own canonical)
- Unreachable sub-pages are recorded in `verification.crawledSkipped[]` — never silent
- Delivers one ZIP: `<slug>.html` per page + `originals/<slug>.orig.html` rollback copies +
  `report.json` + `README.txt`

### 1.5 Intelligence features

- **Context classification** — keyword-signal classifier tags the site as
  `ecommerce | saas_app | news | blog | portfolio | corporate | landing | generic`,
  with hit counts, reported as `context.siteType`.
- **Static performance snapshot** — honest proxy metrics (not fake Lighthouse):
  DOM node count, external scripts, render-blocking head scripts, images without lazy loading,
  inline style bytes → heuristic score, before vs after.
- **History learning log** — every restoration appends to `data/restoration-history.jsonl`;
  served back through `GET /api/engine/v3/history`.
- **Manual recommendations** — things that must not be auto-fixed are said out loud:
  Lighthouse audit on deploy, og-image upload, HTML comment review, missing
  `robots.txt` / `sitemap.xml` (live-probed when a URL is scanned).

### 1.6 Honest scope — what v3 deliberately does NOT auto-fix

Per the surgical doctrine ("report unresolved rather than guess"):

- Render-blocking script deferral: changing execution order can break working sites — recommended manually instead
- Color-contrast and visual regression: requires rendering, not static analysis
- Hosting-level concerns (.htaccess, redirects, SSL config): outside document scope
- Analytics/consent banners: injecting trackers into someone's site is a product decision, not a repair
- Pages whose root `<html>` element is missing entirely: `lang` cannot be attached to nothing — reported unresolved honestly (score docks, e.g. 98/100)

---

## 2. Architecture

```
POST /api/engine/v3/restore { url | html, baseUrl?, multiPage?, maxPages? }
        │
        ├─ fetch (or crawl same-origin)          ──► skipped[] on failure, never silent
        ├─ per page:
        │   ├─ live resource probe (v2)          ──► brokenRecords + probeFindings
        │   ├─ PASS 1: applyFixesToHtmlV2()      ──► 36-class spectrum (incl. probe classes)
        │   ├─ PASS 2: applyV3Fixes()            ──► 8 deep classes above
        │   └─ VERIFY LOOP (≤3): rescan v2+v3    ──► reapply idempotently until clean
        ├─ classifySite + perfSnapshot(before→after)
        ├─ collectRecommendations (robots/sitemap live probes)
        ├─ appendHistory → data/restoration-history.jsonl
        └─ ZIP: pages + originals/ + report.json + README.txt
```

Routes: `POST /restore`, `GET /health` (capability matrix), `GET /history`.

---

## 3. Files delivered

| File | Purpose |
|---|---|
| `server/restorationEngineV3.mjs` | The v3 engine (this report, section 1) |
| `server.mjs` | v3 mounted ahead of the generic `/api/engine/` delegation |
| `scripts/restore-engine-v3-suite.mjs` | Real-world scenario suite (52 checks) |
| `package.json` | `test:restore-v3` script |
| `docs/report-v3.md` | This document |
| `docs/benchmark-results.md` | Before/after numbers per scenario |

## 4. How to run

```bash
npm run test:restore-v3   # v3 scenario suite (52 checks)
npm run test:restore-v2   # v2 torture regression (115 checks)
npm run test:restore-torture  # v1 regression (81 checks)

# Restore a live single page
curl -X POST http://localhost:3000/api/engine/v3/restore \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com/broken"}'

# Whole-site mode
curl -X POST http://localhost:3000/api/engine/v3/restore \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com","multiPage":true,"maxPages":10}'
```
