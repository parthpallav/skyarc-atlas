/**
 * Pulse ConversationAction durability + Atlas accept recovery (isolated Postgres).
 * Meta transport mocked via AtlasOrchestrationClient. Persists real pulse schema rows.
 *
 * Requires PULSE_DATABASE_URL or INTEGRATION_DATABASE_URL.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { PrismaClient as PulsePrisma } from "../generated/prisma/index.js";
import { advanceConversation, newConversationState } from "../lib/conversation.js";
import type { AtlasOrchestrationClient } from "../lib/atlas-client.js";
import type { PulseEnv } from "../env.js";

const pulseUrl =
  process.env.PULSE_DATABASE_URL?.trim() || process.env.INTEGRATION_DATABASE_URL?.trim();

function describePulse(name: string, fn: () => void) {
  if (!pulseUrl) {
    describe.skip(`${name} (set PULSE_DATABASE_URL or INTEGRATION_DATABASE_URL)`, fn);
    return;
  }
  describe(name, fn);
}

const env = {
  PULSE_DATABASE_URL: pulseUrl ?? "postgresql://localhost/pulse",
  JWT_ACCESS_SECRET: "x".repeat(32),
  BRIDGE_SERVICE_TOKEN: "y".repeat(16),
  BRIDGE_INTERNAL_URL: "http://127.0.0.1:3004",
  ATLAS_INTERNAL_URL: "http://127.0.0.1:3001",
  WEB_APP_URL: "http://localhost:3000",
  PULSE_PORT: 3003,
  NODE_ENV: "test",
} as PulseEnv;

describePulse("pulse ConversationAction recovery (postgres)", () => {
  const prisma = new PulsePrisma({ datasources: { db: { url: pulseUrl! } } });
  const sessionIds: string[] = [];

  afterAll(async () => {
    if (sessionIds.length) {
      await prisma.conversationAction.deleteMany({ where: { sessionId: { in: sessionIds } } });
      await prisma.conversationTurn.deleteMany({ where: { sessionId: { in: sessionIds } } });
      await prisma.conversationSession.deleteMany({ where: { id: { in: sessionIds } } });
    }
    await prisma.$disconnect();
  });

  it("persists succeeded accept and recovers without re-calling Atlas", async () => {
    const tag = randomUUID().slice(0, 8);
    const quoteId = randomUUID();
    const bookingId = randomUUID();
    const campaignId = randomUUID();
    const atlasUserId = randomUUID();
    const tenantOrganizationId = randomUUID();
    const phoneE164 = `+1555${tag.replace(/\D/g, "").padEnd(7, "0").slice(0, 7)}`;

    const base = newConversationState();
    const state = {
      ...base,
      phase: "AWAIT_CONFIRM" as const,
      quoteId,
      campaignId,
    };

    const session = await prisma.conversationSession.create({
      data: {
        phoneE164,
        atlasUserId,
        tenantOrganizationId,
        campaignId,
        phase: "AWAIT_CONFIRM",
        stateJson: state as object,
        actionResultsJson: {},
        expiresAt: new Date(state.expiresAt),
      },
    });
    sessionIds.push(session.id);

    const executeWhatsAppConfirmation = vi.fn(async () => ({
      ok: true as const,
      status: 200,
      data: {
        executed: "ACCEPT_QUOTE",
        bookingId,
        revalidated: true,
      },
    }));

    const client: AtlasOrchestrationClient = {
      fetchScenarios: vi.fn(async () => ({ ok: false as const, status: 500, error: "unused" })),
      issueProposal: vi.fn(async () => ({ ok: false as const, status: 500, error: "unused" })),
      createWhatsAppConfirmation: vi.fn(async () => ({
        ok: false as const,
        status: 500,
        error: "unused",
      })),
      executeWhatsAppConfirmation,
      getQuote: vi.fn(async () => ({
        ok: true as const,
        status: 200,
        data: {
          id: quoteId,
          status: "ACCEPTED",
          total: 100000,
          currency: "INR",
          acceptedBookingId: bookingId,
        },
      })),
    };

    const first = await advanceConversation({
      env,
      accessToken: "tok",
      state,
      text: `CONFIRM ${randomBytes(8).toString("hex")}`,
      campaignId,
      atlasUserId,
      tenantOrganizationId,
      client,
    });
    expect(first.actionKey).toBe(`accept:${quoteId}`);
    expect(executeWhatsAppConfirmation).toHaveBeenCalledTimes(1);

    const actionKey = first.actionKey!;
    const nextResults = { [actionKey]: first.actionResult };
    await prisma.conversationAction.upsert({
      where: { sessionId_actionKey: { sessionId: session.id, actionKey } },
      create: {
        sessionId: session.id,
        actionKey,
        status: "succeeded",
        responseJson: first.actionResult as object,
      },
      update: {
        status: "succeeded",
        responseJson: first.actionResult as object,
      },
    });
    await prisma.conversationSession.update({
      where: { id: session.id },
      data: {
        phase: first.state.phase,
        stateJson: first.state as object,
        actionResultsJson: nextResults as object,
      },
    });

    const reloaded = await prisma.conversationSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    const priorActions = (reloaded.actionResultsJson ?? {}) as Record<string, unknown>;
    const recovered = await advanceConversation({
      env,
      accessToken: "tok",
      state: { ...state, phase: "AWAIT_CONFIRM" },
      text: `CONFIRM ${randomBytes(8).toString("hex")}`,
      campaignId,
      atlasUserId,
      tenantOrganizationId,
      priorActions,
      client,
    });

    expect(executeWhatsAppConfirmation).toHaveBeenCalledTimes(1);
    expect(recovered.state.phase).toBe("RESERVED");
    expect(recovered.state.bookingId).toBe(bookingId);
    expect(String(recovered.reply)).toMatch(/recovered prior Atlas accept/i);

    const actions = await prisma.conversationAction.findMany({ where: { sessionId: session.id } });
    expect(actions).toHaveLength(1);
    expect(actions[0]!.status).toBe("succeeded");
    expect(actions[0]!.actionKey).toBe(actionKey);
    expect(createHash("sha256").update(actionKey).digest("hex")).toHaveLength(64);
  });
});
