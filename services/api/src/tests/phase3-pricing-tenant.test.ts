import { describe, expect, it } from "vitest";
import { selectRateSegmentsForFlight } from "../lib/booking/rate-segments.js";
import { customerSafePriceBreakdown } from "../lib/booking/customer-safe-price.js";
import { resolvePaymentAdapter, UnavailablePaymentAdapter } from "../lib/booking/payment-adapter.js";
import { assertSameTenant, requireTenantUnlessInternal } from "../lib/tenant-context.js";
import { UserRole } from "@skyarc/shared";
import type { PriceBreakdown } from "@skyarc/shared";

describe("rate segments for flight", () => {
  it("splits mid-flight rate changes", () => {
    const segments = selectRateSegmentsForFlight(
      [
        {
          id: "r1",
          amount: 100_000,
          period: "monthly",
          effectiveFrom: new Date("2026-01-01"),
          effectiveTo: new Date("2026-10-31"),
        },
        {
          id: "r2",
          amount: 120_000,
          period: "monthly",
          effectiveFrom: new Date("2026-11-01"),
          effectiveTo: null,
        },
      ],
      new Date("2026-10-20"),
      new Date("2026-11-10")
    );
    expect(segments.length).toBeGreaterThanOrEqual(2);
    expect(segments[0]!.amount).toBe(100_000);
    expect(segments[1]!.amount).toBe(120_000);
  });

  it("returns empty when no overlapping cards", () => {
    const segments = selectRateSegmentsForFlight(
      [
        {
          amount: 50_000,
          period: "monthly",
          effectiveFrom: new Date("2025-01-01"),
          effectiveTo: new Date("2025-06-01"),
        },
      ],
      new Date("2026-10-01"),
      new Date("2026-10-15")
    );
    expect(segments).toHaveLength(0);
  });
});

describe("customer-safe price", () => {
  it("strips margin and vendor cost lines/meta", () => {
    const price: PriceBreakdown = {
      currency: "INR",
      model: "PER_SCREEN_DAY",
      lines: [
        { code: "BASE_MEDIA", label: "Base", amount: 1000, kind: "charge" },
        { code: "MARGIN", label: "Margin", amount: 200, kind: "charge" },
        { code: "VENDOR_COST", label: "Cost", amount: 500, kind: "info" },
      ],
      subtotal: 1000,
      tax: 180,
      total: 1180,
      meta: {
        baseRateAmount: 1000,
        marginPercent: 20,
        vendorCost: 500,
        playsPerDay: 60,
      },
    };
    const safe = customerSafePriceBreakdown(price);
    expect(safe.lines.map((l) => l.code)).toEqual(["BASE_MEDIA"]);
    expect(safe.meta.marginPercent).toBeUndefined();
    expect(safe.meta.vendorCost).toBeUndefined();
    expect(safe.meta.baseRateAmount).toBe(1000);
  });
});

describe("payment adapter", () => {
  it("reports UNAVAILABLE without credentials", async () => {
    const prevR = process.env.RAZORPAY_KEY_ID;
    const prevS = process.env.STRIPE_SECRET_KEY;
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    delete process.env.STRIPE_SECRET_KEY;
    const adapter = resolvePaymentAdapter();
    expect(adapter).toBeInstanceOf(UnavailablePaymentAdapter);
    const intent = await adapter.createIntent({
      bookingId: "b",
      amountMinor: 1000,
      currency: "INR",
      idempotencyKey: "k",
    });
    expect(intent.status).toBe("UNAVAILABLE");
    if (prevR) process.env.RAZORPAY_KEY_ID = prevR;
    if (prevS) process.env.STRIPE_SECRET_KEY = prevS;
  });
});

describe("tenant enforcement helpers", () => {
  it("requires organization for non-internal users", () => {
    expect(() =>
      requireTenantUnlessInternal({ id: "1", role: UserRole.VENDOR, organizationId: null })
    ).toThrow();
    expect(
      requireTenantUnlessInternal({
        id: "1",
        role: UserRole.ADMIN,
        organizationId: null,
      })
    ).toBeNull();
  });

  it("blocks cross-tenant resource access", () => {
    expect(() =>
      assertSameTenant(
        { id: "1", role: UserRole.VENDOR, organizationId: "org-a" },
        "org-b"
      )
    ).toThrow(/Cross-tenant/);
    expect(() =>
      assertSameTenant(
        { id: "1", role: UserRole.VENDOR, organizationId: "org-a" },
        null
      )
    ).toThrow();
  });
});
