"use client";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LiveAppDataContext,
  useLiveAppRecords,
  fetchLiveAppData,
  liveAppDataKey,
  type LiveAppRecordsContextValue,
} from "@/lib/live-app-data";
import { isLiveAccessLoss, presentLiveReadError } from "@/lib/live-errors";
import { LiveStateNotice } from "./live-state";
/** A Portfolio panel borrows the canonical workspace cache without mounting a
 * second account, event bridge or query client. All mutations share the cache. */
export function LiveWorkspaceRecordsScope({
  workspaceSlug,
  children,
}: {
  workspaceSlug: string;
  children: ReactNode;
}) {
  const parent = useLiveAppRecords();
  const workspace = parent.workspaces.find(
    (entry) => entry.slug === workspaceSlug,
  );
  const query = useQuery({
    queryKey: [...liveAppDataKey, "workspace", workspace?.id ?? workspaceSlug],
    queryFn: ({ signal }) =>
      fetchLiveAppData(
        parent.client.withSignal(signal),
        { portfolios: parent.portfolios, workspaces: parent.workspaces },
        workspace!.id,
      ),
    enabled: Boolean(workspace) && !parent.accessLost,
    staleTime: 5_000,
  });
  const denied =
    parent.accessLost || !workspace || isLiveAccessLoss(query.error);
  const source = denied ? undefined : query.data;
  const value: LiveAppRecordsContextValue = {
    ...parent,
    items:
      source?.items.filter((item) => item.workspaceId === workspace?.id) ?? [],
    attention:
      source?.attention.filter((item) => item.workspaceId === workspace?.id) ??
      [],
    waiting:
      source?.waiting.filter((item) => item.workspaceId === workspace?.id) ??
      [],
    recordWorkspaceId: workspace?.id,
    accessLost: denied,
    recordsReady: Boolean(source),
    recordsComplete: Boolean(source) && source?.complete !== false,
    error: query.error,
    stale: Boolean(query.error),
    refreshing: query.isFetching,
    refresh: async () => {
      await Promise.all([parent.refresh(), query.refetch()]);
    },
  };
  return (
    <LiveAppDataContext.Provider value={value}>
      {denied ? (
        <LiveStateNotice
          kind="permission-loss"
          title="Workspace access changed"
          description="Choose another accessible workspace or refresh your access."
          actions={
            <button type="button" onClick={() => void value.refresh()}>
              Refresh access
            </button>
          }
        />
      ) : query.error ? (
        <>
          <LiveStateNotice
            {...presentLiveReadError(query.error)}
            actions={
              <button type="button" onClick={() => void query.refetch()}>
                Retry workspace
              </button>
            }
          />
          {source ? children : null}
        </>
      ) : !source ? (
        <LiveStateNotice kind="loading" title="Loading workspace work" />
      ) : (
        children
      )}
    </LiveAppDataContext.Provider>
  );
}
