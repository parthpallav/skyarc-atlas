"use client";

import { useMemo, useState } from "react";
import {
  InventoryClass,
  DigitalSubtype,
  StaticLighting,
  INVENTORY_CLASS_LABELS,
  DIGITAL_SUBTYPE_LABELS,
  STATIC_LIGHTING_LABELS,
  defaultProductionFor,
  buildInventorySpecsJson,
  inventoryTypeFromTaxonomy,
  getMarketCity,
  listMarketCities,
  corridorsForCity,
  type DigitalProductionSpecs,
  type InventoryClass as InventoryClassType,
  type DigitalSubtype as DigitalSubtypeType,
} from "@skyarc/shared";
import { createWebApiClient } from "@/lib/api";

const inputClass =
  "w-full rounded-lg border border-violet-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30";

const labelClass = "mb-1 block text-xs font-semibold uppercase tracking-wide text-muted";

export type LocationWizardMode = "create" | "edit";

export type LocationWizardInitial = {
  id?: string;
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

type Step = 0 | 1 | 2;

function csvFromList(items: string[]): string {
  return items.join(", ");
}

function listFromCsv(value: string): string[] {
  return value
    .split(/[,/\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function LocationInventoryWizard({
  mode,
  initial,
  photoFile,
  photoPreview,
  onPhotoSelected,
  onRemovePhoto,
  fileInputRef,
  onSuccess,
  onError,
  /** Edit: allow saving site/geo without adding a new face. */
  allowSiteOnlySave = false,
}: {
  mode: LocationWizardMode;
  initial?: LocationWizardInitial;
  photoFile?: File | null;
  photoPreview?: string | null;
  onPhotoSelected?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemovePhoto?: () => void;
  fileInputRef?: React.RefObject<HTMLInputElement | null>;
  onSuccess: (locationId: string) => void;
  onError: (message: string) => void;
  allowSiteOnlySave?: boolean;
}) {
  const markets = useMemo(() => listMarketCities(), []);
  const defaultCity = getMarketCity(initial?.city);

  const [step, setStep] = useState<Step>(0);
  const [busy, setBusy] = useState(false);

  // Site
  const [name, setName] = useState(initial?.name ?? "");
  const [cityId, setCityId] = useState(defaultCity.id);
  const [district, setDistrict] = useState(initial?.district ?? defaultCity.district);
  const [state, setState] = useState(initial?.state ?? defaultCity.state);
  const [latitude, setLatitude] = useState(
    String(initial?.latitude ?? defaultCity.center.lat)
  );
  const [longitude, setLongitude] = useState(
    String(initial?.longitude ?? defaultCity.center.lng)
  );
  const [address, setAddress] = useState(initial?.address ?? "");
  const [road, setRoad] = useState(initial?.road ?? "");
  const [junction, setJunction] = useState(initial?.junction ?? "");
  const [mountingType, setMountingType] = useState(initial?.mountingType ?? "");
  const [mountingNotes, setMountingNotes] = useState(initial?.mountingNotes ?? "");

  // Class / subtype
  const [inventoryClass, setInventoryClass] = useState<InventoryClassType>(
    InventoryClass.DIGITAL
  );
  const [digitalSubtype, setDigitalSubtype] = useState<DigitalSubtypeType>(
    DigitalSubtype.LED
  );
  const [staticLighting, setStaticLighting] = useState<string>(StaticLighting.FRONTLIT);
  const [productCode, setProductCode] = useState("");
  const [screenLabel, setScreenLabel] = useState("Face A");
  const [widthFt, setWidthFt] = useState("");
  const [heightFt, setHeightFt] = useState("");
  const [slotCapacity, setSlotCapacity] = useState("6");
  const [conceptNotes, setConceptNotes] = useState("");

  // Production (digital)
  const [prod, setProd] = useState<DigitalProductionSpecs>(() =>
    defaultProductionFor(InventoryClass.DIGITAL, DigitalSubtype.LED) as DigitalProductionSpecs
  );

  const corridors = corridorsForCity(cityId);

  function applyCity(id: string) {
    const m = getMarketCity(id);
    setCityId(m.id);
    setDistrict(m.district);
    setState(m.state);
    setLatitude(String(m.center.lat));
    setLongitude(String(m.center.lng));
  }

  function applyClass(next: InventoryClassType) {
    setInventoryClass(next);
    if (next === InventoryClass.DIGITAL) {
      setProd(
        defaultProductionFor(next, digitalSubtype) as DigitalProductionSpecs
      );
    }
  }

  function applySubtype(next: DigitalSubtypeType) {
    setDigitalSubtype(next);
    setProd(defaultProductionFor(InventoryClass.DIGITAL, next) as DigitalProductionSpecs);
  }

  function validateStep(s: Step): string | null {
    if (s === 0) {
      if (!name.trim()) return "Site name is required";
      const lat = Number(latitude);
      const lng = Number(longitude);
      if (Number.isNaN(lat) || lat < -90 || lat > 90) return "Valid latitude is required";
      if (Number.isNaN(lng) || lng < -180 || lng > 180) return "Valid longitude is required";
      if (mode === "create" && !photoFile) return "At least one site photo is required";
      return null;
    }
    if (s === 1) {
      if (!productCode.trim() && mode === "create") return "Product / face code is required";
      if (!productCode.trim() && mode === "edit" && !allowSiteOnlySave) {
        return "Product / face code is required";
      }
      return null;
    }
    if (s === 2 && inventoryClass === InventoryClass.DIGITAL && productCode.trim()) {
      if (!prod.resolutionW || !prod.resolutionH) return "Resolution is required for digital";
      if (!prod.staticFormats.length && !prod.motionFormats.length) {
        return "Select at least one supported file format";
      }
    }
    return null;
  }

  async function submit() {
    // Site-only edit: skip inventory validation when no product code
    if (mode === "edit" && allowSiteOnlySave && !productCode.trim()) {
      const siteErr = validateStep(0);
      if (siteErr) {
        onError(siteErr);
        return;
      }
    } else {
      const err = validateStep(2) ?? validateStep(1) ?? validateStep(0);
      if (err) {
        onError(err);
        return;
      }
    }
    setBusy(true);
    try {
      const client = createWebApiClient();
      const market = getMarketCity(cityId);
      const lat = Number(latitude);
      const lng = Number(longitude);
      const addFace = Boolean(productCode.trim());

      let locationId = initial?.id;

      if (mode === "create" || !locationId) {
        const res = await client.createLocation({
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
        locationId = (res.data as { id: string }).id;

        if (photoFile) {
          try {
            const buffer = await photoFile.arrayBuffer();
            await client.uploadLocationAssetDirect(
              locationId,
              buffer,
              photoFile.type || "image/jpeg",
              "FRONT_OF_SCREEN"
            );
          } catch (assetErr) {
            console.warn("Photo upload warning:", assetErr);
          }
        }
      } else {
        await client.updateLocation(locationId, {
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
      }

      if (addFace) {
        const w = widthFt ? Number(widthFt) : null;
        const h = heightFt ? Number(heightFt) : null;
        const subtype =
          inventoryClass === InventoryClass.DIGITAL
            ? digitalSubtype
            : inventoryClass === InventoryClass.STATIC
              ? staticLighting
              : null;
        const inventoryType = inventoryTypeFromTaxonomy(inventoryClass, subtype);
        const production =
          inventoryClass === InventoryClass.DIGITAL
            ? prod
            : inventoryClass === InventoryClass.STATIC
              ? {
                  widthFt: w,
                  heightFt: h,
                  lighting: staticLighting,
                  materialNotes: mountingNotes.trim() || null,
                }
              : {
                  widthFt: w,
                  heightFt: h,
                  conceptNotes: conceptNotes.trim() || null,
                  mockupRequired: true,
                };

        const specs = buildInventorySpecsJson({
          inventoryClass,
          subtype,
          widthFt: w,
          heightFt: h,
          lighting:
            inventoryClass === InventoryClass.STATIC ? staticLighting : null,
          production,
        });

        const loopSec =
          inventoryClass === InventoryClass.DIGITAL
            ? prod.loopDurationSec ?? undefined
            : undefined;
        const slotSec =
          inventoryClass === InventoryClass.DIGITAL
            ? prod.slotDurationSec ?? undefined
            : undefined;

        const screenRes = await client.createScreen(locationId!, {
          label: screenLabel.trim() || "Face A",
          inventoryStatus: "AVAILABLE",
          loopDurationSec: loopSec ?? undefined,
          slotDurationSec: slotSec ?? undefined,
        });
        const screenId = (screenRes.data as { id: string }).id;

        await client.createInventory(screenId, {
          productCode: productCode.trim(),
          inventoryType,
          status: "AVAILABLE",
          slotCapacity:
            inventoryClass === InventoryClass.DIGITAL
              ? Math.max(2, Number(slotCapacity) || 6)
              : 1,
          staticSpecsJson: specs as unknown as Record<string, unknown>,
          notes:
            inventoryClass === InventoryClass.CONCEPTUAL
              ? conceptNotes.trim() || undefined
              : undefined,
        });
      }

      onSuccess(locationId!);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to save location");
    } finally {
      setBusy(false);
    }
  }

  const steps = ["Site & market", "Format class", "Specifications"];

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-2">
        {steps.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (i < step) setStep(i as Step);
              }}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                step === i
                  ? "bg-primary text-white"
                  : i < step
                    ? "bg-violet-100 text-primary"
                    : "bg-slate-100 text-muted"
              }`}
            >
              {i + 1}. {label}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <div className="space-y-4 rounded-2xl border border-violet-100 bg-white p-5 shadow-card">
          {mode === "create" && onPhotoSelected ? (
            <div>
              <label className={labelClass}>Site photo (required)</label>
              {photoPreview ? (
                <div className="relative overflow-hidden rounded-xl border border-violet-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoPreview} alt="Preview" className="max-h-56 w-full object-cover" />
                  <button
                    type="button"
                    onClick={onRemovePhoto}
                    className="absolute right-2 top-2 rounded-md bg-white/90 px-2 py-1 text-xs font-semibold"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef?.current?.click()}
                  className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-violet-200 bg-violet-50/40 px-4 py-10 text-sm text-muted hover:border-primary/40"
                >
                  Tap to add a front-of-screen photo
                </button>
              )}
              <input
                ref={fileInputRef as React.RefObject<HTMLInputElement>}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onPhotoSelected}
              />
            </div>
          ) : null}

          <div>
            <label className={labelClass}>Site name</label>
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
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
              list="corridor-presets"
              value={road}
              onChange={(e) => setRoad(e.target.value)}
              placeholder="Select or type a corridor"
            />
            <datalist id="corridor-presets">
              {corridors.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Latitude</label>
              <input className={inputClass} value={latitude} onChange={(e) => setLatitude(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Longitude</label>
              <input className={inputClass} value={longitude} onChange={(e) => setLongitude(e.target.value)} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Address</label>
            <input className={inputClass} value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Junction</label>
            <input className={inputClass} value={junction} onChange={(e) => setJunction(e.target.value)} />
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
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-4 rounded-2xl border border-violet-100 bg-white p-5 shadow-card">
          <div>
            <p className={labelClass}>Inventory class</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(Object.keys(INVENTORY_CLASS_LABELS) as InventoryClassType[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => applyClass(c)}
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                    inventoryClass === c
                      ? "border-primary bg-violet-50 text-primary"
                      : "border-violet-100 text-slate-700"
                  }`}
                >
                  {INVENTORY_CLASS_LABELS[c]}
                </button>
              ))}
            </div>
          </div>

          {inventoryClass === InventoryClass.DIGITAL ? (
            <div>
              <p className={labelClass}>Digital subtype</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(Object.keys(DIGITAL_SUBTYPE_LABELS) as DigitalSubtypeType[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => applySubtype(s)}
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                      digitalSubtype === s
                        ? "border-primary bg-violet-50 text-primary"
                        : "border-violet-100 text-slate-700"
                    }`}
                  >
                    {DIGITAL_SUBTYPE_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {inventoryClass === InventoryClass.STATIC ? (
            <div>
              <p className={labelClass}>Lighting</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(Object.keys(STATIC_LIGHTING_LABELS) as Array<keyof typeof STATIC_LIGHTING_LABELS>).map(
                  (s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStaticLighting(s)}
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                        staticLighting === s
                          ? "border-primary bg-violet-50 text-primary"
                          : "border-violet-100 text-slate-700"
                      }`}
                    >
                      {STATIC_LIGHTING_LABELS[s]}
                    </button>
                  )
                )}
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Screen / face label</label>
              <input
                className={inputClass}
                value={screenLabel}
                onChange={(e) => setScreenLabel(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Product code</label>
              <input
                className={inputClass}
                value={productCode}
                onChange={(e) => setProductCode(e.target.value)}
                placeholder="e.g. G-1507-A"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Width (ft)</label>
              <input
                className={inputClass}
                value={widthFt}
                onChange={(e) => setWidthFt(e.target.value)}
                inputMode="decimal"
              />
            </div>
            <div>
              <label className={labelClass}>Height (ft)</label>
              <input
                className={inputClass}
                value={heightFt}
                onChange={(e) => setHeightFt(e.target.value)}
                inputMode="decimal"
              />
            </div>
          </div>

          {inventoryClass === InventoryClass.DIGITAL ? (
            <div>
              <label className={labelClass}>Ad places on loop</label>
              <input
                className={inputClass}
                value={slotCapacity}
                onChange={(e) => setSlotCapacity(e.target.value)}
                inputMode="numeric"
              />
            </div>
          ) : null}

          {inventoryClass === InventoryClass.CONCEPTUAL ? (
            <div>
              <label className={labelClass}>Concept notes</label>
              <textarea
                className={inputClass}
                rows={3}
                value={conceptNotes}
                onChange={(e) => setConceptNotes(e.target.value)}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4 rounded-2xl border border-violet-100 bg-white p-5 shadow-card">
          {inventoryClass === InventoryClass.DIGITAL ? (
            <>
              <p className="text-sm text-slate-600">
                Production specs follow the Skyarc digital sheet (resolution, formats, file limits,
                loop timing). Defaults match Classic Hub LED; adjust per face.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Resolution width (px)</label>
                  <input
                    className={inputClass}
                    value={prod.resolutionW}
                    onChange={(e) =>
                      setProd((p) => ({ ...p, resolutionW: Number(e.target.value) || 0 }))
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>Resolution height (px)</label>
                  <input
                    className={inputClass}
                    value={prod.resolutionH}
                    onChange={(e) =>
                      setProd((p) => ({ ...p, resolutionH: Number(e.target.value) || 0 }))
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>Physical width (m)</label>
                  <input
                    className={inputClass}
                    value={prod.physicalWidthM ?? ""}
                    onChange={(e) =>
                      setProd((p) => ({
                        ...p,
                        physicalWidthM: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>Physical height (m)</label>
                  <input
                    className={inputClass}
                    value={prod.physicalHeightM ?? ""}
                    onChange={(e) =>
                      setProd((p) => ({
                        ...p,
                        physicalHeightM: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>Static formats</label>
                  <input
                    className={inputClass}
                    value={csvFromList(prod.staticFormats)}
                    onChange={(e) =>
                      setProd((p) => ({ ...p, staticFormats: listFromCsv(e.target.value) }))
                    }
                    placeholder="jpg, png"
                  />
                </div>
                <div>
                  <label className={labelClass}>Motion formats</label>
                  <input
                    className={inputClass}
                    value={csvFromList(prod.motionFormats)}
                    onChange={(e) =>
                      setProd((p) => ({ ...p, motionFormats: listFromCsv(e.target.value) }))
                    }
                    placeholder="mp4, mov"
                  />
                </div>
                <div>
                  <label className={labelClass}>Max file size (MB)</label>
                  <input
                    className={inputClass}
                    value={prod.maxFileSizeMb}
                    onChange={(e) =>
                      setProd((p) => ({ ...p, maxFileSizeMb: Number(e.target.value) || 0 }))
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>DPI</label>
                  <input
                    className={inputClass}
                    value={prod.dpi}
                    onChange={(e) =>
                      setProd((p) => ({ ...p, dpi: Number(e.target.value) || 72 }))
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>Max bitrate (Mbps)</label>
                  <input
                    className={inputClass}
                    value={prod.maxBitrateMbps}
                    onChange={(e) =>
                      setProd((p) => ({
                        ...p,
                        maxBitrateMbps: Number(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>Frame rates (fps)</label>
                  <input
                    className={inputClass}
                    value={prod.frameRates.join(", ")}
                    onChange={(e) =>
                      setProd((p) => ({
                        ...p,
                        frameRates: listFromCsv(e.target.value)
                          .map(Number)
                          .filter((n) => !Number.isNaN(n)),
                      }))
                    }
                    placeholder="30, 60"
                  />
                </div>
                <div>
                  <label className={labelClass}>Total loop (sec)</label>
                  <input
                    className={inputClass}
                    value={prod.loopDurationSec ?? ""}
                    onChange={(e) =>
                      setProd((p) => ({
                        ...p,
                        loopDurationSec: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>Slot duration (sec)</label>
                  <input
                    className={inputClass}
                    value={prod.slotDurationSec ?? ""}
                    onChange={(e) =>
                      setProd((p) => ({
                        ...p,
                        slotDurationSec: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>Submission lead (working days)</label>
                  <input
                    className={inputClass}
                    value={prod.submissionLeadDays ?? ""}
                    onChange={(e) =>
                      setProd((p) => ({
                        ...p,
                        submissionLeadDays: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>Codec</label>
                  <input
                    className={inputClass}
                    value={prod.codec ?? ""}
                    onChange={(e) => setProd((p) => ({ ...p, codec: e.target.value || null }))}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>File naming hint</label>
                <input
                  className={inputClass}
                  value={prod.namingFormatHint ?? ""}
                  onChange={(e) =>
                    setProd((p) => ({ ...p, namingFormatHint: e.target.value || null }))
                  }
                />
              </div>
            </>
          ) : inventoryClass === InventoryClass.STATIC ? (
            <p className="text-sm text-slate-600">
              Static face: lighting is {STATIC_LIGHTING_LABELS[staticLighting as keyof typeof STATIC_LIGHTING_LABELS] ?? staticLighting}.
              Size was set in the previous step. Confirm and save.
            </p>
          ) : (
            <p className="text-sm text-slate-600">
              Conceptual inventory stores notes and optional dimensions for pitching — no production
              file sheet required.
            </p>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          disabled={busy || step === 0}
          onClick={() => setStep((s) => (s > 0 ? ((s - 1) as Step) : s))}
          className="rounded-lg border border-violet-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
        >
          Back
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {allowSiteOnlySave && mode === "edit" && step < 2 ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit()}
              className="rounded-lg border border-violet-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-violet-50"
            >
              {busy ? "Saving…" : "Save site only"}
            </button>
          ) : null}
          {step < 2 ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const msg = validateStep(step);
                if (msg) {
                  onError(msg);
                  return;
                }
                setStep((s) => ((s + 1) as Step));
              }}
              className="btn-primary px-5 py-2.5"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit()}
              className="btn-primary px-5 py-2.5"
            >
              {busy
                ? "Saving…"
                : mode === "create"
                  ? "Create site"
                  : productCode.trim()
                    ? "Save & add face"
                    : "Save changes"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
