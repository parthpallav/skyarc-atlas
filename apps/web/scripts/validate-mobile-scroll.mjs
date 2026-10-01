/**
 * Validates mobile scroll layout rules for workspace pages.
 * Run: node apps/web/scripts/validate-mobile-scroll.mjs
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(webRoot, "src");

const checks = [
  {
    file: "app/(app)/campaigns/[id]/page.tsx",
    mustInclude: ["workspacePageRoot"],
    mustExclude: ["h-[calc(100dvh-3.5rem"],
  },
  {
    file: "app/(app)/campaigns/[id]/plans/[planId]/page.tsx",
    mustInclude: ["workspacePageRoot", "overflow-y-auto overscroll-contain"],
    mustExclude: ["h-[calc(100dvh-3.5rem"],
  },
  {
    file: "lib/page-layout.ts",
    mustInclude: ["md:h-[calc(100dvh-2rem)]"],
    mustExclude: ["h-[calc(100dvh-3.5rem"],
  },
];

let failed = 0;
for (const { file, mustInclude, mustExclude } of checks) {
  const text = readFileSync(join(src, file), "utf8");
  for (const needle of mustInclude) {
    if (!text.includes(needle)) {
      console.error(`FAIL ${file}: missing "${needle}"`);
      failed++;
    }
  }
  for (const needle of mustExclude) {
    if (text.includes(needle)) {
      console.error(`FAIL ${file}: still contains "${needle}"`);
      failed++;
    }
  }
}

if (failed) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("OK: mobile workspace scroll layout rules satisfied.");
