/**
 * Integration evidence — product integrations (Pulse quote loop + Google OIDC).
 * Do not treat unit-test counts as release proof.
 *
 * Status legend:
 * - Implemented
 * - Integration verified (API/DB against INTEGRATION_DATABASE_URL or equivalent)
 * - Provider/hardware live verified
 * - Pending configuration or partner decision
 */

## Pulse → Atlas quote → booking

| Step | Status | Evidence |
|------|--------|----------|
| Linked user required (phone alone denied) | **Implemented** | Pulse inbound returns `blocked_unlinked` |
| Campaign binding required | **Implemented** | `blocked_missing_campaign` without campaignId |
| Structured brief → Atlas scenarios | **Implemented** | `advanceConversation` + unit mock calling `POST /campaigns/:id/scenarios` |
| Scenario → Atlas proposal + QuoteRevision | **Implemented** | `issueProposal` → quoteId; no Pulse ledger |
| Confirmation bound to user/tenant/action/quote | **Implemented** | Atlas confirmation payload + execute user/tenant checks |
| Accept → reserve with revalidation | **Implemented** | Atlas `acceptQuoteRevision` via confirmation execute |
| Duplicate CONFIRM / recovery | **Implemented** | `ConversationAction` + priorActions recovery; Atlas idempotency |
| Customer-safe pricing only | **Implemented** | Atlas customer-safe totals; no margin fields in replies |
| Meta transport | **Pending configuration** | Bridge dry-run; provider mock OK for transport only |
| End-to-end against live Postgres + Atlas | **Pending** | Requires `INTEGRATION_DATABASE_URL` + running Atlas; unit mocks cover orchestration logic |

## Google sign-up / onboarding

| Step | Status | Evidence |
|------|--------|----------|
| OIDC start/callback/link routes | **Implemented** | `/auth/google/*` |
| Stable subject association | **Implemented** | `ExternalIdentity.provider+subject` |
| Authenticated link for existing email accounts | **Implemented** | Reject silent merge; `/auth/google/link` |
| Minimal initial role | **Implemented** | `CLIENT_VIEWER` self-serve; no auto tenant |
| Org invitations | **Implemented** | `OrganizationInvitation` + staff `POST /auth/invitations` |
| Disabled accounts / logout revoke | **Implemented** | deactivatedAt checks; logout revokes refresh |
| Config without production creds | **Implemented** | Routes unavailable until env set; unit tests |
| Live Google verification | **Pending configuration** | Needs `GOOGLE_CLIENT_*` + credentialed test |

## Release checklist (browser/API/DB)

| Flow | Implemented | Integration verified | Live provider |
|------|-------------|----------------------|---------------|
| Proposal selection + quote accept | Yes (Atlas) | Partial (prior PG reservation tests) | N/A |
| Booking approval / amend / expiry | Yes | Partial (`reservation.integration.test.ts`) | N/A |
| Creative/proof authorization | Yes | Unit authorized-assets | N/A |
| Invoice + partial manual payment | Yes | Unit invoice arithmetic | Payment provider pending |
| Pulse conversation confirm + reserve | Yes (orchestration) | **Not yet** vs live Atlas/PG in this pass | Meta pending |
| Google onboarding + tenant access | Yes | Unit OIDC helpers | Google pending |

## Orbit MQTT tests

Orbit `phase7b-telemetry.test.ts` exercises **envelope/topic/normalize/simulator contracts and handlers only**.
It does **not** connect to an MQTT broker. Status: **simulator / handler verified** — **not broker-verified**.

## External blockers (track separately)

- Google credentials (live OIDC)
- Meta WhatsApp delivery + templates
- Payment provider
- Tally live sync
- Orbit broker/hardware + Lunar §10 decisions

## Do not

- Manufacture audience forecasts / impressions / reach / proof of play from basic telemetry
- Merge/deploy/contact providers automatically
