/**
 * ADR-0003 — Quote revision ownership (Phase 3)
 *
 * Context
 * -------
 * The platform plan originally assigned "Quotes / Excel / WhatsApp orchestration"
 * to Pulse, while Phase 3 work landed `QuoteRevision` persistence and HTTP
 * (`POST /quotes`, accept → `holdInventoryForCampaign`) inside Atlas.
 * Pulse currently has no quote ledger or consumers of QuoteRevision.
 *
 * Decision
 * --------
 * **Atlas remains the authoritative store** for:
 * - RateCard / location commercial base rates
 * - Immutable QuoteRevision rows (issue, supersede, accept linkage)
 * - Acceptance → reservation orchestration that writes AvailabilityWindow + Booking
 *
 * **Pulse remains the intended orchestration layer** for Excel exports, WhatsApp
 * commercial messaging, and future multi-step quote UX — calling Atlas APIs.
 * Pulse must not invent a second QuoteRevision or RateCard write path.
 *
 * Preferred long-term boundary (unchanged intent)
 * -----------------------------------------------
 * - Atlas: inventory, capacity, reservations, base rates, quote persistence
 * - Pulse: commercial rules orchestration, proposal packaging, channel delivery
 *
 * Moving existing QuoteRevision rows out of Atlas would disrupt working accept→reserve
 * flows without benefit. Revisit only if Pulse gains a dedicated commercial service
 * and a single cutover migrates reads/writes atomically.
 *
 * Consequences
 * ------------
 * - Matrix / graph memory list QuoteRevision owner as Atlas (persistence + accept).
 * - Pulse orchestration stays pending until Excel/WhatsApp quote flows call Atlas.
 * - No second writable quote ledger.
 */
export const QUOTE_OWNERSHIP_ADR = "ADR-0003";
