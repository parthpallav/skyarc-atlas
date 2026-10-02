import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { uuidSchema } from "@skyarc/validation";
import { isInternalUser, isVendorUser } from "@skyarc/shared";
import { prisma } from "../../lib/prisma.js";
import { success } from "../../lib/response.js";
import { forbidden, notFound, validationError } from "../../lib/errors.js";
import { canReadLocations, canWriteCampaigns } from "../../lib/rbac.js";
import {
  assertCanAccessCampaign,
  assertCanMutateCampaign,
} from "../../lib/campaign-access.js";
import { assertSameTenant, requireTenantUnlessInternal } from "../../lib/tenant-context.js";
import {
  createInvoiceDraftFromBooking,
  customerSafeInvoice,
  issueInvoice,
  voidInvoice,
} from "../../lib/billing/invoice.js";
import {
  createInvoicePaymentIntent,
  issueCreditNote,
  recordManualPayment,
} from "../../lib/billing/payments.js";
import {
  approveVendorPo,
  campaignCommercialPerformance,
  createVendorPo,
  upsertCampaignExpense,
} from "../../lib/billing/vendor-costs.js";
import { createTallyFileExport } from "../../lib/billing/tally-adapter.js";
import { enqueueReminder, serializeReminder } from "../../lib/billing/reminders.js";
import { campaignBillingReport } from "../../lib/billing/reporting.js";

export async function billingRoutes(fastify: FastifyInstance) {
  fastify.post("/bookings/:id/invoices", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canWriteCampaigns(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const booking = await prisma.booking.findUnique({ where: { id } });
    if (!booking) throw notFound("Booking not found");
    assertSameTenant(request.user, booking.tenantOrganizationId);
    await assertCanMutateCampaign(request.user, booking.campaignId);
    const body = z
      .object({
        paymentTerms: z.string().max(120).optional(),
        dueInDays: z.number().int().min(1).max(180).optional(),
        taxRateBps: z.number().int().min(0).max(5000).optional(),
      })
      .parse(request.body ?? {});
    const result = await createInvoiceDraftFromBooking(prisma, {
      bookingId: id,
      actorUserId: request.user.id,
      ...body,
    });
    if ("error" in result) throw validationError(result.error ?? "Request failed");
    return success({ invoice: customerSafeInvoice(result.invoice) });
  });

  fastify.get("/campaigns/:campaignId/invoices", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canReadLocations(request.user) || isVendorUser(request.user)) throw forbidden();
    const campaignId = uuidSchema.parse((request.params as { campaignId: string }).campaignId);
    await assertCanAccessCampaign(request.user, campaignId);
    const rows = await prisma.invoice.findMany({
      where: { campaignId },
      include: { lines: true },
      orderBy: { createdAt: "desc" },
    });
    return success({ invoices: rows.map(customerSafeInvoice) });
  });

  fastify.get("/invoices/:id", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canReadLocations(request.user) || isVendorUser(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const inv = await prisma.invoice.findUnique({
      where: { id },
      include: { lines: true, payments: true, creditNotes: true },
    });
    if (!inv) throw notFound("Invoice not found");
    assertSameTenant(request.user, inv.tenantOrganizationId);
    await assertCanAccessCampaign(request.user, inv.campaignId);
    return success({
      invoice: customerSafeInvoice(inv),
      payments: inv.payments.map((p) => ({
        id: p.id,
        amountMinor: p.amountMinor,
        method: p.method,
        status: p.status,
        reference: p.reference,
        recordedAt: p.recordedAt.toISOString(),
        providerConfirmed: p.method === "PROVIDER" && p.status === "RECONCILED",
      })),
      creditNotes: inv.creditNotes.map((c) => ({
        id: c.id,
        creditNumber: c.creditNumber,
        amountMinor: c.amountMinor,
        status: c.status,
        reason: c.reason,
      })),
    });
  });

  fastify.post("/invoices/:id/issue", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canWriteCampaigns(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const inv = await prisma.invoice.findUnique({ where: { id } });
    if (!inv) throw notFound("Invoice not found");
    assertSameTenant(request.user, inv.tenantOrganizationId);
    await assertCanMutateCampaign(request.user, inv.campaignId);
    const result = await issueInvoice(prisma, id, request.user.id);
    if ("error" in result) throw validationError(result.error ?? "Request failed");
    return success({ invoice: customerSafeInvoice(result.invoice) });
  });

  fastify.post("/invoices/:id/void", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canWriteCampaigns(request.user) || !isInternalUser(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const result = await voidInvoice(prisma, id);
    if ("error" in result) throw validationError(result.error ?? "Request failed");
    return success({ invoice: customerSafeInvoice(result.invoice as never) });
  });

  fastify.post("/invoices/:id/payments", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canWriteCampaigns(request.user) || !isInternalUser(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const body = z
      .object({
        amountMinor: z.number().int().positive(),
        reference: z.string().min(2).max(120),
        note: z.string().max(500).optional(),
        idempotencyKey: z.string().min(8).max(128).optional(),
      })
      .parse(request.body);
    const inv = await prisma.invoice.findUnique({ where: { id } });
    if (!inv) throw notFound("Invoice not found");
    assertSameTenant(request.user, inv.tenantOrganizationId);
    const result = await recordManualPayment(prisma, {
      invoiceId: id,
      amountMinor: body.amountMinor,
      reference: body.reference,
      actorUserId: request.user.id,
      note: body.note,
      idempotencyKey: body.idempotencyKey,
    });
    if ("error" in result) throw validationError(result.error ?? "Request failed");
    return success({
      payment: result.payment,
      outstandingMinor: result.outstandingMinor,
      providerConfirmed: false,
      invoice: customerSafeInvoice(result.invoice as never),
      idempotent: result.idempotent,
    });
  });

  fastify.post("/invoices/:id/payment-intent", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canWriteCampaigns(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const inv = await prisma.invoice.findUnique({ where: { id } });
    if (!inv) throw notFound("Invoice not found");
    assertSameTenant(request.user, inv.tenantOrganizationId);
    await assertCanAccessCampaign(request.user, inv.campaignId);
    const due = Math.max(0, inv.totalMinor - inv.amountPaidMinor - inv.amountCreditedMinor);
    const result = await createInvoicePaymentIntent(id, due, inv.currency);
    return success({
      ...result,
      note:
        result.status === "UNAVAILABLE"
          ? "Live payment integration pending credentials — not production-ready."
          : undefined,
    });
  });

  fastify.post("/invoices/:id/credit-notes", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canWriteCampaigns(request.user) || !isInternalUser(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const body = z
      .object({
        amountMinor: z.number().int().positive(),
        reason: z.string().min(3).max(500),
        apply: z.boolean().optional(),
      })
      .parse(request.body);
    const result = await issueCreditNote(prisma, {
      invoiceId: id,
      amountMinor: body.amountMinor,
      reason: body.reason,
      actorUserId: request.user.id,
      apply: body.apply,
    });
    if ("error" in result) throw validationError(result.error ?? "Request failed");
    return success(result);
  });

  // Vendor costs — staff only
  fastify.post("/campaigns/:campaignId/vendor-pos", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!isInternalUser(request.user)) throw forbidden();
    const campaignId = uuidSchema.parse((request.params as { campaignId: string }).campaignId);
    await assertCanMutateCampaign(request.user, campaignId);
    const tenantOrgId = requireTenantUnlessInternal(request.user);
    const body = z
      .object({
        vendorOrganizationId: z.string().uuid(),
        expectedCostMinor: z.number().int().min(0),
        poNumber: z.string().max(64).optional(),
        notes: z.string().max(500).optional(),
      })
      .parse(request.body);
    return success(
      await createVendorPo(prisma, {
        campaignId,
        tenantOrganizationId: tenantOrgId,
        actorUserId: request.user.id,
        ...body,
      })
    );
  });

  fastify.post("/vendor-pos/:id/approve", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!isInternalUser(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const body = z.object({ commitmentMinor: z.number().int().min(0) }).parse(request.body);
    const result = await approveVendorPo(prisma, id, body.commitmentMinor);
    if ("error" in result) throw validationError(result.error ?? "Request failed");
    return success(result);
  });

  fastify.post("/campaigns/:campaignId/expenses", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!isInternalUser(request.user)) throw forbidden();
    const campaignId = uuidSchema.parse((request.params as { campaignId: string }).campaignId);
    await assertCanMutateCampaign(request.user, campaignId);
    const tenantOrgId = requireTenantUnlessInternal(request.user);
    const body = z
      .object({
        attributionKey: z.string().min(2).max(120),
        label: z.string().min(2).max(200),
        expectedMinor: z.number().int().min(0).optional(),
        committedMinor: z.number().int().min(0).optional(),
        incurredMinor: z.number().int().min(0).optional(),
        paidMinor: z.number().int().min(0).optional(),
        costMissing: z.boolean().optional(),
        status: z.enum(["EXPECTED", "COMMITTED", "INCURRED", "PAID", "VOID"]).optional(),
        purchaseOrderId: z.string().uuid().optional(),
      })
      .parse(request.body);
    const result = await upsertCampaignExpense(prisma, {
      campaignId,
      tenantOrganizationId: tenantOrgId,
      ...body,
    });
    if ("error" in result) throw validationError(result.error ?? "Request failed");
    return success(result);
  });

  fastify.get("/campaigns/:campaignId/reports/billing", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canReadLocations(request.user)) throw forbidden();
    const campaignId = uuidSchema.parse((request.params as { campaignId: string }).campaignId);
    await assertCanAccessCampaign(request.user, campaignId);
    const staff = isInternalUser(request.user);
    return success(await campaignBillingReport(prisma, campaignId, staff));
  });

  fastify.get("/campaigns/:campaignId/reports/commercial", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!isInternalUser(request.user)) throw forbidden();
    const campaignId = uuidSchema.parse((request.params as { campaignId: string }).campaignId);
    await assertCanAccessCampaign(request.user, campaignId);
    return success(await campaignCommercialPerformance(prisma, campaignId));
  });

  fastify.post("/accounting/tally/export", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!isInternalUser(request.user)) throw forbidden();
    const tenantOrgId = requireTenantUnlessInternal(request.user);
    if (!tenantOrgId) throw validationError("Tenant organization required");
    const body = z
      .object({
        invoiceIds: z.array(z.string().uuid()).min(1).max(100),
        liveSync: z.boolean().optional(),
      })
      .parse(request.body);
    const result = await createTallyFileExport(prisma, {
      tenantOrganizationId: tenantOrgId,
      invoiceIds: body.invoiceIds,
      liveSync: body.liveSync,
    });
    return success(result);
  });

  fastify.post("/reminders", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canWriteCampaigns(request.user)) throw forbidden();
    const body = z
      .object({
        campaignId: z.string().uuid().optional(),
        kind: z.enum(["TASK_DEADLINE", "MISSING_PROOF", "OVERDUE_INVOICE", "OTHER"]),
        dueAt: z.string().datetime(),
        payload: z.record(z.unknown()).optional(),
      })
      .parse(request.body);
    if (body.campaignId) await assertCanMutateCampaign(request.user, body.campaignId);
    const tenantOrgId = requireTenantUnlessInternal(request.user);
    const result = await enqueueReminder(prisma, {
      tenantOrganizationId: tenantOrgId,
      campaignId: body.campaignId,
      kind: body.kind,
      dueAt: new Date(body.dueAt),
      payload: body.payload ?? {},
    });
    return success({
      reminder: serializeReminder(result.job),
      delivered: false,
      note: result.note,
    });
  });
}
