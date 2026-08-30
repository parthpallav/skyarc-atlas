import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function AccountLoading() {
  return (
    <div className="max-w-xl mx-auto w-full space-y-6 animate-in fade-in duration-200">
      <PageHeaderSkeleton />

      {/* Profile form card skeleton */}
      <div className="card-surface p-6 space-y-4">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-28 rounded" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-28 rounded" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
        <div className="space-y-1.5 pt-2">
          <Skeleton className="h-4 w-32 rounded" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
        <Skeleton className="h-11 w-full rounded-lg mt-4" />
      </div>

      {/* PWA setup card skeleton */}
      <div className="card-surface p-6 space-y-3">
        <Skeleton className="h-5 w-48 rounded" />
        <Skeleton className="h-4 w-full rounded" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    </div>
  );
}
