# Media plan customer story + Index on pitch surfaces

**Date:** 2026-09-27  
**Status:** Draft for review  
**Approach:** Evolve the existing media plan detail page and PDF (no separate pitch app)

## Goal

Make the media plan detail page and PDF export read as a **customer-shareable pitch**: clear layout, Skyarc Index + why-this-site, and calm demand signals. Ops tools stay available for internal users but must not leak into PDF.

## Out of scope (explicit)

- Media-owner picking among competing brand site-requests and auto-updating the booking calendar / map. Keep today’s request/approve/hold behaviour. Track as a follow-up.
- Redesigning `/admin/scoring` beyond treating it as quiet default Index **weights** (not a “profile”). Site Index remains per-location.

## Decisions locked

| Topic | Choice |
|--------|--------|
| Customer Index + why | **Both** in-app plan view and PDF |
| Demand signals | Soft chip always; mild critical cue only when digital slots are critically low; **customers** see plan-count + high-demand (no admin secrets) |
| PDF content | **Always customer-safe** — never vendor rates, margins, internal notes, approval ops, or admin-only fields |
| Index weights UI | Keep as admin defaults; do not frame as a scoring “profile” |

## In-app media plan detail

### Audience

- **Customer (client role):** pitch story — Index, why, demand, budget/mix, rates only when already visible for them.
- **Internal (admin / sales / vendor):** same pitch story **plus** add/swap, approvals, margins when their role already allows them.

### Page structure (top → bottom)

1. **Header** — plan name, campaign window, status, PDF export (always customer-safe).
2. **Plan story** — allocated budget / mix viz + plan-level Index averages + short strength lines (reuse / refine `PlanSummaryCards` + `PlanMixViz`).
3. **Sites (primary)** — vertical list, one site per row/block:
   - Cover, Skyarc code, name/road
   - Skyarc Index score (overall)
   - Demand chip(s): e.g. `In N plans`, `High demand`, `K of M slots open` when digital
   - One-line **why this site** (`explanationText` / highlights)
   - Client rate when pricing is visible for the viewer
4. **Site expand** — factor bars (`SiteMetricsBars`), scenario/trust notes when present, soft demand detail (viewers / plan count / slot remaining). No vendor margin in the expanded customer view.
5. **Add / swap** (internal, collapsible) — suggestions show the same Index + demand chips; keep existing attach/swap mutations.

### Demand rules (balanced)

- Always-on **soft** chips (neutral/slate or muted violet; not red).
- **Mild** critical cue only when remaining digital slots are critically low (e.g. ≤1 open or ≤15% remaining — pick one threshold in implementation and document in code). Amber border/text only; never block add/approve from this cue alone.
- Data sources: existing site-interest / multi-plan membership and live digital slot capacity already used on location detail where available; extend plan item payload so the plan page does not N+1 fetch blindly.

### Admin Index weights

Leave `/admin/scoring` as configuration of default weights + methodology copy. Copy should not imply a global “score profile”; site scoring stays on the location Index tab.

## PDF export (customer-only contract)

Hard rule: **anything in the PDF may be emailed to a brand.** If a field is admin-only, it must not appear in the export path.

### Include

- Campaign / plan / dates / advertiser (customer-facing labels)
- Budget and site list with client-facing rates when the export is for a priced/approved plan (same visibility rules as today for client rates)
- Per site (one site per page, existing layout): photo, code, size/type, **Skyarc Index**, short **why this site**, optional one-line demand note when high demand or low slots
- Assumptions / methodology line if already customer-facing

### Exclude always

- Vendor net rates, implied margin %, Skyarc revenue internals
- Approval workflow state, responder ops
- Internal organization IDs, alternative-swap admin lists
- Raw admin scoring editor notes that are not customer-trust copy

Implementation: filter in `export-pdf.ts` input builder (API route), not only in the UI — so no role can accidentally PDF admin fields.

## Data / API

- Enrich media-plan detail items with: `insights` (existing), `skyarcIndex` summary, `whyThisSite`, `demand: { planCount, highDemand, slotsOpen?, slotCapacity?, viewersNow? }` suitable for customer copy.
- PDF builder consumes the same customer-safe DTO shape so in-app and PDF cannot diverge on secrets.
- Prefer extending existing media-plan / insights modules over new services.

## Testing

- Unit/PDF: exported buffer / structure never contains margin or vendor-rate fields when present on internal plan payloads.
- UI: client role sees Index + why + demand; does not see margin chips.
- Demand: chip renders with plan count; critical style only under the chosen low-slot threshold.

## Success criteria

1. Media plan page reads as one coherent pitch composition, not a dashboard of random cards.
2. Customer in-app and PDF both show Index + why-this-site.
3. Demand is visible to customers without shouting.
4. PDF is safe to share with no admin scrubbing step.
5. Competing site-request owner selection + calendar sync remains unchanged for now.
