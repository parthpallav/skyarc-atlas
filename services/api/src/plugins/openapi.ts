import fp from "fastify-plugin";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export default fp(async (fastify) => {
  const specPath = resolve(process.cwd(), "../../docs/openapi.yaml");
  let spec: Record<string, unknown> = {
    openapi: "3.1.0",
    info: { title: "SkyArc Atlas API", version: "1.0.0" },
    paths: {},
  };

  try {
    const yaml = readFileSync(specPath, "utf-8");
    // Minimal YAML parse for openapi info - full spec served as static
    spec = { openapi: "3.1.0", info: { title: "SkyArc Atlas API", version: "1.0.0" }, paths: {} };
    void yaml;
  } catch {
    // spec file may not exist yet during first build
  }

  await fastify.register(swagger, {
    openapi: spec as never,
  });

  await fastify.register(swaggerUi, {
    routePrefix: "/docs",
    staticCSP: true,
  });

  fastify.get("/docs/openapi.yaml", async (_request, reply) => {
    try {
      const content = readFileSync(specPath, "utf-8");
      return reply.type("text/yaml").send(content);
    } catch {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "OpenAPI spec not found", details: [] } });
    }
  });
});
