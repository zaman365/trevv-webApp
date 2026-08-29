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
  createInvitationSchema,
  createItemSchema,
  createWaitingSchema,
  createWorkspaceSchema,
  decisionTransitionSchema,
  idSchema,
  idempotencyKeySchema,
  onboardingDraftSchema,
  organizationSelectionSchema,
  resolveWorkItemSchema,
  updateInboxItemSchema,
  updateItemSchema,
  updateMembershipSchema,
  waitingActionSchema,
  weeklyReviewInputSchema,
  workItemEvidenceInputSchema,
  type Invitation,
  type Membership,
  type OnboardingState,
  type Session,
} from "@founderhq/api-contract";
import { openApiDocument } from "@founderhq/api-contract/openapi";
import {
  createFileMailSink,
  createSmtpMailDelivery,
  createTrevvAuthRuntime,
  type AuthIdentityResolver,
  type MailDelivery,
  type ResolvedAuthIdentity,
} from "@founderhq/auth-server";
import {
  createDatabase,
  createIdentityScope,
  createOrganizationScope,
  createPostgresRepositories,
  hashInvitationToken,
  type IdentityResolution,
  type InvitationProjection,
  type OnboardingDraft as RepositoryOnboardingDraft,
  type OnboardingProgressProjection,
  type OrganizationScopedRepositories,
  type PostgresRepositories,
} from "@founderhq/db";
import {
  PermissionError,
  requireAccess,
  type AccessContext,
} from "@founderhq/permissions";
import { zValidator } from "@hono/zod-validator";
import { Hono, type Context } from "hono";
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
  authIdentityResolver?: AuthIdentityResolver;
  preMembershipPaths?: readonly string[];
  repositories?: PostgresRepositories;
  mailDelivery?: MailDelivery;
  mailFrom?: string;
  webOrigin?: string;
  invitationTtlMs?: number;
  corsOrigin?: string;
}

export function createApiApp(dependencies: ApiAppDependencies) {
  assertCoherentMode(dependencies);
  const clock = dependencies.clock ?? (() => new Date());
  const idGenerator = dependencies.idGenerator ?? (() => crypto.randomUUID());
  const api = new Hono<{ Variables: Variables }>();

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

  api.get("/api/v1/session", (context) => context.json(context.get("session")));

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
        ...parsed.data,
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
      acceptedAt: now.toISOString(),
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
  const configuration = readRuntimeConfiguration();
  if (configuration.mode === "demo")
    return { app: createDemoApiApp(), close: async () => undefined };
  const mailDelivery =
    configuration.mailTransport.kind === "test_file"
      ? createFileMailSink(configuration.mailTransport.filePath)
      : createSmtpMailDelivery(configuration.mailTransport.configuration);
  const database = createDatabase(configuration.databaseUrl);
  const repositories = createPostgresRepositories(database.db);
  const authRuntime = createTrevvAuthRuntime({
    databaseUrl: configuration.databaseUrl,
    baseUrl: configuration.authBaseUrl,
    secret: configuration.authSecret,
    trustedOrigins: [configuration.webOrigin],
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
      authIdentityResolver: authRuntime.identityResolver,
      preMembershipPaths: [
        "/api/v1/session/organizations",
        "/api/v1/session/organization",
        "/api/v1/onboarding",
        "/api/v1/onboarding/complete",
        "/api/v1/invitations/accept",
      ],
      repositories,
      mailDelivery,
      mailFrom: configuration.mailFrom,
      webOrigin: configuration.webOrigin,
      corsOrigin: configuration.webOrigin,
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
    createWorkspace: unavailable,
    getWorkspace: unavailable,
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
    expiresAt: identity.expiresAt.toISOString(),
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
