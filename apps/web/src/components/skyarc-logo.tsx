import Image from "next/image";
import { cn } from "@/lib/utils";
import { SKYARC_LOGO_WHITE_URL } from "@/lib/brand";

interface SkyArcLogoProps {
  /** Display height in pixels — width scales automatically */
  height?: number;
  className?: string;
  subtitle?: string;
  priority?: boolean;
  /** Hide subtitle when sidebar is collapsed */
  collapsed?: boolean;
}

export function SkyArcLogo({
  height = 40,
  className,
  subtitle,
  priority,
  collapsed,
}: SkyArcLogoProps) {
  const width = Math.round(height * 3.8);

  return (
    <div className={cn("flex flex-col min-w-0", className)}>
      <Image
        src={SKYARC_LOGO_WHITE_URL}
        alt="SkyArc"
        width={width}
        height={height}
        priority={priority}
        unoptimized
        className="object-contain object-left"
        style={{ height, width: "auto", maxWidth: collapsed ? height * 1.2 : width }}
      />
      {subtitle && !collapsed && (
        <p className="text-[11px] mt-1.5 truncate font-medium tracking-wide text-skyarc-on-dark-muted">
          {subtitle}
        </p>
      )}
    </div>
  );
}
