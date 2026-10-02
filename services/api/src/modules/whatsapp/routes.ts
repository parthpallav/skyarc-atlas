import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { success } from "../../lib/response.js";
import { forbidden, validationError } from "../../lib/errors.js";
import { assertSameTenant, requireTenantUnlessInternal } from "../../lib/tenant-context.js";
import {
  completeWhatsAppLink,
  createWhatsAppLinkChallenge,
  resolveLinkedUser,
  revokeWhatsAppLink,
} from "../../lib/whatsapp/account-link.js";
import {
  consumeActionConfirmation,
  createActionConfirmation,
} from "../../lib/whatsapp/confirmations.js";
import { acceptQuoteRevision } from "../../lib/booking/quote-revision.js";

export async function whatsappRoutes(fastify: FastifyInstance) {
  fastify.post("/whatsapp/link/challenges", { preHandler: [fastify.authenticate] }, async (request) => {
    const body = z
      .object({
        phoneE164: z.string().min(8).max(20),
        ttlMinutes: z.number().int().min(5).max(120).optional(),
      })
      .parse(request.body);
    const tenantOrgId = requireTenantUnlessInternal(request.user);
    if (!tenantOrgId) throw validationError("Tenant organization required for WhatsApp linking");
    const result = await createWhatsAppLinkChallenge(prisma, {
      userId: request.user.id,
      tenantOrganizationId: tenantOrgId,
      phoneE164: body.phoneE164,
      actorUserId: request.user.id,
      ttlMinutes: body.ttlMinutes,
    });
    if ("error" in result) throw validationError(result.error ?? "Request failed");
    return success(result);
  });

  /** Completes link after Pulse/Bridge verifies the inbound WhatsApp identity. Service or user auth. */
  fastify.post("/whatsapp/link/complete", { preHandler: [fastify.authenticate] }, async (request) => {
    const body = z
      .object({
        token: z.string().min(16),
        verifiedPhoneE164: z.string().min(8).max(20),
      })
      .parse(request.body);
    const result = await completeWhatsAppLink(prisma, body);
    if ("error" in result) throw validationError(result.error ?? "Request failed");
    return success({
      link: {
        id: result.link.id,
        userId: result.link.userId,
        tenantOrganizationId: result.link.tenantOrganizationId,
        phoneE164: result.link.phoneE164,
        verifiedAt: result.link.verifiedAt.toISOString(),
      },
    });
  });

  fastify.post("/whatsapp/link/:id/revoke", { preHandler: [fastify.authenticate] }, async (request) => {
    const id = z.string().uuid().parse((request.params as { id: string }).id);
    const result = await revokeWhatsAppLink(prisma, id, request.user.id);
    if ("error" in result) throw forbidden(result.error);
    return success({ revoked: true });
  });

  fastify.get("/whatsapp/link/resolve", { preHandler: [fastify.authenticate] }, async (request) => {
    const phone = z.string().min(8).parse((request.query as { phoneE164?: string }).phoneE164);
    const result = await resolveLinkedUser(prisma, phone);
    if ("error" in result) throw validationError(result.error ?? "Request failed");
    return success({
      userId: result.link.userId,
      tenantOrganizationId: result.link.tenantOrganizationId,
      linkId: result.link.id,
    });
  });

  fastify.post("/whatsapp/confirmations", { preHandler: [fastify.authenticate] }, async (request) => {
    const body = z
      .object({
        action: z.enum([
          "RESERVE_INVENTORY",
          "ACCEPT_QUOTE",
          "AMEND_BOOKING",
          "CANCEL_BOOKING",
          "VENDOR_APPROVE",
        ]),
        payload: z.record(z.unknown()),
        ttlMinutes: z.number().int().min(5).max(60).optional(),
      })
      .parse(request.body);
    const tenantOrgId = requireTenantUnlessInternal(request.user);
    const result = await createActionConfirmation(prisma, {
      userId: request.user.id,
      tenantOrganizationId: tenantOrgId,
      action: body.action,
      payload: body.payload as Record<string, unknown>,
      ttlMinutes: body.ttlMinutes,
    });
    return success({
      ...result,
      expiresAt: result.expiresAt.toISOString(),
      note: "Reply CONFIRM <token> or use web handoff before expiry. Duplicates will not re-run.",
    });
  });

  fastify.post("/whatsapp/confirmations/execute", { preHandler: [fastify.authenticate] }, async (request) => {
    const body = z
      .object({
        token: z.string().min(16),
        action: z.enum([
          "RESERVE_INVENTORY",
          "ACCEPT_QUOTE",
          "AMEND_BOOKING",
          "CANCEL_BOOKING",
          "VENDOR_APPROVE",
        ]),
      })
      .parse(request.body);

    const consumed = await consumeActionConfirmation(prisma, {
      token: body.token,
      expectedAction: body.action,
    });
    if ("error" in consumed) {
      if (consumed.error === "Confirmation already used" && "idempotentKey" in consumed) {
        return success({
          idempotent: true,
          note: "Confirmation already consumed — action was not repeated",
        });
      }
      throw validationError(consumed.error ?? "Confirmation failed");
    }

    if (consumed.confirmation.userId !== request.user.id) {
      throw forbidden("Confirmation belongs to a different user");
    }
    const confirmTenant = consumed.confirmation.tenantOrganizationId;
    if (confirmTenant) {
      assertSameTenant(request.user, confirmTenant);
    }

    const payload = consumed.payload;
    if (body.action === "ACCEPT_QUOTE" || body.action === "RESERVE_INVENTORY") {
      const quoteId = String(payload.quoteId ?? "");
      if (!quoteId) throw validationError("Confirmation payload missing quoteId");
      // Bind to exact quote revision from confirmation payload — not client-supplied
      if (payload.atlasUserId && String(payload.atlasUserId) !== request.user.id) {
        throw forbidden("Confirmation user mismatch");
      }
      const tenantOrgId = requireTenantUnlessInternal(request.user);
      const accept = await acceptQuoteRevision(prisma, {
        quoteId,
        actorUserId: request.user.id,
        tenantOrganizationId: tenantOrgId,
        idempotencyKey: `wa-confirm:${consumed.confirmation.id}`,
        mode: "book",
      });
      if ("error" in accept && accept.error) throw validationError(String(accept.error));
      return success({
        executed: body.action,
        bookingId: "booking" in accept ? accept.booking?.id : null,
        quoteId,
        revalidated: true,
        idempotent: "idempotent" in accept ? Boolean(accept.idempotent) : false,
      });
    }

    return success({
      executed: body.action,
      note: "Action recorded; specialized handlers for amend/cancel/vendor can attach here",
      payload,
    });
  });
}
