import fp from "fastify-plugin";
import fjwt from "@fastify/jwt";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Env } from "@skyarc/config";
import { unauthorized } from "../lib/errors.js";
import type { AuthUser } from "../lib/rbac.js";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user: AuthUser;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AuthUser;
    user: AuthUser;
  }
}

export default fp(async (fastify, opts: { env: Env }) => {
  await fastify.register(fjwt, {
    secret: opts.env.JWT_ACCESS_SECRET,
  });

  fastify.decorate(
    "authenticate",
    async (request: FastifyRequest, _reply: FastifyReply) => {
      try {
        await request.jwtVerify();
      } catch {
        throw unauthorized();
      }
    }
  );
});
