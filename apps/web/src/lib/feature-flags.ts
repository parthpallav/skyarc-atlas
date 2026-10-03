/** Demo role buttons on /login. Production stays email/password only unless explicitly enabled. */
export function showDemoLogins(): boolean {
  const flag = process.env.NEXT_PUBLIC_SHOW_DEMO_LOGINS;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env.NODE_ENV !== "production";
}

/** Orbit device tab on location detail. Hidden unless explicitly enabled. */
export function showOrbitUi(): boolean {
  return process.env.NEXT_PUBLIC_ORBIT_UI === "true";
}

/**
 * AdTech self-serve booking / quote / reservation UI.
 * Opt-in only (`NEXT_PUBLIC_ADTECH_BOOKING=true`). When off, production keeps the
 * classic media-planning UX: no Bookings nav, classic dashboard, no customer
 * one-site "Configure campaign" builder, no reservation panel.
 */
export function showAdtechBooking(): boolean {
  return process.env.NEXT_PUBLIC_ADTECH_BOOKING === "true";
}
