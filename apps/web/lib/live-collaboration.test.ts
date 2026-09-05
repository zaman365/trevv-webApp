import { QueryClient, QueryObserver } from "@tanstack/react-query";
import type {
  CollaborationEventDto,
  ConversationDto,
  ConversationMessageDto,
  PaginatedConversationMessages,
} from "@founderhq/api-contract";
import { describe, expect, it, vi } from "vitest";
import {
  clampConversationRailWidth,
  collaborationKeys,
  createCollaborationInvalidationBatch,
  collaborationQueryKeysForEvent,
  conversationRailWidth,
  conversationGroupFor,
  liveConversationLayoutStorageKey,
  liveConversationMessageFilters,
  liveMessageDraftStorageKey,
  mergeConversationMessagePages,
  parseLiveConversationLayoutPreference,
  prioritizeConversations,
} from "./live-collaboration";

describe("live collaboration query organization", () => {
  it("keeps Teams, Rooms, and People explicit", () => {
    expect(conversationGroupFor({ kind: "team" })).toBe("teams");
    expect(conversationGroupFor({ kind: "workspace" })).toBe("rooms");
    expect(conversationGroupFor({ kind: "external" })).toBe("rooms");
    expect(conversationGroupFor({ kind: "direct" })).toBe("people");
  });

  it("invalidates Team rooms when Team membership changes", () => {
    const event: CollaborationEventDto = {
      cursor: 23,
      organizationId: "organization-alpha",
      workspaceId: "workspace-alpha",
      type: "team.membership_changed",
      aggregateType: "team",
      aggregateId: "team-marketing",
      teamId: "team-marketing",
      conversationId: "conversation-team-marketing",
      occurredAt: "2026-08-29T09:00:00.000Z",
    };

    expect(collaborationQueryKeysForEvent(event)).toEqual([
      collaborationKeys.teams("workspace-alpha"),
      collaborationKeys.conversations("workspace-alpha"),
      collaborationKeys.conversation(
        "workspace-alpha",
        "conversation-team-marketing",
      ),
    ]);
  });

  it("invalidates the message feed and unread summaries for new messages", () => {
    const event: CollaborationEventDto = {
      cursor: 24,
      organizationId: "organization-alpha",
      workspaceId: "workspace-alpha",
      type: "message.sent",
      aggregateType: "message",
      aggregateId: "message-24",
      conversationId: "conversation-ops",
      occurredAt: "2026-08-29T09:01:00.000Z",
    };

    expect(collaborationQueryKeysForEvent(event)).toEqual([
      collaborationKeys.conversation("workspace-alpha", "conversation-ops"),
      collaborationKeys.messages("workspace-alpha", "conversation-ops"),
      collaborationKeys.conversations("workspace-alpha"),
    ]);
  });
});

describe("live message pagination and drafts", () => {
  it("keeps the root feed as the invalidation prefix for thread replies", () => {
    const root = collaborationKeys.messages(
      "workspace-alpha",
      "conversation-ops",
    );
    const thread = collaborationKeys.messages(
      "workspace-alpha",
      "conversation-ops",
      "message-parent",
    );

    expect(thread).not.toEqual(root);
    expect(thread.slice(0, root.length)).toEqual(root);
    expect(thread.at(-1)).toBe("message-parent");
  });

  it("sends the parent filter only for an authoritative thread page", () => {
    expect(liveConversationMessageFilters("", undefined)).toEqual({
      limit: 50,
    });
    expect(
      liveConversationMessageFilters("older-replies", "message-parent"),
    ).toEqual({
      cursor: "older-replies",
      parentMessageId: "message-parent",
      limit: 50,
    });
  });

  it("deduplicates replayed pages and orders messages by server sequence", () => {
    const second = message("message-2", 2);
    const first = message("message-1", 1);
    const updatedSecond = {
      ...second,
      body: "Server-updated body",
      version: 2,
    };
    const pages: PaginatedConversationMessages[] = [
      { data: [second], nextCursor: "older" },
      { data: [first, updatedSecond], nextCursor: null },
    ];

    expect(
      mergeConversationMessagePages(pages).map((entry) => ({
        id: entry.id,
        body: entry.body,
      })),
    ).toEqual([
      { id: "message-1", body: "Message 1" },
      { id: "message-2", body: "Server-updated body" },
    ]);
  });

  it("scopes recoverable drafts to organization, user, and conversation", () => {
    const first = liveMessageDraftStorageKey({
      organizationId: "organization-alpha",
      userId: "user-one",
      conversationId: "conversation-one",
    });
    const second = liveMessageDraftStorageKey({
      organizationId: "organization-alpha",
      userId: "user-two",
      conversationId: "conversation-one",
    });
    const third = liveMessageDraftStorageKey({
      organizationId: "organization-alpha",
      userId: "user-one",
      conversationId: "conversation-two",
    });

    expect(new Set([first, second, third]).size).toBe(3);
    expect(first).toContain("live-draft");
    expect(first).not.toContain("message body");
  });
});

describe("live conversation navigation preferences", () => {
  it("bounds persisted rail widths and rejects malformed preferences", () => {
    expect(clampConversationRailWidth(100)).toBe(conversationRailWidth.minimum);
    expect(clampConversationRailWidth(1_000)).toBe(
      conversationRailWidth.maximum,
    );
    expect(clampConversationRailWidth(Number.NaN)).toBe(
      conversationRailWidth.default,
    );
    expect(
      parseLiveConversationLayoutPreference(
        JSON.stringify({
          version: 1,
          conversationRailCollapsed: true,
          conversationRailWidth: 320.4,
        }),
      ),
    ).toEqual({
      conversationRailCollapsed: true,
      conversationRailWidth: 320,
    });
    expect(parseLiveConversationLayoutPreference("not json")).toEqual({
      conversationRailCollapsed: false,
      conversationRailWidth: conversationRailWidth.default,
    });
  });

  it("namespaces layout preferences by tenant, user, and workspace", () => {
    const first = liveConversationLayoutStorageKey({
      organizationId: "organization-alpha",
      userId: "user-one",
      workspaceId: "workspace-one",
    });
    const second = liveConversationLayoutStorageKey({
      organizationId: "organization-alpha",
      userId: "user-two",
      workspaceId: "workspace-one",
    });
    const third = liveConversationLayoutStorageKey({
      organizationId: "organization-alpha",
      userId: "user-one",
      workspaceId: "workspace-two",
    });

    expect(new Set([first, second, third]).size).toBe(3);
    expect(first).toContain("live-collaboration-layout");
  });

  it("places needs-response and unread work ahead of chronology", () => {
    const ordinary = conversation("ordinary", {
      lastMessageAt: "2026-08-29T12:00:00.000Z",
    });
    const unread = conversation("unread", {
      lastMessageAt: "2026-08-29T10:00:00.000Z",
      unreadCount: 2,
    });
    const needsResponse = conversation("needs-response", {
      lastMessageAt: "2026-08-29T09:00:00.000Z",
      needsResponseCount: 1,
    });

    expect(
      prioritizeConversations([ordinary, unread, needsResponse]).map(
        (entry) => entry.id,
      ),
    ).toEqual(["needs-response", "unread", "ordinary"]);
  });
});

function message(id: string, sequence: number): ConversationMessageDto {
  return {
    id,
    sequence,
    clientMessageId: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    organizationId: "organization-alpha",
    conversationId: "conversation-ops",
    senderId: "user-one",
    sender: {
      id: "user-one",
      email: "one@example.test",
      name: "User One",
      organizationRole: "member",
    },
    body: `Message ${sequence}`,
    intent: "message",
    metadata: {},
    reactions: [],
    retainedUntil: "2027-08-29T09:00:00.000Z",
    version: 1,
    createdAt: `2026-08-29T09:0${sequence}:00.000Z`,
  };
}

function conversation(
  id: string,
  overrides: Partial<ConversationDto> = {},
): ConversationDto {
  return {
    id,
    organizationId: "organization-alpha",
    portfolioId: "portfolio-alpha",
    workspaceId: "workspace-alpha",
    title: id,
    purpose: "",
    kind: "workspace",
    visibility: "organization",
    participants: [],
    unreadCount: 0,
    needsResponseCount: 0,
    retentionDays: 365,
    version: 1,
    createdAt: "2026-08-29T08:00:00.000Z",
    updatedAt: "2026-08-29T08:00:00.000Z",
    ...overrides,
  };
}

describe("collaboration event batching", () => {
  it("refetches each matching feed once for a burst, including reply feeds", async () => {
    vi.useFakeTimers();
    const client = new QueryClient();
    const queries = [
      collaborationKeys.messages("one", "room"),
      collaborationKeys.messages("one", "room", "parent"),
      collaborationKeys.conversations("one"),
      collaborationKeys.messages("two", "other"),
    ].map((queryKey) => {
      const queryFn = vi.fn(async () => ["updated"]);
      const observer = new QueryObserver(client, {
        queryKey,
        queryFn,
        initialData: ["initial"],
        staleTime: Infinity,
      });
      return { queryFn, unsubscribe: observer.subscribe(() => {}) };
    });
    const batch = createCollaborationInvalidationBatch(client);
    try {
      for (let index = 0; index < 100; index++) {
        batch.add([
          collaborationKeys.messages("one", "room"),
          collaborationKeys.conversations("one"),
        ]);
      }
      await vi.advanceTimersByTimeAsync(32);
      expect(queries.map(({ queryFn }) => queryFn.mock.calls.length)).toEqual([
        1, 1, 1, 0,
      ]);
      batch.add([collaborationKeys.workspace("one")]);
      batch.flush();
      await vi.advanceTimersByTimeAsync(0);
      expect(queries.map(({ queryFn }) => queryFn.mock.calls.length)).toEqual([
        2, 2, 2, 0,
      ]);
      batch.add([collaborationKeys.workspace("one")]);
      batch.dispose();
      await vi.advanceTimersByTimeAsync(100);
      expect(queries[0]!.queryFn).toHaveBeenCalledTimes(2);
    } finally {
      batch.dispose();
      queries.forEach(({ unsubscribe }) => unsubscribe());
      client.clear();
      vi.useRealTimers();
    }
  });
});
