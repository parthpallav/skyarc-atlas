"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  corridorsForCity,
  getMarketCity,
  isDigitalInventoryType,
  listMarketCities,
} from "@skyarc/shared";
import { createWebApiClient } from "@/lib/api";

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

export type LocationSiteEditInitial = {
  id: string;
  name?: string;
  latitude?: number | string;
  longitude?: number | string;
  address?: string;
  road?: string;
  junction?: string;
  city?: string;
  district?: string;
  state?: string;
  mountingType?: string;
  mountingNotes?: string;
};

/**
 * Single edit form for location Site tab: site/geo + primary face format/size.
 * One Save — no create-wizard steps, no second save path.
 */
export function LocationSiteEditForm({
  initial,
  onSuccess,
  onError,
}: {
  initial: LocationSiteEditInitial;
  onSuccess: () => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const markets = useMemo(() => listMarketCities(), []);
  const defaultCity = getMarketCity(initial.city);

  const [name, setName] = useState(initial.name ?? "");
  const [cityId, setCityId] = useState(defaultCity.id);
  const [district, setDistrict] = useState(initial.district ?? defaultCity.district);
  const [state, setState] = useState(initial.state ?? defaultCity.state);
  const [latitude, setLatitude] = useState(String(initial.latitude ?? defaultCity.center.lat));
  const [longitude, setLongitude] = useState(
    String(initial.longitude ?? defaultCity.center.lng)
  );
  const [address, setAddress] = useState(initial.address ?? "");
  const [road, setRoad] = useState(initial.road ?? "");
  const [junction, setJunction] = useState(initial.junction ?? "");
  const [mountingType, setMountingType] = useState(initial.mountingType ?? "");
  const [mountingNotes, setMountingNotes] = useState(initial.mountingNotes ?? "");

  const [productCode, setProductCode] = useState("");
  const [inventoryType, setInventoryType] = useState("DIGITAL_BILLBOARD");
  const [customType, setCustomType] = useState("");
  const [widthFt, setWidthFt] = useState("");
  const [heightFt, setHeightFt] = useState("");
  const [slotCapacity, setSlotCapacity] = useState("6");
  const [message, setMessage] = useState("");

  const corridors = corridorsForCity(cityId);

  const { data: screens, isLoading: screensLoading } = useQuery({
    queryKey: ["location-screens", initial.id],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.listLocationScreens(initial.id);
      return result.data as ScreenRow[];
    },
  });

  const screenIds = useMemo(() => (screens ?? []).map((s) => s.id), [screens]);

  const { data: inventories, isLoading: invLoading } = useQuery({
    queryKey: ["location-all-inventories", initial.id, screenIds.join(",")],
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

  function applyCity(id: string) {
    const m = getMarketCity(id);
    setCityId(m.id);
    setDistrict(m.district);
    setState(m.state);
    // Keep existing pin — do not jump the map when market changes.
  }

  const resolvedType =
    inventoryType === "CUSTOM" ? customType.trim() || "OTHER" : inventoryType;
  const digital = isDigitalInventoryType(resolvedType);
  const faceLoading = screensLoading || (screenIds.length > 0 && invLoading);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Site name is required");
      const lat = Number(latitude);
      const lng = Number(longitude);
      if (Number.isNaN(lat) || lat < -90 || lat > 90) {
        throw new Error("Valid latitude is required");
      }
      if (Number.isNaN(lng) || lng < -180 || lng > 180) {
        throw new Error("Valid longitude is required");
      }
      if (primary && !productCode.trim()) {
        throw new Error("Product code is required for the primary face");
      }

      const client = createWebApiClient();
      const market = getMarketCity(cityId);

      await client.updateLocation(initial.id, {
        name: name.trim(),
        latitude: lat,
        longitude: lng,
        address: address.trim() || undefined,
        road: road.trim() || undefined,
        junction: junction.trim() || undefined,
        city: market.name,
        district: district.trim() || market.district,
        state: state.trim() || market.state,
        mountingType: mountingType.trim() || undefined,
        mountingNotes: mountingNotes.trim() || undefined,
      });

      if (primary) {
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
      }
    },
    onSuccess: async () => {
      setMessage("Location saved.");
      await queryClient.invalidateQueries({ queryKey: ["location", initial.id] });
      await queryClient.invalidateQueries({ queryKey: ["locations"] });
      await queryClient.invalidateQueries({ queryKey: ["location-screens", initial.id] });
      await queryClient.invalidateQueries({
        queryKey: ["location-all-inventories", initial.id],
      });
      await queryClient.invalidateQueries({ queryKey: ["screen-inventories"] });
      await onSuccess();
    },
    onError: (e) => {
      setMessage("");
      onError(e instanceof Error ? e.message : "Failed to save location");
    },
  });

  return (
    <form
      className="space-y-8"
      onSubmit={(e) => {
        e.preventDefault();
        setMessage("");
        saveMutation.mutate();
      }}
    >
      <section className="space-y-4">
        <div>
          <h2 className="font-semibold text-slate-900">Site</h2>
          <p className="mt-1 text-sm text-muted">Name, market, and map position.</p>
        </div>

        <div>
          <label className={labelClass}>Site name</label>
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass}>City</label>
            <select
              className={inputClass}
              value={cityId}
              onChange={(e) => applyCity(e.target.value)}
            >
              {markets.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>State</label>
            <input
              className={inputClass}
              value={state}
              onChange={(e) => setState(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Corridor / road</label>
          <input
            className={inputClass}
            list={`corridor-${initial.id}`}
            value={road}
            onChange={(e) => setRoad(e.target.value)}
            placeholder="Select or type a corridor"
          />
          <datalist id={`corridor-${initial.id}`}>
            {corridors.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Latitude</label>
            <input
              className={inputClass}
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Longitude</label>
            <input
              className={inputClass}
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Address</label>
            <input
              className={inputClass}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Junction</label>
            <input
              className={inputClass}
              value={junction}
              onChange={(e) => setJunction(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Mounting</label>
            <input
              className={inputClass}
              value={mountingType}
              onChange={(e) => setMountingType(e.target.value)}
              placeholder="e.g. Pole, Wall, Gantry"
            />
          </div>
          <div>
            <label className={labelClass}>Mounting notes</label>
            <input
              className={inputClass}
              value={mountingNotes}
              onChange={(e) => setMountingNotes(e.target.value)}
            />
          </div>
        </div>
      </section>

      <hr className="border-violet-100" />

      <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900">Format &amp; size</h2>
            <p className="mt-1 text-sm text-muted">
              Primary face on the location card. Extra faces are managed under Faces.
            </p>
          </div>
          <Link
            href={`/locations/${initial.id}/edit?tab=faces`}
            className="text-sm font-semibold text-primary hover:underline"
          >
            Manage all faces
          </Link>
        </div>

        {faceLoading ? (
          <p className="text-sm text-muted">Loading face…</p>
        ) : !primary ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            No face on this site yet.{" "}
            <Link
              href={`/locations/${initial.id}/edit?tab=faces`}
              className="font-semibold text-primary hover:underline"
            >
              Add a face
            </Link>{" "}
            first, then return here to set format and size.
          </div>
        ) : (
          <>
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
                  <p className="pb-2 text-xs text-muted">Exclusive face · 1 booking</p>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {message ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-violet-100 pt-4">
        <button
          type="submit"
          className="btn-primary px-6 py-2.5"
          disabled={saveMutation.isPending || faceLoading}
        >
          {saveMutation.isPending ? "Saving…" : "Save location"}
        </button>
        <Link
          href={`/locations/${initial.id}`}
          className="text-sm font-semibold text-muted hover:text-slate-900"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
