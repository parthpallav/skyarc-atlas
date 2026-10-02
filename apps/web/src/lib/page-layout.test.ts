import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");

function readSrc(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("workspace page layout (mobile scroll)", () => {
  it("shared layout module avoids mobile viewport lock", () => {
    const layout = readSrc("lib/page-layout.ts");
    expect(layout).toContain("md:h-[calc(100dvh-2rem)]");
    expect(layout).toContain("workspaceDocPageRoot");
    expect(layout).not.toMatch(/h-\[calc\(100dvh-3\.5rem/);
  });

  it("campaign overview uses document flow; plan keeps master–detail shell", () => {
    const campaign = readSrc("app/(app)/campaigns/[id]/page.tsx");
    const plan = readSrc("app/(app)/campaigns/[id]/plans/[planId]/page.tsx");
    expect(campaign).toContain("workspaceDocPageRoot");
    expect(campaign).not.toContain("workspacePageRoot");
    expect(plan).toContain("workspacePageRoot");
    expect(campaign).not.toMatch(/h-\[calc\(100dvh-3\.5rem/);
    expect(plan).not.toMatch(/h-\[calc\(100dvh-3\.5rem/);
  });

  it("map page is full-bleed with filter sheet on mobile", () => {
    const map = readSrc("app/(app)/map/page.tsx");
    expect(map).toContain("workspaceMapPageRoot");
    expect(map).toContain("Map filters");
    expect(map).not.toMatch(/h-\[calc\(100dvh-3\.5rem/);
  });

  it("mobile detail sheet scrolls site workspace", () => {
    const plan = readSrc("app/(app)/campaigns/[id]/plans/[planId]/page.tsx");
    expect(plan).toMatch(/overflow-y-auto overscroll-contain/);
  });
});
