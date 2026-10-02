/**
 * Google identity linking + invitation acceptance (Atlas-owned users/tenants).
 */
import type { PrismaClient, Prisma } from "@prisma/client";
import { OrganizationStatus, OrganizationType, UserRole } from "@skyarc/shared";
import {
  GOOGLE_OIDC_PROVIDER,
  GOOGLE_SELF_SERVE_ROLE,
  assertGoogleClaims,
  hashInviteToken,
  newInviteToken,
  type GoogleIdTokenClaims,
  type GoogleOidcConfig,
} from "./google-oidc.js";

type Db = PrismaClient;

export async function findUserByGoogleSubject(db: Db, subject: string) {
  return db.externalIdentity.findUnique({
    where: { provider_subject: { provider: GOOGLE_OIDC_PROVIDER, subject } },
    include: { user: true },
  });
}

/**
 * Complete Google sign-in after server-validated ID token claims.
 * - Existing subject → login
 * - Invitation present → join invited org (or create CLIENT org if staff flagged)
 * - Else self-serve CLIENT_VIEWER with no new SaaS tenant (organizationId null until invited)
 */
export async function upsertGoogleSignIn(
  db: Db,
  input: {
    claims: GoogleIdTokenClaims;
    config: GoogleOidcConfig;
    inviteToken?: string | null;
  }
) {
  const check = assertGoogleClaims(input.claims, input.config.clientId);
  if (!check.ok) return { error: check.reason } as const;

  const email = input.claims.email?.toLowerCase();
  if (!email) return { error: "Google account email required" as const };
  if (input.claims.email_verified === false) {
    return { error: "Google email not verified" as const };
  }

  const existingIdentity = await findUserByGoogleSubject(db, input.claims.sub);
  if (existingIdentity) {
    if (existingIdentity.user.deactivatedAt) {
      return { error: "Account disabled" as const };
    }
    return { user: existingIdentity.user, created: false as const, linked: true as const };
  }

  // Invitation path
  if (input.inviteToken) {
    const invite = await db.organizationInvitation.findUnique({
      where: { tokenHash: hashInviteToken(input.inviteToken) },
    });
    if (!invite || invite.revokedAt || invite.acceptedAt || invite.expiresAt < new Date()) {
      return { error: "Invitation invalid or expired" as const };
    }
    if (invite.email.toLowerCase() !== email) {
      return { error: "Invitation email does not match Google account" as const };
    }

    let organizationId = invite.organizationId;
    if (!organizationId && invite.createOrganization) {
      if (!invite.newOrganizationName) {
        return { error: "Invitation missing organization name" as const };
      }
      const org = await db.organization.create({
        data: {
          name: invite.newOrganizationName,
          type: OrganizationType.CLIENT,
          status: OrganizationStatus.ACTIVE,
        },
      });
      organizationId = org.id;
    }
    if (!organizationId) {
      return { error: "Invitation must target an existing organization" as const };
    }

    let user = await db.user.findUnique({ where: { email } });
    if (user?.deactivatedAt) return { error: "Account disabled" as const };
    if (!user) {
      user = await db.user.create({
        data: {
          email,
          name: input.claims.name ?? email.split("@")[0]!,
          role: invite.role,
          organizationId,
          passwordHash: null,
        },
      });
    } else if (!user.organizationId) {
      user = await db.user.update({
        where: { id: user.id },
        data: { organizationId, role: invite.role },
      });
    }

    await db.externalIdentity.create({
      data: {
        userId: user.id,
        provider: GOOGLE_OIDC_PROVIDER,
        subject: input.claims.sub,
        email,
        emailVerified: true,
        rawClaimsJson: {
          sub: input.claims.sub,
          email,
          // Do not persist full raw token
        } as Prisma.InputJsonValue,
      },
    });
    await db.organizationInvitation.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });
    return { user, created: true as const, linked: true as const, organizationId };
  }

  // Existing password account with same email — require authenticated link, not silent merge
  const emailUser = await db.user.findUnique({ where: { email } });
  if (emailUser) {
    return {
      error: "Account exists — sign in and link Google from an authenticated session" as const,
      requiresLink: true as const,
      userId: emailUser.id,
    };
  }

  // Self-serve: minimal role, no automatic tenant
  const user = await db.user.create({
    data: {
      email,
      name: input.claims.name ?? email.split("@")[0]!,
      role: GOOGLE_SELF_SERVE_ROLE,
      organizationId: null,
      passwordHash: null,
    },
  });
  await db.externalIdentity.create({
    data: {
      userId: user.id,
      provider: GOOGLE_OIDC_PROVIDER,
      subject: input.claims.sub,
      email,
      emailVerified: true,
      rawClaimsJson: { sub: input.claims.sub, email } as Prisma.InputJsonValue,
    },
  });
  return {
    user,
    created: true as const,
    linked: true as const,
    note: "No tenant created — accept an organization invitation for tenant access",
  };
}

/**
 * Link Google subject to the currently authenticated user (verified session required).
 */
export async function linkGoogleToAuthenticatedUser(
  db: Db,
  input: {
    userId: string;
    claims: GoogleIdTokenClaims;
    config: GoogleOidcConfig;
  }
) {
  const check = assertGoogleClaims(input.claims, input.config.clientId);
  if (!check.ok) return { error: check.reason } as const;

  const user = await db.user.findUnique({ where: { id: input.userId } });
  if (!user || user.deactivatedAt) return { error: "Account disabled" as const };

  const taken = await findUserByGoogleSubject(db, input.claims.sub);
  if (taken && taken.userId !== input.userId) {
    return { error: "Google identity already linked to another account" as const };
  }
  if (taken) return { user, alreadyLinked: true as const };

  const email = input.claims.email?.toLowerCase();
  if (email && user.email.toLowerCase() !== email) {
    return { error: "Google email must match the signed-in account email" as const };
  }

  await db.externalIdentity.create({
    data: {
      userId: user.id,
      provider: GOOGLE_OIDC_PROVIDER,
      subject: input.claims.sub,
      email: email ?? user.email,
      emailVerified: Boolean(input.claims.email_verified),
      rawClaimsJson: { sub: input.claims.sub, email: email ?? user.email } as Prisma.InputJsonValue,
    },
  });
  return { user, linked: true as const };
}

export async function createOrganizationInvitation(
  db: Db,
  input: {
    email: string;
    role: UserRole;
    organizationId?: string | null;
    createOrganization?: boolean;
    newOrganizationName?: string | null;
    invitedByUserId: string;
    ttlHours?: number;
  }
) {
  if (!input.organizationId && !input.createOrganization) {
    return { error: "Provide organizationId or createOrganization for staff onboarding" as const };
  }
  if (input.createOrganization && !input.newOrganizationName) {
    return { error: "newOrganizationName required when createOrganization is true" as const };
  }
  // Never auto-create SaaS tenants for arbitrary advertisers without staff flag
  const raw = newInviteToken();
  const row = await db.organizationInvitation.create({
    data: {
      email: input.email.toLowerCase(),
      role: input.role,
      organizationId: input.organizationId ?? null,
      createOrganization: Boolean(input.createOrganization),
      newOrganizationName: input.newOrganizationName ?? null,
      tokenHash: hashInviteToken(raw),
      invitedByUserId: input.invitedByUserId,
      expiresAt: new Date(Date.now() + (input.ttlHours ?? 72) * 3600_000),
    },
  });
  return { invitationId: row.id, token: raw, expiresAt: row.expiresAt };
}
