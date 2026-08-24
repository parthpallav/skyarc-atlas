import type { AIOperation } from "@skyarc/shared";
import { buildCampaignBriefParsePrompt } from "./campaign-brief-parse.js";

export function buildStructuredPrompt(
  operation: AIOperation,
  input: unknown
): { system: string; user: string } {
  if (operation === "CAMPAIGN_BRIEF_PARSE") {
    const text =
      typeof input === "object" && input !== null && "text" in input
        ? String((input as { text: string }).text)
        : String(input);
    return buildCampaignBriefParsePrompt(text);
  }

  return {
    system:
      "You are a structured data extractor for DOOH location intelligence. Respond with valid JSON only.",
    user: `Operation: ${operation}\nInput: ${JSON.stringify(input)}\nReturn JSON matching the requested schema.`,
  };
}
