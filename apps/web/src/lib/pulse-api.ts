import { getStoredToken } from "@/lib/api";

export function getPulseBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_PULSE_URL) {
    return process.env.NEXT_PUBLIC_PULSE_URL.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return `${window.location.protocol}//${host}:3003`;
    }
    return "/pulse";
  }
  return "http://127.0.0.1:3003";
}

function authHeaders(): HeadersInit {
  const token = getStoredToken();
  if (!token) throw new Error("Not signed in");
  return { Authorization: `Bearer ${token}` };
}

export async function exportMediaPlanXlsx(campaignId: string, planId: string): Promise<Blob> {
  const base = getPulseBaseUrl();
  const url = `${base}/v1/media-plans/${planId}/export/xlsx?campaignId=${encodeURIComponent(campaignId)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Excel export failed (${res.status})`);
  }
  return res.blob();
}

export async function shareMediaPlanWhatsApp(
  campaignId: string,
  planId: string,
  input: { toE164: string; includePdf?: boolean }
): Promise<{ job: { id: string; status: string }; dryRun?: boolean }> {
  const base = getPulseBaseUrl();
  const url = `${base}/v1/media-plans/${planId}/share/whatsapp`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      campaignId,
      toE164: input.toE164,
      includePdf: input.includePdf ?? false,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `WhatsApp share failed (${res.status})`);
  }
  return res.json();
}
