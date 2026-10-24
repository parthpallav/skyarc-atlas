# Atlas lean launch and future development contract

Version 1.1 | 24 October 2026 | Target: December 2026

## 1. Decision and current implementation status

Improve the existing Atlas in release branches. Preserve main-branch capabilities while simplifying the Customer and Media Planner experiences. Lean means fewer competing flows, duplicated rules and unnecessary runtime dependencies. It does not mean discarding useful working features.

Baseline: main commit `3d76f65448c2541fa214958ef17f9a659e1e4484`. Initial findings and verification limits are in `docs/LEAN_LAUNCH_AUDIT.md`.

This change provides a plan, feature-group design registry, reusable review prompt, PR template, development instructions and executable review-contract checks. The registry is not connected to runtime flag evaluation. No navigation, API authorization, database schema, production configuration or remote branch protection has changed. GitHub automation only becomes active after these files are pushed to a supported branch. A maintainer must configure required checks and approval rules separately.

## 2. December outcome

A real customer or planner can create a brief, discover suitable available inventory, compare sites, prepare and revise a full-budget campaign, review a customer-safe proposal and move through the supported approval lifecycle. Existing inventory, vendor, field and admin capabilities remain preserved.

Customer-facing booking/payment modules may stay gated. Classic campaign holds and vendor site requests remain part of the preserved workflow. Do not add a separate Bookings stage to the classic journey without an explicit product decision replacing D-08 in the existing journey gap document.

## 3. Experience boundaries

| Journey | Customer | Media Planner |
| --- | --- | --- |
| Entry | My campaigns and a clear brief CTA | Work queue with campaigns needing action |
| Discovery | Map/list, dates, format, customer prices, useful specifications | Discovery plus internal commercial context and availability tools |
| Planning | Guided brief, compare and review, permitted edits | Manual and assisted plans, alternatives, swaps and revisions |
| Commercial | Customer-facing totals, taxes and issued proposals | Costs, negotiated prices, margins and approvals where authorized |
| Campaign progress | Clear status, required actions and own evidence | Current plan, vendor decisions, holds, readiness and delivery tasks |
| Administration | No vendor costs, internal scores, admin navigation or unrelated campaigns | Operational controls according to role; no automatic admin privilege |

UX rules: one primary CTA per stage; common names across list/map/detail/export; preserve campaign dates and filters across navigation; progressive disclosure for advanced inputs; explicit loading/empty/error/unavailable states; mobile and keyboard support. Do not expose disabled features as broken links or empty tabs. Avoid permanent new dashboards for information that fits an existing campaign page.

Keep persona profiles separate from database roles. CLIENT_VIEWER currently has some campaign write permissions in the repository; do not infer permissions from the role name or change those permissions incidentally during UX cleanup.

## 4. Consolidated feature groups

`config/feature-groups.json` owns stable IDs, owners, supported audiences, dependencies, off behaviour and proposed launch profiles. Proposed top-level keys are `atlas.<group>.enabled`. Avoid separate unrelated booleans for every button.

| Group | Feature set | December treatment |
| --- | --- | --- |
| catalog | Locations, maps, screens, inventory, search, media assets | Core |
| planning | Manual plans, alternatives, comparison, availability-backed selection | Core |
| campaigns | Brief, flight, budget, revisions, classic holds, vendor decisions, lifecycle | Core |
| proposals | Customer-safe proposal and spreadsheet/PDF exports | Core |
| intelligence | AI assistance, ranking explanations, recommendation generation | Planner optional; manual fallback mandatory |
| traffic | Provider traffic conditions and historical enrichment | Pilot after coverage and usage rights validation |
| booking | Optional AdTech quotes and booking entry points | Preserve and gate independently of classic workflow |
| payments | Payment initiation and related customer UX | Defer live activation until validated |
| delivery | Campaign proof collection and reporting | Preserve existing workflow; consolidate before expanding |
| orbit | Device enrollment, fleet status and edge measurement integration | Preserve; hardware does not block planner launch |
| messaging | WhatsApp and external notification delivery | Enable when provider setup and workflow are validated |

Authentication, authorization, tenant boundaries, price redaction, commercial locks, capacity checks and audit integrity are mandatory controls. They cannot be disabled through feature groups.

An audience list indicates a possible surface, not permission to read all group data. Vendor/field/admin experiences retain their own preserved capability matrix and are not removed because the launch profiles focus on customers/planners.

## 5. Runtime flag design to implement

Use one server-owned resolver with a replaceable configuration provider. Avoid a new control-plane service for the first release. Keep the registry versioned in Git and store audited runtime overrides through the existing administrative boundary when implemented. A hosted flag provider can be adopted later without changing capability consumers.

Effective action access requires all of: authenticated identity, role permission, tenant/object ownership, release/environment enablement, satisfied group dependencies, permitted tenant rollout and action-specific readiness. Provider readiness may block a provider-backed action; it must not disable manual planning or necessary reconciliation.

Resolution and failure rules:

1. Start from a versioned release profile. Environment disables and emergency kills always win. Tenant overrides may narrow access or enable an explicitly allowlisted pilot, never override an environment kill. Persona projection only narrows capabilities.
2. Evaluate dependencies as a graph, not scattered component conditions. Reject unknown keys, cycles and invalid types. Reject disabling a dependency with enabled dependants unless the operator accepts and previews the cascade.
3. During migration, translate existing flags such as ADTECH_BOOKING and NEXT_PUBLIC_ADTECH_BOOKING through a compatibility adapter. Check JOURNEY_GAPS and other existing gates before replacing them. Keep parity evidence and remove legacy flags only after all consumers migrate.
4. Server responses provide an effective capability snapshot with configuration version. Web/mobile use this snapshot for menus, pages and actions. APIs re-evaluate authorization on every request. Do not trust client flags, query parameters, local storage or a forged persona.
5. Avoid build-time NEXT_PUBLIC flags for operational runtime switching. Never place secrets in the snapshot. Partition caches by tenant, persona and config version; invalidate on configuration changes and session/tenant changes.
6. Preserve existing core behaviour through a validated last-known-good configuration. On a new installation with no valid config, use a safe core profile and keep optional integrations off. Unknown optional groups are disabled. A config outage must not grant access or unexpectedly stop classic planning.
7. A hide mode affects discovery and entry points. An operation kill stops new optional operations. Neither deletes history nor skips existing obligation cleanup. Define direct URL, read-only history, API response, export and background-worker behaviour per action.
8. Every flag change records actor, reason, old/new values, config version and time. Only authorized admins can change it. Show dependencies, affected experiences and rollout impact before applying a change. Never auto-enable payments or external sends solely because credentials appear.
9. For each new flag record owner, purpose, dependencies, fallback, on/off contract, rollout, verification evidence, review date and retirement condition. Stable product entitlements may remain; temporary rollout switches need a removal plan.

Implement and test the resolver separately before wiring screens. Then migrate a complete small group across API, web, exports and jobs. Do not claim flag functionality from a JSON registry alone.

## 6. Integration properties and ownership

| Boundary | Authoritative owner | Required contract properties |
| --- | --- | --- |
| Inventory, rates, holds, booking, quote revision | Atlas | Stable IDs, dates/timezone, currency/units, version, ownership, transactional integrity |
| Device identity, MQTT telemetry and state | Orbit | Device/event IDs, observation/ingestion time, sequence, model/calibration version, idempotency, offline replay |
| Proposal generation and intelligence snapshots | Pulse with existing Atlas adapters | Immutable commercial snapshot, customer-safe fields, template version, export status |
| WhatsApp and webhooks | Bridge | Provider ID, idempotency, signed callbacks, delivery status, retries and terminal failure |
| Playback | Existing CMS through a confirmed adapter | Supported scheduling contract, creative identity, reported plays, clock and operating-window assumptions |
| Traffic APIs | Server-side traffic adapter | Road approach/direction, source, speed/travel time, timestamp, quality, usage/retention restrictions |

Every adapter documents authentication, timeout, retry/backoff, rate budget, failure state, observability, data retention and kill behaviour. Do not create duplicate booking ledgers. Keep optional services out of the core planner startup path where practical.

Google/TomTom traffic conditions are not vehicle counts or audience reach. Match billboard faces to relevant approaches. Separate live observations from historical planning assumptions. Orbit MQTT is for real devices; HTTP traffic feeds enter through provider workers and a common typed observation contract. Future hardware providers remain interchangeable.

## 7. Thorough audit and preservation process

Inventory all routes, pages, schemas, jobs, flags and integrations. For each feature record its group, personas, actual current behaviour, evidence, defect/gap IDs, new location and treatment: preserve, refactor, repair, gate or remove proven dead code. Source files and a passing helper test alone do not prove a working journey.

Continue the existing gap register in `docs/audit/ATLAS_JOURNEY_GAP_DOC.md`; preserve locked product decisions and stable IDs. The October 1 Program B review gate remains relevant acceptance evidence, not a replacement for this merge process. Historical readiness reports should retain their dates and be marked superseded where needed.

Priority defects include the reproduced per-brand play-capacity discrepancy, hardcoded confidence, telemetry deduplication, build reproducibility and release CI coverage. Recheck whether an issue is reachable under the active profile before assigning launch severity. Existing features are preserved, but existing bugs are not a behavioural contract.

## 8. Branch and deployment policy

- Active release: `release/atlas-lean-dec-2026`. Work through short `feat/*`, `fix/*` or `refactor/*` branches targeting that release. Use main for integration and reconcile main fixes frequently.
- Preserve the baseline commit and release tags. Prefer small changes with explicit parity evidence. Do not maintain independent product forks by customer.
- Isolate release database, storage namespace, secrets, callback destinations and provider sandbox configuration. A branch is not database isolation.
- Rehearse additive migrations, backup, restore and rollback on a restored dataset. A UI flag cannot reverse a destructive migration.
- Deploy immutable artifacts with branch, commit and config version recorded. Promote a verified release; do not rebuild unreviewed source at promotion.
- Protect main and release branches. Require PRs, successful quality and Feature review checks, a human approval, stale-approval dismissal after pushes, resolved conversations and code-owner review for governance controls. Ensure the required check names match actual GitHub runs. The workflow includes merge_group support for repositories using a merge queue.
- CODEOWNERS is not configured by this document. Assign actual maintainers and configure required code-owner review before claiming governance is enforced.

## 9. Review before every merge

1. Author implements a selected gap and updates registry/contracts/docs when affected.
2. Author adds `.github/feature-reviews/<change-name>.json`. The record covers the exact files changed between target base and final head, excluding the records themselves.
3. Automatic checks validate registry consistency, dependency closure, record coverage and documented review cases. Existing CI runs tests, typechecking and production build.
4. A human or review agent uses `PRE_MERGE_REVIEW_PROMPT.md` against the final head. Run affected browser/API/database journeys. Attach findings and evidence to the PR.
5. Fix confirmed problems; rerun relevant checks. Re-review after new code pushes. A human maintainer approves and merges only when critical checks are verified.

The automatic validator does not execute AI, inspect screenshots or prove evidence truthful. Test commands are recorded as text and never executed from a review record. There is no API key or recurring paid review service in this implementation. Automatic AI review can be added later through an approved integration; keep its output separate from mandatory deterministic checks.

Review case statuses: `passed`, `not-applicable` with a specific reason, or `blocked`. A blocked case fails the contract gate. Never mark an unexecuted critical check not-applicable just to merge. Branch protection and required independent approval are necessary to stop bypasses, especially if a PR edits the checker or workflow.

Example record shape:

```json
{
  "schemaVersion": 1,
  "summary": "Consolidate the planner plan review page without changing campaign locks",
  "groups": ["planning", "campaigns"],
  "reviewedPaths": ["apps/web/src/app/example.tsx", "docs/example.md"],
  "checks": {
    "preservation": {"status":"passed","evidence":"List baseline behaviours and regression results."},
    "customer": {"status":"passed","evidence":"Customer browser journey and redaction evidence."},
    "planner": {"status":"passed","evidence":"Planner browser journey and revision evidence."},
    "flagsOnOff": {"status":"passed","evidence":"On, off, dependency and direct-URL cases."},
    "authorization": {"status":"passed","evidence":"Cross-tenant and object-level request results."},
    "integrations": {"status":"not-applicable","evidence":"No adapter or provider-backed action changed."},
    "migrationRollback": {"status":"passed","evidence":"No schema change; old UI can be restored without data loss."},
    "validation": {"status":"passed","evidence":"Exact commands and meaningful assertions inspected."},
    "documentation": {"status":"passed","evidence":"Updated plan and linked feature contract."}
  }
}
```

Local commands:

```bash
node scripts/check-feature-review.mjs
node --test scripts/check-feature-review.test.mjs
node scripts/check-feature-review.mjs --base origin/main --head HEAD
pnpm test
pnpm typecheck
pnpm build
```

Use the actual release target instead of origin/main for release PRs. Diff mode checks committed Git objects; commit the record before running that mode. Registry-only mode does not claim PR coverage.

## 10. Required validation matrix

| Area | Acceptance evidence |
| --- | --- |
| Customer | Own campaigns only; safe prices; guided flow; no internal notes/costs; permitted direct URLs |
| Planner | Full-campaign budget; valid availability; alternatives and revisions; export; campaign locks |
| Other roles | Vendor ownership; read-only roles; field tasks; admin boundary preserved |
| Flags | On/off, dependencies, invalid config, unknown key, stale session, isolation, rollout and kill |
| Commercial | Missing rate state; taxes; static exclusivity; digital concurrent slots; real loop capacity |
| Lifecycle | Concurrent holds; expiry versus approval; cancellation; active revision integrity |
| Providers | Timeout, missing credentials, duplicate/reordered messages, stale or missing data |
| UX | Mobile, keyboard, loading/empty/error states, persistent dates/filters and no dead controls |
| Deployment | Reproducible build, restored-database migration, isolated callbacks, health, rollback |

## 11. December milestones

| Period | Exit gate |
| --- | --- |
| 24-31 October | Full preservation matrix, selected gap backlog and verified baseline journeys |
| 1-8 November | Review Customer/Planner prototypes with Parth; settle launch scope, permissions, pricing, feature profiles and acceptance examples; assign implementation and review ownership |
| 9-22 November, provisional absence | Continue agreed refactors, defect repairs, flag wiring, integration work and automated regression checks on isolated staging; retain review evidence and a decision queue without relying on Parth's replies |
| 23-30 November, provisional return | Parth reviews complete Customer/Planner journeys; resolve queued product decisions and prioritise corrections |
| 1-10 December | Real inventory pilot, acceptance fixes, migration/recovery checks and critical defect closure |
| 14-18 December | Target functional launch after final acceptance; move the date if critical evidence is incomplete |

Parth will be unavailable for two weeks around mid-November. Exact dates are not confirmed; 9-22 November and a 23 November return are scheduling placeholders, not confirmed travel dates. Shift the boundaries when dates are known without compressing acceptance testing.

Before departure, capture decisions in the plan and selected gap records, save the agreed UX examples, and establish who can review implementation PRs. During the absence, engineering continues within the agreed scope. Record unresolved product choices with options and a recommendation; do not make them a dependency for unrelated work. The existing independent review requirement still applies. If no reviewer is available, implementation and testing continue in branches while merge waits for review.

Use isolated staging for demos and validation. Keep launch acceptance after Parth returns. Do not make the schedule depend on purchasing hardware, enabling live payments or changing the existing playback system during the absence. Keep optional traffic enrichment behind its group if provider access or coverage is unresolved.

Schedule is a planning target dependent on audit findings and engineering capacity. Hardware, payment activation and marketplace expansion must not delay a functional planning release.

## 12. Future change documentation

Every new feature documents its user problem, journey position, group, audiences, permissions, data owner, schema/API contract, dependencies, on/off behaviour, existing-record handling, integration failure modes, tests, rollout, rollback and retirement rule. New services, overlapping sources of truth and new feature groups require a recorded reason.

Keep this plan and the registry authoritative for release organisation. Keep the journey gap log authoritative for gap status and locked product decisions. Keep executable code and observed evidence authoritative for implementation claims. When they disagree, record the discrepancy and repair the documentation or implementation explicitly.
