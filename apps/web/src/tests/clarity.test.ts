import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  clarityCommand,
  identifyUser,
  trackPreLoginContext,
  trackEntityView,
  trackBusinessEvent,
} from "../lib/clarity-telemetry";

describe("Microsoft Clarity Telemetry Integration", () => {
  let mockClarityQueue: unknown[][];
  let mockClarityFn: any;

  beforeEach(() => {
    mockClarityQueue = [];
    mockClarityFn = vi.fn((cmd: string, ...args: unknown[]) => {
      mockClarityQueue.push([cmd, ...args]);
    });

    // Provide window and mock clarity
    (global as any).window = {
      clarity: mockClarityFn,
    };
  });

  it("clarityCommand invokes window.clarity safely", () => {
    clarityCommand("set", "test_key", "test_val");
    expect(mockClarityFn).toHaveBeenCalledWith("set", "test_key", "test_val");
  });

  it("clarityCommand buffers commands if window.clarity is not yet a function but has q queue", () => {
    const queue: unknown[][] = [];
    (global as any).window = {
      clarity: { q: queue },
    };

    clarityCommand("event", "buffered_event");
    expect(queue).toEqual([["event", "buffered_event"]]);
  });

  it("identifyUser tags user id, role, email, and organization", () => {
    identifyUser({
      id: "usr-12345",
      name: "Rudra Media",
      email: "rudra@skyarc.in",
      role: "MEDIA_PLANNER",
      organizationId: "org-999",
      organizationName: "Brandalyst",
    });

    expect(mockClarityFn).toHaveBeenCalledWith(
      "identify",
      "usr-12345",
      undefined,
      undefined,
      "Rudra Media"
    );
    expect(mockClarityFn).toHaveBeenCalledWith("set", "user_role", "MEDIA_PLANNER");
    expect(mockClarityFn).toHaveBeenCalledWith("set", "user_email", "rudra@skyarc.in");
    expect(mockClarityFn).toHaveBeenCalledWith("set", "organization_id", "org-999");
    expect(mockClarityFn).toHaveBeenCalledWith("set", "organization_name", "Brandalyst");
  });

  it("trackPreLoginContext captures query params from shared demo or pitch links", () => {
    const searchParams = new URLSearchParams("?client=brandalyst&pitch=rajkot_takeover_2026&ref=whatsapp_proposal");
    trackPreLoginContext(searchParams);

    expect(mockClarityFn).toHaveBeenCalledWith("set", "target_client", "brandalyst");
    expect(mockClarityFn).toHaveBeenCalledWith("set", "pitch_campaign", "rajkot_takeover_2026");
    expect(mockClarityFn).toHaveBeenCalledWith("set", "referral_source", "whatsapp_proposal");
  });

  it("trackEntityView tags entity metadata and triggers view event", () => {
    trackEntityView("location", {
      id: "loc-kalawad",
      name: "Kalawad Road Unipole",
      road: "Kalawad Road",
      surveyStatus: "SUBMITTED",
    });

    expect(mockClarityFn).toHaveBeenCalledWith("set", "location_id", "loc-kalawad");
    expect(mockClarityFn).toHaveBeenCalledWith("set", "location_name", "Kalawad Road Unipole");
    expect(mockClarityFn).toHaveBeenCalledWith("set", "location_road", "Kalawad Road");
    expect(mockClarityFn).toHaveBeenCalledWith("set", "location_surveyStatus", "SUBMITTED");
    expect(mockClarityFn).toHaveBeenCalledWith("event", "view_location");
  });

  it("trackBusinessEvent records custom business events and parameter tags", () => {
    trackBusinessEvent("export_media_plan_pdf", {
      planId: "plan-777",
      campaignId: "camp-888",
    });

    expect(mockClarityFn).toHaveBeenCalledWith("set", "event_planId", "plan-777");
    expect(mockClarityFn).toHaveBeenCalledWith("set", "event_campaignId", "camp-888");
    expect(mockClarityFn).toHaveBeenCalledWith("event", "export_media_plan_pdf");
  });
});
