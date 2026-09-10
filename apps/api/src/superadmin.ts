import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import {
  createSuperadminOrganizationSchema,
  superadminContactSearchSchema,
  type RuntimeReleaseMetadata,
  inviteSuperadminSchema,
  superadminDirectoryKindSchema,
  superadminDirectoryFilters,
  superadminDirectoryQuerySchema,
  superadminOrganizationUpdateSchema,
  superadminContactInputSchema,
  superadminContactDeleteSchema,
  superadminPhoneSchema,
  superadminReasonInputSchema,
  updateSuperadminSchema,
} from "@founderhq/api-contract";
import {
  type MailDelivery,
  type SuperadminIdentity,
} from "@founderhq/auth-server";
import {
  createSuperadminRepositories,
  SuperadminError,
  type SuperadminScope,
} from "@founderhq/db";

type Repositories = ReturnType<typeof createSuperadminRepositories>;
export interface SuperadminApiDependencies {
  auth: {
    handler(request: Request): Promise<Response>;
    resolve(request: Request): Promise<SuperadminIdentity | null>;
  };
  repositories(scope: SuperadminScope): Repositories;
  webOrigin: string;
  releaseMetadata?: RuntimeReleaseMetadata | null;
  registrationMode?: "closed" | "invite_only" | "public";
  mailDelivery: MailDelivery;
  mailFrom: string;
  recordDelivery(
    kind: "administrator" | "organization",
    id: string,
    token: string,
    sent: boolean,
  ): Promise<void>;
  onError?: (error: Error) => void;
}

export function createSuperadminApi(dependencies: SuperadminApiDependencies) {
  const app = new Hono<{
    Variables: { identity: SuperadminIdentity; repositories: Repositories };
  }>();
  app.use("*", async (context, next) => {
    context.header("cache-control", "private, no-store, max-age=0");
    context.header("pragma", "no-cache");
    context.header("referrer-policy", "no-referrer");
    context.header("x-robots-tag", "noindex, nofollow, noarchive");
    context.header("vary", "Cookie");
    if (
      !new Set(["GET", "HEAD"]).has(context.req.method) &&
      (context.req.header("origin") !== dependencies.webOrigin ||
        context.req.header("sec-fetch-site") === "cross-site")
    )
      return context.json({ message: "Request origin is not allowed." }, 403);
    await next();
  });
  app.use(
    "*",
    bodyLimit({
      maxSize: 32 * 1024,
      onError: (context) =>
        context.json({ message: "Request is too large." }, 413),
    }),
  );
  app.onError((error, context) => {
    if (error instanceof SuperadminError)
      return context.json(
        { message: error.message, code: error.code },
        error.status,
      );
    if (error instanceof z.ZodError)
      return context.json(
        {
          message:
            context.req.method === "GET"
              ? "Review the search and filter values for this directory."
              : "Review the form fields and provide a reason of 10–240 characters.",
        },
        400,
      );
    const cause = error.cause as
      { code?: string; constraint_name?: string } | undefined;
    if (
      cause?.code === "23505" ||
      (error as { code?: string }).code === "23505"
    )
      return context.json(
        {
          message:
            cause?.constraint_name === "superadmin_org_primary_contact_unique"
              ? "This organisation already has a primary contact. Change that contact’s responsibility before adding another."
              : "This record already exists. Review the directory before retrying.",
        },
        409,
      );
    dependencies.onError?.(error);
    return context.json(
      { message: "The administrator service could not complete this request." },
      503,
    );
  });
  app.on(["GET", "POST"], "/auth/*", (context) =>
    dependencies.auth.handler(context.req.raw),
  );
  app.use("*", async (context, next) => {
    const identity = await dependencies.auth.resolve(context.req.raw);
    if (!identity)
      return context.json(
        { message: "Administrator sign-in is required." },
        401,
      );
    context.set("identity", identity);
    if (context.req.path.endsWith("/session") && context.req.method === "GET") {
      await next();
      return;
    }
    if (!identity.twoFactorEnabled || !identity.assuranceAt)
      return context.json(
        {
          message: "Complete administrator security setup to continue.",
          code: "factor_required",
        },
        403,
      );
    const suppliedRequestId = context.req.header("x-request-id");
    const requestId =
      suppliedRequestId && /^[A-Za-z0-9_-]{1,100}$/u.test(suppliedRequestId)
        ? suppliedRequestId
        : crypto.randomUUID();
    context.set(
      "repositories",
      dependencies.repositories({
        administratorId: identity.id,
        sessionId: identity.sessionId,
        requestId,
      }),
    );
    await next();
  });
  app.get("/session", (context) => {
    const { sessionId: _sessionId, ...identity } = context.get("identity");
    return context.json(identity);
  });
  app.get("/overview", async (context) =>
    context.json({
      ...(await context.get("repositories").overview()),
      operations: {
        release: dependencies.releaseMetadata ?? null,
        registrationMode: dependencies.registrationMode ?? "closed",
        generatedAt: new Date().toISOString(),
      },
    }),
  );
  app.get("/directory/:kind", async (context) => {
    const kind = superadminDirectoryKindSchema.parse(context.req.param("kind"));
    const input = superadminDirectoryQuerySchema.parse(context.req.query());
    z.enum(superadminDirectoryFilters[kind]).parse(input.filter);
    if (input.organizationId && kind !== "people" && kind !== "invitations")
      return context.json(
        {
          message: "Organisation filtering is unavailable for this directory.",
        },
        400,
      );
    return context.json(
      await context
        .get("repositories")
        .directory(kind, input.page, input.q, input),
    );
  });
  app.post("/directory/:kind/search", async (context) => {
    const kind = z
      .enum(["people", "invitations"])
      .parse(context.req.param("kind"));
    const input = superadminContactSearchSchema.parse(await context.req.json());
    z.enum(superadminDirectoryFilters[kind]).parse(input.filter);
    return context.json(
      await context.get("repositories").directory(kind, input.page, input.q, {
        ...input,
        protectedSearchReason: input.reason,
      }),
    );
  });
  app.post("/invitations/:id/reveal", async (context) => {
    const { reason } = superadminReasonInputSchema.parse(
      await context.req.json(),
    );
    return context.json(
      await context
        .get("repositories")
        .revealInvitation(context.req.param("id"), reason),
    );
  });
  const organizationId = (value: string) =>
    z.string().min(1).max(128).parse(value);
  app.get("/organizations/:id", async (context) =>
    context.json(
      await context
        .get("repositories")
        .organization(organizationId(context.req.param("id"))),
    ),
  );
  app.patch("/organizations/:id", async (context) =>
    context.json(
      await context
        .get("repositories")
        .updateOrganization(
          organizationId(context.req.param("id")),
          superadminOrganizationUpdateSchema.parse(await context.req.json()),
        ),
    ),
  );
  app.post("/organizations/:id/contacts", async (context) =>
    context.json(
      await context
        .get("repositories")
        .saveOrganizationContact(
          organizationId(context.req.param("id")),
          null,
          superadminContactInputSchema.parse(await context.req.json()),
        ),
      201,
    ),
  );
  app.patch("/organizations/:id/contacts/:contactId", async (context) =>
    context.json(
      await context
        .get("repositories")
        .saveOrganizationContact(
          organizationId(context.req.param("id")),
          organizationId(context.req.param("contactId")),
          superadminContactInputSchema.parse(await context.req.json()),
        ),
    ),
  );
  app.post("/organizations/:id/contacts/:contactId/reveal", async (context) => {
    const { reason } = superadminReasonInputSchema.parse(
      await context.req.json(),
    );
    return context.json(
      await context
        .get("repositories")
        .revealOrganizationContact(
          organizationId(context.req.param("id")),
          organizationId(context.req.param("contactId")),
          reason,
        ),
    );
  });
  app.delete("/organizations/:id/contacts/:contactId", async (context) => {
    const { reason, version } = superadminContactDeleteSchema.parse(
      await context.req.json(),
    );
    return context.json(
      await context
        .get("repositories")
        .deleteOrganizationContact(
          organizationId(context.req.param("id")),
          organizationId(context.req.param("contactId")),
          version,
          reason,
        ),
    );
  });
  app.post("/organizations", async (context) => {
    const input = createSuperadminOrganizationSchema.parse(
      await context.req.json(),
    );
    const invitation = await context
      .get("repositories")
      .createOrganization(input);
    const sent = await deliverOrganizationInvitation(dependencies, invitation);
    return context.json(
      {
        id: invitation.id,
        invitationId: invitation.invitationId,
        deliveryStatus: sent ? "sent" : "failed",
      },
      201,
    );
  });
  app.post("/people/:id/reveal", async (context) => {
    const { reason } = superadminReasonInputSchema.parse(
      await context.req.json(),
    );
    return context.json(
      await context
        .get("repositories")
        .revealPerson(context.req.param("id"), reason),
    );
  });
  app.post("/people/:id/revoke-sessions", async (context) => {
    const { reason } = superadminReasonInputSchema.parse(
      await context.req.json(),
    );
    return context.json(
      await context
        .get("repositories")
        .revokeCustomerSessions(context.req.param("id"), reason),
    );
  });
  app.post("/invitations/:id/resend", async (context) => {
    const { reason } = superadminReasonInputSchema.parse(
      await context.req.json(),
    );
    const invitation = await context
      .get("repositories")
      .resendOrganizationInvitation(context.req.param("id"), reason);
    const sent = await deliverOrganizationInvitation(dependencies, invitation);
    return context.json({ deliveryStatus: sent ? "sent" : "failed" });
  });
  app.post("/invitations/:id/revoke", async (context) => {
    const { reason } = superadminReasonInputSchema.parse(
      await context.req.json(),
    );
    return context.json(
      await context
        .get("repositories")
        .revokeOrganizationInvitation(context.req.param("id"), reason),
    );
  });
  app.get("/administrator-invitations", async (context) =>
    context.json(await context.get("repositories").administratorInvitations()),
  );
  app.post("/administrator-invitations", async (context) => {
    const input = inviteSuperadminSchema.parse(await context.req.json());
    const invitation = await context
      .get("repositories")
      .inviteAdministrator(input.email, input.role, input.reason);
    const sent = await deliverAdministratorInvitation(dependencies, invitation);
    return context.json(
      { id: invitation.id, deliveryStatus: sent ? "sent" : "failed" },
      201,
    );
  });
  app.post("/administrator-invitations/:id/revoke", async (context) => {
    const { reason } = superadminReasonInputSchema.parse(
      await context.req.json(),
    );
    return context.json(
      await context
        .get("repositories")
        .revokeAdministratorInvitation(context.req.param("id"), reason),
    );
  });
  app.patch("/administrators/:id", async (context) => {
    const input = updateSuperadminSchema.parse(await context.req.json());
    return context.json(
      await context
        .get("repositories")
        .updateAdministrator(
          context.req.param("id"),
          input.role,
          input.disabled,
          input.reason,
        ),
    );
  });
  app.patch("/security/phone", async (context) => {
    const input = superadminPhoneSchema.parse(await context.req.json());
    return context.json(
      await context.get("repositories").updatePhone(input.phoneNumber),
    );
  });
  app.get("/security/sessions", async (context) =>
    context.json(await context.get("repositories").sessions()),
  );
  app.post("/security/revoke-sessions", async (context) =>
    context.json(await context.get("repositories").revokeOwnSessions()),
  );
  return app;
}

export async function deliverAdministratorInvitation(
  dependencies: Pick<
    SuperadminApiDependencies,
    "webOrigin" | "mailDelivery" | "mailFrom" | "recordDelivery"
  >,
  invitation: { id: string; email: string; token: string },
) {
  const link = new URL("/superadmin/activate", dependencies.webOrigin);
  link.hash = new URLSearchParams({
    token: invitation.token,
    email: invitation.email,
  }).toString();
  let sent = false;
  try {
    await dependencies.mailDelivery.deliver({
      from: dependencies.mailFrom,
      to: invitation.email,
      subject: "Your private TREVV Superadmin invitation",
      text: `You have been invited to administer TREVV. This identity is separate from your TREVV workspace account.\n\nActivate within 24 hours:\n${link}\n\nYou will choose a password and enroll an authenticator. Do not forward this invitation.`,
    });
    sent = true;
  } catch {
    /* Delivery state is shown without exposing mail-provider details. */
  }
  await dependencies.recordDelivery(
    "administrator",
    invitation.id,
    invitation.token,
    sent,
  );
  return sent;
}

async function deliverOrganizationInvitation(
  dependencies: SuperadminApiDependencies,
  invitation: {
    invitationId: string;
    email: string;
    token: string;
    organizationName: string;
  },
) {
  const link = new URL("/invite/accept", dependencies.webOrigin);
  link.searchParams.set("token", invitation.token);
  let sent = false;
  try {
    await dependencies.mailDelivery.deliver({
      from: dependencies.mailFrom,
      to: invitation.email,
      subject: "Your TREVV organisation invitation",
      text: `You are invited to join ${invitation.organizationName} on TREVV.\n\nAccept within seven days:\n${link}\n\nThis invitation does not grant platform administration access.`,
    });
    sent = true;
  } catch {
    /* Report a delivery failure independently from organisation creation. */
  }
  await dependencies.recordDelivery(
    "organization",
    invitation.invitationId,
    invitation.token,
    sent,
  );
  return sent;
}
