import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { uuidSchema } from "@skyarc/validation";
import { prisma } from "../../lib/prisma.js";
import { success } from "../../lib/response.js";
import { forbidden, notFound, validationError } from "../../lib/errors.js";
import { canReadLocations, canWriteCampaigns } from "../../lib/rbac.js";
import {
  assertCanAccessCampaign,
  assertCanMutateCampaign,
} from "../../lib/campaign-access.js";
import { requireTenantUnlessInternal, assertSameTenant } from "../../lib/tenant-context.js";
import {
  customerSafeScenarioBundle,
  generateScenarioBundle,
} from "../../lib/proposals/scenarios.js";

import {
  acceptProposalRevision,
  createProposalShareToken,
  issueProposalRevision,
  resolveShareToken,
  revokeShareToken,
  type ProposalSnapshot,
} from "../../lib/proposals/proposal.js";
import { buildProposalXlsx } from "../../lib/proposals/export-xlsx.js";
import { buildProposalPptx } from "../../lib/proposals/export-pptx.js";
import { buildMediaPlanPdf } from "../../lib/media-planning/export-pdf.js";
import { fromMinorUnits } from "../../lib/booking/money.js";

function sanitizeSnapshot(snapshot: ProposalSnapshot): ProposalSnapshot {
  return {
    ...snapshot,
    lines: snapshot.lines.map((l) => ({
      ...l,
      reason: l.reason.replace(/score\s+\d+/gi, "fit for brief"),
    })),
  };
}

const issueBodySchema = z.object({
  scenarioKind: z.enum(["COVERAGE", "CONCENTRATION"]),
  totalBudget: z.number().positive().optional(),
});

function serializeProposal(p: {
  id: string;
  campaignId: string;
  revisionNumber: number;
  status: string;
  scenarioKind: string;
  quoteRevisionId: string | null;
  currency: string;
  totalMinor: number;
  snapshotJson: unknown;
  assumptionsJson: unknown;
  expiresAt: Date;
  acceptedBookingId: string | null;
  acceptedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: p.id,
    campaignId: p.campaignId,
    revisionNumber: p.revisionNumber,
    status: p.status,
    scenarioKind: p.scenarioKind,
    quoteRevisionId: p.quoteRevisionId,
    currency: p.currency,
    totalMinor: p.totalMinor,
    total: fromMinorUnits(p.totalMinor, p.currency),
    snapshot: sanitizeSnapshot(p.snapshotJson as ProposalSnapshot),
    assumptions: p.assumptionsJson,
    expiresAt: p.expiresAt.toISOString(),
    acceptedBookingId: p.acceptedBookingId,
    acceptedAt: p.acceptedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}

export async function proposalRoutes(fastify: FastifyInstance) {
  fastify.post("/campaigns/:campaignId/scenarios", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canWriteCampaigns(request.user)) throw forbidden();
    const campaignId = uuidSchema.parse((request.params as { campaignId: string }).campaignId);
    await assertCanMutateCampaign(request.user, campaignId);
    const body = z.object({ totalBudget: z.number().positive().optional() }).parse(request.body ?? {});
    const bundle = await generateScenarioBundle(prisma, campaignId, { totalBudget: body.totalBudget });
    return success(customerSafeScenarioBundle(bundle));
  });

  fastify.post("/campaigns/:campaignId/proposals", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canWriteCampaigns(request.user)) throw forbidden();
    const campaignId = uuidSchema.parse((request.params as { campaignId: string }).campaignId);
    await assertCanMutateCampaign(request.user, campaignId);
    const tenantOrgId = requireTenantUnlessInternal(request.user);
    const body = issueBodySchema.parse(request.body);
    const bundle = await generateScenarioBundle(prisma, campaignId);
    const scenario = body.scenarioKind === "COVERAGE" ? bundle.coverage : bundle.concentration;
    if (!scenario) throw validationError("Selected scenario is unavailable");
    const result = await issueProposalRevision(prisma, {
      campaignId,
      scenario,
      evidenceLimitations: bundle.evidenceLimitations,
      tenantOrganizationId: tenantOrgId,
      actorUserId: request.user.id,
    });
    if ("error" in result) {
      const err = result.error ?? "Proposal issue failed";
      if (err === "PRICING_UNAVAILABLE") throw validationError("PRICING_UNAVAILABLE");
      throw validationError(err);
    }
    return success({ proposal: serializeProposal(result.proposal), quoteId: result.quote.id });
  });

  fastify.get("/campaigns/:campaignId/proposals", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canReadLocations(request.user)) throw forbidden();
    const campaignId = uuidSchema.parse((request.params as { campaignId: string }).campaignId);
    await assertCanAccessCampaign(request.user, campaignId);
    const rows = await prisma.proposalRevision.findMany({
      where: { campaignId },
      orderBy: { revisionNumber: "desc" },
      take: 50,
    });
    return success({ proposals: rows.map(serializeProposal) });
  });

  fastify.get("/proposals/:id", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canReadLocations(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const p = await prisma.proposalRevision.findUnique({ where: { id } });
    if (!p) throw notFound("Proposal not found");
    assertSameTenant(request.user, p.tenantOrganizationId);
    await assertCanAccessCampaign(request.user, p.campaignId);
    return success(serializeProposal(p));
  });

  fastify.post("/proposals/:id/accept", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canWriteCampaigns(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const body = z.object({ idempotencyKey: z.string().min(8).max(128).optional() }).parse(request.body ?? {});
    const existing = await prisma.proposalRevision.findUnique({ where: { id } });
    if (!existing) throw notFound("Proposal not found");
    assertSameTenant(request.user, existing.tenantOrganizationId);
    await assertCanMutateCampaign(request.user, existing.campaignId);
    const tenantOrgId = requireTenantUnlessInternal(request.user);
    const result = await acceptProposalRevision(prisma, {
      proposalId: id,
      actorUserId: request.user.id,
      tenantOrganizationId: tenantOrgId,
      idempotencyKey: body.idempotencyKey,
    });
    if ("error" in result && result.error) throw validationError(result.error);
    return success(result);
  });

  fastify.post("/proposals/:id/share", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canWriteCampaigns(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const body = z.object({ ttlHours: z.number().int().min(1).max(168).optional() }).parse(request.body ?? {});
    const p = await prisma.proposalRevision.findUnique({ where: { id } });
    if (!p) throw notFound("Proposal not found");
    await assertCanMutateCampaign(request.user, p.campaignId);
    const result = await createProposalShareToken(prisma, {
      proposalId: id,
      actorUserId: request.user.id,
      ttlHours: body.ttlHours,
    });
    if ("error" in result) throw validationError(result.error ?? "Share failed");
    return success({
      token: result.token,
      expiresAt: result.expiresAt.toISOString(),
      shareId: result.share.id,
      note: "Share links are view-only and do not authorize booking or payment.",
    });
  });

  fastify.post("/proposals/share/:shareId/revoke", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canWriteCampaigns(request.user)) throw forbidden();
    const shareId = uuidSchema.parse((request.params as { shareId: string }).shareId);
    const share = await prisma.proposalShareToken.findUnique({
      where: { id: shareId },
      include: { proposal: true },
    });
    if (!share) throw notFound("Share token not found");
    await assertCanMutateCampaign(request.user, share.proposal.campaignId);
    await revokeShareToken(prisma, shareId);
    return success({ revoked: true });
  });

  fastify.get("/public/proposals/share/:token", async (request) => {
    const token = z.string().min(16).parse((request.params as { token: string }).token);
    const result = await resolveShareToken(prisma, token);
    if ("error" in result) throw forbidden(result.error);
    return success({
      snapshot: sanitizeSnapshot(result.snapshot as ProposalSnapshot),
      status: result.proposal.status,
      revisionNumber: result.proposal.revisionNumber,
      viewOnly: true,
      canAccept: false,
      canPay: false,
    });
  });

  async function loadSnapshot(id: string, user: Parameters<typeof assertSameTenant>[0]) {
    const p = await prisma.proposalRevision.findUnique({ where: { id } });
    if (!p) throw notFound("Proposal not found");
    assertSameTenant(user, p.tenantOrganizationId);
    await assertCanAccessCampaign(user as never, p.campaignId);
    return sanitizeSnapshot(p.snapshotJson as ProposalSnapshot);
  }

  fastify.get("/proposals/:id/export/xlsx", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!canReadLocations(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const snapshot = await loadSnapshot(id, request.user);
    const buf = buildProposalXlsx(snapshot);
    return reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", `attachment; filename="proposal-${id.slice(0, 8)}.xlsx"`)
      .send(buf);
  });

  fastify.get("/proposals/:id/export/pptx", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!canReadLocations(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const snapshot = await loadSnapshot(id, request.user);
    const buf = buildProposalPptx(snapshot);
    return reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation")
      .header("Content-Disposition", `attachment; filename="proposal-${id.slice(0, 8)}.pptx"`)
      .send(buf);
  });

  fastify.get("/proposals/:id/export/pdf", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!canReadLocations(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const snapshot = await loadSnapshot(id, request.user);
    const pdf = await buildMediaPlanPdf({
      advertiserName: snapshot.advertiserName,
      campaignName: snapshot.campaignName,
      planName: `${snapshot.scenarioKind} proposal`,
      planLabel: "Customer proposal",
      startDate: snapshot.flight.start ? new Date(snapshot.flight.start) : null,
      endDate: snapshot.flight.end ? new Date(snapshot.flight.end) : null,
      generatedAt: new Date(),
      totalBudget: snapshot.totalCost,
      city: null,
      brief: null,
      items: snapshot.lines.map((l, idx) => ({
        rank: idx + 1,
        productCode: l.skyarcSiteCode ?? l.inventoryId.slice(0, 8),
        inventoryType: l.inventoryType ?? "CUSTOM",
        locationName: l.locationName,
        road: l.road,
        budgetAllocated: l.flightCost,
        listRate: l.listRate,
        planRate: l.flightCost,
        whyThisSite: l.reason,
      })),
    });
    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `attachment; filename="proposal-${id.slice(0, 8)}.pdf"`)
      .send(pdf);
  });
}
