/**
 * Retry Prisma Serializable transaction conflicts (P2034).
 */
export async function withSerializableRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; label?: string } = {}
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: unknown }).code)
          : "";
      const message = err instanceof Error ? err.message : String(err);
      const isConflict =
        code === "P2034" ||
        /could not serialize|serialization failure|40001/i.test(message);
      if (!isConflict || i === attempts - 1) throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
