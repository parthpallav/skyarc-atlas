"use client";

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { DEFAULT_PREMIUM_MEDIA_FORMATS, isPremiumMediaFormat } from "@skyarc/shared";
import { createWebApiClient } from "@/lib/api";

export function usePremiumFormats() {
  const { data, isLoading } = useQuery({
    queryKey: ["platform-premium-formats"],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.getPlatformPremiumFormats();
      return result.data.premiumFormats;
    },
    staleTime: 5 * 60 * 1000,
  });

  const premiumFormats = useMemo(
    () => data ?? [...DEFAULT_PREMIUM_MEDIA_FORMATS],
    [data]
  );

  const isPremiumFormat = useCallback(
    (format: string) => isPremiumMediaFormat(format, premiumFormats),
    [premiumFormats]
  );

  return { premiumFormats, isPremiumFormat, isLoading };
}
