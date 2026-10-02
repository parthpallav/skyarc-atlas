# Phase 7A — Continuity & Fill-Rate Recommendations API

Atlas owns inventory, capacity, rates, quotes, confirmations, and bookings. Pulse orchestrates recommendation packaging/notifications. Bridge delivers. Orbit-aware intelligence is **Phase 7B** (deferred).

Recommendations are **not** a quote or reservation ledger. They never reserve capacity and never auto-issue customer offers or change published prices.

## Continuity disruptions (authoritative only)

Detect from Atlas records only — never from missing Orbit telemetry:

| Trigger | Source |
|---------|--------|
| `VENDOR_REJECTION` | `BookingItem.status = REJECTED` |
| `INVENTORY_UNAVAILABLE` | Active booking item whose inventory is `UNAVAILABLE` |
| `OPS_INCIDENT` | Blocked `ISSUE_RESOLUTION` execution task |
| `LAUNCH_BLOCKED` | Blocked `LAUNCH_VERIFICATION` task |

Replacements consider geography, format, remaining flight, capacity (`isInventoryFreeForFlight`), and authoritative customer rates. Each suggestion includes why it fits, limitations, and commercial delta. **No hold/reserve** on suggest.

## Fill-rate packages

Upcoming vacant capacity via date-based availability. Packages use configured rates, eligible formats, vacancy dates, minimum prices, and margin rules. Confirmed vendor costs vs missing costs are distinguished; margin-dependent filtering is **suppressed** when costs are incomplete. Methods are labeled `DETERMINISTIC_RULE` or `HEURISTIC` — never claimed as predictive demand.

## Endpoints (staff / internal)

| Endpoint | Notes |
|----------|--------|
| `GET /recommendations` | Staff queue: disruptions, packages, missing-data warnings |
| `GET /recommendations/:id` | Staff full; clients get sanitized continuity only |
| `POST /recommendations/scan` | Continuity + fill-rate scan; reconciles `triggerKey` |
| `POST /recommendations/:id/recalculate` | Required before execute when stale/expired |
| `POST /recommendations/:id/approve` | Authorized approval; enqueues reminder (Bridge when configured) |
| `POST /recommendations/:id/dismiss` | Dismiss with history |
| `POST /recommendations/:id/apply` | Continuity only: revalidate availability+price → `amendBooking`; preserve on fail; reject duplicate apply |

## Records (`CommercialRecommendation`)

Persists tenant refs, trigger, observation time, input snapshot, rule version, suggestions, explanation, freshness/expiry, review status, action history. Duplicate triggers reconcile. Expired must be recalculated before apply.

## Notifications

Approved / applied events enqueue Atlas `ReminderJob` (`OTHER` with payload kind `RECOMMENDATION_APPROVED` / `BOOKING_UPDATE`). Pulse `/v1/ops-notifications/whatsapp` accepts `RECOMMENDATION_APPROVED` and `CONTINUITY_ALERT`. Dry-run vs live delivery remains Bridge-owned.

## Validation scenarios

1. Vendor rejection → replacement suggestions → approve → apply → revised commercial terms when price drifts; original booking preserved on capacity failure.
2. Upcoming vacancy → commercially valid package → staff review (no auto offer).
3. Tenant isolation on list/mutate; duplicate trigger reconcile; stale block on approve/apply; missing rates/costs; concurrent capacity loss on apply.

## Deferred (do not mark complete)

- Live Meta delivery + signed webhook verification
- Approved Meta template catalog
- Live payments
- Live Tally synchronization
- **Phase 7B:** MQTT ingestion, validated telemetry, effective-dated device/screen mappings, campaign associations → then Orbit-aware campaign intelligence
