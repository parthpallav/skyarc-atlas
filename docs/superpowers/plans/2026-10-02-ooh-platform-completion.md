# Skyarc Atlas — OOH Platform Completion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Deliver dependable inventory → availability → planning → pricing → proposal → approval → reservation → execution → proof → billing workflows on Atlas/Pulse/Bridge/Orbit without duplicate ledgers.

**Architecture:** Atlas owns inventory, availability windows, bookings/reservations, and tenant-scoped records. Pulse owns quotes, exports, planning orchestration, and campaign intelligence snapshots. Bridge owns provider delivery. Orbit Cloud owns telemetry ingestion and device state. No second reservation ledger.

**Tech Stack:** Fastify + Prisma + Postgres/PostGIS (Atlas API), Pulse/Bridge Fastify services, Next.js web, Orbit Cloud, Vitest.

**Baseline:** `df5cd9c` (main tip at plan start). Graph memory files (`Skyarc_Atlas_Graph_Memory.md`, `atlas-graph.json`, `CURSOR_CONTEXT.md`) were **not present** in repo — reconcile from live code.

## Global Constraints

- One authoritative owner per domain (see matrix).
- Customer responses must not expose internal costs, margins, or mix targets.
- Missing rates → `PRICING_UNAVAILABLE`, never invent zeros as real prices for write paths.
- Credentials unavailable → implement adapters + report blocked live verification.
- Prefer migrations + compatibility over rewrites.

---

## Domain ownership

| Domain | Owner | Notes |
|--------|--------|------|
| Inventory, screens, locations | Atlas | CRUD + photos + specs |
| Availability windows / capacity | Atlas | Authoritative occupancy |
| Soft holds / bookings / reservations | Atlas | Atomic capacity recheck |
| Campaigns / media plans / optimizer | Atlas | Planning + proposal records |
| Rate cards / commercial JSON (current) | Atlas | Foundation until versioned pricing |
| Quotes / Excel / WhatsApp orchestration | Pulse | Calls Atlas for reserve |
| Provider WhatsApp / webhooks | Bridge | Signature verify in prod |
| Device telemetry / MQTT | Orbit Cloud | Evidence only |
| Campaign intelligence snapshots | Pulse | Joins Orbit + Atlas bookings |

---

## Implementation matrix (living)

| Capability | Current evidence | Required outcome | Owner | Dependencies | Status | Validation |
|------------|------------------|------------------|-------|--------------|--------|------------|
| Occupancy peak-concurrent | `slotsConsumedForFlight` peak sweep | Peak concurrent slots in flight | shared/Atlas | — | **done** | availability unit tests |
| Hold atomic recheck | `holdInventoryForCampaign` Serializable + recheck | Skip/fail when no capacity | Atlas | occupancy | **done** | code path + unit occupancy |
| Location upsert authz | POST `/locations` checks `canWriteLocation` | Deny cross-tenant update | Atlas | rbac | **done** | code path |
| Quote inventory authz | `/booking/quote` inventory access + override lock | Scope + no client rate override | Atlas | rbac | **done** | code path |
| Geography gate | City/focus before state | No unintended city via state | Atlas | goal-fit | **done** | goal-fit tests |
| Optimizer duration pricing | `flightCostFromStoredRate` | Pro-rate monthly by days | Atlas | rates | **done** | rates + optimizer tests |
| CI optimizer imports | Import `rates.ts` not prisma module | Unit suite without DATABASE_URL | Atlas | — | **done** | vitest w/ fake URL |
| Tenant isolation | `tenant-context.ts` foundation | Expand on mutating routes | Atlas | auth | **partial** | helper added |
| Booking records | Booking + BookingItem + transitions linked to windows | Explicit Booking/BookingItem | Atlas | Phase 2 | **done (core)** | unit status + reserve API |
| Versioned pricing/quotes | QuoteRevision + RateCard effective dates | Immutable quotes + accept→reserve | Atlas (+Pulse orch) | Phase 3 | **partial** | money unit + accept path |
| Digital availability UX | `DigitalAvailabilityPanel` + `liveInventory.breakdown` | Flight-aware capacity, a11y legend, builder CTA | Web+shared | locations API | **done (branch)** | `slot-occupancy-breakdown.test.ts` |
| Self-serve checkout | `PaymentIntent` + test capture + `BookingCreative` | Sandbox pay → booking/payment/creative tracking | Atlas+Web | migration 0011 | **partial** | `payments.test.ts`; live gateway blocked |
| WhatsApp production | Bridge dry-run; UI hidden | Signed webhooks + delivery jobs | Bridge+Pulse | Meta creds | partial | — |
| MQTT telemetry | OrbitTelemetry/DeviceState | Auth MQTT + contracts | Orbit | Phase Orbit | not started | — |

---

## Phase 1 tasks (execute first)

### Task 1: Peak-concurrent occupancy
- [ ] Add failing tests for nonconcurrent bookings across a flight
- [ ] Replace sum with sweep-line peak in `packages/shared/src/slot-occupancy.ts`
- [ ] Keep digital slot capacity semantics; static remains exclusive

### Task 2: Atomic hold capacity recheck
- [ ] In `holdInventoryForCampaign`, lock inventory rows, recompute occupancy, only create windows with remaining capacity
- [ ] Return skipped inventory IDs / throw on hard book when capacity gone

### Task 3: Location upsert write authorization
- [ ] On upsert update path, load existing location and enforce `canWriteLocation` / ownership
- [ ] Tests for cross-org id spoofing

### Task 4: Quote authz + rate override lockdown
- [ ] Authorize inventory access for requester
- [ ] Ignore client `baseRateAmount` / privileged overrides unless internal role
- [ ] Return `PRICING_UNAVAILABLE` when no rate exists (write-adjacent quote)

### Task 5: Geography gate
- [ ] When cities or geographicFocus present, do not admit via state alone
- [ ] State-only briefs still match state

### Task 6: Optimizer flight pricing
- [ ] Pro-rate monthly/daily rates by campaign duration when scoring allocations
- [ ] Tests with 15-day flight vs monthly card

### Task 7: CI-safe optimizer tests
- [ ] Extract `customerRateForInventory` (or test-only fixtures) away from prisma side-effect module
- [ ] Ensure `pnpm --filter api test` runs without DATABASE_URL for unit suite

### Task 8: Tenant context foundation
- [ ] Document + introduce `requireTenantContext` helper for mutating routes touched in Phase 1–2
- [ ] Add regression tests that cross-tenant reads/writes fail

---

## Later phases (dependency order)

- **Phase 2:** Booking/BookingItem model, timelines, amendments, expiry jobs
- **Phase 3:** Versioned rates, immutable quotes, accept→Atlas reserve, payments adapter
- **Phase 4:** Scenario planning, customer-safe proposals, PPT after booking works
- **Phase 5:** Ops tasks, proof photos, invoices, Tally adapter
- **Phase 6:** WhatsApp delivery jobs, inbound state, confirmation before reserve
- **Phase 7:** Continuity / fill-rate / Orbit-aware risk (after evidence foundation)
- **Orbit MQTT:** Ingestion contracts, retention, campaign association joins

---

## First working increments after Phase 1

1. Inventory calendar + hold/book API with atomic capacity
2. Quote → accept → reserve → track status UI
3. Tenant-scoped booking list
