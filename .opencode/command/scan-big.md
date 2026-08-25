---
description: Scan big earning site — sitemap-first 100+ pages, 50k limit, green card plain English, patch ZIP ready
agent: big-site-scanner
---

Target: $ARGUMENTS

Scan the big site `$ARGUMENTS` (e.g., https://shop.example.com/) 100% via sitemap-first 2026:

- Discover `sitemap.xml`, `sitemap_index.xml`, `robots.txt Sitemap:` → parse `<sitemapindex>` + `<urlset>`, filter 200 canonical, cap `maxPages 100` (Free 1, Pro 10, Business 25, Enterprise 100+), fallback BFS crawl same-origin
- Batch 8, `findBrokenResources + V2+V3` per page, aggregate `totalPages, totalIssues, byPage`
- Output `diagnosis-big.md` + `GREEN_CARD.md` via `green-card-reporter` — plain English, `What it costs you`, `What Alpha will patch file:line`, green, 1 page

API: `POST /api/scan/big-site {url, maxPages?, token?}`

Quota: 1 scan = 1 site (respect `server/billing.mjs:PLANS`). If `402`, show upgrade link.

Begin big-site scan now. If no sitemap, fallback crawl and note `sitemapUsed:false`.
