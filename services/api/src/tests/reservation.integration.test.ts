import { describe, expect, it } from "vitest";
import {
  describeIntegration,
  useReservationFixture,
} from "./helpers/integration-db.js";
import {
  holdInventoryForCampaign,
  releaseInventoryForCampaign,
} from "../lib/media-planning/run-optimization.js";
import {
  applyVendorItemDecisions,
  expireStaleHolds,
} from "../lib/booking/reserve.js";
import { amendBooking } from "../lib/booking/amend.js";
import { assertSameTenant } from "../lib/tenant-context.js";
import { UserRole } from "@skyarc/shared";

describeIntegration("reservation safety (postgres)", () => {
  const ctx = useReservationFixture();

  it("allows only one of two concurrent holds for the last static slot", async () => {
    const { prisma, ids } = ctx;
    const [a, b] = await Promise.all([
      holdInventoryForCampaign(prisma, ids.campaignA, [ids.inventoryA], "hold", {
        tenantOrganizationId: ids.orgA,
        actorUserId: ids.userA,
        idempotencyKey: `conc-a-${ids.campaignA}`,
        syncBooking: true,
      }),
      holdInventoryForCampaign(prisma, ids.campaignB, [ids.inventoryA], "hold", {
        tenantOrganizationId: ids.orgA,
        actorUserId: ids.userA,
        idempotencyKey: `conc-b-${ids.campaignB}`,
        syncBooking: true,
      }),
    ]);

    const winners = [a, b].filter((r) => r.held.includes(ids.inventoryA));
    const losers = [a, b].filter((r) => r.skipped.includes(ids.inventoryA));
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);

    const windows = await prisma.availabilityWindow.findMany({
      where: {
        inventoryId: ids.inventoryA,
        status: "HELD",
      },
    });
    expect(windows).toHaveLength(1);

    await releaseInventoryForCampaign(prisma, ids.campaignA, [ids.inventoryA], {
      reason: "test_cleanup",
    });
    await releaseInventoryForCampaign(prisma, ids.campaignB, [ids.inventoryA], {
      reason: "test_cleanup",
    });
  });

  it("is idempotent on retry with the same key", async () => {
    const { prisma, ids } = ctx;
    const key = `idem-${ids.campaignA}`;
    const first = await holdInventoryForCampaign(prisma, ids.campaignA, [ids.inventoryDigital], "hold", {
      tenantOrganizationId: ids.orgA,
      idempotencyKey: key,
      syncBooking: true,
    });
    const second = await holdInventoryForCampaign(prisma, ids.campaignA, [ids.inventoryDigital], "hold", {
      tenantOrganizationId: ids.orgA,
      idempotencyKey: key,
      syncBooking: true,
    });
    expect(first.bookingId).toBeTruthy();
    expect(second.bookingId).toBe(first.bookingId);
    await releaseInventoryForCampaign(prisma, ids.campaignA, [ids.inventoryDigital], {
      reason: "test_cleanup",
    });
  });

  it("restores capacity after hold expiry", async () => {
    const { prisma, ids } = ctx;
    const hold = await holdInventoryForCampaign(prisma, ids.campaignA, [ids.inventoryA], "hold", {
      tenantOrganizationId: ids.orgA,
      syncBooking: true,
    });
    expect(hold.held).toContain(ids.inventoryA);
    expect(hold.bookingId).toBeTruthy();

    await prisma.availabilityWindow.updateMany({
      where: { inventoryId: ids.inventoryA, status: "HELD" },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    await prisma.booking.update({
      where: { id: hold.bookingId! },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const expired = await expireStaleHolds(prisma);
    expect(expired.expiredWindows).toBeGreaterThanOrEqual(1);

    const again = await holdInventoryForCampaign(prisma, ids.campaignB, [ids.inventoryA], "hold", {
      tenantOrganizationId: ids.orgA,
      syncBooking: true,
    });
    expect(again.held).toContain(ids.inventoryA);
    await releaseInventoryForCampaign(prisma, ids.campaignB, [ids.inventoryA], {
      reason: "test_cleanup",
    });
  });

  it("supports partial vendor approval without releasing other items", async () => {
    const { prisma, ids } = ctx;
    const hold = await holdInventoryForCampaign(
      prisma,
      ids.campaignA,
      [ids.inventoryA, ids.inventoryDigital],
      "hold",
      {
        tenantOrganizationId: ids.orgA,
        requireVendorApproval: true,
        syncBooking: true,
      }
    );
    expect(hold.held.length).toBe(2);
    expect(hold.bookingId).toBeTruthy();

    await applyVendorItemDecisions(prisma, {
      bookingId: hold.bookingId!,
      vendorOrganizationId: ids.orgA,
      inventoryIds: [ids.inventoryA],
      action: "REJECT",
      actorUserId: ids.userA,
    });

    const booking = await prisma.booking.findUnique({
      where: { id: hold.bookingId! },
      include: { items: true },
    });
    const rejected = booking?.items.find((i) => i.inventoryId === ids.inventoryA);
    const pending = booking?.items.find((i) => i.inventoryId === ids.inventoryDigital);
    expect(rejected?.status).toBe("REJECTED");
    expect(pending?.status).toBe("PENDING_VENDOR_APPROVAL");

    const digitalWindow = await prisma.availabilityWindow.findFirst({
      where: { inventoryId: ids.inventoryDigital, campaignId: ids.campaignA },
    });
    expect(digitalWindow).toBeTruthy();

    await releaseInventoryForCampaign(
      prisma,
      ids.campaignA,
      [ids.inventoryA, ids.inventoryDigital],
      { reason: "test_cleanup" }
    );
  });

  it("preserves booking when amendment fails for capacity", async () => {
    const { prisma, ids } = ctx;
    // Fill static inventory with campaign B
    await holdInventoryForCampaign(prisma, ids.campaignB, [ids.inventoryA], "book", {
      tenantOrganizationId: ids.orgA,
      syncBooking: true,
    });

    const hold = await holdInventoryForCampaign(prisma, ids.campaignA, [ids.inventoryDigital], "hold", {
      tenantOrganizationId: ids.orgA,
      syncBooking: true,
    });
    expect(hold.bookingId).toBeTruthy();

    const before = await prisma.bookingItem.count({ where: { bookingId: hold.bookingId! } });
    const result = await amendBooking(prisma, {
      bookingId: hold.bookingId!,
      actorUserId: ids.userA,
      addInventoryIds: [ids.inventoryA],
    });
    expect(result && "error" in result).toBe(true);
    const after = await prisma.bookingItem.count({ where: { bookingId: hold.bookingId! } });
    expect(after).toBe(before);

    await releaseInventoryForCampaign(prisma, ids.campaignA, [ids.inventoryDigital], {
      reason: "test_cleanup",
    });
    await releaseInventoryForCampaign(prisma, ids.campaignB, [ids.inventoryA], {
      reason: "test_cleanup",
    });
  });

  it("denies cross-tenant quote/booking access via assertSameTenant", () => {
    const foreignUser = {
      id: "u",
      role: UserRole.VENDOR,
      organizationId: ctx.ids.orgB,
    };
    expect(() => assertSameTenant(foreignUser, ctx.ids.orgA)).toThrow(/Cross-tenant|forbidden/i);
  });
});
