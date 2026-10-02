/**
 * Detect continuity disruptions from authoritative Atlas records only.
 * Never infer screen outages from missing Orbit telemetry.
 */

export type ContinuityTriggerType =
  | "VENDOR_REJECTION"
  | "INVENTORY_UNAVAILABLE"
  | "OPS_INCIDENT"
  | "LAUNCH_BLOCKED";

export type ContinuityDisruption = {
  triggerType: ContinuityTriggerType;
  triggerKey: string;
  campaignId: string;
  bookingId: string;
  bookingItemId: string;
  inventoryId: string;
  locationId: string | null;
  inventoryType: string | null;
  city: string | null;
  observedAt: Date;
  explanation: string;
};

export function disruptionFromRejectedItem(input: {
  campaignId: string;
  bookingId: string;
  bookingItemId: string;
  inventoryId: string;
  locationId: string | null;
  inventoryType: string | null;
  city: string | null;
  observedAt?: Date;
}): ContinuityDisruption {
  return {
    triggerType: "VENDOR_REJECTION",
    triggerKey: `continuity:vendor_reject:${input.bookingItemId}`,
    campaignId: input.campaignId,
    bookingId: input.bookingId,
    bookingItemId: input.bookingItemId,
    inventoryId: input.inventoryId,
    locationId: input.locationId,
    inventoryType: input.inventoryType,
    city: input.city,
    observedAt: input.observedAt ?? new Date(),
    explanation: "Vendor rejected this booking item — capacity was released for this face.",
  };
}

export function disruptionFromBlockedLaunch(input: {
  campaignId: string;
  bookingId: string;
  bookingItemId: string;
  inventoryId: string;
  locationId: string | null;
  inventoryType: string | null;
  city: string | null;
  blockedReason?: string | null;
  observedAt?: Date;
}): ContinuityDisruption {
  return {
    triggerType: "LAUNCH_BLOCKED",
    triggerKey: `continuity:launch_blocked:${input.bookingItemId}`,
    campaignId: input.campaignId,
    bookingId: input.bookingId,
    bookingItemId: input.bookingItemId,
    inventoryId: input.inventoryId,
    locationId: input.locationId,
    inventoryType: input.inventoryType,
    city: input.city,
    observedAt: input.observedAt ?? new Date(),
    explanation:
      input.blockedReason?.trim() ||
      "Launch verification is blocked — campaign item cannot go live until resolved or replaced.",
  };
}

export function disruptionFromOpsIncident(input: {
  campaignId: string;
  bookingId: string;
  bookingItemId: string;
  inventoryId: string;
  locationId: string | null;
  inventoryType: string | null;
  city: string | null;
  observedAt?: Date;
}): ContinuityDisruption {
  return {
    triggerType: "OPS_INCIDENT",
    triggerKey: `continuity:ops_incident:${input.bookingItemId}`,
    campaignId: input.campaignId,
    bookingId: input.bookingId,
    bookingItemId: input.bookingItemId,
    inventoryId: input.inventoryId,
    locationId: input.locationId,
    inventoryType: input.inventoryType,
    city: input.city,
    observedAt: input.observedAt ?? new Date(),
    explanation: "Approved operational incident task is open — continuity replacement may be required.",
  };
}

export const RULE_VERSION = "7a.v1";
