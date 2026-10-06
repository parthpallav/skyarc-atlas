"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createWebApiClient } from "@/lib/api";
import { formatInventoryType, isDigitalInventoryType } from "@skyarc/shared";

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

type ScreenRow = { id: string; label: string };
type InventoryRow = {
  id: string;
  productCode: string;
  inventoryType?: string;
  status: string;
  slotCapacity?: number;
  staticSpecsJson?: {
    widthFt?: number;
    heightFt?: number;
    [key: string]: unknown;
  } | null;
};

const inputClass =
  "w-full rounded-lg border border-violet-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30";
const labelClass = "mb-1 block text-xs font-semibold uppercase tracking-wide text-muted";

export function LocationPrimaryFaceEditor({
  locationId,
  onSaved,
}: {
  locationId: string;
  onSaved?: () => void | Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const { data: screens, isLoading: screensLoading } = useQuery({
    queryKey: ["location-screens", locationId],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.listLocationScreens(locationId);
      return result.data as ScreenRow[];
    },
  });

  const screenIds = useMemo(() => (screens ?? []).map((s) => s.id), [screens]);

  const { data: inventories, isLoading: invLoading } = useQuery({
    queryKey: ["location-all-inventories", locationId, screenIds.join(",")],
    queryFn: async () => {
      const client = createWebApiClient();
      const rows: InventoryRow[] = [];
      for (const screenId of screenIds) {
        const result = await client.listScreenInventories(screenId);
        rows.push(...((result.data as InventoryRow[]) ?? []));
      }
      return rows;
    },
    enabled: screenIds.length > 0,
  });

  const primary = useMemo(() => {
    const list = inventories ?? [];
    return (
      list.find((i) => isDigitalInventoryType(i.inventoryType)) ?? list[0] ?? null
    );
  }, [inventories]);

  const [productCode, setProductCode] = useState("");
  const [inventoryType, setInventoryType] = useState("DIGITAL_BILLBOARD");
  const [customType, setCustomType] = useState("");
  const [widthFt, setWidthFt] = useState("");
  const [heightFt, setHeightFt] = useState("");
  const [slotCapacity, setSlotCapacity] = useState("6");

  useEffect(() => {
    if (!primary) return;
    const existingType = primary.inventoryType ?? "DIGITAL_BILLBOARD";
    const known = INVENTORY_TYPE_OPTIONS.some((o) => o.value === existingType);
    setProductCode(primary.productCode ?? "");
    if (known) {
      setInventoryType(existingType);
      setCustomType("");
    } else {
      setInventoryType("CUSTOM");
      setCustomType(existingType);
    }
    setWidthFt(
      primary.staticSpecsJson?.widthFt != null
        ? String(primary.staticSpecsJson.widthFt)
        : ""
    );
    setHeightFt(
      primary.staticSpecsJson?.heightFt != null
        ? String(primary.staticSpecsJson.heightFt)
        : ""
    );
    setSlotCapacity(
      String(primary.slotCapacity && primary.slotCapacity > 1 ? primary.slotCapacity : 6)
    );
  }, [primary]);

  const resolvedType =
    inventoryType === "CUSTOM" ? customType.trim() || "OTHER" : inventoryType;
  const digital = isDigitalInventoryType(resolvedType);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!primary) throw new Error("No face/inventory on this site yet");
      if (!productCode.trim()) throw new Error("Product code is required");
      const client = createWebApiClient();
      const prevSpecs =
        primary.staticSpecsJson && typeof primary.staticSpecsJson === "object"
          ? { ...primary.staticSpecsJson }
          : {};
      const nextSpecs: Record<string, unknown> = { ...prevSpecs };
      if (widthFt.trim()) nextSpecs.widthFt = Number(widthFt);
      if (heightFt.trim()) nextSpecs.heightFt = Number(heightFt);
      if (
        typeof nextSpecs.widthFt === "number" &&
        typeof nextSpecs.heightFt === "number"
      ) {
        nextSpecs.sqft = Number(nextSpecs.widthFt) * Number(nextSpecs.heightFt);
      }

      await client.updateInventory(primary.id, {
        productCode: productCode.trim(),
        inventoryType: resolvedType,
        status: primary.status || "AVAILABLE",
        slotCapacity: digital ? Math.max(2, Number(slotCapacity) || 6) : 1,
        staticSpecsJson: nextSpecs,
      });
    },
    onSuccess: async () => {
      setError("");
      setMessage("Format & size saved.");
      await queryClient.invalidateQueries({ queryKey: ["location", locationId] });
      await queryClient.invalidateQueries({ queryKey: ["locations"] });
      await queryClient.invalidateQueries({ queryKey: ["location-screens", locationId] });
      await queryClient.invalidateQueries({ queryKey: ["location-all-inventories", locationId] });
      await queryClient.invalidateQueries({ queryKey: ["screen-inventories"] });
      await onSaved?.();
    },
    onError: (e) => {
      setMessage("");
      setError(e instanceof Error ? e.message : "Failed to save format & size");
    },
  });

  if (screensLoading || invLoading) {
    return (
      <p className="text-sm text-muted">Loading format &amp; size…</p>
    );
  }

  if (!primary) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        No face on this site yet. Open the <strong>Faces</strong> tab to add a screen and
        product, then set format and size here.
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-violet-100 bg-violet-50/40 p-5">
      <div>
        <h3 className="font-semibold text-slate-900">Format &amp; size</h3>
        <p className="mt-1 text-sm text-muted">
          Updates the primary face shown on the location card (
          {formatInventoryType(primary.inventoryType)}). This is separate from site
          address / map fields above.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Product code</label>
          <input
            className={inputClass}
            value={productCode}
            onChange={(e) => setProductCode(e.target.value)}
          />
        </div>
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
      </div>

      {inventoryType === "CUSTOM" ? (
        <div>
          <label className={labelClass}>Custom format name</label>
          <input
            className={inputClass}
            value={customType}
            onChange={(e) => setCustomType(e.target.value)}
            placeholder="e.g. Mall Totem, Lift TV"
          />
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={labelClass}>Width (ft)</label>
          <input
            type="number"
            min={0}
            step="0.1"
            className={inputClass}
            value={widthFt}
            onChange={(e) => setWidthFt(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Height (ft)</label>
          <input
            type="number"
            min={0}
            step="0.1"
            className={inputClass}
            value={heightFt}
            onChange={(e) => setHeightFt(e.target.value)}
          />
        </div>
        {digital ? (
          <div>
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
        ) : (
          <div className="flex items-end">
            <p className="pb-2 text-xs text-muted">Static / exclusive face · capacity 1</p>
          </div>
        )}
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {message}
        </p>
      ) : null}

      <button
        type="button"
        className="btn-primary px-5 py-2.5"
        disabled={saveMutation.isPending || !productCode.trim()}
        onClick={() => saveMutation.mutate()}
      >
        {saveMutation.isPending ? "Saving…" : "Save format & size"}
      </button>
    </div>
  );
}
