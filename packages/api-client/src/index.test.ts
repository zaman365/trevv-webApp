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
