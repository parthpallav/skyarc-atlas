import { z } from "zod";
import { SAMPLE_CAMPAIGN_BRIEF } from "@skyarc/shared";

export function parseBudgetField(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value !== "string") return undefined;

  const raw = value.trim().toLowerCase().replace(/[,₹\s]/g, "");
  if (/^\d+(\.\d+)?(l|lac|lakh)s?$/.test(raw)) {
    const n = parseFloat(raw);
    return Number.isNaN(n) ? undefined : Math.round(n * 100_000);
  }
  if (/^\d+(\.\d+)?(cr|crore)s?$/.test(raw)) {
    const n = parseFloat(raw);
    return Number.isNaN(n) ? undefined : Math.round(n * 10_000_000);
  }

  const n = Number(raw);
  return Number.isNaN(n) ? undefined : n;
}

export function parseDurationField(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "number" && !Number.isNaN(value)) return Math.round(value);
  if (typeof value !== "string") return undefined;
  const match = value.match(/\d+/);
  if (!match) return undefined;
  const n = Number(match[0]);
  return Number.isNaN(n) ? undefined : n;
}

export const campaignBriefParseSchema = z.object({
  targetAudience: z.string().optional(),
  budget: z.preprocess(parseBudgetField, z.number().optional()),
  durationDays: z.preprocess(parseDurationField, z.number().int().optional()),
  brandCategory: z.string().optional(),
  geographicFocus: z.array(z.string()).default([]),
  categories: z.array(z.string()).default([]),
  objectives: z.array(z.string()).default([]),
  kpis: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
});

export type ParsedCampaignBrief = z.infer<typeof campaignBriefParseSchema>;

const OUTPUT_SCHEMA = `{
  "targetAudience": "string — one concise paragraph",
  "budget": number — total INR media budget as integer (e.g. 1200000 for ₹12 lakh). Never a string.",
  "durationDays": number — campaign flight length in days,
  "brandCategory": "string — industry/vertical",
  "geographicFocus": ["city, corridor, or area names"],
  "categories": ["product or media categories"],
  "objectives": ["primary campaign goals"],
  "kpis": ["measurable success metrics"],
  "constraints": ["exclusions, brand safety, format rules"]
}`;

const FEW_SHOT_OUTPUT: ParsedCampaignBrief = {
  targetAudience:
    "Age 22–40, SEC A/B/C Gujarati-speaking households, students, and commuters; value-seekers responsive to monsoon and local cues.",
  budget: 1_200_000,
  durationDays: 45,
  brandCategory: "Food & Beverage / FMCG",
  geographicFocus: [
    "Rajkot — Kalawad Road",
    "University Road",
    "150 Feet Ring Road",
    "Gondal Road corridor",
  ],
  categories: ["Static hoardings", "Large format OOH"],
  objectives: [
    "Drive trial of Monsoon Masala Bites SKU",
    "Build aided brand recall pre-monsoon",
    "Increase store footfall near hoarding clusters",
  ],
  kpis: [
    "Approach-route reach 7–10 AM and 5–9 PM",
    "Location score ≥ 60 where available",
    "+15% aided recall in Rajkot test cell",
  ],
  constraints: [
    "No sites within 200 m of schools",
    "Prefer well-lit evening visibility",
    "Avoid junctions dominated by CrunchCo / SnackZone",
  ],
};

export function buildCampaignBriefParsePrompt(briefText: string): {
  system: string;
  user: string;
} {
  return {
    system: `You are a senior DOOH media strategist at Skyarc Atlas. Extract structured campaign requirements from client briefs for out-of-home (billboard/hoarding) planning in India.

Rules:
- Return ONLY valid JSON matching the schema below. No markdown, no commentary.
- budget MUST be a JSON number in INR (integer). Convert "12 lakh" → 1200000, "5L" → 500000, "1.2 crore" → 12000000.
- durationDays MUST be a JSON number (integer days).
- geographicFocus: list specific roads, corridors, cities, or exclusions mentioned.
- objectives: business outcomes; kpis: measurable metrics; constraints: exclusions and format rules.
- If a field is not stated, omit it or use an empty array for list fields.
- Infer brandCategory from advertiser/product context when obvious.

Output schema:
${OUTPUT_SCHEMA}`,

    user: `Extract requirements from this campaign brief:

---
${briefText}
---

Example (for format only — do not copy values unless they appear in the brief above):

Brief excerpt:
${SAMPLE_CAMPAIGN_BRIEF.slice(0, 400)}...

Expected JSON shape:
${JSON.stringify(FEW_SHOT_OUTPUT, null, 2)}`,
  };
}
