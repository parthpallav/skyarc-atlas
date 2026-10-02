# Booking & self-service API (Atlas)

## Quotes (existing)

- `POST /api/v1/booking/quote` — feasibility + itemized price preview
- `POST /api/v1/quotes` — issue `QuoteRevision`
- `POST /api/v1/quotes/:id/accept` — revalidate, reserve, create booking
- `GET /api/v1/quotes/:id`

## Bookings (existing)

- `GET /api/v1/bookings`, `GET /api/v1/bookings/:id` (includes `paymentIntents`, `creatives`)
- `POST /api/v1/bookings/reserve`, cancel, vendor respond

## Payments (sandbox-first)

- `POST /api/v1/payments/intents` — body `{ quoteRevisionId, idempotencyKey }`; amount locked to quote `totalMinor`
- `POST /api/v1/payments/webhooks/test` — signed provider events (`x-skyarc-payment-signature`)
- `POST /api/v1/payments/test/capture` — authenticated sandbox capture (no live gateway)

`PAYMENTS_PROVIDER=test|off` (default `test`). Live Razorpay remains disabled until credentialed.

## Creatives

- `GET /api/v1/bookings/:id/creatives`
- `POST /api/v1/bookings/:id/creatives` — `{ assetUrl, fileName?, notes? }`

Statuses: `REQUIRED → SUBMITTED → IN_REVIEW → APPROVED|REJECTED`.

## Location availability

`GET /api/v1/locations/:id?from=&to=` returns `liveInventory` with:

- `breakdown` (held/booked/blocked/available)
- `dailySeries`, `computedAt`, `playbackSpec`, `unitIndicators`
