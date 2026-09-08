"use client";

import {
  INVENTORY_BUCKET_LABELS,
  inventoryTypeBucket,
  type InventoryTypeBucket,
} from "@skyarc/shared";
import { formatInr } from "@/lib/format";

export interface MixItem {
  id: string;
  label: string;
  value: number;
  inventoryType?: string | null;
}

const BUCKET_COLORS: Record<InventoryTypeBucket, string> = {
  hoarding: "#f59e0b",
  digital: "#8b5cf6",
  kiosk: "#14b8a6",
  other: "#94a3b8",
};

const BUCKET_ORDER: InventoryTypeBucket[] = ["hoarding", "digital", "kiosk", "other"];

function mixByBucket(items: MixItem[]) {
  const counts: Record<InventoryTypeBucket, number> = {
    hoarding: 0,
    digital: 0,
    kiosk: 0,
    other: 0,
  };
  const spend: Record<InventoryTypeBucket, number> = {
    hoarding: 0,
    digital: 0,
    kiosk: 0,
    other: 0,
  };
  for (const item of items) {
    const bucket = inventoryTypeBucket(item.inventoryType);
    counts[bucket] += 1;
    spend[bucket] += item.value;
  }
  return { counts, spend };
}

export function PlanMixViz({ items }: { items: MixItem[] }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (items.length === 0 || total <= 0) return null;

  const { counts, spend } = mixByBucket(items);
  const activeBuckets = BUCKET_ORDER.filter((bucket) => counts[bucket] > 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {BUCKET_ORDER.map((bucket) => (
          <div
            key={bucket}
            className="rounded-xl bg-white border border-violet-100 px-3 py-2.5"
          >
            <p className="text-[10px] uppercase tracking-wider text-muted font-semibold">
              {INVENTORY_BUCKET_LABELS[bucket]}
            </p>
            <p className="text-lg font-bold text-slate-900 leading-tight mt-0.5">{counts[bucket]}</p>
            {spend[bucket] > 0 ? (
              <p className="text-[11px] text-slate-500">{formatInr(spend[bucket])}</p>
            ) : (
              <p className="text-[11px] text-slate-400">—</p>
            )}
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <p className="text-[10px] uppercase tracking-wider text-primary font-semibold">
          Budget mix
        </p>
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-violet-100" aria-hidden>
          {activeBuckets.map((bucket) => (
            <div
              key={bucket}
              title={`${INVENTORY_BUCKET_LABELS[bucket]} · ${formatInr(spend[bucket])}`}
              className="h-full transition-all duration-300"
              style={{
                width: `${(spend[bucket] / total) * 100}%`,
                background: BUCKET_COLORS[bucket],
              }}
            />
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-[10px] uppercase tracking-wider text-primary font-semibold">
          Site allocations
        </p>
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-violet-100" aria-hidden>
          {items.map((item) => {
            const bucket = inventoryTypeBucket(item.inventoryType);
            return (
              <div
                key={item.id}
                title={`${item.label} · ${formatInr(item.value)}`}
                className="h-full transition-all duration-300"
                style={{
                  width: `${(item.value / total) * 100}%`,
                  background: BUCKET_COLORS[bucket],
                }}
              />
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
          {activeBuckets.map((bucket) => (
            <span key={bucket} className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: BUCKET_COLORS[bucket] }}
              />
              {INVENTORY_BUCKET_LABELS[bucket]}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
