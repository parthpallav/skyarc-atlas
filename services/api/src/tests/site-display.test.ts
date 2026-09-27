import { describe, expect, it } from "vitest";
import {
  buildSiteCreativeSpec,
  customerSitePlaceName,
  locationBookingBadge,
  looksLikeVendorCode,
  publicSkyarcSiteCode,
  siteLabelForAudience,
  stripVendorCodeFromTitle,
} from "@skyarc/shared";

describe("customer site display", () => {
  it("strips vendor IIDs from titles", () => {
    expect(stripVendorCodeFromTitle("H-0101 — 150 Feet Ring Road")).toBe("150 Feet Ring Road");
    expect(stripVendorCodeFromTitle("G-1524 — Amin Marg")).toBe("Amin Marg");
    expect(stripVendorCodeFromTitle("SKY-K-01 — Gondal Road")).toBe("Gondal Road");
    expect(stripVendorCodeFromTitle("150 Feet Ring Road")).toBe("150 Feet Ring Road");
  });

  it("does not treat Skyarc public codes as vendor codes", () => {
    expect(looksLikeVendorCode("SKY-RAJ-003")).toBe(false);
    expect(looksLikeVendorCode("H-0101")).toBe(true);
    expect(publicSkyarcSiteCode("SKY-RAJ-003", "abcd")).toBe("SKY-RAJ-003");
  });

  it("falls back to road when the title is only a vendor code", () => {
    expect(customerSitePlaceName({ name: "H-0101", road: "Kalawad Road" })).toBe("Kalawad Road");
  });

  it("shows place names to customers and vendor prefixes internally", () => {
    const loc = { name: "H-0101 — Kalawad Road", skyarcSiteCode: "SKY-RAJ-009", id: "x" };
    expect(siteLabelForAudience(loc, true)).toBe("Kalawad Road");
    expect(siteLabelForAudience(loc, false)).toBe("H-0101");
  });

  it("badges locations as available, on hold, or unavailable", () => {
    const now = new Date("2026-09-09T00:00:00Z");
    expect(
      locationBookingBadge({
        now,
        inventories: [{ status: "AVAILABLE", availabilityWindows: [] }],
      })
    ).toBe("AVAILABLE");
    expect(
      locationBookingBadge({
        now,
        inventories: [
          {
            status: "AVAILABLE",
            inventoryType: "STATIC_BILLBOARD",
            availabilityWindows: [
              { status: "HELD", startDate: "2026-09-01", endDate: "2026-09-30" },
            ],
          },
        ],
      })
    ).toBe("ON_HOLD");
    expect(
      locationBookingBadge({
        now,
        inventories: [
          {
            status: "AVAILABLE",
            inventoryType: "STATIC_BILLBOARD",
            availabilityWindows: [
              { status: "BOOKED", startDate: "2026-09-01", endDate: "2026-09-30" },
            ],
          },
        ],
      })
    ).toBe("UNAVAILABLE");
  });

  it("keeps digital sites available when only some slots are booked", () => {
    const now = new Date("2026-09-09T00:00:00Z");
    expect(
      locationBookingBadge({
        now,
        startDate: new Date("2026-09-01T00:00:00Z"),
        endDate: new Date("2026-09-30T23:59:59Z"),
        inventories: [
          {
            status: "AVAILABLE",
            inventoryType: "DIGITAL_BILLBOARD",
            slotCapacity: 6,
            availabilityWindows: [
              {
                status: "BOOKED",
                startDate: "2026-09-01",
                endDate: "2026-09-30",
                slotsConsumed: 1,
              },
            ],
          },
        ],
      })
    ).toBe("AVAILABLE");
  });

  it("marks digital unavailable only when every slot is taken", () => {
    const now = new Date("2026-09-09T00:00:00Z");
    expect(
      locationBookingBadge({
        now,
        startDate: new Date("2026-09-01T00:00:00Z"),
        endDate: new Date("2026-09-30T23:59:59Z"),
        inventories: [
          {
            status: "AVAILABLE",
            inventoryType: "DIGITAL_BILLBOARD",
            slotCapacity: 6,
            availabilityWindows: [
              {
                status: "BOOKED",
                startDate: "2026-09-01",
                endDate: "2026-09-30",
                slotsConsumed: 6,
              },
            ],
          },
        ],
      })
    ).toBe("UNAVAILABLE");
  });

  it("builds a size-based creative spec", () => {
    const spec = buildSiteCreativeSpec({
      inventoryType: "DIGITAL",
      lighting: "Front-lit",
      widthFt: 20,
      heightFt: 10,
    });
    expect(spec).toContain("20×10 ft");
    expect(spec).toContain("digital");
  });
});
