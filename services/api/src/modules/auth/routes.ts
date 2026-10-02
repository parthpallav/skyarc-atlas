import type { Env } from "@skyarc/config";
import type { FastifyInstance } from "fastify";
import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
import { OrganizationStatus, UserRole, normalizeUserRole, isInternalUser } from "@skyarc/shared";
import {
  forgotPasswordBodySchema,
  loginBodySchema,
  refreshBodySchema,
  resetPasswordBodySchema,
} from "@skyarc/validation";
import { prisma } from "../../lib/prisma.js";
import { success } from "../../lib/response.js";
import { forbidden, unauthorized, validationError } from "../../lib/errors.js";
import type { AuthUser } from "../../lib/rbac.js";
import {
  PASSWORD_RESET_DEVICE_LABEL,
  hashPasswordResetToken,
  issuePasswordResetToken,
} from "../../lib/password-reset.js";
import {
  buildGoogleAuthorizeUrl,
  googleOidcConfigured,
  hashOAuthState,
  newOAuthState,
  verifyGoogleAuthorizationCode,
  type GoogleTokenVerifier,
} from "../../lib/auth/google-oidc.js";
import {
  createOrganizationInvitation,
  linkGoogleToAuthenticatedUser,
  upsertGoogleSignIn,
} from "../../lib/auth/google-identity.js";
import { z } from "zod";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function parseExpiry(exp: string): number {
  const match = /^(\d+)([smhd])$/.exec(exp);
  if (!match) return 900;
  const value = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * (multipliers[unit] ?? 60);
}

function authPayload(user: {
  id: string;
  role: UserRole;
  email: string;
  organizationId: string | null;
}): AuthUser {
  return {
    id: user.id,
    role: normalizeUserRole(user.role) as UserRole,
    email: user.email,
    organizationId: user.organizationId,
  };
}

async function assertOrganizationActive(organizationId: string | null): Promise<void> {
  if (!organizationId) return;
  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org || org.status !== OrganizationStatus.ACTIVE) {
    throw unauthorized("Organization access suspended");
  }
}

async function issueSession(
  fastify: FastifyInstance,
  env: Env,
  user: {
    id: string;
    role: UserRole;
    email: string;
    name: string;
    organizationId: string | null;
  },
  deviceLabel?: string | null
) {
  await assertOrganizationActive(user.organizationId);
  const payload = authPayload(user);
  const accessToken = fastify.jwt.sign(payload, { expiresIn: env.JWT_ACCESS_EXPIRES_IN });
  const refreshToken = randomBytes(48).toString("hex");
  const expiresIn = parseExpiry(env.JWT_REFRESH_EXPIRES_IN);
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      deviceLabel: deviceLabel ?? "google-oidc",
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    },
  });
  return {
    accessToken,
    refreshToken,
    expiresIn: parseExpiry(env.JWT_ACCESS_EXPIRES_IN),
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: normalizeUserRole(user.role),
      organizationId: user.organizationId,
    },
  };
}

const pendingGoogleStates = new Map<
  string,
  { nonce: string; mode: "login" | "link"; inviteToken?: string; expiresAt: number }
>();

export async function authRoutes(
  fastify: FastifyInstance,
  env: Env,
  opts?: { googleVerifier?: GoogleTokenVerifier }
) {
  const googleVerifier = opts?.googleVerifier ?? verifyGoogleAuthorizationCode;

  fastify.post("/auth/login", async (request) => {
    const body = loginBodySchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || user.deactivatedAt) throw unauthorized("Invalid credentials");
    if (!user.passwordHash) {
      throw unauthorized("This account uses Google sign-in — use Continue with Google");
    }
    const valid = await argon2.verify(user.passwordHash, body.password);
    if (!valid) throw unauthorized("Invalid credentials");
    return success(await issueSession(fastify, env, user, body.deviceLabel));
  });

  fastify.post("/auth/refresh", async (request) => {
    const body = refreshBodySchema.parse(request.body);
    const tokenHash = hashToken(body.refreshToken);
    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (
      !stored ||
      stored.revokedAt ||
      stored.expiresAt < new Date() ||
      stored.deviceLabel === PASSWORD_RESET_DEVICE_LABEL
    ) {
      throw unauthorized("Invalid refresh token");
    }
    const user = stored.user;
    if (user.deactivatedAt) throw unauthorized("Invalid refresh token");
    await assertOrganizationActive(user.organizationId);
    const accessToken = fastify.jwt.sign(authPayload(user), { expiresIn: env.JWT_ACCESS_EXPIRES_IN });
    return success({
      accessToken,
      refreshToken: body.refreshToken,
      expiresIn: parseExpiry(env.JWT_ACCESS_EXPIRES_IN),
    });
  });

  fastify.post("/auth/logout", { preHandler: [fastify.authenticate] }, async (request) => {
    const body = refreshBodySchema.safeParse(request.body);
    if (body.success) {
      const tokenHash = hashToken(body.data.refreshToken);
      await prisma.refreshToken.updateMany({
        where: { tokenHash, userId: request.user.id },
        data: { revokedAt: new Date() },
      });
    } else {
      await prisma.refreshToken.updateMany({
        where: { userId: request.user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return success({ ok: true });
  });

  fastify.get("/auth/google/status", async () => {
    const cfg = googleOidcConfigured(env);
    return success({
      configured: Boolean(cfg),
      liveVerification: "pending",
      note: cfg
        ? "Google OIDC routes enabled — live provider verification pending credentialed test"
        : "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI to enable",
    });
  });

  fastify.get("/auth/google/start", async (request) => {
    const cfg = googleOidcConfigured(env);
    if (!cfg) {
      throw validationError(
        "Google sign-in unavailable — configure GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI (live verification pending)"
      );
    }
    const q = z
      .object({
        inviteToken: z.string().min(16).optional(),
        mode: z.enum(["login", "link"]).optional().default("login"),
      })
      .parse(request.query ?? {});
    const state = newOAuthState();
    const nonce = newOAuthState();
    pendingGoogleStates.set(hashOAuthState(state), {
      nonce,
      mode: q.mode,
      inviteToken: q.inviteToken,
      expiresAt: Date.now() + 10 * 60_000,
    });
    return success({
      authorizeUrl: buildGoogleAuthorizeUrl({ config: cfg, state, nonce }),
      state,
      expiresInSeconds: 600,
    });
  });

  fastify.get("/auth/google/callback", async (request) => {
    const cfg = googleOidcConfigured(env);
    if (!cfg) throw validationError("Google sign-in unavailable");
    const q = z.object({ code: z.string().min(1), state: z.string().min(1) }).parse(request.query);
    const key = hashOAuthState(q.state);
    const pending = pendingGoogleStates.get(key);
    pendingGoogleStates.delete(key);
    if (!pending || pending.expiresAt < Date.now()) {
      throw unauthorized("OAuth state invalid or expired");
    }
    if (pending.mode === "link") {
      throw validationError("Use POST /auth/google/link with an authenticated session to link Google");
    }
    const claims = await googleVerifier({
      code: q.code,
      config: cfg,
      expectedNonce: pending.nonce,
    });
    const result = await upsertGoogleSignIn(prisma, {
      claims,
      config: cfg,
      inviteToken: pending.inviteToken,
    });
    if ("error" in result) {
      if ("requiresLink" in result && result.requiresLink) throw validationError(result.error);
      throw unauthorized(result.error);
    }
    return success({
      ...(await issueSession(fastify, env, result.user)),
      created: result.created,
      note: "note" in result ? result.note : undefined,
      liveGoogleVerification: "pending_until_credentialed_test",
    });
  });

  fastify.post("/auth/google/link", { preHandler: [fastify.authenticate] }, async (request) => {
    const cfg = googleOidcConfigured(env);
    if (!cfg) throw validationError("Google sign-in unavailable");
    const body = z.object({ code: z.string().min(1), state: z.string().min(1) }).parse(request.body);
    const key = hashOAuthState(body.state);
    const pending = pendingGoogleStates.get(key);
    pendingGoogleStates.delete(key);
    if (!pending || pending.expiresAt < Date.now() || pending.mode !== "link") {
      throw unauthorized("OAuth state invalid — start link from /auth/google/start?mode=link");
    }
    const claims = await googleVerifier({
      code: body.code,
      config: cfg,
      expectedNonce: pending.nonce,
    });
    const linked = await linkGoogleToAuthenticatedUser(prisma, {
      userId: request.user.id,
      claims,
      config: cfg,
    });
    if ("error" in linked) throw validationError(linked.error ?? "Link failed");
    return success({ linked: true, alreadyLinked: "alreadyLinked" in linked });
  });

  fastify.post("/auth/invitations", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!isInternalUser(request.user)) throw forbidden();
    const body = z
      .object({
        email: z.string().email(),
        role: z.enum([
          UserRole.SUPERADMIN,
          UserRole.ADMIN,
          UserRole.MEDIA_PLANNER,
          UserRole.FIELD_OPERATOR,
          UserRole.VENDOR,
          UserRole.CLIENT_VIEWER,
        ]).default(UserRole.CLIENT_VIEWER),
        organizationId: z.string().uuid().optional(),
        createOrganization: z.boolean().optional(),
        newOrganizationName: z.string().min(2).max(120).optional(),
        ttlHours: z.number().int().min(1).max(168).optional(),
      })
      .parse(request.body);
    const created = await createOrganizationInvitation(prisma, {
      email: body.email,
      role: body.role,
      organizationId: body.organizationId,
      createOrganization: body.createOrganization,
      newOrganizationName: body.newOrganizationName,
      invitedByUserId: request.user.id,
      ttlHours: body.ttlHours,
    });
    if ("error" in created) throw validationError(created.error ?? "Invitation failed");
    return success({
      invitationId: created.invitationId,
      token: created.token,
      expiresAt: created.expiresAt.toISOString(),
      note: "Share token out-of-band. Accepting via Google does not create a SaaS tenant per advertiser unless createOrganization was set by staff.",
    });
  });

  fastify.post("/auth/forgot-password", async (request) => {
    const body = forgotPasswordBodySchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (user && !user.deactivatedAt && user.passwordHash) {
      await issuePasswordResetToken(user.id);
    }
    return success({
      ok: true,
      message:
        "If that email has an Atlas account, ask your Skyarc admin for a reset link, or use a link they already shared.",
    });
  });

  fastify.post("/auth/reset-password", async (request) => {
    const body = resetPasswordBodySchema.parse(request.body);
    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashPasswordResetToken(body.token) },
      include: { user: true },
    });
    if (
      !stored ||
      stored.deviceLabel !== PASSWORD_RESET_DEVICE_LABEL ||
      stored.revokedAt ||
      stored.expiresAt < new Date()
    ) {
      throw unauthorized("Reset link is invalid or expired");
    }
    if (stored.user.deactivatedAt) throw unauthorized("Account is deactivated");
    const passwordHash = await argon2.hash(body.password);
    await prisma.$transaction([
      prisma.user.update({ where: { id: stored.userId }, data: { passwordHash } }),
      prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } }),
      prisma.refreshToken.updateMany({
        where: {
          userId: stored.userId,
          revokedAt: null,
          NOT: { deviceLabel: PASSWORD_RESET_DEVICE_LABEL },
        },
        data: { revokedAt: new Date() },
      }),
    ]);
    return success({
      ok: true,
      email: stored.user.email,
      message: "Password updated. You can sign in with your new password.",
    });
  });
}
