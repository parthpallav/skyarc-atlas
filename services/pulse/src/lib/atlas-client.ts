import type { PulseEnv } from "../env.js";

export type AtlasMediaPlan = {
  id: string;
  name: string;
  campaignId: string;
  totalBudget: number | null;
  mix?: {
    sites?: number;
    allocated?: number;
    skyarcBudgetPercent?: number;
    premiumBudgetPercent?: number;
    minSkyarcBudgetMixPercent?: number;
    meetsSkyarcMixTarget?: boolean;
    hoardings?: number;
    digital?: number;
    kiosks?: number;
  };
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

function atlasBase(env: PulseEnv): string {
  return env.ATLAS_INTERNAL_URL.replace(/\/$/, "");
}

export async function fetchMediaPlan(
  env: PulseEnv,
  campaignId: string,
  planId: string,
  accessToken: string
): Promise<AtlasMediaPlan> {
  const url = `${atlasBase(env)}/api/v1/campaigns/${campaignId}/media-plans/${planId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Atlas plan fetch failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { data?: AtlasMediaPlan };
  const plan = json.data;
  if (!plan) throw new Error("Atlas plan response missing data");
  return plan;
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
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
