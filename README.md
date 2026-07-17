# AlphaTekX God Craft OS

AlphaTekX turns ideas into Missions, coordinates AI Workers, produces Creations, and prepares them for Marketplace publishing and Launch.

## Local development

```bash
npm install
npm run api
npm run dev
```

The API runs on port 3001 and Vite proxies `/api/*` to it.

## Supabase setup

1. Create a Supabase project.
2. Open the SQL editor and run [`supabase/schema.sql`](supabase/schema.sql).
   Existing Phase 3 projects should run [`supabase/phase4.sql`](supabase/phase4.sql) instead to add marketplace revenue safely.
   Existing live AlphaTekX projects should also run [`supabase/upgrade-workspace-history-workers-payments.sql`](supabase/upgrade-workspace-history-workers-payments.sql) for chat history, BYOK workers, and atomic Paystack credit purchases.
   Run [`supabase/path-deploy.sql`](supabase/path-deploy.sql) to add public app slugs and creation ownership fields required by `/app/:slug` publishing.
3. Enable Google in Authentication → Providers.
4. Add `https://alphatekx.name.ng/auth` and your local `/auth` URL to the allowed redirect URLs.
5. Copy `.env.example` to `.env.local` and fill the browser-safe Supabase values.

RLS restricts Missions, Messages, Activities, Creations, Workers, and Profiles to their owners. Marketplace items are publicly readable. Credit deductions use the atomic `spend_credits` database function.

Marketplace purchases are verified by `/api/marketplace/purchase`. Paid item amounts are checked against Paystack and the database before the atomic Supabase settlement function clones the creation, increments downloads, assigns 80% creator revenue, and records the 20% platform share.

## Render deployment

1. Push the repository to GitHub.
2. In Render, create a Blueprint from the repository. Render reads [`render.yaml`](render.yaml).
3. Alternatively create a Web Service manually with build command `npm install && npm run build` and start command `npm start`.
4. Add every required value from `.env.example` in Render Dashboard > Environment. Do not expose `SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY`, or AI provider keys with a `VITE_` prefix.
5. Deploy and confirm the health log reports the injected Render port.
6. In Render Settings > Custom Domains, add `alphatekx.name.ng`, then copy Render's exact DNS record into your DNS provider.
7. Add `https://alphatekx.name.ng/auth` to Supabase Authentication redirect URLs and configure the live origin in Paystack.

`server.mjs` serves `dist/`, handles SPA deep links, and owns all `/api/*` routes on Render. The files under `api/` are only Vercel adapters and are not required by Render.

## Optional Vercel deployment

1. Import the GitHub repository in Vercel.
2. Framework preset: **Vite**.
3. Build command: `npm run build`.
4. Output directory: `dist`.
5. Add every value from `.env.example` in Project Settings → Environment Variables. Keep `SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY`, and AI provider keys server-only.
6. Deploy, then open Settings → Domains and add `alphatekx.name.ng`.
7. At your DNS provider, add the exact A/CNAME records Vercel displays. Do not guess the values.
8. Add the final domain to Supabase Authentication URL Configuration and Paystack callback/origin settings.

`vercel.json` provides SPA fallback while preserving `/api/*` serverless functions.

The root `api/` directory contains Vercel Functions for Alpha chat, Paystack credit verification, and marketplace settlement. Vercel checks filesystem functions before applying the SPA rewrite, so refreshing `/mission/:id` returns `index.html` while `/api/*` continues to execute server-side.

## Production checks

```bash
npm run typecheck
npm run lint
npm run build
```
