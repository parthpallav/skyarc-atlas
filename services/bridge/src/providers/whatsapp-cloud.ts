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
  /** True when text succeeded but document failed (or vice versa). */
  partial?: boolean;
  partialDetail?: string;
};

function normalizeE164(to: string): string {
  return to.replace(/\D/g, "");
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

/** Production must verify signatures; missing secret is a hard deny in production. */
export function requireWebhookSignature(
  env: BridgeEnv,
  rawBody: string,
  signatureHeader: string | undefined
): { ok: true } | { ok: false; error: string } {
  if (env.NODE_ENV === "production") {
    if (!env.WHATSAPP_APP_SECRET) {
      return { ok: false, error: "WHATSAPP_APP_SECRET required in production" };
    }
    if (!verifyWhatsAppSignature(rawBody, signatureHeader, env.WHATSAPP_APP_SECRET)) {
      return { ok: false, error: "Invalid signature" };
    }
    return { ok: true };
  }
  // Non-production: verify when secret is configured; otherwise allow with unverified flag upstream
  if (env.WHATSAPP_APP_SECRET) {
    if (!verifyWhatsAppSignature(rawBody, signatureHeader, env.WHATSAPP_APP_SECRET)) {
      return { ok: false, error: "Invalid signature" };
    }
  }
  return { ok: true };
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
  const wantsDoc = Boolean(input.documentUrl || input.documentBuffer);
  const wantsText = Boolean(input.text?.trim());

  let textOk = !wantsText;
  let textId: string | undefined;
  let textError: string | undefined;

  if (wantsText) {
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
        text: { body: input.text!.trim() },
      }),
    });
    if (!textRes.ok) {
      textError = `WhatsApp text send failed: ${textRes.status} ${await textRes.text()}`;
      textOk = false;
    } else {
      const textJson = (await textRes.json()) as { messages?: Array<{ id?: string }> };
      textId = textJson.messages?.[0]?.id ?? `wa-${Date.now()}`;
      textOk = true;
    }
    if (!wantsDoc) {
      if (!textOk) throw new Error(textError ?? "Text send failed");
      return { providerMessageId: textId!, dryRun: false };
    }
  }

  let docOk = false;
  let docId: string | undefined;
  let docError: string | undefined;
  try {
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
      docError = `WhatsApp document send failed: ${docRes.status} ${await docRes.text()}`;
      docOk = false;
    } else {
      const docJson = (await docRes.json()) as { messages?: Array<{ id?: string }> };
      docId = docJson.messages?.[0]?.id ?? `wa-doc-${Date.now()}`;
      docOk = true;
    }
  } catch (err) {
    docError = err instanceof Error ? err.message : "Document send failed";
    docOk = false;
  }

  if (textOk && docOk) {
    return { providerMessageId: docId ?? textId!, dryRun: false };
  }
  if (!textOk && !docOk) {
    throw new Error([textError, docError].filter(Boolean).join("; "));
  }
  // Provider accepted one part only — not delivered for both
  return {
    providerMessageId: docId ?? textId ?? `wa-partial-${Date.now()}`,
    dryRun: false,
    partial: true,
    partialDetail: [
      textOk ? "text:submitted" : `text:failed:${textError}`,
      docOk ? "document:submitted" : `document:failed:${docError}`,
      "Provider acceptance of one part does not mean full delivery",
    ].join(" | "),
  };
}
