import { describe, expect, it, vi } from "vitest";
import {
  advanceConversation,
  extractBriefHints,
  explainServiceLimitation,
  newConversationState,
  nextPhaseAfterBrief,
  customerSafeStatusReply,
} from "../lib/conversation.js";
import type { AtlasOrchestrationClient } from "../lib/atlas-client.js";
import type { PulseEnv } from "../env.js";

const env = {
  PULSE_DATABASE_URL: "postgresql://localhost/pulse",
  JWT_ACCESS_SECRET: "x".repeat(32),
  BRIDGE_SERVICE_TOKEN: "y".repeat(16),
  BRIDGE_INTERNAL_URL: "http://127.0.0.1:3004",
  ATLAS_INTERNAL_URL: "http://127.0.0.1:3001",
  WEB_APP_URL: "http://localhost:3000",
  PULSE_PORT: 3003,
  NODE_ENV: "test",
} as PulseEnv;

function mockClient(overrides: Partial<AtlasOrchestrationClient> = {}): AtlasOrchestrationClient {
  return {
    fetchScenarios: vi.fn(async () => ({
      ok: true as const,
      status: 200,
      data: {
        campaignId: "11111111-1111-4111-8111-111111111111",
        coverage: { kind: "COVERAGE", totalCost: 100000, siteCount: 5, strategySummary: "spread" },
        concentration: {
          kind: "CONCENTRATION",
          totalCost: 80000,
          siteCount: 2,
          strategySummary: "focus",
        },
        meaningfullyDifferent: true,
        limitation: null,
      },
    })),
    issueProposal: vi.fn(async () => ({
      ok: true as const,
      status: 200,
      data: {
        proposal: {
          id: "22222222-2222-4222-8222-222222222222",
          total: 100000,
          currency: "INR",
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        },
        quoteId: "33333333-3333-4333-8333-333333333333",
      },
    })),
    createWhatsAppConfirmation: vi.fn(async () => ({
      ok: true as const,
      status: 200,
      data: {
        confirmationId: "44444444-4444-4444-8444-444444444444",
        token: "confirm-token-abc",
        expiresAt: new Date(Date.now() + 1800_000).toISOString(),
        fingerprint: "fp",
      },
    })),
    executeWhatsAppConfirmation: vi.fn(async () => ({
      ok: true as const,
      status: 200,
      data: {
        executed: "ACCEPT_QUOTE",
        bookingId: "55555555-5555-4555-8555-555555555555",
        revalidated: true,
      },
    })),
    getQuote: vi.fn(async () => ({
      ok: true as const,
      status: 200,
      data: {
        id: "33333333-3333-4333-8333-333333333333",
        status: "ACCEPTED",
        total: 100000,
        currency: "INR",
        expiresAt: new Date().toISOString(),
        acceptedBookingId: "55555555-5555-4555-8555-555555555555",
        campaignId: "11111111-1111-4111-8111-111111111111",
      },
    })),
    updateCampaignBrief: vi.fn(async () => ({ ok: true as const, status: 200, data: {} })),
    ...overrides,
  };
}

describe("pulse conversation orchestration", () => {
  it("extracts untrusted hints without authorizing", () => {
    const hints = extractBriefHints("Need Ahmedabad OOH budget 500000 for April");
    expect(hints.cityHint).toBe("ahmedabad");
    expect(hints.budgetHint).toBe(500000);
  });

  it("moves brief → clarify/scenarios and explains limitations", () => {
    const state = { ...newConversationState(), phase: "COLLECT_BRIEF" as const };
    const next = nextPhaseAfterBrief(state, extractBriefHints("Surat roadside only"));
    expect(next.phase).toBe("CLARIFY");
    const ready = nextPhaseAfterBrief(state, extractBriefHints("Surat budget 200000"));
    expect(ready.phase).toBe("SHOW_SCENARIOS");
    expect(explainServiceLimitation("cms")).toMatch(/manual/i);
    expect(customerSafeStatusReply({ ...newConversationState(), phase: "AWAIT_LINK" })).toMatch(
      /not linked/i
    );
  });

  it("runs brief → Atlas scenarios → proposal/quote → confirm → reserve", async () => {
    const client = mockClient();
    const campaignId = "11111111-1111-4111-8111-111111111111";
    const base = {
      env,
      accessToken: "tok",
      campaignId,
      atlasUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      tenantOrganizationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      client,
    };

    const afterBrief = await advanceConversation({
      ...base,
      state: { ...newConversationState(), phase: "COLLECT_BRIEF" },
      text: "Ahmedabad budget 500000",
    });
    expect(afterBrief.state.phase).toBe("SHOW_SCENARIOS");
    expect(client.fetchScenarios).toHaveBeenCalled();
    expect(afterBrief.state.scenarioSummary?.coverageTotal).toBe(100000);

    const afterProposal = await advanceConversation({
      ...base,
      state: afterBrief.state,
      text: "PROPOSAL COVERAGE",
    });
    expect(afterProposal.state.phase).toBe("AWAIT_CONFIRM");
    expect(afterProposal.state.quoteId).toBe("33333333-3333-4333-8333-333333333333");
    expect(afterProposal.reply).toMatch(/CONFIRM confirm-token-abc/);
    expect(client.issueProposal).toHaveBeenCalled();
    expect(client.createWhatsAppConfirmation).toHaveBeenCalledWith(
      env,
      "tok",
      expect.objectContaining({
        action: "ACCEPT_QUOTE",
        payload: expect.objectContaining({
          quoteId: "33333333-3333-4333-8333-333333333333",
        }),
      })
    );

    const afterConfirm = await advanceConversation({
      ...base,
      state: afterProposal.state,
      text: "CONFIRM confirm-token-abc",
    });
    expect(afterConfirm.state.phase).toBe("RESERVED");
    expect(afterConfirm.state.bookingId).toBe("55555555-5555-4555-8555-555555555555");
    expect(client.executeWhatsAppConfirmation).toHaveBeenCalled();
  });

  it("recovers when prior Atlas accept was stored (Pulse lost response)", async () => {
    const client = mockClient({
      executeWhatsAppConfirmation: vi.fn(async () => {
        throw new Error("should not call Atlas again");
      }),
    });
    const quoteId = "33333333-3333-4333-8333-333333333333";
    const result = await advanceConversation({
      env,
      accessToken: "tok",
      campaignId: "11111111-1111-4111-8111-111111111111",
      atlasUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      tenantOrganizationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      state: {
        ...newConversationState(),
        phase: "AWAIT_CONFIRM",
        quoteId,
      },
      text: "CONFIRM any-token",
      priorActions: {
        [`accept:${quoteId}`]: { bookingId: "55555555-5555-4555-8555-555555555555" },
      },
      client,
    });
    expect(result.state.phase).toBe("RESERVED");
    expect(result.reply).toMatch(/recovered/i);
    expect(client.executeWhatsAppConfirmation).not.toHaveBeenCalled();
  });

  it("does not invent prices when Atlas returns PRICING_UNAVAILABLE", async () => {
    const client = mockClient({
      issueProposal: vi.fn(async () => ({
        ok: false as const,
        status: 400,
        error: "PRICING_UNAVAILABLE",
      })),
    });
    const result = await advanceConversation({
      env,
      accessToken: "tok",
      campaignId: "11111111-1111-4111-8111-111111111111",
      atlasUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      tenantOrganizationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      state: { ...newConversationState(), phase: "SHOW_SCENARIOS" },
      text: "PROPOSAL COVERAGE",
      client,
    });
    expect(result.state.quoteId).toBeUndefined();
    expect(result.reply).toMatch(/PRICING_UNAVAILABLE|rate card/i);
  });
});
