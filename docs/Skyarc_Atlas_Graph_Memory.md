# Skyarc Atlas Graph Memory

Living ownership map. Update as capabilities ship.

**Baseline audited:** `df5cd9c`  
**Phase 1 correction:** `e88cb7b` / follow-up `51a683e`  
**Phase 2 booking ledger:** in progress on tip after 2026-10-02

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

## Still open

Versioned pricing/immutable quotes, MQTT ingestion, WhatsApp production delivery, ops/billing parity, deep tenant isolation on all queries — see plan doc.
