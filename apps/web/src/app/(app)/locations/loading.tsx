import { PageHeaderSkeleton, LocationGridSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function LocationsLoading() {
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <PageHeaderSkeleton />

      {/* Filter and search bar skeleton */}
      <div className="card-surface p-4 space-y-4">
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-8 w-32 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <Skeleton className="sm:col-span-6 h-10 rounded-lg" />
          <Skeleton className="sm:col-span-2 h-10 rounded-lg" />
          <Skeleton className="sm:col-span-2 h-10 rounded-lg" />
          <Skeleton className="sm:col-span-2 h-10 rounded-lg" />
        </div>
      </div>

      {/* Grid skeleton */}
      <LocationGridSkeleton count={6} />
    </div>
  );
}
