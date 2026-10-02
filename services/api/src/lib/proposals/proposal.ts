/**
 * Immutable proposal revisions linked to Atlas QuoteRevision.
 * Selecting a scenario does not reserve; accept revalidates then reserves.
 */
import { createHash, randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { issueQuoteRevision, acceptQuoteRevision } from "../booking/quote-revision.js";
import { customerSafeScenario, type ScenarioKind, type ScenarioResult } from "./scenarios.js";

export type ProposalSnapshot = {
  campaignId: string;
  campaignName: string;
  advertiserName: string;
  scenarioKind: ScenarioKind;
  strategySummary: string;
  tradeOffs: string[];
  evidenceLimitations: string[];
  flight: { start: string | null; end: string | null };
  lines: ScenarioResult["lines"];
  totalCost: number;
  currency: string;
  assumptions: Record<string, unknown>;
};

export function hashShareToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function issueProposalRevision(
  prisma: PrismaClient,
  input: {
    campaignId: string;
    scenario: ScenarioResult;
    evidenceLimitations: string[];
    tenantOrganizationId?: string | null;
    actorUserId?: string | null;
    expiresAt?: Date;
  }
) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: input.campaignId },
    include: { advertiser: true },
  });
  if (!campaign) return { error: "Campaign not found" as const };
  if (!campaign.startDate || !campaign.endDate) {
    return { error: "Campaign flight dates are required before issuing a proposal" as const };
  }
  if (input.scenario.lines.length === 0) {
    return { error: "Scenario has no inventory lines" as const };
  }

  // Issue linked immutable quote (Atlas ownership) — does not reserve
  const quote = await issueQuoteRevision(prisma, {
    campaignId: input.campaignId,
    tenantOrganizationId: input.tenantOrganizationId,
    actorUserId: input.actorUserId,
    inventoryQuotes: input.scenario.lines.map((line) => ({
      inventoryId: line.inventoryId,
      startDate: campaign.startDate!.toISOString(),
      endDate: campaign.endDate!.toISOString(),
      playsPerDay: 60,
      creativeDurationSec: 10,
      distributionMode: "ALL_DAY" as const,
    })),
  });
  if ("error" in quote) {
    return { error: quote.error };
  }

  const safeScenario = customerSafeScenario(input.scenario);
  const snapshot: ProposalSnapshot = {
    campaignId: campaign.id,
    campaignName: campaign.name,
    advertiserName: campaign.advertiser.name,
    scenarioKind: safeScenario.kind,
    strategySummary: safeScenario.strategySummary,
    tradeOffs: safeScenario.tradeOffs,
    evidenceLimitations: input.evidenceLimitations,
    flight: {
      start: campaign.startDate.toISOString(),
      end: campaign.endDate.toISOString(),
    },
    lines: safeScenario.lines,
    totalCost: safeScenario.totalCost,
    currency: quote.quote.currency,
    assumptions: {
      pricingEngine: "atlas-quote-revision",
      quoteRevisionId: quote.quote.id,
      quoteRevisionNumber: quote.quote.revisionNumber,
      scenarioKind: safeScenario.kind,
      siteCount: safeScenario.siteCount,
    },
  };

  const prior = await prisma.proposalRevision.count({ where: { campaignId: campaign.id } });
  await prisma.proposalRevision.updateMany({
    where: { campaignId: campaign.id, status: "ISSUED" },
    data: { status: "SUPERSEDED", updatedAt: new Date() },
  });

  const expiresAt =
    input.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const proposal = await prisma.proposalRevision.create({
    data: {
      tenantOrganizationId: input.tenantOrganizationId ?? null,
      campaignId: campaign.id,
      revisionNumber: prior + 1,
      status: "ISSUED",
      scenarioKind: input.scenario.kind,
      quoteRevisionId: quote.quote.id,
      currency: quote.quote.currency,
      totalMinor: quote.quote.totalMinor,
      snapshotJson: snapshot as unknown as Prisma.InputJsonValue,
      assumptionsJson: snapshot.assumptions as Prisma.InputJsonValue,
      expiresAt,
      createdByUserId: input.actorUserId ?? null,
    },
  });

  return { proposal, quote: quote.quote, snapshot };
}

export async function acceptProposalRevision(
  prisma: PrismaClient,
  input: {
    proposalId: string;
    actorUserId?: string | null;
    tenantOrganizationId?: string | null;
    idempotencyKey?: string | null;
  }
) {
  const proposal = await prisma.proposalRevision.findUnique({ where: { id: input.proposalId } });
  if (!proposal) return { error: "Proposal not found" as const };

  if (proposal.status === "ACCEPTED" && proposal.acceptedBookingId) {
    return { proposal, idempotent: true as const };
  }
  if (proposal.status !== "ISSUED") {
    return { error: `Proposal cannot be accepted from status ${proposal.status}` as const };
  }
  if (proposal.expiresAt.getTime() < Date.now()) {
    await prisma.proposalRevision.update({
      where: { id: proposal.id },
      data: { status: "EXPIRED", updatedAt: new Date() },
    });
    return { error: "Proposal expired" as const };
  }
  if (!proposal.quoteRevisionId) {
    return { error: "Proposal is missing linked quote" as const };
  }

  const accept = await acceptQuoteRevision(prisma, {
    quoteId: proposal.quoteRevisionId,
    actorUserId: input.actorUserId,
    tenantOrganizationId: input.tenantOrganizationId ?? proposal.tenantOrganizationId,
    idempotencyKey: input.idempotencyKey ?? `proposal-accept:${proposal.id}`,
    mode: "book",
  });
  if ("error" in accept && accept.error) {
    return accept;
  }
  if (!("booking" in accept) || !accept.booking?.id) {
    return { error: "Quote accepted without booking — proposal not marked accepted" as const };
  }

  const updated = await prisma.proposalRevision.update({
    where: { id: proposal.id },
    data: {
      status: "ACCEPTED",
      acceptedAt: new Date(),
      acceptedBookingId: accept.booking.id,
      updatedAt: new Date(),
    },
  });

  return { proposal: updated, booking: accept.booking, quote: accept.quote, idempotent: false as const };
}

export async function createProposalShareToken(
  prisma: PrismaClient,
  input: {
    proposalId: string;
    actorUserId?: string | null;
    ttlHours?: number;
  }
) {
  const proposal = await prisma.proposalRevision.findUnique({ where: { id: input.proposalId } });
  if (!proposal || proposal.status !== "ISSUED") {
    return { error: "Only issued proposals can be shared" as const };
  }
  const raw = randomBytes(24).toString("base64url");
  const tokenHash = hashShareToken(raw);
  const expiresAt = new Date(Date.now() + (input.ttlHours ?? 72) * 3600_000);
  const row = await prisma.proposalShareToken.create({
    data: {
      proposalRevisionId: proposal.id,
      tokenHash,
      expiresAt,
      createdByUserId: input.actorUserId ?? null,
    },
  });
  return { token: raw, share: row, expiresAt };
}

export async function resolveShareToken(prisma: PrismaClient, rawToken: string) {
  const tokenHash = hashShareToken(rawToken);
  const row = await prisma.proposalShareToken.findFirst({
    where: { tokenHash },
    include: { proposal: true },
  });
  if (!row) return { error: "Share link not found" as const };
  if (row.revokedAt) return { error: "Share link revoked" as const };
  if (row.expiresAt.getTime() < Date.now()) return { error: "Share link expired" as const };
  if (row.proposal.status !== "ISSUED" && row.proposal.status !== "ACCEPTED") {
    return { error: "Proposal is no longer available" as const };
  }
  // Share link is view-only — never authorizes booking/payment
  return {
    proposal: row.proposal,
    snapshot: row.proposal.snapshotJson,
    viewOnly: true as const,
    canAccept: false as const,
    canPay: false as const,
  };
}

export async function revokeShareToken(prisma: PrismaClient, shareId: string) {
  return prisma.proposalShareToken.update({
    where: { id: shareId },
    data: { revokedAt: new Date() },
  });
}
