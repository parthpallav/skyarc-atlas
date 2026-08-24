import fp from "fastify-plugin";
import type { FastifyError } from "fastify";
import { ZodError } from "zod";
import { AppError } from "../lib/errors.js";

export default fp(async (fastify) => {
  fastify.setErrorHandler((error: FastifyError | AppError | ZodError, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request",
          details: error.errors.map((e) => ({
            path: e.path.join("."),
            message: e.message,
          })),
        },
      });
    }

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      });
    }

    fastify.log.error(error);
    return reply.status(error.statusCode ?? 500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error",
        details: [],
      },
    });
  });
});
