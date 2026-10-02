import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: string;
  }
}
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import type { BridgeEnv } from "./env.js";
import { prisma } from "./prisma.js";
import { requireWebhookSignature } from "./providers/whatsapp-cloud.js";
import {
  applyWebhookReceipt,
  enqueueWhatsAppJob,
  processOutboundJob,
} from "./lib/outbound-jobs.js";

function unauthorized(): Error & { statusCode: number } {
  const err = new Error("Unauthorized") as Error & { statusCode: number };
  err.statusCode = 401;
  return err;
}

const whatsAppSendSchema = z.object({
  toE164: z.string().min(8).max(20),
  text: z.string().max(4000).optional(),
  documentUrl: z.string().url().optional(),
  documentFilename: z.string().max(200).optional(),
  documentBase64: z.string().max(12_000_000).optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
  templateName: z.string().max(120).optional(),
  hasConsent: z.boolean().optional(),
  lastUserMessageAt: z.string().datetime().nullable().optional(),
});

export async function buildBridgeApp(env: BridgeEnv) {
  const app = Fastify({ logger: true });
  await app.register(helmet);
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });

  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply: FastifyReply) => {
    const status = err.statusCode ?? 500;
    reply.status(status).send({ error: { message: err.message } });
  });

  const serviceAuth = async (request: FastifyRequest) => {
    const header = String(request.headers.authorization ?? "");
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (token !== env.BRIDGE_SERVICE_TOKEN) throw unauthorized();
  };

  app.get("/health", async () => ({ status: "ok", service: "bridge" }));

  app.get("/webhooks/whatsapp", async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const mode = query["hub.mode"];
    const token = query["hub.verify_token"];
    const challenge = query["hub.challenge"];
    if (mode === "subscribe" && token && token === env.WHATSAPP_VERIFY_TOKEN && challenge) {
      return reply.status(200).send(challenge);
    }
    return reply.status(403).send("Forbidden");
  });

  app.addHook("preParsing", async (request, _reply, payload) => {
    if (request.url !== "/webhooks/whatsapp" || request.method !== "POST") {
      return payload;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of payload) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const raw = Buffer.concat(chunks);
    request.rawBody = raw.toString("utf8");
    return raw;
  });

  app.post("/webhooks/whatsapp", async (request, reply) => {
    const rawBody = request.rawBody ?? JSON.stringify(request.body ?? {});
    const signature = request.headers["x-hub-signature-256"] as string | undefined;
    const sigCheck = requireWebhookSignature(env, rawBody, signature);
    if (!sigCheck.ok) {
      return reply.status(401).send({ error: { message: sigCheck.error } });
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      payload = { raw: rawBody };
    }

    const entries = (payload.entry as Array<Record<string, unknown>> | undefined) ?? [];
    const results = [];
    for (const entry of entries) {
      const changes = (entry.changes as Array<Record<string, unknown>> | undefined) ?? [];
      for (const change of changes) {
        const value = (change.value as Record<string, unknown>) ?? {};
        const statuses = (value.statuses as Array<Record<string, unknown>> | undefined) ?? [];
        for (const st of statuses) {
          const providerEventId = String(st.id ?? st.meta_message_id ?? `${entry.id}-${st.timestamp}`);
          const providerMessageId = String(st.id ?? "");
          const status = String(st.status ?? "");
          results.push(
            await applyWebhookReceipt(prisma, {
              providerEventId,
              providerMessageId,
              status,
              raw: st,
              signatureVerified: Boolean(env.WHATSAPP_APP_SECRET) || env.NODE_ENV !== "production",
            })
          );
        }
      }
    }

    if (results.length === 0) {
      // Persist inbound for later conversation processing (Pulse polls / consumes)
      await prisma.inboundEvent.create({
        data: {
          channel: "whatsapp",
          payloadJson: payload as object,
          signatureVerified: Boolean(env.WHATSAPP_APP_SECRET) || env.NODE_ENV !== "production",
          processed: false,
        },
      });
    }

    return { received: true, receipts: results.length };
  });

  app.post(
    "/v1/messages/whatsapp",
    { preHandler: serviceAuth },
    async (request) => {
      const body = whatsAppSendSchema.parse(request.body ?? {});
      const enqueued = await enqueueWhatsAppJob(prisma, env, {
        ...body,
        lastUserMessageAt: body.lastUserMessageAt,
      });
      if ("error" in enqueued) {
        const err = new Error(enqueued.error) as Error & { statusCode: number };
        err.statusCode = 400;
        throw err;
      }

      // Store send payload for worker
      await prisma.outboundMessage.update({
        where: { id: enqueued.message.id },
        data: {
          payloadJson: {
            text: body.text,
            documentBase64: body.documentBase64,
            documentUrl: body.documentUrl,
            documentFilename: body.documentFilename,
            hasDocument: Boolean(body.documentBase64 || body.documentUrl),
            templateName: body.templateName ?? null,
            dryRun: enqueued.dryRun,
          },
        },
      });

      const processed = await processOutboundJob(prisma, env, enqueued.message.id);
      const msg = ("message" in processed && processed.message) ? processed.message : enqueued.message;
      if (!msg) {
        const err = new Error("Outbound message missing") as Error & { statusCode: number };
        err.statusCode = 500;
        throw err;
      }

      return {
        id: msg.id,
        providerMessageId: msg.providerMessageId,
        deliveryStatus: msg.deliveryStatus,
        dryRun: msg.deliveryStatus === "dry_run",
        // Never claim delivered from provider accept alone
        delivered: msg.deliveryStatus === "delivered" || msg.deliveryStatus === "read",
        idempotent: enqueued.idempotent,
        note:
          msg.deliveryStatus === "submitted" || msg.deliveryStatus === "partial"
            ? "Provider accepted outbound request — not confirmed delivered until receipt webhook"
            : msg.deliveryStatus === "dry_run"
              ? "Dry-run — Meta credentials not configured; live delivery pending"
              : undefined,
      };
    }
  );

  app.post(
    "/v1/messages/:id/retry",
    { preHandler: serviceAuth },
    async (request) => {
      const id = z.string().uuid().parse((request.params as { id: string }).id);
      const processed = await processOutboundJob(prisma, env, id);
      if ("error" in processed && !("message" in processed)) {
        const err = new Error(processed.error) as Error & { statusCode: number };
        err.statusCode = 404;
        throw err;
      }
      return processed;
    }
  );

  app.get(
    "/v1/messages/:id",
    { preHandler: serviceAuth },
    async (request) => {
      const id = z.string().uuid().parse((request.params as { id: string }).id);
      const msg = await prisma.outboundMessage.findUnique({ where: { id } });
      if (!msg) {
        const err = new Error("Not found") as Error & { statusCode: number };
        err.statusCode = 404;
        throw err;
      }
      return {
        id: msg.id,
        deliveryStatus: msg.deliveryStatus,
        dryRun: msg.deliveryStatus === "dry_run",
        delivered: msg.deliveryStatus === "delivered" || msg.deliveryStatus === "read",
        providerMessageId: msg.providerMessageId,
        attemptCount: msg.attemptCount,
        error: msg.error,
      };
    }
  );

  return app;
}
