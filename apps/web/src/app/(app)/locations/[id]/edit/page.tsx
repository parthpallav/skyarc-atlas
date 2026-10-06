"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Trash2 } from "lucide-react";
import { createWebApiClient } from "@/lib/api";
import { usePermissions } from "@/hooks/use-permissions";
import { PageHeader } from "@/components/page-header";
import { LocationPhotoEditor } from "@/components/location-photo-editor";
import { LocationInventoryPanel } from "@/components/location-inventory-panel";
import { LocationInventoryWizard } from "@/components/location-inventory-wizard";
import { LocationPrimaryFaceEditor } from "@/components/location-primary-face-editor";
import { LocationScoreEditor } from "@/components/location-score-editor";
import { LocationScoreIntel } from "@/components/location-score-intel";
import { LocationCommercialPanel } from "@/components/location-commercial-panel";
import { LocationSkyarcPricingPanel } from "@/components/location-skyarc-pricing-panel";
import { LocationOrbitTab } from "@/components/location-orbit-tab";
import { showAdtechBooking, showOrbitUi } from "@/lib/feature-flags";
import {
  resolveEditTab,
  resolveLocationUiGates,
  type EditTabId,
} from "@/lib/location-ui-gates";
import { cn } from "@/lib/utils";
import { ConfirmModal } from "@/components/confirm-modal";

export default function LocationEditPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const {
    canEditLocation,
    isInternal,
    isVendor,
    isClient,
    isAdmin,
    isReadOnly,
    canViewClientPricing,
    authUser,
  } = usePermissions();
  const [error, setError] = useState("");
  const [saveNotice, setSaveNotice] = useState("");
  const [ready, setReady] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: location, isLoading } = useQuery({
    queryKey: ["location", id],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.getLocation(id);
      return result.data as Record<string, unknown>;
    },
  });

  const { data: score } = useQuery({
    queryKey: ["location-score", id],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.getLocationScore(id);
      return result.data as {
        overallScore?: number;
        overallConfidence?: number;
        status?: string;
        components?: Array<{
          factor: string;
          score: number;
          confidence: number;
          status?: string;
          evidence?: string[];
        }>;
        methodology?: unknown;
        scenario?: {
          scenarioTitle?: string;
          scenarioSummary?: string;
          trustNotes?: string[];
        };
        configName?: string;
      } | null;
    },
    enabled: Boolean(id) && isInternal,
  });

  const locationRecord = location
    ? {
        id: String(location.id ?? id),
        createdByUserId: String(location.createdByUserId ?? ""),
        organizationId:
          location.organizationId != null ? String(location.organizationId) : null,
        archivedAt: location.archivedAt as Date | null | undefined,
      }
    : null;

  const isOwned = location
    ? (location.isOwned as boolean | undefined) !== false
    : true;
  const canEdit =
    Boolean(locationRecord) &&
    canEditLocation(locationRecord!) &&
    (isOwned || isInternal);

  const showVendorDetailsFlag =
    (location?.showVendorDetails as boolean | undefined) !== false;

  const adtechBooking = showAdtechBooking();
  const gates = useMemo(
    () =>
      resolveLocationUiGates({
        isClient,
        isVendor,
        isInternal,
        isAdmin,
        isReadOnly,
        isOwned,
        canEdit,
        showVendorDetails: showVendorDetailsFlag,
        canViewClientPricing: Boolean(authUser && canViewClientPricing),
        orbitUiEnabled: showOrbitUi(),
        adtechBookingEnabled: adtechBooking,
      }),
    [
      isClient,
      isVendor,
      isInternal,
      isAdmin,
      isReadOnly,
      isOwned,
      canEdit,
      showVendorDetailsFlag,
      authUser,
      canViewClientPricing,
      adtechBooking,
    ]
  );

  const requestedTab = searchParams.get("tab");
  const activeTab: EditTabId = resolveEditTab(requestedTab, gates);

  const setTab = (tab: EditTabId) => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    router.replace(`${url.pathname}?${url.searchParams.toString()}`, { scroll: false });
  };

  useEffect(() => {
    if (!location) return;
    if (!gates.canOpenEdit) {
      router.replace(`/locations/${id}`);
      return;
    }
    setReady(true);
  }, [location, gates.canOpenEdit, id, router]);

  useEffect(() => {
    if (!ready || !gates.editTabs.length) return;
    if (requestedTab !== activeTab) {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", activeTab);
      router.replace(`${url.pathname}?${url.searchParams.toString()}`, { scroll: false });
    }
  }, [ready, requestedTab, activeTab, gates.editTabs.length, router]);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      await client.deleteLocation(id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["locations"] });
      router.push("/locations");
    },
  });

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

  const commercialView = gates.showVendorCommercial
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
  const skyarcCommercialView = gates.showSkyarcPricing
    ? (location.skyarcCommercialView as
        | {
            clientRateAmount: number | null;
            ratePeriod: string | null;
            currency: string;
            notes: string | null;
          }
        | undefined)
    : undefined;

  const scoreNum = score?.overallScore != null ? Number(score.overallScore) : null;

  const invalidateAll = async () => {
    await queryClient.invalidateQueries({ queryKey: ["location", id] });
    await queryClient.invalidateQueries({ queryKey: ["locations"] });
    await queryClient.invalidateQueries({ queryKey: ["location-screens", id] });
    await queryClient.invalidateQueries({ queryKey: ["screen-inventories"] });
    await queryClient.invalidateQueries({ queryKey: ["location-assets", id] });
    await queryClient.invalidateQueries({ queryKey: ["location-score", id] });
  };

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
        description="Photos first, then site details — each tab edits one slice"
      />

      {error ? (
        <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      ) : null}
      {saveNotice ? (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {saveNotice}{" "}
          <Link href={`/locations/${id}`} className="font-semibold text-primary hover:underline">
            View location
          </Link>
        </p>
      ) : null}

      {gates.editTabs.length > 1 ? (
        <div className="mb-4 flex gap-1 overflow-x-auto border-b border-violet-100 pb-px">
          {gates.editTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "shrink-0 rounded-t-lg px-4 py-2.5 text-sm font-semibold transition-colors",
                activeTab === t.id
                  ? "border-b-2 border-primary bg-violet-50/80 text-primary"
                  : "text-muted hover:bg-violet-50/50 hover:text-slate-800"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="min-h-[12rem]">
        {activeTab === "photos" && gates.showEditPhotos ? (
          <section className="card-surface p-5 sm:p-6">
            <h2 className="mb-4 font-semibold text-slate-900">Site photos</h2>
            <LocationPhotoEditor locationId={id} />
          </section>
        ) : null}

        {activeTab === "site" && gates.showEditSite ? (
          <div className="space-y-4">
            <section className="card-surface p-5 sm:p-6">
              <h2 className="mb-1 font-semibold text-slate-900">Site & market</h2>
              <p className="mb-4 text-sm text-muted">
                Address, map pin, and mounting. Format and size are saved in the section below.
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
                onError={(message) => {
                  setSaveNotice("");
                  setError(message);
                }}
                onSuccess={async () => {
                  await invalidateAll();
                  setError("");
                  setSaveNotice("Site details saved.");
                }}
              />
            </section>
            <LocationPrimaryFaceEditor
              locationId={id}
              onSaved={async () => {
                await invalidateAll();
                setError("");
                setSaveNotice("Format & size saved.");
              }}
            />
          </div>
        ) : null}

        {activeTab === "faces" && gates.showEditFaces ? (
          <LocationInventoryPanel
            locationId={id}
            canWrite
            showVendorRates={gates.showVendorCommercial}
          />
        ) : null}

        {activeTab === "index" && gates.showEditIndex ? (
          <section className="space-y-4">
            <div className="rounded-2xl border border-violet-100 bg-violet-50/60 px-4 py-3 sm:px-5">
              <p className="text-sm font-semibold text-slate-900">Manual Skyarc Index</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Factor scores for this location only. Current Index:{" "}
                <span className="font-semibold text-slate-800">
                  {scoreNum != null ? `${Math.round(scoreNum)} / 100` : "not set yet"}
                </span>
              </p>
            </div>
            <LocationScoreIntel
              overallScore={scoreNum}
              overallConfidence={
                score?.overallConfidence != null ? Number(score.overallConfidence) : null
              }
              status={score?.status ? String(score.status) : null}
              components={score?.components ?? null}
              methodology={score?.methodology}
              scenario={score?.scenario ?? null}
              configName={score?.configName ?? null}
              customerFacing={false}
            />
            <LocationScoreEditor locationId={id} />
          </section>
        ) : null}

        {activeTab === "pricing" && gates.showEditPricing ? (
          <div className="space-y-4">
            {gates.showVendorCommercial ? (
              <LocationCommercialPanel
                locationId={id}
                canWrite
                commercialView={commercialView}
              />
            ) : null}
            {gates.showSkyarcPricing ? (
              <LocationSkyarcPricingPanel
                locationId={id}
                canWrite={gates.canEditSkyarcPricing}
                skyarcCommercialView={skyarcCommercialView}
              />
            ) : null}
          </div>
        ) : null}

        {activeTab === "orbit" && gates.showEditOrbit ? (
          <LocationOrbitTab locationId={id} canWrite />
        ) : null}

        {activeTab === "danger" && gates.showEditDanger ? (
          <section className="card-surface space-y-4 border-rose-100 p-5 sm:p-6">
            <h2 className="font-semibold text-rose-900">Danger zone</h2>
            <p className="text-sm text-muted">
              Deleting removes this site from the map and lists. Prefer Hide from the catalog when you
              only need it off discovery.
            </p>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-800"
              disabled={deleteMutation.isPending}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
              {deleteMutation.isPending ? "Deleting…" : "Delete location"}
            </button>
            {deleteMutation.isError ? (
              <p className="text-xs text-red-600">
                {deleteMutation.error instanceof Error
                  ? deleteMutation.error.message
                  : "Failed to delete location"}
              </p>
            ) : null}
          </section>
        ) : null}
      </div>

      <ConfirmModal
        open={deleteOpen}
        title="Delete location"
        description={`Delete "${String(location.name)}"? This removes it from the map and lists.`}
        confirmLabel="Delete location"
        danger
        busy={deleteMutation.isPending}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}
