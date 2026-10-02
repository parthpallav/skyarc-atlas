# Atlas quotes & pricing API (Phase 3)

**Ownership:** See [`docs/architecture/ADR-0003-quote-ownership.md`](../architecture/ADR-0003-quote-ownership.md).

Atlas is the authoritative store for `RateCard` and immutable `QuoteRevision`. Pulse must not create a second quote ledger; future Pulse orchestration calls these Atlas APIs.

**Feature gate:** `ADTECH_BOOKING=true` for write paths in production.

## Pricing

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/booking/quote` | Read-only feasibility + customer-safe price breakdown |

- Missing rates → `PRICING_UNAVAILABLE`
- Non-internal callers cannot override `baseRateAmount` / GST
- Effective-dated rate cards overlapping the flight are selected (mid-flight rate changes segmented)
- Response strips internal margin/cost lines (`customerSafePriceBreakdown`)

## Quote revisions

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/quotes` | Issue immutable revision (supersedes prior ISSUED for campaign) |
| GET | `/quotes/:id` | Fetch revision (tenant-scoped) |
| POST | `/quotes/:id/accept` | Revalidate price + availability → Atlas reserve → mark ACCEPTED |

### Acceptance rules

- Idempotent via `idempotencyKey` (default `quote-accept:{quoteId}`)
- Never marks ACCEPTED without `acceptedBookingId`
- If reservation succeeds but quote persistence fails → error with `bookingId`; retry accept recovers
- Default requires full inventory; `allowPartial: true` reserves available subset
- Expired quotes → `EXPIRED` and rejected

## Payments

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/bookings/:id/payment-intent` | Provider adapter; returns `UNAVAILABLE` until live credentials + adapter enabled |

Payment, booking, and execution statuses remain separate. Live payment verification is **pending** without provider credentials — no mocked success.

## Tenant isolation

Non-internal actors require `organizationId`. Quote/booking reads use `assertSameTenant` against `tenantOrganizationId`. Null-tenant legacy rows are internal-only.
