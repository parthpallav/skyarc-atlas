# Skyarc Atlas — OOH Platform Completion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Deliver dependable inventory → availability → planning → pricing → proposal → approval → reservation → execution → proof → billing workflows on Atlas/Pulse/Bridge/Orbit without duplicate ledgers.

**Architecture:** Atlas owns inventory, availability windows, bookings/reservations, base rates, and immutable quote revisions (ADR-0003). Pulse owns Excel/WhatsApp orchestration and future commercial packaging calling Atlas. Bridge owns provider delivery. Orbit Cloud owns telemetry. No second reservation or quote ledger.

**Tech Stack:** Fastify + Prisma + Postgres/PostGIS (Atlas API), Pulse/Bridge Fastify services, Next.js web, Orbit Cloud, Vitest.

**Baseline:** `df5cd9c` (main tip at plan start).

## Global Constraints

- One authoritative owner per domain (see matrix + ADR-0003).
- Customer responses must not expose internal costs, margins, or mix targets.
- Missing rates → `PRICING_UNAVAILABLE`, never invent zeros as real prices for write paths.
- Credentials unavailable → implement adapters + report blocked live verification.
- Prefer migrations + compatibility over rewrites.
- Unit tests run without DB; integration tests require `INTEGRATION_DATABASE_URL`.

---



## Domain ownership


| Domain                                     | Owner       | Notes                                              |
| ------------------------------------------ | ----------- | -------------------------------------------------- |
| Inventory, screens, locations              | Atlas       | CRUD + photos + specs                              |
| Availability windows / capacity            | Atlas       | Authoritative occupancy                            |
| Soft holds / bookings / reservations       | Atlas       | Atomic capacity recheck + Serializable retry       |
| Campaigns / media plans / optimizer        | Atlas       | Planning + proposal records                        |
| Rate cards / base commercial rates         | Atlas       | Effective-dated; foundation for quotes             |
| QuoteRevision persistence + accept→reserve | Atlas       | ADR-0003 — retain; no Pulse duplicate              |
| Excel / WhatsApp quote orchestration       | Pulse       | Calls Atlas quote + reserve APIs (**pending**)     |
| Provider WhatsApp / webhooks               | Bridge      | Signature verify in prod                           |
| Device telemetry / MQTT                    | Orbit Cloud | Evidence only — separate workstream                |
| Campaign intelligence snapshots            | Pulse       | **Blocked** until Orbit telemetry + campaign joins |


---



## Implementation matrix (living)


| Capability                         | Current evidence                                    | Required outcome                   | Owner        | Dependencies | Status          | Validation                                                  |
| ---------------------------------- | --------------------------------------------------- | ---------------------------------- | ------------ | ------------ | --------------- | ----------------------------------------------------------- |
| Occupancy peak-concurrent          | `slotsConsumedForFlight` peak sweep                 | Peak concurrent slots in flight    | shared/Atlas | —            | **done**        | availability unit tests                                     |
| Hold atomic recheck                | Serializable + `FOR UPDATE` + retry                 | Skip/fail when no capacity         | Atlas        | occupancy    | **done**        | PG integration concurrent hold                              |
| Location upsert authz              | POST `/locations` `canWriteLocation`                | Deny cross-tenant update           | Atlas        | rbac         | **done**        | code path                                                   |
| Quote inventory authz              | `/booking/quote` access + override lock             | Scope + no client rate override    | Atlas        | rbac         | **done**        | code path                                                   |
| Geography gate                     | City/focus before state                             | No unintended city via state       | Atlas        | goal-fit     | **done**        | goal-fit tests                                              |
| Optimizer duration pricing         | `flightCostFromStoredRate`                          | Pro-rate monthly by days           | Atlas        | rates        | **done**        | rates + optimizer tests                                     |
| CI unit suite                      | `vitest.config.ts` excludes `*.integration.test.ts` | Unit suite without DATABASE_URL    | Atlas        | —            | **done**        | `pnpm test:unit` (120 tests)                                |
| Tenant isolation                   | campaign-access + assertSameTenant on plans/quotes/proposals/bookings | Deny cross-tenant                  | Atlas        | auth         | **done (core)** | unit campaign-access + PG cross-tenant assert |
| Booking records                    | Booking + items + outbox + UI                       | List/detail/amend/events           | Atlas        | Phase 2      | **done**        | transitions unit + PG partial/expiry                        |
| Inventory calendar                 | availability-calendar API + UI                      | Freshness + day buckets            | Atlas        | Phase 2      | **done**        | API + location panel                                        |
| Concurrent reservation             | `reservation.integration.test.ts`                   | One winner for last slot           | Atlas        | PG           | **done**        | INTEGRATION_DATABASE_URL                                    |
| Hold expiry / amend / cross-tenant | same integration file                               | Restore capacity; preserve on fail | Atlas        | PG           | **done**        | INTEGRATION_DATABASE_URL                                    |
| QuoteRevision + accept→reserve     | quote-revision + quote-http                         | Immutable issue/accept             | Atlas        | rates        | **done (core)** | money unit + accept path + UI                               |
| Effective-dated / segmented rates  | `rate-segments.ts` + quote.ts                       | Mid-flight rate changes            | Atlas        | RateCard     | **done (core)** | rate-segments unit                                          |
| Customer-safe breakdowns           | `customer-safe-price.ts`                            | No margin/cost leakage             | Atlas        | —            | **done**        | unit                                                        |
| Coverage vs concentration scenarios | `lib/proposals/scenarios.ts` + POST `/campaigns/:id/scenarios` | Two strategies via Atlas pricing; no dual reserve | Atlas        | optimizer    | **done**        | proposals-scenarios unit + UI compare                       |
| Proposal revisions + share links    | `ProposalRevision` / `ProposalShareToken` (`0011`)  | Immutable snapshot + view-only share | Atlas        | quotes       | **done**        | issue/accept/share/revoke/expiry paths                      |
| Customer proposal exports           | PDF/XLSX/PPTX from issued snapshot                  | Consistent prices; no internal commercial data | Atlas        | proposals    | **done**        | PPTX slide inspect + xlsx zip unit                          |
| Execution tasks + readiness         | `ExecutionTask` + seed on confirm (`0012`)          | Static/digital ops; no auto LIVE   | Atlas        | bookings     | **done**        | phase5 unit + readiness API                                 |
| Creative versions + CMS handoff     | `CreativeVersion`                                   | Validate + review; manual CMS only | Atlas        | ops          | **done**        | creative validation unit                                    |
| Proof collection                    | `ProofRecord` + LocationAsset                       | Provenance; customer approved view | Atlas        | assets       | **done**        | proof review paths                                          |
| Invoices + manual payments          | `Invoice` / `InvoicePayment` from QuoteRevision     | Snapshot issue; partial pay; AR    | Atlas        | quotes       | **done**        | invoice arithmetic unit                                     |
| Vendor costs + GP report            | PO / bill / CampaignExpense                         | Staff-only; missing costs flagged  | Atlas        | billing      | **done**        | commercial performance basis                                |
| Tally file export + reminders       | `AccountingExportBatch` / `ReminderJob`             | File ≠ live sync; no false sent    | Atlas        | Bridge opt.  | **done (file)** | tally mapping + reminder serialize unit                     |
| Creative/proof upload authorization | `authorized-assets.ts` — no client r2Key trust | Server-owned UPLOADED assets only  | Atlas        | assets       | **done**        | authorized-assets unit                                      |
| WhatsApp Bridge delivery            | durable jobs, receipts, signature, dry-run       | Accept ≠ delivered; retries        | Bridge       | Meta         | **done (adapters)** | whatsapp-policy unit; live pending                          |
| WhatsApp account linking            | Atlas WhatsAppAccountLink + challenges          | Phone alone ≠ access               | Atlas        | Pulse        | **done**        | whatsapp-link unit                                          |
| WhatsApp conversation + confirm     | Pulse conversation + Atlas confirmations        | Confirm before mutate              | Pulse+Atlas  | Bridge       | **done (slice)** | conversation unit; live Meta pending                        |
| Payment provider                   | `payment-adapter.ts` + `/payment-intent`            | Live capture when configured       | Atlas        | creds        | **pending**     | UNAVAILABLE without creds (by design)                       |
| Live paid checkout                 | —                                                   | Hold/payment/refund policy live    | Atlas        | payment      | **pending**     | blocked on credentials                                      |
| Pulse quote orchestration          | —                                                   | Excel/WhatsApp via Atlas APIs      | Pulse        | Atlas quotes | **pending**     | —                                                           |
| WhatsApp production                | Bridge dry-run                                      | Signed webhooks + delivery jobs    | Bridge+Pulse | Meta creds   | **pending**     | —                                                           |
| MQTT telemetry                     | OrbitTelemetry/DeviceState                          | Auth MQTT + contracts              | Orbit        | Phase Orbit  | **not started** | —                                                           |
| Campaign intelligence              | —                                                   | After telemetry + associations     | Pulse        | Orbit        | **blocked**     | —                                                           |


---



## Phase 1 tasks



### Task 1–7: ✅ delivered (see matrix)



### Task 8: Tenant context

- [x] `resolveTenantContext` / `assertSameTenant` / `requireTenantUnlessInternal`
- [x] Applied on quote get/accept/issue and booking payment-intent
- [x] Campaign access on media-plans, quotes, proposals, exports, booking associations

---



## Later phases

- **Phase 2:** ✅ Booking ledger, calendar, holds/expiry, vendor partial approval, outbox, bookings UI
- **Phase 3:** ✅ Core quote→accept→reserve (Atlas); ⏳ live payments; ⏳ Pulse orchestration
- **Phase 4:** ✅ Scenarios + proposal revisions + share links + PDF/XLSX/PPTX (`docs/contracts/PROPOSAL_API.md`)
- **Phase 5:** ✅ Ops tasks, creative, proof, invoices, vendor costs, Tally file export, reminders (`docs/contracts/OPS_BILLING_API.md`)
- **Phase 6:** ✅ Adapters + linking + confirm + conversation slice (`docs/contracts/WHATSAPP_API.md`); ⏳ live Meta delivery
- **Phase 7:** Continuity / fill-rate / Orbit-aware risk (after evidence foundation)
- **Orbit MQTT:** Separate workstream — ingestion contracts, retention, campaign association joins

---

## Test commands

```bash
# Pure unit — no database required
pnpm --filter @skyarc/api test:unit

# Postgres integration — isolated DB URL required
INTEGRATION_DATABASE_URL=postgres://... pnpm --filter @skyarc/api test:integration
```

Do **not** set a fake DATABASE_URL for unit tests. Integration never falls back to `DATABASE_URL` silently.