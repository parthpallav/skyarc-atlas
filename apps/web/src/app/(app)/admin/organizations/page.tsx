"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createWebApiClient } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { ConfirmModal } from "@/components/confirm-modal";
import { usePermissions } from "@/hooks/use-permissions";
import { CheckCircle2, Trash2 } from "lucide-react";

interface OrganizationRow {
  id: string;
  name: string;
  type: string;
  status: string;
  memberCount: number;
  locationCount: number;
  commercial?: { skyarcMarginPercent?: number };
}

export default function AdminOrganizationsPage() {
  const queryClient = useQueryClient();
  const { isSuperAdmin, isAdmin, roleLabel } = usePermissions();
  const [name, setName] = useState("");
  const [createError, setCreateError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<OrganizationRow | null>(null);
  const [createdUserNotice, setCreatedUserNotice] = useState<{
    orgName: string;
    email: string;
    tempPassword?: string;
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["organizations"],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.listOrganizations(1, 100);
      return result.data as OrganizationRow[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (vendorName: string) => {
      const client = createWebApiClient();
      return client.createOrganization(vendorName);
    },
    onSuccess: async (res) => {
      setName("");
      setCreateError("");
      const createdData = res.data as {
        name: string;
        createdUser?: { email: string; tempPassword?: string };
      };
      if (createdData?.createdUser) {
        setCreatedUserNotice({
          orgName: createdData.name,
          email: createdData.createdUser.email,
          tempPassword: createdData.createdUser.tempPassword,
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
    onError: (err) => {
      setCreateError(err instanceof Error ? err.message : "Failed to create vendor");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (orgId: string) => {
      const client = createWebApiClient();
      return client.deleteOrganization(orgId);
    },
    onSuccess: async () => {
      setDeleteTarget(null);
      setDeleteError("");
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
    onError: (err) => {
      setDeleteError(err instanceof Error ? err.message : "Failed to remove vendor");
    },
  });

  return (
    <div>
      <PageHeader
        title="Vendor organizations"
        description={
          isSuperAdmin
            ? "Manage media owner accounts and vendor access"
            : isAdmin
              ? `Signed in as ${roleLabel}. Only Super Admin can remove vendors.`
              : "Manage media owner accounts and vendor access"
        }
      />

      <section className="card-surface p-5 sm:p-6 mb-6 max-w-xl">
        <h2 className="font-semibold text-slate-900 mb-3">Create vendor</h2>
        <form
          className="flex flex-col sm:flex-row gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            createMutation.mutate(name.trim());
          }}
        >
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Vendor company name"
            className="flex-1 rounded-lg border border-violet-200 px-3 py-2.5 text-sm"
          />
          <button
            type="submit"
            disabled={createMutation.isPending || !name.trim()}
            className="btn-primary px-5 py-2.5 disabled:opacity-50"
          >
            {createMutation.isPending ? "Creating…" : "Create"}
          </button>
        </form>
        {createdUserNotice && (
          <div className="mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Vendor Agency Created & Default Admin Provisioned</span>
            </div>
            <p className="text-xs text-slate-600">
              Agency: <strong className="text-slate-900">{createdUserNotice.orgName}</strong>
            </p>
            <div className="p-3 bg-white border border-emerald-100 rounded-lg text-xs space-y-1 font-mono">
              <p>
                Email: <strong className="text-primary">{createdUserNotice.email}</strong>
              </p>
              <p>
                Default Password:{" "}
                <strong className="text-slate-700">{createdUserNotice.tempPassword}</strong>
              </p>
            </div>
            <p className="text-[11px] text-muted">
              Share credentials or open Manage &amp; Credentials → Get Reset Link so they can set
              their own password on the public /reset-password page.
            </p>
          </div>
        )}

        {createError ? <p className="mt-3 text-sm text-red-700">{createError}</p> : null}
      </section>

      {deleteError ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {deleteError}
        </p>
      ) : null}

      {isLoading && <p className="text-muted text-sm">Loading vendors…</p>}

      <div className="card-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-left">
            <tr>
              <th className="px-4 py-3 font-medium text-slate-600">Vendor Agency</th>
              <th className="px-4 py-3 font-medium text-slate-600">Status</th>
              <th className="px-4 py-3 font-medium text-slate-600">Inventory Sites</th>
              <th className="px-4 py-3 font-medium text-slate-600">Members</th>
              <th className="px-4 py-3 font-medium text-slate-600"></th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((org) => (
              <tr
                key={org.id}
                className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors"
              >
                <td className="px-4 py-3 font-medium text-slate-900">
                  <Link
                    href={`/admin/organizations/${org.id}`}
                    className="hover:text-primary font-bold"
                  >
                    {org.name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                      org.status === "ACTIVE"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-red-50 text-red-700 border border-red-200"
                    }`}
                  >
                    {org.status}
                  </span>
                </td>
                <td className="px-4 py-3 font-semibold text-slate-700">
                  {org.locationCount} sites
                </td>
                <td className="px-4 py-3 text-muted text-xs">{org.memberCount} account(s)</td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-2">
                    {isSuperAdmin ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                        disabled={org.locationCount > 0 || deleteMutation.isPending}
                        title={
                          org.locationCount > 0
                            ? "Reassign or archive sites before removing"
                            : "Remove vendor"
                        }
                        onClick={() => {
                          setDeleteError("");
                          setDeleteTarget(org);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    ) : null}
                    <Link
                      href={`/admin/organizations/${org.id}`}
                      className="text-xs text-primary font-bold hover:underline inline-flex items-center gap-1"
                    >
                      Manage & Credentials →
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && (data ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  No vendor organizations yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Remove vendor"
        description={
          deleteTarget
            ? `Permanently remove "${deleteTarget.name}" and its ${deleteTarget.memberCount} account(s)? This cannot be undone. Vendors with inventory sites must be cleaned up first.`
            : undefined
        }
        confirmLabel="Remove vendor"
        danger
        busy={deleteMutation.isPending}
        onClose={() => {
          if (!deleteMutation.isPending) {
            setDeleteTarget(null);
            setDeleteError("");
          }
        }}
        onConfirm={() => {
          if (deleteTarget) {
            setDeleteError("");
            deleteMutation.mutate(deleteTarget.id);
          }
        }}
      >
        {deleteError ? (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {deleteError}
          </p>
        ) : null}
      </ConfirmModal>
    </div>
  );
}
