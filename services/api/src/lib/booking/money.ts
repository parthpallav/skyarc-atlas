/**
 * Integer minor-unit money helpers (paise for INR).
 * Never persist commercial totals as IEEE floats.
 */

export function toMinorUnits(amount: number, currency = "INR"): number {
  if (!Number.isFinite(amount)) return 0;
  // INR / USD-style 2 decimal currencies
  const scale = currency.toUpperCase() === "JPY" ? 1 : 100;
  return Math.round(amount * scale);
}

export function fromMinorUnits(minor: number, currency = "INR"): number {
  const scale = currency.toUpperCase() === "JPY" ? 1 : 100;
  return minor / scale;
}

export function addMinor(...parts: number[]): number {
  return parts.reduce((sum, n) => sum + (Number.isFinite(n) ? Math.trunc(n) : 0), 0);
}

/** Totals match within 1 minor unit (rounding tolerance). */
export function totalsMatch(a: number, b: number, tolerance = 1): boolean {
  return Math.abs(Math.trunc(a) - Math.trunc(b)) <= tolerance;
}
