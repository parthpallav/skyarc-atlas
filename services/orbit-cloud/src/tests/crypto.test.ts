import { describe, expect, it } from "vitest";
import { hashSecret, signBody } from "../crypto.js";

describe("orbit crypto", () => {
  it("hashes deterministically", () => {
    expect(hashSecret("abc")).toEqual(hashSecret("abc"));
  });
  it("signs bodies", () => {
    expect(signBody("secret", "{}")).toHaveLength(64);
  });
});
