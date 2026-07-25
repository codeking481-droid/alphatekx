# Telegram V1 Implementation Plan

## Information Gathered

After thorough codebase analysis:

1. **Existing Telegram support** is minimal — uses `MASTER_TELEGRAM_BOT_TOKEN` env var with hardcoded `TELEGRAM_CHAT_ID`. `postToTelegram()` and `resolveTelegramChatId()` exist in server.mjs but extract chat_id from `getUpdates` (polling), not from a secure webhook-linked binding.

2. **connected_accounts table** already exists in Supabase schema with columns: `id, user_id, provider, email, tokens (jsonb), scopes, created_at, updated_at`. This supports multiple providers via `user_id, provider` unique constraint.

3. **No feature flags table exists.** The codebase uses server-side checks like `adminEmail` checks and `process.env` gating. The user requested using the "existing database-controlled Feature Management system" but none exists. I'll add a `feature_flags` table.

4. **OAuth state pattern** exists in server.mjs via `createOAuthState()`/`verifyOAuthState()` — HMAC-signed, expiring tokens. I'll reuse this pattern for Telegram connection state.

5. **Integration status** is served via `GET /api/integrations/status` which reads `connected_accounts` + `user_integrations`. Telegram status shows `connected: true` if `tokens.bot_token` exists. I need to add `telegram_chat_id` awareness.

6. **Credits system** is in `server/billing.mjs` with `spendCredits()` called after successful actions. Telegram sends at 2 credits per message.

7. **No existing test files** in the pattern I need but there are test scripts in `scripts/` directory I can follow.

## Plan

### Files to Create:
1. `supabase/telegram-v1.sql` — Migration: `telegram_chat_bindings` table + `feature_flags` table
2. `server/telegramProvider.mjs` — Telegram V1 native module: state token, webhook, send, disconnect
3. `scripts/telegram-v1-tests.mjs` — Comprehensive test suite

### Files to Modify:
4. `server.mjs` — Add routes, import telegramProvider, modify `postToTelegram()` to use bindings
5. `server/automation/capabilityRegistry.mjs` — Update telegram actions to use user-bound chat_id
6. `src/lib/integrations.ts` — Add Telegram connection functions
7. `.env.example` (or documentation) — Document new env vars

### Database Schema (telegram_chat_bindings):
```sql
CREATE TABLE public.telegram_chat_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_chat_id TEXT NOT NULL,
  telegram_user_id BIGINT,
  telegram_username TEXT,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(telegram_chat_id),
  UNIQUE(user_id)
);

CREATE TABLE public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_name TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  beta_testers TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.feature_flags (flag_name, enabled, beta_testers)
VALUES ('telegram_integration', false, ARRAY['iamdan4live@gmail.com']);
```

### Environment Variables:
- `TELEGRAM_BOT_TOKEN` — Official bot token (server-only)
- `TELEGRAM_BOT_USERNAME` — Bot username (e.g., AlphaTekXBot)
- `TELEGRAM_WEBHOOK_SECRET` — Secret header for Telegram webhook verification
- `TELEGRAM_CONNECTION_STATE_SECRET` — HMAC secret for state tokens

### Route Handlers:
1. `POST /api/integrations/telegram/start` — Generate state token, return bot username
2. `POST /api/integrations/telegram/status` — Poll if webhook linked chat_id
3. `POST /api/integrations/telegram/disconnect` — Deactivate binding
4. `POST /api/telegram/webhook` — Telegram webhook handler
5. `POST /api/admin/telegram/setup-webhook` — Admin-only webhook registration

### Connection Flow:
1. UI → `POST /api/integrations/telegram/start` → `{ botUsername, state }`
2. UI opens `https://t.me/{botUsername}?start={state}`
3. User presses Start → Telegram → `POST /api/telegram/webhook`
4. Server verifies secret header, HMAC state, expiry, replay
5. Server upserts `telegram_chat_bindings` for that user
6. Bot replies "Telegram connected successfully to AlphaTekX."
7. UI polls `POST /api/integrations/telegram/status` → returns `{ connected: true }` when binding exists

### Send Flow:
1. User/automation requests send to Telegram
2. Server verifies authenticated user
3. Server checks `feature_flags` — `telegram_integration` enabled for beta testers
4. Server loads user's active `telegram_chat_bindings` row
5. Server checks credits (≥ 2)
6. Server creates idempotency key
7. Requires explicit approval
8. Calls Telegram `sendMessage` API
9. Only on `data.ok === true && data.result.message_id`:
   - Persist message_id
   - Save history
   - Deduct credits once (2)

### Statuses (honest):
- Awaiting Approval
- Sending
- Sent
- Failed
- Needs Attention

### Feature Management:
- Feature flag in `feature_flags` table: `telegram_integration`
- Beta testers list in the same row
- Server-side `requireFeatureAccess(flagName, user)` check
- `connectorReady('telegram')` checks feature flag + token configured

---

**Shall I proceed with implementation?**
