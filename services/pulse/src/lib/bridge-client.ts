import type { PulseEnv } from "../env.js";

export type BridgeWhatsAppSendInput = {
  toE164: string;
  text?: string;
  documentUrl?: string;
  documentFilename?: string;
  documentBase64?: string;
  idempotencyKey?: string;
  hasConsent?: boolean;
  lastUserMessageAt?: string | null;
};

export async function sendWhatsAppViaBridge(env: PulseEnv, input: BridgeWhatsAppSendInput) {
  const base = env.BRIDGE_INTERNAL_URL.replace(/\/$/, "");
  const res = await fetch(`${base}/v1/messages/whatsapp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.BRIDGE_SERVICE_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bridge WhatsApp send failed: ${res.status} ${text}`);
  }
  return (await res.json()) as {
    id: string;
    providerMessageId: string;
    dryRun?: boolean;
    deliveryStatus?: string;
    delivered?: boolean;
  };
}
