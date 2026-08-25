import type { FastifyInstance } from "fastify";
import argon2 from "argon2";
import {
  createUserBodySchema,
  paginationQuerySchema,
  updateUserBodySchema,
  uuidSchema,
} from "@skyarc/validation";
import { prisma } from "../../lib/prisma.js";
import { success, listMeta, toIso } from "../../lib/response.js";
import { canManageUsers, isReadOnly } from "../../lib/rbac.js";
import { forbidden, notFound } from "../../lib/errors.js";

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
    if (body.password) data.passwordHash = await argon2.hash(body.password);
    const user = await prisma.user.update({ where: { id }, data });
    return success(serializeUser(user));
  });
}

export { isReadOnly };
