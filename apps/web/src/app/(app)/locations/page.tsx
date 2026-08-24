"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { createWebApiClient } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { LocationImage } from "@/components/location-image";

interface Location {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  surveyStatus: string;
  address?: string | null;
  road?: string | null;
  coverImageUrl?: string;
}

function statusColor(status: string) {
  if (status === "SUBMITTED") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "IN_PROGRESS") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

export default function LocationsPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["locations"],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.listLocations(1, 100);
      return result.data as Location[];
    },
    retry: 2,
    retryDelay: 1000,
  });

  return (
    <div>
      <PageHeader
        title="Locations"
        description={`${data?.length ?? 0} billboard sites across Rajkot`}
        action={
          <Link href="/map" className="btn-primary">
            Open map
          </Link>
        }
      />

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-64 card-surface animate-pulse bg-slate-50" />
          ))}
        </div>
      )}

      {error && (
        <p className="text-red-700 text-sm p-4 bg-red-50 border border-red-200 rounded-xl">
          Failed to load locations.{" "}
          <button type="button" onClick={() => refetch()} className="underline font-medium">
            Retry
          </button>
        </p>
      )}

      {!isLoading && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {(data ?? []).map((location) => (
            <Link
              key={location.id}
              href={`/locations/${location.id}`}
              className="card-surface overflow-hidden hover:border-primary/30 hover:shadow-md transition-all group"
            >
              <LocationImage
                src={location.coverImageUrl}
                alt={location.name}
                aspect="video"
                className="rounded-none border-0 border-b border-slate-200"
              />
              <div className="p-4">
                <div className="flex justify-between items-start gap-2 mb-2">
                  <h2 className="font-semibold text-slate-900 line-clamp-2 group-hover:text-primary transition-colors">
                    {location.name}
                  </h2>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border shrink-0 ${statusColor(location.surveyStatus)}`}
                  >
                    {location.surveyStatus}
                  </span>
                </div>
                <p className="text-muted text-xs font-mono">
                  {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
                </p>
                {(location.road || location.address) && (
                  <p className="text-muted text-sm mt-2 line-clamp-2">
                    {[location.road, location.address].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            </Link>
          ))}
          {(data ?? []).length === 0 && (
            <p className="text-muted text-center py-12 col-span-full">
              No locations yet. Field surveys will appear here.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
