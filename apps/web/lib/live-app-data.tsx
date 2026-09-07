"use client";

import {
  createApiClient,
  TrevvApiError,
  type TrevvApiClient,
} from "@founderhq/api-client";
import type {
  AppSyncSummary,
  AttentionSignalDto,
  PortfolioDto,
  WaitingStateDto,
  WorkItemDto,
  WorkspaceDto,
} from "@founderhq/api-contract";
import {
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  LiveAppFreshnessContext,
  useLiveAppRefreshedAt,
} from "./live-app-freshness";
import { LiveStateNotice, RouteLoadingState } from "@/components/live-state";
import { createAppQueryClient } from "./app-query-provider";
import { readAllPages } from "./read-all-pages";
import {
  accessScopeKey,
  createLiveAccessReader,
  readVerifiedSnapshot,
  retainsAccessScope,
  restrictSnapshotToAccess,
  type AppIdentity,
  type LiveAppAccessSnapshot,
} from "./live-app-sync";
import {
  applyConfirmedWorkItem,
  removeConfirmedWorkItem,
} from "./live-app-mutations";
import {
  createLiveSummaryReader,
  restrictSummaryToAccess,
} from "./live-app-summary";
export { useLiveAppRefreshedAt } from "./live-app-freshness";

export interface LiveAppDataSnapshot {
  portfolios: PortfolioDto[];
  workspaces: WorkspaceDto[];
  items: WorkItemDto[];
  attention: AttentionSignalDto[];
  waiting: WaitingStateDto[];
  refreshedAt: string;
  revision?: string | null;
  /** False only while an initial scoped collection is still streaming pages. */
  complete?: boolean;
}
export type LiveAppRecords = Omit<
  LiveAppDataSnapshot,
  "refreshedAt" | "revision"
>;
interface LiveAppRecordsContextValue extends LiveAppRecords {
  client: TrevvApiClient;
  error: unknown;
  refreshing: boolean;
  stale: boolean;
  accessLost: boolean;
  recordsReady: boolean;
  recordsComplete: boolean;
  ensureSummary(): void;
  summary: AppSyncSummary | undefined;
  recordWorkspaceId: string | undefined;
  applyConfirmedItem(item: WorkItemDto): Promise<void>;
  removeConfirmedItem(workspaceId: string, itemId: string): Promise<void>;
  refresh(options?: { backgroundRecords?: boolean }): Promise<void>;
}
const LiveAppDataContext = createContext<LiveAppRecordsContextValue | null>(
  null,
);
const LiveAppAccessContext = createContext<LiveAppAccessSnapshot | undefined>(
  undefined,
);
export const liveAppDataKey = ["live-app-data"] as const;
export const liveAppSummaryKey = ["live-app-summary"] as const;
export type LiveRecordScope =
  "organization" | "summary" | { workspaceSlug: string };
export const liveAppAccessKey = ["live-app-access"] as const;
const emptySnapshot: LiveAppDataSnapshot = {
  portfolios: [],
  workspaces: [],
  items: [],
  attention: [],
  waiting: [],
  refreshedAt: "1970-01-01T00:00:00.000Z",
};

export function LiveAppDataProvider({
  children,
  initialData,
  initialAccess,
  identity,
  loadRecords = true,
  allowShell = false,
  recordScope = "organization",
}: {
  children: ReactNode;
  initialData?: LiveAppDataSnapshot;
  initialAccess?: LiveAppAccessSnapshot;
  identity?: AppIdentity;
  loadRecords?: boolean;
  allowShell?: boolean;
  recordScope?: LiveRecordScope;
}) {
  const [queryClient] = useState(createAppQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <LiveAppDataQuery
        {...{
          initialData,
          initialAccess,
          identity,
          loadRecords,
          allowShell,
          recordScope,
        }}
      >
        {children}
      </LiveAppDataQuery>
    </QueryClientProvider>
  );
}

function LiveAppDataQuery({
  children,
  initialData,
  initialAccess,
  identity,
  loadRecords,
  allowShell,
  recordScope,
}: {
  children: ReactNode;
  initialData: LiveAppDataSnapshot | undefined;
  initialAccess: LiveAppAccessSnapshot | undefined;
  identity: AppIdentity | undefined;
  loadRecords: boolean;
  allowShell: boolean;
  recordScope: LiveRecordScope;
}) {
  const client = useMemo(() => createApiClient({ baseUrl: "/api/v1" }), []);
  const queryClient = useQueryClient();
  const [latchedAccessError, setLatchedAccessError] =
    useState<TrevvApiError | null>(null);
  const userId = identity?.userId;
  const organizationId = identity?.organizationId;
  const readAccess = useMemo(() => {
    if (!userId || !organizationId) return undefined;
    const read = createLiveAccessReader(
      client,
      { userId, organizationId },
      { timeoutMs: 1_000 },
    );
    return async (signal?: AbortSignal) => {
      const result = await read(signal);
      // Only a real authorized read can recover a denial; recreating a cache
      // entry from an old server seed is not evidence that access returned.
      setLatchedAccessError(null);
      return result;
    };
  }, [client, userId, organizationId]);
  const access = useQuery({
    queryKey: liveAppAccessKey,
    queryFn: ({ signal }) => readAccess!(signal),
    enabled: Boolean(readAccess),
    ...(initialAccess ? { initialData: initialAccess } : {}),
    retry: false,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const accessData = access.data;
  const summaryOnly = recordScope === "summary";
  const workspaceSlug =
    typeof recordScope === "object" ? recordScope.workspaceSlug : undefined;
  const recordWorkspaceId = workspaceSlug
    ? accessData?.workspaces.find(
        (workspace) => workspace.slug === workspaceSlug,
      )?.id
    : undefined;
  const recordsKey = useMemo(
    () =>
      workspaceSlug
        ? ([
            ...liveAppDataKey,
            "workspace",
            recordWorkspaceId ?? workspaceSlug,
          ] as const)
        : liveAppDataKey,
    [recordWorkspaceId, workspaceSlug],
  );
  const recordsEnabled =
    loadRecords &&
    !summaryOnly &&
    (!workspaceSlug || Boolean(recordWorkspaceId));
  const getAccess = useCallback(
    async (signal: AbortSignal) => {
      signal.throwIfAborted();
      const cachedAccess =
        queryClient.getQueryData<LiveAppAccessSnapshot>(liveAppAccessKey);
      if (
        cachedAccess?.revision === null &&
        Date.now() - Date.parse(cachedAccess.checkedAt) < 4_500
      )
        return cachedAccess;
      const next = await queryClient.fetchQuery({
        queryKey: liveAppAccessKey,
        queryFn: ({ signal: accessSignal }) => readAccess!(accessSignal),
        staleTime: 0,
        retry: false,
      });
      signal.throwIfAborted();
      return next;
    },
    [queryClient, readAccess],
  );
  const readSummary = useMemo(() => createLiveSummaryReader(client), [client]);
  const summaries = useQuery({
    queryKey: liveAppSummaryKey,
    queryFn: ({ signal }) =>
      readSummary(
        signal,
        () => getAccess(signal),
        (navigation) => fetchLiveAppData(client.withSignal(signal), navigation),
        queryClient.getQueryData<AppSyncSummary>(liveAppSummaryKey),
      ),
    enabled:
      loadRecords &&
      Boolean(readAccess && accessData) &&
      !isAccessDenied(access.error, true),
    staleTime: accessData?.revision ? Infinity : 3_000,
    refetchInterval: accessData?.revision ? false : 5_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: !accessData?.revision,
  });
  const records = useQuery({
    queryKey: recordsKey,
    queryFn: async ({ signal }) => {
      const reader = client.withSignal(signal);
      if (!readAccess) {
        const result = await fetchLiveAppData(reader);
        signal.throwIfAborted();
        setLatchedAccessError(null);
        return result;
      }
      const result = await readVerifiedSnapshot(
        () => getAccess(signal),
        (navigation) =>
          fetchLiveAppData(
            reader,
            navigation,
            recordWorkspaceId,
            recordWorkspaceId
              ? (partial) => {
                  signal.throwIfAborted();
                  const latest =
                    queryClient.getQueryData<LiveAppDataSnapshot>(recordsKey);
                  // A background refresh never replaces a complete usable snapshot with a partial one.
                  if (latest && latest.complete !== false) return;
                  const access =
                    queryClient.getQueryData<LiveAppAccessSnapshot>(
                      liveAppAccessKey,
                    );
                  queryClient.setQueryData(
                    recordsKey,
                    access
                      ? restrictSnapshotToAccess(partial, access)
                      : partial,
                  );
                }
              : undefined,
          ),
        queryClient.getQueryData<LiveAppDataSnapshot>(recordsKey),
      );
      signal.throwIfAborted();
      const latestAccess =
        queryClient.getQueryData<LiveAppAccessSnapshot>(liveAppAccessKey);
      return latestAccess
        ? restrictSnapshotToAccess(result.snapshot, latestAccess)
        : result.snapshot;
    },
    ...(initialData && !workspaceSlug ? { initialData } : {}),
    enabled: recordsEnabled,
    staleTime: accessData?.revision ? Infinity : 3_000,
    refetchInterval: accessData?.revision ? false : 5_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: !accessData?.revision,
  });
  const queryData = records.data;
  const error =
    access.error ??
    (recordsEnabled ? records.error : null) ??
    (loadRecords ? summaries.error : null) ??
    latchedAccessError;
  const directAccessError = isAccessDenied(access.error, true)
    ? access.error
    : (!workspaceSlug && isAccessDenied(records.error)) ||
        (records.error instanceof TrevvApiError && records.error.status === 401)
      ? records.error
      : isAccessDenied(summaries.error)
        ? summaries.error
        : null;
  const accessLost = Boolean(directAccessError || latchedAccessError);
  // Retain a confirmed denial before children render or cache cleanup runs.
  // Only an authorized read above clears the latch.
  if (
    directAccessError instanceof TrevvApiError &&
    directAccessError !== latchedAccessError
  ) {
    setLatchedAccessError(directAccessError);
  }
  const scope = accessData ? accessScopeKey(accessData) : undefined;
  const previousAccess = useRef(accessData);
  useEffect(() => {
    const before = previousAccess.current;
    const changed = before !== undefined && accessScopeKey(before) !== scope;
    previousAccess.current = accessData;
    if (!accessLost && !changed) return;
    if (
      !accessLost &&
      before &&
      accessData &&
      retainsAccessScope(before, accessData)
    ) {
      // Creating a workspace expands access. Keep the authorized cache and
      // mounted page so refresh cannot discard drafts or mutation confirmation.
      void queryClient.invalidateQueries({ queryKey: liveAppDataKey });
      void queryClient.invalidateQueries({ queryKey: liveAppSummaryKey });
      return;
    }
    const nonAccessQuery = (query: { queryKey: readonly unknown[] }) =>
      query.queryKey[0] !== liveAppAccessKey[0];
    let active = true;
    void queryClient.cancelQueries({ predicate: nonAccessQuery }).then(() => {
      if (!active) return;
      if (accessLost) {
        queryClient.removeQueries({ predicate: nonAccessQuery });
      } else if (accessData) {
        queryClient.removeQueries({
          predicate: (query) =>
            nonAccessQuery(query) && query.queryKey[0] !== liveAppDataKey[0],
        });
        queryClient.setQueriesData<LiveAppDataSnapshot>(
          { queryKey: liveAppDataKey },
          (current) =>
            current ? restrictSnapshotToAccess(current, accessData) : current,
        );
        void queryClient.invalidateQueries({ queryKey: liveAppDataKey });
      }
    });
    return () => {
      active = false;
    };
  }, [accessData, accessLost, queryClient, scope]);
  useEffect(() => {
    if (!accessData?.revision || accessLost) return;
    for (const [key, enabled] of [
      [recordsKey, recordsEnabled],
      [liveAppSummaryKey, loadRecords && Boolean(readAccess)],
    ] as const) {
      if (
        enabled &&
        accessData.revision !==
          queryClient.getQueryData<{ revision?: string | null }>(key)
            ?.revision &&
        queryClient.getQueryState(key)?.fetchStatus !== "fetching"
      )
        void queryClient.invalidateQueries({ queryKey: key, exact: true });
    }
  }, [
    accessData?.revision,
    accessData?.checkedAt,
    accessLost,
    recordsEnabled,
    recordsKey,
    readAccess,
    loadRecords,
    queryClient,
  ]);
  const summary = useMemo(
    () =>
      summaries.data && !accessLost
        ? accessData
          ? restrictSummaryToAccess(summaries.data, accessData)
          : summaries.data
        : undefined,
    [summaries.data, accessData, accessLost],
  );

  const data = useMemo(() => {
    if (accessLost) return emptySnapshot;
    const current = isAccessDenied(records.error)
      ? emptySnapshot
      : (queryData ?? emptySnapshot);
    return accessData ? restrictSnapshotToAccess(current, accessData) : current;
  }, [accessData, accessLost, queryData, records.error]);
  const displayedRevision = summaryOnly
    ? summary?.revision
    : queryData?.revision;
  const refreshedAt =
    accessData &&
    (!loadRecords ||
      (accessData.revision && accessData.revision === displayedRevision))
      ? accessData.checkedAt
      : summaryOnly && summaries.dataUpdatedAt
        ? new Date(summaries.dataUpdatedAt).toISOString()
        : data.refreshedAt;
  const [expiredRefreshedAt, setExpiredRefreshedAt] = useState<string | null>(
    null,
  );
  useEffect(() => {
    const expiresAt = Date.parse(refreshedAt) + 15_000;
    const timeout = window.setTimeout(
      () => setExpiredRefreshedAt(refreshedAt),
      Math.max(0, expiresAt - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, [refreshedAt]);
  const stale = Boolean(error) || expiredRefreshedAt === refreshedAt;
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const { refetch: refreshAccess } = access;
  const { refetch: refreshRecords } = records;
  const { refetch: refreshSummary } = summaries;
  const refresh = useCallback(
    async (options?: { backgroundRecords?: boolean }) => {
      setManualRefreshing(true);
      try {
        if (readAccess) await refreshAccess();
        if (options?.backgroundRecords && recordsEnabled) void refreshRecords();
        await Promise.all([
          ...(recordsEnabled && !options?.backgroundRecords
            ? [refreshRecords()]
            : []),
          ...(readAccess && loadRecords ? [refreshSummary()] : []),
        ]);
      } finally {
        setManualRefreshing(false);
      }
    },
    [
      refreshAccess,
      readAccess,
      refreshRecords,
      recordsEnabled,
      refreshSummary,
      loadRecords,
    ],
  );
  const applyConfirmedItem = useCallback(
    (item: WorkItemDto) => applyConfirmedWorkItem(queryClient, item),
    [queryClient],
  );
  const removeConfirmedItem = useCallback(
    (workspaceId: string, itemId: string) =>
      removeConfirmedWorkItem(queryClient, workspaceId, itemId),
    [queryClient],
  );
  const ensureSummary = useCallback(() => {
    if (readAccess) void refreshSummary();
  }, [readAccess, refreshSummary]);
  const { portfolios, workspaces, items, attention, waiting } = data;
  const recordsReady = summaryOnly
    ? Boolean(summary)
    : Boolean(queryData) &&
      !isAccessDenied(records.error) &&
      (!workspaceSlug || Boolean(recordWorkspaceId));
  const recordsComplete =
    recordsReady && (summaryOnly || queryData?.complete !== false);
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
      recordsReady,
      recordsComplete,
      ensureSummary,
      applyConfirmedItem,
      removeConfirmedItem,
      summary,
      recordWorkspaceId,
      refresh,
    }),
    [
      portfolios,
      workspaces,
      items,
      attention,
      waiting,
      client,
      error,
      manualRefreshing,
      stale,
      accessLost,
      recordsReady,
      recordsComplete,
      ensureSummary,
      applyConfirmedItem,
      removeConfirmedItem,
      summary,
      recordWorkspaceId,
      refresh,
    ],
  );
  return (
    <LiveAppDataContext.Provider value={value}>
      <LiveAppAccessContext.Provider value={accessData}>
        <LiveAppFreshnessContext.Provider value={refreshedAt}>
          <LiveAppRecordsBoundary allowShell={allowShell}>
            {children}
          </LiveAppRecordsBoundary>
        </LiveAppFreshnessContext.Provider>
      </LiveAppAccessContext.Provider>
    </LiveAppDataContext.Provider>
  );
}

function isAccessDenied(error: unknown, includeMissing = false) {
  return (
    error instanceof TrevvApiError &&
    (error.status === 401 ||
      error.status === 403 ||
      (includeMissing && error.status === 404))
  );
}
export function useLiveAppAccess() {
  return useContext(LiveAppAccessContext);
}

/** Keep the navigation shell usable while its page's complete data is loading. */
export function LiveAppRecordsBoundary({
  children,
  required = true,
  allowShell = false,
}: {
  children: ReactNode;
  required?: boolean;
  /** The persistent shell renders its own permission-loss and route gates. */
  allowShell?: boolean;
}) {
  const records = useOptionalLiveAppRecords();
  if (!records) return children;
  if (
    allowShell ||
    ((!required || records.recordsReady) && !records.accessLost)
  )
    return (
      <>
        {!allowShell && required && !records.recordsComplete ? (
          <div
            role="status"
            className="route-state-shell"
            data-records-loading="true"
          >
            <LiveStateNotice
              kind={records.error ? "failed" : "pending"}
              title={
                records.error
                  ? "Some work is still unavailable"
                  : "Loading remaining work"
              }
              description={`${records.items.length} work records loaded. The list remains usable while the complete workspace loads.`}
              {...(records.error
                ? {
                    actions: (
                      <button onClick={() => void records.refresh()}>
                        Try again
                      </button>
                    ),
                  }
                : {})}
            />
          </div>
        ) : null}
        {children}
      </>
    );
  const permissionLost = records.accessLost || isAccessDenied(records.error);
  if (records.error || records.accessLost)
    return (
      <main className="route-state-shell">
        <LiveStateNotice
          kind={permissionLost ? "permission-loss" : "failed"}
          title={
            permissionLost
              ? "Your access has changed"
              : "Unable to load your workspace"
          }
          description={
            permissionLost
              ? "Sign in again, or ask an organization owner to restore access."
              : "Your workspace could not be loaded. Try again."
          }
          actions={
            permissionLost ? (
              <a href="/sign-in">Return to sign in</a>
            ) : (
              <button onClick={() => void records.refresh()}>Try again</button>
            )
          }
        />
      </main>
    );
  return <RouteLoadingState label="Loading your workspace" />;
}

/** Record consumers do not subscribe to the clock that changes on every poll. */
export function useLiveAppRecords(): LiveAppRecordsContextValue {
  const value = useContext(LiveAppDataContext);
  if (!value)
    throw new Error("Live application data is unavailable in demo mode.");
  return value;
}
export function useOptionalLiveAppRecords() {
  return useContext(LiveAppDataContext);
}
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
  navigation?: Pick<LiveAppDataSnapshot, "portfolios" | "workspaces">,
  workspaceId?: string,
  onProgress?: (snapshot: LiveAppDataSnapshot) => void,
): Promise<LiveAppDataSnapshot> {
  const metadata = Promise.all([
    navigation?.portfolios ?? client.portfolios(),
    navigation?.workspaces ?? client.workspaces(),
    client.attention(workspaceId ? { workspaceId } : {}),
    client.waiting(workspaceId ? { workspaceId } : {}),
  ]);
  // Attach rejection handling immediately while the first item page is in flight.
  void metadata.catch(() => {});
  let publishedAt = 0;
  const items = await readAllPages(
    (cursor) =>
      client.items({
        ...(cursor ? { cursor } : {}),
        ...(workspaceId ? { workspaceId } : {}),
        limit: 100,
      }),
    onProgress
      ? async (loaded, hasMore) => {
          if (!hasMore || (publishedAt && Date.now() - publishedAt < 80))
            return;
          const [portfolios, workspaces, attention, waiting] = await metadata;
          onProgress({
            portfolios,
            workspaces,
            attention,
            waiting,
            items: [...loaded],
            complete: false,
            refreshedAt: new Date().toISOString(),
          });
          publishedAt = Date.now();
        }
      : undefined,
  );
  const [portfolios, workspaces, attention, waiting] = await metadata;
  return {
    portfolios,
    workspaces,
    attention,
    waiting,
    items,
    complete: true,
    refreshedAt: new Date().toISOString(),
  };
}
