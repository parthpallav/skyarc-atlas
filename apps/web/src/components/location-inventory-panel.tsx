"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { createWebApiClient } from "@/lib/api";
import { usePermissions } from "@/hooks/use-permissions";
import { formatInventoryType } from "@skyarc/shared";
import { ConfirmModal } from "@/components/confirm-modal";

interface ScreenRow {
  id: string;
  label: string;
  inventoryStatus: string;
  skyarcScreenCode?: string | null;
}

interface InventoryRow {
  id: string;
  productCode: string;
  inventoryType?: string;
  status: string;
  notes?: string | null;
  slotCapacity?: number;
  staticSpecsJson?: {
    widthFt?: number;
    heightFt?: number;
    class?: string;
    subtype?: string;
    production?: {
      resolutionW?: number;
      resolutionH?: number;
      staticFormats?: string[];
      motionFormats?: string[];
      maxFileSizeMb?: number;
      loopDurationSec?: number | null;
      slotDurationSec?: number | null;
    } | null;
  } | null;
  latestRate?: { amount: number; period: string; currency: string } | null;
}

interface LocationInventoryPanelProps {
  locationId: string;
  canWrite: boolean;
  /** When false, hide vendor rates (showcase mode). */
  showVendorRates?: boolean;
}

const INVENTORY_TYPE_OPTIONS = [
  { value: "DIGITAL_BILLBOARD", label: "Digital Billboard / LED" },
  { value: "STATIC_BILLBOARD", label: "Static Hoarding / Billboard" },
  { value: "UNIPOLE", label: "Unipole" },
  { value: "GANTRY", label: "Gantry / Overbridge" },
  { value: "BUS_SHELTER", label: "Bus Queue Shelter (BQS)" },
  { value: "KIOSK", label: "Kiosk / Interactive Totem" },
  { value: "STANDEE", label: "Standee / Totem" },
  { value: "DIGITAL_TV", label: "Indoor TV / Lift Screen" },
  { value: "TRANSIT_BUS", label: "Bus Wrap / Transit" },
  { value: "TRANSIT_AUTO", label: "Auto / Cab Wrap" },
  { value: "TRANSIT_METRO", label: "Metro / Train Media" },
  { value: "MALL_MEDIA", label: "Mall Media / Atrium" },
  { value: "AIRPORT_MEDIA", label: "Airport Media" },
  { value: "CUSTOM", label: "Custom / Other format…" },
];

export function LocationInventoryPanel({
  locationId,
  canWrite,
  showVendorRates = true,
}: LocationInventoryPanelProps) {
  const queryClient = useQueryClient();
  const { isReadOnly } = usePermissions();
  const [screenLabel, setScreenLabel] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; productCode: string } | null>(
    null
  );
  const [expandedScreen, setExpandedScreen] = useState<string | null>(null);
  const [productCode, setProductCode] = useState("");
  const [inventoryType, setInventoryType] = useState("DIGITAL_BILLBOARD");
  const [customType, setCustomType] = useState("");
  const [rateAmount, setRateAmount] = useState("");
  const [ratePeriod, setRatePeriod] = useState("monthly");
  const [widthFt, setWidthFt] = useState("");
  const [heightFt, setHeightFt] = useState("");
  const [slotCapacity, setSlotCapacity] = useState("6");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editProductCode, setEditProductCode] = useState("");
  const [editInventoryType, setEditInventoryType] = useState("DIGITAL_BILLBOARD");
  const [editCustomType, setEditCustomType] = useState("");
  const [editRateAmount, setEditRateAmount] = useState("");
  const [editStatus, setEditStatus] = useState("AVAILABLE");
  const [editWidthFt, setEditWidthFt] = useState("");
  const [editHeightFt, setEditHeightFt] = useState("");
  const [editSlotCapacity, setEditSlotCapacity] = useState("6");

  const writable = canWrite && !isReadOnly;

  const { data: screens, isLoading } = useQuery({
    queryKey: ["location-screens", locationId],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.listLocationScreens(locationId);
      return result.data as ScreenRow[];
    },
  });

  const { data: inventoriesByScreen } = useQuery({
    queryKey: ["screen-inventories", expandedScreen, showVendorRates],
    queryFn: async () => {
      if (!expandedScreen) return [] as InventoryRow[];
      const client = createWebApiClient();
      const result = await client.listScreenInventories(expandedScreen);
      return result.data as InventoryRow[];
    },
    enabled: Boolean(expandedScreen),
  });

  const invalidateInventory = async () => {
    await queryClient.invalidateQueries({ queryKey: ["screen-inventories", expandedScreen] });
    await queryClient.invalidateQueries({ queryKey: ["location-screens", locationId] });
  };

  const createScreenMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      return client.createScreen(locationId, { label: screenLabel.trim() });
    },
    onSuccess: async () => {
      setScreenLabel("");
      await invalidateInventory();
    },
  });

  const createInventoryMutation = useMutation({
    mutationFn: async (screenId: string) => {
      const client = createWebApiClient();
      const resolvedType =
        inventoryType === "CUSTOM"
          ? (customType.trim() || "OTHER")
          : inventoryType;

      const inv = await client.createInventory(screenId, {
        productCode: productCode.trim(),
        inventoryType: resolvedType,
        status: "AVAILABLE",
        ...(resolvedType.toUpperCase().includes("DIGITAL") && slotCapacity
          ? { slotCapacity: Number(slotCapacity) }
          : {}),
        ...(widthFt || heightFt
          ? {
              staticSpecsJson: {
                ...(widthFt ? { widthFt: Number(widthFt) } : {}),
                ...(heightFt ? { heightFt: Number(heightFt) } : {}),
              },
            }
          : {}),
      });
      if (rateAmount) {
        const created = inv.data as { id: string };
        await client.createRateCard(created.id, {
          period: ratePeriod,
          amount: Number(rateAmount),
          currency: "INR",
        });
      }
    },
    onSuccess: async () => {
      setProductCode("");
      setCustomType("");
      setRateAmount("");
      setWidthFt("");
      setHeightFt("");
      setSlotCapacity("6");
      await invalidateInventory();
    },
  });

  const updateInventoryMutation = useMutation({
    mutationFn: async (inventoryId: string) => {
      const client = createWebApiClient();
      const resolvedType =
        editInventoryType === "CUSTOM"
          ? (editCustomType.trim() || "OTHER")
          : editInventoryType;

      await client.updateInventory(inventoryId, {
        productCode: editProductCode.trim(),
        inventoryType: resolvedType,
        status: editStatus,
        ...(resolvedType.toUpperCase().includes("DIGITAL") && editSlotCapacity
          ? { slotCapacity: Number(editSlotCapacity) }
          : {}),
        staticSpecsJson: {
          ...(editWidthFt ? { widthFt: Number(editWidthFt) } : {}),
          ...(editHeightFt ? { heightFt: Number(editHeightFt) } : {}),
        },
      });
      if (editRateAmount) {
        await client.createRateCard(inventoryId, {
          period: ratePeriod,
          amount: Number(editRateAmount),
          currency: "INR",
        });
      }
    },
    onSuccess: async () => {
      setEditingId(null);
      await invalidateInventory();
    },
  });

  const deleteInventoryMutation = useMutation({
    mutationFn: async (inventoryId: string) => {
      const client = createWebApiClient();
      return client.deleteInventory(inventoryId);
    },
    onSuccess: async () => {
      setDeleteTarget(null);
      await invalidateInventory();
    },
  });

  const startEdit = (inv: InventoryRow) => {
    setEditingId(inv.id);
    setEditProductCode(inv.productCode);
    setEditStatus(inv.status);
    const existingType = inv.inventoryType ?? "DIGITAL_BILLBOARD";
    const isKnown = INVENTORY_TYPE_OPTIONS.some((o) => o.value === existingType);
    if (isKnown) {
      setEditInventoryType(existingType);
      setEditCustomType("");
    } else {
      setEditInventoryType("CUSTOM");
      setEditCustomType(existingType);
    }
    setEditRateAmount(inv.latestRate ? String(inv.latestRate.amount) : "");
    const specs = inv.staticSpecsJson ?? {};
    setEditWidthFt(specs.widthFt != null ? String(specs.widthFt) : "");
    setEditHeightFt(specs.heightFt != null ? String(specs.heightFt) : "");
    setEditSlotCapacity(String(inv.slotCapacity && inv.slotCapacity > 1 ? inv.slotCapacity : 6));
  };

  if (!writable && !(screens?.length ?? 0)) {
    return null;
  }

  return (
    <section id="inventory-config" className="card-surface scroll-mt-24 p-5 sm:p-6 mb-4">
      <h2 className="font-semibold text-slate-900 mb-1">Screens &amp; inventory</h2>
      <p className="text-sm text-muted mb-3">
        Manage faces, formats, vendor rates — and for digital faces, how many brands share the loop.
      </p>
      <div className="mb-4 rounded-lg border border-violet-100 bg-violet-50/70 px-3 py-2.5 text-xs text-slate-700">
        <p className="font-semibold text-slate-900">Ad places (digital slots)</p>
        <p className="mt-0.5 text-muted">
          Edit a digital product and set <strong className="font-semibold text-slate-800">Ad places on loop</strong>{" "}
          (2–48). Default is 6. Static faces are always 1 exclusive booking.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted">Loading screens…</p>}

      {!isLoading && (screens ?? []).length === 0 && writable && (
        <p className="text-sm text-muted mb-4">No screens yet — add your first screen below.</p>
      )}

      <div className="space-y-3">
        {(screens ?? []).map((screen) => (
          <div key={screen.id} className="border border-slate-200 rounded-lg overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
              onClick={() =>
                setExpandedScreen((prev) => (prev === screen.id ? null : screen.id))
              }
            >
              <span className="font-medium text-slate-900">
                {screen.skyarcScreenCode ? `${screen.skyarcScreenCode} · ` : ""}
                {screen.label}
              </span>
              <span className="text-xs text-muted">{screen.inventoryStatus}</span>
            </button>

            {expandedScreen === screen.id && (
              <div className="px-4 pb-4 border-t border-slate-100 bg-slate-50/50">
                <ul className="mt-3 space-y-2">
                  {(inventoriesByScreen ?? []).map((inv) => (
                    <li
                      key={inv.id}
                      className="text-sm bg-white border border-slate-200 rounded-lg px-3 py-2"
                    >
                      {editingId === inv.id ? (
                        <div className="space-y-2">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              placeholder="Product code"
                              value={editProductCode}
                              onChange={(e) => setEditProductCode(e.target.value)}
                              className="w-full rounded border border-violet-200 px-2 py-1.5 text-sm"
                            />
                            <select
                              value={editInventoryType}
                              onChange={(e) => setEditInventoryType(e.target.value)}
                              className="w-full rounded border border-violet-200 px-2 py-1.5 text-sm"
                            >
                              {INVENTORY_TYPE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          {editInventoryType === "CUSTOM" && (
                            <input
                              placeholder="Type custom format (e.g. Mall Totem, Lift TV)"
                              value={editCustomType}
                              onChange={(e) => setEditCustomType(e.target.value)}
                              className="w-full rounded border border-violet-200 px-2 py-1.5 text-sm"
                            />
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <select
                              value={editStatus}
                              onChange={(e) => setEditStatus(e.target.value)}
                              className="w-full rounded border border-violet-200 px-2 py-1.5 text-sm"
                            >
                              <option value="AVAILABLE">AVAILABLE</option>
                              <option value="RESERVED">RESERVED</option>
                              <option value="UNAVAILABLE">UNAVAILABLE</option>
                            </select>
                            <input
                              type="number"
                              placeholder="Vendor rate (INR)"
                              value={editRateAmount}
                              onChange={(e) => setEditRateAmount(e.target.value)}
                              className="w-full rounded border border-violet-200 px-2 py-1.5 text-sm"
                            />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <input
                              type="number"
                              placeholder="Width (ft)"
                              value={editWidthFt}
                              onChange={(e) => setEditWidthFt(e.target.value)}
                              className="w-full rounded border border-violet-200 px-2 py-1.5 text-sm"
                            />
                            <input
                              type="number"
                              placeholder="Height (ft)"
                              value={editHeightFt}
                              onChange={(e) => setEditHeightFt(e.target.value)}
                              className="w-full rounded border border-violet-200 px-2 py-1.5 text-sm"
                            />
                            {editInventoryType.toUpperCase().includes("DIGITAL") ||
                            editCustomType.toUpperCase().includes("DIGITAL") ? (
                              <label className="block">
                                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
                                  Ad places on loop
                                </span>
                                <input
                                  type="number"
                                  min={2}
                                  max={48}
                                  title="How many brands share this digital loop (2–48)"
                                  value={editSlotCapacity}
                                  onChange={(e) => setEditSlotCapacity(e.target.value)}
                                  className="w-full rounded border border-violet-200 px-2 py-1.5 text-sm"
                                />
                              </label>
                            ) : (
                              <div />
                            )}
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="btn-primary text-xs py-1.5 px-3"
                              disabled={updateInventoryMutation.isPending || !editProductCode.trim()}
                              onClick={() => updateInventoryMutation.mutate(inv.id)}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="btn-secondary text-xs py-1.5 px-3"
                              onClick={() => setEditingId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="font-medium">{inv.productCode}</span>
                              <span className="text-muted">
                                {" "}
                                · {formatInventoryType(inv.inventoryType)} · {inv.status}
                              </span>
                              <p className="text-xs text-muted mt-1">
                                {inv.staticSpecsJson?.widthFt && inv.staticSpecsJson?.heightFt
                                  ? `${inv.staticSpecsJson.widthFt}×${inv.staticSpecsJson.heightFt} ft`
                                  : "Size not set"}
                                {inv.inventoryType &&
                                (inv.inventoryType.toUpperCase().includes("DIGITAL") ||
                                  inv.inventoryType.toUpperCase().includes("KIOSK"))
                                  ? ` · ${inv.slotCapacity && inv.slotCapacity > 1 ? inv.slotCapacity : 6} ad places on loop`
                                  : ""}
                              </p>
                              {inv.staticSpecsJson?.production &&
                              "resolutionW" in inv.staticSpecsJson.production &&
                              inv.staticSpecsJson.production.resolutionW ? (
                                <p className="mt-1 text-xs text-slate-600">
                                  Specs: {inv.staticSpecsJson.production.resolutionW}×
                                  {inv.staticSpecsJson.production.resolutionH}px
                                  {inv.staticSpecsJson.production.staticFormats?.length
                                    ? ` · ${inv.staticSpecsJson.production.staticFormats.join("/")}`
                                    : ""}
                                  {inv.staticSpecsJson.production.motionFormats?.length
                                    ? ` · ${inv.staticSpecsJson.production.motionFormats.join("/")}`
                                    : ""}
                                  {inv.staticSpecsJson.production.maxFileSizeMb
                                    ? ` · max ${inv.staticSpecsJson.production.maxFileSizeMb}MB`
                                    : ""}
                                </p>
                              ) : null}
                              {showVendorRates && inv.latestRate && (
                                <p className="text-xs text-muted mt-1">
                                  Vendor rate: {inv.latestRate.currency}{" "}
                                  {inv.latestRate.amount.toLocaleString()} /{" "}
                                  {inv.latestRate.period}
                                </p>
                              )}
                            </div>
                            {writable && (
                              <div className="flex gap-1 shrink-0">
                                <button
                                  type="button"
                                  aria-label="Edit product"
                                  className="p-1.5 text-slate-500 hover:text-primary"
                                  onClick={() => startEdit(inv)}
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  aria-label="Delete product"
                                  className="p-1.5 text-slate-500 hover:text-red-600"
                                  disabled={deleteInventoryMutation.isPending}
                                  onClick={() =>
                                    setDeleteTarget({ id: inv.id, productCode: inv.productCode })
                                  }
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </li>
                  ))}
                  {(inventoriesByScreen ?? []).length === 0 && (
                    <li className="text-sm text-muted">No products yet.</li>
                  )}
                </ul>

                {writable && (
                  <div className="mt-3 space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                      <select
                        value={inventoryType}
                        onChange={(e) => setInventoryType(e.target.value)}
                        className="rounded-lg border border-violet-200 px-3 py-2 text-sm"
                      >
                        {INVENTORY_TYPE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <input
                        placeholder="Product code (e.g. FACE-A)"
                        value={productCode}
                        onChange={(e) => setProductCode(e.target.value)}
                        className="rounded-lg border border-violet-200 px-3 py-2 text-sm"
                      />
                      <input
                        placeholder="Vendor rate (INR)"
                        type="number"
                        value={rateAmount}
                        onChange={(e) => setRateAmount(e.target.value)}
                        className="rounded-lg border border-violet-200 px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        disabled={!productCode.trim() || createInventoryMutation.isPending}
                        className="btn-primary text-sm py-2 disabled:opacity-50"
                        onClick={() => createInventoryMutation.mutate(screen.id)}
                      >
                        Add product
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="number"
                        placeholder="Width (ft)"
                        value={widthFt}
                        onChange={(e) => setWidthFt(e.target.value)}
                        className="rounded-lg border border-violet-200 px-3 py-2 text-sm"
                      />
                      <input
                        type="number"
                        placeholder="Height (ft)"
                        value={heightFt}
                        onChange={(e) => setHeightFt(e.target.value)}
                        className="rounded-lg border border-violet-200 px-3 py-2 text-sm"
                      />
                      {inventoryType.toUpperCase().includes("DIGITAL") ? (
                        <label className="block">
                          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
                            Ad places on loop (2–48)
                          </span>
                          <input
                            type="number"
                            min={2}
                            max={48}
                            title="How many brands share this digital loop"
                            value={slotCapacity}
                            onChange={(e) => setSlotCapacity(e.target.value)}
                            className="w-full rounded-lg border border-violet-200 px-3 py-2 text-sm"
                          />
                        </label>
                      ) : (
                        <div />
                      )}
                    </div>
                    {inventoryType === "CUSTOM" && (
                      <input
                        placeholder="Enter custom inventory format (e.g. Elevator Screen, Fuel Station LED)"
                        value={customType}
                        onChange={(e) => setCustomType(e.target.value)}
                        className="w-full rounded-lg border border-violet-200 px-3 py-2 text-sm bg-white"
                      />
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {writable && (
        <div className="mt-4 flex flex-col sm:flex-row gap-2">
          <input
            placeholder="New screen label (e.g. Main face)"
            value={screenLabel}
            onChange={(e) => setScreenLabel(e.target.value)}
            className="flex-1 rounded-lg border border-violet-200 px-3 py-2.5 text-sm"
          />
          <button
            type="button"
            disabled={!screenLabel.trim() || createScreenMutation.isPending}
            className="btn-secondary gap-2 text-sm py-2.5"
            onClick={() => createScreenMutation.mutate()}
          >
            <Plus className="w-4 h-4" />
            Add screen
          </button>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete product"
        description={
          deleteTarget
            ? `Delete ${deleteTarget.productCode}? This removes the product from this screen.`
            : undefined
        }
        confirmLabel="Delete product"
        danger
        busy={deleteInventoryMutation.isPending}
        onClose={() => {
          if (!deleteInventoryMutation.isPending) setDeleteTarget(null);
        }}
        onConfirm={() => {
          if (deleteTarget) deleteInventoryMutation.mutate(deleteTarget.id);
        }}
      />
    </section>
  );
}
