"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { createWebApiClient } from "@/lib/api";
import { usePermissions } from "@/hooks/use-permissions";
import { formatInventoryType, isDigitalInventoryType } from "@skyarc/shared";
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

const inputClass =
  "w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30";
const labelClass = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted";

export function LocationInventoryPanel({
  locationId,
  canWrite,
  showVendorRates = true,
}: LocationInventoryPanelProps) {
  const queryClient = useQueryClient();
  const { isReadOnly } = usePermissions();
  const writable = canWrite && !isReadOnly;

  const [screenLabel, setScreenLabel] = useState("");
  const [renamingScreenId, setRenamingScreenId] = useState<string | null>(null);
  const [renameLabel, setRenameLabel] = useState("");
  const [deleteScreenTarget, setDeleteScreenTarget] = useState<ScreenRow | null>(null);
  const [deleteProductTarget, setDeleteProductTarget] = useState<{
    id: string;
    productCode: string;
  } | null>(null);
  const [actionError, setActionError] = useState("");

  const [addForScreenId, setAddForScreenId] = useState<string | null>(null);
  const [productCode, setProductCode] = useState("");
  const [inventoryType, setInventoryType] = useState("DIGITAL_BILLBOARD");
  const [customType, setCustomType] = useState("");
  const [rateAmount, setRateAmount] = useState("");
  const [ratePeriod] = useState("monthly");
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

  const { data: screens, isLoading } = useQuery({
    queryKey: ["location-screens", locationId],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.listLocationScreens(locationId);
      return result.data as ScreenRow[];
    },
  });

  const screenIds = useMemo(() => (screens ?? []).map((s) => s.id), [screens]);

  const { data: inventoriesByScreenId, isLoading: invLoading } = useQuery({
    queryKey: ["location-faces-inventories", locationId, screenIds.join(","), showVendorRates],
    queryFn: async () => {
      const client = createWebApiClient();
      const map: Record<string, InventoryRow[]> = {};
      await Promise.all(
        screenIds.map(async (screenId) => {
          const result = await client.listScreenInventories(screenId);
          map[screenId] = (result.data as InventoryRow[]) ?? [];
        })
      );
      return map;
    },
    enabled: screenIds.length > 0,
  });

  const invalidateAll = async () => {
    await queryClient.invalidateQueries({ queryKey: ["location-screens", locationId] });
    await queryClient.invalidateQueries({ queryKey: ["location-faces-inventories", locationId] });
    await queryClient.invalidateQueries({ queryKey: ["screen-inventories"] });
    await queryClient.invalidateQueries({ queryKey: ["location", locationId] });
    await queryClient.invalidateQueries({ queryKey: ["locations"] });
    await queryClient.invalidateQueries({ queryKey: ["location-all-inventories", locationId] });
  };

  const createScreenMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      return client.createScreen(locationId, { label: screenLabel.trim() });
    },
    onSuccess: async () => {
      setScreenLabel("");
      setActionError("");
      await invalidateAll();
    },
    onError: (e) => {
      setActionError(e instanceof Error ? e.message : "Failed to add face");
    },
  });

  const renameScreenMutation = useMutation({
    mutationFn: async () => {
      if (!renamingScreenId || !renameLabel.trim()) throw new Error("Label is required");
      const client = createWebApiClient();
      return client.updateScreen(renamingScreenId, { label: renameLabel.trim() });
    },
    onSuccess: async () => {
      setRenamingScreenId(null);
      setRenameLabel("");
      setActionError("");
      await invalidateAll();
    },
    onError: (e) => {
      setActionError(e instanceof Error ? e.message : "Failed to rename face");
    },
  });

  const deleteScreenMutation = useMutation({
    mutationFn: async (screenId: string) => {
      const client = createWebApiClient();
      return client.deleteScreen(screenId);
    },
    onSuccess: async () => {
      setDeleteScreenTarget(null);
      setActionError("");
      await invalidateAll();
    },
    onError: (e) => {
      setActionError(e instanceof Error ? e.message : "Failed to remove face");
      setDeleteScreenTarget(null);
    },
  });

  const createInventoryMutation = useMutation({
    mutationFn: async (screenId: string) => {
      const client = createWebApiClient();
      const resolvedType =
        inventoryType === "CUSTOM" ? customType.trim() || "OTHER" : inventoryType;
      const digital = isDigitalInventoryType(resolvedType);

      const inv = await client.createInventory(screenId, {
        productCode: productCode.trim(),
        inventoryType: resolvedType,
        status: "AVAILABLE",
        ...(digital && slotCapacity ? { slotCapacity: Number(slotCapacity) } : {}),
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
      setAddForScreenId(null);
      setActionError("");
      await invalidateAll();
    },
    onError: (e) => {
      setActionError(e instanceof Error ? e.message : "Failed to add product");
    },
  });

  const updateInventoryMutation = useMutation({
    mutationFn: async (inventoryId: string) => {
      const client = createWebApiClient();
      const resolvedType =
        editInventoryType === "CUSTOM" ? editCustomType.trim() || "OTHER" : editInventoryType;
      const digital = isDigitalInventoryType(resolvedType);

      let existing: InventoryRow | undefined;
      for (const rows of Object.values(inventoriesByScreenId ?? {})) {
        existing = rows.find((row) => row.id === inventoryId);
        if (existing) break;
      }
      const prevSpecs =
        existing?.staticSpecsJson && typeof existing.staticSpecsJson === "object"
          ? { ...existing.staticSpecsJson }
          : {};
      const nextSpecs: Record<string, unknown> = { ...prevSpecs };
      if (editWidthFt.trim()) nextSpecs.widthFt = Number(editWidthFt);
      if (editHeightFt.trim()) nextSpecs.heightFt = Number(editHeightFt);
      if (
        typeof nextSpecs.widthFt === "number" &&
        typeof nextSpecs.heightFt === "number"
      ) {
        nextSpecs.sqft = Number(nextSpecs.widthFt) * Number(nextSpecs.heightFt);
      }

      await client.updateInventory(inventoryId, {
        productCode: editProductCode.trim(),
        inventoryType: resolvedType,
        status: editStatus,
        slotCapacity: digital ? Math.max(2, Number(editSlotCapacity) || 6) : 1,
        staticSpecsJson: nextSpecs,
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
      setActionError("");
      await invalidateAll();
    },
    onError: (e) => {
      setActionError(e instanceof Error ? e.message : "Failed to save product");
    },
  });

  const deleteInventoryMutation = useMutation({
    mutationFn: async (inventoryId: string) => {
      const client = createWebApiClient();
      return client.deleteInventory(inventoryId);
    },
    onSuccess: async () => {
      setDeleteProductTarget(null);
      setActionError("");
      await invalidateAll();
    },
    onError: (e) => {
      setActionError(e instanceof Error ? e.message : "Failed to delete product");
      setDeleteProductTarget(null);
    },
  });

  const startEdit = (inv: InventoryRow) => {
    setEditingId(inv.id);
    setAddForScreenId(null);
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
    setEditSlotCapacity(
      String(inv.slotCapacity && inv.slotCapacity > 1 ? inv.slotCapacity : 6)
    );
  };

  if (!writable && !(screens?.length ?? 0)) {
    return null;
  }

  return (
    <section id="inventory-config" className="space-y-4 scroll-mt-24">
      <div className="card-surface p-5 sm:p-6">
        <h2 className="font-semibold text-slate-900">Faces</h2>
        <p className="mt-1 text-sm text-muted">
          Each face is a sellable screen on this site — rename, remove, or set products here.
          Optional face rates override site Standard rate for that product only; site Vendor card
          rate is set under Pricing.
        </p>
      </div>

      {actionError ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {actionError}
        </p>
      ) : null}

      {isLoading || invLoading ? (
        <p className="text-sm text-muted">Loading faces…</p>
      ) : null}

      {!isLoading && (screens ?? []).length === 0 && writable ? (
        <div className="card-surface p-5 sm:p-6">
          <p className="text-sm text-muted">No faces yet. Add the first face below.</p>
        </div>
      ) : null}

      <div className="space-y-4">
        {(screens ?? []).map((screen) => {
          const inventories = inventoriesByScreenId?.[screen.id] ?? [];
          const renaming = renamingScreenId === screen.id;

          return (
            <article key={screen.id} className="card-surface p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {renaming ? (
                    <div className="flex max-w-md flex-col gap-2 sm:flex-row sm:items-center">
                      <input
                        className={inputClass}
                        value={renameLabel}
                        onChange={(e) => setRenameLabel(e.target.value)}
                        autoFocus
                        aria-label="Face label"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="btn-primary px-3 py-2 text-sm"
                          disabled={renameScreenMutation.isPending || !renameLabel.trim()}
                          onClick={() => renameScreenMutation.mutate()}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="btn-secondary px-3 py-2 text-sm"
                          onClick={() => {
                            setRenamingScreenId(null);
                            setRenameLabel("");
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h3 className="font-semibold text-slate-900">
                        {screen.skyarcScreenCode
                          ? `${screen.skyarcScreenCode} · ${screen.label}`
                          : screen.label}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted">{screen.inventoryStatus}</p>
                    </>
                  )}
                </div>

                {writable && !renaming ? (
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      aria-label="Rename face"
                      className="rounded-lg p-2 text-slate-500 hover:bg-violet-50 hover:text-primary"
                      onClick={() => {
                        setRenamingScreenId(screen.id);
                        setRenameLabel(screen.label);
                        setEditingId(null);
                        setAddForScreenId(null);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Remove face"
                      className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                      onClick={() => setDeleteScreenTarget(screen)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
              </div>

              <ul className="mt-4 space-y-2">
                {inventories.map((inv) => (
                  <li
                    key={inv.id}
                    className="rounded-xl border border-violet-100 bg-violet-50/30 px-3 py-3 sm:px-4"
                  >
                    {editingId === inv.id ? (
                      <div className="space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className={labelClass}>Product code</label>
                            <input
                              className={inputClass}
                              value={editProductCode}
                              onChange={(e) => setEditProductCode(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className={labelClass}>Format</label>
                            <select
                              className={inputClass}
                              value={editInventoryType}
                              onChange={(e) => setEditInventoryType(e.target.value)}
                            >
                              {INVENTORY_TYPE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        {editInventoryType === "CUSTOM" ? (
                          <div>
                            <label className={labelClass}>Custom format</label>
                            <input
                              className={inputClass}
                              value={editCustomType}
                              onChange={(e) => setEditCustomType(e.target.value)}
                            />
                          </div>
                        ) : null}
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className={labelClass}>Status</label>
                            <select
                              className={inputClass}
                              value={editStatus}
                              onChange={(e) => setEditStatus(e.target.value)}
                            >
                              <option value="AVAILABLE">Available</option>
                              <option value="RESERVED">Reserved</option>
                              <option value="UNAVAILABLE">Unavailable</option>
                            </select>
                          </div>
                          {showVendorRates ? (
                            <div>
                              <label className={labelClass}>Vendor rate (INR / month)</label>
                              <input
                                type="number"
                                className={inputClass}
                                value={editRateAmount}
                                onChange={(e) => setEditRateAmount(e.target.value)}
                              />
                            </div>
                          ) : null}
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div>
                            <label className={labelClass}>Width (ft)</label>
                            <input
                              type="number"
                              min={0}
                              step="0.1"
                              className={inputClass}
                              value={editWidthFt}
                              onChange={(e) => setEditWidthFt(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className={labelClass}>Height (ft)</label>
                            <input
                              type="number"
                              min={0}
                              step="0.1"
                              className={inputClass}
                              value={editHeightFt}
                              onChange={(e) => setEditHeightFt(e.target.value)}
                            />
                          </div>
                          {isDigitalInventoryType(
                            editInventoryType === "CUSTOM" ? editCustomType : editInventoryType
                          ) ? (
                            <div>
                              <label className={labelClass}>Ad places on loop</label>
                              <input
                                type="number"
                                min={2}
                                max={48}
                                className={inputClass}
                                value={editSlotCapacity}
                                onChange={(e) => setEditSlotCapacity(e.target.value)}
                              />
                            </div>
                          ) : (
                            <div className="flex items-end">
                              <p className="pb-2 text-xs text-muted">Exclusive · 1 booking</p>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="btn-primary px-4 py-2 text-sm"
                            disabled={
                              updateInventoryMutation.isPending || !editProductCode.trim()
                            }
                            onClick={() => updateInventoryMutation.mutate(inv.id)}
                          >
                            Save product
                          </button>
                          <button
                            type="button"
                            className="btn-secondary px-4 py-2 text-sm"
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">
                            {inv.productCode}
                            <span className="font-normal text-muted">
                              {" "}
                              · {formatInventoryType(inv.inventoryType)} · {inv.status}
                            </span>
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            {inv.staticSpecsJson?.widthFt && inv.staticSpecsJson?.heightFt
                              ? `${inv.staticSpecsJson.widthFt}×${inv.staticSpecsJson.heightFt} ft`
                              : "Size not set"}
                            {isDigitalInventoryType(inv.inventoryType)
                              ? ` · ${inv.slotCapacity && inv.slotCapacity > 1 ? inv.slotCapacity : 6} ad places`
                              : ""}
                          </p>
                          {showVendorRates && inv.latestRate ? (
                            <p className="mt-1 text-xs text-muted">
                              Vendor: {inv.latestRate.currency}{" "}
                              {inv.latestRate.amount.toLocaleString()} / {inv.latestRate.period}
                            </p>
                          ) : null}
                        </div>
                        {writable ? (
                          <div className="flex shrink-0 gap-1">
                            <button
                              type="button"
                              aria-label="Edit product"
                              className="rounded-lg p-2 text-slate-500 hover:bg-white hover:text-primary"
                              onClick={() => startEdit(inv)}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              aria-label="Delete product"
                              className="rounded-lg p-2 text-slate-500 hover:bg-white hover:text-rose-700"
                              onClick={() =>
                                setDeleteProductTarget({
                                  id: inv.id,
                                  productCode: inv.productCode,
                                })
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </li>
                ))}
                {inventories.length === 0 ? (
                  <li className="text-sm text-muted">No product on this face yet.</li>
                ) : null}
              </ul>

              {writable ? (
                <div className="mt-4 border-t border-violet-100 pt-4">
                  {addForScreenId === screen.id ? (
                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-slate-900">Add product</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className={labelClass}>Format</label>
                          <select
                            className={inputClass}
                            value={inventoryType}
                            onChange={(e) => setInventoryType(e.target.value)}
                          >
                            {INVENTORY_TYPE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={labelClass}>Product code</label>
                          <input
                            className={inputClass}
                            value={productCode}
                            onChange={(e) => setProductCode(e.target.value)}
                            placeholder="e.g. FACE-A"
                          />
                        </div>
                      </div>
                      {inventoryType === "CUSTOM" ? (
                        <div>
                          <label className={labelClass}>Custom format</label>
                          <input
                            className={inputClass}
                            value={customType}
                            onChange={(e) => setCustomType(e.target.value)}
                          />
                        </div>
                      ) : null}
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <label className={labelClass}>Width (ft)</label>
                          <input
                            type="number"
                            className={inputClass}
                            value={widthFt}
                            onChange={(e) => setWidthFt(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>Height (ft)</label>
                          <input
                            type="number"
                            className={inputClass}
                            value={heightFt}
                            onChange={(e) => setHeightFt(e.target.value)}
                          />
                        </div>
                        {showVendorRates ? (
                          <div>
                            <label className={labelClass}>Vendor rate (INR)</label>
                            <input
                              type="number"
                              className={inputClass}
                              value={rateAmount}
                              onChange={(e) => setRateAmount(e.target.value)}
                            />
                          </div>
                        ) : null}
                      </div>
                      {isDigitalInventoryType(inventoryType) ? (
                        <div className="max-w-xs">
                          <label className={labelClass}>Ad places on loop</label>
                          <input
                            type="number"
                            min={2}
                            max={48}
                            className={inputClass}
                            value={slotCapacity}
                            onChange={(e) => setSlotCapacity(e.target.value)}
                          />
                        </div>
                      ) : null}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="btn-primary px-4 py-2 text-sm"
                          disabled={!productCode.trim() || createInventoryMutation.isPending}
                          onClick={() => createInventoryMutation.mutate(screen.id)}
                        >
                          Save product
                        </button>
                        <button
                          type="button"
                          className="btn-secondary px-4 py-2 text-sm"
                          onClick={() => setAddForScreenId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                      onClick={() => {
                        setAddForScreenId(screen.id);
                        setEditingId(null);
                        setRenamingScreenId(null);
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      Add product
                    </button>
                  )}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {writable ? (
        <div className="card-surface p-5 sm:p-6">
          <h3 className="font-semibold text-slate-900">Add face</h3>
          <p className="mt-1 text-sm text-muted">
            Use a clear label (Main face, East face, LED A).
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              className={inputClass}
              placeholder="Face label"
              value={screenLabel}
              onChange={(e) => setScreenLabel(e.target.value)}
            />
            <button
              type="button"
              disabled={!screenLabel.trim() || createScreenMutation.isPending}
              className="btn-primary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm disabled:opacity-50"
              onClick={() => createScreenMutation.mutate()}
            >
              <Plus className="h-4 w-4" />
              Add face
            </button>
          </div>
        </div>
      ) : null}

      <ConfirmModal
        open={Boolean(deleteProductTarget)}
        title="Delete product"
        description={
          deleteProductTarget
            ? `Delete ${deleteProductTarget.productCode}? This removes the product from this face.`
            : undefined
        }
        confirmLabel="Delete product"
        danger
        busy={deleteInventoryMutation.isPending}
        onClose={() => {
          if (!deleteInventoryMutation.isPending) setDeleteProductTarget(null);
        }}
        onConfirm={() => {
          if (deleteProductTarget) deleteInventoryMutation.mutate(deleteProductTarget.id);
        }}
      />

      <ConfirmModal
        open={Boolean(deleteScreenTarget)}
        title="Remove face"
        description={
          deleteScreenTarget
            ? `Remove “${deleteScreenTarget.label}” and its products from this site?`
            : undefined
        }
        confirmLabel="Remove face"
        danger
        busy={deleteScreenMutation.isPending}
        onClose={() => {
          if (!deleteScreenMutation.isPending) setDeleteScreenTarget(null);
        }}
        onConfirm={() => {
          if (deleteScreenTarget) deleteScreenMutation.mutate(deleteScreenTarget.id);
        }}
      />
    </section>
  );
}
