import { betterAuth } from "better-auth";
import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { MailDelivery } from "./mail.js";

export {
  createFileMailSink,
  createMemoryMailSink,
  createSmtpMailDelivery,
  type MailDelivery,
  type MailMessage,
  type MemoryMailSink,
  type SmtpMailConfiguration,
} from "./mail.js";

const AUTH_BASE_PATH = "/api/auth";
const EMAIL_VERIFICATION_PREFIX = "trevv-email-verification:";
const DEFAULT_EMAIL_VERIFICATION_TTL_SECONDS = 60 * 60;
const DEFAULT_PASSWORD_RESET_TTL_SECONDS = 60 * 60;

export interface AuthEnvironment {
  databaseUrl: string;
  baseUrl: string;
  secret: string;
  trustedOrigins: string[];
  mailDelivery: MailDelivery;
  mailFrom: string;
  cookieDomain?: string;
  appName?: string;
  emailVerificationTtlSeconds?: number;
  passwordResetTtlSeconds?: number;
}

export interface ResolvedAuthIdentity {
  authUserId: string;
  email: string;
  name: string;
  emailVerified: boolean;
  sessionId: string;
  expiresAt: Date;
}

export interface AuthIdentityResolver {
  resolve(request: Request): Promise<ResolvedAuthIdentity | null>;
}

export function createTrevvAuth(environment: AuthEnvironment) {
  return createTrevvAuthWithPool(
    environment,
    new Pool({ connectionString: environment.databaseUrl, max: 10 }),
  );
}

export function createTrevvAuthRuntime(environment: AuthEnvironment) {
  const pool = new Pool({ connectionString: environment.databaseUrl, max: 10 });
  const auth = createTrevvAuthWithPool(environment, pool);
  return {
    auth,
    handler: createSingleUseVerificationHandler(auth, pool, environment),
    identityResolver: createTrevvAuthIdentityResolver(auth),
    async close() {
      await Promise.all([
        pool.end(),
        environment.mailDelivery.close?.() ?? Promise.resolve(),
      ]);
    },
  };
}

function createTrevvAuthWithPool(environment: AuthEnvironment, pool: Pool) {
  const verificationTtl =
    environment.emailVerificationTtlSeconds ??
    DEFAULT_EMAIL_VERIFICATION_TTL_SECONDS;
  const passwordResetTtl =
    environment.passwordResetTtlSeconds ?? DEFAULT_PASSWORD_RESET_TTL_SECONDS;
  return betterAuth({
    appName: environment.appName ?? "TREVV",
    baseURL: environment.baseUrl,
    basePath: AUTH_BASE_PATH,
    secret: environment.secret,
    database: pool,
    emailVerification: {
      expiresIn: verificationTtl,
      sendOnSignUp: true,
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
      async sendVerificationEmail({ user, url, token }) {
        await rememberEmailVerificationToken(
          pool,
          user.id,
          token,
          verificationTtl,
        );
        const deliveryUrl = verificationDeliveryUrl(
          url,
          token,
          environment.trustedOrigins,
        );
        try {
          await environment.mailDelivery.deliver({
            from: environment.mailFrom,
            to: user.email,
            subject: "Verify your TREVV email",
            text: `Verify your TREVV email by opening this link:\n\n${deliveryUrl}\n\nIf you did not create this account, you can ignore this message.`,
            html: `<p>Verify your TREVV email by opening the link below.</p><p><a href="${escapeHtml(deliveryUrl)}">Verify email</a></p><p>If you did not create this account, you can ignore this message.</p>`,
          });
        } catch (error) {
          await forgetEmailVerificationToken(pool, token);
          throw error;
        }
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: passwordResetTtl,
      revokeSessionsOnPasswordReset: true,
      async sendResetPassword({ user, url }) {
        await environment.mailDelivery.deliver({
          from: environment.mailFrom,
          to: user.email,
          subject: "Reset your TREVV password",
          text: `Reset your TREVV password by opening this link:\n\n${url}\n\nIf you did not request a reset, you can ignore this message.`,
          html: `<p>Reset your TREVV password by opening the link below.</p><p><a href="${escapeHtml(url)}">Reset password</a></p><p>If you did not request a reset, you can ignore this message.</p>`,
        });
      },
    },
    session: {
      cookieCache: { enabled: false },
    },
    trustedOrigins: environment.trustedOrigins,
    advanced: {
      database: { joins: true },
      useSecureCookies: environment.baseUrl.startsWith("https://"),
      cookiePrefix: "trevv",
      ...(environment.cookieDomain
        ? {
            crossSubDomainCookies: {
              enabled: true,
              domain: environment.cookieDomain,
            },
          }
        : {}),
    },
  });
}

export type TrevvAuth = ReturnType<typeof createTrevvAuth>;

export function createTrevvAuthIdentityResolver(
  auth: ReturnType<typeof createTrevvAuthWithPool>,
): AuthIdentityResolver {
  return {
    async resolve(request) {
      const resolved = await auth.api.getSession({
        headers: request.headers,
        query: { disableCookieCache: true, disableRefresh: true },
      });
      if (!resolved) return null;
      return {
        authUserId: resolved.user.id,
        email: resolved.user.email,
        name: resolved.user.name,
        emailVerified: resolved.user.emailVerified,
        sessionId: resolved.session.id,
        expiresAt: resolved.session.expiresAt,
      };
    },
  };
}

function createSingleUseVerificationHandler(
  auth: ReturnType<typeof createTrevvAuthWithPool>,
  pool: Pool,
  environment: AuthEnvironment,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const url = new URL(request.url);
    if (
      request.method === "GET" &&
      url.pathname === `${AUTH_BASE_PATH}/verify-email`
    ) {
      const token = url.searchParams.get("token");
      if (!token || !(await consumeEmailVerificationToken(pool, token)))
        return invalidVerificationTokenResponse(request, environment);
    }
    return auth.handler(request);
  };
}

async function rememberEmailVerificationToken(
  pool: Pool,
  userId: string,
  token: string,
  ttlSeconds: number,
): Promise<void> {
  await pool.query(
    `insert into "verification" ("id", "identifier", "value", "expiresAt", "createdAt", "updatedAt")
     values ($1, $2, $3, now() + ($4 * interval '1 second'), now(), now())`,
    [randomUUID(), emailVerificationIdentifier(token), userId, ttlSeconds],
  );
}

async function consumeEmailVerificationToken(
  pool: Pool,
  token: string,
): Promise<boolean> {
  const result = await pool.query<{ expiresAt: Date }>(
    `delete from "verification"
     where "identifier" = $1
     returning "expiresAt"`,
    [emailVerificationIdentifier(token)],
  );
  return (
    result.rowCount === 1 &&
    (result.rows[0]?.expiresAt.getTime() ?? 0) > Date.now()
  );
}

async function forgetEmailVerificationToken(
  pool: Pool,
  token: string,
): Promise<void> {
  await pool.query(`delete from "verification" where "identifier" = $1`, [
    emailVerificationIdentifier(token),
  ]);
}

function emailVerificationIdentifier(token: string): string {
  return `${EMAIL_VERIFICATION_PREFIX}${createHash("sha256")
    .update(token)
    .digest("hex")}`;
}

function invalidVerificationTokenResponse(
  request: Request,
  environment: AuthEnvironment,
): Response {
  const requestUrl = new URL(request.url);
  const callback = requestUrl.searchParams.get("callbackURL");
  const redirect = callback
    ? trustedCallback(callback, environment.trustedOrigins)
    : null;
  if (redirect) {
    redirect.searchParams.set("error", "INVALID_TOKEN");
    return Response.redirect(redirect, 302);
  }
  return Response.json(
    {
      code: "INVALID_TOKEN",
      message: "The verification link is invalid or expired.",
    },
    { status: 400 },
  );
}

function trustedCallback(
  callback: string,
  trustedOrigins: readonly string[],
): URL | null {
  for (const origin of trustedOrigins) {
    try {
      const candidate = new URL(callback, origin);
      if (candidate.origin === new URL(origin).origin) return candidate;
    } catch {
      // Try the next configured origin.
    }
  }
  return null;
}

function verificationDeliveryUrl(
  providerUrl: string,
  token: string,
  trustedOrigins: readonly string[],
): string {
  const fallbackOrigin = trustedOrigins[0];
  if (!fallbackOrigin)
    throw new Error("At least one trusted Web origin is required.");
  const parsedProviderUrl = new URL(providerUrl);
  const requestedCallback = parsedProviderUrl.searchParams.get("callbackURL");
  const callback = requestedCallback
    ? trustedCallback(requestedCallback, trustedOrigins)
    : null;
  const returnTo =
    callback && safeVerificationReturn(callback)
      ? `${callback.pathname}${callback.search}${callback.hash}`
      : "/onboarding";
  const delivery = new URL("/verify-email", callback?.origin ?? fallbackOrigin);
  delivery.searchParams.set("token", token);
  delivery.searchParams.set("next", returnTo);
  return delivery.toString();
}

function safeVerificationReturn(callback: URL): boolean {
  return (
    callback.pathname === "/onboarding" ||
    callback.pathname === "/invite/accept" ||
    callback.pathname.startsWith("/app/")
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** @deprecated Compatibility alias for pre-TREVV integrations. */
export const createFounderAuth = createTrevvAuth;
/** @deprecated Use TrevvAuth. */
export type FounderAuth = TrevvAuth;
