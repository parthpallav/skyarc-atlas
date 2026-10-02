# Phase 5 — Campaign Ops, Proof & Billing API

Atlas owns execution tasks, creative versions, proof records, invoices, vendor costs, reminders, and accounting **file** export. Pulse may orchestrate packaging later; Bridge delivers notifications when configured. No second quote/reservation/financial ledger.

## First working slice

Confirmed booking → seed execution tasks (static vs digital) → approve creative → launch proof → customer progress view → issue invoice from accepted quote → record partial manual payment → outstanding balance.

**Hard rule:** booking confirm / task completion / proof approval never set `Campaign.lifecycleStatus` to live/active.

## Execution tasks

| Endpoint | Notes |
|----------|--------|
| `POST /bookings/:id/execution/seed` | Idempotent; also auto-seeded on confirm |
| `GET /bookings/:id/execution/tasks` | Includes history |
| `PATCH /execution-tasks/:id` | Status transitions + checklist/owner |
| `GET /campaigns/:id/readiness` | Overdue, blocked, upcoming launches |
| `GET /campaigns/:id/progress` | Customer-safe progress |

Templates: `static.v1` (production/mounting) vs `digital.v1` (content upload / manual CMS handoff).

## Creatives

Versioned assets linked to booking items. Validates type/size/dimensions/duration. Review decisions recorded. CMS handoff statuses are **manual** only — never claims auto schedule/playback.

## Proof

`ProofRecord` associates campaign, booking item, location asset, execution task. `capturedAt` ≠ `uploadedAt`. GPS/accuracy/submitter/provenance preserved. Review approve/reject/replace. Customer list shows approved only. Timestamps/GPS are supplied evidence, not authenticity guarantees. Missing proof stays pending.

## Billing

Invoices draft from accepted `QuoteRevision` snapshot (ADR-0003). Issue allocates tenant-scoped numbers. Immutable commercial snapshot on issue. Manual payments require actor + reference + audit; `providerConfirmed: false`. Credit notes adjust without silent invoice edits. Payment-intent uses existing adapter → `UNAVAILABLE` without credentials.

## Vendor costs (staff)

POs / bills / `CampaignExpense` with expected vs committed vs incurred vs paid. Unique `attributionKey` prevents duplicates. Commercial performance reports null gross profit when costs are flagged missing. Customer serializers omit vendor costs/margins.

## Reporting & accounting

- Ops + billing reports; customer views strip internal fields
- Tally **file** export with stable batch key + mapping validation
- Live sync returns `UNAVAILABLE` until contract/config verified

## Reminders

Persisted `ReminderJob`. Without Bridge config → `CONFIGURATION_REQUIRED`. Never report unsent as delivered.

## Deferred

- WhatsApp conversation workflows (Phase 6)
- Orbit telemetry-derived campaign intelligence
- Live payment capture verification
