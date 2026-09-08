"use client";

import Link from "next/link";
import {
  INVENTORY_BUCKET_LABELS,
  inventoryTypeBucket,
  type InventoryTypeBucket,
} from "@skyarc/shared";
import { formatInr, formatInrCompact } from "@/lib/format";

export const MIX_COLORS: Record<InventoryTypeBucket, string> = {
  hoarding: "#f59e0b",
  digital: "#a855f7",
  kiosk: "#14b8a6",
  other: "#94a3b8",
};

const BUCKET_ORDER: InventoryTypeBucket[] = ["hoarding", "digital", "kiosk", "other"];

export function primaryInventoryBucket(types?: string[] | null): InventoryTypeBucket {
  if (!types?.length) return "other";
  if (types.some((type) => inventoryTypeBucket(type) === "digital")) return "digital";
  if (types.some((type) => inventoryTypeBucket(type) === "hoarding")) return "hoarding";
  if (types.some((type) => inventoryTypeBucket(type) === "kiosk")) return "kiosk";
  return inventoryTypeBucket(types[0]);
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function pieSlice(cx: number, cy: number, r: number, start: number, end: number) {
  if (end - start >= 359.99) {
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`;
  }
  const a = polar(cx, cy, r, start);
  const b = polar(cx, cy, r, end);
  const large = end - start > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y} Z`;
}

export function MixDonut({
  counts,
}: {
  counts: Record<InventoryTypeBucket, number>;
}) {
  const total = BUCKET_ORDER.reduce((sum, bucket) => sum + counts[bucket], 0);
  const slices = BUCKET_ORDER.filter((bucket) => counts[bucket] > 0);
  let cursor = 0;
  const arcs = slices.map((bucket) => {
    const sweep = total > 0 ? (counts[bucket] / total) * 360 : 0;
    const start = cursor;
    const end = cursor + sweep;
    cursor = end;
    return { bucket, start, end };
  });

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0">
        <svg viewBox="0 0 140 140" className="w-36 h-36" aria-hidden>
          {total === 0 ? (
            <circle cx="70" cy="70" r="54" fill="#f1f5f9" />
          ) : (
            arcs.map((arc) => (
              <path
                key={arc.bucket}
                d={pieSlice(70, 70, 54, arc.start, arc.end)}
                fill={MIX_COLORS[arc.bucket]}
              />
            ))
          )}
          <circle cx="70" cy="70" r="32" fill="white" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-2xl font-bold text-slate-900 leading-none">{total}</p>
          <p className="text-[10px] uppercase tracking-wider text-muted font-semibold mt-0.5">
            sites
          </p>
        </div>
      </div>
      <ul className="space-y-2 min-w-0 flex-1">
        {BUCKET_ORDER.map((bucket) => {
          const count = counts[bucket];
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <li key={bucket} className="flex items-center gap-2.5 text-sm">
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ background: MIX_COLORS[bucket] }}
              />
              <span className="text-slate-700 font-medium truncate">
                {INVENTORY_BUCKET_LABELS[bucket]}
              </span>
              <span className="ml-auto tabular-nums text-slate-900 font-semibold">
                {count}
              </span>
              <span className="text-muted tabular-nums text-xs w-8 text-right">{pct}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function CorridorBars({
  rows,
}: {
  rows: Array<{ road: string; count: number }>;
}) {
  const max = Math.max(...rows.map((row) => row.count), 1);
  if (rows.length === 0) {
    return <p className="text-sm text-muted py-6 text-center">No corridor data yet.</p>;
  }
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.road}>
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <p className="text-sm font-medium text-slate-800 truncate">{row.road}</p>
            <p className="text-xs tabular-nums text-muted shrink-0">
              {row.count} {row.count === 1 ? "site" : "sites"}
            </p>
          </div>
          <div className="h-2 rounded-full bg-violet-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400"
              style={{ width: `${Math.max(8, (row.count / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function CampaignBudgetBars({
  rows,
}: {
  rows: Array<{
    id: string;
    name: string;
    advertiser?: string;
    budget: number;
    planned: number;
    href: string;
    phase: "live" | "upcoming" | "ended" | "undated";
    dates?: string;
  }>;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted py-8 text-center">No campaigns in this workspace yet.</p>;
  }

  const phaseStyle: Record<typeof rows[number]["phase"], string> = {
    live: "bg-emerald-50 text-emerald-700 border-emerald-200",
    upcoming: "bg-violet-50 text-violet-700 border-violet-200",
    ended: "bg-slate-100 text-slate-600 border-slate-200",
    undated: "bg-amber-50 text-amber-700 border-amber-200",
  };
  const phaseLabel: Record<typeof rows[number]["phase"], string> = {
    live: "Live",
    upcoming: "Upcoming",
    ended: "Ended",
    undated: "Dates TBD",
  };

  return (
    <ul className="space-y-3">
      {rows.map((row) => {
        const cap = row.budget > 0 ? row.budget : Math.max(row.planned, 1);
        const used = Math.min(100, (row.planned / cap) * 100);
        return (
          <li key={row.id}>
            <Link
              href={row.href}
              className="block rounded-xl border border-violet-100 bg-white hover:border-primary/40 hover:shadow-sm transition-all p-3.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{row.name}</p>
                  <p className="text-xs text-muted truncate mt-0.5">
                    {row.advertiser ?? "—"}
                    {row.dates ? ` · ${row.dates}` : ""}
                  </p>
                </div>
                <span
                  className={`text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-full border shrink-0 ${phaseStyle[row.phase]}`}
                >
                  {phaseLabel[row.phase]}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-muted">
                  {row.planned > 0 ? `${formatInrCompact(row.planned)} planned` : "No plan yet"}
                </span>
                <span className="font-semibold text-slate-800 tabular-nums">
                  {row.budget > 0 ? formatInr(row.budget) : "—"}
                </span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-violet-500"
                  style={{ width: `${row.planned > 0 ? Math.max(6, used) : 0}%` }}
                />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function SurveyPipeline({
  draft,
  inProgress,
  submitted,
  tone = "light",
}: {
  draft: number;
  inProgress: number;
  submitted: number;
  tone?: "light" | "dark";
}) {
  const total = draft + inProgress + submitted;
  if (total === 0) return null;
  const parts = [
    { label: "Submitted", value: submitted, color: "#10b981" },
    { label: "In progress", value: inProgress, color: "#c084fc" },
    { label: "Draft", value: draft, color: "#f59e0b" },
  ].filter((part) => part.value > 0);

  return (
    <div>
      <div
        className={`flex h-2.5 w-full overflow-hidden rounded-full ${
          tone === "dark" ? "bg-white/10" : "bg-slate-100"
        }`}
      >
        {parts.map((part) => (
          <div
            key={part.label}
            title={`${part.label} · ${part.value}`}
            className="h-full"
            style={{ width: `${(part.value / total) * 100}%`, background: part.color }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {parts.map((part) => (
          <span
            key={part.label}
            className={`inline-flex items-center gap-1.5 text-[11px] ${
              tone === "dark" ? "text-zinc-400" : "text-slate-600"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: part.color }} />
            {part.label} {part.value}
          </span>
        ))}
      </div>
    </div>
  );
}
