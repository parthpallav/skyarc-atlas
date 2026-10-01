"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { getDefaultLandingPath, UserRole } from "@skyarc/shared";
import { SKYARC_BRAND } from "@skyarc/shared";
import { createWebApiClient, storeTokens, storeUser } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { AtlasLogoLoader, AtlasPageLoader } from "@/components/atlas-logo-loader";
import { SkyarcLogo } from "@/components/skyarc-logo";
import { showDemoLogins } from "@/lib/feature-flags";

function parseRole(role: string): (typeof UserRole)[keyof typeof UserRole] {
  const values = Object.values(UserRole) as string[];
  if (values.includes(role)) {
    return role as (typeof UserRole)[keyof typeof UserRole];
  }
  return UserRole.VIEWER;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoVisible, setDemoVisible] = useState(true);
  const demoEnabled = showDemoLogins();

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
      const result = await client.login(email, password, "Skyarc Atlas Web");
      storeTokens(result.data.accessToken, result.data.refreshToken);

      const storedUser = {
        id: result.data.user.id,
        email: result.data.user.email,
        name: result.data.user.name,
        role: parseRole(result.data.user.role),
        organizationId: result.data.user.organizationId ?? null,
      };
      storeUser(storedUser);
      setUser(storedUser);

      const next = searchParams.get("next");
      const landing = getDefaultLandingPath(storedUser.role);
      router.push(next && next.startsWith("/") ? next : landing);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen min-h-[100dvh] flex">
      <div className="hidden lg:flex lg:w-1/2 bg-black relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background: `radial-gradient(circle at 20% 30%, ${SKYARC_BRAND.purple} 0%, transparent 45%)`,
          }}
        />
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <SkyarcLogo height={56} onDark priority />
          <div className="max-w-md">
            <h2 className="text-3xl font-bold leading-tight mb-4 text-white">Skyarc Atlas</h2>
            <p className="text-skyarc-on-dark-muted text-lg leading-relaxed">
              DOOH location intelligence — survey hoardings, score inventory, and plan media
              from one platform.
            </p>
            <p className="mt-6 text-sm font-semibold tracking-widest uppercase text-primary">
              {SKYARC_BRAND.tagline}
            </p>
          </div>
          <p className="text-xs text-skyarc-on-dark-muted">© Skyarc Ads</p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center p-6 sm:p-10 bg-skyarc-surface">
        <form
          onSubmit={handleSubmit}
          className="relative w-full max-w-md bg-white rounded-2xl p-8 space-y-5 border border-violet-100 shadow-card overflow-hidden"
        >
          {loading ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/95">
              <AtlasLogoLoader size="md" label="Signing in" />
            </div>
          ) : null}
          <div className="lg:hidden mb-2 flex justify-center">
            <SkyarcLogo height={48} />
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
            <div className="flex justify-end">
              <Link
                href="/forgot-password"
                className="text-xs font-semibold text-primary hover:underline"
              >
                Forgot password?
              </Link>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary py-3.5 disabled:opacity-50"
          >
            {loading ? "Signing in" : "Sign in"}
          </button>

          {demoEnabled && (
          <div className="pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Demo accounts
              </p>
              <button
                type="button"
                onClick={() => setDemoVisible((v) => !v)}
                className="text-[11px] font-semibold text-primary hover:underline"
              >
                {demoVisible ? "Hide" : "Show"}
              </button>
            </div>
            {demoVisible && (
            <>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 sr-only">
              Quick demo logins:
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  setEmail("admin@skyarcads.com");
                  setPassword("ChangeMe123!");
                }}
                className="p-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-left transition-colors"
              >
                <span className="font-semibold text-slate-800 block truncate">Superadmin</span>
                <span className="text-slate-500 text-[11px] truncate block">admin@skyarcads.com</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setEmail("planner@skyarcads.com");
                  setPassword("ChangeMe123!");
                }}
                className="p-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-left transition-colors"
              >
                <span className="font-semibold text-slate-800 block truncate">Media Planner</span>
                <span className="text-slate-500 text-[11px] truncate block">planner@skyarcads.com</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setEmail("brandalyst@skyarcads.com");
                  setPassword("ChangeMe123!");
                }}
                className="p-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-left transition-colors"
              >
                <span className="font-semibold text-slate-800 block truncate">Vendor (Owner)</span>
                <span className="text-slate-500 text-[11px] truncate block">brandalyst@skyarcads.com</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setEmail("customer@skyarcads.com");
                  setPassword("ChangeMe123!");
                }}
                className="p-2 rounded-lg bg-violet-50 hover:bg-violet-100 border border-violet-200 text-left transition-colors"
              >
                <span className="font-semibold text-primary block truncate">Brand Customer</span>
                <span className="text-slate-500 text-[11px] truncate block">customer@skyarcads.com</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setEmail("operator@skyarcads.com");
                  setPassword("ChangeMe123!");
                }}
                className="p-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-left transition-colors sm:col-span-2"
              >
                <span className="font-semibold text-slate-800 block truncate">Field Operator</span>
                <span className="text-slate-500 text-[11px] truncate block">operator@skyarcads.com</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-2 text-center">
              Password for all demo accounts: <code className="text-slate-600 font-mono">ChangeMe123!</code>
            </p>
            </>
            )}
          </div>
          )}
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<AtlasPageLoader label="Loading sign in" />}>
      <LoginForm />
    </Suspense>
  );
}
