import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fjwt from "@fastify/jwt";
import { z } from "zod";
import type { PulseEnv } from "./env.js";
import { prisma } from "./prisma.js";
import { fetchMediaPlan, fetchMediaPlanPdf } from "./lib/atlas-client.js";
import { buildMediaPlanWorkbook, buildShareSummaryText } from "./lib/excel-export.js";
import { sendWhatsAppViaBridge } from "./lib/bridge-client.js";
import {
  advanceConversation,
  customerSafeStatusReply,
  explainServiceLimitation,
  newConversationState,
  type ConversationState,
} from "./lib/conversation.js";
import { defaultAtlasClient, type AtlasOrchestrationClient } from "./lib/atlas-client.js";

type PulseUser = {
  id: string;
  email?: string;
  role?: string;
  organizationId?: string | null;
};

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: PulseUser;
    user: PulseUser;
  }
}

declare module "fastify" {
  interface FastifyRequest {
    user: PulseUser;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

function unauthorized(): Error & { statusCode: number } {
  const err = new Error("Unauthorized") as Error & { statusCode: number };
  err.statusCode = 401;
  return err;
}

const exportQuerySchema = z.object({
  campaignId: z.string().uuid(),
});

const shareBodySchema = z.object({
  campaignId: z.string().uuid(),
  toE164: z.string().min(8).max(20),
  includePdf: z.boolean().optional().default(false),
});

function bearerToken(request: FastifyRequest): string {
  const header = String(request.headers.authorization ?? "");
  if (!header.startsWith("Bearer ")) throw unauthorized();
  return header.slice(7);
}

export async function buildPulseApp(
  env: PulseEnv,
  opts?: { atlasClient?: AtlasOrchestrationClient }
) {
  const atlasClient = opts?.atlasClient ?? defaultAtlasClient;
  const app = Fastify({ logger: true });
  await app.register(helmet);
  await app.register(rateLimit, { max: 200, timeWindow: "1 minute" });
  await app.register(fjwt, { secret: env.JWT_ACCESS_SECRET });

  app.decorate("authenticate", async (request: FastifyRequest) => {
    try {
      await request.jwtVerify();
    } catch {
      throw unauthorized();
    }
  });

  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply: FastifyReply) => {
    const status = err.statusCode ?? 500;
    reply.status(status).send({ error: { message: err.message } });
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "pulse",
    quoteOrchestration: "atlas_authoritative",
  }));

  app.post(
    "/v1/media-plans/:planId/export/xlsx",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const planId = z.string().uuid().parse((request.params as { planId: string }).planId);
      const { campaignId } = exportQuerySchema.parse(request.query ?? {});
      const user = request.user;
      const token = bearerToken(request);

      const plan = await fetchMediaPlan(env, campaignId, planId, token);
      const buffer = await buildMediaPlanWorkbook(plan);

      await prisma.exportArtifact.create({
        data: {
          planId,
          campaignId,
          kind: "xlsx",
          createdByUserId: user.id,
        },
      });

      const filename = `${plan.name.replace(/[^\w\s-]/g, "").slice(0, 60) || "media-plan"}.xlsx`;
      reply
        .header(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        .header("Content-Disposition", `attachment; filename="${filename}"`);
      return reply.send(buffer);
    }
  );

  app.post(
    "/v1/media-plans/:planId/share/whatsapp",
    { preHandler: [app.authenticate] },
    async (request) => {
      const planId = z.string().uuid().parse((request.params as { planId: string }).planId);
      const body = shareBodySchema.parse(request.body ?? {});
      const user = request.user;
      const token = bearerToken(request);

      const job = await prisma.shareJob.create({
        data: {
          campaignId: body.campaignId,
          planId,
          channel: "whatsapp",
          toE164: body.toE164,
          status: "pending",
          createdByUserId: user.id,
        },
      });

      try {
        const plan = await fetchMediaPlan(env, body.campaignId, planId, token);
        const text = buildShareSummaryText(plan, env.WEB_APP_URL);

        let documentBase64: string | undefined;
        if (body.includePdf) {
          const pdf = await fetchMediaPlanPdf(env, body.campaignId, planId, token);
          documentBase64 = pdf.toString("base64");
        }

        const bridgeResult = await sendWhatsAppViaBridge(env, {
          toE164: body.toE164,
          text,
          documentBase64,
          documentFilename: `${plan.name.slice(0, 40).replace(/[^\w\s-]/g, "") || "plan"}.pdf`,
        });

        const updated = await prisma.shareJob.update({
          where: { id: job.id },
          data: {
            status: bridgeResult.dryRun ? "dry_run" : "sent",
            bridgeMessageId: bridgeResult.id,
          },
        });

        return {
          job: {
            id: updated.id,
            status: updated.status,
            channel: updated.channel,
            toE164: updated.toE164,
            bridgeMessageId: updated.bridgeMessageId,
          },
          dryRun: bridgeResult.dryRun ?? false,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Share failed";
        await prisma.shareJob.update({
          where: { id: job.id },
          data: { status: "failed", error: message },
        });
        throw err;
      }
    }
  );

  app.get(
    "/v1/share-jobs/:id",
    { preHandler: [app.authenticate] },
    async (request) => {
      const id = z.string().uuid().parse((request.params as { id: string }).id);
      const job = await prisma.shareJob.findUnique({ where: { id } });
      if (!job) {
        const err = new Error("Share job not found") as Error & { statusCode: number };
        err.statusCode = 404;
        throw err;
      }
      if (job.createdByUserId !== request.user.id) {
        throw unauthorized();
      }
      return { job };
    }
  );

  /**
   * Inbound WhatsApp turn — requires prior Atlas link + campaign binding.
   * Executes real Atlas scenario → proposal/quote → confirmation → accept/reserve.
   * Meta transport may be mocked; Atlas pricing/reservation must not be mocked in integration.
   */
  app.post("/v1/whatsapp/inbound", { preHandler: [app.authenticate] }, async (request) => {
    const body = z
      .object({
        phoneE164: z.string().min(8).max(20),
        text: z.string().max(4000),
        atlasUserId: z.string().uuid().optional(),
        tenantOrganizationId: z.string().uuid().optional(),
        /** Required for quote orchestration — Atlas campaign with flight dates */
        campaignId: z.string().uuid().optional(),
      })
      .parse(request.body);

    if (!body.atlasUserId || !body.tenantOrganizationId) {
      return {
        reply: customerSafeStatusReply(newConversationState()),
        phase: "AWAIT_LINK",
        note: "Phone alone does not grant Atlas access — complete linking first",
        orchestration: "blocked_unlinked",
      };
    }

    const token = bearerToken(request);

    let session = await prisma.conversationSession.findFirst({
      where: {
        phoneE164: body.phoneE164,
        atlasUserId: body.atlasUserId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    let state: ConversationState = session
      ? (session.stateJson as ConversationState)
      : { ...newConversationState(), phase: "COLLECT_BRIEF" };

    const campaignId = body.campaignId ?? session?.campaignId ?? state.campaignId;
    if (!campaignId) {
      return {
        reply:
          "Link an Atlas campaignId to this session before planning (Pulse does not create a second quote ledger). Include campaignId on the next message.",
        phase: state.phase,
        orchestration: "blocked_missing_campaign",
      };
    }

    if (!session) {
      session = await prisma.conversationSession.create({
        data: {
          phoneE164: body.phoneE164,
          atlasUserId: body.atlasUserId,
          tenantOrganizationId: body.tenantOrganizationId,
          campaignId,
          phase: state.phase,
          stateJson: state as object,
          expiresAt: new Date(state.expiresAt),
        },
      });
    } else if (!session.campaignId && campaignId) {
      await prisma.conversationSession.update({
        where: { id: session.id },
        data: { campaignId },
      });
    }

    const priorActions = (session.actionResultsJson ?? {}) as Record<string, unknown>;

    const result = await advanceConversation({
      env,
      accessToken: token,
      state,
      text: body.text,
      campaignId,
      atlasUserId: body.atlasUserId,
      tenantOrganizationId: body.tenantOrganizationId,
      priorActions,
      client: atlasClient,
    });

    if (result.actionKey && result.actionResult !== undefined) {
      const nextResults = { ...priorActions, [result.actionKey]: result.actionResult };
      await prisma.conversationAction.upsert({
        where: {
          sessionId_actionKey: { sessionId: session.id, actionKey: result.actionKey },
        },
        create: {
          sessionId: session.id,
          actionKey: result.actionKey,
          status: "succeeded",
          responseJson: result.actionResult as object,
        },
        update: {
          status: "succeeded",
          responseJson: result.actionResult as object,
          updatedAt: new Date(),
        },
      });
      await prisma.conversationSession.update({
        where: { id: session.id },
        data: {
          phase: result.state.phase,
          stateJson: result.state as object,
          actionResultsJson: nextResults as object,
          campaignId,
          updatedAt: new Date(),
        },
      });
    } else {
      await prisma.conversationSession.update({
        where: { id: session.id },
        data: {
          phase: result.state.phase,
          stateJson: result.state as object,
          campaignId,
          updatedAt: new Date(),
        },
      });
    }

    await prisma.conversationTurn.create({
      data: {
        sessionId: session.id,
        role: "user",
        text: body.text,
        actionJson: {},
      },
    });
    await prisma.conversationTurn.create({
      data: {
        sessionId: session.id,
        role: "assistant",
        text: result.reply,
        actionJson: {
          phase: result.state.phase,
          atlasRefs: (result.atlasRefs ?? {}) as object,
          actionKey: result.actionKey ?? null,
        },
      },
    });

    return {
      sessionId: session.id,
      phase: result.state.phase,
      reply: result.reply,
      atlasRefs: result.atlasRefs ?? {
        campaignId,
        quoteId: result.state.quoteId ?? null,
        bookingId: result.state.bookingId ?? null,
        proposalId: result.state.proposalId ?? null,
      },
      orchestration: "atlas_authoritative",
      note: explainServiceLimitation("unconfigured"),
    };
  });

  /** Operational reminder fan-out — scoped text only; Bridge tracks receipts. */
  app.post("/v1/ops-notifications/whatsapp", { preHandler: [app.authenticate] }, async (request) => {
    const body = z
      .object({
        kind: z.enum([
          "VENDOR_APPROVAL",
          "HOLD_EXPIRY",
          "LAUNCH_READY",
          "OVERDUE_TASK",
          "MISSING_PROOF",
          "INVOICE_REMINDER",
          "BOOKING_UPDATE",
          "RECOMMENDATION_APPROVED",
          "CONTINUITY_ALERT",
        ]),
        toE164: z.string().min(8).max(20),
        atlasReminderId: z.string().uuid().optional(),
        scopedLink: z.string().url().optional(),
        summary: z.string().max(280),
      })
      .parse(request.body);

    const text = [
      `Skyarc Atlas: ${body.kind.replace(/_/g, " ").toLowerCase()}`,
      body.summary,
      body.scopedLink ? `Open: ${body.scopedLink}` : null,
      "Internal costs and margins are not included.",
    ]
      .filter(Boolean)
      .join("\n");

    const job = await prisma.opsNotificationJob.create({
      data: {
        kind: body.kind,
        toE164: body.toE164,
        atlasReminderId: body.atlasReminderId,
        status: "pending",
        payloadJson: { summary: body.summary, scopedLink: body.scopedLink ?? null },
      },
    });

    try {
      const bridge = await sendWhatsAppViaBridge(env, {
        toE164: body.toE164,
        text,
        idempotencyKey: body.atlasReminderId
          ? `ops-reminder:${body.atlasReminderId}`
          : `ops-notif:${job.id}`,
        hasConsent: true,
      });
      const deliveryStatus = bridge.deliveryStatus ?? (bridge.dryRun ? "dry_run" : "submitted");
      await prisma.opsNotificationJob.update({
        where: { id: job.id },
        data: {
          status: bridge.dryRun ? "dry_run" : "submitted",
          bridgeMessageId: bridge.id,
          deliveryStatus,
        },
      });
      return {
        jobId: job.id,
        bridgeMessageId: bridge.id,
        deliveryStatus,
        delivered: bridge.delivered === true,
        dryRun: bridge.dryRun === true,
        note: bridge.delivered
          ? undefined
          : "Queued/submitted only — delivery requires provider receipt (or dry-run pending Meta credentials)",
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "notify failed";
      await prisma.opsNotificationJob.update({
        where: { id: job.id },
        data: { status: "failed", error: message },
      });
      throw err;
    }
  });

  return app;
}
