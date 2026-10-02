import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { uuidSchema } from "@skyarc/validation";
import { isInternalUser } from "@skyarc/shared";
import { prisma } from "../../lib/prisma.js";
import { success } from "../../lib/response.js";
import { forbidden, notFound, validationError } from "../../lib/errors.js";
import { canReadLocations, canWriteCampaigns } from "../../lib/rbac.js";
import {
  assertCanAccessCampaign,
  assertCanMutateCampaign,
} from "../../lib/campaign-access.js";
import { assertSameTenant, requireTenantUnlessInternal } from "../../lib/tenant-context.js";
import { seedExecutionTasksForBooking } from "../../lib/ops/seed-tasks.js";
import {
  computeCampaignReadiness,
  transitionExecutionTask,
} from "../../lib/ops/task-transitions.js";
import {
  resolveAuthorizedCreativeAsset,
  resolveAuthorizedProofAsset,
  bindAssetToCampaign,
} from "../../lib/ops/authorized-assets.js";
import {
  approveCreative,
  createCreativeVersion,
  customerSafeCreative,
  recordCmsHandoff,
  rejectCreative,
  submitCreative,
} from "../../lib/ops/creative.js";
import {
  createProofRecord,
  customerSafeProof,
  reviewProof,
} from "../../lib/ops/proof.js";
import { campaignOpsReport } from "../../lib/billing/reporting.js";
import { customerProgressView } from "../../lib/billing/reporting.js";
import { outstandingMinor } from "../../lib/billing/invoice.js";

export async function opsRoutes(fastify: FastifyInstance) {
  fastify.post("/bookings/:id/execution/seed", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canWriteCampaigns(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const booking = await prisma.booking.findUnique({ where: { id } });
    if (!booking) throw notFound("Booking not found");
    assertSameTenant(request.user, booking.tenantOrganizationId);
    await assertCanMutateCampaign(request.user, booking.campaignId);
    const result = await seedExecutionTasksForBooking(prisma, id, {
      actorUserId: request.user.id,
    });
    if ("error" in result) throw validationError(result.error ?? "Request failed");
    return success(result);
  });

  fastify.get("/bookings/:id/execution/tasks", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canReadLocations(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const booking = await prisma.booking.findUnique({ where: { id } });
    if (!booking) throw notFound("Booking not found");
    assertSameTenant(request.user, booking.tenantOrganizationId);
    await assertCanAccessCampaign(request.user, booking.campaignId);
    const tasks = await prisma.executionTask.findMany({
      where: { bookingId: id },
      include: { history: { orderBy: { createdAt: "desc" }, take: 20 } },
      orderBy: [{ bookingItemId: "asc" }, { sortOrder: "asc" }],
    });
    return success({
      tasks,
      campaignLifecycleNote: "Task seeding does not mark the campaign live.",
    });
  });

  fastify.patch("/execution-tasks/:id", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canWriteCampaigns(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const body = z
      .object({
        status: z.enum([
          "PENDING",
          "READY",
          "IN_PROGRESS",
          "BLOCKED",
          "DONE",
          "SKIPPED",
          "CANCELLED",
        ]),
        note: z.string().max(500).optional(),
        blockedReason: z.string().max(500).optional(),
        ownerUserId: z.string().uuid().nullable().optional(),
        checklistJson: z.array(z.object({ label: z.string(), done: z.boolean() })).optional(),
      })
      .parse(request.body ?? {});
    const task = await prisma.executionTask.findUnique({ where: { id } });
    if (!task) throw notFound("Task not found");
    assertSameTenant(request.user, task.tenantOrganizationId);
    await assertCanMutateCampaign(request.user, task.campaignId);
    const result = await transitionExecutionTask(prisma, {
      taskId: id,
      toStatus: body.status,
      actorUserId: request.user.id,
      note: body.note,
      blockedReason: body.blockedReason,
      ownerUserId: body.ownerUserId,
      checklistJson: body.checklistJson,
    });
    if ("error" in result) throw validationError(result.error ?? "Request failed");
    return success(result);
  });

  fastify.get("/campaigns/:campaignId/readiness", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canReadLocations(request.user)) throw forbidden();
    const campaignId = uuidSchema.parse((request.params as { campaignId: string }).campaignId);
    await assertCanAccessCampaign(request.user, campaignId);
    return success(await computeCampaignReadiness(prisma, campaignId));
  });

  fastify.get("/campaigns/:campaignId/progress", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canReadLocations(request.user)) throw forbidden();
    const campaignId = uuidSchema.parse((request.params as { campaignId: string }).campaignId);
    await assertCanAccessCampaign(request.user, campaignId);
    const ops = await campaignOpsReport(prisma, campaignId);
    const creatives = await prisma.creativeVersion.count({
      where: { campaignId, status: "APPROVED" },
    });
    const invoices = await prisma.invoice.findMany({
      where: { campaignId, status: { in: ["ISSUED", "PARTIALLY_PAID", "PAID"] } },
      select: {
        invoiceNumber: true,
        status: true,
        totalMinor: true,
        amountPaidMinor: true,
        amountCreditedMinor: true,
      },
    });
    return success(
      customerProgressView({
        readiness: ops.readiness,
        proof: ops.proof,
        approvedCreatives: creatives,
        invoices: invoices.map((i) => ({
          invoiceNumber: i.invoiceNumber,
          status: i.status,
          totalMinor: i.totalMinor,
          amountPaidMinor: i.amountPaidMinor,
          outstandingMinor: outstandingMinor(i),
        })),
      })
    );
  });

  // --- Creatives ---
  fastify.post("/campaigns/:campaignId/creatives", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canWriteCampaigns(request.user)) throw forbidden();
    const campaignId = uuidSchema.parse((request.params as { campaignId: string }).campaignId);
    await assertCanMutateCampaign(request.user, campaignId);
    const tenantOrgId = requireTenantUnlessInternal(request.user);
    const body = z
      .object({
        label: z.string().max(200).optional(),
        /** Must reference a server-owned UPLOADED LocationAsset — raw r2Key rejected. */
        locationAssetId: z.string().uuid(),
        bookingItemIds: z.array(z.string().uuid()).optional(),
        digital: z.boolean().optional(),
      })
      .parse(request.body);

    const authorized = await resolveAuthorizedCreativeAsset(prisma, request.user, {
      campaignId,
      locationAssetId: body.locationAssetId,
      bookingItemIds: body.bookingItemIds,
    });
    if (!authorized.ok) throw forbidden(authorized.error);

    const asset = authorized.asset;
    const result = await createCreativeVersion(prisma, {
      campaignId,
      tenantOrganizationId: tenantOrgId,
      label: body.label,
      locationAssetId: asset.id,
      r2Key: asset.r2Key,
      contentType: asset.contentType,
      byteSize: asset.byteSize,
      checksumSha256: asset.checksumSha256,
      widthPx: asset.width,
      heightPx: asset.height,
      durationMs: asset.durationMs,
      bookingItemIds: body.bookingItemIds,
      digital: body.digital,
      actorUserId: request.user.id,
    });
    if ("error" in result) throw validationError(result.error ?? "Request failed");
    await bindAssetToCampaign(prisma, asset.id, campaignId);
    return success({ creative: customerSafeCreative(result.creative) });
  });

  fastify.get("/campaigns/:campaignId/creatives", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canReadLocations(request.user)) throw forbidden();
    const campaignId = uuidSchema.parse((request.params as { campaignId: string }).campaignId);
    await assertCanAccessCampaign(request.user, campaignId);
    const rows = await prisma.creativeVersion.findMany({
      where: { campaignId },
      orderBy: { revisionNumber: "desc" },
    });
    const staff = isInternalUser(request.user);
    return success({
      creatives: rows.map((c) =>
        staff
          ? { ...customerSafeCreative(c), r2Key: c.r2Key, cmsHandoffNote: c.cmsHandoffNote }
          : customerSafeCreative(c)
      ),
    });
  });

  fastify.post("/creatives/:id/submit", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canWriteCampaigns(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const c = await prisma.creativeVersion.findUnique({ where: { id } });
    if (!c) throw notFound("Creative not found");
    await assertCanMutateCampaign(request.user, c.campaignId);
    const result = await submitCreative(prisma, id, request.user.id);
    if ("error" in result) throw validationError(result.error ?? "Request failed");
    return success({ creative: customerSafeCreative(result.creative) });
  });

  fastify.post("/creatives/:id/approve", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canWriteCampaigns(request.user) || !isInternalUser(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const c = await prisma.creativeVersion.findUnique({ where: { id } });
    if (!c) throw notFound("Creative not found");
    const result = await approveCreative(prisma, id, request.user.id);
    if ("error" in result) throw validationError(result.error ?? "Request failed");
    return success({ creative: customerSafeCreative(result.creative) });
  });

  fastify.post("/creatives/:id/reject", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canWriteCampaigns(request.user) || !isInternalUser(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const body = z.object({ reason: z.string().min(3).max(500) }).parse(request.body);
    const c = await prisma.creativeVersion.findUnique({ where: { id } });
    if (!c) throw notFound("Creative not found");
    const result = await rejectCreative(prisma, id, body.reason, request.user.id);
    if ("error" in result) throw validationError(result.error ?? "Request failed");
    return success({ creative: customerSafeCreative(result.creative) });
  });

  fastify.post("/creatives/:id/cms-handoff", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canWriteCampaigns(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const body = z
      .object({
        status: z.enum(["MANUAL_SENT", "CONFIRMED_EXTERNAL", "FAILED"]),
        note: z.string().max(500).optional(),
      })
      .parse(request.body);
    const c = await prisma.creativeVersion.findUnique({ where: { id } });
    if (!c) throw notFound("Creative not found");
    await assertCanMutateCampaign(request.user, c.campaignId);
    const result = await recordCmsHandoff(prisma, id, body);
    if ("error" in result) throw validationError(result.error ?? "Request failed");
    return success(result);
  });

  // --- Proof ---
  fastify.post("/campaigns/:campaignId/proofs", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canWriteCampaigns(request.user)) throw forbidden();
    const campaignId = uuidSchema.parse((request.params as { campaignId: string }).campaignId);
    await assertCanMutateCampaign(request.user, campaignId);
    const tenantOrgId = requireTenantUnlessInternal(request.user);
    const body = z
      .object({
        locationId: z.string().uuid(),
        locationAssetId: z.string().uuid(),
        bookingId: z.string().uuid().optional(),
        bookingItemId: z.string().uuid().optional(),
        executionTaskId: z.string().uuid().optional(),
        kind: z.enum(["PRE_MOUNT", "LIVE_ON_SITE", "MID_FLIGHT", "POST_REMOVAL", "OTHER"]).optional(),
        capturedAt: z.string().datetime().optional(),
        capturedLat: z.number().optional(),
        capturedLng: z.number().optional(),
        capturedAccuracyM: z.number().optional(),
        replacesProofId: z.string().uuid().optional(),
        provenanceNote: z.string().max(500).optional(),
      })
      .parse(request.body);

    const authorized = await resolveAuthorizedProofAsset(prisma, request.user, {
      campaignId,
      locationId: body.locationId,
      locationAssetId: body.locationAssetId,
      bookingItemId: body.bookingItemId,
      executionTaskId: body.executionTaskId,
    });
    if (!authorized.ok) throw forbidden(authorized.error);

    const result = await createProofRecord(prisma, {
      tenantOrganizationId: tenantOrgId,
      campaignId,
      locationId: body.locationId,
      locationAssetId: body.locationAssetId,
      bookingId: body.bookingId,
      bookingItemId: body.bookingItemId,
      executionTaskId: body.executionTaskId,
      kind: body.kind,
      capturedAt: body.capturedAt ? new Date(body.capturedAt) : null,
      capturedLat: body.capturedLat,
      capturedLng: body.capturedLng,
      capturedAccuracyM: body.capturedAccuracyM,
      submitterUserId: request.user.id,
      replacesProofId: body.replacesProofId,
      provenanceNote: body.provenanceNote,
    });
    if ("error" in result) throw validationError(result.error ?? "Proof create failed");
    await bindAssetToCampaign(prisma, authorized.asset.id, campaignId);
    return success({ proof: customerSafeProof(result.proof) });
  });

  fastify.get("/campaigns/:campaignId/proofs", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canReadLocations(request.user)) throw forbidden();
    const campaignId = uuidSchema.parse((request.params as { campaignId: string }).campaignId);
    await assertCanAccessCampaign(request.user, campaignId);
    const staff = isInternalUser(request.user);
    const rows = await prisma.proofRecord.findMany({
      where: staff
        ? { campaignId }
        : { campaignId, reviewStatus: "APPROVED" },
      orderBy: { uploadedAt: "desc" },
      take: 100,
    });
    return success({
      proofs: rows.map(customerSafeProof),
      note: "Approved evidence only in customer view. GPS/timestamps are supplied evidence.",
    });
  });

  fastify.post("/proofs/:id/review", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canWriteCampaigns(request.user) || !isInternalUser(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const body = z
      .object({
        decision: z.enum(["APPROVED", "REJECTED"]),
        rejectReason: z.string().max(500).optional(),
      })
      .parse(request.body);
    const result = await reviewProof(prisma, {
      proofId: id,
      decision: body.decision,
      actorUserId: request.user.id,
      rejectReason: body.rejectReason,
    });
    if ("error" in result) throw validationError(result.error ?? "Request failed");
    return success(result);
  });
}
