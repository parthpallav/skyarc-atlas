"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { createWebApiClient } from "@/lib/api";
import { usePermissions } from "@/hooks/use-permissions";
import { PageHeader } from "@/components/page-header";
import { LocationPhotoEditor } from "@/components/location-photo-editor";
import { LocationInventoryPanel } from "@/components/location-inventory-panel";
import { LocationInventoryWizard } from "@/components/location-inventory-wizard";

export default function LocationEditPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { canEditLocation, isInternal } = usePermissions();
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  const { data: location, isLoading } = useQuery({
    queryKey: ["location", id],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.getLocation(id);
      return result.data as Record<string, unknown>;
    },
  });

  useEffect(() => {
    if (!location) return;
    const record = {
      id: String(location.id ?? id),
      createdByUserId: String(location.createdByUserId ?? ""),
      organizationId:
        location.organizationId != null ? String(location.organizationId) : null,
      archivedAt: location.archivedAt as Date | null | undefined,
    };
    const isOwned = (location.isOwned as boolean | undefined) !== false;
    if (!canEditLocation(record) || !(isOwned || isInternal)) {
      router.replace(`/locations/${id}`);
      return;
    }
    setReady(true);
  }, [location, canEditLocation, isInternal, id, router]);

  if (isLoading || !ready) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 h-8 w-48 animate-pulse rounded bg-slate-200" />
        <div className="card-surface h-96 animate-pulse bg-slate-50" />
      </div>
    );
  }

  if (!location) {
    return (
      <div className="py-12 text-center">
        <p className="mb-4 text-red-600">Location not found</p>
        <Link href="/locations" className="text-sm font-medium text-primary hover:underline">
          Back to locations
        </Link>
      </div>
    );
  }

  const showVendorRates =
    (location.showVendorDetails as boolean | undefined) !== false;

  return (
    <div className="mx-auto w-full max-w-4xl pb-16">
      <Link
        href={`/locations/${id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to location
      </Link>

      <PageHeader
        title="Edit location"
        description="Site & market → format class → production specs (same flow as Add)"
      />

      {error ? (
        <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      ) : null}

      <section className="card-surface mb-4 p-5 sm:p-6">
        <h2 className="mb-4 font-semibold text-slate-900">Site photos</h2>
        <LocationPhotoEditor locationId={id} />
      </section>

      <section className="card-surface mb-4 p-5 sm:p-6">
        <h2 className="mb-1 font-semibold text-slate-900">Site, class & specs</h2>
        <p className="mb-4 text-sm text-muted">
          Update market geo and optionally add another face with production specs. Leave product
          code blank to save site details only.
        </p>
        <LocationInventoryWizard
          mode="edit"
          allowSiteOnlySave
          initial={{
            id,
            name: String(location.name ?? ""),
            latitude: location.latitude as number,
            longitude: location.longitude as number,
            address: location.address ? String(location.address) : "",
            road: location.road ? String(location.road) : "",
            junction: location.junction ? String(location.junction) : "",
            city: location.city ? String(location.city) : "",
            district: location.district ? String(location.district) : "",
            state: location.state ? String(location.state) : "",
            mountingType: location.mountingType ? String(location.mountingType) : "",
            mountingNotes: location.mountingNotes ? String(location.mountingNotes) : "",
          }}
          onError={setError}
          onSuccess={async () => {
            await queryClient.invalidateQueries({ queryKey: ["location", id] });
            await queryClient.invalidateQueries({ queryKey: ["locations"] });
            await queryClient.invalidateQueries({ queryKey: ["location-screens", id] });
            await queryClient.invalidateQueries({ queryKey: ["screen-inventories"] });
            router.push(`/locations/${id}`);
          }}
        />
      </section>

      <LocationInventoryPanel
        locationId={id}
        canWrite
        showVendorRates={showVendorRates}
      />
    </div>
  );
}
