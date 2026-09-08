import Image from "next/image";
import { ATLAS_LOGO_ASPECT, ATLAS_LOGO_SRC } from "@/lib/brand";
import { cn } from "@/lib/utils";

type AtlasLoaderSize = "sm" | "md" | "lg";

const SIZE = {
  sm: { mark: 28, word: 28, bar: "w-16 mt-2.5", gap: "gap-2" },
  md: { mark: 52, word: 44, bar: "w-28 mt-4", gap: "gap-3.5" },
  lg: { mark: 72, word: 58, bar: "w-36 mt-5", gap: "gap-4" },
} as const;

export function AtlasLogoLoader({
  size = "md",
  label = "Loading workspace",
  showWordmark = true,
  showBar = true,
  className,
}: {
  size?: AtlasLoaderSize;
  label?: string;
  showWordmark?: boolean;
  showBar?: boolean;
  className?: string;
}) {
  const spec = SIZE[size];
  const staticWidth = Math.round(spec.word * ATLAS_LOGO_ASPECT);

  return (
    <div
      className={cn("atlas-loader inline-flex flex-col items-center", className)}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="atlas-loader-animated flex flex-col items-center">
        <div className={cn("flex items-center", spec.gap)}>
          <AtlasMark size={spec.mark} />
          {showWordmark ? <AtlasWordmark height={spec.word} /> : null}
        </div>
        {showBar ? (
          <span
            className={cn(
              "atlas-loader-bar h-0.5 overflow-hidden rounded-full bg-violet-100",
              spec.bar
            )}
          >
            <span className="atlas-loader-bar-fill block h-full w-1/2 rounded-full bg-primary" />
          </span>
        ) : null}
      </div>

      <Image
        src={ATLAS_LOGO_SRC}
        alt=""
        width={staticWidth}
        height={spec.word}
        className="atlas-loader-static hidden object-contain"
        style={{ height: spec.word, width: "auto" }}
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function AtlasPageLoader({
  label = "Loading workspace",
}: {
  label?: string;
}) {
  return (
    <div className="flex min-h-screen min-h-[100dvh] items-center justify-center bg-skyarc-surface">
      <AtlasLogoLoader size="lg" label={label} />
    </div>
  );
}

function AtlasWordmark({ height }: { height: number }) {
  return (
    <svg
      viewBox="0 0 268 62"
      height={height}
      className="atlas-loader-word shrink-0 overflow-visible"
      aria-hidden
    >
      <g className="atlas-loader-letter" style={{ animationDelay: "720ms" }}>
        <polygon fill="#A855F7" points="22,3 41,52 33.4,52 22,20 10.6,52 3,52" />
      </g>
      <g className="atlas-loader-letter" style={{ animationDelay: "775ms" }}>
        <polygon fill="#A855F7" points="52,3 90,3 90,11 75,11 75,52 67,52 67,11 52,11" />
      </g>
      <g className="atlas-loader-letter" style={{ animationDelay: "830ms" }}>
        <polygon fill="#A855F7" points="100,3 108,3 108,44 132,44 132,52 100,52" />
      </g>
      <g className="atlas-loader-letter" style={{ animationDelay: "885ms" }}>
        <polygon fill="#A855F7" points="157,3 176,52 168.4,52 157,20 145.6,52 138,52" />
      </g>
      <g className="atlas-loader-letter" style={{ animationDelay: "940ms" }}>
        <path
          fill="#A855F7"
          d="M204 10.5c0-6.2 6.8-9.5 15.6-9.5 9.4 0 15.4 3.8 15.4 10.6h-7.6c0-2.6-2.6-4.4-7.6-4.4-4.6 0-7.2 1.6-7.2 4.2 0 2.6 2.2 3.8 8.6 5.6 9.4 2.6 14.8 6.6 14.8 13.8 0 8-6.8 12.6-16.8 12.6-10.6 0-16.8-4.6-16.8-12.2h7.6c0 3.4 3.2 5.6 9 5.6 5.4 0 8.8-2 8.8-5.4 0-2.8-2-4.2-8.8-6.2-10-2.8-14.8-7-14.8-14.7z"
        />
      </g>
      <g className="atlas-loader-by">
        <text
          x="108"
          y="61"
          fill="#334155"
          fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
          fontSize="9"
          fontWeight="700"
          letterSpacing="2.4"
        >
          BY
        </text>
        <path
          className="atlas-loader-bolt"
          fill="#A855F7"
          d="M140.2 53.2 135.4 58.6h2.6l-1.6 5.4 5.6-6.4h-2.6l.8-4.4z"
        />
        <text
          x="148"
          y="61"
          fill="#1e293b"
          fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
          fontSize="9"
          fontWeight="800"
          letterSpacing="2.8"
        >
          SKYARC
        </text>
        <text
          x="214"
          y="55.5"
          fill="#64748b"
          fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
          fontSize="5.5"
          fontWeight="600"
        >
          TM
        </text>
      </g>
    </svg>
  );
}

function AtlasMark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={Math.round(size * 1.16)}
      viewBox="0 0 80 92"
      className="atlas-loader-mark shrink-0 overflow-visible"
      aria-hidden
    >
      <polygon
        className="atlas-loader-peak"
        fill="#A855F7"
        points="40,2 76,51 54,51 40,36 26,51 4,51"
      />
      <polygon
        className="atlas-loader-fold atlas-loader-fold-1"
        fill="#A855F7"
        points="4,55 26,55 16,90 2,76"
      />
      <polygon
        className="atlas-loader-fold atlas-loader-fold-2"
        fill="#9333EA"
        points="26,55 40,38 32,90 16,90"
      />
      <polygon
        className="atlas-loader-fold atlas-loader-fold-3"
        fill="#C084FC"
        points="40,38 54,55 64,90 32,90"
      />
      <polygon
        className="atlas-loader-fold atlas-loader-fold-4"
        fill="#A855F7"
        points="54,55 76,55 78,76 64,90"
      />
      <g className="atlas-loader-pin">
        <path
          fill="#3B0764"
          d="M40 21.5c-6.6 0-11.9 5.2-11.9 11.6 0 8.6 11.9 20.6 11.9 20.6s11.9-12 11.9-20.6c0-6.4-5.3-11.6-11.9-11.6z"
        />
        <circle cx="40" cy="33.1" r="4.15" fill="#E9D5FF" />
      </g>
    </svg>
  );
}
