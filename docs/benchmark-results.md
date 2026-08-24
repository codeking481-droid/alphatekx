# AlphaTekX Restoration v3.0 — Benchmark Results

All numbers below are from actual suite runs on this machine (Node v24, Windows).
Suites: `npm run test:restore-v3` · `test:restore-v2` · `test:restore-torture`.

---

## 1. Suite verdicts

| Suite | Checks | Result |
|---|---|---|
| **v3 real-world scenario suite** | 52 | **PASS** |
| v2 torture regression | 115 | **PASS** |
| v1 torture regression | 81 | **PASS** |

---

## 2. Scenario benchmarks (v3 suite fixtures)

### Scenario 1 — E-commerce (`/shop`): broken checkout + deep classes

Planted: dead script/stylesheet-class assets, dead image, dead partner link, duplicate IDs,
unsafe `_blank`, already-safe `_blank`, insecure form action, syntax-broken `onclick`,
healthy `onclick`, untitled iframe, script-referenced SPA fragment, two dead fragments,
leaked API key, unbalanced CSS braces, no responsive/font/hover/smooth-scroll layers,
form without validation, nav without hamburger, full SEO/security gaps.

| Metric | Before | After |
|---|---|---|
| Restoration score | 0/100 | **100/100** |
| Unresolved findings | — | **0** |
| Verify iterations | — | 1 (≤3 budget) |
| Static perf proxy | 92 | **100** |
| Render-blocking scripts | 1 | **0** |
| Images w/o lazy loading | 2 | **0** |
| Duplicate ids | 1 pair | **0** |
| Unsafe `_blank` links | 1 | **0** (rel added; safe one byte-identical) |
| Insecure form actions | 1 | **0** (https upgrade) |
| Broken inline handlers | 1 | **0** (removed; healthy handler byte-identical) |
| Dead anchors | 2 | **0** (unwrapped, labels kept; `#cart` preserved via JS-reference detection) |
| Untitled iframes | 1 | **0** ("Xyz" derived from src) |
| JSON-LD | none | **WebSite schema injected & parseable** |
| Console cleanliness | throws on click | **every inline script compiles** |

Context classification: `ecommerce`. Recommendations fired: robots.txt advisory (live probe),
Lighthouse note, og-image note. History entry appended to `restoration-history.jsonl`.

### Scenario 2 — SPA hash routing (`/spa`)

| Behavior | Result |
|---|---|
| `#/dashboard`, `#/reports` (referenced by router script) | **Preserved** |
| `#ghost` (unreferenced, no target) | **Unwrapped**, label kept |
| Rescan | clean, score 100 |

This is the context-awareness guarantee: the engine does not "fix" intentional routing.

### Scenario 3 — Multi-page crawl (`/` → `/about` → `/contact`)

| Metric | Result |
|---|---|
| Pages crawled & restored | **3 / 3** |
| Per-page after-score | **100 / 100 / 100** |
| ZIP contents | `index.html`, `about.html`, `contact.html`, `originals/*.orig.html` ×3, `report.json`, `README.txt` |
| Rollback fidelity | originals **byte-exact** vs served fixtures |
| Subpage restoration | charset + title injected, dead images → dimension-preserving SVG placeholders |

### Negative control — benchmark-grade page (`/clean`)

| Metric | Result |
|---|---|
| Findings across combined v2+v3 detectors | **0** (zero false positives) |
| Score before / after | 100 / 100 |
| Verify iterations needed | 1 |

### Paste mode

| Input | Result |
|---|---|
| Inline HTML with duplicate id + dead anchor | `ok:true`, id collapsed to 1, anchor unwrapped |

### Guard rails

| Case | Result |
|---|---|
| Garbage URL | 400 `enter_url` |
| Unreachable host | 502 `check_url` |
| History endpoint | serves logged entries with ts/issuesFound |

---

## 3. Regression protection

The v3 layer composes over v2 without modifying it (only an `export` keyword was added).
Both predecessor suites still pass untouched:

- v2 torture: **115/115** — before score 0 → after 100, zero unresolved, zero false positives
- v1 torture: **81/81**

---

## 4. The "Fix for Hours" challenge (134-issue mega fixture)

Fixture: `scripts/fixtures/fix-for-hours.html` — multi-section business site
(services, team, blog, shop, 3 forms, 8 scripts) with 17 dead images, broken
hamburger, no validation, no SEO/security/responsive/accessibility layers.
Runner: `node scripts/run-fix-for-hours.mjs` (drives the real engine over HTTP).

| Metric | Result |
|---|---|
| Restoration time | **204 ms** (target: <10s) |
| Score after | **100/100**, zero unresolved findings |
| Checks | **73/73 PASS** |

### Category proof

| Category | Evidence |
|---|---|
| Detection | All 17 planted classes detected; zero false positives (empty `alt=""`, unique ids, valid anchors correctly NOT flagged) |
| Assets | 17/17 dead images → dimension-preserving SVG placeholders with alt text |
| Performance | 17/17 images lazy-load; static perf proxy 84 → 100 |
| Responsive/UX | 768px + 480px breakpoints, grid stacking, font stack, hover + focus-visible + transitions, smooth scroll |
| Mobile nav | Hamburger injected into existing `#navLinks` (3 lines, ARIA, closes on click) |
| Forms ×3 | 7/7 fields `required aria-required`; three status regions; email validation; loading state; green/red styling; reset-on-success |
| SEO | lang, description, og:title/description/type/image, canonical, robots, SVG favicon, parseable JSON-LD |
| Security | CSP, HSTS, XCTO nosniff |
| Preservation | `toggleMenu()` byte-exact; all three original form handlers preserved; all copy/pricing/section ids intact |
| Console | Every inline script (original + injected) compiles clean; rejection net installed |
| Intelligence | Classified `ecommerce`; 5 manual recommendations; history logged |
| Deliverables | ZIP with `fix-for-hours.html` + `originals/` rollback copy + `report.json`, byte-identical to API response |

Artifacts: `data/scan-proof/fix-for-hours/` (`restored.html`, `report.json`, `challenge-proof.json`).

---

## 5. Known limits (honest scope)

Documented in `docs/report-v3.md` §1.6: render-blocking deferral, contrast checks,
hosting config, and analytics injection are reported as recommendations rather than
auto-applied, because auto-applying them can break working sites or inject product
decisions into someone else's site.
