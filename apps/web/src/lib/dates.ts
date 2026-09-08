/** Indian calendar date helpers — display as dd/mm/yyyy. */

export function formatDateIn(value?: string | Date | null): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${day}/${month}/${year}`;
}

export function parseDateIn(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  const yyyy = String(year);
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function maskDateIn(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function toIsoDate(ymd: string | null | undefined, endOfDay = false): string | undefined {
  if (!ymd) return undefined;
  const date = new Date(`${ymd}T${endOfDay ? "23:59:59" : "00:00:00"}`);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function durationDaysBetween(startYmd?: string | null, endYmd?: string | null): number | undefined {
  if (!startYmd || !endYmd) return undefined;
  const start = new Date(`${startYmd}T00:00:00`);
  const end = new Date(`${endYmd}T00:00:00`);
  const diff = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return diff > 0 ? diff : undefined;
}

export function durationDaysBetweenIso(start?: string | null, end?: string | null): number | undefined {
  if (!start || !end) return undefined;
  const a = new Date(start);
  const b = new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return undefined;
  const startDay = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const endDay = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  const diff = Math.round((endDay.getTime() - startDay.getTime()) / 86_400_000) + 1;
  return diff > 0 ? diff : undefined;
}

export function addDaysYmd(ymd: string, days: number): string {
  const date = new Date(`${ymd}T00:00:00`);
  date.setDate(date.getDate() + days);
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function isoToYmd(value?: string | Date | null): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function todayYmd(): string {
  return isoToYmd(new Date());
}
