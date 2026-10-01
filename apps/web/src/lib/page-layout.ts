import { cn } from "@/lib/utils";

/**
 * Workspace pages (campaign, plan, map): document scroll on mobile;
 * fixed-height master–detail panes from md breakpoint up.
 */
export const workspacePageRoot = cn(
  "-mx-3.5 -mt-3.5 flex flex-col sm:-mx-6 sm:-mt-6 lg:-mx-8 lg:-mt-8",
  "md:h-[calc(100dvh-2rem)] md:min-h-0 md:max-h-[calc(100dvh-2rem)]"
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
  "shrink-0 border-b border-primary/15 bg-white/90 px-3 py-2 backdrop-blur-md sm:px-4",
  "max-md:sticky max-md:top-0 max-md:z-20"
);

/** Map stage height on phones when the shell main area scrolls. */
export const workspaceMapStage = cn(
  "relative min-h-0 min-w-0 flex-1 overflow-hidden bg-slate-100",
  "max-md:min-h-[min(62dvh,520px)]"
);
