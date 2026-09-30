"use client";

import { useQuery } from "@tanstack/react-query";
import { createWebApiClient } from "@/lib/api";
import { ScreenOrbitPanel } from "@/components/screen-orbit-panel";

type ScreenRow = {
  id: string;
  label: string;
  skyarcScreenCode?: string | null;
  inventoryStatus: string;
};

export function LocationOrbitTab({
  locationId,
  canWrite,
}: {
  locationId: string;
  canWrite: boolean;
}) {
  const { data: screens, isLoading } = useQuery({
    queryKey: ["location-screens", locationId],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.listLocationScreens(locationId);
      return result.data as ScreenRow[];
    },
  });

  if (isLoading) {
    return <p className="text-sm text-muted">Loading screens…</p>;
  }

  if (!screens?.length) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
        <h2 className="font-semibold text-slate-900">Orbit</h2>
        <p className="mt-2 text-sm text-muted">
          No screens on this location yet. Add a face first, then attach Orbit hardware.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
        <h2 className="font-semibold text-slate-900">Orbit</h2>
        <p className="mt-1 text-sm text-muted">
          Device status per screen. Atlas stays usable when no Orbit device is attached.
        </p>
      </div>
      {screens.map((screen) => (
        <div
          key={screen.id}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-slate-900">
                {screen.skyarcScreenCode
                  ? `${screen.skyarcScreenCode} · ${screen.label}`
                  : screen.label}
              </p>
              <p className="text-xs text-muted">{screen.inventoryStatus}</p>
            </div>
          </div>
          <ScreenOrbitPanel screenId={screen.id} canWrite={canWrite} />
        </div>
      ))}
    </section>
  );
}
