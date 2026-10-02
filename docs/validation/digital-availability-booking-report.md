# Digital availability & customer booking — validation report

**Date:** 2026-10-02  
**Branch:** local feature work (not merged/deployed per plan)

## Working behavior

| Flow | Status |
|------|--------|
| `liveInventory` breakdown + daily series + freshness | Implemented (`@skyarc/shared`, locations API) |
| `DigitalAvailabilityPanel` on location detail + availability tab | Implemented |
| Inline flight date picker on location detail | Implemented |
| Customer **Configure campaign** → `/campaigns/builder` | Implemented |
| Builder: dates → package → quote preview → issue quote → hold → sandbox pay | Implemented |
| `PaymentIntent` + test webhook/capture + `Booking.paymentStatus` | Implemented |
| `BookingCreative` + booking tracking UI | Implemented |
| Planner media-plan / reservation panel | Unchanged |

## Manual demo checklist

1. Open location as client with `?from=&to=` → panel shows capacity, legend, freshness.
2. Change dates → availability refetches.
3. **Configure campaign** → builder → pricing preview → select campaign → issue quote.
4. **Reserve (hold)** → booking created; creative `REQUIRED`.
5. **Pay (sandbox)** → payment intent + test capture → `paymentStatus=CAPTURED`.
6. Booking detail shows separate booking / payment / execution / creative cards.

## Automated tests

- `services/api/src/tests/slot-occupancy-breakdown.test.ts`
- `services/api/src/tests/payments.test.ts` (signature)

## Remaining blockers

- **Live payment gateway** (Razorpay/etc.) — adapter stub only; `PAYMENTS_PROVIDER=off` in prod until credentialed.
- **CMS playback / PoP** — not integrated; execution status not driven by CMS.
- **Quote expiry cron** — still lazy on accept.
- **Run migration** `0011_self_service_payments` on environments before using payments/creatives tables.
