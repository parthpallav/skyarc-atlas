import { PageHeaderSkeleton, TableSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function AdminOrganizationsLoading() {
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <PageHeaderSkeleton />

      {/* Create vendor box skeleton */}
      <div className="card-surface p-6 max-w-xl space-y-3">
        <Skeleton className="h-5 w-32 rounded" />
        <div className="flex gap-3">
          <Skeleton className="h-10 flex-1 rounded-lg" />
          <Skeleton className="h-10 w-24 rounded-lg" />
        </div>
      </div>

      {/* Vendors table skeleton */}
      <TableSkeleton rows={5} cols={5} />
    </div>
  );
}
