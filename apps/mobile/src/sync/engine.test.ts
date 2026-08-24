import { describe, expect, it } from "vitest";

const BACKOFF_MS = [5_000, 15_000, 30_000, 60_000, 120_000];

function backoff(attempts: number): number {
  return BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)] ?? 120_000;
}

describe("sync backoff", () => {
  it("increases delay with attempts", () => {
    expect(backoff(0)).toBe(5_000);
    expect(backoff(1)).toBe(15_000);
    expect(backoff(10)).toBe(120_000);
  });
});
