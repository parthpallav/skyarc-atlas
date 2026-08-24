export interface MapLocationPin {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  road?: string | null;
  coverImageUrl?: string | null;
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

export function buildMapLocationCardHtml(
  location: MapLocationPin,
  mode: "hover" | "detail"
): string {
  const name = escapeHtml(location.name);
  const road = location.road ? escapeHtml(location.road) : "";
  const image = imageBlock(location, mode === "hover" ? 140 : 180);

  if (mode === "hover") {
    return `<div class="map-popup-card">
      ${image}
      <div class="map-popup-body">
        <strong class="map-popup-title">${name}</strong>
        ${road ? `<span class="map-popup-road">${road}</span>` : ""}
      </div>
    </div>`;
  }

  const coords = `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;
  return `<div class="map-popup-card">
    ${image}
    <div class="map-popup-body">
      <strong class="map-popup-title">${name}</strong>
      ${road ? `<span class="map-popup-road">${road}</span>` : ""}
      <span class="map-popup-coords">${coords}</span>
      <a href="/locations/${location.id}" class="map-popup-link">View details →</a>
    </div>
  </div>`;
}
