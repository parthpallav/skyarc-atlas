import { describe, expect, it } from "vitest";

describe("Vendor Agency & User Provisioning", () => {
  it("generates default skyarcads.com agency email slug", () => {
    const orgName = "Webpulse Media Solutions";
    const cleanSlug = orgName.toLowerCase().replace(/[^a-z0-9]/g, "");
    const email = `${cleanSlug}@skyarcads.com`;

    expect(email).toBe("webpulsemediasolutions@skyarcads.com");
  });

  it("handles custom vendor admin email if supplied", () => {
    const orgName = "VEDA Outdoor";
    const customEmail = "partner.ops@vedaoutdoor.com";
    const cleanSlug = orgName.toLowerCase().replace(/[^a-z0-9]/g, "");
    const email = customEmail.trim() || `${cleanSlug}@skyarcads.com`;

    expect(email).toBe("partner.ops@vedaoutdoor.com");
  });
});
