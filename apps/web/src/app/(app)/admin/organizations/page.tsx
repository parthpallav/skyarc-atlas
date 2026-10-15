"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createWebApiClient } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { ConfirmModal } from "@/components/confirm-modal";
import { usePermissions } from "@/hooks/use-permissions";
import { CheckCircle2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { showJourneyGaps } from "@/lib/feature-flags";

type OrgKind = "VENDOR" | "CLIENT";

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
  const [tab, setTab] = useState<OrgKind>("VENDOR");
  const [name, setName] = useState("");
  const [createError, setCreateError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<OrganizationRow | null>(null);
  const [createdUserNotice, setCreatedUserNotice] = useState<{
    orgName: string;
    email: string;
    tempPassword?: string;
    kind: OrgKind;
  } | null>(null);

  const journeyGaps = showJourneyGaps();
  const isCustomerTab = journeyGaps && tab === "CLIENT";

  const { data, isLoading, isError, error: listError } = useQuery({
    queryKey: ["organizations", tab],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.listOrganizations(1, 100, tab);
      return result.data as OrganizationRow[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: { name: string; type: OrgKind }) => {
      const client = createWebApiClient();
      return client.createOrganization(payload.name, payload.type);
    },
    onSuccess: async (res) => {
      setName("");
      setCreateError("");
      const createdData = res.data as {
        name: string;
        type?: string;
        createdUser?: { email: string; tempPassword?: string };
      };
      if (createdData?.createdUser) {
        setCreatedUserNotice({
          orgName: createdData.name,
          email: createdData.createdUser.email,
          tempPassword: createdData.createdUser.tempPassword,
          kind: tab,
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
    onError: (err) => {
      setCreateError(
        err instanceof Error
          ? err.message
          : isCustomerTab
            ? "Failed to create customer"
            : "Failed to create vendor"
      );
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
      setDeleteError(
        err instanceof Error
          ? err.message
          : isCustomerTab
            ? "Failed to remove customer"
            : "Failed to remove vendor"
      );
    },
  });

  return (
    <div>
      <PageHeader
        title="Organizations"
        description={
          isSuperAdmin
            ? "Onboard media owners (vendors) and brand customers with login access"
            : isAdmin
              ? `Signed in as ${roleLabel}. Only Super Admin can remove organizations.`
              : "Onboard media owners and brand customers"
        }
      />

      {journeyGaps ? (
        <div className="mb-5 inline-flex rounded-lg border border-primary/20 bg-white p-0.5">
          {(
            [
              { id: "VENDOR" as const, label: "Vendors" },
              { id: "CLIENT" as const, label: "Customers" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id);
                setName("");
                setCreateError("");
                setCreatedUserNotice(null);
                setDeleteError("");
              }}
              className={cn(
                "rounded-md px-4 py-2 text-xs font-semibold transition-colors",
                tab === item.id
                  ? "bg-primary text-white"
                  : "text-slate-600 hover:bg-violet-50"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      <section className="card-surface p-5 sm:p-6 mb-6 max-w-xl">
        <h2 className="font-semibold text-slate-900 mb-1">
          {isCustomerTab ? "Create customer" : "Create vendor"}
        </h2>
        <p className="mb-3 text-xs text-muted">
          {isCustomerTab
            ? "Creates a brand customer organization and a CLIENT_VIEWER login they can use to review campaigns and plans."
            : "Creates a media-owner organization and a vendor admin login for inventory and requests."}
        </p>
        <form
          className="flex flex-col sm:flex-row gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            createMutation.mutate({ name: name.trim(), type: journeyGaps ? tab : "VENDOR" });
          }}
        >
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isCustomerTab ? "Customer / brand name" : "Vendor company name"}
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
        {createdUserNotice && createdUserNotice.kind === tab ? (
          <div className="mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>
                {createdUserNotice.kind === "CLIENT"
                  ? "Customer created & login provisioned"
                  : "Vendor created & default admin provisioned"}
              </span>
            </div>
            <p className="text-xs text-slate-600">
              Organization:{" "}
              <strong className="text-slate-900">{createdUserNotice.orgName}</strong>
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
        ) : null}

        {createError ? <p className="mt-3 text-sm text-red-700">{createError}</p> : null}
      </section>

      {deleteError ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {deleteError}
        </p>
      ) : null}

      {isError ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {listError instanceof Error ? listError.message : "Could not load organizations."}
        </p>
      ) : null}

      {isLoading && (
        <p className="text-muted text-sm">
          Loading {isCustomerTab ? "customers" : "vendors"}…
        </p>
      )}

      <div className="card-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-left">
            <tr>
              <th className="px-4 py-3 font-medium text-slate-600">
                {isCustomerTab ? "Customer" : "Vendor Agency"}
              </th>
              <th className="px-4 py-3 font-medium text-slate-600">Status</th>
              {!isCustomerTab ? (
                <th className="px-4 py-3 font-medium text-slate-600">Inventory Sites</th>
              ) : null}
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
                {!isCustomerTab ? (
                  <td className="px-4 py-3 font-semibold text-slate-700">
                    {org.locationCount} sites
                  </td>
                ) : null}
                <td className="px-4 py-3 text-muted text-xs">{org.memberCount} account(s)</td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-2">
                    {isSuperAdmin ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                        disabled={
                          (!isCustomerTab && org.locationCount > 0) || deleteMutation.isPending
                        }
                        title={
                          !isCustomerTab && org.locationCount > 0
                            ? "Reassign or archive sites before removing"
                            : isCustomerTab
                              ? "Remove customer"
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
                <td colSpan={isCustomerTab ? 4 : 5} className="px-4 py-8 text-center text-muted">
                  {isCustomerTab
                    ? "No customer organizations yet."
                    : "No vendor organizations yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title={isCustomerTab ? "Remove customer" : "Remove vendor"}
        description={
          deleteTarget
            ? `Permanently remove "${deleteTarget.name}" and its ${deleteTarget.memberCount} account(s)? This cannot be undone.`
            : undefined
        }
        confirmLabel={isCustomerTab ? "Remove customer" : "Remove vendor"}
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
