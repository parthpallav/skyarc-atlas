import Image from "next/image";
import { cn } from "@/lib/utils";
import { ATLAS_LOGO_ASPECT, ATLAS_LOGO_SRC, ATLAS_MARK_SRC } from "@/lib/brand";

interface SkyarcLogoProps {
  /** Display height in pixels — width scales automatically */
  height?: number;
  className?: string;
  subtitle?: string;
  priority?: boolean;
  /** Show the triangular mark only (collapsed sidebar / compact header) */
  collapsed?: boolean;
  /** White plate behind the lockup — use on black / dark surfaces */
  onDark?: boolean;
}

export function SkyarcLogo({
  height = 40,
  className,
  subtitle,
  priority,
  collapsed,
  onDark = false,
}: SkyarcLogoProps) {
  const aspect = collapsed ? 1 : ATLAS_LOGO_ASPECT;
  const width = Math.round(height * aspect);

  return (
    <div className={cn("flex flex-col min-w-0", className)}>
      <div
        className={cn(
          "inline-flex items-center justify-center overflow-hidden",
          onDark && "bg-white rounded-lg px-2 py-1.5"
        )}
      >
        <Image
          src={collapsed ? ATLAS_MARK_SRC : ATLAS_LOGO_SRC}
          alt="Atlas by Skyarc"
          width={width}
          height={height}
          priority={priority}
          className="object-contain object-left"
          style={{ height, width: "auto", maxWidth: collapsed ? height : width }}
        />
      </div>
      {subtitle && !collapsed && (
        <p
          className={cn(
            "text-[11px] mt-1.5 truncate font-medium tracking-wide",
            onDark ? "text-skyarc-on-dark-muted" : "text-muted"
          )}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
