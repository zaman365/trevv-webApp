import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ConversationDto,
  ConversationMessageDto,
  CreateItemInput,
  TeamDto,
} from "@founderhq/api-contract";
import {
  createApiApp,
  createDemoApiApp,
  createRuntimeApi,
  createUnavailableLiveDependencies,
} from "./app";
import { DataPlaneError, type AccessResolver } from "./data-plane";

const fixedNow = new Date("2026-08-24T12:00:00.000Z");

function freshDemoApp() {
  let sequence = 0;
  return createDemoApiApp({
    clock: () => new Date(fixedNow),
    idGenerator: () => `generated-${++sequence}`,
  });
}

const itemInput: CreateItemInput = {
  workspaceId: "workspace-northstar",
  boardId: "b-northstar-launch",
  title: "Verify launch smoke test",
  description: "Run the durable launch-path checks.",
  type: "task",
  priority: "high",
  status: "working",
  assigneeIds: ["user-owner"],
};

const liveAccessResolver: AccessResolver = {
  mode: "live",
  async resolve() {
    return {
      access: {
        userId: "user-live",
        organizationId: "org-live",
        role: "owner",
        accessiblePortfolioIds: new Set(["portfolio-live"]),
        managedPortfolioIds: new Set(["portfolio-live"]),
        accessibleWorkspaceIds: new Set(["workspace-live"]),
        managedWorkspaceIds: new Set(["workspace-live"]),
      },
      session: {
        user: {
          id: "user-live",
          email: "live@example.test",
          name: "Live User",
          role: "owner",
          locale: "en",
        },
        organizationId: "org-live",
        organization: {
          id: "org-live",
          name: "Live Org",
          slug: "live-org",
          role: "owner",
          timezone: "Europe/Berlin",
        },
        availableOrganizations: [
          {
            id: "org-live",
            name: "Live Org",
            slug: "live-org",
            role: "owner",
          },
        ],
        managedWorkspaceIds: ["workspace-live"],
        expiresAt: "2026-08-30T12:00:00.000Z",
      },
    };
  },
};

const liveTeam: TeamDto = {
  id: "team-live",
  organizationId: "org-live",
  portfolioId: "portfolio-live",
  workspaceId: "workspace-live",
  name: "Technology",
  purpose: "Ship the product",
  preset: "technology",
  featureCapabilities: ["work", "messages"],
  featurePolicySource: "preset",
  members: [
    {
      user: {
        id: "user-live",
        email: "live@example.test",
        name: "Live User",
        organizationRole: "owner",
      },
      role: "lead",
      joinedAt: fixedNow.toISOString(),
    },
  ],
  room: {
    conversationId: "conversation-live",
    title: "Technology",
    unreadCount: 0,
  },
  version: 1,
  createdAt: fixedNow.toISOString(),
  updatedAt: fixedNow.toISOString(),
};

const liveConversation: ConversationDto = {
  id: "conversation-live",
  organizationId: "org-live",
  portfolioId: "portfolio-live",
  workspaceId: "workspace-live",
  title: "Launch room",
  purpose: "Coordinate launch work",
  kind: "workspace",
  visibility: "private",
  participants: [
    {
      user: {
        id: "user-live",
        email: "live@example.test",
        name: "Live User",
        organizationRole: "owner",
      },
      participantRole: "owner",
      notificationLevel: "all",
      joinedAt: fixedNow.toISOString(),
    },
  ],
  unreadCount: 0,
  needsResponseCount: 0,
  retentionDays: 365,
  lastMessageAt: fixedNow.toISOString(),
  version: 2,
  createdAt: fixedNow.toISOString(),
  updatedAt: fixedNow.toISOString(),
};

afterEach(() => vi.unstubAllEnvs());

describe("TREVV API v1 dependency boundaries", () => {
  it("requires an explicit coherent runtime mode and live configuration", async () => {
    vi.stubEnv("DEMO_MODE", "");
    expect(() => createRuntimeApi()).toThrow(
      "DEMO_MODE must be explicitly set to true or false.",
    );

    vi.stubEnv("DEMO_MODE", "false");
    vi.stubEnv("DATABASE_URL", "");
    expect(() => createRuntimeApi()).toThrow(
      "DATABASE_URL is required when DEMO_MODE=false.",
    );

    vi.stubEnv("DEMO_MODE", "true");
    const runtime = createRuntimeApi();
    const health = await runtime.app.request("/api/v1/health");
    expect(await health.json()).toMatchObject({ mode: "demo", status: "ok" });
    await runtime.close();
  });

  it("reports content-free data-plane readiness and fails closed", async () => {
    const demo = freshDemoApp();
    const demoReadiness = await demo.request("/api/v1/readyz");
    expect(demoReadiness.status).toBe(200);
    await expect(demoReadiness.json()).resolves.toMatchObject({
      status: "ready",
      mode: "demo",
      database: "not_applicable",
    });

    const live = createUnavailableLiveDependencies();
    const ready = createApiApp({
      mode: "live",
      accessResolver: live.accessResolver,
      dataPlane: {
        ...live.dataPlane,
        readiness: async () => ({ database: "ready" as const }),
      },
      clock: () => new Date(fixedNow),
    });
    const readyResponse = await ready.request("/api/v1/readyz");
    expect(readyResponse.status).toBe(200);
    await expect(readyResponse.json()).resolves.toEqual({
      status: "ready",
      service: "trevv-api",
      version: "v1",
      mode: "live",
      database: "ready",
      time: fixedNow.toISOString(),
    });

    const unavailable = createApiApp({
      mode: "live",
      ...live,
      clock: () => new Date(fixedNow),
    });
    const unavailableResponse = await unavailable.request("/api/v1/readyz");
    expect(unavailableResponse.status).toBe(503);
    await expect(unavailableResponse.json()).resolves.toEqual({
      status: "unavailable",
      service: "trevv-api",
      version: "v1",
      mode: "live",
      database: "unavailable",
      time: fixedNow.toISOString(),
    });
  });

  it("creates isolated demo adapters for each app instance", async () => {
    const firstApp = freshDemoApp();
    const secondApp = freshDemoApp();
    const created = await firstApp.request("/api/v1/items", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "11111111-1111-4111-8111-111111111111",
      },
      body: JSON.stringify(itemInput),
    });
    const createdId = ((await created.json()) as { id: string }).id;

    const firstItems = (await (
      await firstApp.request("/api/v1/items")
    ).json()) as { data: Array<{ id: string }> };
    const secondItems = (await (
      await secondApp.request("/api/v1/items")
    ).json()) as { data: Array<{ id: string }> };

    expect(firstItems.data.some((item) => item.id === createdId)).toBe(true);
    expect(secondItems.data.some((item) => item.id === createdId)).toBe(false);
  });

  it("rejects incoherent demo/live dependency combinations", () => {
    const live = createUnavailableLiveDependencies();
    expect(() =>
      createApiApp({
        mode: "demo",
        dataPlane: live.dataPlane,
        accessResolver: live.accessResolver,
      }),
    ).toThrow(/must match/);
  });

  it("does not make raw auth responses readable across browser origins", async () => {
    const webOrigin = "https://app.trevv.test";
    const app = createApiApp({
      mode: "live",
      ...createUnavailableLiveDependencies(),
      corsOrigin: webOrigin,
      authHandler: async () =>
        Response.json({
          session: { token: "raw-session-token" },
        }),
    });

    const authResponse = await app.request("/api/auth/get-session", {
      headers: { origin: webOrigin },
    });
    expect(authResponse.status).toBe(200);
    expect(authResponse.headers.get("access-control-allow-origin")).toBeNull();

    const apiResponse = await app.request("/api/v1/health", {
      headers: { origin: webOrigin },
    });
    expect(apiResponse.status).toBe(200);
    expect(apiResponse.headers.get("access-control-allow-origin")).toBe(
      webOrigin,
    );
  });

  it("never substitutes demo access or data in a live app", async () => {
    const app = createApiApp({
      mode: "live",
      ...createUnavailableLiveDependencies(),
    });
    const missingOrganization = await app.request("/api/v1/portfolios");
    expect(missingOrganization.status).toBe(503);
    expect(
      ((await missingOrganization.json()) as { error: { code: string } }).error
        .code,
    ).toBe("repository_unavailable");

    const unavailable = await app.request("/api/v1/portfolios", {
      headers: { "x-organization-id": "org-live" },
    });
    expect(unavailable.status).toBe(503);
    expect(
      ((await unavailable.json()) as { error: { code: string } }).error.code,
    ).toBe("repository_unavailable");
  });

  it("maps live transport failures to stable 401, 429, and 500 envelopes", async () => {
    const live = createUnavailableLiveDependencies();
    const anonymous = createApiApp({
      mode: "live",
      dataPlane: live.dataPlane,
      accessResolver: { mode: "live", resolve: async () => null },
    });
    const unauthenticated = await anonymous.request("/api/v1/portfolios");
    expect(unauthenticated.status).toBe(401);
    await expect(errorCode(unauthenticated)).resolves.toBe("unauthenticated");

    const accessResolver = {
      mode: "live" as const,
      async resolve() {
        return {
          access: {
            userId: "user-live",
            organizationId: "org-live",
            role: "owner" as const,
            accessiblePortfolioIds: new Set(["portfolio-live"]),
            managedPortfolioIds: new Set(["portfolio-live"]),
            accessibleWorkspaceIds: new Set(["workspace-live"]),
            managedWorkspaceIds: new Set(["workspace-live"]),
          },
          session: {
            user: {
              id: "user-live",
              email: "live@example.test",
              name: "Live User",
              role: "owner" as const,
              locale: "en" as const,
            },
            organizationId: "org-live",
            organization: {
              id: "org-live",
              name: "Live Org",
              slug: "live-org",
              role: "owner" as const,
              timezone: "Europe/Berlin",
            },
            availableOrganizations: [
              {
                id: "org-live",
                name: "Live Org",
                slug: "live-org",
                role: "owner" as const,
              },
            ],
            managedWorkspaceIds: ["workspace-live"],
            expiresAt: "2026-08-30T12:00:00.000Z",
          },
        };
      },
    };
    const rateLimited = createApiApp({
      mode: "live",
      accessResolver,
      dataPlane: {
        ...live.dataPlane,
        async listPortfolios() {
          throw new DataPlaneError(
            "rate_limited",
            "Retry this request later.",
            { retryAfterSeconds: 17 },
          );
        },
      },
    });
    const limited = await rateLimited.request("/api/v1/portfolios");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("17");
    await expect(errorCode(limited)).resolves.toBe("rate_limited");

    const broken = createApiApp({
      mode: "live",
      accessResolver,
      dataPlane: {
        ...live.dataPlane,
        async listPortfolios() {
          throw new Error("internal database detail");
        },
      },
    });
    const internal = await broken.request("/api/v1/portfolios");
    expect(internal.status).toBe(500);
    expect(await internal.json()).toMatchObject({
      error: {
        code: "internal_error",
        message: "TREVV could not complete that request.",
      },
    });
  });

  it("allows only verified cookie identities through exact pre-membership paths", async () => {
    const live = createUnavailableLiveDependencies();
    const verifiedIdentity = {
      authUserId: "auth-test",
      email: "verified@example.test",
      name: "Verified User",
      emailVerified: true,
      sessionId: "session-test",
      expiresAt: new Date("2026-08-30T12:00:00.000Z"),
    };
    const app = createApiApp({
      mode: "live",
      ...live,
      authIdentityResolver: {
        resolve: async () => verifiedIdentity,
      },
      preMembershipPaths: ["/api/v1/pre-membership"],
    });
    app.get("/api/v1/pre-membership", (context) =>
      context.json({ authUserId: context.get("authIdentity").authUserId }),
    );
    app.get("/api/v1/pre-membership/extra", (context) =>
      context.json({ reached: true }),
    );

    const allowed = await app.request("/api/v1/pre-membership");
    expect(allowed.status).toBe(200);
    await expect(allowed.json()).resolves.toEqual({ authUserId: "auth-test" });

    const similarButProtected = await app.request(
      "/api/v1/pre-membership/extra",
    );
    expect(similarButProtected.status).toBe(503);

    const unverified = createApiApp({
      mode: "live",
      ...live,
      authIdentityResolver: {
        resolve: async () => ({
          ...verifiedIdentity,
          emailVerified: false,
        }),
      },
      preMembershipPaths: ["/api/v1/pre-membership"],
    });
    unverified.get("/api/v1/pre-membership", (context) =>
      context.json({ reached: true }),
    );
    const rejected = await unverified.request("/api/v1/pre-membership");
    expect(rejected.status).toBe(403);
    await expect(errorCode(rejected)).resolves.toBe(
      "identity_verification_required",
    );
  });

  it("requires the configured Web origin for live cookie mutations", async () => {
    const live = createUnavailableLiveDependencies();
    const app = createApiApp({
      mode: "live",
      ...live,
      webOrigin: "https://app.trevv.test",
      authIdentityResolver: {
        resolve: async () => ({
          authUserId: "auth-origin-test",
          email: "origin@example.test",
          name: "Origin Test",
          emailVerified: true,
          sessionId: "session-origin-test",
          expiresAt: new Date("2026-08-30T12:00:00.000Z"),
        }),
      },
      preMembershipPaths: ["/api/v1/pre-membership-mutation"],
    });
    app.post("/api/v1/pre-membership-mutation", (context) =>
      context.json({ accepted: true }),
    );

    for (const origin of [undefined, "https://other.trevv.test"]) {
      const rejected = await app.request("/api/v1/pre-membership-mutation", {
        method: "POST",
        headers: {
          cookie: "trevv.session_token=opaque",
          ...(origin ? { origin } : {}),
        },
      });
      expect(rejected.status).toBe(403);
      await expect(errorCode(rejected)).resolves.toBe("invalid_request_origin");
    }

    const accepted = await app.request("/api/v1/pre-membership-mutation", {
      method: "POST",
      headers: {
        cookie: "trevv.session_token=opaque",
        origin: "https://app.trevv.test",
      },
    });
    expect(accepted.status).toBe(200);
    await expect(accepted.json()).resolves.toEqual({ accepted: true });

    const browserAccepted = await app.request(
      "/api/v1/pre-membership-mutation",
      {
        method: "POST",
        headers: {
          cookie: "trevv.session_token=opaque",
          "sec-fetch-site": "same-origin",
        },
      },
    );
    expect(browserAccepted.status).toBe(200);

    const conflictingSignals = await app.request(
      "/api/v1/pre-membership-mutation",
      {
        method: "POST",
        headers: {
          cookie: "trevv.session_token=opaque",
          origin: "https://other.trevv.test",
          "sec-fetch-site": "same-origin",
        },
      },
    );
    expect(conflictingSignals.status).toBe(403);
  });
});

describe("TREVV API v1 demo contract", () => {
  it("exposes organization timezone and canonical provenance fields", async () => {
    const app = freshDemoApp();
    const session = (await (await app.request("/api/v1/session")).json()) as {
      organization: { timezone?: string };
    };
    expect(session.organization.timezone).toBe("Europe/Berlin");

    const attention = (await (
      await app.request("/api/v1/attention")
    ).json()) as Array<{
      reasonCode?: string;
      sourceFingerprint?: string;
      computedAt?: string;
      sourceEvidence?: Array<{ data?: Record<string, unknown> }>;
    }>;
    expect(attention[0]).toMatchObject({
      reasonCode: expect.any(String),
      sourceFingerprint: expect.stringContaining("fictional-demo:"),
      computedAt: fixedNow.toISOString(),
      sourceEvidence: [{ data: { source: "fictional_demo_fixture" } }],
    });
  });

  it("serves Board and canonical WorkItem detail reads", async () => {
    const app = freshDemoApp();
    const boards = await app.request(
      "/api/v1/boards?workspaceId=workspace-northstar",
    );
    expect(boards.status).toBe(200);
    expect(await boards.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "b-northstar-launch",
          workspaceId: "workspace-northstar",
          versionTag: fixedNow.toISOString(),
        }),
      ]),
    );

    const items = (await (
      await app.request("/api/v1/items?workspaceId=workspace-northstar")
    ).json()) as { data: Array<{ id: string; version: number }> };
    const item = items.data[0];
    expect(item).toBeTruthy();
    const detail = await app.request(`/api/v1/items/${item!.id}`);
    expect(detail.status).toBe(200);
    expect(detail.headers.get("etag")).toBe(`"${item!.version}"`);
    expect(await detail.json()).toMatchObject({
      id: item!.id,
      description: expect.any(String),
      createdAt: fixedNow.toISOString(),
      updatedAt: fixedNow.toISOString(),
    });
  });

  it("round-trips blocking, evidence, history, and Waiting concurrency", async () => {
    const app = freshDemoApp();
    const created = await app.request("/api/v1/items", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "71111111-1111-4111-8111-111111111111",
      },
      body: JSON.stringify({ ...itemInput, title: "Golden path item" }),
    });
    const item = (await created.json()) as { id: string; version: number };

    const blocked = await app.request(`/api/v1/items/${item.id}/block`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "if-match": '"0"',
        "idempotency-key": "72222222-2222-4222-8222-222222222222",
      },
      body: JSON.stringify({ blocked: true, reason: "Waiting for evidence." }),
    });
    expect(blocked.status).toBe(200);
    expect(blocked.headers.get("etag")).toBe('"1"');
    expect(await blocked.json()).toMatchObject({
      item: { status: "blocked", version: 1 },
    });

    const evidence = await app.request(`/api/v1/items/${item.id}/evidence`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "if-match": '"1"',
        "idempotency-key": "73333333-3333-4333-8333-333333333333",
      },
      body: JSON.stringify({ body: "Vendor confirmed the dependency." }),
    });
    expect(evidence.status).toBe(201);
    expect(evidence.headers.get("etag")).toBe('"2"');

    const waiting = await app.request("/api/v1/waiting", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "if-match": '"2"',
        "idempotency-key": "74444444-4444-4444-8444-444444444444",
      },
      body: JSON.stringify({
        workspaceId: itemInput.workspaceId,
        entityType: "work_item",
        entityId: item.id,
        title: "Wait for vendor",
        waitingType: "vendor",
        followUpOwnerId: "user-owner",
        note: "Follow up tomorrow.",
      }),
    });
    expect(waiting.status).toBe(201);
    expect(waiting.headers.get("etag")).toBe('"0"');

    const staleWaiting = await app.request("/api/v1/waiting", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "if-match": '"2"',
        "idempotency-key": "75555555-5555-4555-8555-555555555555",
      },
      body: JSON.stringify({
        workspaceId: itemInput.workspaceId,
        entityType: "work_item",
        entityId: item.id,
        title: "Stale wait",
        waitingType: "vendor",
        followUpOwnerId: "user-owner",
      }),
    });
    expect(staleWaiting.status).toBe(409);
    expect(await errorCode(staleWaiting)).toBe("version_conflict");

    const history = await app.request(`/api/v1/items/${item.id}/history`);
    expect(await history.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reasonCode: "blocked" }),
        expect.objectContaining({ reasonCode: "evidence_added" }),
      ]),
    );
  });

  it("returns a Portfolio roll-up using the injected clock", async () => {
    const response = await freshDemoApp().request("/api/v1/portfolio");
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      asOf: string;
      workspaces: Array<{
        workspace: {
          progressMode?: unknown;
          metrics: Array<{ trend?: unknown }>;
        };
      }>;
      signals: { decisions: number; blocked: number };
    };
    expect(body.asOf).toBe(fixedNow.toISOString());
    expect(body.workspaces).toHaveLength(8);
    expect(
      body.workspaces.every(
        ({ workspace }) =>
          workspace.progressMode === undefined &&
          workspace.metrics.every(({ trend }) => trend === undefined),
      ),
    ).toBe(true);
    expect(body.signals.decisions).toBeGreaterThan(0);
    expect(body.signals.blocked).toBeGreaterThan(0);
  });

  it("uses a consistent, non-leaking not-found envelope", async () => {
    const response = await freshDemoApp().request(
      "/api/v1/workspaces/does-not-exist",
    );
    expect(response.status).toBe(404);
    const body = (await response.json()) as {
      error: { code: string; requestId: string; message: string };
    };
    expect(body.error.code).toBe("resource_not_found");
    expect(body.error.message).toBe("The requested resource is unavailable.");
    expect(body.error.requestId).toBeTruthy();
  });

  it("uses the canonical validation envelope for queries and malformed JSON", async () => {
    const app = freshDemoApp();
    for (const route of ["/api/v1/items?limit=0", "/api/v1/search?q=x"]) {
      const response = await app.request(route);
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({
        error: {
          code: "validation_error",
          message: expect.any(String),
          requestId: expect.any(String),
          details: { issues: expect.any(Object) },
        },
      });
    }

    const malformedBodies = [
      { route: "/api/v1/attention/attn-1", method: "PATCH" },
      { route: "/api/v1/waiting/waiting-1", method: "PATCH" },
      { route: "/api/v1/reviews/weekly", method: "POST" },
      { route: "/api/v1/import/preview", method: "POST" },
      { route: "/api/v1/items", method: "POST" },
      { route: "/api/v1/items/item-1", method: "PATCH" },
    ];
    for (const { route, method } of malformedBodies) {
      const response = await app.request(route, {
        method,
        headers: {
          "content-type": "application/json",
          "if-match": '"0"',
        },
        body: "{",
      });
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({
        error: { code: "validation_error", requestId: expect.any(String) },
      });
    }
  });

  it("replays the exact create status/result and rejects key reuse", async () => {
    const app = freshDemoApp();
    const key = "22222222-2222-4222-8222-222222222222";
    const create = (input: typeof itemInput) =>
      app.request("/api/v1/items", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": key,
        },
        body: JSON.stringify(input),
      });

    const first = await create(itemInput);
    const replay = await create(itemInput);
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(first.headers.get("idempotency-key")).toBe(key);
    expect(first.headers.get("idempotency-replayed")).toBe("false");
    expect(replay.headers.get("idempotency-replayed")).toBe("true");
    expect(await replay.json()).toEqual(await first.json());

    const conflict = await create({ ...itemInput, title: "Different request" });
    expect(conflict.status).toBe(409);
    expect(
      ((await conflict.json()) as { error: { code: string } }).error.code,
    ).toBe("idempotency_key_reused");
  });

  it("rejects impossible decision and approval state combinations", async () => {
    const app = freshDemoApp();
    for (const input of [
      { ...itemInput, decisionState: "needed" },
      { ...itemInput, type: "decision" as const },
      {
        ...itemInput,
        type: "approval" as const,
        approvalState: "pending" as const,
        decisionState: "needed" as const,
      },
    ]) {
      const response = await app.request("/api/v1/items", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify(input),
      });
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({
        error: { code: "validation_error" },
      });
    }
  });

  it("round-trips normalized assignees, version, and quoted ETags", async () => {
    const app = freshDemoApp();
    const created = await app.request("/api/v1/items", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "33333333-3333-4333-8333-333333333333",
      },
      body: JSON.stringify(itemInput),
    });
    const item = (await created.json()) as {
      id: string;
      version: number;
      assignees: Array<{ id: string; name: string }>;
    };
    expect(item.version).toBe(0);
    expect(item.assignees).toEqual([
      { id: "user-owner", name: "Mohammed Zaman" },
    ]);
    expect(created.headers.get("etag")).toBe('"0"');

    const missingPrecondition = await app.request(`/api/v1/items/${item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Updated" }),
    });
    expect(missingPrecondition.status).toBe(428);

    const invalidPrecondition = await app.request(`/api/v1/items/${item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "if-match": "0" },
      body: JSON.stringify({ title: "Updated" }),
    });
    expect(invalidPrecondition.status).toBe(422);

    const overflowPrecondition = await app.request(`/api/v1/items/${item.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "if-match": '"2147483648"',
      },
      body: JSON.stringify({ title: "Updated" }),
    });
    expect(overflowPrecondition.status).toBe(422);

    const updated = await app.request(`/api/v1/items/${item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "if-match": '"0"' },
      body: JSON.stringify({ title: "Updated", assigneeIds: [] }),
    });
    expect(updated.status).toBe(200);
    expect(updated.headers.get("etag")).toBe('"1"');
    expect(await updated.json()).toMatchObject({
      title: "Updated",
      assignees: [],
      version: 1,
    });

    const stale = await app.request(`/api/v1/items/${item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "if-match": '"0"' },
      body: JSON.stringify({ title: "Stale update" }),
    });
    expect(stale.status).toBe(409);
    expect(stale.headers.get("etag")).toBe('"1"');
    expect(await stale.json()).toMatchObject({
      error: { code: "version_conflict", details: { currentVersion: 1 } },
    });
  });

  it("binds PATCH idempotency to both the resource and expected version", async () => {
    const app = freshDemoApp();
    const create = async (title: string, key: string) => {
      const response = await app.request("/api/v1/items", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": key,
        },
        body: JSON.stringify({ ...itemInput, title }),
      });
      return (await response.json()) as { id: string };
    };
    const first = await create(
      "First idempotent target",
      "35555555-5555-4555-8555-555555555551",
    );
    const second = await create(
      "Second idempotent target",
      "35555555-5555-4555-8555-555555555552",
    );
    const patchKey = "35555555-5555-4555-8555-555555555553";
    const patch = (id: string, version: number) =>
      app.request(`/api/v1/items/${id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "idempotency-key": patchKey,
          "if-match": `"${version}"`,
        },
        body: JSON.stringify({ title: "Same patch body" }),
      });

    expect((await patch(first.id, 0)).status).toBe(200);
    const otherResource = await patch(second.id, 0);
    expect(otherResource.status).toBe(409);
    expect(
      ((await otherResource.json()) as { error: { code: string } }).error.code,
    ).toBe("idempotency_key_reused");
    const otherVersion = await patch(first.id, 1);
    expect(otherVersion.status).toBe(409);
  });

  it("includes versions and ETags on mutable Attention resources", async () => {
    const app = freshDemoApp();
    const list = await app.request(
      "/api/v1/attention?portfolioId=portfolio-demo",
    );
    const signal = (
      (await list.json()) as Array<{ id: string; version: number }>
    )[0];
    expect(signal?.version).toBe(0);

    const resolved = await app.request(`/api/v1/attention/${signal?.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "if-match": '"0"' },
      body: JSON.stringify({ action: "resolve" }),
    });
    expect(resolved.status).toBe(200);
    expect(resolved.headers.get("etag")).toBe('"1"');
    expect(await resolved.json()).toMatchObject({ version: 1 });
  });

  it("includes versions and ETags on mutable Waiting resources", async () => {
    const app = freshDemoApp();
    const list = await app.request("/api/v1/waiting");
    const waiting = (
      (await list.json()) as Array<{ id: string; version: number }>
    )[0];
    expect(waiting?.version).toBe(0);

    const missingDate = await app.request(`/api/v1/waiting/${waiting?.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "if-match": '"0"' },
      body: JSON.stringify({ action: "reschedule" }),
    });
    expect(missingDate.status).toBe(422);
    expect(await missingDate.json()).toMatchObject({
      error: { code: "validation_error" },
    });

    const updated = await app.request(`/api/v1/waiting/${waiting?.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "if-match": '"0"' },
      body: JSON.stringify({
        action: "reschedule",
        nextFollowUp: "2026-08-30",
      }),
    });
    expect(updated.status).toBe(200);
    expect(updated.headers.get("etag")).toBe('"1"');
    expect(await updated.json()).toMatchObject({
      nextFollowUp: "2026-08-30",
      version: 1,
    });
  });

  it("requires an idempotency key for weekly review writes", async () => {
    const app = freshDemoApp();
    const review = {
      workspaceId: "workspace-northstar",
      health: "watch",
      progress: "Launch assets are ready.",
      blocker: "Legal review remains.",
      nextMilestone: "Release candidate",
      priorityNextWeek: "Close legal review",
    };
    const missing = await app.request("/api/v1/reviews/weekly", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(review),
    });
    expect(missing.status).toBe(422);

    const created = await app.request("/api/v1/reviews/weekly", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "44444444-4444-4444-8444-444444444444",
      },
      body: JSON.stringify(review),
    });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({
      attentionRefreshQueued: false,
      update: { workspaceId: "workspace-northstar" },
      snapshot: { source: "weekly_review" },
    });
  });

  it("keeps canonical Workspace routes and the portable export shape", async () => {
    const app = freshDemoApp();
    const workspace = await app.request("/api/v1/workspaces/northstar-apparel");
    expect(workspace.status).toBe(200);
    const workspaceBody = (await workspace.json()) as {
      workspace: { id: string; progressMode?: unknown };
      items: Array<{ version: number; groupId?: unknown }>;
    };
    expect(workspaceBody.workspace.id).toBe("workspace-northstar");
    expect(workspaceBody.workspace.progressMode).toBeUndefined();
    expect(workspaceBody.items.length).toBeGreaterThan(0);
    expect(workspaceBody.items.every((item) => item.version === 0)).toBe(true);
    expect(
      workspaceBody.items.every((item) => item.groupId === undefined),
    ).toBe(true);
    expect((await app.request("/api/v1/hubs")).status).toBe(404);

    const exported = await app.request("/api/v1/export/organization.json");
    expect(exported.status).toBe(200);
    expect(exported.headers.get("content-disposition")).toContain(
      "trevv-organization-export.json",
    );
    const body = (await exported.json()) as Record<string, unknown>;
    for (const key of [
      "portfolios",
      "workspaces",
      "boards",
      "items",
      "decisions",
      "updates",
      "attention",
      "waiting",
    ])
      expect(body).toHaveProperty(key);
    expect(body).not.toHaveProperty("hubs");

    const formulaTitle = '=HYPERLINK("https://example.invalid","open")';
    const createdFormulaItem = await app.request("/api/v1/items", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "89999999-9999-4999-8999-999999999999",
      },
      body: JSON.stringify({ ...itemInput, title: formulaTitle }),
    });
    expect(createdFormulaItem.status).toBe(201);

    const boardExport = await app.request(
      "/api/v1/export/board/b-northstar-launch.csv",
    );
    expect(boardExport.status).toBe(200);
    expect(boardExport.headers.get("content-type")).toContain("text/csv");
    const boardCsv = await boardExport.text();
    expect(boardCsv).toContain("Approve packaging");
    expect(boardCsv).toContain(
      `"'=HYPERLINK(""https://example.invalid"",""open"")"`,
    );
  });
});

describe("Phase 4 collaboration routes", () => {
  it("creates a Team and returns its synchronized room version", async () => {
    const live = createUnavailableLiveDependencies();
    const createTeam = vi.fn(async () => ({
      value: liveTeam,
      replayed: false,
    }));
    const app = createApiApp({
      mode: "live",
      accessResolver: liveAccessResolver,
      dataPlane: { ...live.dataPlane, createTeam },
      clock: () => new Date(fixedNow),
    });
    const response = await app.request(
      "/api/v1/workspaces/workspace-live/teams",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "51111111-1111-4111-8111-111111111111",
        },
        body: JSON.stringify({
          workspaceId: "workspace-live",
          name: "Technology",
          purpose: "Ship the product",
          preset: "technology",
          memberIds: ["user-live"],
          leadUserId: "user-live",
        }),
      },
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("etag")).toBe('"1"');
    expect(response.headers.get("idempotency-replayed")).toBe("false");
    expect(await response.json()).toMatchObject({
      id: "team-live",
      room: { conversationId: "conversation-live" },
    });
    expect(createTeam).toHaveBeenCalledOnce();
  });

  it("requires a Conversation ETag and idempotency key for participant removal", async () => {
    const live = createUnavailableLiveDependencies();
    const setConversationParticipant = vi.fn(async () => ({
      value: liveConversation,
      replayed: false,
    }));
    const app = createApiApp({
      mode: "live",
      accessResolver: liveAccessResolver,
      dataPlane: { ...live.dataPlane, setConversationParticipant },
      clock: () => new Date(fixedNow),
    });

    const missingPrecondition = await app.request(
      "/api/v1/conversations/conversation-live/participants/user-member",
      {
        method: "DELETE",
        headers: {
          "idempotency-key": "52111111-1111-4111-8111-111111111111",
        },
      },
    );
    expect(missingPrecondition.status).toBe(428);

    const response = await app.request(
      "/api/v1/conversations/conversation-live/participants/user-member",
      {
        method: "DELETE",
        headers: {
          "if-match": '"1"',
          "idempotency-key": "52222222-2222-4222-8222-222222222222",
        },
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe('"2"');
    expect(setConversationParticipant).toHaveBeenCalledWith(
      expect.any(Object),
      "conversation-live",
      "user-member",
      1,
      false,
      "member",
    );

    const transfer = await app.request(
      "/api/v1/conversations/conversation-live/participants/user-member",
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "if-match": '"1"',
          "idempotency-key": "52333333-3333-4333-8333-333333333333",
        },
        body: JSON.stringify({ participantRole: "owner" }),
      },
    );
    expect(transfer.status).toBe(200);
    expect(setConversationParticipant).toHaveBeenLastCalledWith(
      expect.any(Object),
      "conversation-live",
      "user-member",
      1,
      true,
      "owner",
    );
  });

  it("bounds collaboration request bodies and rejects unsafe message metadata and response states", async () => {
    const live = createUnavailableLiveDependencies();
    const app = createApiApp({
      mode: "live",
      accessResolver: liveAccessResolver,
      dataPlane: live.dataPlane,
      clock: () => new Date(fixedNow),
    });
    const oversized = await app.request(
      "/api/v1/conversations/conversation-live/messages",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "53111111-1111-4111-8111-111111111111",
        },
        body: JSON.stringify({
          clientMessageId: "53111111-1111-4111-8111-111111111112",
          body: "x".repeat(129 * 1024),
        }),
      },
    );
    expect(oversized.status).toBe(413);
    await expect(errorCode(oversized)).resolves.toBe("payload_too_large");

    const metadata = await app.request(
      "/api/v1/conversations/conversation-live/messages",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "53222222-2222-4222-8222-222222222222",
        },
        body: JSON.stringify({
          clientMessageId: "53222222-2222-4222-8222-222222222223",
          body: "Bounded metadata",
          metadata: Object.fromEntries(
            Array.from({ length: 33 }, (_, index) => [`key-${index}`, true]),
          ),
        }),
      },
    );
    expect(metadata.status).toBe(422);
    await expect(errorCode(metadata)).resolves.toBe("validation_error");

    const cancelled = await app.request(
      "/api/v1/messages/message-live/response",
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "if-match": '"1"',
          "idempotency-key": "53333333-3333-4333-8333-333333333333",
        },
        body: JSON.stringify({ responseState: "cancelled" }),
      },
    );
    expect(cancelled.status).toBe(422);
    await expect(errorCode(cancelled)).resolves.toBe("validation_error");
  });

  it("requires message idempotency and exposes filtered event polling", async () => {
    const live = createUnavailableLiveDependencies();
    const message: ConversationMessageDto = {
      id: "message-live",
      sequence: 1,
      clientMessageId: "61111111-1111-4111-8111-111111111111",
      organizationId: "org-live",
      conversationId: "conversation-live",
      senderId: "user-live",
      sender: {
        id: "user-live",
        email: "live@example.test",
        name: "Live User",
        organizationRole: "owner",
      },
      body: "Coordinate the release.",
      intent: "message",
      metadata: {},
      reactions: [],
      retainedUntil: "2027-08-29T12:00:00.000Z",
      version: 1,
      createdAt: fixedNow.toISOString(),
    };
    const sendConversationMessage = vi.fn(async () => ({
      value: message,
      replayed: false,
    }));
    const listConversationMessages = vi.fn(async () => ({
      data: [message],
      nextCursor: null,
    }));
    const listCollaborationEvents = vi.fn(async () => ({
      events: [
        {
          cursor: 9,
          organizationId: "org-live",
          workspaceId: "workspace-live",
          type: "message.sent" as const,
          aggregateType: "message" as const,
          aggregateId: "message-live",
          conversationId: "conversation-live",
          occurredAt: fixedNow.toISOString(),
        },
      ],
      nextCursor: 9,
    }));
    const app = createApiApp({
      mode: "live",
      accessResolver: liveAccessResolver,
      dataPlane: {
        ...live.dataPlane,
        sendConversationMessage,
        listConversationMessages,
        listCollaborationEvents,
      },
      clock: () => new Date(fixedNow),
    });

    const missingKey = await app.request(
      "/api/v1/conversations/conversation-live/messages",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientMessageId: "61111111-1111-4111-8111-111111111111",
          body: "Coordinate the release.",
        }),
      },
    );
    expect(missingKey.status).toBe(422);
    expect(sendConversationMessage).not.toHaveBeenCalled();

    const thread = await app.request(
      "/api/v1/conversations/conversation-live/messages?parentMessageId=message-root&limit=20",
    );
    expect(thread.status).toBe(200);
    expect(await thread.json()).toMatchObject({
      data: [{ id: "message-live" }],
      nextCursor: null,
    });
    expect(listConversationMessages).toHaveBeenCalledWith(
      expect.any(Object),
      "conversation-live",
      { limit: 20, parentMessageId: "message-root" },
    );

    const events = await app.request(
      "/api/v1/events?workspaceId=workspace-live&after=8&format=json",
    );
    expect(events.status).toBe(200);
    expect(await events.json()).toMatchObject({ nextCursor: 9 });
    expect(listCollaborationEvents).toHaveBeenCalledWith(
      expect.any(Object),
      "workspace-live",
      8,
    );
  });
});

describe("Phase 5 privacy truth boundary", () => {
  it("reports pending legal review and no configured providers", async () => {
    const response = await freshDemoApp().request("/api/v1/privacy");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      legalDocuments: {
        privacyNotice: { reviewStatus: "pending" },
        terms: { reviewStatus: "pending" },
      },
      externalProviders: {
        enabled: false,
        configured: [],
        revocationAutomation: "unavailable",
      },
      requestsAreReviewedBeforeEffects: true,
    });
  });

  it("never simulates a completed privacy effect in demo mode", async () => {
    const app = freshDemoApp();
    const missingKey = await app.request("/api/v1/privacy/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "erasure", scope: "user" }),
    });
    expect(missingKey.status).toBe(422);
    expect(await errorCode(missingKey)).toBe("idempotency_key_required");

    const response = await app.request("/api/v1/privacy/requests", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "81111111-1111-4111-8111-111111111111",
      },
      body: JSON.stringify({ kind: "erasure", scope: "user" }),
    });
    expect(response.status).toBe(501);
    expect(await errorCode(response)).toBe("capability_unavailable");
    const requests = await app.request("/api/v1/privacy/requests");
    await expect(requests.json()).resolves.toEqual([]);
  });
});

async function errorCode(response: Response): Promise<string | undefined> {
  const body = (await response.json()) as { error?: { code?: string } };
  return body.error?.code;
}
