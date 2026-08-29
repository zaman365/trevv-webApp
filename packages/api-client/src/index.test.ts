import { describe, expect, it, vi } from "vitest";
import { createApiClient, TrevvApiError } from "./index";

const timestamp = "2026-08-29T12:00:00.000Z";
const idempotencyKey = "81111111-1111-4111-8111-111111111111";

const workspace = {
  id: "workspace-1",
  portfolioId: "portfolio-1",
  slug: "example-workspace",
  name: "Example Workspace",
  description: "Durable work",
  icon: "E",
  accent: "#334455",
  type: "project",
  stage: "build",
  health: "on_track",
  healthNote: "",
  priority: "Ship",
  metrics: [],
  versionTag: timestamp,
  updatedAt: timestamp,
} as const;

const board = {
  id: "board-1",
  workspaceId: workspace.id,
  name: "Example Board",
  description: "",
  templateKey: "trevv_default",
  visibility: "private",
  progressMode: "task_completion",
  ordering: 0,
  versionTag: timestamp,
  createdAt: timestamp,
  updatedAt: timestamp,
} as const;

const item = {
  id: "item-1",
  workspaceId: workspace.id,
  boardId: board.id,
  title: "Choose the release path",
  description: "Record the decision.",
  type: "decision",
  priority: "high",
  status: "working",
  assignees: [{ id: "user-1", name: "Owner" }],
  decisionState: "needed",
  version: 4,
  createdAt: timestamp,
  updatedAt: timestamp,
} as const;

describe("Phase 3 API client", () => {
  it("parses atomic Workspace creation and forwards idempotency", async () => {
    const fetchMock = vi.fn(
      async (_input: Parameters<typeof fetch>[0], _init?: RequestInit) =>
        Response.json(
          { workspace, board },
          {
            status: 201,
            headers: {
              "idempotency-key": idempotencyKey,
              "idempotency-replayed": "false",
            },
          },
        ),
    );
    const client = createApiClient({
      baseUrl: "https://api.example.test/api/v1",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const result = await client.createWorkspace(
      {
        portfolioId: workspace.portfolioId,
        name: workspace.name,
        slug: workspace.slug,
        description: workspace.description,
        type: workspace.type,
        accent: workspace.accent,
        icon: workspace.icon,
        stage: workspace.stage,
        health: workspace.health,
        healthNote: "",
        priority: workspace.priority,
        initialBoardName: board.name,
      },
      idempotencyKey,
    );

    expect(result).toMatchObject({
      data: { workspace: { id: workspace.id }, board: { id: board.id } },
      idempotencyKey,
      replayed: false,
    });
    const requestHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(requestHeaders.get("idempotency-key")).toBe(idempotencyKey);
  });

  it("binds Waiting creation to the canonical WorkItem ETag", async () => {
    const fetchMock = vi.fn(
      async (_input: Parameters<typeof fetch>[0], _init?: RequestInit) =>
        Response.json(
          {
            id: "waiting-1",
            organizationId: "org-1",
            portfolioId: workspace.portfolioId,
            workspaceId: workspace.id,
            entityType: "work_item",
            entityId: item.id,
            title: "Wait for counsel",
            waitingType: "person",
            waitingSince: "2026-08-29",
            followUpOwnerId: "user-1",
            followUpOwnerName: "Owner",
            version: 0,
          },
          {
            status: 201,
            headers: {
              etag: '"0"',
              "idempotency-key": idempotencyKey,
              "idempotency-replayed": "false",
            },
          },
        ),
    );
    const client = createApiClient({
      baseUrl: "https://api.example.test/api/v1",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await client.createWaiting(
      {
        workspaceId: workspace.id,
        entityType: "work_item",
        entityId: item.id,
        title: "Wait for counsel",
        waitingType: "person",
        followUpOwnerId: "user-1",
      },
      item.version,
      idempotencyKey,
    );

    const requestHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(requestHeaders.get("if-match")).toBe('"4"');
    expect(requestHeaders.get("idempotency-key")).toBe(idempotencyKey);
  });

  it("checks transition ETags against the nested WorkItem version", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(
        {
          item: { ...item, decisionState: "decided", version: 5 },
          evidence: {
            id: "event-1",
            itemId: item.id,
            author: { id: "user-1", name: "Owner" },
            body: "The live evidence supports option A.",
            evidence: true,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          attentionRefreshQueued: true,
        },
        {
          headers: {
            etag: '"5"',
            "idempotency-key": idempotencyKey,
            "idempotency-replayed": "true",
          },
        },
      ),
    ) as unknown as typeof fetch;
    const client = createApiClient({
      baseUrl: "https://api.example.test/api/v1",
      fetchImpl,
    });

    await expect(
      client.transitionDecision(
        item.id,
        {
          state: "decided",
          rationale: "Option A best fits the evidence.",
          evidence: "The live evidence supports option A.",
        },
        item.version,
        idempotencyKey,
      ),
    ).resolves.toMatchObject({
      etag: '"5"',
      replayed: true,
      data: { item: { version: 5, decisionState: "decided" } },
    });
  });

  it("preserves typed 429 error details", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(
        {
          error: {
            code: "rate_limited",
            message: "Retry later.",
            requestId: "request-1",
            details: { retryAfterSeconds: 23 },
          },
        },
        { status: 429, headers: { "retry-after": "23" } },
      ),
    ) as unknown as typeof fetch;
    const client = createApiClient({
      baseUrl: "https://api.example.test/api/v1",
      fetchImpl,
    });

    const error = await client
      .operationStatus()
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TrevvApiError);
    expect(error).toMatchObject({
      code: "rate_limited",
      status: 429,
      details: { retryAfterSeconds: 23 },
    });
  });
});

describe("Phase 5 privacy API client", () => {
  it("submits a reviewed request without claiming completion", async () => {
    const request = {
      id: "privacy-request-1",
      organizationId: "org-1",
      requestedBy: "user-1",
      subjectUserId: "user-1",
      kind: "portability" as const,
      scope: "user" as const,
      status: "submitted" as const,
      dueAt: "2026-09-28T12:00:00.000Z",
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const fetchMock = vi.fn(
      async (_input: Parameters<typeof fetch>[0], _init?: RequestInit) =>
        Response.json(request, {
          status: 202,
          headers: {
            etag: '"1"',
            "idempotency-key": idempotencyKey,
            "idempotency-replayed": "false",
          },
        }),
    );
    const client = createApiClient({
      baseUrl: "https://api.example.test/api/v1",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const result = await client.createPrivacyRequest(
      { kind: "portability", scope: "user" },
      idempotencyKey,
    );
    expect(result).toMatchObject({
      data: { status: "submitted" },
      etag: '"1"',
      replayed: false,
    });
    expect("completedAt" in result.data).toBe(false);
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("idempotency-key")).toBe(idempotencyKey);
  });

  it("binds cancellation to both ETag and an idempotency key", async () => {
    const fetchMock = vi.fn(
      async (_input: Parameters<typeof fetch>[0], _init?: RequestInit) =>
        Response.json(
          {
            id: "privacy-request-1",
            organizationId: "org-1",
            requestedBy: "user-1",
            subjectUserId: "user-1",
            kind: "access",
            scope: "user",
            status: "cancelled",
            dueAt: "2026-09-28T12:00:00.000Z",
            cancelledAt: timestamp,
            version: 2,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          {
            headers: {
              etag: '"2"',
              "idempotency-key": idempotencyKey,
              "idempotency-replayed": "false",
            },
          },
        ),
    );
    const client = createApiClient({
      baseUrl: "https://api.example.test/api/v1",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await client.cancelPrivacyRequest("privacy-request-1", 1, idempotencyKey);
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("if-match")).toBe('"1"');
    expect(headers.get("idempotency-key")).toBe(idempotencyKey);
  });
});

describe("Phase 4 collaboration API client", () => {
  const collaborationUser = {
    id: "user-1",
    email: "owner@example.test",
    name: "Owner",
    organizationRole: "owner" as const,
  };
  const team = {
    id: "team-1",
    organizationId: "org-1",
    portfolioId: workspace.portfolioId,
    workspaceId: workspace.id,
    name: "Technology",
    purpose: "Ship the product",
    preset: "technology" as const,
    featureCapabilities: ["work", "messages"] as const,
    featurePolicySource: "preset" as const,
    members: [
      { user: collaborationUser, role: "lead" as const, joinedAt: timestamp },
    ],
    room: {
      conversationId: "conversation-1",
      title: "Technology",
      unreadCount: 0,
    },
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  it("binds Team membership changes to Team ETags", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        { ...team, version: 2 },
        {
          headers: {
            etag: '"2"',
            "idempotency-key": idempotencyKey,
            "idempotency-replayed": "false",
          },
        },
      ),
    );
    const client = createApiClient({
      baseUrl: "https://api.example.test/api/v1",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(
      client.setTeamMember(
        team.id,
        "user-2",
        { role: "member" },
        team.version,
        idempotencyKey,
      ),
    ).resolves.toMatchObject({ data: { version: 2 }, etag: '"2"' });
    const [url, init] =
      (fetchMock.mock.calls as unknown as Parameters<typeof fetch>[])[0] ?? [];
    expect(String(url)).toContain("/teams/team-1/members/user-2");
    const headers = new Headers(init?.headers);
    expect(headers.get("if-match")).toBe('"1"');
    expect(headers.get("idempotency-key")).toBe(idempotencyKey);
  });

  it("binds room participant changes to the Conversation ETag", async () => {
    const conversation = {
      id: "conversation-1",
      organizationId: "org-1",
      portfolioId: workspace.portfolioId,
      workspaceId: workspace.id,
      title: "Launch room",
      purpose: "Coordinate the launch",
      kind: "workspace" as const,
      visibility: "private" as const,
      participants: [
        {
          user: collaborationUser,
          participantRole: "owner" as const,
          notificationLevel: "all" as const,
          joinedAt: timestamp,
        },
      ],
      unreadCount: 0,
      needsResponseCount: 0,
      retentionDays: 365,
      lastMessageAt: timestamp,
      version: 2,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const fetchMock = vi.fn(async () =>
      Response.json(conversation, {
        headers: {
          etag: '"2"',
          "idempotency-key": idempotencyKey,
          "idempotency-replayed": "false",
        },
      }),
    );
    const client = createApiClient({
      baseUrl: "https://api.example.test/api/v1",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(
      client.setConversationParticipant(
        conversation.id,
        "user-2",
        1,
        idempotencyKey,
        "owner",
      ),
    ).resolves.toMatchObject({ data: { version: 2 }, etag: '"2"' });
    const [url, init] =
      (fetchMock.mock.calls as unknown as Parameters<typeof fetch>[])[0] ?? [];
    expect(String(url)).toContain(
      "/conversations/conversation-1/participants/user-2",
    );
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({
      participantRole: "owner",
    });
    const headers = new Headers(init?.headers);
    expect(headers.get("if-match")).toBe('"1"');
    expect(headers.get("idempotency-key")).toBe(idempotencyKey);
  });

  it("sends a client-identified message for exact retry", async () => {
    const message = {
      id: "message-1",
      sequence: 1,
      clientMessageId: "71111111-1111-4111-8111-111111111111",
      organizationId: "org-1",
      conversationId: team.room.conversationId,
      senderId: collaborationUser.id,
      sender: collaborationUser,
      body: "Coordinate the release.",
      intent: "message" as const,
      metadata: {},
      reactions: [],
      retainedUntil: "2027-08-29T12:00:00.000Z",
      version: 1,
      createdAt: timestamp,
    };
    const fetchMock = vi.fn(async () =>
      Response.json(message, {
        status: 201,
        headers: {
          etag: '"1"',
          "idempotency-key": idempotencyKey,
          "idempotency-replayed": "true",
        },
      }),
    );
    const client = createApiClient({
      baseUrl: "https://api.example.test/api/v1",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(
      client.sendConversationMessage(
        team.room.conversationId,
        {
          clientMessageId: message.clientMessageId,
          body: message.body,
          intent: "message",
          metadata: {},
        },
        idempotencyKey,
      ),
    ).resolves.toMatchObject({
      replayed: true,
      data: { clientMessageId: message.clientMessageId },
    });
  });

  it("requests an authoritative page for one message thread", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ data: [], nextCursor: null }),
    );
    const client = createApiClient({
      baseUrl: "https://api.example.test/api/v1",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(
      client.conversationMessages("conversation-1", {
        cursor: "older-page",
        limit: 25,
        parentMessageId: "message-root",
      }),
    ).resolves.toEqual({ data: [], nextCursor: null });
    const [requested] =
      (fetchMock.mock.calls as unknown as Parameters<typeof fetch>[])[0] ?? [];
    const url = new URL(String(requested));
    expect(url.pathname).toBe("/api/v1/conversations/conversation-1/messages");
    expect(url.searchParams.get("cursor")).toBe("older-page");
    expect(url.searchParams.get("limit")).toBe("25");
    expect(url.searchParams.get("parentMessageId")).toBe("message-root");
  });
});
