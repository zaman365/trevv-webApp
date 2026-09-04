import { betterAuth } from "better-auth";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
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
const ALPHA_WEB_ORIGIN = "https://alpha.trevv.de";

export const defaultAuthCookiePrefix = "trevv";
export const alphaAuthCookiePrefix = "trevv_alpha";
export type AuthCookiePrefix =
  typeof defaultAuthCookiePrefix | typeof alphaAuthCookiePrefix;

export type RegistrationMode = "closed" | "invite_only" | "public";

const INVITATION_REGISTRATION_COOKIE = "trevv.registration_invitation";

export interface AuthEnvironment {
  databaseUrl: string;
  baseUrl: string;
  secret: string;
  trustedOrigins: string[];
  registrationMode: RegistrationMode;
  mailDelivery: MailDelivery;
  mailFrom: string;
  cookiePrefix?: AuthCookiePrefix;
  cookieDomain?: string;
  appName?: string;
  emailVerificationTtlSeconds?: number;
  passwordResetTtlSeconds?: number;
  /** Test-topology-only escape hatch for creating the initial smoke owner. */
  testRegistrationBootstrapSecret?: string;
}

/** Fault injection available only to direct test harnesses, never runtime config. */
export interface AuthRuntimeFaultInjection {
  beforeRememberVerificationToken?: () => Promise<void>;
  beforeForgetVerificationToken?: () => Promise<void>;
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

interface VerificationDeliveryOutcome {
  failed: boolean;
}

export function resolveAuthCookiePrefix(
  value: string | undefined,
  trustedOrigins: readonly string[],
): AuthCookiePrefix {
  const prefix = value?.trim() || defaultAuthCookiePrefix;
  if (prefix !== defaultAuthCookiePrefix && prefix !== alphaAuthCookiePrefix)
    throw new Error(
      `AUTH_COOKIE_PREFIX must be ${defaultAuthCookiePrefix} or ${alphaAuthCookiePrefix}.`,
    );
  const alphaOriginTrusted = trustedOrigins.some((origin) => {
    try {
      return new URL(origin).origin === ALPHA_WEB_ORIGIN;
    } catch {
      return false;
    }
  });
  // One API issues one cookie name, so a deployment serving several trusted
  // Web origins must be free to pick a single shared prefix. The origin-derived
  // rules below still apply verbatim whenever exactly one origin is trusted,
  // which is every existing single-origin deployment.
  if (trustedOrigins.length > 1) return prefix;
  if (alphaOriginTrusted && prefix !== alphaAuthCookiePrefix)
    throw new Error(
      `AUTH_COOKIE_PREFIX must explicitly equal ${alphaAuthCookiePrefix} for ${ALPHA_WEB_ORIGIN}.`,
    );
  if (!alphaOriginTrusted && prefix === alphaAuthCookiePrefix)
    throw new Error(
      `AUTH_COOKIE_PREFIX=${alphaAuthCookiePrefix} is reserved for ${ALPHA_WEB_ORIGIN}.`,
    );
  return prefix;
}

export function createTrevvAuth(environment: AuthEnvironment) {
  const verificationDelivery =
    new AsyncLocalStorage<VerificationDeliveryOutcome>();
  return createTrevvAuthWithPool(
    environment,
    new Pool({ connectionString: environment.databaseUrl, max: 10 }),
    environment.registrationMode === "public",
    verificationDelivery,
  );
}

export function createTrevvAuthRuntime(
  environment: AuthEnvironment,
  faultInjection: AuthRuntimeFaultInjection = {},
) {
  const pool = new Pool({ connectionString: environment.databaseUrl, max: 10 });
  const verificationDelivery =
    new AsyncLocalStorage<VerificationDeliveryOutcome>();
  const auth = createTrevvAuthWithPool(
    environment,
    pool,
    environment.registrationMode !== "closed",
    verificationDelivery,
    faultInjection,
  );
  return {
    handler: createSingleUseVerificationHandler(
      auth,
      pool,
      environment,
      verificationDelivery,
    ),
    identityResolver: createTrevvAuthIdentityResolver(auth),
    async close() {
      await Promise.all([
        pool.end(),
        environment.mailDelivery.close?.() ?? Promise.resolve(),
      ]);
    },
  };
}

function createTrevvAuthWithPool(
  environment: AuthEnvironment,
  pool: Pool,
  signUpEnabled: boolean,
  verificationDelivery: AsyncLocalStorage<VerificationDeliveryOutcome>,
  faultInjection: AuthRuntimeFaultInjection = {},
) {
  const cookiePrefix = resolveAuthCookiePrefix(
    environment.cookiePrefix,
    environment.trustedOrigins,
  );
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
        let tokenRemembered = false;
        try {
          await faultInjection.beforeRememberVerificationToken?.();
          await rememberEmailVerificationToken(
            pool,
            user.id,
            token,
            verificationTtl,
          );
          tokenRemembered = true;
          const deliveryUrl = verificationDeliveryUrl(
            url,
            token,
            environment.trustedOrigins,
          );
          await environment.mailDelivery.deliver({
            from: environment.mailFrom,
            to: user.email,
            subject: "Verify your TREVV email",
            text: `Verify your TREVV email by opening this link:\n\n${deliveryUrl}\n\nIf you did not create this account, you can ignore this message.`,
            html: `<p>Verify your TREVV email by opening the link below.</p><p><a href="${escapeHtml(deliveryUrl)}">Verify email</a></p><p>If you did not create this account, you can ignore this message.</p>`,
          });
        } catch (error) {
          const outcome = verificationDelivery.getStore();
          if (outcome) outcome.failed = true;
          if (tokenRemembered)
            try {
              await faultInjection.beforeForgetVerificationToken?.();
              await forgetEmailVerificationToken(pool, token);
            } catch {
              // Preserve the original delivery failure and its request-local
              // signal. The one-time marker expires independently.
            }
          throw error;
        }
      },
    },
    emailAndPassword: {
      enabled: true,
      // Invite-only admission is enforced by the runtime wrapper before the
      // request reaches Better Auth. The lower-level factory remains closed in
      // invite-only mode so callers cannot bypass that server-side check.
      disableSignUp: !signUpEnabled,
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
    user: {
      additionalFields: {
        registrationInvitationTokenHash: {
          type: "string",
          input: false,
          required: false,
          returned: false,
        },
      },
    },
    databaseHooks:
      environment.registrationMode === "invite_only"
        ? {
            user: {
              create: {
                async before(_user, context) {
                  if (context?.path !== "/sign-up/email" || !context.request)
                    return false;
                  if (
                    validTestRegistrationBootstrap(
                      context.request,
                      environment.testRegistrationBootstrapSecret,
                    )
                  )
                    return;
                  const tokenHash = invitationTokenHashFromRequest(
                    context.request,
                  );
                  if (!tokenHash) return false;
                  return {
                    data: { registrationInvitationTokenHash: tokenHash },
                  };
                },
              },
            },
          }
        : undefined,
    session: {
      cookieCache: { enabled: false },
    },
    trustedOrigins: environment.trustedOrigins,
    advanced: {
      database: { joins: true },
      useSecureCookies: environment.baseUrl.startsWith("https://"),
      cookiePrefix,
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
  verificationDelivery: AsyncLocalStorage<VerificationDeliveryOutcome>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const url = new URL(request.url);
    let admittedInvitation: InvitationRegistrationAdmission | null = null;
    if (
      request.method === "POST" &&
      withoutTrailingSlash(url.pathname) === `${AUTH_BASE_PATH}/sign-up/email`
    ) {
      if (environment.registrationMode === "closed")
        return registrationFailure(
          403,
          "REGISTRATION_CLOSED",
          "Account registration is not currently open.",
        );
      if (environment.registrationMode === "invite_only") {
        const topologyBootstrap = validTestRegistrationBootstrap(
          request,
          environment.testRegistrationBootstrapSecret,
        );
        let admitted = false;
        if (!topologyBootstrap) {
          try {
            admittedInvitation = await eligibleInvitationAdmission(
              pool,
              request,
            );
            admitted = admittedInvitation !== null;
          } catch {
            return registrationFailure(
              503,
              "REGISTRATION_ADMISSION_UNAVAILABLE",
              "Invitation admission is temporarily unavailable.",
            );
          }
        }
        if (!topologyBootstrap && !admitted)
          return registrationFailure(
            403,
            "REGISTRATION_INVITATION_REQUIRED",
            "A valid, unconsumed invitation for this email is required.",
          );
      }
    }
    if (
      request.method === "GET" &&
      url.pathname === `${AUTH_BASE_PATH}/verify-email`
    ) {
      const token = url.searchParams.get("token");
      if (!token || !(await consumeEmailVerificationToken(pool, token)))
        return invalidVerificationTokenResponse(request, environment);
    }
    const deliveryOutcome = { failed: false };
    const response = await verificationDelivery.run(deliveryOutcome, () =>
      auth.handler(request),
    );
    if (deliveryOutcome.failed) {
      const signUp =
        request.method === "POST" &&
        withoutTrailingSlash(url.pathname) ===
          `${AUTH_BASE_PATH}/sign-up/email`;
      if (!signUp)
        return Response.json(
          { status: true },
          { headers: { "cache-control": "private, no-store, max-age=0" } },
        );
      let claimedAccount = false;
      if (admittedInvitation) {
        try {
          claimedAccount = await hasRegistrationClaim(pool, admittedInvitation);
        } catch {
          return registrationFailure(
            503,
            "REGISTRATION_ADMISSION_UNAVAILABLE",
            "Invitation admission is temporarily unavailable.",
          );
        }
      }
      return registrationFailure(
        503,
        claimedAccount
          ? "REGISTRATION_VERIFICATION_DELIVERY_FAILED"
          : "VERIFICATION_DELIVERY_FAILED",
        claimedAccount
          ? "Your account was created, but the verification email could not be delivered. Request another verification email to continue."
          : "The verification email could not be delivered. Try again shortly.",
      );
    }
    if (admittedInvitation && response.status >= 400) {
      try {
        if (!(await hasEligibleInvitation(pool, admittedInvitation)))
          return registrationFailure(
            403,
            "REGISTRATION_INVITATION_REQUIRED",
            "A valid, unconsumed invitation for this email is required.",
          );
      } catch {
        return registrationFailure(
          503,
          "REGISTRATION_ADMISSION_UNAVAILABLE",
          "Invitation admission is temporarily unavailable.",
        );
      }
    }
    return response;
  };
}

function validTestRegistrationBootstrap(
  request: Request,
  expected: string | undefined,
): boolean {
  const supplied = request.headers.get("x-trevv-test-registration-bootstrap");
  if (!expected || !supplied) return false;
  const expectedDigest = createHash("sha256").update(expected).digest();
  const suppliedDigest = createHash("sha256").update(supplied).digest();
  return timingSafeEqual(expectedDigest, suppliedDigest);
}

function withoutTrailingSlash(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/u, "") : pathname;
}

interface InvitationRegistrationAdmission {
  tokenHash: string;
  email: string;
}

async function eligibleInvitationAdmission(
  pool: Pool,
  request: Request,
): Promise<InvitationRegistrationAdmission | null> {
  const tokenHash = invitationTokenHashFromRequest(request);
  if (!tokenHash) return null;
  const input: unknown = await request
    .clone()
    .json()
    .catch(() => null);
  const email =
    input &&
    typeof input === "object" &&
    !Array.isArray(input) &&
    typeof (input as { email?: unknown }).email === "string"
      ? (input as { email: string }).email.trim().toLowerCase()
      : "";
  if (!/^\S+@\S+\.\S+$/u.test(email) || email.length > 320) return null;

  const admission = { tokenHash, email };
  return (await hasEligibleInvitation(pool, admission)) ? admission : null;
}

async function hasEligibleInvitation(
  pool: Pool,
  admission: InvitationRegistrationAdmission,
): Promise<boolean> {
  const result = await pool.query<{ admitted: boolean }>(
    `select exists (
       select 1
       from invitations
       where token_hash = $1
         and lower(email) = $2
         and accepted_at is null
         and revoked_at is null
         and deleted_at is null
         and expires_at > now()
         and not exists (
           select 1
           from registration_invitation_claims
           where invitation_id = invitations.id
         )
     ) as admitted`,
    [admission.tokenHash, admission.email],
  );
  return result.rows[0]?.admitted === true;
}

async function hasRegistrationClaim(
  pool: Pool,
  admission: InvitationRegistrationAdmission,
): Promise<boolean> {
  const result = await pool.query<{ claimed: boolean }>(
    `select exists (
       select 1
       from invitations
       inner join registration_invitation_claims
         on registration_invitation_claims.invitation_id = invitations.id
       inner join "user"
         on "user".id = registration_invitation_claims.auth_user_id
       where invitations.token_hash = $1
         and lower(invitations.email) = $2
     ) as claimed`,
    [admission.tokenHash, admission.email],
  );
  return result.rows[0]?.claimed === true;
}

function invitationTokenHashFromRequest(request: Request): string | null {
  const token = cookieValue(
    request.headers.get("cookie"),
    INVITATION_REGISTRATION_COOKIE,
  );
  if (!token || token.length < 32 || token.length > 2_048) return null;
  return createHash("sha256").update(token).digest("hex");
}

function cookieValue(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const entry of header.split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 0 || entry.slice(0, separator).trim() !== name) continue;
    const value = entry.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return null;
}

function registrationFailure(
  status: number,
  code: string,
  message: string,
): Response {
  return Response.json(
    { code, message },
    {
      status,
      headers: { "cache-control": "private, no-store, max-age=0" },
    },
  );
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
