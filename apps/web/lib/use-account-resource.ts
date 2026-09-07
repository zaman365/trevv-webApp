"use client";

import { TrevvApiError } from "@founderhq/api-client";
import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppSession } from "./app-session-context";
import { useReportRouteReady } from "./navigation-performance";

/** Mounted identity owns the cache; role changes cannot reuse a privileged page. */
export function useAccountResource<T>(
  resource: string,
  read: (signal: AbortSignal) => Promise<T>,
  empty: T,
) {
  const session = useAppSession();
  const client = useQueryClient();
  const key = useMemo(
    () =>
      [
        "account-resources",
        session.user.id,
        session.organization.id,
        session.organization.role,
        session.platformRole ?? null,
        resource,
      ] as const,
    [
      resource,
      session.organization.id,
      session.organization.role,
      session.platformRole,
      session.user.id,
    ],
  );
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => read(signal),
    enabled: !session.demo,
    staleTime: 15_000,
    gcTime: 10 * 60_000,
    retry: false,
  });
  const denied =
    query.error instanceof TrevvApiError &&
    [401, 403, 404].includes(query.error.status);
  useEffect(() => {
    if (denied)
      void client.invalidateQueries({ queryKey: ["live-app-access"] });
  }, [client, denied]);
  useReportRouteReady(session.demo || (!denied && query.data !== undefined));
  const setValue = useCallback(
    (update: T | ((current: T) => T)) => {
      client.setQueryData<T>(key, (current) =>
        typeof update === "function"
          ? (update as (current: T) => T)(current ?? empty)
          : update,
      );
    },
    [client, empty, key],
  );
  const cancel = useCallback(
    () => client.cancelQueries({ queryKey: key, exact: true }),
    [client, key],
  );
  return {
    value: denied ? empty : (query.data ?? empty),
    setValue,
    loading: query.isFetching,
    error: query.error,
    refresh: query.refetch,
    cancel,
  };
}

/** Keep HTTP authorization failures distinguishable from a transient transport outage. */
export function accountResourceError(message: string, status: number) {
  return new TrevvApiError(
    "account_resource_failed",
    message,
    "unknown",
    status,
  );
}
