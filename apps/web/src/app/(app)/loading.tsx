import { PageHeaderSkeleton, LocationGridSkeleton } from "@/components/ui/skeleton";

export default function AppLoading() {
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <PageHeaderSkeleton />
      <LocationGridSkeleton count={6} />
    </div>
  );
}
