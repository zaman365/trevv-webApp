import {
  attentionActionSchema,
  createItemSchema,
  idSchema,
  idempotencyKeySchema,
  updateItemSchema,
  waitingActionSchema,
  weeklyReviewInputSchema,
  type Session,
} from "@founderhq/api-contract";
import { openApiDocument } from "@founderhq/api-contract/openapi";
import { createTrevvAuthRuntime } from "@founderhq/auth-server";
import { createDatabase, createPostgresRepositories } from "@founderhq/db";
import { PermissionError, type AccessContext } from "@founderhq/permissions";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { z } from "zod";
import {
  DataPlaneError,
  dataPlaneErrorCode,
  type AccessResolver,
  type ApiMode,
  type ApiMutationContext,
  type ApiRequestContext,
  type DataPlane,
} from "./data-plane.js";
import { createDemoAdapter } from "./demo-adapter.js";
import { createPostgresAdapter } from "./postgres-adapter.js";

type Variables = {
  requestId: string;
  access: AccessContext;
  session: Session;
};

export interface ApiAppDependencies {
  mode: ApiMode;
  dataPlane: DataPlane;
  accessResolver: AccessResolver;
  clock?: () => Date;
  idGenerator?: () => string;
  authHandler?: (request: Request) => Promise<Response>;
  corsOrigin?: string;
}

export function createApiApp(dependencies: ApiAppDependencies) {
  assertCoherentMode(dependencies);
  const clock = dependencies.clock ?? (() => new Date());
  const idGenerator = dependencies.idGenerator ?? (() => crypto.randomUUID());
  const api = new Hono<{ Variables: Variables }>();

  api.use("*", secureHeaders());
  api.use(
    "*",
    cors({
      origin:
        dependencies.corsOrigin ??
        process.env.WEB_ORIGIN ??
        "http://localhost:3000",
      credentials: true,
      allowHeaders: [
        "content-type",
        "authorization",
        "idempotency-key",
        "if-match",
        "x-organization-id",
      ],
      exposeHeaders: [
        "x-request-id",
        "etag",
        "idempotency-key",
        "idempotency-replayed",
      ],
    }),
  );
  api.use("*", async (context, next) => {
    const requestId = context.req.header("x-request-id") ?? idGenerator();
    context.set("requestId", requestId);
    context.header("x-request-id", requestId);
    await next();
  });

  api.on(["GET", "POST"], "/api/auth/*", async (context) => {
    if (!dependencies.authHandler)
      return failure(
        context,
        503,
        "auth_not_configured",
        "Authentication is not configured.",
      );
    return dependencies.authHandler(context.req.raw);
  });

  api.use("/api/v1/*", async (context, next) => {
    if (context.req.path === "/api/v1/health") {
      await next();
      return;
    }
    const resolved = await dependencies.accessResolver.resolve(
      context.req.raw,
      context.get("requestId"),
    );
    if (!resolved) {
      context.res = failure(
        context,
        401,
        "unauthenticated",
        "Sign in to continue.",
      );
      return;
    }
    context.set("access", resolved.access);
    context.set("session", resolved.session);
    await next();
  });

  api.get("/api/v1/health", (context) =>
    context.json({
      status: "ok",
      service: "trevv-api",
      version: "v1",
      mode: dependencies.mode,
      time: clock().toISOString(),
    }),
  );

  api.get("/api/v1/session", (context) => context.json(context.get("session")));

  api.get("/api/v1/portfolios", async (context) =>
    context.json(
      await dependencies.dataPlane.listPortfolios(
        requestContext(context, clock, idGenerator),
      ),
    ),
  );

  api.get("/api/v1/portfolio", async (context) =>
    context.json(
      await dependencies.dataPlane.getPortfolio(
        requestContext(context, clock, idGenerator),
        context.req.query("portfolioId"),
      ),
    ),
  );

  api.get("/api/v1/attention", async (context) =>
    context.json(
      await dependencies.dataPlane.listAttention(
        requestContext(context, clock, idGenerator),
        {
          ...(context.req.query("portfolioId")
            ? { portfolioId: context.req.query("portfolioId") }
            : {}),
          ...(context.req.query("workspaceId")
            ? { workspaceId: context.req.query("workspaceId") }
            : {}),
        },
      ),
    ),
  );

  api.patch("/api/v1/attention/:id", async (context) => {
    const expectedVersion = readIfMatch(context);
    if (expectedVersion instanceof Response) return expectedVersion;
    const raw: unknown = await context.req.json().catch(() => undefined);
    const parsed = attentionActionSchema.safeParse(raw);
    if (!parsed.success)
      return failure(
        context,
        422,
        "validation_error",
        "Review the signal action.",
        { issues: parsed.error.flatten() },
      );
    const idempotency = readIdempotencyKey(context, false);
    if (idempotency instanceof Response) return idempotency;
    const result = await dependencies.dataPlane.actOnAttention(
      await mutationContext(
        context,
        clock,
        idGenerator,
        "/api/v1/attention/:id",
        { id: context.req.param("id"), action: parsed.data },
        idempotency,
        200,
        expectedVersion,
      ),
      context.req.param("id"),
      expectedVersion,
      parsed.data,
    );
    setMutationHeaders(
      context,
      result.value.version,
      idempotency,
      result.replayed,
    );
    return context.json(result.value);
  });

  api.get("/api/v1/waiting", async (context) =>
    context.json(
      await dependencies.dataPlane.listWaiting(
        requestContext(context, clock, idGenerator),
      ),
    ),
  );

  api.patch("/api/v1/waiting/:id", async (context) => {
    const expectedVersion = readIfMatch(context);
    if (expectedVersion instanceof Response) return expectedVersion;
    const raw: unknown = await context.req.json().catch(() => undefined);
    const parsed = waitingActionSchema.safeParse(raw);
    if (!parsed.success)
      return failure(
        context,
        422,
        "validation_error",
        "Review the follow-up action.",
        { issues: parsed.error.flatten() },
      );
    const idempotency = readIdempotencyKey(context, false);
    if (idempotency instanceof Response) return idempotency;
    const result = await dependencies.dataPlane.actOnWaiting(
      await mutationContext(
        context,
        clock,
        idGenerator,
        "/api/v1/waiting/:id",
        { id: context.req.param("id"), action: parsed.data },
        idempotency,
        200,
        expectedVersion,
      ),
      context.req.param("id"),
      expectedVersion,
      parsed.data,
    );
    setMutationHeaders(
      context,
      result.value.version,
      idempotency,
      result.replayed,
    );
    return context.json(result.value);
  });

  api.get("/api/v1/change-radar", async (context) =>
    jsonUnknown(
      context,
      await dependencies.dataPlane.getChangeRadar(
        requestContext(context, clock, idGenerator),
      ),
    ),
  );

  api.get("/api/v1/management-memory", async (context) =>
    jsonUnknown(
      context,
      await dependencies.dataPlane.getManagementMemory(
        requestContext(context, clock, idGenerator),
      ),
    ),
  );

  api.post("/api/v1/reviews/weekly", async (context) => {
    const raw: unknown = await context.req.json().catch(() => undefined);
    const parsed = weeklyReviewInputSchema.safeParse(raw);
    if (!parsed.success)
      return failure(
        context,
        422,
        "validation_error",
        "Review the weekly update.",
        { issues: parsed.error.flatten() },
      );
    const idempotency = readIdempotencyKey(context, true);
    if (idempotency instanceof Response) return idempotency;
    const result = await dependencies.dataPlane.submitWeeklyReview(
      await mutationContext(
        context,
        clock,
        idGenerator,
        "/api/v1/reviews/weekly",
        parsed.data,
        idempotency,
        201,
      ),
      parsed.data,
    );
    setIdempotencyHeaders(context, idempotency, result.replayed);
    return context.json(result.value, 201);
  });

  api.get("/api/v1/insights", async (context) =>
    jsonUnknown(
      context,
      await dependencies.dataPlane.listInsights(
        requestContext(context, clock, idGenerator),
      ),
    ),
  );

  api.get("/api/v1/blueprints", async (context) =>
    jsonUnknown(
      context,
      await dependencies.dataPlane.listBlueprints(
        requestContext(context, clock, idGenerator),
      ),
    ),
  );

  api.get("/api/v1/team/pressure", async (context) =>
    jsonUnknown(
      context,
      await dependencies.dataPlane.getTeamPressure(
        requestContext(context, clock, idGenerator),
      ),
    ),
  );

  api.get("/api/v1/entitlements", async (context) =>
    jsonUnknown(
      context,
      await dependencies.dataPlane.getEntitlements(
        requestContext(context, clock, idGenerator),
      ),
    ),
  );

  api.post("/api/v1/import/preview", async (context) => {
    const raw: unknown = await context.req.json().catch(() => undefined);
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
        { issues: parsed.error.flatten() },
      );
    return jsonUnknown(
      context,
      await dependencies.dataPlane.previewImport(
        requestContext(context, clock, idGenerator),
        parsed.data,
      ),
    );
  });

  api.get("/api/v1/workspaces", async (context) =>
    context.json(
      await dependencies.dataPlane.listWorkspaces(
        requestContext(context, clock, idGenerator),
      ),
    ),
  );

  api.get("/api/v1/workspaces/:slug", async (context) =>
    context.json(
      await dependencies.dataPlane.getWorkspace(
        requestContext(context, clock, idGenerator),
        context.req.param("slug"),
      ),
    ),
  );

  api.get(
    "/api/v1/items",
    zValidator(
      "query",
      z.object({
        cursor: z.string().optional(),
        workspaceId: z.string().optional(),
        assigneeId: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      }),
      (result, context) =>
        result.success
          ? undefined
          : failure(
              context,
              422,
              "validation_error",
              "Review the item filters.",
              { issues: result.error.issues },
            ),
    ),
    async (context) => {
      const filters = context.req.valid("query");
      return context.json(
        await dependencies.dataPlane.listItems(
          requestContext(context, clock, idGenerator),
          filters,
        ),
      );
    },
  );

  api.post("/api/v1/items", async (context) => {
    const raw: unknown = await context.req.json().catch(() => undefined);
    const parsed = createItemSchema.safeParse(raw);
    if (!parsed.success)
      return failure(
        context,
        422,
        "validation_error",
        "Review the highlighted work-item fields.",
        { issues: parsed.error.flatten() },
      );
    const idempotency = readIdempotencyKey(context, true);
    if (idempotency instanceof Response) return idempotency;
    const result = await dependencies.dataPlane.createItem(
      await mutationContext(
        context,
        clock,
        idGenerator,
        "/api/v1/items",
        parsed.data,
        idempotency,
        201,
      ),
      parsed.data,
    );
    setMutationHeaders(
      context,
      result.value.version,
      idempotency,
      result.replayed,
    );
    return context.json(result.value, 201);
  });

  api.patch("/api/v1/items/:id", async (context) => {
    const expectedVersion = readIfMatch(context);
    if (expectedVersion instanceof Response) return expectedVersion;
    const raw: unknown = await context.req.json().catch(() => undefined);
    const parsed = updateItemSchema.safeParse(raw);
    if (!parsed.success)
      return failure(
        context,
        422,
        "validation_error",
        "Review the work-item changes.",
        { issues: parsed.error.flatten() },
      );
    const idempotency = readIdempotencyKey(context, false);
    if (idempotency instanceof Response) return idempotency;
    const result = await dependencies.dataPlane.updateItem(
      await mutationContext(
        context,
        clock,
        idGenerator,
        "/api/v1/items/:id",
        { id: context.req.param("id"), patch: parsed.data },
        idempotency,
        200,
        expectedVersion,
      ),
      context.req.param("id"),
      expectedVersion,
      parsed.data,
    );
    setMutationHeaders(
      context,
      result.value.version,
      idempotency,
      result.replayed,
    );
    return context.json(result.value);
  });

  api.get(
    "/api/v1/search",
    zValidator(
      "query",
      z.object({ q: z.string().trim().min(2).max(200) }),
      (result, context) =>
        result.success
          ? undefined
          : failure(
              context,
              422,
              "validation_error",
              "Enter a search query between 2 and 200 characters.",
              { issues: result.error.issues },
            ),
    ),
    async (context) =>
      context.json(
        await dependencies.dataPlane.search(
          requestContext(context, clock, idGenerator),
          context.req.valid("query").q,
        ),
      ),
  );

  api.get("/api/v1/export/organization.json", async (context) => {
    context.header(
      "content-disposition",
      "attachment; filename=trevv-organization-export.json",
    );
    return jsonUnknown(
      context,
      await dependencies.dataPlane.exportOrganization(
        requestContext(context, clock, idGenerator),
      ),
    );
  });

  api.get("/api/v1/export/board/:filename", async (context) => {
    const filename = context.req.param("filename");
    if (!filename.endsWith(".csv") || filename.length <= 4)
      return failure(
        context,
        404,
        "resource_not_found",
        "The requested resource is unavailable.",
      );
    const parsedBoardId = idSchema.safeParse(filename.slice(0, -4));
    if (!parsedBoardId.success)
      return failure(
        context,
        404,
        "resource_not_found",
        "The requested resource is unavailable.",
      );
    const boardId = parsedBoardId.data;
    const csv = await dependencies.dataPlane.exportBoardCsv(
      requestContext(context, clock, idGenerator),
      boardId,
    );
    context.header("content-type", "text/csv; charset=utf-8");
    context.header(
      "content-disposition",
      `attachment; filename=trevv-board.csv; filename*=UTF-8''${encodeURIComponent(boardId)}.csv`,
    );
    return context.body(csv);
  });

  api.get("/api/v1/events", (context) => {
    if (dependencies.mode === "live")
      throw new DataPlaneError(
        "capability_unavailable",
        "Live event delivery is not implemented yet.",
      );
    return context.body(
      `event: ready\ndata: ${JSON.stringify({ requestId: context.get("requestId"), at: clock().toISOString() })}\n\n`,
      200,
      { "content-type": "text/event-stream", "cache-control": "no-cache" },
    );
  });

  api.get("/openapi.json", (context) => context.json(openApiDocument));

  api.notFound((context) =>
    failure(
      context,
      404,
      "not_found",
      "The requested endpoint does not exist.",
    ),
  );
  api.onError((error, context) => mapError(error, context));

  return api;
}

export function createDemoApiApp(
  overrides: Pick<
    ApiAppDependencies,
    "clock" | "idGenerator" | "corsOrigin"
  > = {},
) {
  const demo = createDemoAdapter();
  return createApiApp({ mode: "demo", ...demo, ...overrides });
}

export function createRuntimeApi(): {
  app: ReturnType<typeof createApiApp>;
  close(): Promise<void>;
} {
  if (process.env.DEMO_MODE === "true")
    return { app: createDemoApiApp(), close: async () => undefined };
  if (process.env.DEMO_MODE !== "false")
    throw new Error("DEMO_MODE must be explicitly set to true or false.");
  const databaseUrl = requiredEnvironment("DATABASE_URL");
  const authBaseUrl = requiredEnvironment("BETTER_AUTH_URL");
  const authSecret = requiredEnvironment("BETTER_AUTH_SECRET");
  const webOrigin = requiredEnvironment("WEB_ORIGIN");
  const database = createDatabase(databaseUrl);
  const repositories = createPostgresRepositories(database.db);
  const authRuntime = createTrevvAuthRuntime({
    databaseUrl,
    baseUrl: authBaseUrl,
    secret: authSecret,
    trustedOrigins: [webOrigin],
  });
  const live = createPostgresAdapter({
    repositories,
    async resolveIdentity(request) {
      const session = await authRuntime.auth.api.getSession({
        headers: request.headers,
        query: { disableCookieCache: true, disableRefresh: true },
      });
      if (!session) return null;
      return {
        userId: session.user.id,
        expiresAt: session.session.expiresAt,
      };
    },
  });
  return {
    app: createApiApp({
      mode: "live",
      ...live,
      authHandler: (request) => authRuntime.auth.handler(request),
      corsOrigin: webOrigin,
    }),
    async close() {
      await Promise.all([database.close(), authRuntime.close()]);
    },
  };
}

export function createUnavailableLiveDependencies(): {
  dataPlane: DataPlane;
  accessResolver: AccessResolver;
} {
  const unavailable = async (): Promise<never> => {
    throw new DataPlaneError(
      "repository_unavailable",
      "The live PostgreSQL data plane is not configured.",
    );
  };
  const dataPlane = {
    mode: "live",
    listPortfolios: unavailable,
    getPortfolio: unavailable,
    listAttention: unavailable,
    actOnAttention: unavailable,
    listWaiting: unavailable,
    actOnWaiting: unavailable,
    getChangeRadar: unavailable,
    getManagementMemory: unavailable,
    submitWeeklyReview: unavailable,
    listInsights: unavailable,
    listBlueprints: unavailable,
    getTeamPressure: unavailable,
    getEntitlements: unavailable,
    previewImport: unavailable,
    listWorkspaces: unavailable,
    getWorkspace: unavailable,
    listItems: unavailable,
    createItem: unavailable,
    updateItem: unavailable,
    search: unavailable,
    exportOrganization: unavailable,
    exportBoardCsv: unavailable,
  } satisfies DataPlane;
  const accessResolver: AccessResolver = {
    mode: "live",
    async resolve(request) {
      if (!request.headers.get("x-organization-id"))
        throw new DataPlaneError(
          "organization_context_required",
          "Choose an organization before accessing live data.",
        );
      return unavailable();
    },
  };
  return { dataPlane, accessResolver };
}

function assertCoherentMode(dependencies: ApiAppDependencies): void {
  if (
    dependencies.dataPlane.mode !== dependencies.mode ||
    dependencies.accessResolver.mode !== dependencies.mode
  )
    throw new Error(
      "API mode, data-plane mode, and access-resolver mode must match.",
    );
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required when DEMO_MODE=false.`);
  return value;
}

function requestContext(
  context: {
    get(name: "access"): AccessContext;
    get(name: "requestId"): string;
  },
  clock: () => Date,
  idGenerator: () => string,
): ApiRequestContext {
  return {
    access: context.get("access"),
    requestId: context.get("requestId"),
    now: clock(),
    newId: idGenerator,
  };
}

async function mutationContext(
  context: {
    req: { method: string };
    get(name: "access"): AccessContext;
    get(name: "requestId"): string;
  },
  clock: () => Date,
  idGenerator: () => string,
  route: string,
  body: unknown,
  idempotencyKey?: string,
  responseStatus = 200,
  expectedVersion?: number,
): Promise<ApiMutationContext> {
  return {
    ...requestContext(context, clock, idGenerator),
    method: context.req.method.toUpperCase(),
    route,
    requestFingerprint: await fingerprint({
      body,
      ...(expectedVersion === undefined ? {} : { expectedVersion }),
    }),
    responseStatus,
    ...(idempotencyKey ? { idempotencyKey } : {}),
  };
}

async function fingerprint(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(value)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, field]) => [key, canonicalize(field)]),
    );
  return value;
}

function readIfMatch(context: {
  req: { header(name: string): string | undefined };
  get(name: "requestId"): string;
}): number | Response {
  const header = context.req.header("if-match");
  if (!header)
    return failure(
      context,
      428,
      "precondition_required",
      "Provide the current quoted ETag in If-Match.",
    );
  const matched = /^"(\d+)"$/.exec(header.trim());
  if (!matched?.[1])
    return failure(
      context,
      422,
      "invalid_etag",
      'If-Match must be a quoted numeric ETag such as "3".',
    );
  const version = Number(matched[1]);
  if (!Number.isSafeInteger(version) || version > 2_147_483_647)
    return failure(
      context,
      422,
      "invalid_etag",
      "If-Match contains an unsupported resource version.",
    );
  return version;
}

function readIdempotencyKey(
  context: {
    req: { header(name: string): string | undefined };
    get(name: "requestId"): string;
  },
  required: boolean,
): string | undefined | Response {
  const header = context.req.header("idempotency-key");
  if (!header)
    return required
      ? failure(
          context,
          422,
          "idempotency_key_required",
          "Provide a UUID Idempotency-Key for this mutation.",
        )
      : undefined;
  const parsed = idempotencyKeySchema.safeParse(header);
  if (!parsed.success)
    return failure(
      context,
      422,
      "invalid_idempotency_key",
      "Idempotency-Key must be a UUID.",
    );
  return parsed.data;
}

function setMutationHeaders(
  context: { header(name: string, value: string): void },
  version: number,
  idempotencyKey?: string,
  replayed?: boolean,
): void {
  context.header("etag", `"${version}"`);
  setIdempotencyHeaders(context, idempotencyKey, replayed);
}

function setIdempotencyHeaders(
  context: { header(name: string, value: string): void },
  idempotencyKey?: string,
  replayed?: boolean,
): void {
  if (idempotencyKey) context.header("idempotency-key", idempotencyKey);
  if (idempotencyKey)
    context.header("idempotency-replayed", replayed ? "true" : "false");
}

function mapError(
  error: Error,
  context: { get(name: "requestId"): string },
): Response {
  const code = dataPlaneErrorCode(error);
  if (error instanceof PermissionError || code === "resource_not_found")
    return failure(
      context,
      404,
      "resource_not_found",
      "The requested resource is unavailable.",
    );
  if (code === "scope_mismatch")
    return failure(
      context,
      404,
      "resource_not_found",
      "The requested resource is unavailable.",
    );
  if (code === "version_conflict") {
    const details = dataPlaneErrorDetails(error);
    const response = failure(context, 409, code, error.message, details);
    const currentVersion = details?.currentVersion;
    if (Number.isSafeInteger(currentVersion) && Number(currentVersion) >= 0)
      response.headers.set("etag", `"${String(currentVersion)}"`);
    return response;
  }
  if (code === "idempotency_key_reused")
    return failure(context, 409, code, error.message);
  if (code === "organization_context_required")
    return failure(context, 400, code, error.message);
  if (code === "repository_unavailable")
    return failure(context, 503, code, error.message);
  if (isDatabaseUnavailable(error))
    return failure(
      context,
      503,
      "repository_unavailable",
      "The live data service is temporarily unavailable.",
    );
  if (code === "capability_unavailable")
    return failure(context, 501, code, error.message);
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
}

function isDatabaseUnavailable(error: Error): boolean {
  const code =
    "code" in error && typeof error.code === "string" ? error.code : "";
  return (
    error.name === "PostgresConnectionError" ||
    code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code.startsWith("08") ||
    code === "57P01" ||
    code === "57P02" ||
    code === "57P03"
  );
}

function dataPlaneErrorDetails(
  error: Error,
): Record<string, unknown> | undefined {
  if (!("details" in error)) return undefined;
  const details = error.details;
  return details && typeof details === "object" && !Array.isArray(details)
    ? (details as Record<string, unknown>)
    : undefined;
}

function jsonUnknown(
  context: { json(value: never): Response },
  value: unknown,
): Response {
  return context.json(value as never);
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
