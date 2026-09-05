"use client";

import {
  createApiClient,
  TrevvApiError,
  type TrevvApiClient,
} from "@founderhq/api-client";
import type {
  AttentionSignalDto,
  PortfolioDto,
  WaitingStateDto,
  WorkItemDto,
  WorkspaceDto,
} from "@founderhq/api-contract";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  LiveAppFreshnessContext,
  useLiveAppRefreshedAt,
} from "./live-app-freshness";
export { useLiveAppRefreshedAt } from "./live-app-freshness";

export interface LiveAppDataSnapshot {
  portfolios: PortfolioDto[];
  workspaces: WorkspaceDto[];
  items: WorkItemDto[];
  attention: AttentionSignalDto[];
  waiting: WaitingStateDto[];
  refreshedAt: string;
}

export type LiveAppRecords = Omit<LiveAppDataSnapshot, "refreshedAt">;

interface LiveAppRecordsContextValue extends LiveAppRecords {
  client: TrevvApiClient;
  error: unknown;
  refreshing: boolean;
  stale: boolean;
  accessLost: boolean;
  refresh(): Promise<void>;
}

const LiveAppDataContext = createContext<LiveAppRecordsContextValue | null>(
  null,
);
const liveAppDataKey = ["live-app-data"] as const;

export function LiveAppDataProvider({
  children,
  initialData,
}: {
  children: ReactNode;
  initialData: LiveAppDataSnapshot;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
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
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <LiveAppDataQuery initialData={initialData}>{children}</LiveAppDataQuery>
    </QueryClientProvider>
  );
}

function LiveAppDataQuery({
  children,
  initialData,
}: {
  children: ReactNode;
  initialData: LiveAppDataSnapshot;
}) {
  const client = useMemo(() => createApiClient({ baseUrl: "/api/v1" }), []);
  const {
    data: queryData,
    error,
    refetch,
  } = useQuery({
    queryKey: liveAppDataKey,
    queryFn: () => fetchLiveAppData(client),
    initialData,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const accessLost =
    error instanceof TrevvApiError &&
    (error.status === 401 || error.status === 403);
  const data = useMemo<LiveAppDataSnapshot>(
    () =>
      accessLost
        ? {
            portfolios: [],
            workspaces: [],
            items: [],
            attention: [],
            waiting: [],
            refreshedAt: queryData.refreshedAt,
          }
        : queryData,
    [accessLost, queryData],
  );
  const [expiredRefreshedAt, setExpiredRefreshedAt] = useState<string | null>(
    null,
  );
  useEffect(() => {
    const expiresAt = Date.parse(data.refreshedAt) + 15_000;
    const timeout = window.setTimeout(
      () => setExpiredRefreshedAt(data.refreshedAt),
      Math.max(0, expiresAt - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, [data.refreshedAt]);
  const stale = Boolean(error) || expiredRefreshedAt === data.refreshedAt;
  // Background polling must not be surfaced as activity. `isFetching` flips on
  // every poll, and including it here handed all ten live components a new
  // context value on that cadence, re-rendering the whole application shell
  // several times a minute even when the payload was byte-identical. Only an
  // explicitly requested refresh counts as refreshing.
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setManualRefreshing(true);
    try {
      await refetch();
    } finally {
      setManualRefreshing(false);
    }
  }, [refetch]);
  const { portfolios, workspaces, items, attention, waiting } = data;
  const value = useMemo<LiveAppRecordsContextValue>(
    () => ({
      portfolios,
      workspaces,
      items,
      attention,
      waiting,
      client,
      error,
      refreshing: manualRefreshing,
      stale,
      accessLost,
      refresh,
    }),
    [
      accessLost,
      client,
      portfolios,
      workspaces,
      items,
      attention,
      waiting,
      error,
      manualRefreshing,
      refresh,
      stale,
    ],
  );

  return (
    <LiveAppDataContext.Provider value={value}>
      <LiveAppFreshnessContext.Provider value={data.refreshedAt}>
        {children}
      </LiveAppFreshnessContext.Provider>
    </LiveAppDataContext.Provider>
  );
}

/** Record consumers do not subscribe to the clock that changes on every poll. */
export function useLiveAppRecords(): LiveAppRecordsContextValue {
  const value = useContext(LiveAppDataContext);
  if (!value)
    throw new Error("Live application data is unavailable in demo mode.");
  return value;
}

export function useOptionalLiveAppRecords(): LiveAppRecordsContextValue | null {
  return useContext(LiveAppDataContext);
}

// Keep the full snapshot hooks available for consumers that need both records
// and refresh time. Large views use the record-only hooks; clock labels subscribe
// independently so a successful unchanged poll does not repaint the application.
export function useLiveAppData() {
  const records = useLiveAppRecords();
  const refreshedAt = useLiveAppRefreshedAt()!;
  return useMemo(() => ({ ...records, refreshedAt }), [records, refreshedAt]);
}

export function useOptionalLiveAppData() {
  const records = useOptionalLiveAppRecords();
  const refreshedAt = useLiveAppRefreshedAt()!;
  return useMemo(
    () => (records ? { ...records, refreshedAt } : null),
    [records, refreshedAt],
  );
}

export async function fetchLiveAppData(
  client: TrevvApiClient,
): Promise<LiveAppDataSnapshot> {
  const [portfolios, workspaces, attention, waiting, items] = await Promise.all(
    [
      client.portfolios(),
      client.workspaces(),
      client.attention(),
      client.waiting(),
      fetchEveryWorkItem(client),
    ],
  );
  return {
    portfolios,
    workspaces,
    attention,
    waiting,
    items,
    refreshedAt: new Date().toISOString(),
  };
}

async function fetchEveryWorkItem(
  client: TrevvApiClient,
): Promise<WorkItemDto[]> {
  const items: WorkItemDto[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 100; page += 1) {
    const response = await client.items({
      ...(cursor ? { cursor } : {}),
      limit: 100,
    });
    items.push(...response.data);
    if (!response.nextCursor) return items;
    cursor = response.nextCursor;
  }
  throw new Error("The work-item pagination limit was exceeded.");
}
