import { z } from "zod";
import type { Env } from "@skyarc/config";
import type { AIProvider } from "./types.js";
import { buildStructuredPrompt } from "./prompts.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export function createOpenRouterProvider(env: Env): AIProvider {
  if (!env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is required for OpenRouter provider");
  }

  return {
    async completeStructured({ operation, schema, input }) {
      const start = Date.now();
      const { system, user } = buildStructuredPrompt(operation, input);
      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: env.AI_MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
          temperature: 0.2,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenRouter error: ${response.status}`);
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content ?? "{}";
      const parsed = schema.parse(JSON.parse(content) as unknown);

      return {
        data: parsed,
        confidence: 0.7,
        model: env.AI_MODEL,
        provider: "openrouter",
        latencyMs: Date.now() - start,
      };
    },
  };
}

export const locationImageAnalysisSchema = z.object({
  visibility: z.number().min(0).max(100).optional(),
  visualCompetition: z.number().min(0).max(100).optional(),
  summary: z.string().optional(),
  attributes: z
    .array(
      z.object({
        key: z.string(),
        value: z.unknown(),
        confidence: z.number().min(0).max(1),
      })
    )
    .default([]),
});
