import type { Env } from "@skyarc/config";

export type OrbitClaimResult = {
  claimCode: string;
  expiresAt: string;
  orbitDeviceId: string;
};

export async function requestOrbitClaim(
  env: Env,
  input: {
    atlasScreenId: string;
    skyarcScreenCode: string;
    deviceType: string;
    tenantId: string;
  }
): Promise<OrbitClaimResult> {
  if (!env.ORBIT_CLOUD_URL || !env.ORBIT_SERVICE_TOKEN) {
    throw new Error("Orbit Cloud is not configured (ORBIT_CLOUD_URL / ORBIT_SERVICE_TOKEN)");
  }
  const res = await fetch(`${env.ORBIT_CLOUD_URL.replace(/\/$/, "")}/provision/v1/claim`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.ORBIT_SERVICE_TOKEN}`,
    },
    body: JSON.stringify({
      tenantId: input.tenantId,
      atlasScreenId: input.atlasScreenId,
      skyarcScreenCode: input.skyarcScreenCode,
      deviceType: input.deviceType,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Orbit claim failed (${res.status}): ${text}`);
  }
  return (await res.json()) as OrbitClaimResult;
}

export async function fetchOrbitDeviceState(
  env: Env,
  orbitDeviceId: string
): Promise<Record<string, unknown> | null> {
  if (!env.ORBIT_CLOUD_URL || !env.ORBIT_SERVICE_TOKEN) return null;
  try {
    const res = await fetch(
      `${env.ORBIT_CLOUD_URL.replace(/\/$/, "")}/devices/v1/${orbitDeviceId}/state`,
      {
        headers: { authorization: `Bearer ${env.ORBIT_SERVICE_TOKEN}` },
      }
    );
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}
