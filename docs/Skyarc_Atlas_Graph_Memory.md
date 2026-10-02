# Skyarc Atlas Graph Memory

Living ownership map. Update as capabilities ship.

**Baseline audited:** `df5cd9c`  
**Phase 1 correction commit:** pending on branch tip after 2026-10-02 platform plan.

## Service ownership

| Concern | Owner | Do not duplicate |
|---------|--------|------------------|
| Inventory, locations, screens | Atlas API | — |
| AvailabilityWindow capacity / holds / books | Atlas API | Pulse must not invent windows |
| Campaigns, media plans, optimizer | Atlas API | — |
| Quotes (play-based), Excel/WhatsApp orchestration | Pulse | Reserve via Atlas |
| WhatsApp provider + webhooks | Bridge | — |
| Device telemetry | Orbit Cloud | Not campaign ledger |

## Phase 1 evidence (2026-10-02)

- Peak-concurrent occupancy: `packages/shared/src/slot-occupancy.ts`
- Atomic hold recheck: `holdInventoryForCampaign` Serializable + capacity skip/fail
- Location upsert write authz on POST `/locations`
- Booking quote inventory access + rate override lockdown + `PRICING_UNAVAILABLE`
- Geography: city/focus hard gate without state spillover
- Optimizer flight pro-rate via `services/api/src/lib/media-planning/rates.ts`
- Optimizer unit tests no longer import prisma side-effect module

## Still open

Booking entity model, versioned pricing, MQTT, WhatsApp production delivery, ops/billing parity — see `docs/superpowers/plans/2026-10-02-ooh-platform-completion.md`.
