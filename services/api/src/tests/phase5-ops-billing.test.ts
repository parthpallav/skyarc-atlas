import { describe, expect, it } from "vitest";
import { stepsForTemplate, templateKeyForInventory, isDigitalInventoryType } from "../lib/ops/task-templates.js";
import { canTransitionTask } from "../lib/ops/task-transitions.js";
import { validateCreativeFile } from "../lib/ops/creative.js";
import { outstandingMinor, recomputeInvoicePaymentStatus } from "../lib/billing/invoice.js";
import { validateTallyMapping } from "../lib/billing/tally-adapter.js";
import { customerProgressView } from "../lib/billing/reporting.js";
import { bridgeDeliveryConfigured, serializeReminder } from "../lib/billing/reminders.js";

describe("task templates", () => {
  it("uses digital template for LED/DIGITAL types", () => {
    expect(isDigitalInventoryType("DIGITAL")).toBe(true);
    expect(templateKeyForInventory("STATIC_BILLBOARD")).toBe("static.v1");
    expect(templateKeyForInventory("DIGITAL_SCREEN")).toBe("digital.v1");
    const digital = stepsForTemplate("digital.v1").map((s) => s.kind);
    const staticKinds = stepsForTemplate("static.v1").map((s) => s.kind);
    expect(digital).toContain("CONTENT_UPLOAD");
    expect(digital).not.toContain("MOUNTING");
    expect(staticKinds).toContain("MOUNTING");
    expect(staticKinds).not.toContain("CONTENT_UPLOAD");
  });

  it("allows valid task transitions only", () => {
    expect(canTransitionTask("READY", "IN_PROGRESS")).toBe(true);
    expect(canTransitionTask("DONE", "READY")).toBe(false);
    expect(canTransitionTask("BLOCKED", "READY")).toBe(true);
  });
});

describe("creative validation", () => {
  it("rejects oversized and wrong type", () => {
    expect(
      validateCreativeFile({ contentType: "application/zip", byteSize: 10 }).ok
    ).toBe(false);
    expect(
      validateCreativeFile({
        contentType: "image/png",
        byteSize: 200 * 1024 * 1024,
      }).ok
    ).toBe(false);
    expect(
      validateCreativeFile({
        contentType: "video/mp4",
        byteSize: 1000,
        durationMs: 15000,
      }, { requireDuration: true }).ok
    ).toBe(true);
  });
});

describe("invoice arithmetic", () => {
  it("computes outstanding and status", () => {
    const inv = {
      totalMinor: 100_000,
      amountPaidMinor: 40_000,
      amountCreditedMinor: 10_000,
      status: "ISSUED",
    };
    expect(outstandingMinor(inv)).toBe(50_000);
    expect(recomputeInvoicePaymentStatus(inv)).toBe("PARTIALLY_PAID");
    expect(
      recomputeInvoicePaymentStatus({
        ...inv,
        amountPaidMinor: 90_000,
        amountCreditedMinor: 10_000,
      })
    ).toBe("PAID");
  });
});

describe("tally mapping + reminders", () => {
  it("flags missing invoice numbers", () => {
    const r = validateTallyMapping([
      { id: "a", totalMinor: 1, invoiceNumber: "INV-1" },
      { id: "b", totalMinor: 2, invoiceNumber: null },
    ]);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/missing invoice number/);
  });

  it("never marks unsent reminder as delivered", () => {
    const s = serializeReminder({
      id: "r1",
      kind: "OVERDUE_INVOICE",
      status: "CONFIGURATION_REQUIRED",
      dueAt: new Date(),
      deliveryChannel: "none",
      deliveryStatusNote: "not configured",
      sentAt: null,
    });
    expect(s.delivered).toBe(false);
    expect(typeof bridgeDeliveryConfigured()).toBe("boolean");
  });
});

describe("customer progress filtering", () => {
  it("excludes vendor costs and margins", () => {
    const view = customerProgressView({
      readiness: {
        campaignId: "c",
        overdueCount: 1,
        blockedCount: 0,
        openCount: 3,
        doneCount: 2,
        upcomingLaunches: [],
        bookingExecutionStatuses: ["IN_PROGRESS"],
      },
      proof: { approved: 1, pending: 0, rejected: 0, replaced: 0, missingFlag: false },
      approvedCreatives: 1,
      invoices: [
        {
          invoiceNumber: "INV-1",
          status: "PARTIALLY_PAID",
          totalMinor: 100,
          amountPaidMinor: 40,
          outstandingMinor: 60,
        },
      ],
    });
    const json = JSON.stringify(view);
    expect(json).not.toMatch(/margin/i);
    expect(json).not.toMatch(/vendorCost/i);
    expect(json).not.toMatch(/grossProfit/i);
    expect(view.billing[0]!.outstandingMinor).toBe(60);
  });
});
