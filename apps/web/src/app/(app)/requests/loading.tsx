import { PageHeaderSkeleton, CampaignCardSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function RequestsLoading() {
  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <PageHeaderSkeleton />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
      <div className="card-surface space-y-3 p-4">
        <Skeleton className="h-10 w-full max-w-md rounded-lg" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-16 rounded-lg" />
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <CampaignCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
