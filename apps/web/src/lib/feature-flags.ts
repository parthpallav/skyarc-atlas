/** Demo role buttons on /login. Production stays email/password only unless explicitly enabled. */
export function showDemoLogins(): boolean {
  const flag = process.env.NEXT_PUBLIC_SHOW_DEMO_LOGINS;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env.NODE_ENV !== "production";
}

declare global {
  interface Window {
    __ATLAS_RUNTIME_FLAGS__?: {
      journeyGaps?: boolean;
      adtechBooking?: boolean;
      orbitUi?: boolean;
    };
  }
}

/** Demo role buttons on /login. Production stays email/password only unless explicitly enabled. */
export function showDemoLogins(): boolean {
  const flag = process.env.NEXT_PUBLIC_SHOW_DEMO_LOGINS;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env.NODE_ENV !== "production";
}

/** Orbit device tab on location detail. Hidden unless explicitly enabled. */
export function showOrbitUi(): boolean {
  if (typeof window !== "undefined" && window.__ATLAS_RUNTIME_FLAGS__?.orbitUi !== undefined) {
    return Boolean(window.__ATLAS_RUNTIME_FLAGS__.orbitUi);
  }
  const flag = (process.env.ORBIT_UI ?? process.env.NEXT_PUBLIC_ORBIT_UI)?.trim().toLowerCase();
  return flag === "true" || flag === "1";
}

/**
 * AdTech self-serve booking / quote / reservation UI.
 * Opt-in only (`NEXT_PUBLIC_ADTECH_BOOKING=true` or `ADTECH_BOOKING=true`).
 */
export function showAdtechBooking(): boolean {
  if (typeof window !== "undefined" && window.__ATLAS_RUNTIME_FLAGS__?.adtechBooking !== undefined) {
    return Boolean(window.__ATLAS_RUNTIME_FLAGS__.adtechBooking);
  }
  const flag = (process.env.ADTECH_BOOKING ?? process.env.NEXT_PUBLIC_ADTECH_BOOKING)?.trim().toLowerCase();
  return flag === "true" || flag === "1";
}

/**
 * Journey-gap UX and API companion behaviors (planning lock, admin customers, live proofs,
 * vendor pending on active plans, etc.).
 *
 * Configurable via runtime environment variables (JOURNEY_GAPS / NEXT_PUBLIC_JOURNEY_GAPS)
 * without requiring code changes or rebuilds.
 */
export function showJourneyGaps(): boolean {
  if (typeof window !== "undefined" && window.__ATLAS_RUNTIME_FLAGS__?.journeyGaps !== undefined) {
    return Boolean(window.__ATLAS_RUNTIME_FLAGS__.journeyGaps);
  }
  const flag = (process.env.JOURNEY_GAPS ?? process.env.NEXT_PUBLIC_JOURNEY_GAPS)?.trim().toLowerCase();
  if (flag === "false" || flag === "0") return false;
  if (flag === "true" || flag === "1") return true;
  return true;
}
