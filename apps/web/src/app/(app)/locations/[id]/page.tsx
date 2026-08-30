"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MapPin, Pencil, Trash2 } from "lucide-react";
import { createWebApiClient } from "@/lib/api";
import { usePermissions } from "@/hooks/use-permissions";
import { PageHeader } from "@/components/page-header";
import { ImageGallery } from "@/components/image-gallery";
import { LocationInventoryPanel } from "@/components/location-inventory-panel";
import { LocationCommercialPanel } from "@/components/location-commercial-panel";
import { LocationSkyarcPricingPanel } from "@/components/location-skyarc-pricing-panel";
import { canViewClientPricing } from "@skyarc/shared";
import { trackEntityView } from "@/lib/clarity-telemetry";
import { useEffect } from "react";
import { LocationDetailSkeleton } from "@/components/ui/skeleton";

interface AssetRow {
  id: string;
  kind: string;
  url: string | null;
  view?: string;
  viewLabel?: string;
  sortOrder?: number;
  contentType?: string;
  uploadStatus: string;
}

export default function LocationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { canEditLocation, isVendor, isReadOnly, authUser } = usePermissions();

  const { data: location, isLoading } = useQuery({
    queryKey: ["location", id],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.getLocation(id);
      return result.data as Record<string, unknown> & { coverImageUrl?: string };
    },
  });

  useEffect(() => {
    if (location) {
      trackEntityView("location", {
        id: String(location.id ?? id),
        name: String(location.name ?? ""),
        road: location.road ? String(location.road) : undefined,
        surveyStatus: location.surveyStatus ? String(location.surveyStatus) : undefined,
      });
    }
  }, [location, id]);

  const { data: assets } = useQuery({
    queryKey: ["location-assets", id],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.listAssets(id);
      return result.data as AssetRow[];
    },
    enabled: Boolean(id),
  });

  const { data: score } = useQuery({
    queryKey: ["location-score", id],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.getLocationScore(id);
      return result.data as Record<string, unknown> | null;
    },
  });


  const deleteMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      return client.deleteLocation(id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["locations"] });
      await queryClient.invalidateQueries({ queryKey: ["locations-map"] });
      router.push("/locations");
    },
  });

  if (isLoading) {
    return <LocationDetailSkeleton />;
  }

  if (!location) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">Location not found</p>
        <Link href="/locations" className="text-primary hover:underline text-sm font-medium">
          Back to locations
        </Link>
      </div>
    );
  }

  const galleryImages =
    assets && assets.length > 0
      ? assets.map((a) => ({
          id: a.id,
          url: a.url,
          kind: a.kind,
          viewLabel: a.viewLabel,
          sortOrder: a.sortOrder,
          contentType: a.contentType,
        }))
      : location.coverImageUrl
        ? [{ id: "cover", url: location.coverImageUrl, kind: "PHOTO", viewLabel: "Front" }]
        : [];

  const details = [
    { label: "Survey status", value: String(location.surveyStatus ?? "—") },
    { label: "Road / area", value: String(location.road ?? "—") },
    { label: "Address", value: String(location.address ?? "—") },
    { label: "Mounting notes", value: String(location.mountingNotes ?? "—") },
  ];

  const scoreNum = score ? Number(score.overallScore) : null;
  const scoreColor =
    scoreNum == null
      ? "text-slate-400"
      : scoreNum >= 75
        ? "text-skyarc-success"
        : scoreNum >= 50
          ? "text-skyarc-warning"
          : "text-skyarc-danger";

  const locationRecord = {
    id: String(location.id ?? id),
    createdByUserId: String(location.createdByUserId ?? ""),
    organizationId:
      location.organizationId != null ? String(location.organizationId) : null,
    archivedAt: location.archivedAt as Date | null | undefined,
  };
  const isOwned = (location.isOwned as boolean | undefined) !== false;
  const canEdit = canEditLocation(locationRecord) && isOwned;
  const showCommercial = isOwned || !isVendor;
  const canManageSkyarcPricing = authUser ? canViewClientPricing(authUser) : false;

  const commercialView = isOwned
    ? (location.commercialView as
        | {
            marginPercent: number | null;
            defaultRateAmount: number | null;
            ratePeriod: string | null;
            currency: string;
            paymentTermsDays: number | null;
            notes: string | null;
            usesOrgDefaultMargin: boolean;
          }
        | undefined)
    : undefined;

  const skyarcCommercialView = canManageSkyarcPricing
    ? (location.skyarcCommercialView as
        | {
            clientRateAmount: number | null;
            ratePeriod: string | null;
            currency: string;
            notes: string | null;
          }
        | undefined)
    : undefined;

  return (
    <div className="max-w-4xl mx-auto w-full">
      <Link
        href="/locations"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-slate-900 mb-4 font-medium"
      >
        <ArrowLeft className="w-4 h-4" />
        Locations
      </Link>

      <PageHeader
        title={String(location.name)}
        description={`${Number(location.latitude).toFixed(5)}, ${Number(location.longitude).toFixed(5)}`}
        action={
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <Link href={`/locations/${id}/edit`} className="btn-primary gap-2">
                <Pencil className="w-4 h-4" />
                Edit
              </Link>
            )}
            <Link href="/map" className="btn-secondary gap-2">
              <MapPin className="w-4 h-4" />
              View on map
            </Link>
            {canEdit && (
              <button
                type="button"
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded-lg transition-colors"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      `Delete "${String(location.name)}"? This removes it from the map and lists.`
                    )
                  ) {
                    deleteMutation.mutate();
                  }
                }}
              >
                <Trash2 className="w-4 h-4" />
                {deleteMutation.isPending ? "Deleting…" : "Delete"}
              </button>
            )}
          </div>
        }
      />

      {deleteMutation.isError && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
          {deleteMutation.error instanceof Error
            ? deleteMutation.error.message
            : "Failed to delete location"}
        </p>
      )}

      <section className="card-surface p-5 sm:p-6 mb-4">
        <h2 className="font-semibold text-slate-900 mb-4">Site photos</h2>
        <ImageGallery images={galleryImages} altPrefix={String(location.name)} />
      </section>

      {showCommercial && (
        <LocationCommercialPanel
          locationId={id}
          canWrite={canEdit}
          commercialView={commercialView}
        />
      )}

      {canManageSkyarcPricing && (
        <LocationSkyarcPricingPanel
          locationId={id}
          canWrite={canManageSkyarcPricing && !isReadOnly}
          skyarcCommercialView={skyarcCommercialView}
        />
      )}

      {isOwned && <LocationInventoryPanel locationId={id} canWrite={canEdit} />}

      <section className="card-surface p-5 sm:p-6 mb-4">
        <h2 className="font-semibold text-slate-900 mb-4">Location intelligence</h2>
        {score ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-muted text-xs uppercase tracking-wide font-medium">Score</p>
              <p className={`text-3xl font-bold mt-1 ${scoreColor}`}>
                {String(score.overallScore)}
                <span className="text-lg text-muted font-normal"> / 100</span>
              </p>
            </div>
            <div>
              <p className="text-muted text-xs uppercase tracking-wide font-medium">Status</p>
              <p className="text-lg font-medium mt-1 text-slate-900">{String(score.status)}</p>
            </div>
            <div>
              <p className="text-muted text-xs uppercase tracking-wide font-medium">Confidence</p>
              <p className="text-lg font-medium mt-1 text-slate-900">
                {String(score.overallConfidence)}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-muted">Score not yet computed.</p>
        )}
      </section>

      <section className="card-surface p-5 sm:p-6">
        <h2 className="font-semibold text-slate-900 mb-4">Details</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
          {details.map((row) => (
            <div key={row.label} className="min-w-0">
              <dt className="text-muted mb-0.5 font-medium">{row.label}</dt>
              <dd className="break-words text-slate-900">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
