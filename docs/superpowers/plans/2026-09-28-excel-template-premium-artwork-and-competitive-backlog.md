# Excel template + PDF premium/artwork + competitive backlog

**Date:** 2026-09-28  
**Status:** Ready for implementation turn (A–C now; D locked for later)  
**Related:** `docs/superpowers/specs/2026-09-27-media-plan-pdf-canva-redesign.md`

## Positioning loop (end-to-end)

**Import → Enrich → Pitch**

1. Vendor/advertiser drops a known sheet **or** the Skyarc minimal template
2. Atlas stores sites, rates, creative specs, and premium flags
3. Media plan PDF uses **real** premium marks + **stored** artwork guidance

Unsupported Excel is not a dead end: clear message + download template + fill + re-upload.

---

## This run (implement next)



### A. Excel — formats, Skyarc template, unsupported UX


| Piece                   | Approach                                                                                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Format detection        | Classify: `skyarc_template` · `vendor_legacy` (current heuristics) · `unsupported`                                                                                               |
| Skyarc minimal template | One `.xlsx`: Site Name, Vendor Media Code, Media Type, Area, Location, Lat, Lng, W×H / SQFT, Lighting, Card Rate, Discounted Rate, City/District/State (optional), Premium (Y/N) |
| Download                | Modal always shows “Download Skyarc template”; on unsupported, that link is the primary CTA                                                                                      |
| Unsupported message     | Plain: *This sheet doesn’t match a supported layout. Download our template, fill your inventory, and upload again.* Brief expected-column list                                   |
| Supported path          | Keep Webpulse/Veda-style heuristics; accept Skyarc template as first-class                                                                                                       |


**To-do**

1. Define Skyarc template columns + sample row; generate workbook (shared helper or static asset under `apps/web/public/` / API download).
2. Add format detector in `excel-importer` (`skyarc` / `vendor_legacy` / `unsupported`).
3. Parse Skyarc template (incl. optional Premium column).
4. On unsupported: structured error + template download URL (no silent empty import).
5. Update `InventoryImportModal`: always “Download template”; on fail show message + download CTA.
6. Tests: Skyarc template parse; unsupported sheet → error + no items; legacy sheet still works.



### B. Premium site flag (PDF stamp)


| Piece         | Approach                                                                                |
| ------------- | --------------------------------------------------------------------------------------- |
| Premium badge | Show **only** if site is marked premium — **not** Index ≥ 85                            |
| Index bands   | Still drive Must Buy / Strong Buy / Recommended / Consider **text** only                |
| Marking       | Toggle on location edit / inventory wizard; optional Excel Premium column               |
| Persistence   | Prefer `Location.isPremium` boolean (or `commercialJson.premium` if we defer migration) |


**To-do**

1. Persist premium mark on location.
2. UI toggle + map from Excel Premium column when present.
3. Wire PDF DTO `isPremium` from location.
4. Change `export-pdf` / badge helpers: stamp only when `isPremium`; keep text bands separate.
5. Update Canva PDF spec + unit tests (Index 90 + not premium → no stamp; premium + low Index → stamp).



### C. Artwork from stored location/form specs


| Piece           | Approach                                                                                                  |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| Source of truth | `Inventory.staticSpecsJson.production` from the form                                                      |
| Fallbacks       | Digital → digital defaults; Static → static print defaults (size + CMYK). No digital copy on static faces |
| PDF             | Prefer stored production string; else class-appropriate default                                           |


**To-do**

1. Helper: `artworkGuidanceFromSpecs(staticSpecsJson, inventoryType)`.
2. Use in media-plan enrich + PDF export.
3. Confirm wizard still writes production into `staticSpecsJson` for static and digital.
4. Tests: digital with resolution/formats; static with W×H; missing → class default.



### Close-out smoke

1. Unsupported Excel → download → fill → import; PDF with one premium + one non-premium; artwork matches form specs.

---



## Locked for a later run (do not drop)

These need **separate implementation turns** — not folded into the Canva PDF redesign or the inventory-import template work.

### E. Media plan export: PDF **or** Excel (different formats) — **confirmed**

**Decision:** Users must choose **PDF** or **Excel** when exporting a media plan. The two artifacts are **not** the same content in different wrappers.

| Format | Job | Shape |
|--------|-----|--------|
| **PDF** | Customer pitch / proposal | Canva-faithful Cover → Summary → per-site pages (photos, PREMIUM, artwork, Index bars) — already shipping / refining |
| **Excel** | Agency / ops handoff & editing | Tabular workbook: site list, codes, rates, dates, mix totals — **no** pixel pitch layout; columns agencies can rework |

**Not this:** dumping PDF fields into a sheet, or embedding pitch pages as images in Excel.

**Later to-do (own turn)**

- [ ] Spec Excel export columns + sheets (summary vs line items)
- [ ] API `…/export/xlsx` (or shared `/export?format=pdf|xlsx`)
- [ ] UI: Export → choose PDF or Excel
- [ ] Customer-safe rules on Excel (no vendor nets / margins), same as PDF
- [ ] Tests + sample workbook

### D. Easy Outdoor competitive planning patterns

**Reference:** [Easy Outdoor](https://easyoutdoor.in/key-features.html), WhatsApp Short positioning (“create outdoor media plans from WhatsApp — customized in seconds”), AI Media Planner.

Their public loop: **live inventory → AI plan under goal/budget/avails → instant share (WhatsApp / PPT / Excel) → same system executes.**

Atlas wedge (keep distinct): **intelligence + client-safe pitch** (Index, map, optimization, Canva PDF, creative specs, premium flags) with Excel as the **on-ramp** when vendors lack Webpulse/Veda-style sheets.


| Easy Outdoor pattern                          | Atlas follow-up (later)                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| WhatsApp-first plan create/share              | Optional WhatsApp (or deep-link) share of plan summary + PDF after generate                       |
| AI Media Planner from brief + budget + avails | Extend existing optimizer UX: “generate from brief in seconds” + clearer availability constraints |
| Instant PPT/Excel multi-city pack             | Covered partly by **§E** (Excel export); PPT still later if needed                                |
| Real-time avails as planning gate             | Surface availability windows more loudly in plan generation / pitch                               |
| Ops pipeline (mount → monitor → invoice)      | Out of scope for Atlas core; stay pitch + inventory intelligence                                  |


**Later to-do (when we open this track)**

- [ ] Short competitive one-pager: Easy Outdoor vs Atlas planning (positioning, not a feature dump)
- [ ] Decide which WhatsApp / AI-planner UX patterns to copy without adopting their vendor-ERP scope
- [ ] Spike: share media-plan PDF / summary via WhatsApp or mobile share sheet
- [ ] Spike: “plan in seconds” brief → optimizer with explicit avail + budget constraints

**Also separate / later:** more vendor Excel **import** formats, admin artwork CMS, Puppeteer, PPT companion, deploy/push of unrelated work.

---

## Spec amendments (apply when implementing B/C)

Update `docs/superpowers/specs/2026-09-27-media-plan-pdf-canva-redesign.md`:

- PREMIUM sticker: **premium-marked sites only** (not Index ≥ 85).
- Artwork guidance: **from stored** `staticSpecsJson` **/ form production**; static vs digital defaults as fallback — not type-heuristic-only.

