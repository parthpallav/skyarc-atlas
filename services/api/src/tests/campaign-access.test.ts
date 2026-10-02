import { describe, expect, it } from "vitest";
import { decideCampaignAccess } from "../lib/campaign-access.js";
import { UserRole } from "@skyarc/shared";

describe("decideCampaignAccess", () => {
  const campaign = { createdByUserId: "owner-1" };

  it("allows internals", () => {
    expect(
      decideCampaignAccess(
        { id: "a", role: UserRole.ADMIN, organizationId: null },
        campaign
      )
    ).toBe("allow");
  });

  it("denies client on foreign campaign", () => {
    expect(
      decideCampaignAccess(
        { id: "other", role: UserRole.CLIENT_VIEWER, organizationId: "org" },
        campaign
      )
    ).toBe("deny");
  });

  it("allows client owner", () => {
    expect(
      decideCampaignAccess(
        { id: "owner-1", role: UserRole.CLIENT_VIEWER, organizationId: "org" },
        campaign
      )
    ).toBe("allow");
  });

  it("allows vendor with inventory even if not owner", () => {
    expect(
      decideCampaignAccess(
        { id: "v", role: UserRole.VENDOR, organizationId: "vend" },
        campaign,
        { vendorHasInventory: true }
      )
    ).toBe("allow");
  });

  it("denies vendor without inventory on foreign campaign", () => {
    expect(
      decideCampaignAccess(
        { id: "v", role: UserRole.VENDOR, organizationId: "vend" },
        campaign,
        { vendorHasInventory: false }
      )
    ).toBe("deny");
  });
});
