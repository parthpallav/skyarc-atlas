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
import { sendWhatsAppMessage, verifyWhatsAppSignature } from "./providers/whatsapp-cloud.js";

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
    if (env.WHATSAPP_APP_SECRET && !verifyWhatsAppSignature(rawBody, signature, env.WHATSAPP_APP_SECRET)) {
      return reply.status(401).send({ error: { message: "Invalid signature" } });
    }
    let payload: unknown = {};
    try {
      payload = JSON.parse(rawBody);
    } catch {
      payload = { raw: rawBody };
    }
    await prisma.inboundEvent.create({
      data: {
        channel: "whatsapp",
        payloadJson: payload as object,
      },
    });
    return { received: true };
  });

  app.post(
    "/v1/messages/whatsapp",
    { preHandler: serviceAuth },
    async (request) => {
      const body = whatsAppSendSchema.parse(request.body ?? {});
      const documentBuffer = body.documentBase64
        ? Buffer.from(body.documentBase64, "base64")
        : undefined;

      const row = await prisma.outboundMessage.create({
        data: {
          channel: "whatsapp",
          toE164: body.toE164,
          bodyPreview: body.text?.slice(0, 200) ?? null,
          status: "pending",
          payloadJson: {
            hasDocument: Boolean(documentBuffer || body.documentUrl),
          },
        },
      });

      try {
        const result = await sendWhatsAppMessage(env, {
          toE164: body.toE164,
          text: body.text,
          documentUrl: body.documentUrl,
          documentFilename: body.documentFilename,
          documentBuffer,
        });
        await prisma.outboundMessage.update({
          where: { id: row.id },
          data: {
            status: result.dryRun ? "dry_run" : "sent",
            providerMessageId: result.providerMessageId,
          },
        });
        return {
          id: row.id,
          providerMessageId: result.providerMessageId,
          dryRun: result.dryRun,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Send failed";
        await prisma.outboundMessage.update({
          where: { id: row.id },
          data: { status: "failed", error: message },
        });
        throw err;
      }
    }
  );

  return app;
}
