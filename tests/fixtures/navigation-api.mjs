import http from "node:http";
// Fictional, loopback-only upstream for the compiled Worker regression gate.
const workspace = {
  id: "workspace-one",
  portfolioId: "portfolio-one",
  slug: "navigation-test",
  name: "Navigation test",
  description: "",
  icon: "N",
  accent: "#5555aa",
  type: "business",
  stage: "idea",
  health: "on_track",
  healthNote: "",
  priority: "Normal",
  metrics: [],
  versionTag: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
};
const organization = {
  id: "org-one",
  name: "Navigation test",
  slug: "navigation-test",
  role: "owner",
  timezone: "Europe/Berlin",
};
const session = {
  user: {
    id: "user-one",
    email: "owner@example.test",
    name: "Navigation test",
    role: "owner",
    locale: "en",
  },
  organizationId: organization.id,
  organization,
  availableOrganizations: [organization],
  managedWorkspaceIds: [workspace.id],
  expiresAt: "2099-01-01T00:00:00.000Z",
  platformRole: "owner",
};
const portfolio = {
  id: "portfolio-one",
  organizationId: "org-one",
  name: "One",
  slug: "one",
  description: "",
  isDefault: true,
};
const secondWorkspace = {
  ...workspace,
  id: "workspace-two",
  slug: "another-workspace",
  name: "Another workspace",
};
const board = {
  id: "board-one",
  workspaceId: workspace.id,
  name: "Navigation board",
  description: "",
  visibility: "organization",
  progressMode: "task_completion",
  ordering: 0,
  versionTag: workspace.versionTag,
  createdAt: workspace.updatedAt,
  updatedAt: workspace.updatedAt,
};
let seen = [];
let detailed = [];
let denied = false;
let sessionFailure = false;
let revision = 1;
let legacy = false;
let itemCount = 0;
let unrelatedItemCount = 0;
let itemDelay = 0;
const items = (count, scope) =>
  Array.from({ length: count }, (_, index) => ({
    id: `${scope}-item-${index}`,
    workspaceId: scope,
    boardId: scope === workspace.id ? board.id : "board-two",
    title: `Fixture task ${index}`,
    description: "Fictional performance fixture",
    type: "task",
    priority: "normal",
    status: "not_started",
    assignees: [{ id: session.user.id, name: session.user.name }],
    version: 1,
    createdAt: workspace.updatedAt,
    updatedAt: workspace.updatedAt,
  }));
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const path = url.pathname;
    res.setHeader("content-type", "application/json");
    res.setHeader("cache-control", "no-store");
    if (path === "/test/reset") {
      seen = [];
      detailed = [];
      denied = url.searchParams.has("denied");
      sessionFailure = url.searchParams.has("sessionFailure");
      legacy = url.searchParams.has("legacy");
      itemCount = Math.min(
        20_000,
        Math.max(0, Number(url.searchParams.get("items")) || 0),
      );
      unrelatedItemCount = Math.min(
        20_000,
        Math.max(0, Number(url.searchParams.get("unrelatedItems")) || 0),
      );
      itemDelay = Math.min(
        10_000,
        Math.max(0, Number(url.searchParams.get("itemDelay")) || 0),
      );
      revision++;
      return res.end("{}");
    }
    if (path === "/test/requests") return res.end(JSON.stringify(seen));
    if (path === "/test/request-details")
      return res.end(JSON.stringify(detailed));
    if (path === "/test/revision") {
      revision++;
      return res.end("{}");
    }
    if (path === "/test/access") {
      denied = url.searchParams.has("denied");
      revision++;
      return res.end("{}");
    }
    seen.push(path);
    detailed.push({
      path,
      query: Object.fromEntries(url.searchParams),
      at: Date.now(),
    });
    let body;
    if (
      (path === "/api/v1/session" || path === "/api/v1/sync/status") &&
      sessionFailure
    ) {
      res.statusCode = 500;
      body = {
        error: {
          code: "fixture_failure",
          message: "Temporary fixture failure",
        },
      };
    } else if (path.startsWith("/api/v1/sync/") && legacy) {
      res.statusCode = 404;
      body = { error: { code: "not_found", message: "Legacy fixture" } };
    } else if (path === "/api/v1/session") body = session;
    else if (path === "/api/v1/sync/status")
      body = {
        protocol: 1,
        revision: String(revision),
        session,
        portfolios: [portfolio],
        workspaces: denied ? [secondWorkspace] : [workspace, secondWorkspace],
      };
    else if (path === "/api/v1/sync/summary")
      body = {
        protocol: 1,
        revision: String(revision),
        workspaces: (denied
          ? [secondWorkspace]
          : [workspace, secondWorkspace]
        ).map(({ id }) => ({
          workspaceId: id,
          open: id === workspace.id ? itemCount : unrelatedItemCount,
          blocked: 0,
          pendingDecisions: 0,
          attention: 0,
          attentionEntities: 0,
        })),
        portfolios: [
          { portfolioId: portfolio.id, attention: 0, attentionEntities: 0 },
        ],
      };
    else if (path === "/api/v1/workspaces")
      body = denied ? [secondWorkspace] : [workspace, secondWorkspace];
    else if (path === "/api/v1/workspaces/workspace-one/calendar") {
      const query = new URL(req.url, "http://localhost").searchParams;
      body = {
        workspaceId: workspace.id,
        range: { from: query.get("from"), to: query.get("to") },
        calendars: [
          {
            id: "calendar-one",
            workspaceId: workspace.id,
            provider: "trevv",
            name: "Navigation calendar",
            color: "#5555aa",
            isPrimary: true,
            visibleByDefault: true,
            readOnly: false,
            connectionState: "native",
            syncState: "idle",
            version: 1,
          },
        ],
        events: [],
        providerAvailability: [],
      };
    } else if (path.endsWith("/conversation-unread"))
      body = { unreadCount: 0, conversationsWithUnread: 0 };
    else if (path === "/api/v1/workspaces/workspace-one/boards") body = [board];
    else if (path === "/api/v1/boards/board-one") body = board;
    else if (path.endsWith("/teams"))
      body = { teams: [], availableMembers: [] };
    else if (path.endsWith("/conversations"))
      body = { data: [], nextCursor: null };
    else if (path.startsWith("/api/v1/workspaces/")) {
      res.statusCode = 500;
      body = {
        error: {
          code: "unexpected_detail",
          message: "Routing must not fetch full detail",
        },
      };
    } else if (path === "/api/v1/portfolios") body = [portfolio];
    else if (path === "/api/v1/events") {
      res.setHeader("content-type", "text/event-stream");
      return res.end(
        `event: checkpoint\ndata: ${JSON.stringify({ nextCursor: 0 })}\n\n`,
      );
    } else if (path === "/api/v1/items") {
      if (itemDelay)
        await new Promise((resolve) => setTimeout(resolve, itemDelay));
      const scope = url.searchParams.get("workspaceId");
      const all = [
        ...(!scope || scope === workspace.id
          ? items(itemCount, workspace.id)
          : []),
        ...(!scope || scope === secondWorkspace.id
          ? items(unrelatedItemCount, secondWorkspace.id)
          : []),
      ];
      const offset = Number(url.searchParams.get("cursor")) || 0;
      const limit = Math.min(100, Number(url.searchParams.get("limit")) || 100);
      body = {
        data: all.slice(offset, offset + limit),
        nextCursor: offset + limit < all.length ? String(offset + limit) : null,
      };
    } else body = [];
    res.end(JSON.stringify(body));
  })
  .listen(3219, "127.0.0.1", () =>
    console.log("Navigation fixture API ready at http://127.0.0.1:3219"),
  );
