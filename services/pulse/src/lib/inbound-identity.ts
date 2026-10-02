/**
 * Resolve Pulse conversation identity from JWT or authenticated Bridge channel.
 * Never trust caller-supplied atlasUserId / tenantOrganizationId.
 */
import type { PulseEnv } from "../env.js";

export type ResolvedPulseIdentity = {
  atlasUserId: string;
  tenantOrganizationId: string;
  source: "jwt" | "bridge_link";
  phoneE164?: string;
};

export type PulseAuthUser = {
  id: string;
  organizationId?: string | null;
};

export async function resolveInboundIdentity(input: {
  env: PulseEnv;
  user: PulseAuthUser;
  phoneE164: string;
  bodyAtlasUserId?: string;
  bodyTenantOrganizationId?: string;
  bridgeToken?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<
  | { ok: true; identity: ResolvedPulseIdentity }
  | { ok: false; status: number; error: string; orchestration: string }
> {
  const bridgeToken = input.bridgeToken?.trim() || "";
  const isBridge =
    bridgeToken.length > 0 && timingSafeEqualStr(bridgeToken, input.env.BRIDGE_SERVICE_TOKEN);

  if (isBridge) {
    const resolved = await resolveWhatsAppLinkFromAtlas({
      env: input.env,
      phoneE164: input.phoneE164,
      fetchImpl: input.fetchImpl,
    });
    if (!resolved.ok) {
      return {
        ok: false,
        status: 403,
        error: resolved.error,
        orchestration: "blocked_unlinked",
      };
    }
    // Reject body identity overrides on Bridge channel
    if (
      input.bodyAtlasUserId &&
      input.bodyAtlasUserId !== resolved.userId
    ) {
      return {
        ok: false,
        status: 403,
        error: "Caller-supplied atlasUserId rejected — Bridge resolves identity from account link",
        orchestration: "blocked_identity_mismatch",
      };
    }
    if (
      input.bodyTenantOrganizationId &&
      input.bodyTenantOrganizationId !== resolved.tenantOrganizationId
    ) {
      return {
        ok: false,
        status: 403,
        error: "Caller-supplied tenantOrganizationId rejected",
        orchestration: "blocked_identity_mismatch",
      };
    }
    return {
      ok: true,
      identity: {
        atlasUserId: resolved.userId,
        tenantOrganizationId: resolved.tenantOrganizationId,
        source: "bridge_link",
        phoneE164: input.phoneE164,
      },
    };
  }

  // Authenticated Atlas user JWT path
  const atlasUserId = input.user.id;
  const tenantOrganizationId = input.user.organizationId ?? null;
  if (!tenantOrganizationId) {
    return {
      ok: false,
      status: 403,
      error: "Authenticated user has no tenant organization",
      orchestration: "blocked_unlinked",
    };
  }
  if (input.bodyAtlasUserId && input.bodyAtlasUserId !== atlasUserId) {
    return {
      ok: false,
      status: 403,
      error: "Caller-supplied atlasUserId does not match authenticated session",
      orchestration: "blocked_identity_mismatch",
    };
  }
  if (
    input.bodyTenantOrganizationId &&
    input.bodyTenantOrganizationId !== tenantOrganizationId
  ) {
    return {
      ok: false,
      status: 403,
      error: "Caller-supplied tenantOrganizationId does not match authenticated session",
      orchestration: "blocked_identity_mismatch",
    };
  }
  return {
    ok: true,
    identity: {
      atlasUserId,
      tenantOrganizationId,
      source: "jwt",
      phoneE164: input.phoneE164,
    },
  };
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function resolveWhatsAppLinkFromAtlas(input: {
  env: PulseEnv;
  phoneE164: string;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true; userId: string; tenantOrganizationId: string } | { ok: false; error: string }> {
  const token = input.env.ATLAS_SERVICE_TOKEN;
  if (!token) {
    return {
      ok: false,
      error: "ATLAS_SERVICE_TOKEN not configured for Bridge→Pulse link resolution",
    };
  }
  const fetchFn = input.fetchImpl ?? fetch;
  const url = `${input.env.ATLAS_INTERNAL_URL.replace(/\/$/, "")}/api/v1/whatsapp/link/resolve?phoneE164=${encodeURIComponent(input.phoneE164)}`;
  const res = await fetchFn(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: text || `Atlas link resolve failed (${res.status})` };
  }
  const json = (await res.json()) as {
    data?: { userId?: string; tenantOrganizationId?: string };
  };
  const userId = json.data?.userId;
  const tenantOrganizationId = json.data?.tenantOrganizationId;
  if (!userId || !tenantOrganizationId) {
    return { ok: false, error: "Atlas link resolve missing identity" };
  }
  return { ok: true, userId, tenantOrganizationId };
}
