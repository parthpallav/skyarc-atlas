# Atlas booking & availability API (Phase 2)

Atlas owns inventory occupancy, holds, bookings, and change events. Pulse and Bridge consume these endpoints; they must not create parallel reservation ledgers.

**Feature gate:** set `ADTECH_BOOKING=true` in production for write paths (`/bookings/*` reserve/request).

## Availability

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/inventories/:id/availability-calendar?from=&to=` | Day buckets: used/remaining capacity, window list, freshness |
| POST | `/inventories/:id/confirm-availability` | Stamp `availabilityConfirmedAt` + change log |
| POST | `/inventories/:id/availability-blocks` | Manual maintenance block window |

Calendar reflects **commercial** holds/blocks only (not Orbit device health).

## Booking lifecycle

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/bookings` | List (filters: `campaignId`, `status`, `upcoming`, `expiringHolds`) |
| GET | `/bookings/:id` | Detail + items + transitions |
| GET | `/bookings/:id/events` | Transition timeline + `BookingChangeOutbox` rows |
| POST | `/bookings/request` | Hold (`mode=hold`), idempotent via `idempotencyKey` |
| POST | `/bookings/reserve` | Hold or book (`mode=hold|book`) |
| POST | `/bookings/:id/amend` | Add/remove inventory, optional flight date change (capacity recheck) |
| POST | `/bookings/:id/cancel` | Release windows + cancel items |
| POST | `/bookings/:id/respond` | Vendor partial approve/reject by `inventoryIds` |

Item statuses transition only through allowed edges (see `services/api/src/lib/booking/transitions.ts`). No generic status PATCH.

## Integration outbox

`BookingChangeOutbox` records `booking.*` events at write time. Bridge/Pulse workers must mark `deliveredAt` only after provider ACK — never optimistically.

## Quotes (Phase 3 hook)

`Booking.acceptedQuoteRevisionId` is set when a quote revision is accepted; pricing is optional for internal booking management.

## Authorization

All routes require auth. Inventory access uses location tenancy; booking list/detail uses `bookingTenantWhere`. Cross-tenant access returns 404/forbidden.
