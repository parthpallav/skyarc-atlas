/**
 * Authenticated Atlas API client for Pulse orchestration.
 * Pulse never invents prices or reserves — all writes go through Atlas.
 */
import type { PulseEnv } from "../env.js";

function atlasBase(env: PulseEnv): string {
  return env.ATLAS_INTERNAL_URL.replace(/\/$/, "");
}

async function atlasFetch<T>(
  env: PulseEnv,
  accessToken: string,
  path: string,
  init?: RequestInit
): Promise<{ ok: true; data: T; status: number } | { ok: false; status: number; error: string }> {
  const url = `${atlasBase(env)}/api/v1${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = typeof res.text === "function" ? await res.text() : "";
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
  } else if (typeof (res as { json?: () => Promise<unknown> }).json === "function") {
    try {
      json = await (res as { json: () => Promise<unknown> }).json();
    } catch {
      json = null;
    }
  }
  if (!res.ok) {
    const msg =
      json && typeof json === "object" && json !== null && "error" in json
        ? String((json as { error?: { message?: string } }).error?.message ?? text)
        : text || `HTTP ${res.status}`;
    return { ok: false, status: res.status, error: msg };
  }
  const data =
    json && typeof json === "object" && json !== null && "data" in json
      ? ((json as { data: T }).data as T)
      : (json as T);
  return { ok: true, data, status: res.status };
}

export type AtlasMediaPlan = {
  id: string;
  name: string;
  campaignId: string;
  totalBudget: number | null;
  mix?: Record<string, unknown>;
  items: Array<{
    rank?: number | null;
    budgetAllocated: number;
    inventoryType?: string | null;
    isPremium?: boolean;
    location?: {
      name?: string;
      skyarcSiteCode?: string | null;
      road?: string | null;
    };
    pricing?: { clientRate?: number };
  }>;
};

export async function fetchMediaPlan(
  env: PulseEnv,
  campaignId: string,
  planId: string,
  accessToken: string
): Promise<AtlasMediaPlan> {
  const res = await atlasFetch<AtlasMediaPlan>(
    env,
    accessToken,
    `/campaigns/${campaignId}/media-plans/${planId}`
  );
  if (!res.ok) throw new Error(`Atlas plan fetch failed: ${res.status} ${res.error}`);
  if (!res.data) throw new Error("Atlas plan response missing data");
  return res.data;
}

export async function fetchMediaPlanPdf(
  env: PulseEnv,
  campaignId: string,
  planId: string,
  accessToken: string
): Promise<Buffer> {
  const url = `${atlasBase(env)}/api/v1/campaigns/${campaignId}/media-plans/${planId}/export/pdf`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Atlas PDF export failed: ${res.status} ${text}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export type AtlasScenarioBundle = {
  campaignId: string;
  coverage: { kind: string; totalCost: number; siteCount: number; strategySummary?: string } | null;
  concentration: { kind: string; totalCost: number; siteCount: number; strategySummary?: string } | null;
  meaningfullyDifferent: boolean;
  limitation: string | null;
  evidenceLimitations?: string[];
};

export async function fetchScenarios(
  env: PulseEnv,
  accessToken: string,
  campaignId: string,
  totalBudget?: number
) {
  return atlasFetch<AtlasScenarioBundle>(env, accessToken, `/campaigns/${campaignId}/scenarios`, {
    method: "POST",
    body: JSON.stringify(totalBudget != null ? { totalBudget } : {}),
  });
}

export async function issueProposal(
  env: PulseEnv,
  accessToken: string,
  campaignId: string,
  scenarioKind: "COVERAGE" | "CONCENTRATION"
) {
  return atlasFetch<{ proposal: { id: string; total: number; currency: string; expiresAt: string }; quoteId: string }>(
    env,
    accessToken,
    `/campaigns/${campaignId}/proposals`,
    {
      method: "POST",
      body: JSON.stringify({ scenarioKind }),
    }
  );
}

export async function createWhatsAppConfirmation(
  env: PulseEnv,
  accessToken: string,
  input: {
    action: "ACCEPT_QUOTE" | "RESERVE_INVENTORY";
    payload: Record<string, unknown>;
    ttlMinutes?: number;
  }
) {
  return atlasFetch<{
    confirmationId: string;
    token: string;
    expiresAt: string;
    fingerprint: string;
    note?: string;
  }>(env, accessToken, `/whatsapp/confirmations`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function executeWhatsAppConfirmation(
  env: PulseEnv,
  accessToken: string,
  input: { token: string; action: "ACCEPT_QUOTE" | "RESERVE_INVENTORY" }
) {
  return atlasFetch<{
    executed?: string;
    bookingId?: string | null;
    idempotent?: boolean;
    revalidated?: boolean;
    note?: string;
  }>(env, accessToken, `/whatsapp/confirmations/execute`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getQuote(
  env: PulseEnv,
  accessToken: string,
  quoteId: string
) {
  return atlasFetch<{
    id: string;
    status: string;
    total: number;
    currency: string;
    expiresAt: string;
    acceptedBookingId: string | null;
    campaignId: string | null;
  }>(env, accessToken, `/quotes/${quoteId}`);
}

export async function updateCampaignBrief(
  env: PulseEnv,
  accessToken: string,
  campaignId: string,
  structuredRequirements: Record<string, unknown>,
  briefText?: string
) {
  return atlasFetch<unknown>(env, accessToken, `/campaigns/${campaignId}`, {
    method: "PUT",
    body: JSON.stringify({
      structuredRequirements,
      briefText: briefText?.slice(0, 4000),
    }),
  });
}

/** Injectable for unit tests — never used for inventing prices. */
export type AtlasOrchestrationClient = {
  fetchScenarios: typeof fetchScenarios;
  issueProposal: typeof issueProposal;
  createWhatsAppConfirmation: typeof createWhatsAppConfirmation;
  executeWhatsAppConfirmation: typeof executeWhatsAppConfirmation;
  getQuote: typeof getQuote;
  updateCampaignBrief: typeof updateCampaignBrief;
};

export const defaultAtlasClient: AtlasOrchestrationClient = {
  fetchScenarios,
  issueProposal,
  createWhatsAppConfirmation,
  executeWhatsAppConfirmation,
  getQuote,
  updateCampaignBrief,
};
