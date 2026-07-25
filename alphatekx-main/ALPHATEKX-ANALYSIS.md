# 🚀 AlphaTekX — Complete Platform Analysis

**Analyzed by BLACKBOXAI**

---

## 📌 What You Are Building

**AlphaTekX** is a **no-code/low-code AI-powered full-stack SaaS platform** that lets users turn natural language ideas into **production-ready web apps, automated workflows, AI agents, and social media campaigns** — all without writing code. It's built for founders, businesses, and operators — with a strong focus on the **Nigerian/African market**.

---

## 🔬 Everything I Found in Your Codebase

### ====== 1. PROJECT ARCHITECTURE ======

```
alphatekx-main/
├── server.mjs              # Main backend server (~5,400 lines)
├── src/                    # React frontend (Vite + TypeScript)
│   ├── App.tsx
│   ├── main.tsx
│   ├── pages/              # 50+ page components
│   ├── components/         # Reusable UI components
│   ├── lib/                # Core libraries and utilities
│   │   ├── alphaBuilder.ts
│   │   ├── auth.tsx
│   │   ├── billing.ts
│   │   ├── integrations.ts
│   │   ├── supabase.ts
│   │   └── ... (30+ modules)
│   └── hooks/
├── server/                 # Server-side logic
│   ├── alphaBrain.mjs
│   ├── billing.mjs
│   ├── marketplace.mjs
│   ├── previewBuild.mjs
│   ├── projectWorkspace.mjs
│   ├── telegramProvider.mjs
│   └── alpha/
│       ├── conversationEngine.mjs
│       └── providerHealth.mjs
├── api/                    # API route handlers
│   ├── alpha.mjs
│   ├── mission.mjs
│   ├── reality.mjs
│   ├── verify-paystack.mjs
│   └── marketplace/
├── supabase/               # Database migrations
│   ├── schema.sql
│   ├── path-deploy.sql
│   ├── phase4.sql
│   ├── telegram-v1.sql
│   └── gmail-integration.sql
├── public/                 # Static assets
│   └── templates/          # HTML templates
└── preview-template/       # Build preview sandbox
```

---

### ====== 2. 🧠 AI APP BUILDER ======

**Location:** `server.mjs` → `handleAlpha()` function + `fallbackAlphaBuilder()`

**How it works:**
1. User types a prompt like "Build me an e-commerce store" or "Create a POS system"
2. The system uses a `fullAppBuilderPrompt` that instructs the AI to act as a Senior Full-Stack Engineer
3. It tries up to **6 AI providers** in order (FlatKey → OpenAI → Qwen → Kimi → MiniMax → Groq)
4. Each response is validated to ensure it has proper structure (files, components, JSX)
5. If all AI providers fail, it falls back to a **deterministic builder** (`alphaFallback.mjs`)

**What it generates:**
- **8-15 files** minimum per app (1000+ lines of code)
- **5-7 distinct views/pages** (or 6-10 modules for large platforms)
- Complete React 18 + Tailwind CSS apps with:
  - Mock data (20+ products/posts/customers)
  - Search, filter, sort functionality
  - Working forms with validation
  - Realistic UI (dark premium theme, glassmorphism, responsive)
- **AlphaUI components** (Sidebar, Topbar, Card, StatCard, Table, Kanban, Chart, Modal, Tabs, etc.)
- **AlphaAPI** for real CRUD against the backend

**App categories supported:**
- E-commerce (Home, Shop, Product Detail, Cart, Checkout, Dashboard, Admin)
- POS (Login, Make Sale, Inventory, Customers, Reports, Settings, Receipt)
- Blog (Home feed, Single post, Editor, Categories, Profile, Search)
- Chat (Thread list, Message pane, New thread, Search)
- Large platforms / OS (Dashboard, Projects/CRM, Analytics, Chat, Calendar, Files, Settings)

**Output format (JSON):**
```json
{
  "title": "App title",
  "description": "Short tagline",
  "dependencies": ["react-router-dom", ...],
  "files": {
    "src/data/mockData.js": "...",
    "src/pages/Home.jsx": "...",
    "src/App.jsx": "...",
    "supabase/migrations/001_app_entities.sql": "..."
  }
}
```

---

### ====== 3. 🤖 AUTOMATION ENGINE (AGENTS) ======

**Location:** `server.mjs` → `runAgent()`, `parseAgentFromNL()`, `executeAgentAction()`

**Agent System:**
- Users describe automations in natural language
- A capability registry (`server/automation/capabilityRegistry.mjs`) tries to match the request
- Falls back to LLM-powered parsing (`parseAgentFromNL`)
- Agents are saved and executed on cron schedules

**Agent Lifecycle:**
1. `parseAgentFromNL()` → Parses user intent into structured plan
2. `finalizeAgentPlan()` → Sets trigger, cron, missing fields, credits
3. `saveServerAgent()` → Persists agent
4. `runAgent()` → Executes when trigger fires
5. `executeAgentAction()` → Performs individual connector actions

**Execution Safeguards:**
- **Idempotency** — refuses duplicate or concurrent executions
- **Timing is Law** — aborts if schedule mismatch > 5 minutes
- **Approval Gates** — pauses if agent/step not approved
- **Missing Field Detection** — validates all params before execution
- **Cost Lock** — pre-checks budget (estimated × 1.2), prevents overspend
- **Retry Backoff** — 60s → 300s → 900s for failed schedule runs
- **Step-by-step credit charges** with per-step validation

**Supported Triggers:**
| Type | Description |
|------|-------------|
| `schedule` | Cron-based (every X minutes, daily, hourly, etc.) |
| `webhook` | External HTTP trigger |
| `monitor` | URL health check trigger |
| `campaign` | Social media content calendar |
| `manual` | User-invoked one-time run |

---

### ====== 4. 📱 CONTENT EMPLOYEE (CAMPAIGNS) ======

**Location:** `server.mjs` → `buildCampaignPlan()`, `runCampaignAgent()`

**Features:**
- Users describe a social media campaign like "Post daily on Facebook and LinkedIn for 2 weeks"
- Parses platforms, duration, posting frequency automatically
- Generates content through AI or deterministic fallback
- **Content Mix:** 40% educational, 30% product, 20% story, 10% CTA
- Each post includes platform-specific captions with appropriate tone

**Supported Platforms:**
- Facebook, LinkedIn, Instagram, X/Twitter, WhatsApp, Telegram, Slack, Discord

**Campaign Slots:**
- Morning (8 AM), Evening (6 PM), Noon (12 PM) — auto-detected from user prompt
- Supports: "once a day", "twice a day", "morning and evening"

**Posting Schedule:**
- Default: 7 days
- Can parse: "for 3 days", "for 2 weeks", "for 1 month"
- Posts are spaced evenly across the duration

**Credit Costs:**
- Writing: 3 credits
- Image generation: 2 credits
- Publishing per platform: 1 credit each

---

### ====== 5. 🧬 AI WORKERS ======

**Location:** `server.mjs` → `runUserWorker()`, `runWorkerRequest()`

**What they are:**
- Custom AI assistants that users create with their own API keys
- Each worker has: name, role, purpose, instructions, provider, model, and memory
- Users can chat with their workers for specialized tasks

**Supported Providers:**
- OpenAI (GPT-4o-mini, GPT-4o)
- Groq (Llama 3.3 70B)
- Anthropic (Claude 3.5 Sonnet)
- Gemini (Gemini 2.5 Flash)

**Memory:**
- Stores last 20 messages (12 conversation turns)
- Messages are trimmed to 4,000 characters each
- Persisted to Supabase after each interaction

---

### ====== 6. 🚀 DEPLOYMENT SYSTEM ======

**Location:** `server.mjs` → `publishedAppDocument()`, `servePublishedCreation()`

**Subdomain Deployment:**
- Apps deployed to `{slug}.alphatekx.name.ng`
- Slug validation: 3-30 chars, lowercase letters, numbers, hyphens
- Reserved names: admin, api, www, dashboard, app, test, login, auth, blog, shop, etc.

**Published App Architecture:**
```
Outer HTML (publishedAppDocument)
└── <iframe id="alpha-app" sandbox="...">
    └── Sandboxed document with:
        ├── Tailwind CSS (CDN)
        ├── React 18 (CDN)
        ├── Babel standalone (CDN)
        ├── AlphaUI (server-hosted)
        ├── localStorage bridge → parent postMessage
        ├── AlphaAPI CRUD bridge
        └── Header position fix for fixed navigation
```

**Storage Layers:**
| Layer | Location | Method |
|-------|----------|--------|
| **Supabase** | `rest/v1/creations` | Remote database |
| **Local JSON** | `deployed/{slug}.json` | File system fallback |
| **Previews** | `data/previews/{id}.json` | Temporary build artifacts |

**API Endpoints for Deployed Apps:**
```
GET    /api/apps/{slug}/{entity}         → List records
GET    /api/apps/{slug}/{entity}/{id}    → Get single record
POST   /api/apps/{slug}/{entity}         → Create record
PUT    /api/apps/{slug}/{entity}/{id}    → Update record
DELETE /api/apps/{slug}/{entity}/{id}    → Delete record
POST   /api/apps/{slug}/migrate          → Get SQL migration
```

---

### ====== 7. 🔌 CONNECTOR INTEGRATIONS ======

**Location:** `server.mjs` → OAuth flows, `integrations.ts` (frontend)

**Google (OAuth 2.0):**
- Scopes: Gmail read/send, Sheets, Calendar, Drive, User Info
- Refresh token rotation with automatic expiry detection
- Storage: `connected_accounts` table or local JSON
- State verification with HMAC-signed payloads (10 min expiry)

**LinkedIn (OAuth 2.0):**
- Scopes: openid, profile, w_member_social, email
- Stores: access_token + author_urn (urn:li:person:{id})
- Supports posting via `w_member_social` scope

**Social Platforms (User's own keys):**
| Platform | Credential Needed |
|----------|------------------|
| Telegram | Bot token + Chat ID |
| Discord | Webhook URL |
| Slack | Bot token + Channel |
| WhatsApp | API key + Phone number |
| X/Twitter | API key |
| Facebook | API key |

**Other Integrations:**
| Service | Auth Method |
|---------|------------|
| GitHub | Personal access token |
| Notion | Integration token |
| Paystack | Secret key (server env) |
| Supabase | Service role key (server env) |
| Resend | API key (email fallback) |

**Token Encryption:**
- AES-256-GCM encryption for all stored tokens
- Key derived from `API_KEY_ENCRYPTION_KEY` or Supabase service key
- Tokens stored in `connected_accounts` or `user_integrations` tables

---

### ====== 8. 💰 BILLING & CREDITS ======

**Location:** `server/billing.mjs`

**Credit System:**
- **DEFAULT_CREDITS:** 30 (free signup)
- Credits consumed per action (e.g., 1 credit per email, 2 credits for AI generation)
- Credit packs purchasable via Paystack

**Payment Flow:**
1. User selects credits/plan → `initializePaystackPayment()`
2. Returns Paystack authorization URL → user redirected to Paystack
3. Paystack sends webhook → `paystackWebhookHandler()`
4. Webhook verified with HMAC-SHA512 signature
5. `verifyAndAddCreditsByReference()` → credits added to user account

**Plans (in Kobo/NGN):**
| Plan | Amount (NGN) |
|------|-------------|
| Starter | ₦5,000 |
| Pro | ₦15,000 (early access) / ₦8,000 (old) |
| Free | ₦2,000 |
| Posts | ₦1,000 |

**Admin Bypass:**
- Admin email: `iamdan4live@gmail.com`
- Admin users bypass credit checks and charges

---

### ====== 9. 🔐 AUTHENTICATION ======

**Location:** `server.mjs` → `authenticatedUser()`, `currentOrLocalUser()`

**Auth Methods:**
| Method | Environment | How it Works |
|--------|-------------|-------------|
| **Supabase Auth** | Production | Bearer token from `supabase.auth.getSession()` |
| **Local User** | Development | `x-local-user-id` + `x-local-user-email` headers or Base64-encoded `x-local-user` header |

**API Key Storage (Vault):**
- Users can store their own AI provider keys securely
- Keys encrypted with AES-256-GCM before storage
- Stored in `user_settings` table (Supabase) or locally
- Test endpoint to validate keys before saving

**OAuth State Security:**
- State contains: userId, email, redirect, expiry (10 min), nonce
- Signed with HMAC-SHA256 using derived key
- Timing-safe comparison on verification

---

### ====== 10. 🎨 FRONTEND PAGES ======

**Location:** `alphatekx-main/src/pages/`

**Complete List of Pages (50+):**
```
Account.tsx        Admin.tsx          AdminAgents.tsx  
AdminWithdrawals.tsx  Agents.tsx      AlphaBrain.tsx
ApiKeys.tsx        Auth.tsx           AuthRoute.tsx
Builder.tsx        BuildStart.tsx     Chat.tsx
Connectors.tsx     ContentPage.tsx    Creations.tsx
Creator.tsx        Dashboard.tsx      ForgotPassword.jsx
History.tsx        Home.tsx           Landing.tsx
Launch.tsx         Marketplace.tsx    MarketplaceDetail.tsx
MarketplaceNew.tsx Memory.tsx         Missions.tsx
Privacy.tsx        Revenue.tsx        Settings.tsx
Standards.tsx      Store.tsx          Terms.tsx
Workers.tsx        About.tsx
```

**Key Frontend Components:**
```
components/
├── AuthLayout.jsx
├── BookAnimation.tsx
├── ConnectedAppsDropdown.tsx
├── FreeLimitModal.tsx
├── GlassBackground.jsx
├── GoogleIcon.jsx
├── OnboardingModal.tsx
├── ProtectedRoute.jsx
├── ScrollToTop.jsx
├── SEO.tsx
├── agents/
│   ├── CampaignPreview.tsx
│   ├── ConnectorIcon.tsx
│   └── WorkflowPlan.tsx
├── auth/
│   ├── AuthGate.tsx
│   └── ProtectedPage.tsx
├── brain/
│   ├── VisionPanel.tsx
│   └── VoicePanel.tsx
├── mission/
│   ├── ActivityFeedPanel.tsx
│   └── MentorPanel.tsx
└── ui/ (shadcn components)
    ├── accordion.jsx
    └── alert-dialog.jsx
```

---

### ====== 11. 🔧 CORE LIBRARIES ======

**Location:** `alphatekx-main/src/lib/`

| Module | Purpose |
|--------|---------|
| `alphaBuilder.ts` | Builds app from AI response |
| `apiClient.ts` | HTTP client for backend API |
| `auth.tsx` / `AuthContext.jsx` | Auth state management |
| `billing.ts` | Credit/payment operations |
| `builderPlanner.ts` | App architecture planning |
| `builderVerifier.ts` | Validates AI-generated code |
| `chatHistoryStore.ts` | Chat message persistence |
| `companyMemory.ts` | Long-term memory for AI |
| `credits.ts` / `creditStore.ts` | User credit tracking |
| `deployCreation.ts` | Publishing apps |
| `exportCreation.ts` | Exporting generated apps |
| `integrations.ts` | Connected apps management |
| `marketplace.ts` | Template marketplace |
| `mentorStore.ts` | Mentor/mission state |
| `missionStore.ts` | Mission tracking |
| `payment.ts` / `paystack.ts` | Payment processing |
| `preview.ts` | App preview system |
| `reviewStore.ts` | Code review storage |
| `store.ts` | Global state (Zustand) |
| `supabase.ts` | Supabase client init |
| `types.ts` | TypeScript type definitions |
| `userSettings.ts` | User preferences |
| `workerStore.ts` | AI worker state |

---

### ====== 12. 📡 API ROUTES (Backend) ======

**Location:** `server.mjs` (routing logic at bottom of file)

| Route | Handler | Method |
|-------|---------|--------|
| `/api/alpha` | `handleAlpha()` | POST |
| `/api/plan` | `handlePlan()` | POST |
| `/api/reality` | `handleReality()` | POST |
| `/api/agents` | CRUD agents | GET/POST/PUT/DELETE |
| `/api/agents/run/:id` | Run specific agent | POST |
| `/api/agents/campaign/:id/activate` | Activate campaign | POST |
| `/api/agents/campaign/:id/report` | Campaign report | GET |
| `/api/agents/run-due` | Run due agents | POST |
| `/api/agents/executions` | Execution history | GET |
| `/api/agents/logs` | Agent logs | GET |
| `/api/gmail/send` | Send via Gmail | POST |
| `/api/send-email` | Send via Resend | POST |
| `/api/integrations/status` | Integration status | GET |
| `/api/integrations/:provider` | Save/delete integration | POST/DELETE |
| `/api/integrations/google` | Disconnect Google | DELETE |
| `/api/integrations/google/start` | Start Google OAuth | POST |
| `/api/connectors/save` | Save connector | POST |
| `/api/connectors/test` | Test connector | POST |
| `/api/connectors/linkedin/start` | Start LinkedIn OAuth | POST |
| `/api/auth/gmail/callback` | Google OAuth callback | GET |
| `/api/connectors/linkedin/callback` | LinkedIn callback | GET |
| `/api/user/usage` | User usage stats | GET |
| `/api/user/brand-profile` | Brand profile | GET/POST |
| `/api/credits` | Credit balance | GET |
| `/api/credits/spend` | Spend credits | POST |
| `/api/paystack/initialize` | Start payment | POST |
| `/api/paystack/verify` | Verify payment | POST |
| `/api/paystack/webhook` | Paystack webhook | POST |
| `/api/billing` | Billing info | GET |
| `/api/billing/upgrade` | Upgrade plan | POST |
| `/api/activity/ping` | Activity heartbeat | POST |
| `/api/marketplace` | Marketplace CRUD | GET/POST |
| `/api/marketplace/purchase` | Purchase item | POST |
| `/api/workspace` | Workspace CRUD | GET/POST/PUT/DELETE |
| `/api/check-availability` | Check slug availability | GET |
| `/api/apps/:slug/:entity` | App data CRUD | GET/POST/PUT/DELETE |
| `/api/apps/:slug/migrate` | App migration SQL | POST |
| `/api/admin/stats` | Admin stats | GET |
| `/api/admin/provider-diagnostics` | Provider health | GET |
| `/api/admin/provider-health-check` | Check provider | POST |
| `/api/api-keys` | Vault CRUD | GET/POST |
| `/api/api-keys/test` | Test stored key | POST |
| `/api/workers/run` | Execute worker | POST |
| `*.alphatekx.name.ng` | Published app | GET |

---

### ====== 13. ⚙️ DATABASE ======

**Location:** `alphatekx-main/supabase/`

**Tables Used:**
| Table | Purpose |
|-------|---------|
| `profiles` | User credits, plan, activity |
| `creations` | Published apps (slug, title, code) |
| `connected_accounts` | OAuth tokens per user+provider |
| `user_integrations` | Legacy integration storage |
| `user_settings` | Encrypted API keys |
| `agents` | Automation agent definitions |
| `agent_executions` | Execution history |
| `agent_logs` | Detailed action logs |
| `app_entities` | User app data (dynamic CRUD) |
| `marketplace_items` | Marketplace listings |
| `workers` | Custom AI worker definitions |
| `workspace_history` | Workspace audit trail |

**SQL Migrations:**
- `schema.sql` — Initial schema
- `path-deploy.sql` — Deployment tables
- `phase4.sql` — Phase 4 additions
- `telegram-v1.sql` — Telegram provider support
- `gmail-integration.sql` — Gmail OAuth tables

---

### ====== 14. ☁️ INFRASTRUCTURE ======

**Location:** Root files

| File | Purpose |
|------|---------|
| `Dockerfile.backend` | Docker build for server |
| `render.yaml` | Render deployment config |
| `vercel.json` | Vercel deployment config |
| `deploy/deploy.sh` | Deployment script |
| `deploy/setup.sh` | Server setup script |
| `deployment_engine/` | Docker/Nginx/Pipeline engine |
| `.nvmrc` / `.node-version` | Node.js version pinning |

**Environment Variables Used:**
```
PORT, PUBLIC_APP_URL, NODE_ENV
VITE_SUPABASE_URL, SUPABASE_URL
VITE_SUPABASE_ANON_KEY, SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
VITE_GOOGLE_CLIENT_ID
OPENAI_API_KEY, GROQ_API_KEY, QWEN_API_KEY
KIMI_API_KEY, MINIMAX_API_KEY, FLATKEY_API_KEY
PAYSTACK_SECRET_KEY
TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
DISCORD_WEBHOOK_URL
SLACK_BOT_TOKEN, SLACK_TEST_CHANNEL
GITHUB_TOKEN
NOTION_TOKEN
RESEND_API_KEY
MASTER_LINKEDIN_CLIENT_ID, MASTER_LINKEDIN_CLIENT_SECRET
EXCHANGE_RATE_API_KEY
YOUTUBE_API_KEY
TAVILY_API_KEY
API_KEY_ENCRYPTION_KEY
OAUTH_STATE_SECRET
BUILDER_PROVIDER_ORDER
```

---

### ====== 15. 🧪 TESTING ======

**Location:** `alphatekx-main/scripts/`

| Script | Purpose |
|--------|---------|
| `builder-feature-tests.mjs/.ts` | Builder feature tests |
| `full-test-runner.ts` | Full test suite runner |
| `full-test.mjs` | Full integration tests |
| `path-deploy-test.mjs` | Deployment path tests |
| `phase3-tests.mjs/.ts` | Phase 3 regression tests |
| `phase11-tests.mjs` | Phase 11 regression tests |
| `render-smoke.mjs` | Render deployment smoke test |
| `thorough-test-runner.ts` | Thorough test runner |
| `thorough-test.mjs` | Comprehensive test suite |

---

### ====== 16. 🧩 ADDITIONAL PROJECTS ======

| Directory | Purpose |
|-----------|---------|
| `alpha-tekx-extension/` | Browser extension (background service worker) |
| `alpha-tekx-landing/` | Landing page (separate Vite app) |
| `alpha-builder/` | Builder chat panel (separate React app) |
| `test-projects/` | Test projects for deployment engine |
| `deployment_engine/` | Docker/Nginx pipeline engine |
| `preview-template/` | Template for app preview sandbox |

---

### ====== 17. 🔄 DATA FLOWS ======

**App Building Flow:**
```
User Prompt → handleAlpha() → AI Provider → JSON Response
    ↓
Parse files → Write preview → Serve preview at /preview/{id}
    ↓
User approves → Publish to {slug}.alphatekx.name.ng
    ↓
Published app runs in sandboxed iframe with AlphaAPI + localStorage bridge
```

**Agent Execution Flow:**
```
User describes automation → parseAgentFromNL() → Agent Plan
    ↓
Save agent → Wait for trigger (schedule/webhook/monitor)
    ↓
Trigger fires → runAgent() → Validate → Check credits
    ↓
Execute actions → enrichActionContent() → executeAgentAction()
    ↓
Log results → Update agent status → Schedule next run
```

**Campaign Flow:**
```
User describes campaign → buildCampaignPlan() → Generate posts
    ↓
User reviews → Activate with start time + credit charge
    ↓
runCampaignAgent() → Check due posts → Post to each platform
    ↓
Update post status → Continue until all posts published → Complete with report
```

**Payment Flow:**
```
User selects credits/plan → initializePaystackPayment()
    ↓
Return Paystack URL → User redirected to Paystack
    ↓
Paystack webhook → verifyPaystackWebhook() → Add credits
    ↓
User sees updated balance
```

---

### ====== 18. 👤 FOUNDER & ADMIN ======

| Detail | Value |
|--------|-------|
| **Founder & CEO** | Daniel Thompson |
| **Admin Email** | iamdan4live@gmail.com |
| **Platform URL** | https://alphatekx.name.ng |
| **Target Market** | Nigeria / Africa |

---

### ====== 19. KEY STATISTICS ======

| Metric | Value |
|--------|-------|
| Backend server.mjs lines | ~5,400 lines |
| Frontend pages | 50+ |
| AI providers | 6 |
| Connector integrations | 18+ |
| Supabase tables | 15+ |
| API endpoints | 40+ |
| Test scripts | 9 |
| Build projects | 4 (main + 3 sub-projects) |

---

## 🎯 Final Verdict

**AlphaTekX is an ambitious, production-grade AI SaaS platform that competes with tools like:**

- **Bolt.new / v0.dev** (AI app generation)
- **Zapier / Make** (automation workflows)
- **Hootsuite / Buffer** (social media scheduling)
- **Retool / Appsmith** (internal tools)

**With a unique focus on:**
- ✅ African market (Paystack, NGN pricing)
- ✅ Multiple AI providers with automatic failover
- ✅ Full deployment pipeline (subdomain → iframe sandbox)
- ✅ Built-in credit economy and billing
- ✅ Comprehensive connector ecosystem
- ✅ No-code social media campaign management

---

*Analysis generated by BLACKBOXAI — based on thorough examination of alphatekx-main codebase.*

