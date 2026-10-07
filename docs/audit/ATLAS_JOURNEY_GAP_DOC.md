# Atlas Journey Gap Doc

Living audit log. **Fill gaps here first.** No code, merges, or new features until a gap is explicitly picked for implementation.

**Prod baseline:** classic UX — `NEXT_PUBLIC_ADTECH_BOOKING=false`, Bookings / Digital Availability chrome hidden.  
**Journey canvas:** `atlas-role-journey-maps` (Cursor canvas).  
**Last updated:** 2026-10-07  
**Implementation branch:** `feat/journey-gaps` (off prod `main` @ `677956b`)

---

## How to use

| Status | Meaning |
|--------|---------|
| `OPEN` | Confirmed gap — needs a fix or product decision |
| `ACCEPTED` | Intentional for now — not a backlog item |
| `DEFERRED` | Redesign later — do not build now |
| `NEEDED` | Missing capability for trading / sell path |
| `DONE` | Closed after a future fix (date + note) |

**Audit order:** Vendor inventory → Locations → Campaigns + Media Planning (+ Bookings context) → **Mounting + Campaign Proofs** → Map → Requests (deep dive if needed) → Admin onboard → Org / Account → Gated (AdTech / Orbit) confirm.

When an audit finishes, append gaps below (keep IDs stable: `V-##`, `L-##`, …).

---

## Product decisions (locked)

| ID | Decision | Status |
|----|----------|--------|
| D-01 | Digital **rate per face** is fine for now (not per ad place) | `ACCEPTED` |
| D-02 | Per-slot / **prime-time** digital pricing — redesign later | `DEFERRED` |
| D-03 | Vendors **may edit margin %** on own inventory | `ACCEPTED` |
| D-04 | Amounts on **ACTIVE** campaigns stay fixed if rates change later | `NEEDED` (gap T-01) |
| D-05 | **Quotation / PO / Work Order** required for inventory trading | `NEEDED` (gap T-02) |
| D-06 | Allow **custom inventory type** when not in preset list | `ACCEPTED` (edit paths DONE via L-06; create wizard Conceptual remains) |
| D-07 | Clarity over portal clutter — no extra widgets without a journey job | `ACCEPTED` |
| D-08 | Classic journey has **no Bookings stage** — AdTech booking pipeline is gated; do not fill Mounting/Proofs with Bookings UI | `ACCEPTED` |

---

## Gap register (fill / close here)

| ID | Journey | Gap (action) | Roles | Status |
|----|---------|--------------|-------|--------|
| V-01 | Vendor | Admin vendor onboard: one synthetic login; no clear multi-user / VENDOR_OPS invite | Admin | `OPEN` |
| V-02 | Vendor | VENDOR_OPS cannot approve/reject requests | VENDOR_OPS | `OPEN` |
| V-03 | Vendor | Requests: approve/reject only — no counter-offer | Vendor | `OPEN` |
| V-04 | Vendor | Digital rate per face (not per ad place) | Vendor, Planner | `ACCEPTED` → D-01 |
| V-05 | Vendor | Three overlapping rate UIs (org / site card / face) — unclear which wins for plans | Vendor, Planner | `OPEN` |
| V-06 | Vendor | Vendor margin % editable | Vendor | `ACCEPTED` → D-03 |
| V-07 | Vendor | Create site: only one front photo required; multi-angle / digital media afterthought | Vendor | `OPEN` |
| V-08 | Vendor | Extra faces lack full static/digital wizard parity (loop, production specs) | Vendor | `OPEN` |
| V-09 | Vendor | Classic prod: no slot-level block UI for digital truth | Vendor | `DEFERRED` (with D-02) |
| V-10 | Vendor | Sites can save with no rate → planner pricing unavailable | Vendor, Planner | `OPEN` |
| V-11 | Vendor | Planner costing weak without Skyarc client/base rate | Planner | `OPEN` |
| V-12 | Vendor | “Show vendor details” can hide Pricing on owned vendor sites | Vendor, Admin | `DONE` 2026-10-07 — owned vendors keep Pricing; showcase only hides for internal |
| L-01 | Locations | Client: list can show rate; detail often “—” | Client | `DONE` 2026-10-07 — Overview reads client rate even without Rates tab |
| L-02 | Locations | Map popups ≠ list card (no format / size / rate) | All browse | `DONE` 2026-10-07 — popup shows format · size · rate |
| L-03 | Locations | Map “View details” drops flight `from`/`to` | All browse | `DONE` 2026-10-07 — detail href built with flight options |
| L-04 | Locations | Default “Open” filter hides held/booked unless widened | Planner, Admin | `DONE` 2026-10-07 — Locations + Map default to All |
| L-05 | Locations | Transit/venue formats buried under “Conceptual” | All browse | `DONE` 2026-10-07 — filter label “Transit & other” |
| L-06 | Locations | No free-text **custom inventory type** outside preset list | Vendor, Planner, Admin | `DONE` 2026-10-07 — CUSTOM on Site + Faces edit (create wizard still Conceptual class) |
| L-07 | Locations | ~250 site fetch cap — large markets may look incomplete | Planner, Admin | `OPEN` |
| L-08 | Locations | FIELD_OPERATOR sees Add but edit only own-created (confusing) | FO | `DONE` 2026-10-07 — Survey site CTA + own-created edit copy |
| L-09 | Locations | Client “Fit” copy not tied to selected dates | Client | `DONE` 2026-10-07 — Fit includes selected flight label |
| L-10 | Locations | Planner cards: no vendor cost when client rate empty | Planner, Admin | `DONE` 2026-10-07 — vendor rate fallback labeled on list + detail |
| L-11 | Locations | Availability chips (Partial/Held/Booked) loud without slot meters | Planner, Client | `DONE` 2026-10-07 — classic quieter badges + free/capacity hint |
| L-12 | Locations | VIEWER / VENDOR_OPS same screens as full roles, actions missing | VIEWER, VENDOR_OPS | `OPEN` |
| T-01 | Trading | ACTIVE campaign amounts must lock when rates change later — **confirmed**: plan/swap re-reads live rates; no ACTIVE commercial lock | Planner, Vendor, Admin | `OPEN` → D-04 |
| T-02 | Trading | No Quotation / PO / Work Order for inventory trading — **confirmed** absent in classic prod | Planner, Client, Vendor, Admin | `OPEN` → D-05 |
| C-01 | Campaigns | Vendor cannot approve sites on planner **current plan** in classic UI (Requests = DRAFT-only; booking respond AdTech-gated) | Planner, Vendor, Admin | `OPEN` |
| C-02 | Campaigns | Copy implies campaign becomes Active when all sites approved; real launch is **Mark live** only | Planner, Client | `DONE` 2026-10-07 — Mark live / current-plan copy clarified |
| C-03 | Campaigns | Client lacks commitment / hold / booking visibility on campaign review | Client | `OPEN` |
| C-04 | Campaigns | Brand site requests need Skyarc “Ready for site requests” — gate not obvious on campaign spine | Client, Planner | `DONE` 2026-10-07 — ready/locked banners on campaign header |
| MP-01 | Media Plans | Plan lines omit per-site vendor approval status (pending / approved / rejected) | Planner | `DONE` 2026-10-07 — list + detail show vendor approval badge |
| MP-02 | Media Plans | No planner line-level discount / negotiated rate on media plan editor | Planner | `OPEN` |
| MP-03 | Media Plans | Plan add/swap on APPROVED packs without lifecycle / commercial lock (feeds T-01) | Planner, Admin | `OPEN` |
| MP-04 | Media Plans | Packs vs site-request drafts split across Campaign / Requests / Media Plans — no single “pending vendor” view for current plans | Planner | `OPEN` |
| B-01 | Bookings | Bookings **stage UI** not in classic product (by design) — holds/ledger may still run under plans; do not add Bookings nav as a journey stage | Planner, Admin | `ACCEPTED` → D-08 |
| B-02 | Bookings | Vendor confirm via AdTech booking path — N/A for classic journey; track under **C-01 / R-01** | Planner, Vendor | `ACCEPTED` → D-08 |
| B-03 | Bookings | Locations show Held/Booked from windows without a Bookings stage — **clarity/copy** gap only (not “build Bookings”) | All | `DONE` 2026-10-07 — chip hints clarify plan-hold vs Bookings stage |
| P-01 | Proofs | No UI to upload live campaign proof (`CAMPAIGN_LIVE_PROOF`) on web or mobile (API exists) | FO, Vendor, Planner, Admin | `OPEN` |
| P-02 | Proofs | Location “Campaign proof” card = plan shortlist history, not live execution proof — misleading vs ACTIVE / Mark live | All browse | `DONE` 2026-10-07 — renamed plan history vs live photos |
| P-03 | Proofs | Live proof gallery lacks campaign / flight attribution in API + UI | All browse | `OPEN` |
| P-04 | Proofs | No campaign-level proofs module (list / review / approve) | Planner, Admin, Client | `OPEN` |
| P-05 | Proofs | Mark live / ACTIVE does not require or track mounting completeness or live proof | Planner, Admin | `OPEN` |
| P-06 | Proofs | Client plan-name redaction inconsistent with live proof photo visibility | Client | `OPEN` |
| P-07 | Proofs | Classic prod: creative / delivery / PoP not available post-launch (AdTech Bookings only) | Planner, Client, Vendor | `OPEN` → D-08 |
| P-08 | Proofs | When proof upload ships: require ACTIVE + site on campaign (policy gap) | FO, Vendor, Admin | `NEEDED` |
| MT-01 | Mounting | Mounting type not on location Overview for planners/clients/vendors (notes mostly admin) | Planner, Client, Vendor | `DONE` 2026-10-07 — Mounting on Overview Site context |
| MT-02 | Mounting | Mobile field survey omits mounting type (web has type + notes) | FO | `DONE` 2026-10-07 — mobile edit + detail include mounting type |
| MT-03 | Mounting | No “installation / mount complete” stage vs survey metadata only | FO, Vendor, Planner | `NEEDED` |
| MT-04 | Mounting | Mounting notes vs face material notes easy to confuse in wizard | Vendor | `DONE` 2026-10-07 — separate site mounting vs face material fields |
| MT-05 | Mounting | FIELD_OPERATOR mounting/proof blocked on vendor-owned sites (edit RBAC) | FO, Vendor | `OPEN` → L-08 |
| R-01 | Requests | Requests list treats APPROVED like done; does not surface pending vendor items on planner’s **current** plan | Planner, Vendor | `OPEN` |
| M-01 | Map | *(fill on Map audit)* | | |
| A-01 | Admin | *(fill on Admin onboard audit)* | | |
| O-01 | Org / Account | *(fill on Org/Account audit)* | | |
| G-01 | Gated | *(confirm AdTech/Orbit stay out of classic prod)* | | |
| CAL-01 | Calendar | No dedicated **Calendar** route/nav for booked sites + availability in one place | Client, Planner | `OPEN` / `NEEDED` |
| CAL-02 | Calendar | No multi-site month/grid (sites × dates) for CLIENT_VIEWER | Client | `OPEN` |
| CAL-03 | Calendar | Browse chips show Open/Held/Booked for selected flight — not who/which campaign booked the site | Client, Planner | `OPEN` |
| CAL-04 | Calendar | “Available for booking” site list only inside campaign new/edit wizard — not a standing client tool | Client, Planner | `OPEN` |
| CAL-05 | Calendar | Classic prod: no Bookings list / Availability tab (AdTech off) — not a substitute for calendar | Client | `ACCEPTED` → D-08 |
| CAL-06 | Calendar | Client campaign review has no calendar of their booked/held sites (aligns C-03) | Client | `OPEN` |
| SW-01 | Plan swap | Client self-serve swap/add UI missing (`canEditMix` false for clients); API only if campaign creator | Client | `OPEN` |
| SW-02 | Plan swap | No plan-status / ACTIVE lifecycle guard on swap/add | Planner, Admin | `OPEN` → MP-03, T-01 |
| SW-03 | Plan swap | Swap on APPROVED/current plan does not reset vendor line approval / re-confirm | Planner, Vendor | `OPEN` → C-01 |
| SW-04 | Plan swap | Swap omits refreshed why/insights pitch copy for replaced line | Planner | `OPEN` |
| SW-05 | Plan swap | Vendor has no substitute path on current plan (planner-only swap) | Vendor | `OPEN` → confirm product |
| SW-06 | Plan swap | Over-budget swap/add allowed with UI warn only — weak commercial audit trail | Planner, Admin | `OPEN` |
| SW-07 | Plan swap | No swap/add API integration tests (holds + pricing regression risk) | Eng | `OPEN` |

---

## Audit notes (detail)

### Vendor inventory — done 2026-10-04

**Matches journey**

- Vendor lands on My Inventory; Bookings hidden in classic prod  
- Add-site wizard: static vs digital + slot capacity  
- Faces edit: multi-face + optional per-face rate  
- Requests approve/reject for own inventory  
- VENDOR_OPS browse-only for inventory edit  

**Role spot-check:** Vendor Partial (rates/onboarding); Admin Partial (invite); Planner blocked when rates missing.

### Locations browse / detail — done 2026-10-04

**Matches journey**

- Shared card: photo, code, name, format/size, status, rate  
- Filters: search, dates, city/corridor/format, sort  
- Gates hide Availability when AdTech off  
- Vendor My sites / Network; client pitch + add-to-campaign  
- Network sites view-only with request messaging  

**Role spot-check**

| Role | Browse job |
|------|------------|
| SA/Admin | Y |
| MEDIA_PLANNER | Partial |
| CLIENT | Partial |
| VENDOR | Partial |
| FIELD_OPERATOR | Partial |

### Campaigns + Media Planning + Bookings (joint) — done 2026-10-04

**Matches journey**

- Campaign create/edit, flight, generate plan; plan detail swap/add with soft holds  
- Set as current plan → soft holds + booking ledger sync; does **not** auto mark live  
- Inventory commitments panel + Mark live with server readiness (not AdTech-gated in UI)  
- Site-request path: Locations → DRAFT → Requests → vendor respond  
- Media Plans index lists PROPOSED/APPROVED packs across campaigns  
- Classic prod correctly hides Bookings nav / builder / reservation chrome  

**Role spot-check**

| Role | Campaign / plan / booking job |
|------|-------------------------------|
| SA/Admin | Partial — mark-live yes; current-plan vendor confirm broken in UI; no PO/WO |
| MEDIA_PLANNER | Partial — strong build/commit; booking ops + vendor confirm weak when Bookings off |
| CLIENT | Partial — plans visible; no commitments; site-request gate; no trading docs |
| VENDOR | Partial — DRAFT requests work; current-plan approve N/A in classic UI |
| FIELD_OPERATOR | N/A — no campaigns access |

**Critical clarity gap:** Capacity commits under plans without a Bookings **stage** (accepted — D-08). Vendor confirm / pending work tracked via C-01, R-01, B-03 (copy), not Bookings UI.

### Mounting + Campaign Proofs — done 2026-10-04

**Product stance:** Bookings stages are **not** part of classic journey. Post-plan execution focus = mounting + campaign proofs (field / ops).

**Matches**

- Data: `mountingType`, `mountingNotes`, `CAMPAIGN_LIVE_PROOF` + optional `campaignId`  
- Web add/edit: mounting type + notes; survey photo editor  
- Mobile: multi-angle survey photos, GPS, mounting notes on edit  
- Location detail: plan-history card + read-only “Live on site” gallery when proofs exist  
- API: live-proof presign requires `campaignId`  

**Role spot-check**

| Role | Mounting / proofs |
|------|-------------------|
| SA/Admin | Partial — edit mounting; no proof ops |
| MEDIA_PLANNER | Partial — can see proofs; no capture/review |
| CLIENT | Partial — redacted history; unclear live photos |
| VENDOR | Partial — mounting on wizard; no live proof workflow |
| FIELD_OPERATOR | Partial — survey photos strong; no live proof upload; edit scope limited |

### Media plan site swap (end users) — done 2026-10-05

**Verdict:** Swap/add works for **planners/admins** on plan detail. **Clients** (brand end users) get pitch-only — no Replace/Add UI. Vendors cannot swap.

**Matches**

- API swap + add with eligibility, soft hold release/re-hold, live rate recalc  
- Alternatives (2–3) on lines; planner UI: swap cards + add catalog  
- Vendors can view approved plans with their sites; mutate blocked  

**Role spot-check**

| Role | Swap job |
|------|----------|
| CLIENT | Partial — view only; UI blocked |
| MEDIA_PLANNER | Y — full swap/add |
| VENDOR | N — no substitute on current plan |
| SA/Admin | Y — same as planner; no lifecycle lock |

### Calendar (client view) — done 2026-10-04

**Verdict:** **Missing** as a product surface. Clients have flight-scoped browse + campaign date picking, not one calendar of booked sites + availability.

**Matches (partial substitutes)**

- Locations / Map: `from`/`to` filter + status for that window  
- Campaign wizard: month date-range picker + “available sites” list for the flight  
- Campaign list/detail: start–end dates  

**Not a calendar:** Bookings (AdTech-only list), Digital Availability tab (gated), roadmap “Feature 2 availability calendar” not shipped.

### Map — pending

### Requests — deep dive pending (R-01 already from joint audit)

### Admin onboard — pending

### Org / Account — pending

### Gated (AdTech / Orbit) — pending

---

## Fill-in template (copy per new audit)

```md
### <Journey> — YYYY-MM-DD

**Matches**
- …

**Gaps added to register**
- X-01 …
- X-02 …

**Role spot-check**
| Role | Result |
|------|--------|
| … | Y / Partial / N |
```
