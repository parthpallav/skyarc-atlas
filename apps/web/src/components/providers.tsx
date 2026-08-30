"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AuthProvider } from "@/components/auth-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 30, // 30s cache
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              if (
                error instanceof Error &&
                (error.message.includes("401") ||
                  error.message.includes("Unauthorized") ||
                  error.message.includes("Forbidden"))
              ) {
                return false;
              }
              return failureCount < 2;
            },
          },
        },
      })
  );
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
