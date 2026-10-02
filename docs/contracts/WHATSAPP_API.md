# Phase 6 — WhatsApp workflows

## Ownership (ADR-0003)

| Concern | Owner |
|---------|--------|
| Campaigns, bookings, quotes, proposals, ops, billing, account links, confirmations | **Atlas** |
| Conversation state, brief orchestration, ops notification fan-out | **Pulse** |
| Provider transport, webhooks, delivery receipts, retries | **Bridge** |
| Telemetry | **Orbit** (deferred) |

No second quote or reservation ledger in Pulse/Bridge.

## Account linking

- `POST /v1/whatsapp/link/challenges` — authenticated Atlas user; tenant required; single-use expiring token
- `POST /v1/whatsapp/link/complete` — binds verified phone to user+tenant
- `POST /v1/whatsapp/link/:id/revoke`
- Phone alone never grants access; ambiguous multi-tenant binds rejected

## Confirmation before mutation

- `POST /v1/whatsapp/confirmations` — expiring token tied to action + payload fingerprint
- `POST /v1/whatsapp/confirmations/execute` — revalidates via Atlas accept/reserve; duplicates do not re-run

## Bridge delivery

- Durable `OutboundMessage` with `queued|submitted|delivered|read|failed|dry_run|partial`
- Idempotency keys; webhook `providerEventId` dedup
- Production **requires** signature verification (`WHATSAPP_APP_SECRET`)
- Provider accept ≠ delivered; partial text/document tracked separately
- Dry-run when Meta credentials missing
- 24h customer-care window + template/consent rules (`whatsapp-policy.ts`)

## Pulse conversation slice

Linked user → brief → clarify → scenario/proposal pointers → CONFIRM → Atlas execute → STATUS.

Ops notifications: vendor/hold/proof/invoice reminders via Bridge with receipt tracking; scoped links; no internal costs in message text.

## Pending without Meta credentials

- Live delivery and live webhook verification (adapters + mocked tests complete)
- Full template catalog registration with Meta
