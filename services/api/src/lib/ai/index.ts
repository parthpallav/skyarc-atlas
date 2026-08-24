import type { Env } from "@skyarc/config";
import { createOpenRouterProvider } from "./openrouter.js";
import { createStubAIProvider } from "./stub.js";
import type { AIProvider } from "./types.js";

export function createAIProvider(env: Env): AIProvider {
  if (env.AI_PROVIDER === "openrouter" && env.OPENROUTER_API_KEY) {
    return createOpenRouterProvider(env);
  }
  return createStubAIProvider(env);
}

export type { AIProvider } from "./types.js";
