import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-slate-200/80 dark:bg-slate-800",
        className
      )}
      {...props}
    />
  );
}

export function PageHeaderSkeleton() {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56 rounded-lg" />
        <Skeleton className="h-4 w-80 rounded-md" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 w-28 rounded-lg" />
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>
    </div>
  );
}

export function LocationCardSkeleton() {
  return (
    <div className="card-surface overflow-hidden flex flex-col justify-between border-violet-100">
      <div>
        {/* Cover image skeleton */}
        <div className="relative h-44 bg-slate-100 overflow-hidden">
          <Skeleton className="w-full h-full rounded-none" />
          <div className="absolute top-2.5 right-2.5">
            <Skeleton className="h-5 w-16 rounded-full bg-slate-300" />
          </div>
          <div className="absolute bottom-2.5 left-2.5 flex gap-1.5">
            <Skeleton className="h-4 w-20 rounded-md bg-slate-300" />
            <Skeleton className="h-4 w-14 rounded-md bg-slate-300" />
          </div>
          <div className="absolute bottom-2.5 right-2.5">
            <Skeleton className="h-5 w-14 rounded-lg bg-slate-300" />
          </div>
        </div>

        {/* Content info skeleton */}
        <div className="p-4 space-y-2.5">
          <Skeleton className="h-5 w-3/4 rounded-md" />
          <Skeleton className="h-3.5 w-1/2 rounded-md" />

          {/* Pricing bar */}
          <div className="pt-2 border-t border-violet-100 flex items-center justify-between">
            <div className="space-y-1">
              <Skeleton className="h-2.5 w-12 rounded" />
              <Skeleton className="h-4 w-24 rounded-md" />
            </div>
            <Skeleton className="h-4 w-20 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function LocationGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <LocationCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function CampaignCardSkeleton() {
  return (
    <div className="card-surface p-5 space-y-3.5 border-violet-100">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2 flex-1">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-48 rounded-md" />
            <Skeleton className="h-4 w-16 rounded-full" />
          </div>
          <Skeleton className="h-3.5 w-36 rounded-md" />
        </div>
        <Skeleton className="h-6 w-24 rounded-md" />
      </div>

      <div className="flex flex-wrap gap-1.5 pt-1">
        <Skeleton className="h-5 w-20 rounded-lg" />
        <Skeleton className="h-5 w-24 rounded-lg" />
        <Skeleton className="h-5 w-28 rounded-lg" />
      </div>

      <div className="pt-3 border-t border-violet-50 flex items-center justify-between">
        <Skeleton className="h-3.5 w-32 rounded" />
        <Skeleton className="h-3.5 w-20 rounded" />
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="card-surface overflow-hidden">
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-24 rounded" />
        ))}
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="px-4 py-3.5 flex items-center justify-between">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton
                key={c}
                className={cn(
                  "h-4 rounded",
                  c === 0 ? "w-36" : c === cols - 1 ? "w-16" : "w-20"
                )}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function LocationDetailSkeleton() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Skeleton className="h-4 w-24 rounded mb-2" />
      <PageHeaderSkeleton />

      {/* Hero photo skeleton */}
      <div className="h-72 sm:h-96 rounded-2xl bg-slate-200 overflow-hidden relative">
        <Skeleton className="w-full h-full rounded-none" />
      </div>

      {/* Metric cards skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card-surface p-4 space-y-2 text-center">
            <Skeleton className="h-3 w-16 mx-auto rounded" />
            <Skeleton className="h-6 w-20 mx-auto rounded" />
          </div>
        ))}
      </div>

      {/* Panels skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card-surface p-6 space-y-3">
          <Skeleton className="h-5 w-36 rounded" />
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-4 w-4/5 rounded" />
          <Skeleton className="h-4 w-3/5 rounded" />
        </div>
        <div className="card-surface p-6 space-y-3">
          <Skeleton className="h-5 w-36 rounded" />
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-4 w-4/5 rounded" />
          <Skeleton className="h-4 w-3/5 rounded" />
        </div>
      </div>
    </div>
  );
}

export function MediaPlanDetailSkeleton() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Skeleton className="h-4 w-28 rounded mb-2" />
      <PageHeaderSkeleton />

      {/* Banner skeleton */}
      <div className="h-44 rounded-2xl bg-slate-900/80 p-6 space-y-4">
        <Skeleton className="h-5 w-32 rounded-full bg-slate-700" />
        <Skeleton className="h-8 w-64 rounded-lg bg-slate-700" />
        <div className="grid grid-cols-3 gap-3 pt-2">
          <Skeleton className="h-12 rounded-xl bg-slate-800" />
          <Skeleton className="h-12 rounded-xl bg-slate-800" />
          <Skeleton className="h-12 rounded-xl bg-slate-800" />
        </div>
      </div>

      {/* Site cards grid skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card-surface overflow-hidden space-y-4 pb-4">
            <Skeleton className="h-48 w-full rounded-none" />
            <div className="px-4 space-y-2">
              <Skeleton className="h-5 w-3/4 rounded" />
              <Skeleton className="h-3.5 w-1/2 rounded" />
              <div className="flex gap-2 pt-2">
                <Skeleton className="h-5 w-24 rounded-lg" />
                <Skeleton className="h-5 w-28 rounded-lg" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
