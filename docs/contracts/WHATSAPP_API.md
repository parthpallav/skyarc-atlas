# Phase 6 — WhatsApp workflows

## Ownership (ADR-0003)

| Concern | Owner |
|---------|--------|
| Campaigns, bookings, quotes, proposals, ops, billing, account links, confirmations | **Atlas** |
| Conversation state, brief orchestration, quote→reserve **orchestration calling Atlas** | **Pulse** |
| Provider transport, webhooks, delivery receipts, retries | **Bridge** |
| Telemetry | **Orbit** |

No second quote or reservation ledger in Pulse/Bridge.

## Account linking

- `POST /v1/whatsapp/link/challenges` — authenticated Atlas user; tenant required; single-use expiring token
- `POST /v1/whatsapp/link/complete` — binds verified phone to user+tenant
- `POST /v1/whatsapp/link/:id/revoke`
- Phone alone never grants access; ambiguous multi-tenant binds rejected

## Confirmation before mutation

- `POST /v1/whatsapp/confirmations` — expiring token tied to user + tenant + action + payload fingerprint (exact `quoteId`)
- `POST /v1/whatsapp/confirmations/execute` — revalidates via Atlas accept/reserve; duplicates do not re-run; confirmation user/tenant must match caller

## Pulse quote→reserve orchestration (authoritative)

**Status: Implemented (Atlas-backed). Integration vs live Postgres: pending. Meta live: pending.**

Flow: Linked authorized user → structured brief → `POST /campaigns/:id/scenarios` → `PROPOSAL COVERAGE|CONCENTRATION` → Atlas proposal + `QuoteRevision` → WhatsApp confirmation → `CONFIRM <token>` → Atlas accept/reserve → booking refs persisted on Pulse session.

Requirements covered:
- Authenticated Atlas client (Bearer forwarded)
- Conversation state + `ConversationAction` recovery keys
- Confirmation bound to user, tenant, action, quote revision
- Revalidate expiry/availability on Atlas accept
- Idempotent duplicates / lost-response recovery via stored action results + Atlas idempotency
- Customer-safe totals only; no AI-invented API parameters

Inbound: `POST /v1/whatsapp/inbound` requires `atlasUserId`, `tenantOrganizationId`, and `campaignId` (Atlas campaign with flight).

Earlier “conversation slice complete” did **not** mean quote/accept/reserve worked — that label is corrected.

## Bridge delivery

- Durable `OutboundMessage` with `queued|submitted|delivered|read|failed|dry_run|partial`
- Idempotency keys; webhook `providerEventId` dedup
- Production **requires** signature verification (`WHATSAPP_APP_SECRET`)
- Provider accept ≠ delivered; dry-run when Meta credentials missing

## Pending without Meta credentials

- Live delivery and live webhook verification
- Full template catalog registration with Meta
