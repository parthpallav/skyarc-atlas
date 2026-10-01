"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createWebApiClient } from "@/lib/api";
import { SkyarcLogo } from "@/components/skyarc-logo";
import { AtlasPageLoader } from "@/components/atlas-logo-loader";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      setError("This reset link is missing a token. Ask your Skyarc admin for a new link.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const client = createWebApiClient();
      await client.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-violet-50 to-white px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <SkyarcLogo className="mx-auto h-10 w-auto" />
          <h1 className="mt-4 text-xl font-bold text-slate-900">Set a new password</h1>
          <p className="mt-1 text-sm text-muted">
            Vendors and team members can reset access here without signing into Atlas first.
          </p>
        </div>

        <div className="rounded-2xl border border-violet-100 bg-white p-5 shadow-sm sm:p-6">
          {!token ? (
            <p className="text-sm text-red-700">
              Invalid link. Open the full reset URL from your admin, or{" "}
              <Link href="/forgot-password" className="font-semibold text-primary hover:underline">
                request help
              </Link>
              .
            </p>
          ) : done ? (
            <div className="space-y-4 text-sm">
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
                Password updated. You can sign in with your new password.
              </p>
              <button
                type="button"
                className="btn-primary w-full py-2.5"
                onClick={() => router.push("/login")}
              >
                Go to sign in
              </button>
            </div>
          ) : (
            <form className="space-y-3" onSubmit={(e) => void handleSubmit(e)}>
              <label className="block text-sm">
                <span className="font-medium text-muted">New password</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-violet-200 px-3 py-2.5 text-sm"
                  minLength={8}
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-muted">Confirm password</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-violet-200 px-3 py-2.5 text-sm"
                  minLength={8}
                  required
                />
              </label>
              {error ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-2.5 disabled:opacity-50"
              >
                {loading ? "Saving…" : "Save new password"}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-muted">
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AtlasPageLoader />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
