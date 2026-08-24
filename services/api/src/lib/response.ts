export function success<T>(data: T, meta: Record<string, unknown> = {}) {
  return { data, meta };
}

export function listMeta(page: number, limit: number, total: number) {
  return { page, limit, total };
}

export function toIso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}
