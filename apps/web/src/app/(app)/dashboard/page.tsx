"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { MapPin, ClipboardCheck, Sparkles, ChevronRight } from "lucide-react";
import { createWebApiClient } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { LocationImage } from "@/components/location-image";

interface LocationRow {
  id: string;
  name: string;
  surveyStatus: string;
  road?: string | null;
  coverImageUrl?: string;
}

export default function DashboardPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["locations"],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.listLocations(1, 100);
      return result.data as LocationRow[];
    },
    retry: 2,
    retryDelay: 1000,
  });

  const locations = data ?? [];
  const submitted = locations.filter((l) => l.surveyStatus === "SUBMITTED").length;
  const draft = locations.filter((l) => l.surveyStatus === "DRAFT").length;
  const recent = locations.slice(0, 6);

  const stats = [
    {
      label: "Total locations",
      value: isLoading ? "—" : locations.length,
      icon: MapPin,
      href: "/locations",
      accent: "text-primary",
    },
    {
      label: "Submitted surveys",
      value: isLoading ? "—" : submitted,
      icon: ClipboardCheck,
      href: "/locations",
      accent: "text-skyarc-success",
    },
    {
      label: "Draft / in progress",
      value: isLoading ? "—" : draft,
      icon: Sparkles,
      href: "/locations",
      accent: "text-skyarc-warning",
    },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Rajkot DOOH inventory — locations, surveys, and map coverage."
        action={
          <Link href="/map" className="btn-primary">
            View Rajkot map
          </Link>
        }
      />
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          Could not load data from API.{" "}
          <button type="button" onClick={() => refetch()} className="underline font-medium">
            Retry
          </button>
          {isFetching && " …"}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link
              key={stat.label}
              href={stat.href}
              className="card-surface p-5 sm:p-6 hover:border-primary/30 hover:shadow-md transition-all group"
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-muted text-sm font-medium">{stat.label}</p>
                <Icon className={`w-5 h-5 ${stat.accent} opacity-80`} />
              </div>
              <p className="text-3xl sm:text-4xl font-bold text-slate-900">{stat.value}</p>
            </Link>
          );
        })}
      </div>

      <section className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Recent locations</h2>
          <Link href="/locations" className="text-sm text-primary font-medium hover:underline">
            View all
          </Link>
        </div>
        <div className="card-surface divide-y divide-slate-100 overflow-hidden">
          {isLoading &&
            [1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse bg-slate-50" />
            ))}
          {!isLoading &&
            recent.map((location) => (
              <Link
                key={location.id}
                href={`/locations/${location.id}`}
                className="flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors"
              >
                <LocationImage
                  src={location.coverImageUrl}
                  alt={location.name}
                  aspect="square"
                  className="w-16 h-16 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 truncate">{location.name}</p>
                  {location.road && (
                    <p className="text-sm text-muted truncate">{location.road}</p>
                  )}
                </div>
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 shrink-0">
                  {location.surveyStatus}
                </span>
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
              </Link>
            ))}
          {!isLoading && recent.length === 0 && (
            <p className="text-muted text-center py-10 text-sm">No locations yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
