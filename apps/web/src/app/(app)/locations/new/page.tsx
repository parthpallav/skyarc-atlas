"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, ImagePlus, Upload, X } from "lucide-react";
import { createWebApiClient } from "@/lib/api";
import { usePermissions } from "@/hooks/use-permissions";
import { PageHeader } from "@/components/page-header";

const inputClass =
  "w-full rounded-lg border border-violet-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30";

export default function NewLocationPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isReadOnly } = usePermissions();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [latitude, setLatitude] = useState("22.3039");
  const [longitude, setLongitude] = useState("70.8022");
  const [address, setAddress] = useState("");
  const [road, setRoad] = useState("");
  const [roadType, setRoadType] = useState("");
  const [junction, setJunction] = useState("");
  const [mountingType, setMountingType] = useState("");
  const [mountingNotes, setMountingNotes] = useState("");

  // Mandatory Photo state
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [error, setError] = useState("");

  function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file (JPEG, PNG, WebP)");
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setError("");
  }

  function handleRemovePhoto() {
    setPhotoFile(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!photoFile) {
        throw new Error("At least one location photo is mandatory for creating inventory.");
      }

      const client = createWebApiClient();
      const lat = Number(latitude);
      const lng = Number(longitude);
      if (!name.trim()) throw new Error("Site name is required");
      if (Number.isNaN(lat) || lat < -90 || lat > 90) throw new Error("Valid latitude is required");
      if (Number.isNaN(lng) || lng < -180 || lng > 180) throw new Error("Valid longitude is required");

      const res = await client.createLocation({
        name: name.trim(),
        latitude: lat,
        longitude: lng,
        address: address.trim() || undefined,
        road: road.trim() || undefined,
        roadType: roadType.trim() || undefined,
        junction: junction.trim() || undefined,
        mountingType: mountingType.trim() || undefined,
        mountingNotes: mountingNotes.trim() || undefined,
      });

      const locationData = res.data as { id: string };

      // Upload mandatory photo directly
      try {
        const buffer = await photoFile.arrayBuffer();
        await client.uploadLocationAssetDirect(
          locationData.id,
          buffer,
          photoFile.type || "image/jpeg",
          "FRONT_OF_SCREEN"
        );
      } catch (assetErr) {
        console.warn("Photo upload warning:", assetErr);
      }

      return locationData;
    },
    onSuccess: async (loc) => {
      await queryClient.invalidateQueries({ queryKey: ["locations"] });
      await queryClient.invalidateQueries({ queryKey: ["locations-map"] });
      router.push(`/locations/${loc.id}`);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to create location");
    },
  });

  return (
    <div className="max-w-2xl mx-auto w-full pb-16">
      <Link
        href="/locations"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-slate-900 mb-4 font-medium"
      >
        <ArrowLeft className="w-4 h-4" />
        Locations
      </Link>

      <PageHeader
        title="Add New Inventory Site"
        description="Add a new billboard or advertising site to your catalog"
      />

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
          {error}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          createMutation.mutate();
        }}
        className="card-surface p-6 space-y-5"
      >
        {/* MANDATORY PHOTO UPLOAD */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-900 uppercase tracking-wide">
            Site Photo * <span className="text-red-500 font-semibold normal-case">(Mandatory - At least 1 photo required)</span>
          </label>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoSelected}
          />

          {!photoPreview ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-violet-200 hover:border-primary bg-violet-50/40 hover:bg-violet-50/70 rounded-2xl p-6 text-center cursor-pointer transition-all space-y-2"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
                <Camera className="w-6 h-6" />
              </div>
              <p className="text-xs font-bold text-slate-800">
                Click or tap to capture / upload site photo
              </p>
              <p className="text-[11px] text-muted">
                Front facing view or wide angle hoarding photograph
              </p>
            </div>
          ) : (
            <div className="relative rounded-2xl overflow-hidden border border-violet-200 bg-slate-900 group max-h-64 flex items-center justify-center">
              <img
                src={photoPreview}
                alt="Site Preview"
                className="w-full h-56 object-cover"
              />
              <button
                type="button"
                onClick={handleRemovePhoto}
                className="absolute top-2.5 right-2.5 p-1.5 rounded-full bg-black/70 text-white hover:bg-red-600 transition-colors"
                title="Remove photo"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="absolute bottom-2.5 left-2.5 bg-black/60 backdrop-blur-sm text-white px-2.5 py-1 rounded-md text-[11px] font-semibold">
                Cover Photo Attached
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
            Site / Hoarding Name *
          </label>
          <input
            type="text"
            required
            placeholder="e.g. Kalawad Road - AG Chowk Flyover Unipole"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
              Latitude *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. 22.2738"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
              Longitude *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. 70.7573"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
              Road / Corridor
            </label>
            <input
              type="text"
              placeholder="e.g. 150 Feet Ring Road"
              value={road}
              onChange={(e) => setRoad(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
              Junction / Circle
            </label>
            <input
              type="text"
              placeholder="e.g. KKV Chowk"
              value={junction}
              onChange={(e) => setJunction(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
            Detailed Location Address & Facing
          </label>
          <input
            type="text"
            placeholder="e.g. Nr. Madhapar Circle, Opp. D-Mart, 150 Ft Ring Road Facing"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
              Road Type
            </label>
            <input
              type="text"
              placeholder="e.g. ARTERIAL, HIGHWAY"
              value={roadType}
              onChange={(e) => setRoadType(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
              Mounting Type
            </label>
            <input
              type="text"
              placeholder="e.g. UNIPOLE, ROOFTOP, GANTRY"
              value={mountingType}
              onChange={(e) => setMountingType(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
            Size & Illumination Notes
          </label>
          <textarea
            rows={2}
            placeholder="e.g. 40ft x 20ft (800 sqft) · Frontlit LED illumination"
            value={mountingNotes}
            onChange={(e) => setMountingNotes(e.target.value)}
            className={inputClass}
          />
        </div>

        <button
          type="submit"
          disabled={createMutation.isPending || isReadOnly || !photoFile}
          className="btn-primary w-full py-3 disabled:opacity-50 text-sm font-semibold"
        >
          {createMutation.isPending ? "Creating Site & Uploading Photo…" : "Save Inventory Site"}
        </button>
      </form>
    </div>
  );
}
