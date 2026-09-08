import { AtlasLogoLoader } from "@/components/atlas-logo-loader";
import { Skeleton } from "@/components/ui/skeleton";

export default function MapLoading() {
  return (
    <div className="relative w-full h-[calc(100vh-130px)] rounded-2xl overflow-hidden bg-violet-50 border border-violet-100">
      <div className="absolute top-4 left-4 right-4 sm:left-6 sm:w-80 z-20">
        <Skeleton className="h-11 w-full rounded-xl" />
      </div>

      <div className="w-full h-full flex items-center justify-center">
        <AtlasLogoLoader size="md" label="Loading billboard map" />
      </div>
    </div>
  );
}
