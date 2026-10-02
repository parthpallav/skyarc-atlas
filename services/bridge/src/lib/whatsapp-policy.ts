/**
 * WhatsApp Cloud API policy helpers (Meta official rules, Mar 2024+ window model):
 * - Outside the 24h customer-care window, only approved template messages may be sent.
 * - Inside the window, free-form session messages are allowed.
 * - Marketing/utility/authentication templates require prior opt-in where applicable.
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages
 */
export type MessagingWindowState = {
  lastUserMessageAt: Date | null;
  now?: Date;
};

export function isWithinCustomerCareWindow(input: MessagingWindowState): boolean {
  if (!input.lastUserMessageAt) return false;
  const now = input.now ?? new Date();
  return now.getTime() - input.lastUserMessageAt.getTime() <= 24 * 60 * 60 * 1000;
}

export type OutboundIntent =
  | { kind: "session_text"; text: string }
  | { kind: "template"; templateName: string; languageCode?: string }
  | { kind: "session_with_document"; text?: string };

export function assertOutboundAllowed(
  window: MessagingWindowState,
  intent: OutboundIntent,
  opts: { hasConsent: boolean; dryRun?: boolean } = { hasConsent: false }
): { ok: true } | { ok: false; error: string } {
  if (opts.dryRun) return { ok: true };
  if (!opts.hasConsent && intent.kind === "template") {
    return { ok: false, error: "Template messaging requires recorded recipient consent" };
  }
  if (isWithinCustomerCareWindow(window)) return { ok: true };
  if (intent.kind === "template") return { ok: true };
  return {
    ok: false,
    error:
      "Outside the 24-hour customer care window — only approved template messages are allowed",
  };
}

export type DeliveryStatus =
  | "queued"
  | "submitted"
  | "delivered"
  | "read"
  | "failed"
  | "dry_run"
  | "partial";

export function mergePartialDelivery(textOk: boolean, docOk: boolean | null): DeliveryStatus {
  if (docOk === null) return textOk ? "submitted" : "failed";
  if (textOk && docOk) return "submitted";
  if (!textOk && !docOk) return "failed";
  return "partial";
}

export function mapProviderReceiptStatus(status: string): DeliveryStatus | null {
  const s = status.toLowerCase();
  if (s === "sent" || s === "accepted") return "submitted";
  if (s === "delivered") return "delivered";
  if (s === "read") return "read";
  if (s === "failed" || s === "undeliverable") return "failed";
  return null;
}
