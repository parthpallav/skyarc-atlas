"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { SurveyStatus } from "@skyarc/shared";
import { createWebApiClient } from "@/lib/api";
import { usePermissions } from "@/hooks/use-permissions";
import { PageHeader } from "@/components/page-header";
import { LocationPhotoEditor } from "@/components/location-photo-editor";

const inputClass =
  "w-full rounded-lg border border-violet-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30";

export default function LocationEditPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { canEditLocation } = usePermissions();

  const [name, setName] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [address, setAddress] = useState("");
  const [road, setRoad] = useState("");
  const [roadType, setRoadType] = useState("");
  const [junction, setJunction] = useState("");
  const [mountingType, setMountingType] = useState("");
  const [mountingNotes, setMountingNotes] = useState("");
  const [surveyStatus, setSurveyStatus] = useState<string>(SurveyStatus.DRAFT);
  const [error, setError] = useState("");

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
    if (!canEditLocation(record)) {
      router.replace(`/locations/${id}`);
      return;
    }
    setName(String(location.name ?? ""));
    setLatitude(String(location.latitude ?? ""));
    setLongitude(String(location.longitude ?? ""));
    setAddress(String(location.address ?? ""));
    setRoad(String(location.road ?? ""));
    setRoadType(String(location.roadType ?? ""));
    setJunction(String(location.junction ?? ""));
    setMountingType(String(location.mountingType ?? ""));
    setMountingNotes(String(location.mountingNotes ?? ""));
    setSurveyStatus(String(location.surveyStatus ?? SurveyStatus.DRAFT));
  }, [location, canEditLocation, id, router]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      const lat = Number(latitude);
      const lng = Number(longitude);
      if (!name.trim()) throw new Error("Name is required");
      if (Number.isNaN(lat) || lat < -90 || lat > 90) throw new Error("Invalid latitude");
      if (Number.isNaN(lng) || lng < -180 || lng > 180) throw new Error("Invalid longitude");

      return client.updateLocation(id, {
        name: name.trim(),
        latitude: lat,
        longitude: lng,
        address: address.trim() || undefined,
        road: road.trim() || undefined,
        roadType: roadType.trim() || undefined,
        junction: junction.trim() || undefined,
        mountingType: mountingType.trim() || undefined,
        mountingNotes: mountingNotes.trim() || undefined,
        surveyStatus,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["location", id] });
      await queryClient.invalidateQueries({ queryKey: ["locations"] });
      router.push(`/locations/${id}`);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to save");
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse mb-6" />
        <div className="h-96 card-surface animate-pulse bg-slate-50" />
      </div>
    );
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

  return (
    <div className="max-w-4xl mx-auto w-full">
      <Link
        href={`/locations/${id}`}
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-slate-900 mb-4 font-medium"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to location
      </Link>

      <PageHeader title="Edit location" description={String(location.name)} />

      <section className="card-surface p-5 sm:p-6 mb-4">
        <h2 className="font-semibold text-slate-900 mb-4">Site photos</h2>
        <LocationPhotoEditor locationId={id} />
      </section>

      <form
        className="card-surface p-5 sm:p-6 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          saveMutation.mutate();
        }}
      >
        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Latitude</label>
            <input
              className={inputClass}
              type="number"
              step="any"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Longitude</label>
            <input
              className={inputClass}
              type="number"
              step="any"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Survey status</label>
          <select
            className={inputClass}
            value={surveyStatus}
            onChange={(e) => setSurveyStatus(e.target.value)}
          >
            {Object.values(SurveyStatus).map((status) => (
              <option key={status} value={status}>
                {status.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
          <input className={inputClass} value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Road</label>
            <input className={inputClass} value={road} onChange={(e) => setRoad(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Road type</label>
            <input className={inputClass} value={roadType} onChange={(e) => setRoadType(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Junction</label>
            <input className={inputClass} value={junction} onChange={(e) => setJunction(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Mounting type</label>
            <input
              className={inputClass}
              value={mountingType}
              onChange={(e) => setMountingType(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Mounting notes</label>
          <textarea
            className={`${inputClass} min-h-[88px]`}
            value={mountingNotes}
            onChange={(e) => setMountingNotes(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <button type="submit" className="btn-primary" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving…" : "Save changes"}
          </button>
          <Link href={`/locations/${id}`} className="btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
