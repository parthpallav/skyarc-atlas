# Skyarc Atlas Graph Memory

Living ownership map. Update as capabilities ship.

**Baseline audited:** `df5cd9c`  
**Phase 1 correction:** `e88cb7b` / follow-up `51a683e`  
**Phase 2 booking ledger:** complete (`0010_phase2_inventory_booking`, `docs/contracts/BOOKING_API.md`)  
**Phase 3 quotes (core):** Atlas `QuoteRevision` + accept→reserve; ADR-0003; `docs/contracts/QUOTE_API.md`

## Service ownership

| Concern | Owner | Do not duplicate |
|---------|--------|------------------|
| Inventory, locations, screens | Atlas API | — |
| AvailabilityWindow capacity / holds / books | Atlas API | Pulse must not invent windows |
| Booking / BookingItem / transitions / outbox | Atlas API | Payment & execution enums separate |
| RateCard / base rates | Atlas API | Single writable rate source |
| QuoteRevision issue/accept | Atlas API | ADR-0003 — no second quote ledger |
| Campaigns, media plans, optimizer | Atlas API | — |
| Excel/WhatsApp orchestration | Pulse | Calls Atlas quotes + reserve (**pending**) |
| WhatsApp provider + webhooks | Bridge | — |
| Device telemetry / MQTT | Orbit Cloud | Separate workstream; not campaign ledger |

## Phase 1 evidence

- Peak-concurrent occupancy: `packages/shared/src/slot-occupancy.ts`
- Atomic hold recheck + Serializable retry: `holdInventoryForCampaign` + `withSerializableRetry`
- Own-hold re-plan: `allowHeldForCampaignId` + `stateBookableCounts`
- Location upsert write authz; quote authz + `PRICING_UNAVAILABLE`
- Geography city/focus hard gate; optimizer flight pro-rate
- Unit suite: `pnpm --filter @skyarc/api test:unit` (no DB)
- Tenant helpers: `tenant-context.ts` (`assertSameTenant`) — campaign routes still expanding

## Phase 2 evidence (booking + inventory)

- Models: `Booking`, `BookingItem`, `BookingTransition`, `BookingChangeOutbox`, `InventoryChangeLog`
- Migrations: `0008_bookings`, `0010_phase2_inventory_booking`
- APIs + UI: bookings list/detail, calendar, amend, events
- PG integration: concurrent last-slot, idempotency, hold expiry, partial vendor reject, failed amend, cross-tenant assert
- Command: `INTEGRATION_DATABASE_URL=… pnpm --filter @skyarc/api test:integration`

## Phase 3 evidence (quotes + pricing)

- `QuoteRevision` immutable revisions (`0009_quote_revisions`)
- Issue / get / accept: `POST /quotes`, `GET /quotes/:id`, `POST /quotes/:id/accept`
- Accept never marks ACCEPTED without booking; recovery via idempotency key
- Effective-dated segments: `rate-segments.ts`; customer-safe strip: `customer-safe-price.ts`
- Payment adapter: `payment-adapter.ts` → `UNAVAILABLE` without live provider enablement
- Campaign UI: prepare quote → inspect revision → accept & reserve → open booking
- **Pending:** live Razorpay/Stripe intent+webhook verification; Pulse orchestration; full campaign tenant sweep

## Still open / blocked

- Live paid checkout (credentials + adapter enablement)
- Pulse Excel/WhatsApp quote packaging
- MQTT ingestion (Orbit workstream)
- Campaign intelligence (blocked on Orbit + associations)
- Remaining campaign-route tenant enforcement

## Cognitive load rules

- Prefer modules under ~250 LOC with one job each; thin registrars only.
- Campaign surfaces: one status sentence + one next action; details behind disclosure.
- Never dump payment/execution/internal IDs into default daily views.
