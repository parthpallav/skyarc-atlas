# Proposal & Scenario API (Phase 4)

Atlas owns scenario packing, immutable proposal revisions, linked `QuoteRevision`s, and view-only share tokens. Pulse may orchestrate UX later; it must not duplicate pricing or reservations.

## Flow

1. `POST /v1/campaigns/:campaignId/scenarios` — generate Coverage + Concentration (no holds).
2. Compare in UI → select one scenario.
3. `POST /v1/campaigns/:campaignId/proposals` — issue immutable proposal revision + linked quote.
4. Customer review (authenticated or share link).
5. `POST /v1/proposals/:id/accept` — revalidate availability via quote accept → authoritative booking.
6. Exports (`pdf` / `xlsx` / `pptx`) always read the issued snapshot.

Generating scenarios does **not** reserve capacity. Accepting creates **one** reservation for the selected scenario only.

## Scenarios

| Kind | Intent |
|------|--------|
| `COVERAGE` | Broader relevant locations/formats within budget |
| `CONCENTRATION` | Stronger presence at fewer relevant sites |

Constraints applied: geography (goal-fit), campaign flight, capacity eligibility, format-aware packing via the Atlas optimizer + rate engine.

Response includes:

- Selected inventory + selection reasons (customer-safe; no staff scores/margins)
- Itemized campaign cost
- Capacity / availability freshness
- Strategy trade-offs
- Evidence limitations (Orbit telemetry deferred — not treated as measured evidence)
- `meaningfullyDifferent` / `limitation` when inventory cannot support distinct plans

## Proposal revisions

- Stored as `ProposalRevision` with frozen `snapshotJson` + `quoteRevisionId`
- Changes create a new revision; prior `ISSUED` rows become `SUPERSEDED`
- Accept marks `ACCEPTED` only when the linked quote accept yields a booking
- Customer payloads strip internal scores/margins/mix targets

## Share links

- `POST /v1/proposals/:id/share` → raw token (hashed at rest), TTL (default 72h, max 168h)
- `GET /v1/public/proposals/share/:token` → view-only snapshot (`canAccept: false`, `canPay: false`)
- `POST /v1/proposals/share/:shareId/revoke` — revokes immediately
- Share links never authorize booking or payment

## Exports

| Format | Endpoint |
|--------|----------|
| PDF | `GET /v1/proposals/:id/export/pdf` |
| Excel | `GET /v1/proposals/:id/export/xlsx` |
| PPTX | `GET /v1/proposals/:id/export/pptx` |

All three use the same issued proposal snapshot (prices, dates, inventory, assumptions, next steps). Customer exports must not contain internal commercial fields.

## Tenant

Authenticated campaign/proposal routes require campaign access + `assertSameTenant` on proposal tenant org. Public share is token-scoped only.

## Deferred

- Orbit MQTT / campaign intelligence as measured evidence
- Live paid checkout (credentials blocked — see payment adapter `UNAVAILABLE`)
