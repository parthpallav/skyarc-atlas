"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SKYARC_BRAND } from "@skyarc/shared";
import { createWebApiClient, storeTokens, storeUser } from "@/lib/api";
import { SkyArcLogo } from "@/components/skyarc-logo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const client = createWebApiClient();
      const result = await client.login(email, password, "SkyArc Atlas Web");
      storeTokens(result.data.accessToken, result.data.refreshToken);
      storeUser(result.data.user);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen min-h-[100dvh] flex">
      {/* Brand panel — black + official logo */}
      <div className="hidden lg:flex lg:w-1/2 bg-black relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background: `radial-gradient(circle at 20% 30%, ${SKYARC_BRAND.purple} 0%, transparent 45%)`,
          }}
        />
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <SkyArcLogo height={52} subtitle="Find your spotlight." priority />
          <div className="max-w-md">
            <h2 className="text-3xl font-bold leading-tight mb-4 text-white">
              SkyArc Atlas
            </h2>
            <p className="text-skyarc-on-dark-muted text-lg leading-relaxed">
              DOOH location intelligence for Rajkot — survey hoardings, score
              inventory, and plan media from one platform.
            </p>
            <p className="mt-6 text-sm font-semibold tracking-widest uppercase text-primary">
              {SKYARC_BRAND.tagline}
            </p>
          </div>
          <p className="text-xs text-skyarc-on-dark-muted">© SkyArc Ads</p>
        </div>
      </div>

      {/* Form */}
      <div className="flex flex-1 items-center justify-center p-6 sm:p-10 bg-skyarc-surface">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-md bg-white rounded-2xl p-8 space-y-5 border border-violet-100 shadow-card"
        >
          <div className="lg:hidden mb-2 flex justify-center">
            <div className="bg-black rounded-xl px-4 py-3 inline-flex">
              <SkyArcLogo height={40} subtitle="Atlas" />
            </div>
          </div>
          <div className="hidden lg:block">
            <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
            <p className="text-muted text-sm mt-1">Sign in to your workspace</p>
          </div>
          {error && (
            <p className="text-red-600 text-sm p-3 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </p>
          )}
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-600 mb-1 block">Email</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white border border-violet-200 rounded-lg px-4 py-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600 mb-1 block">Password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white border border-violet-200 rounded-lg px-4 py-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary py-3.5 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
