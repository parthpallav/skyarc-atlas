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

export async function buildPulseApp(env: PulseEnv) {
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

  app.get("/health", async () => ({ status: "ok", service: "pulse" }));

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

  return app;
}
