import { describe, expect, it } from "vitest";
import {
  resolveEditTab,
  resolveLocationUiGates,
  type LocationUiGateInput,
} from "./location-ui-gates";

function base(overrides: Partial<LocationUiGateInput> = {}): LocationUiGateInput {
  return {
    isClient: false,
    isVendor: false,
    isInternal: true,
    isAdmin: false,
    isReadOnly: false,
    isOwned: true,
    canEdit: true,
    showVendorDetails: true,
    canViewClientPricing: true,
    orbitUiEnabled: true,
    ...overrides,
  };
}

describe("resolveLocationUiGates", () => {
  it("hides Orbit from vendors even when Orbit UI flag is on", () => {
    const gates = resolveLocationUiGates(
      base({
        isVendor: true,
        isInternal: false,
        isAdmin: false,
        canViewClientPricing: false,
        orbitUiEnabled: true,
      })
    );
    expect(gates.showOrbitTab).toBe(false);
    expect(gates.showEditOrbit).toBe(false);
    expect(gates.editTabs.map((t) => t.id)).not.toContain("orbit");
    expect(gates.detailTabs.map((t) => t.id)).not.toContain("orbit");
  });

  it("shows Orbit for internal when flag enabled", () => {
    const gates = resolveLocationUiGates(base({ orbitUiEnabled: true }));
    expect(gates.showOrbitTab).toBe(true);
    expect(gates.showEditOrbit).toBe(true);
  });

  it("never exposes vendor commercial rates to clients", () => {
    const gates = resolveLocationUiGates(
      base({
        isClient: true,
        isInternal: false,
        isVendor: false,
        canEdit: false,
        canViewClientPricing: false,
      })
    );
    expect(gates.showVendorCommercial).toBe(false);
    expect(gates.canOpenEdit).toBe(false);
    expect(gates.showRatesTab).toBe(false);
  });

  it("hides vendor commercial for network (non-owned) vendors", () => {
    const gates = resolveLocationUiGates(
      base({
        isVendor: true,
        isInternal: false,
        isOwned: false,
        canEdit: false,
        canViewClientPricing: false,
        showVendorDetails: true,
      })
    );
    expect(gates.showVendorCommercial).toBe(false);
    expect(gates.canOpenEdit).toBe(false);
  });

  it("orders edit tabs Photos then Site first", () => {
    const gates = resolveLocationUiGates(base());
    expect(gates.editTabs[0]?.id).toBe("photos");
    expect(gates.editTabs[1]?.id).toBe("site");
  });

  it("does not put scores in detail tab labels", () => {
    const gates = resolveLocationUiGates(base());
    expect(gates.detailTabs.some((t) => /\d/.test(t.label))).toBe(false);
    expect(gates.detailTabs.map((t) => t.id)).not.toContain("index");
  });
});

describe("resolveEditTab", () => {
  it("falls back to photos when vendor requests orbit", () => {
    const gates = resolveLocationUiGates(
      base({
        isVendor: true,
        isInternal: false,
        canViewClientPricing: false,
        orbitUiEnabled: true,
      })
    );
    expect(resolveEditTab("orbit", gates)).toBe("photos");
  });

  it("honors allowed deep link", () => {
    const gates = resolveLocationUiGates(base());
    expect(resolveEditTab("index", gates)).toBe("index");
  });
});
