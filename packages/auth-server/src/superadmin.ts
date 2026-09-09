import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { twoFactor } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { MailDelivery } from "./mail.js";

export const superadminAuthBasePath = "/api/superadmin/auth";
export const superadminCookiePrefix = "trevv_superadmin";
export type SuperadminRole = "owner" | "operator" | "auditor";
export interface SuperadminIdentity {
  id: string;
  name: string;
  email: string;
  role: SuperadminRole;
  phoneNumber: string | null;
  twoFactorEnabled: boolean;
  sessionId: string;
  expiresAt: string;
  assuranceAt: string | null;
}

export interface SuperadminAuthEnvironment {
  databaseUrl: string;
  baseUrl: string;
  webOrigin: string;
  secret: string;
  mailDelivery: MailDelivery;
  mailFrom: string;
}

const publicOperations = new Set([
  "POST /sign-up/email",
  "POST /sign-in/email",
  "POST /sign-out",
  "POST /request-password-reset",
  "POST /reset-password",
  "POST /two-factor/verify-totp",
  "POST /two-factor/verify-backup-code",
  "GET /passkey/generate-authenticate-options",
  "POST /passkey/verify-authentication",
]);
const securityOperations = new Set([
  "POST /two-factor/enable",
  "POST /two-factor/generate-backup-codes",
  "POST /change-password",
  "GET /passkey/list-user-passkeys",
  "GET /passkey/generate-register-options",
  "POST /passkey/verify-registration",
  "POST /passkey/delete-passkey",
  "POST /passkey/update-passkey",
]);
const factorPaths = new Set([
  "/two-factor/verify-totp",
  "/two-factor/verify-backup-code",
  "/passkey/verify-authentication",
]);

export function createSuperadminAuthRuntime(
  environment: SuperadminAuthEnvironment,
) {
  const pool = new Pool({ connectionString: environment.databaseUrl, max: 5 });
  const auth = betterAuth({
    appName: "TREVV Superadmin",
    baseURL: environment.webOrigin,
    basePath: superadminAuthBasePath,
    secret: environment.secret,
    logger: { disabled: true },
    database: pool,
    trustedOrigins: [environment.webOrigin],
    user: {
      modelName: "superadmin_user",
      additionalFields: {
        role: { type: "string", input: false, defaultValue: "auditor" },
        disabled: {
          type: "boolean",
          input: false,
          defaultValue: false,
          returned: false,
        },
        phoneNumber: { type: "string", input: false, required: false },
        admissionTokenHash: {
          type: "string",
          input: false,
          required: false,
          returned: false,
        },
      },
    },
    session: {
      modelName: "superadmin_session",
      expiresIn: 4 * 60 * 60,
      updateAge: 0,
      disableSessionRefresh: true,
      freshAge: 10 * 60,
      cookieCache: { enabled: false },
      additionalFields: {
        assuranceAt: {
          type: "date",
          required: false,
          input: false,
          returned: false,
        },
      },
    },
    account: {
      modelName: "superadmin_account",
      accountLinking: { enabled: false },
    },
    verification: { modelName: "superadmin_verification" },
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      requireEmailVerification: true,
      minPasswordLength: 14,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 30 * 60,
      async sendResetPassword({ user, token }) {
        const link = new URL(
          "/superadmin/reset-password",
          environment.webOrigin,
        );
        link.hash = new URLSearchParams({ token }).toString();
        await environment.mailDelivery.deliver({
          from: environment.mailFrom,
          to: user.email,
          subject: "Reset your TREVV Superadmin password",
          text: `Reset your administrator password using this link within 30 minutes:\n\n${link}\n\nYour authenticator or recovery code is still required. If you did not request this, ignore this message.`,
          html: `<p>Reset your administrator password within 30 minutes.</p><p><a href="${link}">Reset administrator password</a></p><p>Your authenticator or recovery code is still required.</p>`,
        });
      },
    },
    advanced: {
      cookiePrefix: superadminCookiePrefix,
      useSecureCookies: environment.webOrigin.startsWith("https://"),
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "strict",
        path: "/",
      },
      ipAddress: { disableIpTracking: true },
    },
    plugins: [
      twoFactor({
        issuer: "TREVV Superadmin",
        twoFactorCookieMaxAge: 300,
        schema: { twoFactor: { modelName: "superadmin_two_factor" } },
        backupCodeOptions: { storeBackupCodes: "encrypted" },
      }),
      passkey({
        rpID: new URL(environment.webOrigin).hostname,
        rpName: "TREVV Superadmin",
        origin: environment.webOrigin,
        authenticatorSelection: {
          residentKey: "required",
          userVerification: "required",
        },
        schema: { passkey: { modelName: "superadmin_passkey" } },
        authentication: {
          afterVerification: async ({ verification }) => {
            if (!verification.authenticationInfo.userVerified)
              throw new APIError("UNAUTHORIZED", {
                message: "Passkey user verification is required.",
              });
          },
        },
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          before: async (_user, context) => {
            const token = context?.request?.headers.get(
              "x-superadmin-invitation",
            );
            if (
              context?.path !== "/sign-up/email" ||
              !token ||
              !/^[A-Za-z0-9_-]{43}$/u.test(token)
            )
              throw new APIError("FORBIDDEN", {
                message: "An administrator invitation is required.",
              });
            // A database trigger atomically consumes the invitation and assigns the
            // stored role. No request-supplied email, role or verification flag grants access.
            return {
              data: {
                admissionTokenHash: createHash("sha256")
                  .update(token)
                  .digest("hex"),
              },
            };
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const result = await pool.query(
              'select id from superadmin_user where id = $1 and disabled = false and "emailVerified" = true',
              [session.userId],
            );
            if (result.rowCount !== 1) return false;
            return {
              data: { assuranceAt: null, ipAddress: null, userAgent: null },
            };
          },
        },
      },
    },
    hooks: {
      after: createAuthMiddleware(async (context) => {
        if (context.context.returned instanceof APIError) return;
        const session = context.context.newSession ?? context.context.session;
        if (!session) return;
        if (factorPaths.has(context.path)) {
          const changed = await pool.query(
            'update superadmin_session set "assuranceAt" = now() where id = $1 and "userId" = $2 returning id',
            [session.session.id, session.user.id],
          );
          if (changed.rowCount !== 1)
            throw new APIError("UNAUTHORIZED", {
              message: "Administrator session is unavailable.",
            });
          await pool.query(
            "insert into superadmin_audit (id, actor_id, action, target_type, target_id, reason, request_id) values ($1, $2, $3, $4, $2, $5, $6)",
            [
              randomUUID(),
              session.user.id,
              "security.factor_verified",
              "administrator",
              "Administrator completed factor verification.",
              randomUUID(),
            ],
          );
        } else if (securityOperations.has(`POST ${context.path}`)) {
          await pool.query(
            "insert into superadmin_audit (id, actor_id, action, target_type, target_id, reason, request_id) values ($1, $2, $3, $4, $2, $5, $6)",
            [
              randomUUID(),
              session.user.id,
              `security.${context.path.slice(1).replaceAll("/", ".")}`,
              "administrator",
              "Administrator updated an authentication method.",
              randomUUID(),
            ],
          );
        }
      }),
    },
  });

  async function resolve(request: Request): Promise<SuperadminIdentity | null> {
    const session = await auth.api.getSession({
      headers: request.headers,
      query: { disableCookieCache: true, disableRefresh: true },
    });
    if (!session) return null;
    const result = await pool.query<{
      id: string;
      name: string;
      email: string;
      role: SuperadminRole;
      phoneNumber: string | null;
      twoFactorEnabled: boolean;
      assuranceAt: Date | null;
      expiresAt: Date;
    }>(
      `select u.id, u.name, u.email, u.role, u."phoneNumber", u."twoFactorEnabled", s."assuranceAt", s."expiresAt"
        from superadmin_user u join superadmin_session s on s."userId" = u.id
        where u.id = $1 and s.id = $2 and not u.disabled and u."emailVerified" and s."expiresAt" > now()`,
      [session.user.id, session.session.id],
    );
    const row = result.rows[0];
    return row
      ? {
          ...row,
          sessionId: session.session.id,
          expiresAt: row.expiresAt.toISOString(),
          assuranceAt: row.assuranceAt?.toISOString() ?? null,
        }
      : null;
  }

  return {
    resolve,
    async handler(request: Request): Promise<Response> {
      const path = new URL(request.url).pathname.slice(
        superadminAuthBasePath.length,
      );
      const operation = `${request.method} ${path}`;
      if (
        !publicOperations.has(operation) &&
        !securityOperations.has(operation)
      )
        return Response.json({ message: "Not found." }, { status: 404 });
      if (request.method !== "GET") {
        const origin = request.headers.get("origin");
        if (
          origin !== environment.webOrigin ||
          request.headers.get("sec-fetch-site") === "cross-site"
        )
          return Response.json(
            { message: "Request origin is not allowed." },
            { status: 403 },
          );
        const parsedBody: unknown = await request
          .clone()
          .json()
          .catch(() => null);
        if (
          !parsedBody ||
          typeof parsedBody !== "object" ||
          Array.isArray(parsedBody)
        )
          return Response.json(
            { message: "A JSON object is required." },
            { status: 400 },
          );
        const body = parsedBody as Record<string, unknown>;
        if (path === "/sign-up/email") {
          const token = request.headers.get("x-superadmin-invitation") ?? "";
          const email =
            typeof body.email === "string"
              ? body.email.trim().toLowerCase()
              : "";
          if (!/^[A-Za-z0-9_-]{43}$/u.test(token))
            return Response.json(
              { message: "An administrator invitation is required." },
              { status: 403 },
            );
          const admission = await pool.query(
            `select i.id from superadmin_invitations i
            where i.token_hash = $1 and lower(i.email) = $2 and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
              and not exists (select 1 from superadmin_user where lower(email) = $2)
              and (i.invited_by is null or exists (select 1 from superadmin_user u where u.id = i.invited_by and u.role = 'owner' and not u.disabled))`,
            [createHash("sha256").update(token).digest("hex"), email],
          );
          if (admission.rowCount !== 1)
            return Response.json(
              { message: "Administrator invitation is unavailable." },
              { status: 403 },
            );
        }
        if (body.trustDevice === true)
          return Response.json(
            { message: "Administrator sign-in always requires verification." },
            { status: 400 },
          );
      }
      if (securityOperations.has(operation)) {
        const identity = await resolve(request);
        if (!identity)
          return Response.json(
            { message: "Sign in to continue." },
            { status: 401 },
          );
        const enrolling =
          path === "/two-factor/enable" && !identity.twoFactorEnabled;
        if (!enrolling && !recentSuperadminAuthentication(identity))
          return Response.json(
            {
              message: "Verify your authenticator again to continue.",
              code: "reauthentication_required",
            },
            { status: 403 },
          );
      }
      const response = await auth.handler(request);
      // Never return bearer tokens or credential records to browser JavaScript.
      if (response.headers.get("content-type")?.includes("application/json")) {
        let value = (await response.json()) as unknown;
        if (path === "/passkey/list-user-passkeys" && Array.isArray(value))
          value = value.map((key) => ({
            id: key.id,
            name: key.name,
            createdAt: key.createdAt,
          }));
        else if (value && typeof value === "object") {
          const record = value as Record<string, unknown>;
          delete record.token;
          delete record.session;
          delete record.publicKey;
          delete record.credentialID;
        }
        return Response.json(value, {
          status: response.status,
          headers: response.headers,
        });
      }
      return response;
    },
    close: () => pool.end(),
  };
}

export function recentSuperadminAuthentication(
  identity: SuperadminIdentity,
  now = Date.now(),
): boolean {
  if (!identity.twoFactorEnabled || !identity.assuranceAt) return false;
  const age = now - Date.parse(identity.assuranceAt);
  return Number.isFinite(age) && age >= 0 && age <= 10 * 60_000;
}
