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
};
let seen = [];
let denied = false;
http
  .createServer((req, res) => {
    const path = new URL(req.url, "http://localhost").pathname;
    res.setHeader("content-type", "application/json");
    res.setHeader("cache-control", "no-store");
    if (path === "/test/reset") {
      seen = [];
      denied = new URL(req.url, "http://localhost").searchParams.has("denied");
      return res.end("{}");
    }
    if (path === "/test/requests") return res.end(JSON.stringify(seen));
    seen.push(path);
    let body;
    if (path === "/api/v1/session") body = session;
    else if (path === "/api/v1/workspaces") body = denied ? [] : [workspace];
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
    } else if (path.startsWith("/api/v1/workspaces/")) {
      res.statusCode = 500;
      body = {
        error: {
          code: "unexpected_detail",
          message: "Routing must not fetch full detail",
        },
      };
    } else if (path === "/api/v1/portfolios")
      body = [
        {
          id: "portfolio-one",
          organizationId: "org-one",
          name: "One",
          slug: "one",
          description: "",
          isDefault: true,
        },
      ];
    else if (path === "/api/v1/items") body = { data: [], nextCursor: null };
    else body = [];
    res.end(JSON.stringify(body));
  })
  .listen(3219, "127.0.0.1", () =>
    console.log("Navigation fixture API ready at http://127.0.0.1:3219"),
  );
