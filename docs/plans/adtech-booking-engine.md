# AdTech Booking Engine — Atlas Evolution Plan

**Status:** Audit complete · Phase 1 in progress  
**Principle:** Evolve the modular monolith. Do not rewrite Atlas. Legacy media-plan / slot booking stays live.

---

## 1. Audit summary (current state)

### What Atlas already is
- **Planning platform:** Campaign + brief (AI parse) + media-plan optimizer (goal-fit) + site requests
- **Inventory catalog:** Location → Screen → Inventory (faces) + rate cards + geo markets
- **Soft occupancy:** `AvailabilityWindow` (HELD / BOOKED / BLOCKED) + `packages/shared/src/slot-occupancy.ts`
- **Commercial:** Skyarc client rates, vendor rates, showcase scrubbing, org margins
- **Identity / RBAC:** Superadmin, admin, planner, vendor, client

### What booking is today (thin)
| Concept | Current implementation | Gap |
|--------|------------------------|-----|
| Quote | `MediaPlan.totalBudget` + item allocations | No line-item pricing engine |
| Hold | `AvailabilityWindow` HELD via `holdInventoryForCampaign`; campaign linked by **notes substring** | No FK, no advisory lock → **oversell possible** |
| Book | Plan status APPROVED → windows BOOKED | No Order / Payment / Confirmation |
| Capacity | `slotCapacity` + occupancy math | `loopDurationSec` / `slotDurationSec` / `operatingHoursJson` **written but unread** |
| `slotsConsumed` | Schema supports multi-slot | Always written as `1` |
| Rate period | `RateCard.period` stored | Ignored in allocation math |
| Creative | Location assets only | No advertiser creative lifecycle |
| Delivery / PoP | — | Absent |
| Playback CMS | — | Absent |
| Orders / payments | — | Absent |

### Domain map (spec §21 → Atlas)

| Domain | Today | Action |
|--------|-------|--------|
| identity | Strong (`User`, JWT, RBAC) | Reuse |
| organizations | Strong | Reuse |
| marketplace | Locations list/map + discovery | Extend (self-serve builder) |
| screens | `Screen` + specs | Reuse; **start reading** loop/slot/hours |
| inventory | Faces + windows + occupancy | **Extract engine**; fix transactional hold |
| campaigns | Planning campaigns + site requests | Extend with deliveryMode / distributionMode; keep planning path |
| creatives | Location photos only | **New** module |
| pricing | Rate cards + commercial JSON | **New** pricing engine module |
| orders | MediaPlan doubles as order | **New** Order model (parallel) |
| payments | — | **New** (Razorpay adapter later) |
| scheduling | — | **New** (auto-distribution) |
| delivery | — | **New** (requested vs guaranteed vs actual) |
| playback | — | **New** (`PlaybackProvider` + Xtreme adapter later) |
| analytics | Dashboard KPIs (light) | Extend post-PoP |

---

## 2. Architectural decision (locked)

```text
Legacy path (unchanged):
  Brief → Optimize → MediaPlan → Approve → AvailabilityWindow BOOKED

New AdTech path (parallel):
  Campaign (play-based) → DeliveryTarget → InventoryEngine.quote
    → Reservation → Order → Payment → Allocation → Schedule → Playback → PoP
```

- **Single occupancy truth:** keep `AvailabilityWindow` for both models.
- **Default timing:** `AUTOMATIC` (spread across operating hours). No mandatory prime time.
- **Advertiser chooses WHAT + HOW MUCH; Atlas chooses WHEN.**

---

## 3. Phase roadmap

### Phase 1 — Foundation (now)
1. Shared pure functions: loop capacity, plays→slots, automatic window defaults, price breakdown types
2. Nullable schema extensions: campaign delivery fields, `AvailabilityWindow.campaignId`, booking quote tables as needed
3. `POST /booking/quote` — **read-only** feasibility + price breakdown (zero legacy risk)
4. Fix hold path: advisory lock + honest `slotsConsumed` (behind feature flag for new path only first)
5. Feature flag `ADTECH_BOOKING`

### Phase 2 — Self-serve builder UI
Campaign details → screens → dates → plays/day → timing (default Automatic) → creative upload stub → quote → review

### Phase 3 — Reservation + Order
Temp hold → price lock → order states → payment adapter stub → confirm → allocate

### Phase 4 — Scheduling + distribution
Daily play plan generation; publish via `PlaybackProvider` stub

### Phase 5 — Delivery + PoP + make-good
Playback events, shortfall detection, advertiser dashboard

### Phase 6 — Bulk / campaign groups / Temporal workflows
Only after the core loop is reliable. No demand/prime pricing until then.

---

## 4. Phase 1 acceptance criteria

- [x] Shared delivery + pricing primitives (`packages/shared/src/delivery.ts`, `pricing-engine.ts`)
- [x] Quote API returns available plays/day vs requested (`POST /api/v1/booking/quote`)
- [x] Suggestions when under-capacity
- [x] Price breakdown object with GST line
- [x] Timing default = `AUTOMATIC`
- [x] Unit tests for capacity + pricing
- [ ] Schema: `AvailabilityWindow.campaignId` + campaign delivery fields
- [ ] Transactional hold with advisory lock (new path only)
- [ ] Legacy `/campaigns` media-plan flow regression check

---

## 5. Non-goals (until core loop works)

- Programmatic bidding
- Demand-based / prime-time pricing
- Kafka / microservices
- Tight Xtreme coupling (adapter interface only)
- Replacing media-plan optimizer
