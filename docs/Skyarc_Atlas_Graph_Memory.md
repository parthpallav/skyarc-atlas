# Skyarc Atlas Graph Memory

Living ownership map. Update as capabilities ship.

**Baseline audited:** `df5cd9c`  
**Phase 1 correction:** `e88cb7b` / follow-up `51a683e`  
**Phase 2 booking ledger:** complete (`0010_phase2_inventory_booking`, `docs/contracts/BOOKING_API.md`)  
**Phase 3 quotes (core):** Atlas `QuoteRevision` + accept→reserve; ADR-0003; `docs/contracts/QUOTE_API.md`
**Phase 4 proposals:** Coverage/Concentration scenarios + immutable `ProposalRevision` + share tokens + PDF/XLSX/PPTX; `docs/contracts/PROPOSAL_API.md`
**Phase 5 ops/billing:** ExecutionTask, CreativeVersion, ProofRecord, Invoice/Payment/CreditNote, vendor costs, Tally file export, ReminderJob; `docs/contracts/OPS_BILLING_API.md`
**Phase 6 WhatsApp:** Atlas link+confirm; Pulse **Atlas-backed** quote→reserve orchestration; Bridge durable delivery; `docs/contracts/WHATSAPP_API.md`
**Google OIDC:** config-gated start/callback/link + invitations (`0016`); `docs/contracts/AUTH_GOOGLE_OIDC.md`; live Google pending
**Phase 7A recommendations:** Continuity + fill-rate via `CommercialRecommendation`; `docs/contracts/RECOMMENDATIONS_API.md`; Orbit intelligence deferred to 7B
**Phase 7B telemetry:** Lunar MQTT Spec v1.0 wire compatibility + durable inbox; Atlas mappings + evidence; Orbit unit = **handler/simulator only (not broker-verified)**; `ORBIT_TELEMETRY_API.md` + `ORBIT_MQTT_LUNAR_COMPATIBILITY.md`
**Product integrations evidence:** `docs/contracts/PRODUCT_INTEGRATIONS_EVIDENCE.md`

## Service ownership

| Concern | Owner | Do not duplicate |
|---------|--------|------------------|
| Inventory, locations, screens | Atlas API | — |
| AvailabilityWindow capacity / holds / books | Atlas API | Pulse must not invent windows |
| Booking / BookingItem / transitions / outbox | Atlas API | Payment & execution enums separate |
| RateCard / base rates | Atlas API | Single writable rate source |
| QuoteRevision issue/accept | Atlas API | ADR-0003 — no second quote ledger |
| ProposalRevision / share tokens / scenario packing | Atlas API | Pulse orchestrates; no second pricing/reserve ledger |
| Execution tasks / creatives / proof | Atlas API | Confirm ≠ campaign LIVE |
| Invoice / payment / credit / vendor cost | Atlas API | From QuoteRevision snapshot; staff-only costs |
| Tally file export / reminders | Atlas API | Live sync & Bridge delivery config-gated |
| WhatsApp account link + mutation confirmations | Atlas API | Phone alone never grants access |
| WhatsApp conversation orchestration | Pulse | Calls Atlas APIs; no quote ledger |
| WhatsApp transport / webhooks / receipts | Bridge | Production signature mandatory |
| Commercial continuity / fill-rate recommendations | Atlas API | Pulse notifies; no reserve/quote ledger copy |
| Device↔screen effective-dated mappings + campaign evidence | Atlas API | Historical joins; no raw telemetry store |
| Device credentials, MQTT/HTTPS ingest, measurements, aggregates, incidents | Orbit Cloud | No booking/quote ledger |
| Operational-risk snapshots from Orbit evidence | Atlas/Pulse | Not audience forecasts |
| Campaigns, media plans, optimizer | Atlas API | — |
| Excel/WhatsApp quote→reserve orchestration | Pulse | **Atlas-backed orchestration implemented**; PG e2e + Meta pending |
| Device telemetry / MQTT live hardware | Orbit Cloud | Handler/simulator verified; **not broker-verified**; live pending |

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
- **Pending:** live Razorpay/Stripe intent+webhook verification; Pulse orchestration
- Tenant sweep: campaign-access on media-plans, quotes, proposals, exports (**done core**)

## Phase 4 evidence (scenarios + customer proposals)

- Scenarios: `POST /campaigns/:id/scenarios` — Coverage vs Concentration; no reservation
- Issue: `POST /campaigns/:id/proposals` → linked immutable QuoteRevision + frozen snapshot
- Accept: revalidates via quote accept → single booking
- Share: hashed tokens; view-only public GET; revoke/expiry; never authorizes book/pay
- Exports: PDF / XLSX / PPTX from same snapshot; customer-safe filtering
- Migration: `0011_phase4_proposals`
- UI: `/campaigns/[id]/scenarios`, `/proposals/[id]`, `/share/proposals/[token]`
- Unit: `proposals-scenarios.test.ts` (PPTX slides, xlsx, score strip, token hash)

## Phase 5 evidence (ops + billing)

- Seed tasks on booking confirm (static.v1 / digital.v1); campaign lifecycle untouched
- Creative versioning + manual CMS handoff statuses
- Proof with capturedAt vs uploadedAt + review; customer sees approved only
- Invoice draft/issue from accepted quote; manual partial payment + outstanding; credit notes
- Vendor PO/expense attribution keys; GP null when costs missing
- Tally FILE_EXPORT vs LIVE_SYNC UNAVAILABLE; reminders never false-delivered
- Migration: `0012_phase5_ops_billing`
- UI: `/campaigns/[id]/ops`, `/campaigns/[id]/billing`
- Unit: `phase5-ops-billing.test.ts`
- Security: proof `replacesProofId` scoped to campaign/tenant; invoice AR hidden from vendors; manual payments transactional; remaining medium gaps (creative r2Key binding, location asset write authz) tracked as release blockers

## Phase 6 evidence (WhatsApp)

- Upload harden: creatives/proofs require UPLOADED LocationAsset; forged r2Key rejected (`authorized-assets.test.ts`)
- Bridge: deliveryStatus, idempotency, webhook dedup, partial send, dry-run, prod signature gate
- Atlas: WhatsAppAccountLink / LinkChallenge / ActionConfirmation (`0013`)
- Pulse: ConversationSession + ops notification fan-out with receipt tracking
- Live Meta delivery + webhook verification: **pending credentials**

## Phase 7A evidence (continuity + fill-rate)

- Model: `CommercialRecommendation` + enums (`0014_phase7a_recommendations`)
- Detection from authoritative records only (vendor reject, unavailable inventory, blocked ops/launch) — no Orbit inference
- Replacements + fill-rate packages: deterministic/heuristic labels; margin suppressed when costs missing; no capacity reserve
- Apply: authorized approve → revalidate availability/price → `amendBooking`; preserve on fail; duplicate apply blocked
- UI: staff `/recommendations` queue; customer serializers strip costs/margins
- Pulse ops notify kinds: `RECOMMENDATION_APPROVED`, `CONTINUITY_ALERT` (Bridge dry-run/live preserved)
- Contract: `docs/contracts/RECOMMENDATIONS_API.md`
- Unit: `phase7a-recommendations.test.ts`
- **Phase 7B:** see below

## Phase 7B evidence (Orbit telemetry + associations)

- **Lunar Spec v1.0 wire:** `skyarc/v1/orbit/{physicalDeviceId}/{channel}` + envelope `messageId/deviceId/timestamp/type/version/payload`
- Compatibility matrix: `docs/contracts/ORBIT_MQTT_LUNAR_COMPATIBILITY.md` (proposed additions explicit / unconfirmed)
- Internal normalize → `7b.v1`; physical id → UUID + tenant via registry
- Orbit: durable inbox (dedupe messageId/device), raw, measurements, separated state, incidents, aggregates, coverage, commands/config history, retention
- MQTT consumer on Lunar topics; directional ACL helpers; HTTPS `/ingest/v1/lunar` simulator path
- Offline baseline: events+acks queueable; telemetry/heartbeat gaps → unknown (no pretend offline telemetry summaries)
- Does **not** infer screen power from voltage or playback from heartbeat
- Atlas: `DeviceScreenMapping` (`0015`), relocate, `GET /campaigns/:id/orbit-evidence`, operational-risk snapshots
- UI: `/campaigns/[id]/orbit-evidence`
- Unit: Orbit phase7b 22 tests; Atlas phase7b-orbit-evidence
- **Backend implemented / Simulator verified** vs **Physical-device verified (blocked)** vs **Pending Lunar §10** vs **Pending production broker config** — reported separately
- Audience/impressions/reach/verified delivery: **still blocked**

## Still open / blocked

- Live paid checkout (credentials + adapter enablement) — **not production-ready**
- Live Tally synchronization (file export only for now)
- Live WhatsApp Meta delivery + webhook verification + approved template catalog (adapters ready; dry-run without credentials)
- Pulse Excel/WhatsApp **quote→reserve** orchestration (XLSX export + conversation slice done; full Atlas quote loop pending)
- Google sign-up/onboarding — **deferred** (email/password only; no Google OAuth in repo)
- Live MQTT broker ACLs + physical Orbit Edge/Sense verification
- Campaign intelligence forecasts (blocked on validated evidence sources)
- Creative r2Key / proof asset auth: **resolved** (locationAssetId + UPLOADED checks)
- Remaining medium: stronger invoice sequence serializable TX under load

## Cognitive load rules

- Prefer modules under ~250 LOC with one job each; thin registrars only.
- Campaign surfaces: one status sentence + one next action; details behind disclosure.
- Never dump payment/execution/internal IDs into default daily views.
