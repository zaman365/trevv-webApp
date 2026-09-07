"use client";

import { TrevvApiError } from "@founderhq/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (attempt, error) =>
          attempt < 2 &&
          !(
            error instanceof TrevvApiError &&
            [401, 403, 404, 409, 422, 429].includes(error.status)
          ),
        staleTime: 3_000,
      },
      mutations: { retry: false },
    },
  });
}

/** One cache per mounted identity; demo resource views use the same query API. */
export function AppQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createAppQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
