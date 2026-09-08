import type { QueryClient } from "@tanstack/react-query";
import type { InboxItemDto, WorkItemDto } from "@founderhq/api-contract";
import { workspaceResourceKeys } from "./workspace-resource-keys";
import type { LiveAppAccessSnapshot } from "./live-app-sync";
import type { LiveAppDataSnapshot } from "./live-app-data";

/** Publish acknowledged capture immediately without creating an incomplete Inbox cache. */
export async function applyConfirmedInboxItem(
  client: QueryClient,
  organizationId: string,
  item: InboxItemDto,
) {
  const queryKey = workspaceResourceKeys.inbox(organizationId);
  await client.cancelQueries({ queryKey });
  const access = client.getQueryData<LiveAppAccessSnapshot>([
    "live-app-access",
  ]);
  if (
    access &&
    (access.session.organization.id !== organizationId ||
      access.session.user.id !== item.userId)
  )
    return;
  client.setQueryData<InboxItemDto[]>(queryKey, (records) => {
    if (!records) return records;
    const previous = records.find((record) => record.id === item.id);
    if (previous && previous.version > item.version) return records;
    return previous
      ? records.map((record) => (record.id === item.id ? item : record))
      : [...records, item];
  });
}

/** Cancel obsolete snapshots before publishing an authoritative mutation response. */
export async function applyConfirmedWorkItem(
  client: QueryClient,
  item: WorkItemDto,
) {
  const filter = {
    predicate: (query: { queryKey: readonly unknown[] }) =>
      query.queryKey[0] === "live-app-data" &&
      (query.queryKey.length === 1 ||
        (query.queryKey[1] === "workspace" &&
          query.queryKey[2] === item.workspaceId)),
  };
  await client.cancelQueries(filter);
  const access = client.getQueryData<LiveAppAccessSnapshot>([
    "live-app-access",
  ]);
  if (access && !access.workspaces.some(({ id }) => id === item.workspaceId))
    return;
  client.setQueriesData<LiveAppDataSnapshot>(filter, (snapshot) => {
    if (
      !snapshot ||
      !snapshot.workspaces.some(({ id }) => id === item.workspaceId)
    )
      return snapshot;
    const previous = snapshot.items.find(({ id }) => id === item.id);
    if (previous && previous.version > item.version) return snapshot;
    return {
      ...snapshot,
      items: previous
        ? snapshot.items.map((current) =>
            current.id === item.id ? item : current,
          )
        : [...snapshot.items, item],
    };
  });
}

/** A confirmed removal cannot be resurrected by a snapshot already in flight. */
export async function removeConfirmedWorkItem(
  client: QueryClient,
  workspaceId: string,
  itemId: string,
) {
  const filter = {
    predicate: (query: { queryKey: readonly unknown[] }) =>
      query.queryKey[0] === "live-app-data" &&
      (query.queryKey.length === 1 ||
        (query.queryKey[1] === "workspace" &&
          query.queryKey[2] === workspaceId)),
  };
  await client.cancelQueries(filter);
  client.setQueriesData<LiveAppDataSnapshot>(filter, (snapshot) =>
    snapshot
      ? { ...snapshot, items: snapshot.items.filter(({ id }) => id !== itemId) }
      : snapshot,
  );
}
