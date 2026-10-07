import { formatInventoryType } from "@skyarc/shared";

export type MapLiveInventory = {
  status: "AVAILABLE" | "ON_HOLD" | "UNAVAILABLE" | "PARTIAL";
  isDigital?: boolean;
  capacity?: number;
  used?: number;
  remaining?: number;
};

export interface MapLocationPin {
  id: string;
  name: string;
  skyarcSiteCode?: string | null;
  latitude: number;
  longitude: number;
  road?: string | null;
  address?: string | null;
  junction?: string | null;
  city?: string | null;
  district?: string | null;
  state?: string | null;
  coverImageUrl?: string | null;
  inventoryTypes?: string[];
  primaryFace?: {
    inventoryType?: string | null;
    widthFt?: number | null;
    heightFt?: number | null;
    sizeLabel?: string | null;
  } | null;
  skyarcCommercialView?: { clientRateAmount?: number | null; currency?: string | null } | null;
  commercialView?: { defaultRateAmount?: number | null; currency?: string | null } | null;
  liveInventory?: MapLiveInventory | null;
  bookingStatus?: "AVAILABLE" | "UNAVAILABLE" | "ON_HOLD" | null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function imageBlock(location: MapLocationPin, maxHeight: number): string {
  const name = escapeHtml(location.name);
  if (location.coverImageUrl) {
    const src = escapeHtml(location.coverImageUrl);
    return `<img src="${src}" alt="${name}" class="map-popup-image" style="max-height:${maxHeight}px" loading="lazy" />`;
  }
  return `<div class="map-popup-no-image" style="height:${Math.min(maxHeight, 88)}px">No photo</div>`;
}

export function pinLiveStatus(location: MapLocationPin): MapLiveInventory["status"] {
  return (
    location.liveInventory?.status ??
    (location.bookingStatus === "UNAVAILABLE"
      ? "UNAVAILABLE"
      : location.bookingStatus === "ON_HOLD"
        ? "ON_HOLD"
        : "AVAILABLE")
  );
}

export function pinColorForStatus(status: MapLiveInventory["status"]): string {
  if (status === "UNAVAILABLE") return "#f43f5e";
  if (status === "ON_HOLD") return "#f59e0b";
  if (status === "PARTIAL") return "#0ea5e9";
  return "#10b981";
}

/** Initials for photo-less map pins (site code preferred). */
export function pinMonogram(location: MapLocationPin): string {
  const code = (location.skyarcSiteCode ?? "").trim();
  if (code) {
    const compact = code.replace(/[^A-Za-z0-9]/g, "");
    return (compact.slice(0, 2) || "AT").toUpperCase();
  }
  const words = (location.name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0]![0] ?? ""}${words[1]![0] ?? ""}`.toUpperCase() || "AT";
  }
  return (words[0]?.slice(0, 2) ?? "AT").toUpperCase();
}

/** DOM marker: circular cover thumb + status ring, or monogram fallback. */
export function createMapPinElement(
  location: MapLocationPin,
  options: { highlighted?: boolean } = {}
): HTMLDivElement {
  const status = pinLiveStatus(location);
  const color = pinColorForStatus(status);
  const size = options.highlighted ? 44 : 34;
  const el = document.createElement("div");
  el.className = `map-photo-pin${options.highlighted ? " map-photo-pin--selected" : ""}`;
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.borderColor = color;
  el.title = `${location.name} · ${status}`;

  if (location.coverImageUrl) {
    const img = document.createElement("img");
    img.src = location.coverImageUrl;
    img.alt = location.name;
    img.loading = "lazy";
    img.className = "map-photo-pin__img";
    img.onerror = () => {
      img.remove();
      const mono = document.createElement("span");
      mono.className = "map-photo-pin__mono";
      mono.textContent = pinMonogram(location);
      mono.style.backgroundColor = color;
      el.appendChild(mono);
    };
    el.appendChild(img);
  } else {
    const mono = document.createElement("span");
    mono.className = "map-photo-pin__mono";
    mono.textContent = pinMonogram(location);
    mono.style.backgroundColor = color;
    el.appendChild(mono);
  }

  return el;
}

function pinRateLabel(location: MapLocationPin): string {
  const amount =
    location.skyarcCommercialView?.clientRateAmount ??
    location.commercialView?.defaultRateAmount ??
    null;
  if (amount == null || !Number.isFinite(Number(amount))) return "";
  const currency =
    location.skyarcCommercialView?.currency ??
    location.commercialView?.currency ??
    "INR";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(Number(amount));
  } catch {
    return `${currency} ${Number(amount).toLocaleString("en-IN")}`;
  }
}

export function buildMapLocationCardHtml(
  location: MapLocationPin,
  mode: "hover" | "detail",
  options?: { from?: string; to?: string }
): string {
  const code = location.skyarcSiteCode ? escapeHtml(location.skyarcSiteCode) : "";
  const name = escapeHtml(location.name);
  const title = code || name;
  const road = location.road ? escapeHtml(location.road) : "";
  const city = location.city ? escapeHtml(location.city) : "";
  const status = pinLiveStatus(location);
  const statusLabel =
    status === "UNAVAILABLE"
      ? "Booked for dates"
      : status === "ON_HOLD"
        ? "On hold for dates"
        : status === "PARTIAL"
          ? "Partial for dates"
          : "Open for dates";
  const live = location.liveInventory;
  const slots =
    live?.capacity != null
      ? `${Math.max(0, (live.capacity ?? 0) - (live.used ?? 0))}/${live.capacity} free`
      : "";
  const face = location.primaryFace;
  const rawType = face?.inventoryType ?? location.inventoryTypes?.[0] ?? null;
  const formatLabel = rawType ? escapeHtml(formatInventoryType(rawType)) : "";
  const sizeLabel = face?.sizeLabel
    ? escapeHtml(face.sizeLabel)
    : face?.widthFt != null && face?.heightFt != null
      ? escapeHtml(`${face.widthFt}×${face.heightFt} ft`)
      : "";
  const rateLabel = escapeHtml(pinRateLabel(location));
  const metaBits = [formatLabel, sizeLabel, rateLabel].filter(Boolean).join(" · ");
  const image = imageBlock(location, mode === "hover" ? 140 : 180);
  const from = (options?.from ?? "").trim();
  const to = (options?.to ?? "").trim();
  const detailHref =
    from && to
      ? `/locations/${location.id}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      : `/locations/${location.id}`;

  if (mode === "hover") {
    return `<div class="map-popup-card">
      ${image}
      <div class="map-popup-body">
        <strong class="map-popup-title">${title}</strong>
        ${road && road !== name ? `<span class="map-popup-road">${road}</span>` : !code ? (road ? `<span class="map-popup-road">${road}</span>` : "") : `<span class="map-popup-road">${name}</span>`}
        ${metaBits ? `<span class="map-popup-road">${metaBits}</span>` : ""}
        <span class="map-popup-road">${statusLabel}${slots ? ` · ${slots}` : ""}${city ? ` · ${city}` : ""}</span>
      </div>
    </div>`;
  }

  const coords = `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;
  return `<div class="map-popup-card">
    ${image}
    <div class="map-popup-body">
      <strong class="map-popup-title">${title}</strong>
      ${road ? `<span class="map-popup-road">${road}</span>` : ""}
      ${city ? `<span class="map-popup-road">${city}</span>` : ""}
      ${metaBits ? `<span class="map-popup-road">${metaBits}</span>` : ""}
      <span class="map-popup-road">${statusLabel}${slots ? ` · ${slots}` : ""}</span>
      <span class="map-popup-coords">${coords}</span>
      <a href="${detailHref}" class="map-popup-link" data-location-id="${escapeHtml(location.id)}">View details →</a>
    </div>
  </div>`;
}
