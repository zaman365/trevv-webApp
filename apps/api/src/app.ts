import {
  attentionActionSchema,
  createItemSchema,
  updateItemSchema,
} from "@founderhq/api-contract";
import { openApiDocument } from "@founderhq/api-contract/openapi";
import { createTrevvAuth, type TrevvAuth } from "@founderhq/auth-server";
import {
  calculateResourcePressure,
  changesSinceCheckpoint,
  demoBlueprintInstances,
  demoBlueprintVersions,
  demoChangeCheckpoint,
  demoDecisionOutcomes,
  demoDependencies,
  demoHubSnapshots,
  demoHubs,
  demoInsights,
  demoItems,
  demoMeaningfulChanges,
  demoPortfolios,
  demoReviewRituals,
  demoStakeholderExposure,
  demoWaitingStates,
  generateAttentionSignals,
  hubsForPortfolio,
  portfolioSignals,
  previewBlueprintUpdate,
  rollupHub,
  unrestrictedDevelopmentEntitlements,
  type AttentionSignal,
  type WaitingState,
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
let trevvAuth: TrevvAuth | null | undefined;
const attentionStore = new Map<string, AttentionSignal>(
  generateAttentionSignals(
    "org-demo",
    demoHubs,
    demoItems,
    demoWaitingStates,
    now,
    demoDependencies,
  ).map((signal) => [signal.id, signal]),
);
const waitingStore = new Map<string, WaitingState>(
  demoWaitingStates.map((waiting) => [waiting.id, waiting]),
);

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
    service: "trevv-api",
    version: "v1",
    time: new Date().toISOString(),
  }),
);

app.get("/api/v1/session", (context) =>
  context.json({
    user: {
      id: "user-owner",
      email: "owner@trevv.local",
      name: "Mohammed Zaman",
      role: "owner",
      locale: "en",
    },
    organizationId: "org-demo",
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  }),
);

app.get("/api/v1/portfolios", (context) => {
  requireAccess(context.get("access"), "read", "portfolio", {
    organizationId: "org-demo",
  });
  return context.json(demoPortfolios);
});

app.get("/api/v1/portfolio", (context) => {
  requireAccess(context.get("access"), "read", "portfolio", {
    organizationId: "org-demo",
  });
  const portfolioId = context.req.query("portfolioId") ?? "portfolio-demo";
  const portfolio = demoPortfolios.find(
    (candidate) => candidate.id === portfolioId,
  );
  if (!portfolio)
    return failure(
      context,
      404,
      "resource_not_found",
      "The requested Portfolio is unavailable.",
    );
  const hubs = hubsForPortfolio(portfolio.id);
  const hubIds = new Set(hubs.map((hub) => hub.id));
  const items = currentItems().filter((item) => hubIds.has(item.hubId));
  return context.json({
    asOf: now.toISOString(),
    portfolio,
    signals: portfolioSignals(hubs, items, now),
    hubs: hubs
      .map((hub) => ({ hub, rollup: rollupHub(hub, items, now) }))
      .sort((a, b) => b.rollup.score - a.rollup.score),
  });
});

app.get("/api/v1/attention", (context) => {
  requireAccess(context.get("access"), "read", "portfolio", {
    organizationId: "org-demo",
  });
  const portfolioId = context.req.query("portfolioId");
  const signals = [...attentionStore.values()]
    .filter((signal) => !portfolioId || signal.portfolioId === portfolioId)
    .filter((signal) => !signal.resolvedAt && !signal.dismissedAt)
    .filter(
      (signal) =>
        !signal.snoozedUntil ||
        new Date(signal.snoozedUntil).getTime() <= Date.now(),
    )
    .sort((left, right) => {
      const weight = { info: 1, low: 2, medium: 3, high: 4, critical: 5 };
      return weight[right.severity] - weight[left.severity];
    });
  return context.json(signals);
});

app.patch("/api/v1/attention/:id", async (context) => {
  const signal = attentionStore.get(context.req.param("id"));
  if (!signal)
    return failure(
      context,
      404,
      "resource_not_found",
      "The requested attention signal is unavailable.",
    );
  requireAccess(context.get("access"), "update", "item", {
    organizationId: signal.organizationId,
    ...(signal.hubId ? { hubId: signal.hubId } : {}),
  });
  const raw: unknown = await context.req.json();
  const parsed = attentionActionSchema.safeParse(raw);
  if (!parsed.success)
    return failure(
      context,
      422,
      "validation_error",
      "Review the signal action.",
      { issues: parsed.error.flatten() },
    );
  const changedAt = new Date().toISOString();
  const updated: AttentionSignal = {
    ...signal,
    ...(parsed.data.action === "resolve" ? { resolvedAt: changedAt } : {}),
    ...(parsed.data.action === "dismiss" ? { dismissedAt: changedAt } : {}),
    ...(parsed.data.action === "snooze" && parsed.data.snoozedUntil
      ? { snoozedUntil: parsed.data.snoozedUntil }
      : {}),
    ...(parsed.data.reason ? { actionReason: parsed.data.reason } : {}),
  };
  attentionStore.set(updated.id, updated);
  return context.json(updated);
});

app.get("/api/v1/waiting", (context) => {
  const access = context.get("access");
  return context.json(
    [...waitingStore.values()].filter(
      (waiting) =>
        !waiting.resolvedAt && access.accessibleHubIds.has(waiting.hubId),
    ),
  );
});

app.patch("/api/v1/waiting/:id", async (context) => {
  const waiting = waitingStore.get(context.req.param("id"));
  if (!waiting)
    return failure(
      context,
      404,
      "resource_not_found",
      "The requested waiting state is unavailable.",
    );
  requireAccess(context.get("access"), "update", "item", {
    organizationId: waiting.organizationId,
    hubId: waiting.hubId,
  });
  const raw: unknown = await context.req.json();
  const parsed = z
    .object({
      action: z.enum(["resolve", "nudge", "reschedule"]),
      note: z.string().trim().max(1_000).optional(),
      nextFollowUp: z.iso.date().optional(),
    })
    .safeParse(raw);
  if (!parsed.success)
    return failure(
      context,
      422,
      "validation_error",
      "Review the follow-up action.",
      {
        issues: parsed.error.flatten(),
      },
    );
  const updated: WaitingState = {
    ...waiting,
    ...(parsed.data.action === "resolve"
      ? { resolvedAt: new Date().toISOString() }
      : {}),
    ...(parsed.data.nextFollowUp
      ? { nextFollowUp: parsed.data.nextFollowUp }
      : {}),
    ...(parsed.data.note ? { waitingNote: parsed.data.note } : {}),
  };
  waitingStore.set(updated.id, updated);
  return context.json(updated);
});

app.get("/api/v1/change-radar", (context) => {
  requireAccess(context.get("access"), "read", "portfolio", {
    organizationId: "org-demo",
  });
  return context.json({
    checkpoint: demoChangeCheckpoint,
    changes: changesSinceCheckpoint(
      demoMeaningfulChanges,
      demoChangeCheckpoint,
    ),
  });
});

app.get("/api/v1/management-memory", (context) => {
  requireAccess(context.get("access"), "read", "portfolio", {
    organizationId: "org-demo",
  });
  return context.json({
    hubSnapshots: demoHubSnapshots,
    reviewRituals: demoReviewRituals,
    decisionOutcomes: demoDecisionOutcomes,
  });
});

app.post("/api/v1/reviews/weekly", async (context) => {
  const raw: unknown = await context.req.json();
  const parsed = z
    .object({
      hubId: z.string().min(3),
      health: z.enum(["on_track", "watch", "critical", "parked"]),
      progress: z.string().trim().min(1),
      blocker: z.string().trim().min(1),
      nextMilestone: z.string().trim().min(1),
      decisionNeeded: z.string().trim().optional(),
      priorityNextWeek: z.string().trim().min(1),
    })
    .safeParse(raw);
  if (!parsed.success)
    return failure(
      context,
      422,
      "validation_error",
      "Review the weekly update.",
      {
        issues: parsed.error.flatten(),
      },
    );
  requireAccess(context.get("access"), "update", "hub", {
    organizationId: "org-demo",
    hubId: parsed.data.hubId,
  });
  return context.json(
    {
      update: {
        id: crypto.randomUUID(),
        ...parsed.data,
        publishedAt: new Date().toISOString(),
      },
      snapshot: {
        id: crypto.randomUUID(),
        organizationId: "org-demo",
        portfolioId:
          hubForId(parsed.data.hubId)?.portfolioId ?? "portfolio-demo",
        hubId: parsed.data.hubId,
        capturedAt: new Date().toISOString(),
        health: parsed.data.health,
        source: "weekly_review",
      },
      attentionRefreshed: true,
    },
    201,
  );
});

app.get("/api/v1/insights", (context) => {
  const access = context.get("access");
  return context.json(
    demoInsights.filter(
      (insight) => !insight.hubId || access.accessibleHubIds.has(insight.hubId),
    ),
  );
});

app.get("/api/v1/blueprints", (context) => {
  requireAccess(context.get("access"), "read", "portfolio", {
    organizationId: "org-demo",
  });
  const instance = demoBlueprintInstances[0];
  const current = demoBlueprintVersions[0];
  const next = demoBlueprintVersions[1];
  return context.json({
    instances: demoBlueprintInstances,
    versions: demoBlueprintVersions,
    preview:
      instance && current && next
        ? previewBlueprintUpdate(instance, current, next)
        : null,
  });
});

app.get("/api/v1/team/pressure", (context) => {
  requireAccess(context.get("access"), "read", "portfolio", {
    organizationId: "org-demo",
  });
  return context.json(calculateResourcePressure(demoHubs, currentItems(), now));
});

app.get("/api/v1/entitlements", (context) => {
  requireAccess(context.get("access"), "read", "settings", {
    organizationId: "org-demo",
  });
  return context.json(unrestrictedDevelopmentEntitlements);
});

app.post("/api/v1/import/preview", async (context) => {
  requireAccess(context.get("access"), "update", "settings", {
    organizationId: "org-demo",
  });
  const raw: unknown = await context.req.json();
  const parsed = z
    .object({
      preset: z.enum(["generic_csv", "monday", "clickup", "asana"]),
      headers: z.array(z.string()).min(1).max(200),
      rowCount: z.number().int().min(1).max(100_000),
    })
    .safeParse(raw);
  if (!parsed.success)
    return failure(
      context,
      422,
      "validation_error",
      "Review the import source.",
      {
        issues: parsed.error.flatten(),
      },
    );
  const unsupportedFields = parsed.data.headers.filter((header) =>
    /time track|formula|mirror/i.test(header),
  );
  return context.json({
    preset: parsed.data.preset,
    rowsDetected: parsed.data.rowCount,
    rowsReady: parsed.data.rowCount,
    warnings: unsupportedFields.length
      ? ["Unsupported values will be preserved in the import report."]
      : [],
    unsupportedFields,
    mapping: Object.fromEntries(
      parsed.data.headers.map((header) => [header, header.toLocaleLowerCase()]),
    ),
    dryRun: true,
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
    "attachment; filename=trevv-demo-export.json",
  );
  return context.json({
    exportedAt: new Date().toISOString(),
    organization: { id: "org-demo", name: "TREVV Demo" },
    portfolios: demoPortfolios,
    hubs: demoHubs,
    boards: [...new Set(currentItems().map((item) => item.boardId))].map(
      (boardId) => ({
        id: boardId,
        hubId: currentItems().find((item) => item.boardId === boardId)?.hubId,
      }),
    ),
    items: currentItems(),
    milestones: currentItems().filter((item) => item.type === "milestone"),
    ideas: currentItems().filter((item) => item.type === "idea"),
    decisions: currentItems().filter((item) => item.type === "decision"),
    decisionOutcomes: demoDecisionOutcomes,
    approvals: currentItems().filter((item) => item.type === "approval"),
    updates: demoHubs.map((hub) => ({
      hubId: hub.id,
      text: hub.latestUpdate.text,
      date: hub.latestUpdate.date,
    })),
    insights: demoInsights,
    snapshots: demoHubSnapshots,
    waiting: [...waitingStore.values()],
    attention: [...attentionStore.values()],
    dependencies: demoDependencies,
    commentMetadata: [],
    smartLinks: [],
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
    "TREVV could not complete that request.",
  );
});

function currentItems(): WorkItem[] {
  return [...itemStore.values()].map(({ version: _version, ...item }) => item);
}
function hubForId(id: string) {
  return demoHubs.find((hub) => hub.id === id);
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
function getAuth(): TrevvAuth | null {
  if (trevvAuth !== undefined) return trevvAuth;
  const databaseUrl = process.env.DATABASE_URL;
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseUrl = process.env.BETTER_AUTH_URL;
  trevvAuth =
    databaseUrl && secret && baseUrl
      ? createTrevvAuth({
          databaseUrl,
          secret,
          baseUrl,
          trustedOrigins: [process.env.WEB_ORIGIN ?? "http://localhost:3000"],
        })
      : null;
  return trevvAuth;
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
