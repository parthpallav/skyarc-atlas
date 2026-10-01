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
