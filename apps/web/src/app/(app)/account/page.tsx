"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createWebApiClient } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { PwaInstallButton } from "@/components/pwa-install-button";
import { Smartphone, CheckCircle2 } from "lucide-react";

export default function AccountPage() {
  const { user: authUser, setUser } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const { data: user, isLoading } = useQuery({
    queryKey: ["user-me"],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.getUserMe();
      setName(result.data.name);
      setEmail(result.data.email);
      return result.data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      const payload: {
        name?: string;
        email?: string;
        currentPassword?: string;
        newPassword?: string;
      } = {};
      if (name.trim() && name.trim() !== user?.name) payload.name = name.trim();
      if (email.trim() && email.trim().toLowerCase() !== user?.email.toLowerCase()) {
        payload.email = email.trim().toLowerCase();
      }
      if (newPassword) {
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
      }
      return client.updateUserMe(payload);
    },
    onSuccess: async (result) => {
      setError("");
      setMessage("Profile updated.");
      setCurrentPassword("");
      setNewPassword("");
      const updated = result.data as {
        id: string;
        email: string;
        name: string;
        role: string;
        organizationId: string | null;
      };
      if (authUser) {
        setUser({
          id: updated.id,
          email: updated.email,
          name: updated.name,
          role: authUser.role,
          organizationId: updated.organizationId,
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["user-me"] });
    },
    onError: (err) => {
      setMessage("");
      setError(err instanceof Error ? err.message : "Update failed");
    },
  });

  return (
    <div className="max-w-xl mx-auto w-full">
      <PageHeader title="Account" description="Update your profile and password" />

      {isLoading && <p className="text-muted text-sm">Loading…</p>}

      {user && (
        <form
          className="card-surface p-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setMessage("");
            saveMutation.mutate();
          }}
        >
          <label className="block text-sm">
            <span className="text-muted font-medium">Email address</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-violet-200 px-3 py-2.5 text-slate-900"
            />
            <span className="text-[11px] text-muted block mt-1">
              You can update your login email at any time.
            </span>
          </label>

          <label className="block text-sm">
            <span className="text-muted font-medium">Display name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-violet-200 px-3 py-2.5"
            />
          </label>

          <div className="border-t border-slate-100 pt-4 space-y-3">
            <p className="text-sm font-semibold text-slate-900">Change password</p>
            <label className="block text-sm">
              <span className="text-muted font-medium">Current password</span>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-violet-200 px-3 py-2.5"
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted font-medium">New password</span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-violet-200 px-3 py-2.5"
              />
            </label>
          </div>

          {message && (
            <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              {message}
            </p>
          )}
          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="btn-primary px-5 py-2.5 disabled:opacity-50"
          >
            {saveMutation.isPending ? "Saving…" : "Save changes"}
          </button>
        </form>
      )}

      {/* Mobile App & APK Setup Card */}
      <div className="card-surface p-6 space-y-3 mt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-900 font-semibold text-base">
            <Smartphone className="w-5 h-5 text-primary" />
            <span>Mobile App Setup (APK Mode)</span>
          </div>
          <PwaInstallButton />
        </div>
        <p className="text-xs text-muted leading-relaxed">
          Skyarc Atlas is optimized to run as a native mobile app without installing an APK from the app store. Add it to your phone’s home screen to launch in edge-to-edge standalone mode with offline shell caching.
        </p>
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs text-slate-700 space-y-1.5 font-medium">
          <p className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span><strong>Android:</strong> Tap &ldquo;Install App&rdquo; or Chrome menu &rarr; &ldquo;Add to Home Screen / Install app&rdquo;.</span>
          </p>
          <p className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span><strong>iOS (Safari):</strong> Tap the Share button &rarr; &ldquo;Add to Home Screen&rdquo;.</span>
          </p>
        </div>
      </div>
    </div>
  );
}
