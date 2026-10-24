# Atlas lean launch: baseline audit and release plan

Date: 24 October 2026

Repository: parthpallav/skyarc-atlas

Baseline main commit: `3d76f65448c2541fa214958ef17f9a659e1e4484`

Status: Initial repository audit completed. Full behavioural, database, security, browser and deployment verification remains outstanding. This document does not certify launch readiness.

## Objective

Launch a functional media planning and campaign planning platform in December 2026 by improving the existing application. Preserve main-branch capabilities and stored data. Reduce duplication, coupling and unnecessary runtime dependencies rather than deleting useful features.

## Verification performed

- Installed the existing lockfile without executing install lifecycle scripts.
- Generated the Atlas Prisma client locally. No database was connected or migrated.
- Ran all configured workspace tests: 159 tests passed across 38 test files.
- Ran workspace typechecking: passed.
- Ran the workspace production build: 9 of 10 tasks succeeded. The web build failed because this environment could not resolve fonts.googleapis.com while fetching Inter through next/font. This is an external build dependency failure, not evidence of production failure.
- Reproduced the delivery-capacity discrepancy described below by calling the built shared function directly.
- Inspected repository structure, commercial/planning paths, selected tests, deployment configuration and Orbit ingestion.
- No application source, schema, lockfile or production deployment was changed.

The test results establish the existing configured baseline only. They do not establish database concurrency, tenant isolation through every HTTP endpoint, physical playback, real provider integration or full browser journeys.

## Findings and required follow-up

### P0: Brand-slot capacity calculation overstates plays

Evidence: packages/shared/src/delivery.ts, dailyPlayCapacity; services/api/src/lib/booking/quote.ts calls it with remaining brand slots.

Reproduction: loopDurationSec=120, slotDurationSec=10, creativeDurationSec=10, freeSlots=1, operating window=17 hours. Function returns 6,120 plays/day. One allocated 10-second brand slot appearing once per loop yields 510 plays/day.

The implementation multiplies each brand slot by floor(loop duration / creative duration), effectively treating each available brand slot as the whole loop. slotDurationSec is not used to limit the allocated slot airtime. Existing tests accept this model and therefore pass.

Required: define the scheduling contract explicitly, distinguish whole-face airtime from per-brand slot capacity, reconcile quotes with actual CMS scheduling, and add tests using Skyarc's real 120-second loop configuration. Do not sell guaranteed play quantities until verified against supported playback behaviour.

### P1: Intelligence confidence is partly hardcoded

Evidence: services/api/src/lib/media-planning/insights.ts assigns data_confidence=65 and component confidence=0.65 for heuristic results. Factors use site size, lighting and road-name rules.

Required: distinguish survey heuristics, provider observations, manual counts and edge observations. Preserve existing scoring features while labelling their provenance and replacing fixed confidence with a documented quality assessment. Do not describe these heuristic scores as measured audience or calibrated probabilities.

### P1: MQTT telemetry replay is not idempotent

Evidence: services/orbit-cloud/src/ingest.ts unconditionally inserts telemetry using createMany. OrbitTelemetry has a generated primary key but no producer event identifier or deduplication constraint. mqtt/bridge.ts subscribes at QoS 1.

Required: producer event IDs, per-device uniqueness, transactional ingestion, application persistence acknowledgements, stale observation handling and replay tests. Test duplicate messages and failures between broker acknowledgement and database persistence.

### P1: MQTT deployment configuration is incomplete in the main Compose file

Evidence: Orbit environment schema supports ORBIT_MQTT_* settings; docker-compose.yml does not pass these settings into orbit-cloud. The default is disabled. The MQTT client uses protocolVersion=4 and clean=true.

Required: explicitly configure the release deployment, broker TLS and per-device ACLs. Decide whether MQTT 3.1.1 or 5 is required, and validate reconnect/session behaviour. Do not claim that merely enabling a UI flag starts MQTT in the published Compose topology.

### P1: Release branch lacks matching CI triggers

Evidence: .github/workflows/ci.yml runs on pushes to main and pull requests targeting main. It does not cover pushes to release/* or pull requests targeting a release branch. CI runs build, typecheck and tests, but no lint step. The API lint script prints that no lint is configured.

Required: CI for the release branch, real lint configuration, feature-parity checks, database-backed integration tests and release-specific build evidence.

### P1: Browser and database regression evidence is insufficient

Evidence: inspected availability, pricing, booking and organization tests principally exercise helpers. Files named payments and availability-release contain narrow signature/date tests. Passing them does not prove the full workflow.

Required: authenticated API tests and browser journeys for each preserved capability; concurrent holds; expiry versus vendor approval races; quote revision immutability; price visibility; vendor ownership; export redaction; migration rehearsal on a restored database.

### P2: Large modules concentrate unrelated responsibilities

Evidence: media-plans/routes.ts has 2,110 lines; locations/routes.ts has 1,443 lines; the web locations page has 1,500 lines.

Required: extract coherent services and components behind existing contracts. File size is a refactoring signal, not proof of dead code. Trace imports, route registrations, workers, dynamic references and real usage before deleting anything.

### P2: Product documentation is stale

Evidence: docs/PRODUCT_PLAN.md is dated 8 September 2026, references uncommitted work on another branch, contains conflicting MVP statements and describes features as planned that now have source files in main.

Required: replace status claims with an implementation and verification matrix tied to this baseline. Do not infer functional completeness from filenames or old checkmarks.

### P2: Web production build depends on external font availability

Required: evaluate locally bundled licensed fonts and verify a reproducible production build. Do not change font loading merely to conceal an unrelated build error.

## Preservation contract for the full audit

Inventory every main-branch route, screen, permission, background task, export, integration and schema dependency. For each, record implemented behaviour, test evidence, current defect, launch visibility and refactoring destination.

Minimum capability groups:

1. Authentication, account management, organizations, vendor access and price visibility.
2. Locations, screens, static/digital inventory, assets, surveys, imports, search and maps.
3. Advertisers, campaign briefs, dates, budgets, campaign lifecycle and plan revisions.
4. Optimisation, alternatives, swaps, manual planning and explainable recommendations.
5. Rate cards, commercial terms, full-campaign totals, taxes and proposal exports.
6. Availability, holds, booking approvals, partial decisions, expiry and cancellation.
7. Existing mobile field workflow and offline sync.
8. Orbit device provisioning, ingestion and event integration.
9. Pulse and Bridge exports and delivery integrations.
10. Feature-gated payment and self-service paths, clearly separated from live providers.

Retain valid features. Correct defects through explicit behaviour changes with regression evidence. Gate unfinished modules without silently deleting them. Keep manual planning functional when AI or traffic providers are unavailable.

## Release isolation

Proposed branch: release/atlas-lean-dec-2026, originating from the recorded main commit. The local branch exists; it has not been pushed or deployed.

- Keep main protected and retain the baseline commit.
- Use small reviewable refactors and a parity checklist per change.
- Forward-port relevant main fixes regularly to avoid divergence.
- Use a separate deployment, database, storage namespace, secrets and webhook destinations for validation.
- Keep migrations additive and backward compatible; rehearse backup, restore and rollback.
- A branch alone does not isolate a shared database.
- Promote a tagged, tested release artifact after pilot acceptance.

## Traffic inputs for the December planner

Use a provider-neutral traffic adapter. TomTom is a suitable first technical evaluation for point-to-road flow data; evaluate Google Roads Management Insights for recurring route monitoring and historical congestion analysis. Provider access, cost, permitted use and exact site coverage require validation before selection.

Public documentation reviewed:

- https://docs.tomtom.com/traffic-api/documentation/tomtom-maps/v1/traffic-flow/flow-segment-data
- https://docs.tomtom.com/traffic-api/documentation/tomtom-maps/v1/product-information/market-coverage/
- https://developers.google.com/maps/documentation/routes/traffic_on_polylines
- https://developers.google.com/maps/documentation/roads-management-insights/overview

TomTom's documented segment response includes current/free-flow speed, travel times, confidence, closure state and geometry. Google's Routes API provides traffic speed categories along a requested route. Roads Management Insights supports periodic and near-real-time congestion data for defined routes. These are traffic conditions, not a census of vehicles passing a billboard.

Implementation requirements:

- Match each billboard face to relevant road approaches, carriageways and direction. Do not blindly accept the nearest road to the structure coordinates.
- Carry source, observed/retrieved timestamps, units, geometry, quality flags and permitted retention with every observation.
- Keep congestion, speeds, camera counts, manual counts and audience estimates as distinct metrics.
- A provider confidence field is not automatically a probability of correctness or comparable to another provider's quality scale.
- Check storage, historical analysis, derived scoring, report export, attribution and map-display permissions for the chosen contract.
- Test exact Rajkot approaches and peak/off-peak coverage. Country coverage does not establish site coverage.
- Use historical patterns for future campaign planning; a live snapshot cannot predict December campaign exposure.
- Do not derive daily vehicle counts from congestion colour or speed alone.
- Ingest HTTP traffic providers through a server-side worker, not through pretend edge devices. Keep Orbit MQTT for real devices; both can supply a common typed observation layer.
- Add quotas, timeouts, circuit breakers, budget limits and an explicit unavailable state.

## Proposed schedule

The maintained schedule is in `docs/releases/ATLAS_LEAN_LAUNCH_PLAN.md`, section 11. Parth is unavailable for two weeks around mid-November. For planning only, use 9-22 November until exact dates are known.

Complete scope and UX decisions before the absence, continue agreed engineering and testing during it, and schedule product acceptance after return. The revised launch target is 14-18 December 2026, subject to acceptance gates and engineering capacity. This supersedes the earlier 7-15 December target and avoids duplicate schedule tables drifting apart.

## Launch acceptance

A planner can create a real brief, find suitable available inventory, compare sites with honest evidence, build a full-budget campaign, revise the plan, export a customer-safe proposal and record the resulting booking without conflicting reservations or leaking commercial data.

Existing main-branch capabilities have mapped preservation evidence. Production builds and database-backed critical journeys pass. Provider failures do not block manual planning. Rollback has been rehearsed.

Open verification: running browser experience, database races, migration safety, deployed configuration, provider credentials and coverage, data licensing, CMS integration and physical edge accuracy. No claim of full audit completion or production readiness is made.
