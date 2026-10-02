/**
 * Pulse conversation state + quote→reserve orchestration against Atlas APIs.
 * Backend-authorized validated actions only — no AI-invented API parameters.
 */
import type { PulseEnv } from "../env.js";
import type { AtlasOrchestrationClient } from "./atlas-client.js";
import { defaultAtlasClient } from "./atlas-client.js";

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
  bookingId?: string;
  confirmationToken?: string;
  confirmationId?: string;
  confirmationExpiresAt?: string;
  scenarioKind?: "COVERAGE" | "CONCENTRATION";
  customerSafeTotal?: number;
  currency?: string;
  structuredBrief?: Record<string, unknown>;
  scenarioSummary?: {
    coverageSites?: number;
    concentrationSites?: number;
    coverageTotal?: number;
    concentrationTotal?: number;
    limitation?: string | null;
  };
  /** Last successful Atlas action key for recovery after lost responses */
  lastActionKey?: string;
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
  const dates = text.match(/(\d{4}-\d{2}-\d{2}).*?(\d{4}-\d{2}-\d{2})/);
  if (dates) {
    out.startDateHint = dates[1];
    out.endDateHint = dates[2];
  }
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
      return "Send a short campaign brief: city, dates, budget, and formats. Include an Atlas campaignId if not already bound.";
    case "CLARIFY":
      return "I still need city and budget before comparing scenarios. Reply with those details.";
    case "SHOW_SCENARIOS": {
      const s = state.scenarioSummary;
      if (!s) {
        return "Preparing Coverage vs Concentration via Atlas (authoritative pricing). Reply again if this stalls.";
      }
      return [
        "Atlas scenarios (customer totals only):",
        s.coverageSites != null
          ? `COVERAGE ~${s.coverageSites} sites / ₹${s.coverageTotal ?? "?"}`
          : "COVERAGE unavailable",
        s.concentrationSites != null
          ? `CONCENTRATION ~${s.concentrationSites} sites / ₹${s.concentrationTotal ?? "?"}`
          : "CONCENTRATION unavailable",
        s.limitation ? `Note: ${s.limitation}` : null,
        "Reply PROPOSAL COVERAGE or PROPOSAL CONCENTRATION. Prices come only from Atlas quotes.",
      ]
        .filter(Boolean)
        .join("\n");
    }
    case "SHOW_PROPOSAL":
      return `Proposal/quote issued in Atlas${
        state.customerSafeTotal != null ? ` (total ₹${state.customerSafeTotal})` : ""
      }. Reply CONFIRM <token> to reserve — Atlas revalidates availability and quote expiry. Or use the secure web link.`;
    case "AWAIT_CONFIRM":
      return "Waiting for your explicit confirmation. Do not forward the token. Duplicates will not re-book.";
    case "RESERVED":
      return `Reservation recorded in Atlas${
        state.bookingId ? ` (booking ${state.bookingId.slice(0, 8)}…)` : ""
      }. Ask STATUS for progress. Automatic CMS scheduling and Orbit playback proof are not available in this channel.`;
    case "ESCALATED":
      return "A teammate will follow up. Sensitive billing details are not shared over WhatsApp.";
    default:
      return "Session ended.";
  }
}

export function explainServiceLimitation(
  kind: "missing_price" | "unavailable" | "unconfigured" | "cms" | "orbit"
): string {
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

export type OrchestrationResult = {
  state: ConversationState;
  reply: string;
  atlasRefs?: Record<string, unknown>;
  actionKey?: string;
  actionResult?: unknown;
};

function parseProposalChoice(text: string): "COVERAGE" | "CONCENTRATION" | null {
  const u = text.trim().toUpperCase();
  if (u === "PROPOSAL COVERAGE" || u === "COVERAGE") return "COVERAGE";
  if (u === "PROPOSAL CONCENTRATION" || u === "CONCENTRATION") return "CONCENTRATION";
  return null;
}

/**
 * Advance conversation by calling Atlas. Uses validated enums/IDs from state only.
 */
export async function advanceConversation(input: {
  env: PulseEnv;
  accessToken: string;
  state: ConversationState;
  text: string;
  campaignId: string;
  atlasUserId: string;
  tenantOrganizationId: string;
  /** Prior successful action results keyed by actionKey — recovery when Pulse lost response */
  priorActions?: Record<string, unknown>;
  client?: AtlasOrchestrationClient;
}): Promise<OrchestrationResult> {
  const client = input.client ?? defaultAtlasClient;
  let state: ConversationState = { ...input.state, campaignId: input.campaignId };
  const bindCampaign = (s: ConversationState): ConversationState => ({
    ...s,
    campaignId: input.campaignId,
  });
  const text = input.text.trim();
  const upper = text.toUpperCase();

  if (conversationExpired(state)) {
    return { state: { ...state, phase: "EXPIRED" }, reply: customerSafeStatusReply({ ...state, phase: "EXPIRED" }) };
  }

  if (upper === "STATUS") {
    return { state, reply: customerSafeStatusReply(state) };
  }
  if (upper === "HELP" || upper === "ESCALATE") {
    state = { ...state, phase: "ESCALATED" };
    return { state, reply: customerSafeStatusReply(state) };
  }

  // Recovery: already reserved
  if (state.phase === "RESERVED" && state.bookingId) {
    return { state, reply: customerSafeStatusReply(state) };
  }

  // CONFIRM <token>
  if (upper.startsWith("CONFIRM ")) {
    const token = text.trim().slice(8).trim();
    if (!token || !state.quoteId) {
      return {
        state,
        reply: "No active quote to confirm. Complete PROPOSAL COVERAGE/CONCENTRATION first.",
      };
    }
    const actionKey = `accept:${state.quoteId}`;
    if (input.priorActions?.[actionKey] && typeof input.priorActions[actionKey] === "object") {
      const prior = input.priorActions[actionKey] as { bookingId?: string };
      state = {
        ...state,
        phase: "RESERVED",
        bookingId: prior.bookingId ?? state.bookingId,
        lastActionKey: actionKey,
      };
      return {
        state,
        reply: customerSafeStatusReply(state) + " (recovered prior Atlas accept — not re-reserved)",
        actionKey,
        actionResult: input.priorActions[actionKey],
      };
    }

    // Bind confirmation to user/tenant/action/quote — token from Atlas create
    const exec = await client.executeWhatsAppConfirmation(input.env, input.accessToken, {
      token,
      action: "ACCEPT_QUOTE",
    });
    if (!exec.ok) {
      // Recovery path: quote may already be accepted
      const quote = await client.getQuote(input.env, input.accessToken, state.quoteId);
      if (quote.ok && quote.data.status === "ACCEPTED" && quote.data.acceptedBookingId) {
        state = {
          ...state,
          phase: "RESERVED",
          bookingId: quote.data.acceptedBookingId,
          lastActionKey: actionKey,
        };
        return {
          state,
          reply: customerSafeStatusReply(state) + " (Atlas already accepted — recovered)",
          actionKey,
          actionResult: { bookingId: quote.data.acceptedBookingId, recovered: true },
        };
      }
      return {
        state: { ...state, phase: "AWAIT_CONFIRM" },
        reply: `Confirmation failed: ${exec.error}. ${explainServiceLimitation("unavailable")}`,
      };
    }

    if (exec.data.idempotent) {
      const quote = await client.getQuote(input.env, input.accessToken, state.quoteId);
      state = {
        ...state,
        phase: "RESERVED",
        bookingId: quote.ok ? quote.data.acceptedBookingId ?? state.bookingId : state.bookingId,
        lastActionKey: actionKey,
      };
      return {
        state,
        reply: customerSafeStatusReply(state) + " Duplicate CONFIRM ignored — booking not repeated.",
        actionKey,
        actionResult: exec.data,
      };
    }

    state = {
      ...state,
      phase: "RESERVED",
      bookingId: exec.data.bookingId ?? state.bookingId,
      lastActionKey: actionKey,
    };
    return {
      state,
      reply: customerSafeStatusReply(state),
      actionKey,
      actionResult: exec.data,
      atlasRefs: { quoteId: state.quoteId, bookingId: state.bookingId },
    };
  }

  // Issue proposal from scenario choice
  const choice = parseProposalChoice(text);
  if (choice && (state.phase === "SHOW_SCENARIOS" || state.phase === "SHOW_PROPOSAL" || state.phase === "AWAIT_CONFIRM")) {
    const actionKey = `proposal:${input.campaignId}:${choice}`;
    if (input.priorActions?.[actionKey] && typeof input.priorActions[actionKey] === "object") {
      const prior = input.priorActions[actionKey] as {
        proposalId?: string;
        quoteId?: string;
        total?: number;
        currency?: string;
        token?: string;
        confirmationId?: string;
        expiresAt?: string;
      };
      state = {
        ...state,
        phase: "AWAIT_CONFIRM",
        scenarioKind: choice,
        proposalId: prior.proposalId,
        quoteId: prior.quoteId,
        customerSafeTotal: prior.total,
        currency: prior.currency,
        confirmationToken: prior.token,
        confirmationId: prior.confirmationId,
        confirmationExpiresAt: prior.expiresAt,
        lastActionKey: actionKey,
      };
      return {
        state,
        reply:
          customerSafeStatusReply(state) +
          (prior.token ? `\nToken: ${prior.token}` : "") +
          " (recovered prior Atlas proposal)",
        actionKey,
        actionResult: prior,
      };
    }

    const issued = await client.issueProposal(input.env, input.accessToken, input.campaignId, choice);
    if (!issued.ok) {
      const lim =
        issued.error.includes("PRICING_UNAVAILABLE")
          ? explainServiceLimitation("missing_price")
          : explainServiceLimitation("unavailable");
      return { state, reply: `Could not issue Atlas proposal: ${issued.error}. ${lim}` };
    }

    const confirm = await client.createWhatsAppConfirmation(input.env, input.accessToken, {
      action: "ACCEPT_QUOTE",
      payload: {
        quoteId: issued.data.quoteId,
        proposalId: issued.data.proposal.id,
        campaignId: input.campaignId,
        tenantOrganizationId: input.tenantOrganizationId,
        atlasUserId: input.atlasUserId,
        scenarioKind: choice,
      },
      ttlMinutes: 30,
    });
    if (!confirm.ok) {
      return {
        state: {
          ...state,
          phase: "SHOW_PROPOSAL",
          scenarioKind: choice,
          proposalId: issued.data.proposal.id,
          quoteId: issued.data.quoteId,
          customerSafeTotal: issued.data.proposal.total,
          currency: issued.data.proposal.currency,
        },
        reply: `Quote ${issued.data.quoteId} issued but confirmation token failed: ${confirm.error}. Use Atlas web accept.`,
        atlasRefs: { quoteId: issued.data.quoteId, proposalId: issued.data.proposal.id },
      };
    }

    state = {
      ...state,
      phase: "AWAIT_CONFIRM",
      scenarioKind: choice,
      proposalId: issued.data.proposal.id,
      quoteId: issued.data.quoteId,
      customerSafeTotal: issued.data.proposal.total,
      currency: issued.data.proposal.currency,
      confirmationToken: confirm.data.token,
      confirmationId: confirm.data.confirmationId,
      confirmationExpiresAt: confirm.data.expiresAt,
      lastActionKey: actionKey,
    };
    const actionResult = {
      proposalId: issued.data.proposal.id,
      quoteId: issued.data.quoteId,
      total: issued.data.proposal.total,
      currency: issued.data.proposal.currency,
      token: confirm.data.token,
      confirmationId: confirm.data.confirmationId,
      expiresAt: confirm.data.expiresAt,
    };
    return {
      state,
      reply:
        `Atlas issued quote ${issued.data.quoteId.slice(0, 8)}… total ₹${issued.data.proposal.total} (${issued.data.proposal.currency}). ` +
        `Reply CONFIRM ${confirm.data.token} before ${confirm.data.expiresAt}. ` +
        "This revalidates availability; duplicates will not reserve twice.",
      actionKey,
      actionResult,
      atlasRefs: { quoteId: issued.data.quoteId, proposalId: issued.data.proposal.id },
    };
  }

  // Brief collection → scenarios
  if (state.phase === "COLLECT_BRIEF" || state.phase === "CLARIFY" || state.phase === "SHOW_SCENARIOS") {
    if (state.phase === "COLLECT_BRIEF" || state.phase === "CLARIFY") {
      const hints = extractBriefHints(text);
      state = bindCampaign(nextPhaseAfterBrief(state, hints));
      if (state.phase === "CLARIFY") {
        return { state, reply: customerSafeStatusReply(state) };
      }
    }

    const budget =
      typeof state.structuredBrief?.budgetHint === "number"
        ? state.structuredBrief.budgetHint
        : undefined;
    const actionKey = `scenarios:${input.campaignId}:${budget ?? "default"}`;
    if (input.priorActions?.[actionKey] && typeof input.priorActions[actionKey] === "object") {
      const prior = input.priorActions[actionKey] as ConversationState["scenarioSummary"] & {
        ok?: boolean;
      };
      state = {
        ...state,
        phase: "SHOW_SCENARIOS",
        scenarioSummary: prior,
        lastActionKey: actionKey,
      };
      return {
        state,
        reply: customerSafeStatusReply(state) + " (recovered prior Atlas scenarios)",
        actionKey,
        actionResult: prior,
      };
    }

    await client.updateCampaignBrief(
      input.env,
      input.accessToken,
      input.campaignId,
      {
        ...(state.structuredBrief ?? {}),
        source: "pulse_whatsapp",
        city: state.structuredBrief?.cityHint,
        budget: budget,
      },
      String(state.structuredBrief?.raw ?? text)
    );

    const scenarios = await client.fetchScenarios(
      input.env,
      input.accessToken,
      input.campaignId,
      budget
    );
    if (!scenarios.ok) {
      return {
        state: { ...state, phase: "CLARIFY" },
        reply: `Atlas scenarios failed: ${scenarios.error}. ${explainServiceLimitation("unavailable")}`,
      };
    }

    const summary = {
      coverageSites: scenarios.data.coverage?.siteCount,
      concentrationSites: scenarios.data.concentration?.siteCount,
      coverageTotal: scenarios.data.coverage?.totalCost,
      concentrationTotal: scenarios.data.concentration?.totalCost,
      limitation: scenarios.data.limitation,
    };
    state = {
      ...state,
      phase: "SHOW_SCENARIOS",
      scenarioSummary: summary,
      lastActionKey: actionKey,
    };
    return {
      state,
      reply: customerSafeStatusReply(state) + " " + explainServiceLimitation("cms"),
      actionKey,
      actionResult: summary,
      atlasRefs: { campaignId: input.campaignId },
    };
  }

  return {
    state,
    reply: customerSafeStatusReply(state) + " " + explainServiceLimitation("orbit"),
  };
}
