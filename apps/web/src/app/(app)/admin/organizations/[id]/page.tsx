"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Copy,
  KeyRound,
  Mail,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from "lucide-react";
import { createWebApiClient } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

interface OrgMember {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

interface OrgDetail {
  id: string;
  name: string;
  type: string;
  status: string;
  members?: OrgMember[];
  locationCount?: number;
}

export default function AdminOrganizationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const queryClient = useQueryClient();

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState("");
  const [copiedTokenUserId, setCopiedTokenUserId] = useState<string | null>(null);
  const [resetLinkInfo, setResetLinkInfo] = useState<{ userId: string; link: string } | null>(null);
  const [availabilityMessage, setAvailabilityMessage] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [actionError, setActionError] = useState("");

  const { data: org, isLoading } = useQuery({
    queryKey: ["organization", id],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.getOrganization(id);
      return result.data as OrgDetail;
    },
  });

  // Status mutation (Activate / Suspend)
  const statusMutation = useMutation({
    mutationFn: async (nextStatus: string) => {
      const client = createWebApiClient();
      return client.updateOrganizationStatus(id, nextStatus);
    },
    onSuccess: async (_, nextStatus) => {
      setActionSuccess(`Vendor agency status updated to ${nextStatus}.`);
      setActionError("");
      await queryClient.invalidateQueries({ queryKey: ["organization", id] });
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to update vendor status");
    },
  });

  // User Email update mutation
  const userEmailMutation = useMutation({
    mutationFn: async ({ userId, newEmail }: { userId: string; newEmail: string }) => {
      const client = createWebApiClient();
      return client.updateUser(userId, { email: newEmail });
    },
    onSuccess: async () => {
      setEditingUserId(null);
      setActionSuccess("Vendor admin email updated successfully.");
      setActionError("");
      await queryClient.invalidateQueries({ queryKey: ["organization", id] });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to update email");
    },
  });

  // Reset password link generator
  const resetLinkMutation = useMutation({
    mutationFn: async (userId: string) => {
      const client = createWebApiClient();
      return client.getUserResetLink(userId);
    },
    onSuccess: (res, userId) => {
      setResetLinkInfo({ userId, link: res.data.resetLink });
      setActionSuccess("Reset password & activation link created.");
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to generate reset link");
    },
  });

  // Request latest inventory availability
  const availabilityMutation = useMutation({
    mutationFn: async (notes?: string) => {
      const client = createWebApiClient();
      return client.requestVendorAvailability(id, { notes });
    },
    onSuccess: (res) => {
      setAvailabilityMessage("");
      setActionSuccess(res.data.message || "Availability update request sent to vendor.");
      setActionError("");
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to send request");
    },
  });

  function copyToClipboard(text: string, userId: string) {
    navigator.clipboard.writeText(text);
    setCopiedTokenUserId(userId);
    setTimeout(() => setCopiedTokenUserId(null), 3000);
  }

  const isSuspended = org?.status === "SUSPENDED" || org?.status === "INACTIVE";

  return (
    <div className="max-w-3xl mx-auto w-full pb-16">
      <Link
        href="/admin/organizations"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-slate-900 mb-4 font-medium"
      >
        <ArrowLeft className="w-4 h-4" />
        Vendors
      </Link>

      {isLoading && (
        <div className="space-y-6">
          <PageHeaderSkeleton />
          <div className="card-surface p-6 space-y-4">
            <Skeleton className="h-6 w-48 rounded" />
            <Skeleton className="h-4 w-72 rounded" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
          <div className="card-surface p-6 space-y-4">
            <Skeleton className="h-6 w-56 rounded" />
            <Skeleton className="h-4 w-80 rounded" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        </div>
      )}

      {org && (
        <div className="space-y-6">
          <PageHeader
            title={org.name}
            description={`Media Owner / Vendor · ${org.status}`}
            action={
              <button
                type="button"
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate(isSuspended ? "ACTIVE" : "SUSPENDED")}
                className={`text-xs font-semibold px-4 py-2 rounded-lg border transition-colors flex items-center gap-1.5 ${
                  isSuspended
                    ? "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100"
                    : "bg-red-50 text-red-700 border-red-300 hover:bg-red-100"
                }`}
              >
                {isSuspended ? (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    Activate Vendor
                  </>
                ) : (
                  <>
                    <ShieldAlert className="w-4 h-4" />
                    Suspend Vendor
                  </>
                )}
              </button>
            }
          />

          {actionSuccess && (
            <p className="text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{actionSuccess}</span>
            </p>
          )}

          {actionError && (
            <p className="text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded-xl p-3.5">
              {actionError}
            </p>
          )}

          {/* Section 1: Vendor Portal Accounts & Password Reset Links */}
          <section className="card-surface p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-primary" />
                  Vendor Admin Access & Credentials
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  Set their contact email, share activation/reset links, and verify access for this agency.
                </p>
              </div>
            </div>

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-slate-50/40">
              {(org.members ?? []).length === 0 ? (
                <div className="p-6 text-xs text-muted text-center">
                  No dedicated user account yet. (Accounts are auto-provisioned during Excel import or setup).
                </div>
              ) : (
                org.members?.map((member) => {
                  const isEditing = editingUserId === member.id;
                  const isResetReady = resetLinkInfo?.userId === member.id;
                  const isCopied = copiedTokenUserId === member.id;

                  return (
                    <div key={member.id} className="p-4 bg-white space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-900 text-sm">{member.name}</p>
                          {!isEditing ? (
                            <p className="text-xs text-slate-600 font-mono flex items-center gap-1.5 mt-0.5">
                              <Mail className="w-3.5 h-3.5 text-muted" />
                              {member.email}
                            </p>
                          ) : (
                            <div className="flex items-center gap-2 mt-2">
                              <input
                                type="email"
                                value={editingEmail}
                                onChange={(e) => setEditingEmail(e.target.value)}
                                className="text-xs px-2.5 py-1.5 border border-violet-200 rounded-md font-mono"
                                placeholder="vendor@agency.com"
                              />
                              <button
                                type="button"
                                disabled={userEmailMutation.isPending || !editingEmail.trim()}
                                onClick={() =>
                                  userEmailMutation.mutate({
                                    userId: member.id,
                                    newEmail: editingEmail.trim(),
                                  })
                                }
                                className="btn-primary text-xs py-1 px-3"
                              >
                                Save Email
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingUserId(null)}
                                className="btn-secondary text-xs py-1 px-2.5"
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {!isEditing && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingUserId(member.id);
                                setEditingEmail(member.email);
                              }}
                              className="text-xs text-slate-600 hover:text-primary font-medium px-2.5 py-1 rounded-md border border-slate-200 hover:bg-slate-50"
                            >
                              Change Email
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={resetLinkMutation.isPending}
                            onClick={() => resetLinkMutation.mutate(member.id)}
                            className="btn-secondary text-xs gap-1.5 py-1 px-3 text-primary border-violet-200"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            {isResetReady ? "Re-generate Link" : "Get Reset Link"}
                          </button>
                        </div>
                      </div>

                      {/* Display Generated Reset Link for Admin to Share */}
                      {isResetReady && resetLinkInfo && (
                        <div className="p-3 bg-violet-50/70 border border-violet-200 rounded-xl text-xs space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-primary">
                              Activation / Reset Link (Valid for 7 Days):
                            </span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(resetLinkInfo.link, member.id)}
                              className="inline-flex items-center gap-1 font-bold text-primary hover:underline text-[11px]"
                            >
                              {isCopied ? (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                  Copied!
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  Copy Link
                                </>
                              )}
                            </button>
                          </div>
                          <input
                            type="text"
                            readOnly
                            value={resetLinkInfo.link}
                            className="w-full text-[11px] p-2 bg-white rounded border border-violet-200 font-mono text-slate-700 select-all"
                            onClick={(e) => (e.target as HTMLInputElement).select()}
                          />
                          <p className="text-[11px] text-muted">
                            Copy and share this direct setup link with the vendor over email or WhatsApp to let them activate their account and manage their inventory.
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Section 2: Request Inventory Availability Update */}
          <section className="card-surface p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Send className="w-5 h-5 text-emerald-600" />
              Request Latest Inventory Availability
            </h2>
            <p className="text-xs text-muted">
              Trigger a real-time availability check when media plan sites are on hold, booked, or expired. This requests the media owner to verify open dates and rate cards.
            </p>

            <div className="space-y-3 pt-1">
              <label className="block text-xs font-semibold text-slate-700">
                Campaign / Plan Context or Specific Site Notes
              </label>
              <textarea
                rows={2}
                value={availabilityMessage}
                onChange={(e) => setAvailabilityMessage(e.target.value)}
                placeholder="e.g. Please verify availability for Kalawad Road Unipoles for Q4 FMCG Campaign starting Oct 1st."
                className="w-full rounded-lg border border-violet-200 p-3 text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                type="button"
                disabled={availabilityMutation.isPending}
                onClick={() => availabilityMutation.mutate(availabilityMessage.trim() || undefined)}
                className="btn-primary text-xs gap-2 py-2.5 px-4"
              >
                <Send className="w-4 h-4" />
                {availabilityMutation.isPending ? "Sending Request…" : "Send Availability Request"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
