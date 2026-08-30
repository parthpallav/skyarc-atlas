import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { loadEnv, parseCorsOrigins } from "@skyarc/config";
import { API_PREFIX } from "@skyarc/shared";
import authPlugin from "./plugins/auth.js";
import errorHandler from "./plugins/error-handler.js";
import openapiPlugin from "./plugins/openapi.js";
import { createStorageProvider } from "./lib/storage/index.js";
import { createAIProvider } from "./lib/ai/index.js";
import { authRoutes } from "./modules/auth/routes.js";
import { userRoutes } from "./modules/users/routes.js";
import { locationRoutes } from "./modules/locations/routes.js";
import { surveyRoutes } from "./modules/surveys/routes.js";
import { assetRoutes } from "./modules/assets/routes.js";
import { screenRoutes } from "./modules/screens/routes.js";
import { intelligenceRoutes } from "./modules/intelligence/routes.js";
import { organizationRoutes } from "./modules/organizations/routes.js";
import { platformRoutes } from "./modules/platform/routes.js";
import { inventoryRoutes } from "./modules/inventory/routes.js";
import { campaignRoutes, mediaPlanRoutes } from "./modules/media-plans/routes.js";
import { startAnalysisRunner } from "./workers/analysis-runner.js";
import { success } from "./lib/response.js";

export async function buildApp() {
  const env = loadEnv();
  const fastify = Fastify({ logger: true });
  const storage = createStorageProvider(env);
  const ai = createAIProvider(env);

  await fastify.register(helmet);
  await fastify.register(cors, { origin: parseCorsOrigins(env.CORS_ORIGINS) });
  await fastify.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  await fastify.register(errorHandler);
  await fastify.register(openapiPlugin);
  await fastify.register(authPlugin, { env });

  fastify.get("/health", async () =>
    success({ status: "ok", timestamp: new Date().toISOString() })
  );

  await fastify.register(
    async (api) => {
      await authRoutes(api, env);
      await userRoutes(api);
      await locationRoutes(api, env);
      await surveyRoutes(api);
      await assetRoutes(api, storage, env);
      await screenRoutes(api);
      await intelligenceRoutes(api, ai);
      await organizationRoutes(api);
      await platformRoutes(api);
      await inventoryRoutes(api);
      await campaignRoutes(api, ai);
      await mediaPlanRoutes(api, env);
    },
    { prefix: API_PREFIX }
  );

  if (env.NODE_ENV !== "test") {
    startAnalysisRunner(env);
  }

  return fastify;
}
