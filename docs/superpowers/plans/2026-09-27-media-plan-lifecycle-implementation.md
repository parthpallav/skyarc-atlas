# Media plan story + campaign Ready gate — Implementation Plan

> **For agentic workers:** Implement task-by-task. Checkboxes track progress.

**Goal:** Ship customer-safe plan pitch (Index/why/demand), Settings-hosted Index defaults, Skyarc-only Campaign Ready gate, clearer campaign-centric plans, and minimal field live proof—without breaking existing request/respond/approve/book.

**Architecture:** Additive Prisma fields + RBAC gates; enrich existing media-plan serialize/PDF paths; merge admin scoring UI into settings; evolve plan detail and list IA.

**Tech Stack:** Prisma, Fastify API, Next.js web, existing soft-hold/book helpers.

## Global Constraints

- PDF always customer-safe (no vendor rates/margins/ops).
- Grandfather pre-gate DRAFT site requests for vendors.
- No auction UI for competing brand requests.
- Additive schema only.

---

## Task 1: Index weights → Settings

- Merge scoring page UI into `/admin/settings`.
- Remove nav “Index weights”; redirect `/admin/scoring` → `/admin/settings#skyarc-index`.

## Task 2: Campaign Ready gate

- Add `Campaign.readyForSiteRequestsAt DateTime?`.
- PATCH ready endpoint for planner/admin only.
- Block CLIENT from creating/sending site requests until set; planners can mark ready then send.
- Grandfather: existing DRAFT requests with items remain vendor-visible.

## Task 3: Plan API + PDF

- Enrich plan items with demand + ensure insights/why on serialize.
- PDF: Index, why, demand line; strip admin fields in export builder.

## Task 4: Plan detail UI redesign

- Restructure page: header → plan story → site list with Index/demand/why → expand → add/swap.

## Task 5: Campaign-centric list IA

- Group/filter media-plans list; highlight primary APPROVED; nest drafts under campaign labels.

## Task 6: Field live proof

- Asset kind or metadata for campaign live proof; upload + show on location when booked.
