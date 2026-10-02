# Skyarc Atlas Graph Memory

Living ownership map. Update as capabilities ship.

**Baseline audited:** `df5cd9c`  
**Phase 1 correction:** `e88cb7b` / follow-up `51a683e`  
**Phase 2 booking ledger:** in progress on tip after 2026-10-02  
**Digital availability + self-serve builder:** `DigitalAvailabilityPanel`, `liveInventory.breakdown/dailySeries`, `/campaigns/builder`, sandbox `PaymentIntent`, `BookingCreative` (2026-10-02 branch)

## Service ownership

| Concern | Owner | Do not duplicate |
|---------|--------|------------------|
| Inventory, locations, screens | Atlas API | — |
| AvailabilityWindow capacity / holds / books | Atlas API | Pulse must not invent windows |
| Booking / BookingItem / transitions | Atlas API | Links to AvailabilityWindow; payment & execution enums separate |
| Campaigns, media plans, optimizer | Atlas API | — |
| Quotes (play-based), Excel/WhatsApp orchestration | Pulse | Reserve via Atlas `/bookings/reserve` |
| WhatsApp provider + webhooks | Bridge | — |
| Device telemetry | Orbit Cloud | Not campaign ledger |

## Phase 1 evidence

- Peak-concurrent occupancy: `packages/shared/src/slot-occupancy.ts`
- Atomic hold recheck: `holdInventoryForCampaign` Serializable + capacity skip/fail
- Own-hold re-plan: `allowHeldForCampaignId` + `stateBookableCounts`
- Location upsert write authz; quote authz + `PRICING_UNAVAILABLE`
- Geography city/focus hard gate; optimizer flight pro-rate; CI-safe optimizer tests
- Tenant helper: `tenant-context.ts` (full isolation still expanding)

## Phase 2 evidence (booking)

- Models: `Booking`, `BookingItem`, `BookingTransition` + `AvailabilityWindow.campaignId`
- Migration: `prisma/migrations/0008_bookings`
- Sync on hold/book: `services/api/src/lib/booking/reserve.ts` inside Serializable hold txn
- APIs: `GET /bookings`, `GET /bookings/:id`, `POST /bookings/reserve`, cancel, vendor respond
- Hold expiry: `expireStaleHolds` on list/get + analysis runner tick
- Campaign UI: bookings panel on campaign detail
- Unit: `booking-status.test.ts`

## Phase 3 evidence (quotes)

- `QuoteRevision` immutable revisions with minor-unit totals (`0009_quote_revisions`)
- Issue / get / accept APIs: `POST /quotes`, `GET /quotes/:id`, `POST /quotes/:id/accept`
- Accept revalidates price + feasibility then calls `holdInventoryForCampaign`
- Money helpers: `services/api/src/lib/booking/money.ts`

## Still open

Full versioned rate rules engine, MQTT ingestion, WhatsApp production delivery, ops/billing parity, deep tenant isolation, customer booking UI polish — see plan doc.

## Cognitive load rules (product + code)

- Prefer modules under ~250 LOC with one job each; thin registrars only.
- Campaign surfaces: one status sentence + one next action; details behind disclosure.
- Never dump payment/execution/internal IDs into default daily views.
