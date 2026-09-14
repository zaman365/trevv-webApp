import { betterAuth } from "better-auth";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { Pool } from "pg";
import type { MailDelivery } from "./mail.js";
import {
  cancelEmailChange,
  emailChangeTokenOwner,
  pendingEmailIdentifier,
  readAccountProfile,
  saveAccountProfile,
  trustedProfileOrigin,
} from "./profile.js";
export * from "./superadmin.js";

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
          const changingEmail =
            generatedTokenRequestType(token) === "change-email-verification";
          if (changingEmail) {
            const pending = await pool.query(
              `update verification set value = jsonb_set(value::jsonb, '{stage}', '"verify-new"')::text,
               "expiresAt" = now() + ($3 * interval '1 second'), "updatedAt" = now()
               where identifier = $1 and value::jsonb->>'email' = $2 and "expiresAt" > now() returning id`,
              [pendingEmailIdentifier(user.id), user.email, verificationTtl],
            );
            if (!pending.rowCount)
              throw new Error("The email change was cancelled or expired.");
          }
          await rememberEmailVerificationToken(
            pool,
            changingEmail ? emailChangeTokenOwner(user.id) : user.id,
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
            subject: changingEmail
              ? "Verify your new TREVV login email"
              : "Verify your TREVV email",
            text: `Verify your TREVV email by opening this link:\n\n${deliveryUrl}\n\n${changingEmail ? "Your login address changes only after you verify this new address." : "If you did not create this account, you can ignore this message."}`,
            html: `<p>Verify your TREVV email by opening the link below.</p><p><a href="${escapeHtml(deliveryUrl)}">Verify email</a></p><p>${changingEmail ? "Your login address changes only after you verify this new address." : "If you did not create this account, you can ignore this message."}</p>`,
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
      async afterEmailVerification(user) {
        const pending = await pool.query<{ value: string }>(
          `select value from verification where identifier = $1`,
          [pendingEmailIdentifier(user.id)],
        );
        if (
          !pending.rows[0] ||
          JSON.parse(pending.rows[0].value).email !== user.email
        )
          return;
        // Verification changes both identities in one DB transaction via the
        // trigger. Retire every older link once the new address is confirmed.
        await cancelEmailChange(pool, user.id);
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
      changeEmail: {
        enabled: true,
        updateEmailWithoutVerification: false,
        async sendChangeEmailConfirmation({ user, newEmail, url, token }) {
          await cancelEmailChange(pool, user.id);
          const pendingValue = JSON.stringify({
            email: newEmail,
            stage: "confirm-current",
            tokenId: emailVerificationIdentifier(token),
          });
          await pool.query(
            `insert into verification (id, identifier, value, "expiresAt", "createdAt", "updatedAt") values ($1, $2, $3, now() + ($4 * interval '1 second'), now(), now())`,
            [
              randomUUID(),
              pendingEmailIdentifier(user.id),
              pendingValue,
              verificationTtl,
            ],
          );
          await rememberEmailVerificationToken(
            pool,
            emailChangeTokenOwner(user.id),
            token,
            verificationTtl,
          );
          try {
            const deliveryUrl = verificationDeliveryUrl(
              url,
              token,
              environment.trustedOrigins,
            );
            await environment.mailDelivery.deliver({
              from: environment.mailFrom,
              to: user.email,
              subject: "Confirm your TREVV login email change",
              text: `A change of your TREVV login email to ${newEmail} was requested. Confirm using this one-time link:\n\n${deliveryUrl}\n\nThen verify the new inbox. Your current login address stays active until both steps finish. If this was not you, cancel the change in your profile and reset your password.`,
              html: `<p>A change of your TREVV login email to <strong>${escapeHtml(newEmail)}</strong> was requested.</p><p><a href="${escapeHtml(deliveryUrl)}">Confirm email change</a></p><p>Then verify the new inbox. Your current login address stays active until both steps finish. If this was not you, cancel the change in your profile and reset your password.</p>`,
            });
          } catch (error) {
            const outcome = verificationDelivery.getStore();
            if (outcome) outcome.failed = true;
            await forgetEmailVerificationToken(pool, token);
            await pool.query(
              `delete from verification where identifier = $1 and value = $2`,
              [pendingEmailIdentifier(user.id), pendingValue],
            );
            throw error;
          }
        },
      },
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
  const handle = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const operation = withoutTrailingSlash(url.pathname).slice(
      AUTH_BASE_PATH.length,
    );
    if (
      ["/profile", "/change-email", "/cancel-email-change"].includes(operation)
    ) {
      if (
        request.method !== "GET" &&
        !trustedProfileOrigin(request, environment.trustedOrigins)
      )
        return registrationFailure(
          403,
          "INVALID_ORIGIN",
          "This request must come from TREVV.",
        );
      const session = await auth.api.getSession({
        headers: request.headers,
        query: { disableCookieCache: true },
      });
      if (!session?.user.emailVerified)
        return registrationFailure(
          401,
          "UNAUTHORIZED",
          "Sign in with a verified account to continue.",
        );
      const profile = await readAccountProfile(pool, session.user.id);
      if (!profile)
        return registrationFailure(
          403,
          "PROFILE_UNAVAILABLE",
          "Your profile is unavailable.",
        );
      if (operation === "/profile") {
        if (request.method === "GET")
          return Response.json(profile, {
            headers: { "cache-control": "private, no-store" },
          });
        if (request.method !== "POST")
          return registrationFailure(
            405,
            "METHOD_NOT_ALLOWED",
            "Use Save profile to update your details.",
          );
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return registrationFailure(
            400,
            "INVALID_PROFILE",
            "Enter valid profile details.",
          );
        }
        try {
          const saved = await saveAccountProfile(pool, session.user.id, body);
          return Response.json(saved, {
            headers: { "cache-control": "private, no-store" },
          });
        } catch (error) {
          const status =
            error && typeof error === "object" && "status" in error
              ? Number(error.status)
              : 400;
          const databaseError =
            error && typeof error === "object" && "code" in error;
          return registrationFailure(
            databaseError ? 503 : status,
            "PROFILE_SAVE_FAILED",
            databaseError
              ? "Your profile could not be saved. Your draft is still available; try again."
              : error instanceof Error
                ? error.message
                : "Your profile could not be saved.",
          );
        }
      }
      if (request.method !== "POST")
        return registrationFailure(
          405,
          "METHOD_NOT_ALLOWED",
          "Use the account form to make this change.",
        );
      if (operation === "/cancel-email-change") {
        await cancelEmailChange(pool, session.user.id);
        return Response.json(
          { status: true },
          { headers: { "cache-control": "private, no-store" } },
        );
      }
      let body: { password?: unknown; newEmail?: unknown };
      try {
        body = await request.json();
      } catch {
        return registrationFailure(
          400,
          "INVALID_REQUEST",
          "Enter your new email and current password.",
        );
      }
      if (
        !body ||
        typeof body !== "object" ||
        typeof body.password !== "string" ||
        body.password.length > 128 ||
        !body.password ||
        typeof body.newEmail !== "string" ||
        body.newEmail.length > 254 ||
        !/^\S+@\S+\.\S+$/.test(body.newEmail.trim())
      )
        return registrationFailure(
          400,
          "INVALID_REQUEST",
          "Enter your new email and current password.",
        );
      try {
        await auth.api.verifyPassword({
          headers: request.headers,
          body: { password: body.password },
        });
      } catch {
        return registrationFailure(
          400,
          "INVALID_PASSWORD",
          "Your current password could not be confirmed.",
        );
      }
      const newEmail = body.newEmail.trim().toLowerCase();
      if (newEmail === profile.email.toLowerCase())
        return registrationFailure(
          400,
          "EMAIL_UNCHANGED",
          "Enter a different email address.",
        );
      // Product accounts may predate an auth mapping. Never merge identities
      // based on a new email or expose whether another account owns it.
      const occupied = await pool.query(
        `select id from app_users where lower(email) = $1 and id <> $2 limit 1`,
        [newEmail, profile.id],
      );
      if (occupied.rowCount)
        return Response.json(
          { status: true },
          { headers: { "cache-control": "private, no-store" } },
        );
      request = new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body: JSON.stringify({
          newEmail,
          callbackURL: `${request.headers.get("origin")}/app/account/profile?emailChange=1`,
        }),
      });
    }
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
      if (operation === "/change-email" || operation === "/verify-email")
        return registrationFailure(
          503,
          "VERIFICATION_DELIVERY_FAILED",
          "The verification email could not be delivered. Your login email has not changed. Start the email change again from your profile.",
        );
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
  return async (request) => {
    const operation = withoutTrailingSlash(new URL(request.url).pathname).slice(
      AUTH_BASE_PATH.length,
    );
    let lockUserId: string | undefined;
    if (["/change-email", "/cancel-email-change"].includes(operation)) {
      const session = await auth.api.getSession({
        headers: request.headers,
        query: { disableCookieCache: true },
      });
      lockUserId = session?.user.id;
    } else if (operation === "/verify-email") {
      const token = new URL(request.url).searchParams.get("token");
      if (token) {
        const marker = await pool.query<{ value: string }>(
          `select value from verification where identifier = $1`,
          [emailVerificationIdentifier(token)],
        );
        if (marker.rows[0]?.value.startsWith("email-change:"))
          lockUserId = marker.rows[0].value.slice("email-change:".length);
      }
    }
    if (!lockUserId) return handle(request);
    // Serialize starts, cancellation and link consumption across API replicas.
    // The session-level advisory lock does not block Better Auth's own writes.
    const client = await pool.connect();
    let locked = false;
    try {
      const result = await client.query<{ locked: boolean }>(
        `select pg_try_advisory_lock(hashtextextended($1, 0)) as locked`,
        [`email-change:${lockUserId}`],
      );
      locked = result.rows[0]?.locked === true;
      if (!locked)
        return registrationFailure(
          409,
          "EMAIL_CHANGE_BUSY",
          "An email change is already being processed. Try again in a moment.",
        );
      return await handle(request);
    } finally {
      try {
        if (locked)
          await client.query(
            `select pg_advisory_unlock(hashtextextended($1, 0))`,
            [`email-change:${lockUserId}`],
          );
      } finally {
        client.release();
      }
    }
  };
}

// Only used on tokens generated by Better Auth's own mail callbacks, never to
// authorize an incoming token. Better Auth still verifies its signature.
function generatedTokenRequestType(token: string): string | undefined {
  return JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString())
    .requestType;
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
