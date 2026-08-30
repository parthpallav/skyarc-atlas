import { Skeleton } from "@/components/ui/skeleton";

export default function MapLoading() {
  return (
    <div className="relative w-full h-[calc(100vh-130px)] rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 animate-in fade-in duration-200">
      {/* Floating search bar skeleton */}
      <div className="absolute top-4 left-4 right-4 sm:left-6 sm:w-80 z-20">
        <Skeleton className="h-11 w-full rounded-xl bg-slate-800" />
      </div>

      {/* Map surface shimmer */}
      <div className="w-full h-full flex flex-col items-center justify-center space-y-3">
        <Skeleton className="w-12 h-12 rounded-full bg-slate-800" />
        <Skeleton className="h-4 w-48 rounded-md bg-slate-800" />
      </div>

      {/* Bottom map controls skeleton */}
      <div className="absolute bottom-6 right-6 z-20 flex flex-col gap-2">
        <Skeleton className="h-9 w-9 rounded-lg bg-slate-800" />
        <Skeleton className="h-9 w-9 rounded-lg bg-slate-800" />
      </div>
    </div>
  );
}
