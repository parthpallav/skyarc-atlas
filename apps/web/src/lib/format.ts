export function formatInr(amount: number) {
  return `₹${amount.toLocaleString("en-IN")}`;
}

/** Compact INR for KPI tiles — ₹12.4 L, ₹1.05 Cr. */
export function formatInrCompact(amount: number) {
  if (!Number.isFinite(amount) || amount === 0) return "₹0";
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  if (abs >= 1_00_00_000) {
    const cr = abs / 1_00_00_000;
    return `${sign}₹${cr >= 10 ? cr.toFixed(1) : cr.toFixed(2)} Cr`;
  }
  if (abs >= 1_00_000) {
    const lakh = abs / 1_00_000;
    return `${sign}₹${lakh >= 10 ? lakh.toFixed(1) : lakh.toFixed(2)} L`;
  }
  return `${sign}${formatInr(abs)}`;
}

export function parseInrInput(raw: string): number {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return 0;
  return Number(digits);
}

export function formatInrInput(amount: number): string {
  if (!amount) return "";
  return formatInr(amount);
}
