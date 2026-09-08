"use client";
import { readAllPages } from "./read-all-pages";

import {
  collaborationEventSchema,
  type CollaborationEventDto,
  type ConversationDto,
  type ConversationMessageDto,
  type PaginatedConversationMessages,
} from "@founderhq/api-contract";
import { TrevvApiError } from "@founderhq/api-client";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type QueryKey,
  type QueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef, type RefObject } from "react";
import { useLiveAppRecords as useLiveAppData } from "./live-app-data";
import { liveDraftStorageKey } from "./live-workflow-ui";

const collaborationRoot = "live-collaboration";
const cursorsByClient = new WeakMap<QueryClient, Map<string, number>>();

export const collaborationKeys = {
  workspace: (workspaceId: string) => [collaborationRoot, workspaceId] as const,
  unread: (workspaceId: string) =>
    [collaborationRoot, workspaceId, "unread"] as const,
  teams: (workspaceId: string) =>
    [collaborationRoot, workspaceId, "teams"] as const,
  conversations: (workspaceId: string) =>
    [collaborationRoot, workspaceId, "conversations"] as const,
  conversation: (workspaceId: string, conversationId: string) =>
    [collaborationRoot, workspaceId, "conversation", conversationId] as const,
  messages: (
    workspaceId: string,
    conversationId: string,
    parentMessageId?: string,
  ) =>
    parentMessageId
      ? ([
          collaborationRoot,
          workspaceId,
          "messages",
          conversationId,
          parentMessageId,
        ] as const)
      : ([collaborationRoot, workspaceId, "messages", conversationId] as const),
};

export type ConversationGroup = "teams" | "rooms" | "people";

export const conversationRailWidth = {
  default: 272,
  minimum: 224,
  maximum: 352,
} as const;

export interface LiveConversationLayoutPreference {
  conversationRailCollapsed: boolean;
  conversationRailWidth: number;
}

export const defaultLiveConversationLayoutPreference: LiveConversationLayoutPreference =
  {
    conversationRailCollapsed: false,
    conversationRailWidth: conversationRailWidth.default,
  };

export function conversationGroupFor(
  conversation: Pick<ConversationDto, "kind">,
): ConversationGroup {
  if (conversation.kind === "team") return "teams";
  if (conversation.kind === "direct") return "people";
  return "rooms";
}

export function prioritizeConversations(
  conversations: readonly ConversationDto[],
): ConversationDto[] {
  return [...conversations].sort((left, right) => {
    const responsePriority =
      Number(right.needsResponseCount > 0) -
      Number(left.needsResponseCount > 0);
    if (responsePriority !== 0) return responsePriority;
    if (right.needsResponseCount !== left.needsResponseCount)
      return right.needsResponseCount - left.needsResponseCount;

    const unreadPriority =
      Number(right.unreadCount > 0) - Number(left.unreadCount > 0);
    if (unreadPriority !== 0) return unreadPriority;
    if (right.unreadCount !== left.unreadCount)
      return right.unreadCount - left.unreadCount;

    const leftActivity = Date.parse(left.lastMessageAt ?? left.updatedAt);
    const rightActivity = Date.parse(right.lastMessageAt ?? right.updatedAt);
    if (rightActivity !== leftActivity) return rightActivity - leftActivity;
    return left.title.localeCompare(right.title);
  });
}

export function clampConversationRailWidth(value: number): number {
  if (!Number.isFinite(value)) return conversationRailWidth.default;
  return Math.min(
    conversationRailWidth.maximum,
    Math.max(conversationRailWidth.minimum, Math.round(value)),
  );
}

export function liveConversationLayoutStorageKey({
  organizationId,
  userId,
  workspaceId,
}: {
  organizationId: string;
  userId: string;
  workspaceId: string;
}) {
  return [
    "trevv",
    "live-collaboration-layout",
    "v1",
    encodeURIComponent(organizationId),
    encodeURIComponent(userId),
    encodeURIComponent(workspaceId),
  ].join(":");
}

export function parseLiveConversationLayoutPreference(
  value: string | null,
): LiveConversationLayoutPreference {
  if (!value) return { ...defaultLiveConversationLayoutPreference };
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object")
      return { ...defaultLiveConversationLayoutPreference };
    const candidate = parsed as {
      conversationRailCollapsed?: unknown;
      conversationRailWidth?: unknown;
      version?: unknown;
    };
    if (candidate.version !== 1)
      return { ...defaultLiveConversationLayoutPreference };
    return {
      conversationRailCollapsed:
        typeof candidate.conversationRailCollapsed === "boolean"
          ? candidate.conversationRailCollapsed
          : false,
      conversationRailWidth:
        typeof candidate.conversationRailWidth === "number"
          ? clampConversationRailWidth(candidate.conversationRailWidth)
          : conversationRailWidth.default,
    };
  } catch {
    return { ...defaultLiveConversationLayoutPreference };
  }
}

export function collaborationQueryKeysForEvent(
  event: CollaborationEventDto,
): QueryKey[] {
  const keys: QueryKey[] = [collaborationKeys.unread(event.workspaceId)];
  if (event.type.startsWith("team.")) {
    keys.push(
      collaborationKeys.teams(event.workspaceId),
      collaborationKeys.conversations(event.workspaceId),
    );
  }
  if (event.type.startsWith("conversation.")) {
    keys.push(collaborationKeys.conversations(event.workspaceId));
  }
  if (event.conversationId) {
    keys.push(
      collaborationKeys.conversation(event.workspaceId, event.conversationId),
    );
  }
  if (
    event.conversationId &&
    (event.type.startsWith("message.") || event.type === "conversation.read")
  ) {
    keys.push(
      collaborationKeys.messages(event.workspaceId, event.conversationId),
      collaborationKeys.conversations(event.workspaceId),
    );
  }
  return uniqueQueryKeys(keys);
}

/** Coalesce a finite SSE batch into one refresh per affected active query. */
export function createCollaborationInvalidationBatch(queryClient: QueryClient) {
  const pending = new Map<string, QueryKey>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    const keys = [...pending.values()];
    pending.clear();
    if (!keys.length) return;
    void queryClient.invalidateQueries({
      predicate: (query) =>
        keys.some((key) =>
          key.every((part, index) => part === query.queryKey[index]),
        ),
    });
  };
  return {
    add(keys: readonly QueryKey[]) {
      for (const key of keys) pending.set(JSON.stringify(key), key);
      timer ??= setTimeout(flush, 32);
    },
    flush,
    dispose() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      pending.clear();
    },
  };
}

export function mergeConversationMessagePages(
  pages: readonly PaginatedConversationMessages[] | undefined,
): ConversationMessageDto[] {
  const byId = new Map<string, ConversationMessageDto>();
  for (const page of pages ?? []) {
    for (const message of page.data) byId.set(message.id, message);
  }
  return [...byId.values()].sort(
    (left, right) =>
      left.sequence - right.sequence || left.id.localeCompare(right.id),
  );
}

export function liveMessageDraftStorageKey({
  organizationId,
  userId,
  conversationId,
}: {
  organizationId: string;
  userId: string;
  conversationId: string;
}) {
  return liveDraftStorageKey({
    organizationId,
    userId,
    scope: `message:${conversationId}`,
  });
}

export function liveConversationMessageFilters(
  cursor: string,
  parentMessageId?: string,
) {
  return {
    ...(cursor ? { cursor } : {}),
    ...(parentMessageId ? { parentMessageId } : {}),
    limit: 50,
  };
}

export function useLiveTeamDirectory(
  workspaceId: string | undefined,
  enabled = true,
) {
  // Query keys retain background data within one scope. Cross-key placeholders
  // would put another workspace's records under the newly selected heading.
  const { client } = useLiveAppData();
  return useQuery({
    queryKey: collaborationKeys.teams(workspaceId ?? "unavailable"),
    queryFn: ({ signal }) =>
      client.withSignal(signal).teamDirectory(workspaceId!),
    enabled: enabled && Boolean(workspaceId),
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function useLiveConversations(
  workspaceId: string | undefined,
  enabled = true,
) {
  const { client } = useLiveAppData();
  return useQuery({
    queryKey: collaborationKeys.conversations(workspaceId ?? "unavailable"),
    queryFn: ({ signal }) =>
      fetchEveryConversation(client.withSignal(signal), workspaceId!),
    enabled: enabled && Boolean(workspaceId),
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function useLiveConversation(
  workspaceId: string | undefined,
  conversationId: string | undefined,
) {
  const { client } = useLiveAppData();
  return useQuery({
    queryKey: collaborationKeys.conversation(
      workspaceId ?? "unavailable",
      conversationId ?? "unavailable",
    ),
    queryFn: ({ signal }) =>
      client.withSignal(signal).conversation(conversationId!),
    enabled: Boolean(workspaceId && conversationId),
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });
}

export function useLiveConversationMessages(
  workspaceId: string | undefined,
  conversationId: string | undefined,
  options: { enabled?: boolean; parentMessageId?: string } = {},
) {
  const { client } = useLiveAppData();
  return useInfiniteQuery({
    queryKey: collaborationKeys.messages(
      workspaceId ?? "unavailable",
      conversationId ?? "unavailable",
      options.parentMessageId,
    ),
    queryFn: ({ pageParam, signal }) =>
      client
        .withSignal(signal)
        .conversationMessages(
          conversationId!,
          liveConversationMessageFilters(pageParam, options.parentMessageId),
        ),
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled:
      options.enabled !== false && Boolean(workspaceId && conversationId),
    refetchInterval: 4_000,
    refetchIntervalInBackground: false,
  });
}

/**
 * The event stream carries invalidation metadata only. HTTP queries remain the
 * authority and continue polling, so an interrupted stream cannot strand a
 * second browser on stale collaboration data.
 */
export function LiveCollaborationEventBridge({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    let eventCursors = cursorsByClient.get(queryClient);
    if (!eventCursors) {
      eventCursors = new Map();
      cursorsByClient.set(queryClient, eventCursors);
    }
    const cursors = eventCursors;
    let source: EventSource | null = null;
    let reconnectTimer: number | undefined;
    let disposed = false;
    const invalidations = createCollaborationInvalidationBatch(queryClient);

    const scheduleReconnect = (delay = 2_500) => {
      if (disposed || document.hidden || reconnectTimer !== undefined) return;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = undefined;
        connect();
      }, delay);
    };

    const connect = () => {
      if (disposed || document.hidden) return;
      const url = new URL("/api/v1/events", window.location.origin);
      url.searchParams.set("workspaceId", workspaceId);
      url.searchParams.set("after", String(cursors.get(workspaceId) ?? 0));
      source = new EventSource(url);

      const receive = (rawEvent: MessageEvent<string>) => {
        const parsed = parseCollaborationEvent(rawEvent.data);
        if (!parsed) {
          if (rawEvent.type === "reset") {
            invalidations.add([collaborationKeys.workspace(workspaceId)]);
          }
          return;
        }
        if (parsed.cursor <= (cursors.get(workspaceId) ?? 0)) return;
        cursors.set(workspaceId, parsed.cursor);
        invalidations.add(collaborationQueryKeysForEvent(parsed));
      };
      const checkpoint = (rawEvent: MessageEvent<string>) => {
        invalidations.flush();
        const cursor = parseCheckpointCursor(rawEvent.data);
        if (cursor !== null)
          cursors.set(
            workspaceId,
            Math.max(cursor, cursors.get(workspaceId) ?? 0),
          );
        source?.close();
        source = null;
        scheduleReconnect(2_000);
      };

      source.onmessage = receive;
      source.onerror = () => {
        source?.close();
        source = null;
        scheduleReconnect();
      };
      source.addEventListener("collaboration", receive as EventListener);
      source.addEventListener("checkpoint", checkpoint as EventListener);
      for (const eventType of collaborationEventNames) {
        source.addEventListener(eventType, receive as EventListener);
      }
      source.addEventListener("reset", receive as EventListener);
    };

    const visibilityChanged = () => {
      if (document.hidden) {
        source?.close();
        source = null;
        if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
        invalidations.dispose();
        return;
      }
      // HTTP remains authoritative after a hidden interval; the stream is only
      // a freshness hint and never grants access from an old event cursor.
      void Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ["live-app-access"] }),
        queryClient.invalidateQueries({
          queryKey: collaborationKeys.workspace(workspaceId),
        }),
      ]).then(() => {
        if (!disposed && !document.hidden && !source) connect();
      });
    };
    document.addEventListener("visibilitychange", visibilityChanged);
    connect();
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", visibilityChanged);
      invalidations.dispose();
      source?.close();
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
    };
  }, [queryClient, workspaceId]);

  return null;
}

export function useLiveConversationUnread(workspaceId: string) {
  const { client } = useLiveAppData();
  const unsupported = useRef(false);
  return useQuery({
    queryKey: collaborationKeys.unread(workspaceId),
    queryFn: async ({ signal }) => {
      const reader = client.withSignal(signal);
      if (!unsupported.current) {
        try {
          return (await reader.conversationUnread(workspaceId)).unreadCount;
        } catch (error) {
          if (
            !(error instanceof TrevvApiError) ||
            ![404, 405, 501].includes(error.status)
          )
            throw error;
          unsupported.current = true;
        }
      }
      const conversations = await readAllPages((cursor) =>
        reader.conversations({
          workspaceId,
          ...(cursor ? { cursor } : {}),
          limit: 100,
        }),
      );
      return conversations.reduce(
        (total, conversation) => total + conversation.unreadCount,
        0,
      );
    },
    enabled: Boolean(workspaceId),
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });
}

export function LiveUnreadBadge({ workspaceId }: { workspaceId: string }) {
  const query = useLiveConversationUnread(workspaceId);
  if (
    query.error instanceof TrevvApiError &&
    [401, 403, 404].includes(query.error.status)
  )
    return null;
  const unread = query.data ?? 0;
  if (unread < 1) return null;
  return (
    <span className="nav-badge" aria-label={`${unread} unread messages`}>
      {unread > 99 ? "99+" : unread}
    </span>
  );
}

/** Focus trap shared by live collaboration dialogs and responsive drawers. */
export function useAccessibleDialog<T extends HTMLElement = HTMLDivElement>(
  onClose: () => void,
  returnFocusRef?: RefObject<HTMLElement | null>,
): RefObject<T | null> {
  const dialogRef = useRef<T>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const returnFocusTarget = returnFocusRef?.current ?? previouslyFocused;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = focusableElements(dialog);
    (focusable[0] ?? dialog).focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const current = focusableElements(dialog);
      if (current.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = current[0]!;
      const last = current[current.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      // WebKit does not consistently focus a button after a pointer click, so
      // callers with a known trigger must not rely on activeElement alone.
      returnFocusTarget?.focus();
    };
  }, [returnFocusRef]);

  return dialogRef;
}

function parseCollaborationEvent(value: string) {
  try {
    return collaborationEventSchema.safeParse(JSON.parse(value)).data ?? null;
  } catch {
    return null;
  }
}

function parseCheckpointCursor(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    const cursor = (parsed as { nextCursor?: unknown }).nextCursor;
    return typeof cursor === "number" && Number.isInteger(cursor) && cursor >= 0
      ? cursor
      : null;
  } catch {
    return null;
  }
}

async function fetchEveryConversation(
  client: ReturnType<typeof useLiveAppData>["client"],
  workspaceId: string,
) {
  return readAllPages((cursor) =>
    client.conversations({
      workspaceId,
      ...(cursor ? { cursor } : {}),
      limit: 100,
    }),
  );
}

function uniqueQueryKeys(keys: readonly QueryKey[]) {
  const seen = new Set<string>();
  return keys.filter((key) => {
    const fingerprint = JSON.stringify(key);
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

function focusableElements(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>(focusableSelector)].filter(
    (element) =>
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.getClientRects().length > 0,
  );
}

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const collaborationEventNames = [
  "team.created",
  "team.updated",
  "team.membership_changed",
  "conversation.created",
  "conversation.participants_changed",
  "message.sent",
  "message.response_changed",
  "message.reaction_changed",
  "conversation.read",
] as const;
