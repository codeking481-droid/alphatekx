# Telegram V1 Native - Implementation TODO

## Branch: feature/telegram-v1-native
## Status: 🟡 In Progress

### Step 1: Add route handlers to server.mjs ✅
- [x] Import `telegramProvider` already at line 18
- [x] Add `POST /api/integrations/telegram/start` — Generate state token, return bot username
- [x] Add `POST /api/integrations/telegram/status` — Check binding status for user
- [x] Add `POST /api/integrations/telegram/disconnect` — Deactivate binding
- [x] Add `POST /api/telegram/webhook` — External Telegram webhook endpoint
- [x] Add `POST /api/admin/telegram/setup-webhook` — Admin-only webhook registration

### Step 2: Update integrationsStatus to detect telegram binding ✅
- [x] Check `telegram_chat_bindings` table for active binding per user
- [x] Return `connected: true` and `identifier` (chat_id) when binding exists

### Step 3: Update connectorReady('telegram') for V1 ✅
- [x] If telegramProvider has feature_flags table and `telegram_integration` is enabled, return true
- [x] Keep env-var fallback for backward compatibility

### Step 4: Add frontend Telegram functions to integrations.ts ✅
- [x] `startTelegramConnection()` — Call start endpoint, return bot username, open Telegram link
- [x] `getTelegramStatus()` — Poll binding status
- [x] `disconnectTelegram()` — Disconnect and deactivate binding

### Step 5: Create scripts/telegram-v1-tests.mjs ✅
- [x] Valid connection state test
- [x] Expired state test
- [x] Forged state test
- [x] Replayed state test
- [x] Invalid webhook secret test
- [x] Correct user/chat binding test
- [x] Duplicate chat binding blocked test
- [x] Public user blocked while Beta test
- [x] Admin/beta user allowed test
- [x] Successful send with message_id test
- [x] Provider response missing message_id test
- [x] Duplicate approval sends once test
- [x] Success charges once test
- [x] Failure charges zero test
- [x] Disconnect prevents future sends test

### Step 6: Create git commit and PR ✅
- [x] Git add all changed/new files
- [x] Commit with descriptive message
- [x] Push to origin
- [x] Create draft PR

### Step 7: Run verification commands ✅
- [x] Run lint
- [x] Run typecheck
- [x] Run production build
- [x] Run telegram V1 tests
- [x] Run LinkedIn tests (ensure green)

