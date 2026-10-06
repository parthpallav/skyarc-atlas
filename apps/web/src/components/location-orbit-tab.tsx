"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { createWebApiClient } from "@/lib/api";
import { ScreenOrbitPanel } from "@/components/screen-orbit-panel";
import { ConfirmModal } from "@/components/confirm-modal";

type ScreenRow = {
  id: string;
  label: string;
  skyarcScreenCode?: string | null;
  inventoryStatus: string;
};

const inputClass =
  "w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30";

export function LocationOrbitTab({
  locationId,
  canWrite,
}: {
  locationId: string;
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const [renamingScreenId, setRenamingScreenId] = useState<string | null>(null);
  const [renameLabel, setRenameLabel] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ScreenRow | null>(null);
  const [actionError, setActionError] = useState("");

  const { data: screens, isLoading } = useQuery({
    queryKey: ["location-screens", locationId],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.listLocationScreens(locationId);
      return result.data as ScreenRow[];
    },
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["location-screens", locationId] });
    await queryClient.invalidateQueries({ queryKey: ["location-faces-inventories", locationId] });
    await queryClient.invalidateQueries({ queryKey: ["location", locationId] });
    await queryClient.invalidateQueries({ queryKey: ["locations"] });
  };

  const renameMutation = useMutation({
    mutationFn: async () => {
      if (!renamingScreenId || !renameLabel.trim()) throw new Error("Label is required");
      const client = createWebApiClient();
      return client.updateScreen(renamingScreenId, { label: renameLabel.trim() });
    },
    onSuccess: async () => {
      setRenamingScreenId(null);
      setRenameLabel("");
      setActionError("");
      await invalidate();
    },
    onError: (e) => {
      setActionError(e instanceof Error ? e.message : "Failed to rename face");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (screenId: string) => {
      const client = createWebApiClient();
      return client.deleteScreen(screenId);
    },
    onSuccess: async () => {
      setDeleteTarget(null);
      setActionError("");
      await invalidate();
    },
    onError: (e) => {
      setActionError(e instanceof Error ? e.message : "Failed to remove face");
      setDeleteTarget(null);
    },
  });

  if (isLoading) {
    return <p className="text-sm text-muted">Loading screens…</p>;
  }

  if (!screens?.length) {
    return (
      <section className="card-surface p-5 sm:p-6">
        <h2 className="font-semibold text-slate-900">Orbit</h2>
        <p className="mt-2 text-sm text-muted">
          No faces on this location yet. Add a face first, then attach Orbit hardware.
        </p>
        <Link
          href={`/locations/${locationId}/edit?tab=faces`}
          className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
        >
          Go to Faces
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="card-surface p-5 sm:p-6">
        <h2 className="font-semibold text-slate-900">Orbit</h2>
        <p className="mt-1 text-sm text-muted">
          Rename or remove faces here, and attach or detach Orbit hardware per face.
        </p>
      </div>

      {actionError ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {actionError}
        </p>
      ) : null}

      {screens.map((screen) => {
        const renaming = renamingScreenId === screen.id;
        return (
          <article key={screen.id} className="card-surface p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {renaming ? (
                  <div className="flex max-w-md flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      className={inputClass}
                      value={renameLabel}
                      onChange={(e) => setRenameLabel(e.target.value)}
                      autoFocus
                      aria-label="Face label"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn-primary px-3 py-2 text-sm"
                        disabled={renameMutation.isPending || !renameLabel.trim()}
                        onClick={() => renameMutation.mutate()}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="btn-secondary px-3 py-2 text-sm"
                        onClick={() => {
                          setRenamingScreenId(null);
                          setRenameLabel("");
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h3 className="font-semibold text-slate-900">
                      {screen.skyarcScreenCode
                        ? `${screen.skyarcScreenCode} · ${screen.label}`
                        : screen.label}
                    </h3>
                    <p className="mt-0.5 text-xs text-muted">{screen.inventoryStatus}</p>
                  </>
                )}
              </div>

              {canWrite && !renaming ? (
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    aria-label="Rename face"
                    className="rounded-lg p-2 text-slate-500 hover:bg-violet-50 hover:text-primary"
                    onClick={() => {
                      setRenamingScreenId(screen.id);
                      setRenameLabel(screen.label);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Remove face"
                    className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                    onClick={() => setDeleteTarget(screen)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
            </div>

            <ScreenOrbitPanel screenId={screen.id} canWrite={canWrite} />
          </article>
        );
      })}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Remove face"
        description={
          deleteTarget
            ? `Remove “${deleteTarget.label}” and its products from this site? Orbit links on this face are removed too.`
            : undefined
        }
        confirmLabel="Remove face"
        danger
        busy={deleteMutation.isPending}
        onClose={() => {
          if (!deleteMutation.isPending) setDeleteTarget(null);
        }}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
      />
    </section>
  );
}
