import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import argon2 from "argon2";
import type { Env } from "@skyarc/config";
import {
  loginBodySchema,
  refreshBodySchema,
} from "@skyarc/validation";
import { prisma } from "../../lib/prisma.js";
import { success } from "../../lib/response.js";
import { unauthorized } from "../../lib/errors.js";

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

export async function authRoutes(fastify: FastifyInstance, env: Env) {
  fastify.post("/auth/login", async (request) => {
    const body = loginBodySchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || user.deactivatedAt) throw unauthorized("Invalid credentials");

    const valid = await argon2.verify(user.passwordHash, body.password);
    if (!valid) throw unauthorized("Invalid credentials");

    const accessToken = fastify.jwt.sign(
      { id: user.id, role: user.role, email: user.email },
      { expiresIn: env.JWT_ACCESS_EXPIRES_IN }
    );

    const refreshToken = randomBytes(48).toString("hex");
    const expiresIn = parseExpiry(env.JWT_REFRESH_EXPIRES_IN);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        deviceLabel: body.deviceLabel,
        expiresAt: new Date(Date.now() + expiresIn * 1000),
      },
    });

    return success({
      accessToken,
      refreshToken,
      expiresIn: parseExpiry(env.JWT_ACCESS_EXPIRES_IN),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  });

  fastify.post("/auth/refresh", async (request) => {
    const body = refreshBodySchema.parse(request.body);
    const tokenHash = hashToken(body.refreshToken);
    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw unauthorized("Invalid refresh token");
    }

    const user = stored.user;
    if (user.deactivatedAt) throw unauthorized("Invalid refresh token");

    const accessToken = fastify.jwt.sign(
      { id: user.id, role: user.role, email: user.email },
      { expiresIn: env.JWT_ACCESS_EXPIRES_IN }
    );

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
    }
    return success({ ok: true });
  });
}
