# Composio Connector Implementation + Admin Login Fix

## Branch: feature/composio-connector

## Status: 🟡 In Progress

### Phase 1: Admin Login Fix
- [ ] Diagnose root cause of iamdan4live@gmail.com infinite sign-in
- [ ] Add timeout/error recovery to refreshProfile in auth.tsx
- [ ] Ensure loading state always resolves

### Phase 2: Create server/composioConnectorService.mjs
- [ ] Implement Composio SDK initialization with @composio/core
- [ ] Provider configuration from env vars (COMPOSIO_API_KEY, COMPOSIO_*_AUTH_CONFIG_ID)
- [ ] Methods: initialize, listProviders, getConnectedApps, startConnection, getConnectionStatus
- [ ] Methods: reconnectProvider, disconnectProvider, executeProviderAction, getExecutionHistory
- [ ] User isolation (AlphaTekx user ID as Composio user ID)
- [ ] Provider alias resolution (twitter -> X/Twitter)
- [ ] Action allowlist with validation
- [ ] Startup validation (missing config for one provider doesn't crash server)

### Phase 3: Add route handlers to server.mjs
- [x] GET /api/connected-apps
- [x] POST /api/connect/:provider
- [x] GET /api/connect/:provider/status
- [x] POST /api/reconnect/:provider
- [x] DELETE /api/disconnect/:provider
- [x] POST /api/execute/:provider/:action
- [x] GET /api/connected-apps/executions/:provider
- [x] OAuth callback route if required by SDK

### Phase 4: Update Connectors.tsx frontend
- [x] Add Composio-powered providers to the UI
- [x] Replace manual API-key entry with OAuth buttons for Composio providers
- [x] Add Connect/Connecting/Connected/Reconnect/Disconnect states
- [x] Poll server status with timeout (no infinite spin)
- [x] Show truthful failure messages
- [x] Keep native LinkedIn/Telegram/Google flows intact

### Phase 5: Create tests
- [x] scripts/composio-connector-tests.mjs with tests

