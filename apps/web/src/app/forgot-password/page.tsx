"use client";

import Link from "next/link";
import { useState } from "react";
import { createWebApiClient } from "@/lib/api";
import { SkyarcLogo } from "@/components/skyarc-logo";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setError("Enter the email on your vendor account.");
      return;
    }
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const client = createWebApiClient();
      const res = await client.forgotPassword(email.trim().toLowerCase());
      setMessage(
        res.data.message ||
          "If that email has an Atlas account, your Skyarc admin can share a reset link."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-violet-50 to-white px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <SkyarcLogo className="mx-auto h-10 w-auto" />
          <h1 className="mt-4 text-xl font-bold text-slate-900">Forgot password</h1>
          <p className="mt-1 text-sm text-muted">
            Vendors can reset via a link from Skyarc admin. Enter your email so we can prepare a
            token if the account exists.
          </p>
        </div>

        <div className="rounded-2xl border border-violet-100 bg-white p-5 shadow-sm sm:p-6">
          <form className="space-y-3" onSubmit={(e) => void handleSubmit(e)}>
            <label className="block text-sm">
              <span className="font-medium text-muted">Account email</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-violet-200 px-3 py-2.5 text-sm"
                required
              />
            </label>
            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </p>
            ) : null}
            {message ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                {message} Ask your Skyarc contact to open Vendors → Manage &amp; Credentials →{" "}
                <strong>Get Reset Link</strong> and share it — that link opens this site&apos;s{" "}
                <code className="rounded bg-white px-1">/reset-password</code> page.
              </p>
            ) : null}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-2.5 disabled:opacity-50"
            >
              {loading ? "Submitting…" : "Continue"}
            </button>
          </form>
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
