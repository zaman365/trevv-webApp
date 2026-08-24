import { createItemSchema, updateItemSchema } from "@founderhq/api-contract";
import { openApiDocument } from "@founderhq/api-contract/openapi";
import { createFounderAuth, type FounderAuth } from "@founderhq/auth-server";
import {
  demoHubs,
  demoItems,
  portfolioSignals,
  rollupHub,
  type WorkItem,
} from "@founderhq/core";
import { requireAccess, type AccessContext } from "@founderhq/permissions";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { z } from "zod";

type Variables = { requestId: string; access: AccessContext };
export const app = new Hono<{ Variables: Variables }>();
const now = new Date("2026-08-24T12:00:00.000Z");
const itemStore = new Map(
  demoItems.map((item) => [item.id, { ...item, version: 0 }]),
);
const idempotencyStore = new Map<string, string>();
let founderAuth: FounderAuth | null | undefined;

app.use("*", secureHeaders());
app.use(
  "*",
  cors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
    credentials: true,
    allowHeaders: [
      "content-type",
      "authorization",
      "idempotency-key",
      "if-match",
    ],
    exposeHeaders: ["x-request-id"],
  }),
);
app.use("*", async (context, next) => {
  const requestId = context.req.header("x-request-id") ?? crypto.randomUUID();
  context.set("requestId", requestId);
  context.header("x-request-id", requestId);
  await next();
});

app.on(["GET", "POST"], "/api/auth/*", async (context) => {
  const auth = getAuth();
  if (!auth)
    return failure(
      context,
      503,
      "auth_not_configured",
      "Authentication requires DATABASE_URL, BETTER_AUTH_SECRET, and BETTER_AUTH_URL.",
    );
  return auth.handler(context.req.raw);
});

app.use("/api/v1/*", async (context, next) => {
  const demoMode = process.env.DEMO_MODE !== "false";
  if (!demoMode && context.req.path !== "/api/v1/health") {
    const auth = getAuth();
    if (!auth)
      return failure(
        context,
        503,
        "auth_not_configured",
        "Authentication is not configured.",
      );
    const session = await auth.api.getSession({
      headers: context.req.raw.headers,
    });
    if (!session?.user)
      return failure(context, 401, "unauthenticated", "Sign in to continue.");
  }
  context.set("access", demoAccess());
  await next();
});

app.get("/api/v1/health", (context) =>
  context.json({
    status: "ok",
    service: "founderhq-api",
    version: "v1",
    time: new Date().toISOString(),
  }),
);

app.get("/api/v1/session", (context) =>
  context.json({
    user: {
      id: "user-owner",
      email: "owner@founderhq.local",
      name: "Mohammed Zaman",
      role: "owner",
      locale: "en",
    },
    organizationId: "org-demo",
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  }),
);

app.get("/api/v1/portfolio", (context) => {
  requireAccess(context.get("access"), "read", "portfolio", {
    organizationId: "org-demo",
  });
  const items = currentItems();
  return context.json({
    asOf: now.toISOString(),
    signals: portfolioSignals(demoHubs, items, now),
    hubs: demoHubs
      .map((hub) => ({ hub, rollup: rollupHub(hub, items, now) }))
      .sort((a, b) => b.rollup.score - a.rollup.score),
  });
});

app.get("/api/v1/hubs", (context) => {
  const access = context.get("access");
  return context.json(
    demoHubs.filter((hub) => access.accessibleHubIds.has(hub.id)),
  );
});

app.get("/api/v1/hubs/:slug", (context) => {
  const hub = demoHubs.find(
    (candidate) => candidate.slug === context.req.param("slug"),
  );
  if (!hub)
    return failure(
      context,
      404,
      "resource_not_found",
      "The requested resource is unavailable.",
    );
  requireAccess(context.get("access"), "read", "hub", {
    organizationId: "org-demo",
    hubId: hub.id,
  });
  return context.json({
    hub,
    rollup: rollupHub(hub, currentItems(), now),
    items: currentItems().filter((item) => item.hubId === hub.id),
  });
});

app.get(
  "/api/v1/items",
  zValidator(
    "query",
    z.object({
      cursor: z.string().optional(),
      hubId: z.string().optional(),
      assignee: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }),
  ),
  (context) => {
    const { cursor, hubId, assignee, limit } = context.req.valid("query");
    const access = context.get("access");
    let items = currentItems().filter((item) =>
      access.accessibleHubIds.has(item.hubId),
    );
    if (hubId) items = items.filter((item) => item.hubId === hubId);
    if (assignee) items = items.filter((item) => item.assignee === assignee);
    const offset = cursor
      ? Number.parseInt(
          Buffer.from(cursor, "base64url").toString("utf8"),
          10,
        ) || 0
      : 0;
    const data = items.slice(offset, offset + limit);
    const nextOffset = offset + data.length;
    return context.json({
      data,
      nextCursor:
        nextOffset < items.length
          ? Buffer.from(String(nextOffset)).toString("base64url")
          : null,
    });
  },
);

app.post("/api/v1/items", async (context) => {
  const raw: unknown = await context.req.json();
  const parsed = createItemSchema.safeParse(raw);
  if (!parsed.success)
    return failure(
      context,
      422,
      "validation_error",
      "Review the highlighted work-item fields.",
      { issues: parsed.error.flatten() },
    );
  requireAccess(context.get("access"), "create", "item", {
    organizationId: "org-demo",
    hubId: parsed.data.hubId,
  });
  const idempotencyKey = context.req.header("idempotency-key");
  if (idempotencyKey && idempotencyStore.has(idempotencyKey)) {
    const existing = itemStore.get(idempotencyStore.get(idempotencyKey) ?? "");
    if (existing) return context.json(existing, 200);
  }
  const id = crypto.randomUUID();
  const input = parsed.data;
  const item: WorkItem & { version: number } = {
    id,
    hubId: input.hubId,
    boardId: input.boardId,
    title: input.title,
    type: input.type,
    priority: input.priority,
    status: input.status,
    ...(input.dueDate ? { dueDate: input.dueDate } : {}),
    ...(input.assignee ? { assignee: input.assignee } : {}),
    ...(input.approvalState ? { approvalState: input.approvalState } : {}),
    ...(input.decisionState ? { decisionState: input.decisionState } : {}),
    version: 0,
  };
  itemStore.set(id, item);
  if (idempotencyKey) idempotencyStore.set(idempotencyKey, id);
  return context.json(item, 201);
});

app.patch("/api/v1/items/:id", async (context) => {
  const existing = itemStore.get(context.req.param("id"));
  if (!existing)
    return failure(
      context,
      404,
      "resource_not_found",
      "The requested resource is unavailable.",
    );
  requireAccess(context.get("access"), "update", "item", {
    organizationId: "org-demo",
    hubId: existing.hubId,
  });
  const version = Number.parseInt(context.req.header("if-match") ?? "-1", 10);
  const raw: unknown = await context.req.json();
  const parsed = updateItemSchema.safeParse({
    ...(typeof raw === "object" && raw ? raw : {}),
    version,
  });
  if (!parsed.success)
    return failure(
      context,
      422,
      "validation_error",
      "Review the work-item changes.",
      { issues: parsed.error.flatten() },
    );
  if (version !== existing.version)
    return failure(
      context,
      409,
      "version_conflict",
      "This item changed elsewhere. Refresh and retry.",
    );
  const updated: WorkItem & { version: number } = {
    ...existing,
    version: existing.version + 1,
  };
  if (parsed.data.title !== undefined) updated.title = parsed.data.title;
  if (parsed.data.status !== undefined) updated.status = parsed.data.status;
  if (parsed.data.priority !== undefined)
    updated.priority = parsed.data.priority;
  if (parsed.data.dueDate !== undefined) updated.dueDate = parsed.data.dueDate;
  if (parsed.data.assignee !== undefined)
    updated.assignee = parsed.data.assignee;
  itemStore.set(existing.id, updated);
  return context.json(updated);
});

app.get(
  "/api/v1/search",
  zValidator("query", z.object({ q: z.string().trim().min(2).max(200) })),
  (context) => {
    const query = context.req.valid("query").q.toLocaleLowerCase();
    const access = context.get("access");
    const hubs = demoHubs.filter(
      (hub) =>
        access.accessibleHubIds.has(hub.id) &&
        `${hub.name} ${hub.priority} ${hub.healthNote}`
          .toLocaleLowerCase()
          .includes(query),
    );
    const items = currentItems().filter(
      (item) =>
        access.accessibleHubIds.has(item.hubId) &&
        item.title.toLocaleLowerCase().includes(query),
    );
    return context.json({ hubs, items: items.slice(0, 50) });
  },
);

app.get("/api/v1/export/organization.json", (context) => {
  requireAccess(context.get("access"), "export", "settings", {
    organizationId: "org-demo",
  });
  context.header(
    "content-disposition",
    "attachment; filename=founderhq-demo-export.json",
  );
  return context.json({
    exportedAt: new Date().toISOString(),
    organization: { id: "org-demo", name: "FounderHQ Demo" },
    hubs: demoHubs,
    items: currentItems(),
  });
});

app.get("/api/v1/export/board/:boardId.csv", (context) => {
  const items = currentItems().filter(
    (item) => item.boardId === context.req.param("boardId"),
  );
  if (!items.length)
    return failure(
      context,
      404,
      "resource_not_found",
      "The requested resource is unavailable.",
    );
  const first = items[0];
  if (!first)
    return failure(
      context,
      404,
      "resource_not_found",
      "The requested resource is unavailable.",
    );
  requireAccess(context.get("access"), "read", "board", {
    organizationId: "org-demo",
    hubId: first.hubId,
  });
  const csv = [
    "id,title,type,status,priority,due_date,assignee",
    ...items.map((item) =>
      [
        item.id,
        quote(item.title),
        item.type,
        item.status,
        item.priority,
        item.dueDate ?? "",
        quote(item.assignee ?? ""),
      ].join(","),
    ),
  ].join("\n");
  context.header("content-type", "text/csv; charset=utf-8");
  context.header(
    "content-disposition",
    `attachment; filename=${context.req.param("boardId")}.csv`,
  );
  return context.body(csv);
});

app.get("/api/v1/events", (context) => {
  return context.body(
    `event: ready\ndata: ${JSON.stringify({ requestId: context.get("requestId"), at: new Date().toISOString() })}\n\n`,
    200,
    { "content-type": "text/event-stream", "cache-control": "no-cache" },
  );
});

app.get("/openapi.json", (context) => context.json(openApiDocument));

app.notFound((context) =>
  failure(context, 404, "not_found", "The requested endpoint does not exist."),
);
app.onError((error, context) => {
  console.error(
    JSON.stringify({
      level: "error",
      requestId: context.get("requestId"),
      message: error.message,
    }),
  );
  return failure(
    context,
    500,
    "internal_error",
    "FounderHQ could not complete that request.",
  );
});

function currentItems(): WorkItem[] {
  return [...itemStore.values()].map(({ version: _version, ...item }) => item);
}
function demoAccess(): AccessContext {
  return {
    userId: "user-owner",
    organizationId: "org-demo",
    role: "owner",
    accessibleHubIds: new Set(demoHubs.map((hub) => hub.id)),
    managedHubIds: new Set(demoHubs.map((hub) => hub.id)),
  };
}
function getAuth(): FounderAuth | null {
  if (founderAuth !== undefined) return founderAuth;
  const databaseUrl = process.env.DATABASE_URL;
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseUrl = process.env.BETTER_AUTH_URL;
  founderAuth =
    databaseUrl && secret && baseUrl
      ? createFounderAuth({
          databaseUrl,
          secret,
          baseUrl,
          trustedOrigins: [process.env.WEB_ORIGIN ?? "http://localhost:3000"],
        })
      : null;
  return founderAuth;
}
function quote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
function failure(
  context: { get(name: "requestId"): string },
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): Response {
  const requestId = context.get("requestId");
  return new Response(
    JSON.stringify({
      error: { code, message, requestId, ...(details ? { details } : {}) },
    }),
    {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-request-id": requestId,
      },
    },
  );
}
