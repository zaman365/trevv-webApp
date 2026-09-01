import {
  acceptInvitationSchema,
  approvalTransitionSchema,
  assignWorkItemSchema,
  attentionActionSchema,
  blockWorkItemSchema,
  captureInboxItemSchema,
  completeOnboardingSchema,
  convertInboxItemSchema,
  createBoardSchema,
  createConversationMessageSchema,
  createConversationSchema,
  createInvitationSchema,
  createItemSchema,
  createPrivacyRequestSchema,
  createTeamSchema,
  createWaitingSchema,
  createWorkspaceSchema,
  decisionTransitionSchema,
  idSchema,
  idempotencyKeySchema,
  markConversationReadSchema,
  messageReactionInputSchema,
  onboardingDraftSchema,
  organizationSelectionSchema,
  resolveWorkItemSchema,
  setConversationParticipantSchema,
  setTeamMemberSchema,
  updateInboxItemSchema,
  updateItemSchema,
  updateMessageResponseSchema,
  updateMembershipSchema,
  updateRetentionPolicySchema,
  updateTeamSchema,
  waitingActionSchema,
  weeklyReviewInputSchema,
  workItemEvidenceInputSchema,
  type Invitation,
  type Membership,
  type OnboardingState,
  type RuntimeReleaseMetadata,
  type Session,
} from "@founderhq/api-contract";
import { openApiDocument } from "@founderhq/api-contract/openapi";
import {
  createFileMailSink,
  createSmtpMailDelivery,
  createTrevvAuthRuntime,
  type AuthIdentityResolver,
  type MailDelivery,
  type RegistrationMode,
  type ResolvedAuthIdentity,
} from "@founderhq/auth-server";
import {
  createDatabase,
  createIdentityScope,
  createOrganizationScope,
  createPlatformScope,
  createPostgresRepositories,
  createRateLimitRepository,
  hashInvitationToken,
  type IdentityResolution,
  type InvitationProjection,
  type OnboardingDraft as RepositoryOnboardingDraft,
  type OnboardingProgressProjection,
  type OrganizationScopedRepositories,
  PlatformAccessError,
  type PostgresRepositories,
} from "@founderhq/db";
import {
  PermissionError,
  requireAccess,
  type AccessContext,
} from "@founderhq/permissions";
import { zValidator } from "@hono/zod-validator";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { randomBytes } from "node:crypto";
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
import {
  acceptedRequestId,
  createApiMetrics,
  createJsonLogger,
  createMemoryRateLimitStore,
  createPostgresRateLimitStore,
  isOperationalTelemetryPath,
  rateLimitPolicy,
  telemetryPath,
  trustedClientKey,
  type ApiOperations,
  type ApiErrorReporter,
  type ApiLogger,
  type ApiMetrics,
  type ApiRateLimitStore,
} from "./operations.js";
import { createPostgresAdapter } from "./postgres-adapter.js";
import { readRuntimeConfiguration } from "./runtime-config.js";

type Variables = {
  requestId: string;
  access: AccessContext;
  session: Session;
  authIdentity: ResolvedAuthIdentity;
};

type ApiContext = Context<{ Variables: Variables }>;

export interface ApiAppDependencies {
  mode: ApiMode;
  dataPlane: DataPlane;
  accessResolver: AccessResolver;
  clock?: () => Date;
  idGenerator?: () => string;
  authHandler?: (request: Request) => Promise<Response>;
  registrationMode?: RegistrationMode;
  releaseMetadata?: RuntimeReleaseMetadata | null;
  authIdentityResolver?: AuthIdentityResolver;
  preMembershipPaths?: readonly string[];
  repositories?: PostgresRepositories;
  mailDelivery?: MailDelivery;
  mailFrom?: string;
  webOrigin?: string;
  invitationTtlMs?: number;
  corsOrigin?: string;
  operations?: ApiOperations;
  exposeInternalMetrics?: boolean;
}

export function createApiApp(dependencies: ApiAppDependencies) {
  assertCoherentMode(dependencies);
  const clock = dependencies.clock ?? (() => new Date());
  const idGenerator = dependencies.idGenerator ?? (() => crypto.randomUUID());
  const operations: ApiOperations = {
    ...dependencies.operations,
    metrics: dependencies.operations?.metrics ?? createApiMetrics(),
  };
  const api = new Hono<{ Variables: Variables }>();

  api.use("*", async (context, next) => {
    const requestId = acceptedRequestId(
      context.req.header("x-request-id"),
      idGenerator,
    );
    const started = performance.now();
    context.set("requestId", requestId);
    context.header("x-request-id", requestId);
    try {
      await next();
    } finally {
      const durationMs = Math.max(0, Math.round(performance.now() - started));
      observe(() =>
        operations.logger?.write({
          level: context.res.status >= 500 ? "error" : "info",
          service: "trevv-api",
          event: "request_completed",
          requestId,
          method: context.req.method,
          path: telemetryPath(context.req.path),
          status: context.res.status,
          durationMs,
        }),
      );
      if (!isOperationalTelemetryPath(context.req.path))
        observe(() =>
          operations.metrics?.recordRequest({
            method: context.req.method,
            path: telemetryPath(context.req.path),
            status: context.res.status,
            durationMs,
          }),
        );
    }
  });
  api.use("*", secureHeaders());
  api.use(
    "/api/v1/*",
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
      ],
      exposeHeaders: [
        "x-request-id",
        "etag",
        "idempotency-key",
        "idempotency-replayed",
      ],
    }),
  );
  api.use(
    "/api/auth/*",
    bodyLimit({
      maxSize: 64 * 1024,
      onError: (context) =>
        failure(
          context as unknown as ApiContext,
          413,
          "payload_too_large",
          "The authentication request cannot exceed 64 KiB.",
        ),
    }),
  );
  api.use("/api/*", async (context, next) => {
    const store = operations.rateLimitStore;
    const policy = rateLimitPolicy(context.req.method, context.req.path);
    if (!store || !policy) {
      await next();
      return;
    }
    let decision;
    try {
      decision = await store.consume({
        ...policy,
        key: trustedClientKey(
          context.req.raw.headers,
          operations.trustedClientIpHeader,
        ),
        now: clock(),
      });
    } catch (error) {
      observe(() => operations.metrics?.recordRateLimitStoreError());
      observe(() =>
        operations.logger?.write({
          level: "error",
          service: "trevv-api",
          event: "rate_limit_store_unavailable",
          requestId: context.get("requestId"),
          errorName: error instanceof Error ? error.name : "UnknownError",
        }),
      );
      context.res = failure(
        context,
        503,
        "operations_unavailable",
        "Request protection is temporarily unavailable.",
      );
      return;
    }
    const resetSeconds = Math.max(
      1,
      Math.ceil((decision.resetAt.getTime() - clock().getTime()) / 1_000),
    );
    context.header("ratelimit-limit", String(decision.limit));
    context.header("ratelimit-remaining", String(decision.remaining));
    context.header("ratelimit-reset", String(resetSeconds));
    if (!decision.allowed) {
      observe(() =>
        operations.metrics?.recordRateLimitRejection(policy.bucket),
      );
      const response = failure(
        context,
        429,
        "rate_limited",
        "Retry this request later.",
        { retryAfterSeconds: resetSeconds },
      );
      response.headers.set("retry-after", String(resetSeconds));
      response.headers.set("ratelimit-limit", String(decision.limit));
      response.headers.set("ratelimit-remaining", "0");
      response.headers.set("ratelimit-reset", String(resetSeconds));
      context.res = response;
      return;
    }
    await next();
  });
  api.use(
    "/api/v1/*",
    bodyLimit({
      maxSize: 128 * 1024,
      onError: (context) =>
        failure(
          context as unknown as ApiContext,
          413,
          "payload_too_large",
          "The request body cannot exceed 128 KiB.",
        ),
    }),
  );

  api.on(["GET", "POST"], "/api/auth/*", async (context) => {
    if (
      (dependencies.registrationMode ?? "closed") === "closed" &&
      context.req.method === "POST" &&
      withoutTrailingSlash(context.req.path) === "/api/auth/sign-up/email"
    ) {
      const response = failure(
        context,
        403,
        "registration_closed",
        "Account registration is not currently open.",
      );
      response.headers.set("cache-control", "private, no-store, max-age=0");
      return response;
    }
    if (!dependencies.authHandler)
      return failure(
        context,
        503,
        "auth_not_configured",
        "Authentication is not configured.",
      );
    return dependencies.authHandler(context.req.raw);
  });

  api.get("/internal/livez", (context) =>
    context.json({ status: "ok", service: "trevv-api" }),
  );

  if (dependencies.exposeInternalMetrics !== false)
    api.get("/internal/metrics", (context) =>
      context.text(operations.metrics?.render() ?? "", 200, {
        "cache-control": "no-store",
        "content-type": "text/plain; version=0.0.4; charset=utf-8",
      }),
    );

  api.use("/api/v1/*", async (context, next) => {
    if (
      context.req.path === "/api/v1/health" ||
      context.req.path === "/api/v1/readyz"
    ) {
      await next();
      return;
    }
    context.header("cache-control", "private, no-store, max-age=0");
    context.header("pragma", "no-cache");
    context.header("vary", "Cookie, Authorization");
    if (
      dependencies.mode === "live" &&
      isUnsafeMethod(context.req.method) &&
      context.req.header("cookie") &&
      !hasTrustedMutationOrigin(
        context.req.header("origin"),
        dependencies.webOrigin ?? dependencies.corsOrigin,
        context.req.header("sec-fetch-site"),
      )
    ) {
      context.res = failure(
        context,
        403,
        "invalid_request_origin",
        "This request origin is not allowed.",
      );
      return;
    }
    if (dependencies.authIdentityResolver) {
      const identity = await dependencies.authIdentityResolver.resolve(
        context.req.raw,
      );
      if (!identity) {
        context.res = failure(
          context,
          401,
          "unauthenticated",
          "Sign in to continue.",
        );
        return;
      }
      if (!identity.emailVerified) {
        context.res = failure(
          context,
          403,
          "identity_verification_required",
          "Verify your email before accessing TREVV.",
        );
        return;
      }
      context.set("authIdentity", identity);
      if (dependencies.preMembershipPaths?.includes(context.req.path)) {
        await next();
        return;
      }
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

  api.get("/api/v1/readyz", async (context) => {
    const time = clock().toISOString();
    try {
      const readiness = await dependencies.dataPlane.readiness();
      return context.json({
        status: "ready" as const,
        service: "trevv-api" as const,
        version: "v1" as const,
        mode: dependencies.mode,
        registrationMode:
          dependencies.mode === "live"
            ? (dependencies.registrationMode ?? "closed")
            : ("not_applicable" as const),
        database: readiness.database,
        release: dependencies.releaseMetadata ?? null,
        time,
      });
    } catch {
      return context.json(
        {
          status: "unavailable" as const,
          service: "trevv-api" as const,
          version: "v1" as const,
          mode: dependencies.mode,
          registrationMode:
            dependencies.mode === "live"
              ? (dependencies.registrationMode ?? "closed")
              : ("not_applicable" as const),
          database: "unavailable" as const,
          release: dependencies.releaseMetadata ?? null,
          time,
        },
        503,
      );
    }
  });

  api.get("/api/v1/session", (context) => context.json(context.get("session")));

  api.get("/api/v1/platform", async (context) => {
    requirePlatformOwner(context);
    const dashboard = await platformRepositories(
      dependencies,
      context,
    ).dashboard(clock());
    return context.json({
      role: "owner" as const,
      ...dashboard,
      release: dependencies.releaseMetadata ?? null,
      registrationMode: dependencies.registrationMode ?? "closed",
      generatedAt: clock().toISOString(),
    });
  });

  api.post(
    "/api/v1/platform/users/:authUserId/revoke-sessions",
    async (context) => {
      requirePlatformOwner(context);
      const result = await platformRepositories(
        dependencies,
        context,
      ).revokeUserSessions(
        context.req.param("authUserId"),
        context.get("authIdentity").sessionId,
        clock(),
      );
      return context.json(result);
    },
  );

  api.get("/api/v1/session/organizations", async (context) => {
    const resolved = await identityRepositories(
      dependencies,
      context,
    ).resolve();
    if (resolved.status === "active")
      return context.json(resolved.availableOrganizations);
    if (resolved.status === "organization_selection_required")
      return context.json(resolved.organizations);
    throw identityResolutionFailure(resolved.status);
  });

  api.post("/api/v1/session/organization", async (context) => {
    const raw: unknown = await context.req.json().catch(() => undefined);
    const parsed = organizationSelectionSchema.safeParse(raw);
    if (!parsed.success)
      return failure(
        context,
        422,
        "validation_error",
        "Choose a valid organization.",
        { issues: parsed.error.flatten() },
      );
    const resolved = await identityRepositories(
      dependencies,
      context,
    ).selectOrganization(parsed.data.organizationId);
    if (resolved.status !== "active")
      throw new DataPlaneError(
        "identity_access_unavailable",
        "No active application access is available for this identity.",
      );
    return context.json(
      sessionFromIdentity(resolved, context.get("authIdentity")),
    );
  });

  api.get("/api/v1/onboarding", async (context) => {
    const progress = await identityRepositories(
      dependencies,
      context,
    ).onboarding.getProgress();
    const state = onboardingState(progress, clock());
    context.header("etag", `"${state.version}"`);
    return context.json(state);
  });

  api.put("/api/v1/onboarding", async (context) => {
    const expectedVersion = readIfMatch(context);
    if (expectedVersion instanceof Response) return expectedVersion;
    const raw: unknown = await context.req.json().catch(() => undefined);
    const parsed = onboardingDraftSchema.safeParse(raw);
    if (!parsed.success)
      return failure(
        context,
        422,
        "validation_error",
        "Review the onboarding fields.",
        { issues: parsed.error.flatten() },
      );
    const progress = await identityRepositories(
      dependencies,
      context,
    ).onboarding.saveProgress(
      repositoryOnboardingDraft(parsed.data),
      expectedVersion,
    );
    const state = onboardingState(progress, clock());
    context.header("etag", `"${state.version}"`);
    return context.json(state);
  });

  api.post("/api/v1/onboarding/complete", async (context) => {
    const raw: unknown = await context.req.json().catch(() => undefined);
    const parsed = completeOnboardingSchema.safeParse(raw);
    if (!parsed.success)
      return failure(
        context,
        422,
        "validation_error",
        "Review every required onboarding field.",
        { issues: parsed.error.flatten() },
      );
    const idempotency = readIdempotencyKey(context, true);
    if (idempotency instanceof Response) return idempotency;
    const mutation = await mutationContext(
      context,
      clock,
      idGenerator,
      "/api/v1/onboarding/complete",
      parsed.data,
      idempotency,
      201,
    );
    const repositories = identityRepositories(dependencies, context);
    const result = await repositories.onboarding.complete(parsed.data, {
      idempotencyKey: idempotency,
      requestFingerprint: mutation.requestFingerprint,
      now: mutation.now,
    });
    const progress = await repositories.onboarding.getProgress();
    const state = onboardingState(progress, clock());
    context.header("etag", `"${state.version}"`);
    setIdempotencyHeaders(context, idempotency, result.replayed);
    return context.json(state, 201);
  });

  api.get("/api/v1/invitations", async (context) => {
    requireOrganizationManagement(context.get("access"));
    const rows = await organizationRepositories(
      dependencies,
      context,
    ).invitations.list();
    return context.json(rows.map((row) => invitationDto(row, clock())));
  });

  api.post("/api/v1/invitations", async (context) => {
    requireOrganizationManagement(context.get("access"));
    const raw: unknown = await context.req.json().catch(() => undefined);
    const parsed = createInvitationSchema.safeParse(raw);
    if (!parsed.success)
      return failure(
        context,
        422,
        "validation_error",
        "Review the invitation email and role.",
        { issues: parsed.error.flatten() },
      );
    const idempotency = readIdempotencyKey(context, true);
    if (idempotency instanceof Response) return idempotency;
    const token = invitationToken();
    const now = clock();
    const expiresAt = new Date(
      now.getTime() +
        (dependencies.invitationTtlMs ?? 7 * 24 * 60 * 60 * 1_000),
    );
    const mutation = await mutationContext(
      context,
      clock,
      idGenerator,
      "/api/v1/invitations",
      parsed.data,
      idempotency,
      201,
    );
    const repositories = organizationRepositories(dependencies, context);
    const created = await repositories.invitations.create(
      {
        email: parsed.data.email,
        role: parsed.data.role,
        ...(parsed.data.workspaceId
          ? { workspaceId: parsed.data.workspaceId }
          : {}),
        ...(parsed.data.teamId ? { teamId: parsed.data.teamId } : {}),
        tokenHash: hashInvitationToken(token),
        expiresAt,
      },
      mutation,
    );
    if (created.replayed && created.value.deliveryStatus === "pending")
      throw new DataPlaneError(
        "invitation_delivery_incomplete",
        "Invitation delivery did not finish. Resend it with a new idempotency key.",
      );
    const delivered = created.replayed
      ? created.value
      : await deliverInvitation(
          dependencies,
          repositories,
          created.value,
          token,
          mutation,
        );
    setMutationHeaders(
      context,
      delivered.version,
      idempotency,
      created.replayed,
    );
    return context.json(invitationDto(delivered, clock()), 201);
  });

  api.post("/api/v1/invitations/:id/resend", async (context) => {
    requireOrganizationManagement(context.get("access"));
    const expectedVersion = readIfMatch(context);
    if (expectedVersion instanceof Response) return expectedVersion;
    const idempotency = readIdempotencyKey(context, true);
    if (idempotency instanceof Response) return idempotency;
    const token = invitationToken();
    const now = clock();
    const expiresAt = new Date(
      now.getTime() +
        (dependencies.invitationTtlMs ?? 7 * 24 * 60 * 60 * 1_000),
    );
    const mutation = await mutationContext(
      context,
      clock,
      idGenerator,
      "/api/v1/invitations/:id/resend",
      { id: context.req.param("id") },
      idempotency,
      200,
      expectedVersion,
    );
    const repositories = organizationRepositories(dependencies, context);
    const resent = await repositories.invitations.resend(
      context.req.param("id"),
      expectedVersion,
      { tokenHash: hashInvitationToken(token), expiresAt },
      mutation,
    );
    if (resent.replayed && resent.value.deliveryStatus === "pending")
      throw new DataPlaneError(
        "invitation_delivery_incomplete",
        "Invitation delivery did not finish. Resend it with a new idempotency key.",
      );
    const delivered = resent.replayed
      ? resent.value
      : await deliverInvitation(
          dependencies,
          repositories,
          resent.value,
          token,
          mutation,
        );
    setMutationHeaders(
      context,
      delivered.version,
      idempotency,
      resent.replayed,
    );
    return context.json(invitationDto(delivered, clock()));
  });

  api.delete("/api/v1/invitations/:id", async (context) => {
    requireOrganizationManagement(context.get("access"));
    const expectedVersion = readIfMatch(context);
    if (expectedVersion instanceof Response) return expectedVersion;
    const idempotency = readIdempotencyKey(context, true);
    if (idempotency instanceof Response) return idempotency;
    const mutation = await mutationContext(
      context,
      clock,
      idGenerator,
      "/api/v1/invitations/:id",
      { id: context.req.param("id") },
      idempotency,
      200,
      expectedVersion,
    );
    const revoked = await organizationRepositories(
      dependencies,
      context,
    ).invitations.revoke(context.req.param("id"), expectedVersion, mutation);
    setMutationHeaders(
      context,
      revoked.value.version,
      idempotency,
      revoked.replayed,
    );
    return context.json(invitationDto(revoked.value, clock()));
  });

  api.post("/api/v1/invitations/accept", async (context) => {
    const raw: unknown = await context.req.json().catch(() => undefined);
    const parsed = acceptInvitationSchema.safeParse(raw);
    if (!parsed.success)
      return failure(
        context,
        422,
        "validation_error",
        "The invitation link is invalid.",
        { issues: parsed.error.flatten() },
      );
    const now = clock();
    const accepted = await identityRepositories(
      dependencies,
      context,
    ).invitations.accept(hashInvitationToken(parsed.data.token), now);
    return context.json({
      invitationId: accepted.invitationId,
      organizationId: accepted.organizationId,
      role: accepted.membership.role,
      ...(accepted.workspaceId ? { workspaceId: accepted.workspaceId } : {}),
      ...(accepted.teamId ? { teamId: accepted.teamId } : {}),
      acceptedAt: accepted.acceptedAt.toISOString(),
    });
  });

  api.post("/api/v1/invitations/accept-claim", async (context) => {
    const accepted = await identityRepositories(
      dependencies,
      context,
    ).invitations.acceptClaim(clock());
    return context.json({
      invitationId: accepted.invitationId,
      organizationId: accepted.organizationId,
      role: accepted.membership.role,
      ...(accepted.workspaceId ? { workspaceId: accepted.workspaceId } : {}),
      ...(accepted.teamId ? { teamId: accepted.teamId } : {}),
      acceptedAt: accepted.acceptedAt.toISOString(),
    });
  });

  api.get("/api/v1/memberships", async (context) => {
    requireOrganizationManagement(context.get("access"));
    const repositories = organizationRepositories(dependencies, context);
    const memberships = await repositories.memberships.list();
    return context.json(
      await Promise.all(
        memberships.map(async (membership) =>
          membershipDto(
            membership,
            await repositories.users.getMemberHistory(membership.userId),
          ),
        ),
      ),
    );
  });

  api.patch("/api/v1/memberships/:userId", async (context) => {
    requireOrganizationManagement(context.get("access"));
    const raw: unknown = await context.req.json().catch(() => undefined);
    const parsed = updateMembershipSchema.safeParse(raw);
    if (!parsed.success)
      return failure(
        context,
        422,
        "validation_error",
        "Review the membership changes.",
        { issues: parsed.error.flatten() },
      );
    const idempotency = readIdempotencyKey(context, true);
    if (idempotency instanceof Response) return idempotency;
    const repositories = organizationRepositories(dependencies, context);
    const userId = context.req.param("userId");
    const targetMembership = await repositories.memberships.get(userId);
    if (
      targetMembership.role === "owner" &&
      context.get("access").role !== "owner"
    )
      throw new PermissionError();
    const user = await repositories.users.getMemberHistory(userId);
    const mutation = await mutationContext(
      context,
      clock,
      idGenerator,
      "/api/v1/memberships/:userId",
      { userId, patch: parsed.data },
      idempotency,
    );
    const updated = await repositories.memberships.update(
      userId,
      {
        ...(parsed.data.role ? { role: parsed.data.role } : {}),
        ...(parsed.data.active === undefined
          ? {}
          : { archived: !parsed.data.active }),
      },
      mutation,
    );
    setIdempotencyHeaders(context, idempotency, updated.replayed);
    return context.json(membershipDto(updated.value, user));
  });

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

  api.post("/api/v1/waiting", async (context) => {
    const expectedItemVersion = readIfMatch(context);
    if (expectedItemVersion instanceof Response) return expectedItemVersion;
    const parsed = createWaitingSchema.safeParse(
      await context.req.json().catch(() => undefined),
    );
    if (!parsed.success)
      return validationFailure(
        context,
        "Review the Waiting follow-up fields.",
        parsed.error.flatten(),
      );
    const idempotency = readIdempotencyKey(context, true);
    if (idempotency instanceof Response) return idempotency;
    const result = await dependencies.dataPlane.createWaiting(
      await mutationContext(
        context,
        clock,
        idGenerator,
        "/api/v1/waiting",
        parsed.data,
        idempotency,
        201,
        expectedItemVersion,
      ),
      expectedItemVersion,
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

  api.get(
    "/api/v1/reviews/weekly",
    zValidator(
      "query",
      z.object({ workspaceId: idSchema.optional() }),
      queryValidation("Review the weekly-review filters."),
    ),
    async (context) =>
      context.json(
        await dependencies.dataPlane.listWeeklyReviews(
          requestContext(context, clock, idGenerator),
          context.req.valid("query").workspaceId,
        ),
      ),
  );

  api.get(
    "/api/v1/snapshots",
    zValidator(
      "query",
      z.object({
        portfolioId: idSchema.optional(),
        workspaceId: idSchema.optional(),
      }),
      queryValidation("Review the snapshot filters."),
    ),
    async (context) => {
      const filters = context.req.valid("query");
      return context.json(
        await dependencies.dataPlane.listSnapshots(
          requestContext(context, clock, idGenerator),
          {
            ...(filters.portfolioId !== undefined
              ? { portfolioId: filters.portfolioId }
              : {}),
            ...(filters.workspaceId !== undefined
              ? { workspaceId: filters.workspaceId }
              : {}),
          },
        ),
      );
    },
  );

  api.get("/api/v1/operations/status", async (context) =>
    context.json(
      await dependencies.dataPlane.getOperationsStatus(
        requestContext(context, clock, idGenerator),
      ),
    ),
  );

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

  api.post("/api/v1/workspaces", async (context) => {
    const parsed = createWorkspaceSchema.safeParse(
      await context.req.json().catch(() => undefined),
    );
    if (!parsed.success)
      return validationFailure(
        context,
        "Review the Workspace fields.",
        parsed.error.flatten(),
      );
    const idempotency = readIdempotencyKey(context, true);
    if (idempotency instanceof Response) return idempotency;
    const result = await dependencies.dataPlane.createWorkspace(
      await mutationContext(
        context,
        clock,
        idGenerator,
        "/api/v1/workspaces",
        parsed.data,
        idempotency,
        201,
      ),
      parsed.data,
    );
    setIdempotencyHeaders(context, idempotency, result.replayed);
    return context.json(result.value, 201);
  });

  api.get("/api/v1/workspaces/:slug", async (context) =>
    context.json(
      await dependencies.dataPlane.getWorkspace(
        requestContext(context, clock, idGenerator),
        context.req.param("slug"),
      ),
    ),
  );

  api.get("/api/v1/workspaces/:workspaceId/teams", async (context) => {
    const workspaceId = idSchema.safeParse(context.req.param("workspaceId"));
    if (!workspaceId.success)
      return failure(
        context,
        404,
        "resource_not_found",
        "The requested resource is unavailable.",
      );
    return context.json(
      await dependencies.dataPlane.listTeamDirectory(
        requestContext(context, clock, idGenerator),
        workspaceId.data,
      ),
    );
  });

  api.post("/api/v1/workspaces/:workspaceId/teams", async (context) => {
    const parsed = createTeamSchema.safeParse(
      await context.req.json().catch(() => undefined),
    );
    if (!parsed.success)
      return validationFailure(
        context,
        "Review the Team fields.",
        parsed.error.flatten(),
      );
    if (parsed.data.workspaceId !== context.req.param("workspaceId"))
      return failure(
        context,
        404,
        "resource_not_found",
        "The requested resource is unavailable.",
      );
    const idempotency = readIdempotencyKey(context, true);
    if (idempotency instanceof Response) return idempotency;
    const result = await dependencies.dataPlane.createTeam(
      await mutationContext(
        context,
        clock,
        idGenerator,
        "/api/v1/workspaces/:workspaceId/teams",
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

  api.get("/api/v1/teams/:id", async (context) => {
    const team = await dependencies.dataPlane.getTeam(
      requestContext(context, clock, idGenerator),
      context.req.param("id"),
    );
    context.header("etag", `"${team.version}"`);
    return context.json(team);
  });

  api.patch("/api/v1/teams/:id", async (context) => {
    const expectedVersion = readIfMatch(context);
    if (expectedVersion instanceof Response) return expectedVersion;
    const parsed = updateTeamSchema.safeParse(
      await context.req.json().catch(() => undefined),
    );
    if (!parsed.success)
      return validationFailure(
        context,
        "Review the Team changes.",
        parsed.error.flatten(),
      );
    const idempotency = readIdempotencyKey(context, true);
    if (idempotency instanceof Response) return idempotency;
    const id = context.req.param("id");
    const result = await dependencies.dataPlane.updateTeam(
      await mutationContext(
        context,
        clock,
        idGenerator,
        "/api/v1/teams/:id",
        { id, patch: parsed.data },
        idempotency,
        200,
        expectedVersion,
      ),
      id,
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

  api.put("/api/v1/teams/:teamId/members/:userId", async (context) => {
    const expectedVersion = readIfMatch(context);
    if (expectedVersion instanceof Response) return expectedVersion;
    const parsed = setTeamMemberSchema.safeParse(
      await context.req.json().catch(() => undefined),
    );
    if (!parsed.success)
      return validationFailure(
        context,
        "Review the Team membership.",
        parsed.error.flatten(),
      );
    const idempotency = readIdempotencyKey(context, true);
    if (idempotency instanceof Response) return idempotency;
    const teamId = context.req.param("teamId");
    const userId = context.req.param("userId");
    const result = await dependencies.dataPlane.setTeamMember(
      await mutationContext(
        context,
        clock,
        idGenerator,
        "/api/v1/teams/:teamId/members/:userId",
        { teamId, userId, membership: parsed.data },
        idempotency,
        200,
        expectedVersion,
      ),
      teamId,
      userId,
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

  api.delete("/api/v1/teams/:teamId/members/:userId", async (context) => {
    const expectedVersion = readIfMatch(context);
    if (expectedVersion instanceof Response) return expectedVersion;
    const idempotency = readIdempotencyKey(context, true);
    if (idempotency instanceof Response) return idempotency;
    const teamId = context.req.param("teamId");
    const userId = context.req.param("userId");
    const result = await dependencies.dataPlane.removeTeamMember(
      await mutationContext(
        context,
        clock,
        idGenerator,
        "/api/v1/teams/:teamId/members/:userId",
        { teamId, userId },
        idempotency,
        200,
        expectedVersion,
      ),
      teamId,
      userId,
      expectedVersion,
    );
    setMutationHeaders(
      context,
      result.value.version,
      idempotency,
      result.replayed,
    );
    return context.json(result.value);
  });

  api.get("/api/v1/workspaces/:workspaceId/conversations", async (context) => {
    const parsed = z
      .object({
        workspaceId: idSchema,
        cursor: z.string().min(1).max(512).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .safeParse({
        workspaceId: context.req.param("workspaceId"),
        cursor: context.req.query("cursor"),
        limit: context.req.query("limit"),
      });
    if (!parsed.success)
      return validationFailure(
        context,
        "Review the conversation filters.",
        parsed.error.flatten(),
      );
    return context.json(
      await dependencies.dataPlane.listConversations(
        requestContext(context, clock, idGenerator),
        {
          workspaceId: parsed.data.workspaceId,
          limit: parsed.data.limit,
          ...(parsed.data.cursor ? { cursor: parsed.data.cursor } : {}),
        },
      ),
    );
  });

  api.post("/api/v1/workspaces/:workspaceId/conversations", async (context) => {
    const parsed = createConversationSchema.safeParse(
      await context.req.json().catch(() => undefined),
    );
    if (!parsed.success)
      return validationFailure(
        context,
        "Review the conversation fields.",
        parsed.error.flatten(),
      );
    if (parsed.data.workspaceId !== context.req.param("workspaceId"))
      return failure(
        context,
        404,
        "resource_not_found",
        "The requested resource is unavailable.",
      );
    const idempotency = readIdempotencyKey(context, true);
    if (idempotency instanceof Response) return idempotency;
    const result = await dependencies.dataPlane.createConversation(
      await mutationContext(
        context,
        clock,
        idGenerator,
        "/api/v1/workspaces/:workspaceId/conversations",
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

  api.get("/api/v1/conversations/:id", async (context) => {
    const conversation = await dependencies.dataPlane.getConversation(
      requestContext(context, clock, idGenerator),
      context.req.param("id"),
    );
    context.header("etag", `"${conversation.version}"`);
    return context.json(conversation);
  });

  api.put("/api/v1/conversations/:id/participants/:userId", async (context) =>
    mutateConversationParticipant(context, true),
  );

  api.delete(
    "/api/v1/conversations/:id/participants/:userId",
    async (context) => mutateConversationParticipant(context, false),
  );

  async function mutateConversationParticipant(
    context: ApiContext,
    active: boolean,
  ) {
    const expectedVersion = readIfMatch(context);
    if (expectedVersion instanceof Response) return expectedVersion;
    const parsed = z
      .object({ conversationId: idSchema, userId: idSchema })
      .safeParse({
        conversationId: context.req.param("id"),
        userId: context.req.param("userId"),
      });
    if (!parsed.success)
      return validationFailure(
        context,
        "Choose a valid conversation participant.",
        parsed.error.flatten(),
      );
    const participantInput = active
      ? setConversationParticipantSchema.safeParse(
          await context.req.json().catch(() => undefined),
        )
      : setConversationParticipantSchema.safeParse({});
    if (!participantInput.success)
      return validationFailure(
        context,
        "Choose a valid participant role.",
        participantInput.error.flatten(),
      );
    const idempotency = readIdempotencyKey(context, true);
    if (idempotency instanceof Response) return idempotency;
    const route = "/api/v1/conversations/:id/participants/:userId";
    const result = await dependencies.dataPlane.setConversationParticipant(
      await mutationContext(
        context,
        clock,
        idGenerator,
        route,
        { ...parsed.data, active, ...participantInput.data },
        idempotency,
        200,
        expectedVersion,
      ),
      parsed.data.conversationId,
      parsed.data.userId,
      expectedVersion,
      active,
      participantInput.data.participantRole,
    );
    setMutationHeaders(
      context,
      result.value.version,
      idempotency,
      result.replayed,
    );
    return context.json(result.value);
  }

  api.get("/api/v1/conversations/:id/messages", async (context) => {
    const parsed = z
      .object({
        cursor: z.string().min(1).max(512).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        parentMessageId: idSchema.optional(),
      })
      .safeParse({
        cursor: context.req.query("cursor"),
        limit: context.req.query("limit"),
        parentMessageId: context.req.query("parentMessageId"),
      });
    if (!parsed.success)
      return validationFailure(
        context,
        "Review the message filters.",
        parsed.error.flatten(),
      );
    return context.json(
      await dependencies.dataPlane.listConversationMessages(
        requestContext(context, clock, idGenerator),
        context.req.param("id"),
        {
          limit: parsed.data.limit,
          ...(parsed.data.cursor ? { cursor: parsed.data.cursor } : {}),
          ...(parsed.data.parentMessageId
            ? { parentMessageId: parsed.data.parentMessageId }
            : {}),
        },
      ),
    );
  });

  api.post("/api/v1/conversations/:id/messages", async (context) => {
    const parsed = createConversationMessageSchema.safeParse(
      await context.req.json().catch(() => undefined),
    );
    if (!parsed.success)
      return validationFailure(
        context,
        "Review the message.",
        parsed.error.flatten(),
      );
    const idempotency = readIdempotencyKey(context, true);
    if (idempotency instanceof Response) return idempotency;
    const conversationId = context.req.param("id");
    const result = await dependencies.dataPlane.sendConversationMessage(
      await mutationContext(
        context,
        clock,
        idGenerator,
        "/api/v1/conversations/:id/messages",
        { conversationId, message: parsed.data },
        idempotency,
        201,
      ),
      conversationId,
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

  api.patch("/api/v1/messages/:id/response", async (context) => {
    const expectedVersion = readIfMatch(context);
    if (expectedVersion instanceof Response) return expectedVersion;
    const parsed = updateMessageResponseSchema.safeParse(
      await context.req.json().catch(() => undefined),
    );
    if (!parsed.success)
      return validationFailure(
        context,
        "Review the response state.",
        parsed.error.flatten(),
      );
    const idempotency = readIdempotencyKey(context, true);
    if (idempotency instanceof Response) return idempotency;
    const id = context.req.param("id");
    if (!id)
      return failure(
        context,
        404,
        "resource_not_found",
        "The requested resource is unavailable.",
      );
    const result = await dependencies.dataPlane.updateMessageResponse(
      await mutationContext(
        context,
        clock,
        idGenerator,
        "/api/v1/messages/:id/response",
        { id, response: parsed.data },
        idempotency,
        200,
        expectedVersion,
      ),
      id,
      expectedVersion,
      parsed.data.responseState,
    );
    setMutationHeaders(
      context,
      result.value.version,
      idempotency,
      result.replayed,
    );
    return context.json(result.value);
  });

  api.put("/api/v1/messages/:id/reactions/:emoji", async (context) => {
    return mutateMessageReaction(context, "add");
  });

  api.delete("/api/v1/messages/:id/reactions/:emoji", async (context) => {
    return mutateMessageReaction(context, "remove");
  });

  async function mutateMessageReaction(
    context: ApiContext,
    action: "add" | "remove",
  ) {
    const expectedVersion = readIfMatch(context);
    if (expectedVersion instanceof Response) return expectedVersion;
    const parsed = messageReactionInputSchema.safeParse({
      emoji: context.req.param("emoji"),
    });
    if (!parsed.success)
      return validationFailure(
        context,
        "Choose a valid reaction.",
        parsed.error.flatten(),
      );
    const idempotency = readIdempotencyKey(context, true);
    if (idempotency instanceof Response) return idempotency;
    const id = context.req.param("id");
    if (!id)
      return failure(
        context,
        404,
        "resource_not_found",
        "The requested resource is unavailable.",
      );
    const route = "/api/v1/messages/:id/reactions/:emoji";
    const mutation = await mutationContext(
      context,
      clock,
      idGenerator,
      route,
      { id, emoji: parsed.data.emoji, action },
      idempotency,
      200,
      expectedVersion,
    );
    const result =
      action === "add"
        ? await dependencies.dataPlane.addMessageReaction(
            mutation,
            id,
            expectedVersion,
            parsed.data.emoji,
          )
        : await dependencies.dataPlane.removeMessageReaction(
            mutation,
            id,
            expectedVersion,
            parsed.data.emoji,
          );
    setMutationHeaders(
      context,
      result.value.version,
      idempotency,
      result.replayed,
    );
    return context.json(result.value);
  }

  api.put("/api/v1/conversations/:id/read-checkpoint", async (context) => {
    const parsed = markConversationReadSchema.safeParse(
      await context.req.json().catch(() => undefined),
    );
    if (!parsed.success)
      return validationFailure(
        context,
        "Choose a valid message checkpoint.",
        parsed.error.flatten(),
      );
    const idempotency = readIdempotencyKey(context, true);
    if (idempotency instanceof Response) return idempotency;
    const conversationId = context.req.param("id");
    const result = await dependencies.dataPlane.markConversationRead(
      await mutationContext(
        context,
        clock,
        idGenerator,
        "/api/v1/conversations/:id/read-checkpoint",
        { conversationId, messageId: parsed.data.messageId },
        idempotency,
      ),
      conversationId,
      parsed.data.messageId,
    );
    setIdempotencyHeaders(context, idempotency, result.replayed);
    return context.json(result.value);
  });

  api.get(
    "/api/v1/boards",
    zValidator(
      "query",
      z.object({ workspaceId: idSchema }),
      queryValidation("Choose a valid Workspace."),
    ),
    async (context) =>
      context.json(
        await dependencies.dataPlane.listBoards(
          requestContext(context, clock, idGenerator),
          context.req.valid("query").workspaceId,
        ),
      ),
  );

  api.get("/api/v1/boards/:id", async (context) =>
    context.json(
      await dependencies.dataPlane.getBoard(
        requestContext(context, clock, idGenerator),
        context.req.param("id"),
      ),
    ),
  );

  api.post("/api/v1/boards", async (context) => {
    const parsed = createBoardSchema.safeParse(
      await context.req.json().catch(() => undefined),
    );
    if (!parsed.success)
      return validationFailure(
        context,
        "Review the Board fields.",
        parsed.error.flatten(),
      );
    const idempotency = readIdempotencyKey(context, true);
    if (idempotency instanceof Response) return idempotency;
    const result = await dependencies.dataPlane.createBoard(
      await mutationContext(
        context,
        clock,
        idGenerator,
        "/api/v1/boards",
        parsed.data,
        idempotency,
        201,
      ),
      parsed.data,
    );
    setIdempotencyHeaders(context, idempotency, result.replayed);
    return context.json(result.value, 201);
  });

  api.get("/api/v1/inbox", async (context) =>
    context.json(
      await dependencies.dataPlane.listInbox(
        requestContext(context, clock, idGenerator),
      ),
    ),
  );

  api.post("/api/v1/inbox", async (context) => {
    const parsed = captureInboxItemSchema.safeParse(
      await context.req.json().catch(() => undefined),
    );
    if (!parsed.success)
      return validationFailure(
        context,
        "Review the Inbox capture fields.",
        parsed.error.flatten(),
      );
    const idempotency = readIdempotencyKey(context, true);
    if (idempotency instanceof Response) return idempotency;
    const result = await dependencies.dataPlane.captureInboxItem(
      await mutationContext(
        context,
        clock,
        idGenerator,
        "/api/v1/inbox",
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

  api.patch("/api/v1/inbox/:id", async (context) => {
    const expectedVersion = readIfMatch(context);
    if (expectedVersion instanceof Response) return expectedVersion;
    const parsed = updateInboxItemSchema.safeParse(
      await context.req.json().catch(() => undefined),
    );
    if (!parsed.success)
      return validationFailure(
        context,
        "Review the Inbox changes.",
        parsed.error.flatten(),
      );
    const idempotency = readIdempotencyKey(context, true);
    if (idempotency instanceof Response) return idempotency;
    const id = context.req.param("id");
    const result = await dependencies.dataPlane.updateInboxItem(
      await mutationContext(
        context,
        clock,
        idGenerator,
        "/api/v1/inbox/:id",
        { id, patch: parsed.data },
        idempotency,
        200,
        expectedVersion,
      ),
      id,
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

  api.post("/api/v1/inbox/:id/convert", async (context) => {
    const expectedVersion = readIfMatch(context);
    if (expectedVersion instanceof Response) return expectedVersion;
    const parsed = convertInboxItemSchema.safeParse(
      await context.req.json().catch(() => undefined),
    );
    if (!parsed.success)
      return validationFailure(
        context,
        "Review the Inbox conversion fields.",
        parsed.error.flatten(),
      );
    const idempotency = readIdempotencyKey(context, true);
    if (idempotency instanceof Response) return idempotency;
    const id = context.req.param("id");
    const result = await dependencies.dataPlane.convertInboxItem(
      await mutationContext(
        context,
        clock,
        idGenerator,
        "/api/v1/inbox/:id/convert",
        { id, conversion: parsed.data },
        idempotency,
        201,
        expectedVersion,
      ),
      id,
      expectedVersion,
      parsed.data,
    );
    setMutationHeaders(
      context,
      result.value.inboxItem.version,
      idempotency,
      result.replayed,
    );
    return context.json(result.value, 201);
  });

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

  api.get("/api/v1/items/:id", async (context) => {
    const item = await dependencies.dataPlane.getItem(
      requestContext(context, clock, idGenerator),
      context.req.param("id"),
    );
    context.header("etag", `"${item.version}"`);
    return context.json(item);
  });

  api.get("/api/v1/items/:id/history", async (context) =>
    context.json(
      await dependencies.dataPlane.listItemHistory(
        requestContext(context, clock, idGenerator),
        context.req.param("id"),
      ),
    ),
  );

  api.get("/api/v1/items/:id/evidence", async (context) =>
    context.json(
      await dependencies.dataPlane.listItemEvidence(
        requestContext(context, clock, idGenerator),
        context.req.param("id"),
      ),
    ),
  );

  api.post("/api/v1/items/:id/evidence", async (context) => {
    const expectedVersion = readIfMatch(context);
    if (expectedVersion instanceof Response) return expectedVersion;
    const parsed = workItemEvidenceInputSchema.safeParse(
      await context.req.json().catch(() => undefined),
    );
    if (!parsed.success)
      return validationFailure(
        context,
        "Provide valid evidence.",
        parsed.error.flatten(),
      );
    const idempotency = readIdempotencyKey(context, true);
    if (idempotency instanceof Response) return idempotency;
    const id = context.req.param("id");
    const result = await dependencies.dataPlane.addItemEvidence(
      await mutationContext(
        context,
        clock,
        idGenerator,
        "/api/v1/items/:id/evidence",
        { id, evidence: parsed.data },
        idempotency,
        201,
        expectedVersion,
      ),
      id,
      expectedVersion,
      parsed.data,
    );
    setMutationHeaders(
      context,
      result.value.itemVersion,
      idempotency,
      result.replayed,
    );
    return context.json(result.value, 201);
  });

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

  api.put("/api/v1/items/:id/assignees", async (context) => {
    const expectedVersion = readIfMatch(context);
    if (expectedVersion instanceof Response) return expectedVersion;
    const parsed = assignWorkItemSchema.safeParse(
      await context.req.json().catch(() => undefined),
    );
    if (!parsed.success)
      return validationFailure(
        context,
        "Review the assignee list.",
        parsed.error.flatten(),
      );
    const idempotency = readIdempotencyKey(context, true);
    if (idempotency instanceof Response) return idempotency;
    const id = context.req.param("id");
    const result = await dependencies.dataPlane.assignItem(
      await mutationContext(
        context,
        clock,
        idGenerator,
        "/api/v1/items/:id/assignees",
        { id, assignment: parsed.data },
        idempotency,
        200,
        expectedVersion,
      ),
      id,
      expectedVersion,
      parsed.data,
    );
    setMutationHeaders(
      context,
      result.value.item.version,
      idempotency,
      result.replayed,
    );
    return context.json(result.value);
  });

  api.post("/api/v1/items/:id/block", async (context) => {
    const expectedVersion = readIfMatch(context);
    if (expectedVersion instanceof Response) return expectedVersion;
    const parsed = blockWorkItemSchema.safeParse(
      await context.req.json().catch(() => undefined),
    );
    if (!parsed.success)
      return validationFailure(
        context,
        "Provide a blocking state and reason.",
        parsed.error.flatten(),
      );
    const idempotency = readIdempotencyKey(context, true);
    if (idempotency instanceof Response) return idempotency;
    const id = context.req.param("id");
    const result = await dependencies.dataPlane.setItemBlocked(
      await mutationContext(
        context,
        clock,
        idGenerator,
        "/api/v1/items/:id/block",
        { id, transition: parsed.data },
        idempotency,
        200,
        expectedVersion,
      ),
      id,
      expectedVersion,
      parsed.data,
    );
    setMutationHeaders(
      context,
      result.value.item.version,
      idempotency,
      result.replayed,
    );
    return context.json(result.value);
  });

  api.post("/api/v1/items/:id/decision", async (context) => {
    const expectedVersion = readIfMatch(context);
    if (expectedVersion instanceof Response) return expectedVersion;
    const parsed = decisionTransitionSchema.safeParse(
      await context.req.json().catch(() => undefined),
    );
    if (!parsed.success)
      return validationFailure(
        context,
        "Review the decision state and rationale.",
        parsed.error.flatten(),
      );
    const idempotency = readIdempotencyKey(context, true);
    if (idempotency instanceof Response) return idempotency;
    const id = context.req.param("id");
    const result = await dependencies.dataPlane.transitionDecision(
      await mutationContext(
        context,
        clock,
        idGenerator,
        "/api/v1/items/:id/decision",
        { id, transition: parsed.data },
        idempotency,
        200,
        expectedVersion,
      ),
      id,
      expectedVersion,
      parsed.data,
    );
    setMutationHeaders(
      context,
      result.value.item.version,
      idempotency,
      result.replayed,
    );
    return context.json(result.value);
  });

  api.post("/api/v1/items/:id/approval", async (context) => {
    const expectedVersion = readIfMatch(context);
    if (expectedVersion instanceof Response) return expectedVersion;
    const parsed = approvalTransitionSchema.safeParse(
      await context.req.json().catch(() => undefined),
    );
    if (!parsed.success)
      return validationFailure(
        context,
        "Review the approval state and rationale.",
        parsed.error.flatten(),
      );
    const idempotency = readIdempotencyKey(context, true);
    if (idempotency instanceof Response) return idempotency;
    const id = context.req.param("id");
    const result = await dependencies.dataPlane.transitionApproval(
      await mutationContext(
        context,
        clock,
        idGenerator,
        "/api/v1/items/:id/approval",
        { id, transition: parsed.data },
        idempotency,
        200,
        expectedVersion,
      ),
      id,
      expectedVersion,
      parsed.data,
    );
    setMutationHeaders(
      context,
      result.value.item.version,
      idempotency,
      result.replayed,
    );
    return context.json(result.value);
  });

  api.post("/api/v1/items/:id/resolve", async (context) => {
    const expectedVersion = readIfMatch(context);
    if (expectedVersion instanceof Response) return expectedVersion;
    const parsed = resolveWorkItemSchema.safeParse(
      await context.req.json().catch(() => undefined),
    );
    if (!parsed.success)
      return validationFailure(
        context,
        "Provide resolution evidence.",
        parsed.error.flatten(),
      );
    const idempotency = readIdempotencyKey(context, true);
    if (idempotency instanceof Response) return idempotency;
    const id = context.req.param("id");
    const result = await dependencies.dataPlane.resolveItem(
      await mutationContext(
        context,
        clock,
        idGenerator,
        "/api/v1/items/:id/resolve",
        { id, resolution: parsed.data },
        idempotency,
        200,
        expectedVersion,
      ),
      id,
      expectedVersion,
      parsed.data,
    );
    setMutationHeaders(
      context,
      result.value.item.version,
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

  // Privacy effects are intentionally request-driven. These endpoints never
  // claim that an export, erasure, or provider revocation happened inline.
  api.get("/api/v1/privacy", async (context) =>
    context.json(
      await dependencies.dataPlane.getPrivacyProgram(
        requestContext(context, clock, idGenerator),
      ),
    ),
  );

  api.get("/api/v1/privacy/requests", async (context) =>
    context.json(
      await dependencies.dataPlane.listPrivacyRequests(
        requestContext(context, clock, idGenerator),
      ),
    ),
  );

  api.post("/api/v1/privacy/requests", async (context) => {
    const raw: unknown = await context.req.json().catch(() => undefined);
    const parsed = createPrivacyRequestSchema.safeParse(raw);
    if (!parsed.success)
      return failure(
        context,
        422,
        "validation_error",
        "Review the privacy request kind and scope.",
        { issues: parsed.error.flatten() },
      );
    const idempotency = readIdempotencyKey(context, true);
    if (idempotency instanceof Response) return idempotency;
    const result = await dependencies.dataPlane.createPrivacyRequest(
      await mutationContext(
        context,
        clock,
        idGenerator,
        "/api/v1/privacy/requests",
        parsed.data,
        idempotency,
        202,
      ),
      parsed.data,
    );
    setMutationHeaders(
      context,
      result.value.version,
      idempotency,
      result.replayed,
    );
    return context.json(result.value, 202);
  });

  api.delete("/api/v1/privacy/requests/:id", async (context) => {
    const parsedId = idSchema.safeParse(context.req.param("id"));
    if (!parsedId.success)
      return failure(
        context,
        404,
        "resource_not_found",
        "The requested resource is unavailable.",
      );
    const expectedVersion = readIfMatch(context);
    if (expectedVersion instanceof Response) return expectedVersion;
    const idempotency = readIdempotencyKey(context, true);
    if (idempotency instanceof Response) return idempotency;
    const result = await dependencies.dataPlane.cancelPrivacyRequest(
      await mutationContext(
        context,
        clock,
        idGenerator,
        "/api/v1/privacy/requests/:id",
        { id: parsedId.data },
        idempotency,
        200,
        expectedVersion,
      ),
      parsedId.data,
      expectedVersion,
    );
    setMutationHeaders(
      context,
      result.value.version,
      idempotency,
      result.replayed,
    );
    return context.json(result.value);
  });

  api.put("/api/v1/privacy/retention", async (context) => {
    const expectedVersion = readIfMatch(context);
    if (expectedVersion instanceof Response) return expectedVersion;
    const idempotency = readIdempotencyKey(context, true);
    if (idempotency instanceof Response) return idempotency;
    const raw: unknown = await context.req.json().catch(() => undefined);
    const parsed = updateRetentionPolicySchema.safeParse(raw);
    if (!parsed.success)
      return failure(
        context,
        422,
        "validation_error",
        "Review the retention category and policy.",
        { issues: parsed.error.flatten() },
      );
    const result = await dependencies.dataPlane.updateRetentionPolicy(
      await mutationContext(
        context,
        clock,
        idGenerator,
        "/api/v1/privacy/retention",
        parsed.data,
        idempotency,
        200,
        expectedVersion,
      ),
      expectedVersion,
      parsed.data,
    );
    setMutationHeaders(
      context,
      result.value.policyVersion,
      idempotency,
      result.replayed,
    );
    return context.json(result.value);
  });

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

  api.get("/api/v1/events", async (context) => {
    if (dependencies.mode === "demo")
      return context.body(
        `event: ready\ndata: ${JSON.stringify({ requestId: context.get("requestId"), at: clock().toISOString(), fictional: true })}\n\n`,
        200,
        { "content-type": "text/event-stream", "cache-control": "no-cache" },
      );
    const parsed = z
      .object({
        workspaceId: idSchema,
        after: z.coerce.number().int().nonnegative().default(0),
        format: z.enum(["json"]).optional(),
      })
      .safeParse({
        workspaceId: context.req.query("workspaceId"),
        after: context.req.query("after"),
        format: context.req.query("format"),
      });
    if (!parsed.success)
      return validationFailure(
        context,
        "Review the collaboration event cursor.",
        parsed.error.flatten(),
      );
    const batch = await dependencies.dataPlane.listCollaborationEvents(
      requestContext(context, clock, idGenerator),
      parsed.data.workspaceId,
      parsed.data.after,
    );
    if (parsed.data.format === "json") return context.json(batch);
    const body = [
      "retry: 2000",
      ...batch.events.flatMap((event) => [
        `id: ${event.cursor}`,
        "event: collaboration",
        `data: ${JSON.stringify(event)}`,
        "",
      ]),
      `event: checkpoint`,
      `data: ${JSON.stringify({ nextCursor: batch.nextCursor, at: clock().toISOString() })}`,
      "",
    ].join("\n");
    return context.body(body, 200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "private, no-store, no-transform",
      connection: "keep-alive",
    });
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
  api.onError((error, context) => mapError(error, context, operations));

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

export function createRuntimeApi(
  runtimeOperations: {
    rateLimitStore?: ApiRateLimitStore;
    logger?: ApiLogger;
    errorReporter?: ApiErrorReporter;
    metrics?: ApiMetrics;
  } = {},
): {
  app: ReturnType<typeof createApiApp>;
  releaseMetadata: RuntimeReleaseMetadata | null;
  close(): Promise<void>;
} {
  const configuration = readRuntimeConfiguration();
  if (configuration.mode === "demo")
    return {
      app: createApiApp({
        mode: "demo",
        ...createDemoAdapter(),
        operations: {
          rateLimitStore: createMemoryRateLimitStore(),
          ...(runtimeOperations.logger
            ? { logger: runtimeOperations.logger }
            : {}),
          ...(runtimeOperations.metrics
            ? { metrics: runtimeOperations.metrics }
            : {}),
        },
      }),
      releaseMetadata: null,
      close: async () => undefined,
    };
  if (
    configuration.errorReportingMode === "external" &&
    !runtimeOperations.errorReporter
  )
    throw new Error(
      "ERROR_REPORTING_MODE=external requires an error reporter adapter.",
    );
  if (
    configuration.rateLimitBackend === "postgres" &&
    runtimeOperations.rateLimitStore &&
    runtimeOperations.rateLimitStore.scope !== "shared"
  )
    throw new Error(
      "RATE_LIMIT_BACKEND=postgres requires a shared rate-limit store.",
    );
  const mailDelivery =
    configuration.mailTransport.kind === "test_file"
      ? createFileMailSink(configuration.mailTransport.filePath)
      : createSmtpMailDelivery(configuration.mailTransport.configuration);
  const database = createDatabase(configuration.databaseUrl);
  const metrics = runtimeOperations.metrics ?? createApiMetrics();
  const rateLimitStore =
    configuration.rateLimitBackend === "memory"
      ? createMemoryRateLimitStore()
      : (runtimeOperations.rateLimitStore ??
        createPostgresRateLimitStore(
          createRateLimitRepository(
            database.db,
            configuration.rateLimitHashSecret ?? missingRateLimitHashSecret(),
          ),
          { onCleanupError: () => metrics.recordRateLimitStoreError() },
        ));
  const repositories = createPostgresRepositories(database.db);
  const authRuntime = createTrevvAuthRuntime({
    databaseUrl: configuration.databaseUrl,
    baseUrl: configuration.authBaseUrl,
    secret: configuration.authSecret,
    trustedOrigins: [configuration.webOrigin],
    cookiePrefix: configuration.cookiePrefix,
    registrationMode: configuration.registrationMode,
    ...(configuration.testRegistrationBootstrapSecret
      ? {
          testRegistrationBootstrapSecret:
            configuration.testRegistrationBootstrapSecret,
        }
      : {}),
    mailDelivery,
    mailFrom: configuration.mailFrom,
    ...(configuration.cookieDomain
      ? { cookieDomain: configuration.cookieDomain }
      : {}),
  });
  const live = createPostgresAdapter({
    repositories,
    async resolveIdentity(request) {
      const identity = await authRuntime.identityResolver.resolve(request);
      if (!identity) return null;
      return {
        authUserId: identity.authUserId,
        expiresAt: identity.expiresAt,
      };
    },
  });
  return {
    app: createApiApp({
      mode: "live",
      ...live,
      authHandler: authRuntime.handler,
      registrationMode: configuration.registrationMode,
      releaseMetadata: configuration.releaseMetadata,
      authIdentityResolver: authRuntime.identityResolver,
      preMembershipPaths: [
        "/api/v1/session/organizations",
        "/api/v1/session/organization",
        "/api/v1/onboarding",
        "/api/v1/onboarding/complete",
        "/api/v1/invitations/accept",
        "/api/v1/invitations/accept-claim",
      ],
      repositories,
      mailDelivery,
      mailFrom: configuration.mailFrom,
      webOrigin: configuration.webOrigin,
      corsOrigin: configuration.webOrigin,
      exposeInternalMetrics: configuration.internalMetricsEnabled,
      operations: {
        ...(rateLimitStore ? { rateLimitStore } : {}),
        ...(configuration.trustedClientIpHeader
          ? { trustedClientIpHeader: configuration.trustedClientIpHeader }
          : {}),
        logger: runtimeOperations.logger ?? createJsonLogger(),
        ...(runtimeOperations.errorReporter
          ? { errorReporter: runtimeOperations.errorReporter }
          : {}),
        metrics,
      },
    }),
    releaseMetadata: configuration.releaseMetadata,
    async close() {
      await Promise.all([database.close(), authRuntime.close()]);
    },
  };
}

function missingRateLimitHashSecret(): never {
  throw new Error(
    "RATE_LIMIT_HASH_SECRET is required for the PostgreSQL rate limiter.",
  );
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
    readiness: unavailable,
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
    createWorkspace: unavailable,
    getWorkspace: unavailable,
    listTeamDirectory: unavailable,
    getTeam: unavailable,
    createTeam: unavailable,
    updateTeam: unavailable,
    setTeamMember: unavailable,
    removeTeamMember: unavailable,
    listConversations: unavailable,
    getConversation: unavailable,
    createConversation: unavailable,
    setConversationParticipant: unavailable,
    listConversationMessages: unavailable,
    sendConversationMessage: unavailable,
    updateMessageResponse: unavailable,
    addMessageReaction: unavailable,
    removeMessageReaction: unavailable,
    markConversationRead: unavailable,
    listCollaborationEvents: unavailable,
    listBoards: unavailable,
    getBoard: unavailable,
    createBoard: unavailable,
    listInbox: unavailable,
    captureInboxItem: unavailable,
    updateInboxItem: unavailable,
    convertInboxItem: unavailable,
    listItems: unavailable,
    getItem: unavailable,
    createItem: unavailable,
    updateItem: unavailable,
    listItemHistory: unavailable,
    listItemEvidence: unavailable,
    addItemEvidence: unavailable,
    assignItem: unavailable,
    setItemBlocked: unavailable,
    transitionDecision: unavailable,
    transitionApproval: unavailable,
    resolveItem: unavailable,
    createWaiting: unavailable,
    listWeeklyReviews: unavailable,
    listSnapshots: unavailable,
    getOperationsStatus: unavailable,
    getPrivacyProgram: unavailable,
    listPrivacyRequests: unavailable,
    createPrivacyRequest: unavailable,
    cancelPrivacyRequest: unavailable,
    updateRetentionPolicy: unavailable,
    search: unavailable,
    exportOrganization: unavailable,
    exportBoardCsv: unavailable,
  } satisfies DataPlane;
  const accessResolver: AccessResolver = {
    mode: "live",
    async resolve() {
      return unavailable();
    },
  };
  return { dataPlane, accessResolver };
}

function identityRepositories(
  dependencies: ApiAppDependencies,
  context: ApiContext,
) {
  if (!dependencies.repositories || !dependencies.authIdentityResolver)
    throw new DataPlaneError(
      "capability_unavailable",
      "Live identity repositories are not configured.",
    );
  return dependencies.repositories.forIdentity(
    createIdentityScope({
      authUserId: context.get("authIdentity").authUserId,
      requestId: context.get("requestId"),
    }),
  );
}

function organizationRepositories(
  dependencies: ApiAppDependencies,
  context: ApiContext,
): OrganizationScopedRepositories {
  if (!dependencies.repositories)
    throw new DataPlaneError(
      "capability_unavailable",
      "Live organization repositories are not configured.",
    );
  const access = context.get("access");
  return dependencies.repositories.forOrganization(
    createOrganizationScope({
      organizationId: access.organizationId,
      userId: access.userId,
      requestId: context.get("requestId"),
    }),
  );
}

function platformRepositories(
  dependencies: ApiAppDependencies,
  context: ApiContext,
) {
  if (!dependencies.repositories) throw new PlatformAccessError();
  return dependencies.repositories.forPlatform(
    createPlatformScope({
      actorUserId: context.get("access").userId,
      requestId: context.get("requestId"),
    }),
  );
}

function requirePlatformOwner(context: ApiContext): void {
  if (context.get("session").platformRole !== "owner")
    throw new PlatformAccessError();
}

function requireOrganizationManagement(access: AccessContext): void {
  requireAccess(access, "manage_members", "settings", {
    organizationId: access.organizationId,
  });
}

function identityResolutionFailure(
  status: Exclude<IdentityResolution["status"], "active">,
): DataPlaneError {
  if (status === "verification_required")
    return new DataPlaneError(
      "identity_verification_required",
      "Verify your email before accessing TREVV.",
    );
  if (status === "invitation_acceptance_required")
    return new DataPlaneError(
      "invitation_acceptance_required",
      "Accept your pending invitation before continuing.",
    );
  if (status === "onboarding_required")
    return new DataPlaneError(
      "onboarding_required",
      "Complete onboarding before accessing organization data.",
    );
  if (status === "organization_selection_required")
    return new DataPlaneError(
      "organization_selection_required",
      "Choose one of your organizations before continuing.",
    );
  return new DataPlaneError(
    "identity_access_unavailable",
    "This account does not have active organization access.",
  );
}

function sessionFromIdentity(
  resolved: Extract<IdentityResolution, { status: "active" }>,
  identity: ResolvedAuthIdentity,
): Session {
  return {
    user: {
      id: resolved.appUser.id,
      email: resolved.appUser.email,
      name: resolved.appUser.name,
      role: resolved.membership.role,
      locale: resolved.appUser.locale === "de" ? "de" : "en",
    },
    organizationId: resolved.organization.id,
    organization: {
      id: resolved.organization.id,
      name: resolved.organization.name,
      slug: resolved.organization.slug,
      role: resolved.membership.role,
      timezone: resolved.organization.timezone,
    },
    availableOrganizations: resolved.availableOrganizations,
    managedWorkspaceIds: resolved.managedWorkspaceIds,
    expiresAt: identity.expiresAt.toISOString(),
    ...(resolved.platformRole ? { platformRole: resolved.platformRole } : {}),
  };
}

function onboardingState(
  progress: OnboardingProgressProjection | null,
  now: Date,
): OnboardingState {
  if (!progress)
    return {
      status: "not_started",
      step: 1,
      draft: {},
      version: 0,
      updatedAt: now.toISOString(),
    };
  return {
    status: progress.status,
    step: onboardingStep(progress.step),
    draft: progress.draft,
    version: progress.version,
    updatedAt: progress.updatedAt.toISOString(),
    ...(progress.completedAt
      ? { completedAt: progress.completedAt.toISOString() }
      : {}),
    ...(progress.result
      ? {
          organizationId: progress.result.organizationId,
          portfolioId: progress.result.portfolioId,
          workspaceId: progress.result.workspaceId,
          boardId: progress.result.boardId,
          blueprintInstanceId: progress.result.blueprintInstanceId,
        }
      : {}),
  };
}

function onboardingStep(value: number): OnboardingState["step"] {
  if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5)
    return value;
  throw new DataPlaneError(
    "repository_unavailable",
    "Stored onboarding progress contains an invalid step.",
  );
}

function repositoryOnboardingDraft(
  input: z.infer<typeof onboardingDraftSchema>,
): RepositoryOnboardingDraft {
  return {
    step: input.step,
    ...(input.organizationName === undefined
      ? {}
      : { organizationName: input.organizationName }),
    ...(input.organizationSlug === undefined
      ? {}
      : { organizationSlug: input.organizationSlug }),
    ...(input.workspaceName === undefined
      ? {}
      : { workspaceName: input.workspaceName }),
    ...(input.workspaceSlug === undefined
      ? {}
      : { workspaceSlug: input.workspaceSlug }),
    ...(input.workspaceType === undefined
      ? {}
      : { workspaceType: input.workspaceType }),
    ...(input.workspaceColor === undefined
      ? {}
      : { workspaceColor: input.workspaceColor }),
    ...(input.blueprintKey === undefined
      ? {}
      : { blueprintKey: input.blueprintKey }),
  };
}

function invitationDto(row: InvitationProjection, now: Date): Invitation {
  const status: Invitation["status"] = row.acceptedAt
    ? "accepted"
    : row.revokedAt
      ? "revoked"
      : row.expiresAt.getTime() <= now.getTime()
        ? "expired"
        : "pending";
  return {
    id: row.id,
    organizationId: row.organizationId,
    email: row.email,
    role: row.role === "owner" ? "admin" : row.role,
    status,
    deliveryStatus: row.deliveryStatus,
    version: row.version,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.acceptedAt ? { acceptedAt: row.acceptedAt.toISOString() } : {}),
    ...(row.revokedAt ? { revokedAt: row.revokedAt.toISOString() } : {}),
    ...(row.lastSentAt ? { lastSentAt: row.lastSentAt.toISOString() } : {}),
    ...(row.workspaceId ? { workspaceId: row.workspaceId } : {}),
    ...(row.teamId ? { teamId: row.teamId } : {}),
  };
}

function membershipDto(
  membership: {
    organizationId: string;
    role: Membership["role"];
    archivedAt: Date | null;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  },
  user: { id: string; email: string; name: string },
): Membership {
  return {
    organizationId: membership.organizationId,
    user: { id: user.id, email: user.email, name: user.name },
    role: membership.role,
    active: membership.archivedAt === null && membership.deletedAt === null,
    createdAt: membership.createdAt.toISOString(),
    updatedAt: membership.updatedAt.toISOString(),
  };
}

async function deliverInvitation(
  dependencies: ApiAppDependencies,
  repositories: OrganizationScopedRepositories,
  invitation: InvitationProjection,
  token: string,
  mutation: ApiMutationContext,
): Promise<InvitationProjection> {
  if (
    !dependencies.mailDelivery ||
    !dependencies.mailFrom ||
    !dependencies.webOrigin
  )
    throw new DataPlaneError(
      "capability_unavailable",
      "Invitation delivery is not configured.",
    );
  const acceptUrl = new URL("/invite/accept", dependencies.webOrigin);
  acceptUrl.searchParams.set("token", token);
  let delivery: { status: "sent" } | { status: "failed"; errorCode: string };
  try {
    await dependencies.mailDelivery.deliver({
      from: dependencies.mailFrom,
      to: invitation.email,
      subject: "You are invited to TREVV",
      text: `Accept your TREVV invitation by opening this link:\n\n${acceptUrl.toString()}\n\nThis one-time link expires at ${invitation.expiresAt.toISOString()}.`,
    });
    delivery = { status: "sent" };
  } catch {
    delivery = { status: "failed", errorCode: "delivery_failed" };
  }
  const recorded = await repositories.invitations.recordDelivery(
    invitation.id,
    invitation.version,
    delivery,
    {
      method: "POST",
      route: "/api/v1/invitations/:id/delivery",
      now: mutation.now,
      responseStatus: 200,
    },
    mutation,
  );
  return recorded.value;
}

function invitationToken(): string {
  return randomBytes(32).toString("base64url");
}

function isUnsafeMethod(method: string): boolean {
  return !new Set(["GET", "HEAD", "OPTIONS"]).has(method.toUpperCase());
}

function withoutTrailingSlash(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/u, "") : pathname;
}

function hasTrustedMutationOrigin(
  suppliedOrigin: string | undefined,
  configuredOrigin: string | undefined,
  fetchSite: string | undefined,
): boolean {
  if (!configuredOrigin) return false;
  if (suppliedOrigin) {
    try {
      return (
        new URL(suppliedOrigin).origin === new URL(configuredOrigin).origin
      );
    } catch {
      return false;
    }
  }
  return fetchSite === "same-origin";
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
  required: true,
): string | Response;
function readIdempotencyKey(
  context: {
    req: { header(name: string): string | undefined };
    get(name: "requestId"): string;
  },
  required: false,
): string | undefined | Response;
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
  operations?: ApiOperations,
): Response {
  const code = dataPlaneErrorCode(error);
  if (error instanceof PermissionError || code === "resource_not_found")
    return failure(
      context,
      404,
      "resource_not_found",
      "The requested resource is unavailable.",
    );
  if (error instanceof PlatformAccessError)
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
  if (code === "constraint_conflict" || code === "onboarding_conflict")
    return failure(context, 409, code, error.message);
  if (code === "invitation_invalid")
    return failure(
      context,
      404,
      "resource_not_found",
      "The requested resource is unavailable.",
    );
  if (
    code === "identity_verification_required" ||
    code === "identity_not_verified"
  )
    return failure(
      context,
      403,
      "identity_verification_required",
      "Verify your email before accessing TREVV.",
    );
  if (
    code === "invitation_acceptance_required" ||
    code === "onboarding_required" ||
    code === "organization_selection_required"
  )
    return failure(context, 409, code, error.message);
  if (code === "identity_access_unavailable")
    return failure(context, 403, code, error.message);
  if (code === "repository_unavailable")
    return failure(context, 503, code, error.message);
  if (code === "rate_limited") {
    const details = dataPlaneErrorDetails(error);
    const response = failure(context, 429, code, error.message, details);
    const retryAfterSeconds = details?.retryAfterSeconds;
    if (
      Number.isSafeInteger(retryAfterSeconds) &&
      Number(retryAfterSeconds) > 0
    )
      response.headers.set("retry-after", String(retryAfterSeconds));
    return response;
  }
  if (code === "invitation_delivery_incomplete")
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
  const requestId = context.get("requestId");
  observe(() => operations?.metrics?.recordUnhandledError());
  observe(() =>
    operations?.logger?.write({
      level: "error",
      service: "trevv-api",
      event: "unhandled_error",
      requestId,
      errorCode: code || "internal_error",
      errorName: error.name,
    }),
  );
  observe(() =>
    operations?.errorReporter?.capture({
      service: "trevv-api",
      requestId,
      errorCode: code || "internal_error",
      errorName: error.name,
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

function validationFailure(
  context: { get(name: "requestId"): string },
  message: string,
  issues: unknown,
): Response {
  return failure(context, 422, "validation_error", message, { issues });
}

function queryValidation(message: string) {
  return (
    result:
      { success: true } | { success: false; error: { issues: unknown[] } },
    context: Context,
  ) =>
    result.success
      ? undefined
      : validationFailure(
          context as unknown as ApiContext,
          message,
          result.error.issues,
        );
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

function observe(operation: () => void): void {
  try {
    operation();
  } catch {
    // Telemetry is deliberately best-effort and cannot change product state.
  }
}
