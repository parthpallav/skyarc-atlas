import { describe, expect, it } from "vitest";
import { buildSkyarcScreenCode } from "@skyarc/shared";

describe("buildSkyarcScreenCode", () => {
  it("uses site code for first face", () => {
    expect(buildSkyarcScreenCode("SKY-RAJ-001", 1)).toBe("SKY-RAJ-001");
  });
  it("suffixes additional faces", () => {
    expect(buildSkyarcScreenCode("SKY-RAJ-001", 2)).toBe("SKY-RAJ-001-F2");
  });
});
