import { createHmac, timingSafeEqual } from "node:crypto";
import type { BridgeEnv } from "../env.js";
import { whatsappConfigured } from "../env.js";

export type WhatsAppSendInput = {
  toE164: string;
  text?: string;
  documentUrl?: string;
  documentFilename?: string;
  documentBuffer?: Buffer;
};

export type WhatsAppSendResult = {
  providerMessageId: string;
  dryRun: boolean;
};

function normalizeE164(to: string): string {
  const digits = to.replace(/\D/g, "");
  return digits;
}

export function verifyWhatsAppSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  appSecret: string | undefined
): boolean {
  if (!appSecret || !signatureHeader?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const provided = signatureHeader.slice("sha256=".length);
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
  } catch {
    return false;
  }
}

async function uploadMedia(env: BridgeEnv, buffer: Buffer, mimeType: string): Promise<string> {
  const phoneId = env.WHATSAPP_PHONE_NUMBER_ID!;
  const token = env.WHATSAPP_TOKEN!;
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append(
    "file",
    new Blob([buffer], { type: mimeType }),
    mimeType === "application/pdf" ? "media-plan.pdf" : "export.xlsx"
  );
  form.append("type", mimeType);

  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`WhatsApp media upload failed: ${res.status} ${errText}`);
  }
  const json = (await res.json()) as { id?: string };
  if (!json.id) throw new Error("WhatsApp media upload missing id");
  return json.id;
}

export async function sendWhatsAppMessage(
  env: BridgeEnv,
  input: WhatsAppSendInput
): Promise<WhatsAppSendResult> {
  const to = normalizeE164(input.toE164);
  if (!to) throw new Error("Invalid recipient phone number");

  if (!whatsappConfigured(env)) {
    return { providerMessageId: `dry-run-${Date.now()}`, dryRun: true };
  }

  const phoneId = env.WHATSAPP_PHONE_NUMBER_ID!;
  const token = env.WHATSAPP_TOKEN!;

  if (input.text?.trim()) {
    const textRes = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: input.text.trim() },
      }),
    });
    if (!textRes.ok) {
      throw new Error(`WhatsApp text send failed: ${textRes.status} ${await textRes.text()}`);
    }
    const textJson = (await textRes.json()) as { messages?: Array<{ id?: string }> };
    const msgId = textJson.messages?.[0]?.id ?? `wa-${Date.now()}`;
    if (!input.documentUrl && !input.documentBuffer) {
      return { providerMessageId: msgId, dryRun: false };
    }
  }

  let documentPayload: Record<string, unknown>;
  if (input.documentBuffer) {
    const mediaId = await uploadMedia(env, input.documentBuffer, "application/pdf");
    documentPayload = {
      id: mediaId,
      filename: input.documentFilename ?? "media-plan.pdf",
    };
  } else if (input.documentUrl) {
    documentPayload = {
      link: input.documentUrl,
      filename: input.documentFilename ?? "media-plan.pdf",
    };
  } else {
    throw new Error("Document send requested without document payload");
  }

  const docRes = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "document",
      document: documentPayload,
    }),
  });
  if (!docRes.ok) {
    throw new Error(`WhatsApp document send failed: ${docRes.status} ${await docRes.text()}`);
  }
  const docJson = (await docRes.json()) as { messages?: Array<{ id?: string }> };
  return { providerMessageId: docJson.messages?.[0]?.id ?? `wa-doc-${Date.now()}`, dryRun: false };
}
