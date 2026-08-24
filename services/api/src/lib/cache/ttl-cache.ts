interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/** Simple in-process TTL cache for low-traffic / solo deployments. */
export class TtlCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();

  constructor(private readonly ttlMs: number) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  deleteWhere(predicate: (key: string) => boolean): void {
    for (const key of [...this.store.keys()]) {
      if (predicate(key)) this.store.delete(key);
    }
  }

  clear(): void {
    this.store.clear();
  }
}
