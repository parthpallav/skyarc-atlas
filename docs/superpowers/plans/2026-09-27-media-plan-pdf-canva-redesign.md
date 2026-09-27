# Media Plan Canva PDF Redesign Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Replace media-plan PDF export with a Canva-faithful Cover → Summary → per-site report using PDFKit only.

**Architecture:** Shared helpers for factor remap / badge / artwork-by-type; rewrite `export-pdf.ts`; enrich export route DTO (listRate, planRate, factorBars, photoUrls[3], avgIndex). No Puppeteer.

**Tech Stack:** PDFKit, Noto Sans, existing Fastify export route, Vitest.

## Global Constraints

- Customer-safe PDF only (no vendorRate / margin)
- PDFKit only on VPS
- Page flow: Cover + Summary + 1 page/site
- Actual (list) struck + Discounted (plan) when list > plan
- Factor PDF labels: Visibility/Reach/Awareness/Recall/Traffic
- PREMIUM + Must Buy when Index ≥ 85

---

### Task 1: Helpers + unit tests

**Files:**
- Create `services/api/src/lib/media-planning/pdf-proposal.ts`
- Create `services/api/src/tests/pdf-proposal.test.ts`

- [ ] Implement `PDF_FACTOR_BARS`, `proposalBadgeLabel`, `artworkGuidanceForType`, `formatProposalTimestamp`, `averageIndex`
- [ ] Tests for badge bands, artwork fallback, avg Index
- [ ] Commit

### Task 2: Rewrite `export-pdf.ts`

**Files:**
- Modify `services/api/src/lib/media-planning/export-pdf.ts`
- Copy logo to `services/api/assets/brand/skyarc-logo-dark.png` if needed

- [ ] New DTO fields: listRate, planRate, factorBars, photoBuffers, dualScreen, sizeLines, artworkGuidance
- [ ] Custom page size ~810×1012.5
- [ ] drawCover / drawSummaryHeader / drawSummary / drawSitePage
- [ ] Commit

### Task 3: Wire export route

**Files:**
- Modify `services/api/src/modules/media-plans/routes.ts`
- Possibly `services/api/src/lib/asset-url.ts` for multi-photo URLs

- [ ] Pass listRate (client list) + planRate (budgetAllocated or clientRate)
- [ ] Pass remapped factor bars from insights/componentsJson
- [ ] Fetch up to 3 photo URLs per location
- [ ] Commit

### Task 4: Verify

- [ ] Run unit tests
- [ ] Generate a local PDF smoke buffer if feasible
