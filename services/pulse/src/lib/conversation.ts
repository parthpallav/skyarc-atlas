/**
 * Pulse conversational planning state machine.
 * Message text is untrusted; Atlas APIs enforce auth/prices/capacity.
 */
export type ConversationPhase =
  | "AWAIT_LINK"
  | "COLLECT_BRIEF"
  | "CLARIFY"
  | "SHOW_SCENARIOS"
  | "SHOW_PROPOSAL"
  | "AWAIT_CONFIRM"
  | "RESERVED"
  | "ESCALATED"
  | "EXPIRED";

export type ConversationState = {
  phase: ConversationPhase;
  campaignId?: string;
  proposalId?: string;
  quoteId?: string;
  confirmationToken?: string;
  structuredBrief?: Record<string, unknown>;
  expiresAt: string;
  history: Array<{ at: string; role: "user" | "assistant" | "system"; text: string }>;
};

export function newConversationState(ttlHours = 24): ConversationState {
  return {
    phase: "AWAIT_LINK",
    expiresAt: new Date(Date.now() + ttlHours * 3600_000).toISOString(),
    history: [],
  };
}

export function conversationExpired(state: ConversationState, now = new Date()): boolean {
  return new Date(state.expiresAt).getTime() < now.getTime();
}

/** Naive intent extraction — never authorizes or prices. */
export function extractBriefHints(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = { raw: text.slice(0, 2000) };
  const budget = text.match(/(?:budget|₹|rs\.?)\s*([0-9][0-9,]*)/i);
  if (budget) out.budgetHint = Number(budget[1]!.replace(/,/g, ""));
  const city = text.match(/\b(ahmedabad|surat|vadodara|rajkot|mumbai|delhi)\b/i);
  if (city) out.cityHint = city[1]!.toLowerCase();
  return out;
}

export function nextPhaseAfterBrief(state: ConversationState, hints: Record<string, unknown>): ConversationState {
  const structuredBrief = { ...(state.structuredBrief ?? {}), ...hints };
  const needsClarify = !structuredBrief.cityHint || !structuredBrief.budgetHint;
  return {
    ...state,
    structuredBrief,
    phase: needsClarify ? "CLARIFY" : "SHOW_SCENARIOS",
    history: [
      ...state.history,
      { at: new Date().toISOString(), role: "user", text: String(hints.raw ?? "") },
    ],
  };
}

export function customerSafeStatusReply(state: ConversationState): string {
  if (conversationExpired(state)) {
    return "This WhatsApp planning session expired. Open Atlas or start a new linked session.";
  }
  switch (state.phase) {
    case "AWAIT_LINK":
      return "Your WhatsApp number is not linked to an Atlas account. Ask your planner to start a link from Atlas (phone alone cannot grant access).";
    case "COLLECT_BRIEF":
      return "Send a short campaign brief: city, dates, budget, and formats.";
    case "CLARIFY":
      return "I still need city and budget before comparing scenarios. Reply with those details.";
    case "SHOW_SCENARIOS":
      return "Scenarios are ready in Atlas. Reply PROPOSAL COVERAGE or PROPOSAL CONCENTRATION after reviewing. Prices come only from Atlas quotes.";
    case "SHOW_PROPOSAL":
      return "Proposal issued. Reply CONFIRM <token> to reserve — this revalidates availability and quote expiry. Or use the secure web link.";
    case "AWAIT_CONFIRM":
      return "Waiting for your explicit confirmation. Do not forward the token. Duplicates will not re-book.";
    case "RESERVED":
      return "Reservation recorded in Atlas. Ask STATUS for progress. Automatic CMS scheduling and Orbit playback proof are not available in this channel.";
    case "ESCALATED":
      return "A teammate will follow up. Sensitive billing details are not shared over WhatsApp.";
    default:
      return "Session ended.";
  }
}

export function explainServiceLimitation(kind: "missing_price" | "unavailable" | "unconfigured" | "cms" | "orbit"): string {
  switch (kind) {
    case "missing_price":
      return "Some sites have no rate card — Atlas returns PRICING_UNAVAILABLE and will not invent zeros.";
    case "unavailable":
      return "Inventory capacity changed. Open Atlas to re-quote; WhatsApp will not reserve stale selections.";
    case "unconfigured":
      return "WhatsApp delivery is not fully configured (dry-run / pending Meta credentials). Messages may not reach the provider.";
    case "cms":
      return "CMS scheduling is manual handoff only — this chat does not auto-publish creatives.";
    case "orbit":
      return "Orbit telemetry-derived campaign intelligence is not available yet.";
  }
}
