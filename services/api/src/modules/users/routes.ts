import type { FastifyInstance } from "fastify";
import argon2 from "argon2";
import {
  createUserBodySchema,
  paginationQuerySchema,
  updateUserBodySchema,
  updateUserMeBodySchema,
  uuidSchema,
} from "@skyarc/validation";
import { prisma } from "../../lib/prisma.js";
import { success, listMeta, toIso } from "../../lib/response.js";
import { canManageUsers, isReadOnly } from "../../lib/rbac.js";
import { forbidden, notFound, validationError } from "../../lib/errors.js";

function serializeUser(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deactivatedAt: Date | null;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    organizationId: user.organizationId,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    deactivatedAt: toIso(user.deactivatedAt),
  };
}

export async function userRoutes(fastify: FastifyInstance) {
  fastify.get("/users/me", { preHandler: [fastify.authenticate] }, async (request) => {
    const user = await prisma.user.findUnique({ where: { id: request.user.id } });
    if (!user) throw notFound("User not found");
    return success(serializeUser(user));
  });

  fastify.patch("/users/me", { preHandler: [fastify.authenticate] }, async (request) => {
    const body = updateUserMeBodySchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { id: request.user.id } });
    if (!user) throw notFound("User not found");

    const data: Record<string, unknown> = {};
    if (body.name) data.name = body.name;

    if (body.email && body.email.toLowerCase() !== user.email.toLowerCase()) {
      const existing = await prisma.user.findUnique({
        where: { email: body.email.toLowerCase() },
      });
      if (existing) {
        throw validationError("Email address is already taken by another account");
      }
      data.email = body.email.toLowerCase();
    }

    if (body.newPassword) {
      const valid = await argon2.verify(user.passwordHash, body.currentPassword!);
      if (!valid) {
        throw validationError("Current password is incorrect");
      }
      data.passwordHash = await argon2.hash(body.newPassword);
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data,
    });
    return success(serializeUser(updated));
  });

  fastify.get("/users", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canManageUsers(request.user)) throw forbidden();
    const query = paginationQuerySchema.parse(request.query);
    const skip = (query.page - 1) * query.limit;
    const [users, total] = await Promise.all([
      prisma.user.findMany({ skip, take: query.limit, orderBy: { createdAt: "desc" } }),
      prisma.user.count(),
    ]);
    return success(users.map(serializeUser), listMeta(query.page, query.limit, total));
  });

  fastify.post("/users", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canManageUsers(request.user)) throw forbidden();
    const body = createUserBodySchema.parse(request.body);
    const passwordHash = await argon2.hash(body.password);
    const user = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash,
        name: body.name,
        role: body.role,
        organizationId: body.organizationId,
      },
    });
    return success(serializeUser(user));
  });

  fastify.get("/users/:id", { preHandler: [fastify.authenticate] }, async (request) => {
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw notFound("User not found");
    if (!canManageUsers(request.user) && request.user.id !== id) throw forbidden();
    return success(serializeUser(user));
  });

  fastify.patch("/users/:id", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canManageUsers(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const body = updateUserBodySchema.parse(request.body);
    const data: Record<string, unknown> = {};
    if (body.name) data.name = body.name;
    if (body.role) data.role = body.role;
    if (body.email) {
      const existing = await prisma.user.findUnique({
        where: { email: body.email.toLowerCase() },
      });
      if (existing && existing.id !== id) {
        throw validationError("Email address is already in use by another user");
      }
      data.email = body.email.toLowerCase();
    }
    if (body.password) data.passwordHash = await argon2.hash(body.password);
    const user = await prisma.user.update({ where: { id }, data });
    return success(serializeUser(user));
  });

  fastify.post("/users/:id/reset-link", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canManageUsers(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw notFound("User not found");

    // Generate activation / password reset link
    const resetToken = Buffer.from(JSON.stringify({ userId: user.id, email: user.email, exp: Date.now() + 86400000 * 7 })).toString("base64url");
    const resetLink = `https://atlas.skyarcads.com/login?resetToken=${resetToken}&email=${encodeURIComponent(user.email)}`;

    return success({
      userId: user.id,
      email: user.email,
      resetLink,
      expiresInDays: 7,
      message: "Password reset link generated successfully",
    });
  });
}

export { isReadOnly };
