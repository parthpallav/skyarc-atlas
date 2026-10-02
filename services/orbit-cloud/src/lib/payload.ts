/**
 * Orbit-local copy of 7b.v1 telemetry schema (keeps Orbit unit suite free of
 * workspace link flakiness). Must stay aligned with packages/validation.
 */
import { z } from "zod";

const uuid = z.string().uuid();

export const MAX_ORBIT_TELEMETRY_BYTES = 16_384;

/** Remove auth material before durable persistence — never store device secrets. */
export function scrubSecretsFromPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const clone = { ...(payload as Record<string, unknown>) };
  if (clone.typedValues && typeof clone.typedValues === "object" && !Array.isArray(clone.typedValues)) {
    const tv = { ...(clone.typedValues as Record<string, unknown>) };
    delete tv.__mqttSecret;
    delete tv.__auth;
    delete tv.deviceSecret;
    clone.typedValues = tv;
  }
  delete clone.deviceSecret;
  delete clone.__mqttSecret;
  return clone;
}

export const orbitTelemetryPayloadV1Schema = z
  .object({
    schemaVersion: z.literal("7b.v1"),
    eventId: uuid,
    deviceId: uuid,
    bootId: z.string().min(1).max(64),
    sessionId: z.string().min(1).max(64),
    sequence: z.number().int().min(0),
    observedAt: z.string().datetime(),
    firmwareVersion: z.string().min(1).max(64),
    measurementType: z.string().min(1).max(64),
    value: z.union([z.number(), z.string(), z.boolean(), z.null()]),
    unit: z.string().max(32).nullable().optional(),
    typedValues: z.record(z.union([z.number(), z.string(), z.boolean(), z.null()])).optional(),
    sensorModelVersion: z.string().max(64).nullable().optional(),
    confidence: z.number().min(0).max(1).nullable().optional(),
    qualityFlags: z.array(z.string().max(32)).max(20).optional(),
    creativeId: z.string().uuid().nullable().optional(),
    campaignId: z.string().uuid().nullable().optional(),
    includesImage: z.literal(false).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.measurementType === "playback") {
      if (!val.creativeId && !val.campaignId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Playback evidence requires creativeId and/or campaignId from supported CMS/player",
          path: ["creativeId"],
        });
      }
    }
  });
