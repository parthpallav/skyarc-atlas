import { cn } from "@/lib/utils";

/**
 * Workspace pages (plan, map): document scroll on mobile;
 * fixed-height master–detail panes from md breakpoint up.
 */
export const workspacePageRoot = cn(
  "-mx-3.5 -mt-3.5 flex flex-col sm:-mx-6 sm:-mt-6 lg:-mx-8 lg:-mt-8",
  "md:h-[calc(100dvh-2rem)] md:min-h-0 md:max-h-[calc(100dvh-2rem)]"
);

/**
 * Campaign overview and similar pages: normal document flow (page scrolls).
 * Do not use the fixed-height master–detail shell — it stretches empty panels.
 */
export const workspaceDocPageRoot = cn(
  "-mx-3.5 -mt-3.5 sm:-mx-6 sm:-mt-6 lg:-mx-8 lg:-mt-8",
  "pb-8"
);

export function workspaceBodyGrid(gridColsClass: string) {
  return cn(
    "grid gap-3 p-3",
    gridColsClass,
    "md:min-h-0 md:flex-1 md:overflow-hidden md:p-4"
  );
}

export const workspacePanel = cn(
  "flex flex-col rounded-xl border border-primary/15 bg-white/95",
  "md:min-h-0 md:flex-1 md:overflow-hidden"
);

export const workspacePanelScroll = cn("md:min-h-0 md:flex-1 md:overflow-y-auto");

export const workspaceAsidePanel = cn(
  "hidden flex-col overflow-hidden rounded-xl border border-primary/15 bg-primary/5 md:flex",
  "md:min-h-0"
);

/** Sticky title bar inside scrolling workspace pages (mobile). */
export const workspaceStickyHeader = cn(
  "shrink-0 border-b border-primary/15 bg-white/95 px-3 py-3 backdrop-blur-md sm:px-4 sm:py-3.5",
  "max-md:sticky max-md:top-0 max-md:z-20"
);

/** Full-bleed map page: fills shell main on mobile; fixed workspace height on md+. */
export const workspaceMapPageRoot = cn(
  "flex min-h-0 flex-1 flex-col overflow-hidden",
  "max-md:h-full max-md:max-h-full",
  "md:-mx-6 md:-mt-6 md:h-[calc(100dvh-2rem)] md:max-h-[calc(100dvh-2rem)] lg:-mx-8 lg:-mt-8"
);

/** Map canvas fills remaining space under optional desktop toolbar. */
export const workspaceMapStage = cn(
  "relative min-h-0 min-w-0 flex-1 overflow-hidden bg-slate-100"
);
