"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";
import { PageHeader } from "@/components/page-header";
import { LocationInventoryWizard } from "@/components/location-inventory-wizard";

export default function NewLocationPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isReadOnly } = usePermissions();
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  if (isReadOnly) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center">
        <p className="text-muted">You do not have permission to add locations.</p>
        <Link href="/locations" className="mt-4 inline-block text-sm font-medium text-primary">
          Back to locations
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl pb-16">
      <Link
        href="/locations"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Locations
      </Link>

      <PageHeader
        title="Add inventory site"
        description="Site & market → format class → production specs"
      />

      {error ? (
        <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      ) : null}

      <LocationInventoryWizard
        mode="create"
        photoFile={photoFile}
        photoPreview={photoPreview}
        onPhotoSelected={handlePhotoSelected}
        onRemovePhoto={handleRemovePhoto}
        fileInputRef={fileInputRef}
        onError={setError}
        onSuccess={async (id) => {
          await queryClient.invalidateQueries({ queryKey: ["locations"] });
          await queryClient.invalidateQueries({ queryKey: ["locations-map"] });
          router.push(`/locations/${id}`);
        }}
      />
    </div>
  );
}
