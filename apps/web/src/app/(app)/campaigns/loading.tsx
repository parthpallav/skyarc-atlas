import { PageHeaderSkeleton, CampaignCardSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function CampaignsLoading() {
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <PageHeaderSkeleton />

      {/* Search & filters bar skeleton */}
      <div className="card-surface p-4 flex flex-col sm:flex-row gap-3">
        <Skeleton className="h-10 flex-1 rounded-lg" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-20 rounded-lg" />
          <Skeleton className="h-10 w-24 rounded-lg" />
        </div>
      </div>

      {/* Campaign cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CampaignCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
