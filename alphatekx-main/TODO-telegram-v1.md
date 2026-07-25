# Telegram V1 Native - Implementation TODO

## 1. Database Migration
- [ ] Create `supabase/telegram-v1.sql` with `telegram_chat_bindings` table
- [ ] Add to `schema.sql` for completeness

## 2. Server: Telegram Module (`server/telegramProvider.mjs`)
- [ ] State token generation (HMAC-signed, expiring)
- [ ] State token verification
- [ ] Webhook handler
- [ ] sendTelegramMessage() function
- [ ] Disconnect handler
- [ ] Webhook setup function

## 3. Server: server.mjs route additions
- [ ] POST /api/telegram/webhook
- [ ] POST /api/integrations/telegram/start
- [ ] POST /api/integrations/telegram/status
- [ ] POST /api/integrations/telegram/disconnect
- [ ] POST /api/admin/telegram/setup-webhook
- [ ] Feature management integration (feature_flags table check)

## 4. Frontend: integration updates
- [ ] Add Telegram to integrations page
- [ ] Connect button triggers backend state generation

## 5. Capability Registry Updates
- [ ] Update telegram capabilities to use user-bound chat_id from bindings

## 6. Tests
- [ ] Create `scripts/telegram-v1-tests.mjs`
- [ ] Test signed-state success
- [ ] Test expired state
- [ ] Test forged state
- [ ] Test replayed state
- [ ] Test invalid webhook secret
- [ ] Test correct user linking
- [ ] Test one chat cannot attach to two users
- [ ] Test public user blocked while Beta
- [ ] Test admin/beta user allowed
- [ ] Test send requires approval
- [ ] Test send with valid message_id
- [ ] Test send with missing message_id
- [ ] Test duplicate approval sends once
- [ ] Test success charges once
- [ ] Test failure does not charge
- [ ] Test disconnect prevents future sends
- [ ] Test existing LinkedIn behaviour unchanged

## 7. Git
- [ ] Create branch `feature/telegram-v1-native`
- [ ] Commit all changes
- [ ] Push to origin
- [ ] Create draft PR

## 8. Report
- [ ] Architecture overview
- [ ] Database migration
- [ ] Environment variables
- [ ] Webhook setup
- [ ] Connection flow
- [ ] Send flow
- [ ] Feature Management integration
- [ ] Credit behaviour
- [ ] Tests summary
- [ ] Branch & commit hash
- [ ] PR link
- [ ] Production setup steps
