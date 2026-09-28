# Media plan PDF — Canva-faithful redesign (PDFKit only)

**Date:** 2026-09-27  
**Status:** Draft for review  
**Reference:** `Media Plan Proposal_Demo Design (1).pdf` (Aarkay / Canva sample)  
**Constraint:** Pixel-close layout with **PDFKit only** — no Puppeteer, Chromium, or extra VPS render services.

## Goal

Replace today’s simpler media-plan PDF with a **customer pitch report** that matches the sample’s page structure and visual system (purple header, cover, summary cards/table, per-site photo strip + specs + score bars + artwork), while keeping Atlas intelligence (rates, Index factors, photos) wired as real data.

Hard rule (unchanged): **PDF is always customer-safe** — never vendor nets, margins, approval ops, or admin notes.

## Decisions locked

| Topic | Choice |
|--------|--------|
| Fidelity | Exact sample structure + visual system; PDFKit pixel-close (not HTML→PDF) |
| VPS | No new render stack — stay on existing API + PDFKit + bundled fonts/assets |
| Rates storage | Store **all** rates (list + plan/discounted + any internal) |
| Rates in PDF | Customer only: **Actual** (list, struck when higher) + **Discounted** (plan rate), as in sample |
| Artwork guidance | Defaults **per inventory type** (format catalog / settings) |
| Score bars | PDF-only remap of Index factors → sample labels; Overall = Index; badge from bands |
| Photos | Up to **3** location photos; **PREMIUM** only when site is marked premium |
| Effective reach | Plan **average Index** (rounded) in summary headline |
| Stack | Rewrite `export-pdf.ts` (+ DTO builder in media-plans routes) |

## Out of scope

- Puppeteer / Playwright / headless Chrome on VPS or Vercel  
- Editable Canva-style WYSIWYG editor in-app  
- Changing vendor calendars or site-request flow  
- Showing vendor rates or margins in PDF  

## Page structure

Page size target: match sample aspect closely (custom size ~810×1012.5 pt **or** A4 with proportional spacing). Prefer a fixed custom size matching the sample for layout fidelity.

### Page 1 — Cover

- Full-bleed white body; solid purple top bar  
- Centered Skyarc mark (star) + **SKYARC**™ + tagline **FIND YOUR SPOTLIGHT.**  
- Title: **Media Plan Proposal**  
- Campaign display name (advertiser_campaign or plan/campaign name as used in UI)  
- Timestamp: `dd_mm_yyyy | HH:mm` Asia/Kolkata  

### Page 2 — Summary

- Purple header: left **SKYARC ATLAS** + “Media plan proposal”; right campaign name + timestamp  
- **Prepared for** + campaign/advertiser name  
- Headline: `Max Impactful Media plan with {avgIndex}% effective reach` (avg Index purple)  
- Three cards: **INVESTMENT** (sum of discounted/plan rates) · **SITES** (count) · **On AIR** (start–end)  
- Campaign details box: Campaign, City, Budget, Objective, Locations/Corridors, Duration, Generated on  
- **Site mix at a glance** table: `#` · Site (code · product — road) · Format · Investment (discounted)  
- Footer row: **Total Payable Amount** + “Invoice amount will include 18% of GST”  
- **Notes** bullets (customer-safe commercial caveats + campaign guardrails from brief when present)  

### Page 3+ — One site per page

- Same purple header  
- Up to **3** equal photo tiles (cover + next location assets); fewer than 3 → only render available (no empty frames that look broken; layout absorbs width)  
- Tilted **PREMIUM** badge on first photo when site is marked premium (`skyarcCommercialJson.premium`)  
- Product/Skyarc code (purple) + location title  
- Four grey cards: Media Type (+ dual-screen pill when applicable) · Size (upper/lower strips when dual) · Lighting · Investment (Actual struck red + Discounted)  
- Five green factor bars with PDF labels (below) + **Overall Ranking** % and badge text  
- **Artwork guidance** box from inventory-type defaults  

## Data & intelligence

### Rates (store all; PDF customer slice)

| Stored | Source | PDF |
|--------|--------|-----|
| List / card / “Actual” | Location or inventory customer list rate | Struck when > plan rate |
| Plan / “Discounted” | `MediaPlanItem` customer/plan rate (allocated or negotiated) | Bold Investment + table column |
| Vendor / net / margin | Existing internal fields | **Never** in PDF |

Schema/API: ensure list rate and plan rate are both available on plan-item PDF DTO (`listRate`, `planRate`). If list missing, show single plan rate (no strike).

### Index → sample bar labels (PDF-only)

| PDF label | Atlas factor key |
|-----------|------------------|
| Visibility | `VISIBILITY` |
| Reach | `AUDIENCE_FIT` |
| Awareness | `APPROACH_EXPOSURE` |
| Recall | `BRAND_SUITABILITY` |
| Traffic | `LOCATION_QUALITY` |

- Bar value = factor score 0–100 (same as Index factor).  
- **Overall Ranking** = location Skyarc Index overall.  
- Badge bands (customer copy):  
  - ≥ 85 → **Must Buy** (+ check)  
  - ≥ 75 → **Strong Buy**  
  - ≥ 55 → **Recommended**  
  - else → **Consider**  
- PREMIUM sticker: premium-marked sites only (not Index ≥ 85). Index bands still drive Must Buy / Strong Buy text.

### Photos

- Prefer location assets with kinds suitable for pitch (PHOTO / cover first, then others).  
- Cap 3; parallel fetch like today.  
- Missing images: skip tile; do not invent stock art.

### Artwork guidance (from stored location/form specs)

Prefer `Inventory.staticSpecsJson.production` written from the inventory form:

- Digital → resolution, formats, codec, DPI, bitrate from stored production (else digital defaults)
- Static → size + CMYK print defaults (never digital copy on static faces)

Fallback only when production is missing: type-class defaults (static vs digital).

### Summary fields

| UI label | Source |
|----------|--------|
| Prepared for / campaign name | Campaign / advertiser naming already used in export |
| City | Brief geography or campaign city |
| Budget | Campaign/plan budget |
| Objective | Brief objectives |
| Locations / Corridors | Brief geographic focus |
| Duration | Days between start/end (or brief duration) |
| Investment total | Sum of plan/discounted rates |
| Effective reach % | Round(mean of site Index scores with scores; if none, omit % clause or show “—” — prefer hide “% effective reach” fragment if no Index) |

## Implementation shape (no VPS complexity)

1. **DTO builder** in media-plans export route — customer-safe payload only (rates slice, remapped factors, photo URLs, artwork text, avg Index).  
2. **`export-pdf.ts` rewrite** — `drawCover`, `drawSummary`, `drawSitePage`; shared purple header, Noto fonts, Skyarc logo asset if available as PNG/SVG raster.  
3. **Shared helpers** — INR format, date `dd_mm_yyyy | HH:mm`, factor remap table, badge band, artwork-by-type map in `@skyarc/shared` or api lib.  
4. **Schema** — add/persist list vs plan rate on plan item or resolve list from location at export time; prefer resolve-at-export if location already has customer list rate to avoid migration churn, **but still “store all rates”** on commercial records that already exist (location card rate + plan item rate). If plan item lacks an explicit list snapshot, snapshot list rate onto the item at attach/update time so PDF history stays stable.  
5. **Tests** — unit: factor remap, badge bands, PDF buffer excludes vendor/margin keys; optional snapshot of page count = 2 + N sites.

## Visual system

- Primary purple ≈ sample `#7C3AED` / header bar (align to existing `COLORS.purple`)  
- Soft grey cards `#F1F5F9` / `#F8FAFC`  
- Factor bars green track fill  
- Actual price strike: red  
- Fonts: bundled Noto Sans (₹)  
- Optional bottom-right geometric watermark (subtle) if easy in PDFKit; else skip without blocking fidelity of content blocks  

## Success criteria

1. Export produces Cover + Summary + one page per site, visually recognizable as the sample.  
2. Investment / table / site Investment use customer Actual+Discounted rules only.  
3. Bars + Overall Ranking driven by real Index data with locked label map.  
4. Artwork line comes from stored production specs (static/digital fallbacks).  
5. No new VPS process or browser dependency.  
6. PDF remains safe to email to a brand.

## Open for review (non-blocking)

- Exact custom page size vs A4 with scaled margins  
- Whether dual-screen size lines require new screen-dimension fields or parse from existing size string  
- Final copy for Notes / GST line (18% fixed vs org setting)  
