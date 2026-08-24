import type { Env } from "@skyarc/config";
import { AppError } from "../errors.js";
import type { AIProvider } from "./types.js";

export function createStubAIProvider(env: Env): AIProvider {
  return {
    async completeStructured({ operation }) {
      throw new AppError(
        "AI_NOT_CONFIGURED",
        `AI provider '${env.AI_PROVIDER}' cannot complete operation ${operation}`,
        503
      );
    },
  };
}
