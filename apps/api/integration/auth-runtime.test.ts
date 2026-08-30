import {
  createFileMailSink,
  createMemoryMailSink,
  createTrevvAuthRuntime,
  type MailDelivery,
  type MemoryMailSink,
} from "@founderhq/auth-server";
import {
  authAccounts,
  authUsers,
  authVerifications,
  createDatabase,
  hashInvitationToken,
  invitations,
  organizations,
  registrationInvitationClaims,
} from "@founderhq/db";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createTemporaryDatabase,
  migrateCurrent,
  type TemporaryDatabase,
} from "../../../packages/db/integration/database-test-helper.js";

const authOrigin = "http://auth.trevv.test";
const webOrigin = "http://web.trevv.test";
const originalPassword = "test-only-password-one";
const replacementPassword = "test-only-password-two";

let temporary: TemporaryDatabase;

beforeAll(async () => {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
  if (!testDatabaseUrl)
    throw new Error(
      "Auth integration tests require TEST_DATABASE_URL and never use production configuration.",
    );
  temporary = await createTemporaryDatabase(testDatabaseUrl);
  await migrateCurrent(temporary.url);
}, 120_000);

afterAll(async () => {
  await temporary?.drop();
}, 120_000);

describe("Better Auth live runtime", () => {
  it("verifies accounts once, rejects wrong credentials, recovers passwords, and revokes sessions", async () => {
    const mail = createMemoryMailSink();
    const runtime = createAuthHarness(mail);
    const emitted: string[] = [];
    const logSpies = (["log", "warn", "error"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation((...values: unknown[]) => {
        emitted.push(values.map(String).join(" "));
      }),
    );
    try {
      const signUp = await authRequest(runtime.handler, "/sign-up/email", {
        method: "POST",
        body: {
          name: "Authentication Test User",
          email: "auth-runtime@example.test",
          password: originalPassword,
          callbackURL: `${webOrigin}/onboarding`,
        },
      });
      expect(signUp.status).toBe(200);
      await expect(signUp.json()).resolves.toMatchObject({ token: null });
      expect(mail.messages()).toHaveLength(1);

      const beforeVerification = await signIn(
        runtime.handler,
        "auth-runtime@example.test",
        originalPassword,
      );
      expect(beforeVerification.status).toBe(403);

      const verificationDeliveryUrl = actionUrl(
        mail,
        "Verify your TREVV email",
      );
      const verificationUrl = verificationProviderUrl(verificationDeliveryUrl);
      const verified = await runtime.handler(new Request(verificationUrl));
      expect(verified.status).toBe(302);
      expect(verified.headers.get("location")).toBe(`${webOrigin}/onboarding`);

      const replayedVerification = await runtime.handler(
        new Request(verificationUrl),
      );
      expect(replayedVerification.status).toBe(302);
      expect(replayedVerification.headers.get("location")).toBe(
        `${webOrigin}/onboarding?error=INVALID_TOKEN`,
      );

      const wrongCredentials = await signIn(
        runtime.handler,
        "auth-runtime@example.test",
        "test-only-incorrect-password",
      );
      expect(wrongCredentials.status).toBe(401);

      const firstSignIn = await signIn(
        runtime.handler,
        "auth-runtime@example.test",
        originalPassword,
      );
      expect(firstSignIn.status).toBe(200);
      const firstCookie = sessionCookie(firstSignIn);
      await expect(
        getSession(runtime.handler, firstCookie),
      ).resolves.toMatchObject({ user: { emailVerified: true } });

      const resetRequest = await authRequest(
        runtime.handler,
        "/request-password-reset",
        {
          method: "POST",
          body: {
            email: "auth-runtime@example.test",
            redirectTo: `${webOrigin}/reset-password`,
          },
        },
      );
      expect(resetRequest.status).toBe(200);
      await expect(resetRequest.json()).resolves.toMatchObject({
        status: true,
      });
      const resetUrl = actionUrl(mail, "Reset your TREVV password");
      const resetToken = tokenFromActionUrl(resetUrl);

      const reset = await authRequest(runtime.handler, "/reset-password", {
        method: "POST",
        body: { newPassword: replacementPassword, token: resetToken },
      });
      expect(reset.status).toBe(200);

      const resetReplay = await authRequest(
        runtime.handler,
        "/reset-password",
        {
          method: "POST",
          body: { newPassword: replacementPassword, token: resetToken },
        },
      );
      expect(resetReplay.status).toBe(400);
      await expect(
        getSession(runtime.handler, firstCookie),
      ).resolves.toBeNull();

      const oldPassword = await signIn(
        runtime.handler,
        "auth-runtime@example.test",
        originalPassword,
      );
      expect(oldPassword.status).toBe(401);

      const activeOne = await signIn(
        runtime.handler,
        "auth-runtime@example.test",
        replacementPassword,
      );
      const activeTwo = await signIn(
        runtime.handler,
        "auth-runtime@example.test",
        replacementPassword,
      );
      const activeOneCookie = sessionCookie(activeOne);
      const activeTwoCookie = sessionCookie(activeTwo);
      const activeOneSession = await getSession(
        runtime.handler,
        activeOneCookie,
      );
      const revoked = await authRequest(runtime.handler, "/revoke-session", {
        method: "POST",
        cookie: activeTwoCookie,
        body: { token: activeOneSession?.session.token },
      });
      expect(revoked.status).toBe(200);
      await expect(
        getSession(runtime.handler, activeOneCookie),
      ).resolves.toBeNull();
      await expect(
        getSession(runtime.handler, activeTwoCookie),
      ).resolves.toMatchObject({
        user: { email: "auth-runtime@example.test" },
      });

      const signedOut = await authRequest(runtime.handler, "/sign-out", {
        method: "POST",
        cookie: activeTwoCookie,
        body: {},
      });
      expect(signedOut.status).toBe(200);
      await expect(
        getSession(runtime.handler, activeTwoCookie),
      ).resolves.toBeNull();

      const emittedText = emitted.join("\n");
      expect(emittedText).not.toContain(verificationDeliveryUrl);
      expect(emittedText).not.toContain(verificationUrl);
      expect(emittedText).not.toContain(resetUrl);
      expect(emittedText).not.toContain(resetToken);
    } finally {
      for (const spy of logSpies) spy.mockRestore();
      await runtime.close();
    }
  }, 120_000);

  it("expires verification and reset tokens", async () => {
    const mail = createMemoryMailSink();
    const runtime = createAuthHarness(mail, {
      emailVerificationTtlSeconds: 1,
      passwordResetTtlSeconds: 1,
    });
    try {
      const signUp = await authRequest(runtime.handler, "/sign-up/email", {
        method: "POST",
        body: {
          name: "Expiry Test User",
          email: "auth-expiry@example.test",
          password: originalPassword,
          callbackURL: `${webOrigin}/onboarding`,
        },
      });
      expect(signUp.status).toBe(200);
      const verificationUrl = verificationProviderUrl(
        actionUrl(mail, "Verify your TREVV email"),
      );
      await new Promise((resolve) => setTimeout(resolve, 1_100));
      const expiredVerification = await runtime.handler(
        new Request(verificationUrl),
      );
      expect(expiredVerification.status).toBe(302);
      expect(expiredVerification.headers.get("location")).toContain(
        "error=INVALID_TOKEN",
      );

      const resend = await authRequest(
        runtime.handler,
        "/send-verification-email",
        {
          method: "POST",
          body: {
            email: "auth-expiry@example.test",
            callbackURL: `${webOrigin}/onboarding`,
          },
        },
      );
      expect(resend.status).toBe(200);
      const freshVerificationUrl = verificationProviderUrl(
        actionUrl(mail, "Verify your TREVV email", 1),
      );
      expect(
        (await runtime.handler(new Request(freshVerificationUrl))).status,
      ).toBe(302);

      const resetRequest = await authRequest(
        runtime.handler,
        "/request-password-reset",
        {
          method: "POST",
          body: {
            email: "auth-expiry@example.test",
            redirectTo: `${webOrigin}/reset-password`,
          },
        },
      );
      expect(resetRequest.status).toBe(200);
      const resetUrl = actionUrl(mail, "Reset your TREVV password");
      const resetToken = tokenFromActionUrl(resetUrl);
      await new Promise((resolve) => setTimeout(resolve, 1_100));
      const expiredReset = await authRequest(
        runtime.handler,
        "/reset-password",
        {
          method: "POST",
          body: { newPassword: replacementPassword, token: resetToken },
        },
      );
      expect(expiredReset.status).toBe(400);
    } finally {
      await runtime.close();
    }
  }, 120_000);

  it("admits invite-only sign-up only for an unconsumed token whose durable email matches", async () => {
    const suffix = crypto.randomUUID();
    const organizationId = `org-auth-invite-${suffix}`;
    const validEmail = `valid-auth-invite-${suffix}@example.test`;
    const expiredEmail = `expired-auth-invite-${suffix}@example.test`;
    const consumedEmail = `consumed-auth-invite-${suffix}@example.test`;
    const revokedEmail = `revoked-auth-invite-${suffix}@example.test`;
    const deletedEmail = `deleted-auth-invite-${suffix}@example.test`;
    const bootstrapEmail = `bootstrap-auth-invite-${suffix}@example.test`;
    const bootstrapSecret = `test-registration-bootstrap-${crypto.randomUUID()}`;
    const validToken = `valid-auth-invitation-${crypto.randomUUID()}`;
    const expiredToken = `expired-auth-invitation-${crypto.randomUUID()}`;
    const consumedToken = `consumed-auth-invitation-${crypto.randomUUID()}`;
    const revokedToken = `revoked-auth-invitation-${crypto.randomUUID()}`;
    const deletedToken = `deleted-auth-invitation-${crypto.randomUUID()}`;
    const seed = createDatabase(temporary.url);
    try {
      await seed.db.insert(organizations).values({
        id: organizationId,
        name: "Invite-only Auth Test",
        slug: `auth-invite-${suffix}`,
      });
      await seed.db.insert(invitations).values([
        {
          id: `invitation-valid-${suffix}`,
          organizationId,
          email: validEmail,
          role: "member",
          tokenHash: hashInvitationToken(validToken),
          expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
        },
        {
          id: `invitation-expired-${suffix}`,
          organizationId,
          email: expiredEmail,
          role: "member",
          tokenHash: hashInvitationToken(expiredToken),
          expiresAt: new Date(Date.now() - 1_000),
        },
        {
          id: `invitation-consumed-${suffix}`,
          organizationId,
          email: consumedEmail,
          role: "member",
          tokenHash: hashInvitationToken(consumedToken),
          expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
          acceptedAt: new Date(),
        },
        {
          id: `invitation-revoked-${suffix}`,
          organizationId,
          email: revokedEmail,
          role: "member",
          tokenHash: hashInvitationToken(revokedToken),
          expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
          revokedAt: new Date(),
        },
        {
          id: `invitation-deleted-${suffix}`,
          organizationId,
          email: deletedEmail,
          role: "member",
          tokenHash: hashInvitationToken(deletedToken),
          expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
          deletedAt: new Date(),
        },
      ]);
    } finally {
      await seed.close();
    }

    const mail = createMemoryMailSink();
    const runtime = createTrevvAuthRuntime({
      databaseUrl: temporary.url,
      baseUrl: authOrigin,
      secret: "test-only-auth-secret-with-at-least-32-characters",
      trustedOrigins: [webOrigin],
      registrationMode: "invite_only",
      testRegistrationBootstrapSecret: bootstrapSecret,
      mailDelivery: mail,
      mailFrom: "no-reply@trevv.test",
    });
    const attempt = (
      email: string,
      token?: string,
      registrationBootstrapSecret?: string,
    ) =>
      authRequest(runtime.handler, "/sign-up/email", {
        method: "POST",
        ...(token
          ? {
              cookie: `trevv.registration_invitation=${encodeURIComponent(token)}`,
            }
          : {}),
        ...(registrationBootstrapSecret
          ? {
              headers: {
                "x-trevv-test-registration-bootstrap":
                  registrationBootstrapSecret,
              },
            }
          : {}),
        body: {
          name: "Invite-only Test User",
          email,
          password: originalPassword,
          callbackURL: `${webOrigin}/invite/accept?resume=1`,
        },
      });
    try {
      for (const response of [
        await attempt(validEmail),
        await attempt(`wrong-${validEmail}`, validToken),
        await attempt(expiredEmail, expiredToken),
        await attempt(consumedEmail, consumedToken),
        await attempt(revokedEmail, revokedToken),
        await attempt(deletedEmail, deletedToken),
        await attempt(bootstrapEmail, undefined, `${bootstrapSecret}-wrong`),
      ]) {
        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toEqual({
          code: "REGISTRATION_INVITATION_REQUIRED",
          message: "A valid, unconsumed invitation for this email is required.",
        });
      }
      expect(mail.messages()).toHaveLength(0);

      const admitted = await attempt(validEmail, validToken);
      expect(admitted.status).toBe(200);
      await expect(admitted.json()).resolves.toMatchObject({ token: null });
      expect(mail.messages()).toHaveLength(1);

      const bootstrapped = await attempt(
        bootstrapEmail,
        undefined,
        bootstrapSecret,
      );
      expect(bootstrapped.status).toBe(200);
      await expect(bootstrapped.json()).resolves.toMatchObject({ token: null });
      expect(mail.messages()).toHaveLength(2);

      const verify = createDatabase(temporary.url);
      try {
        const stored = await verify.db.select().from(invitations);
        expect(
          stored.find(
            (invitation) => invitation.id === `invitation-valid-${suffix}`,
          )?.acceptedAt,
        ).toBeNull();
        const admittedUser = (await verify.db.select().from(authUsers)).find(
          (user) => user.email === validEmail,
        );
        expect(admittedUser).toMatchObject({
          registrationInvitationTokenHash: null,
        });
        expect(
          await verify.db.select().from(registrationInvitationClaims),
        ).toContainEqual(
          expect.objectContaining({
            invitationId: `invitation-valid-${suffix}`,
            authUserId: admittedUser?.id,
          }),
        );
        const bootstrapUser = (await verify.db.select().from(authUsers)).find(
          (user) => user.email === bootstrapEmail,
        );
        expect(bootstrapUser).toMatchObject({
          registrationInvitationTokenHash: null,
        });
        expect(
          (await verify.db.select().from(registrationInvitationClaims)).some(
            (claim) => claim.authUserId === bootstrapUser?.id,
          ),
        ).toBe(false);
      } finally {
        await verify.close();
      }
    } finally {
      await runtime.close();
    }
  }, 120_000);

  it("turns concurrent invite registration into one durable claim and a side-effect-free replay", async () => {
    const suffix = crypto.randomUUID();
    const organizationId = `org-auth-race-${suffix}`;
    const invitationId = `invitation-auth-race-${suffix}`;
    const email = `auth-race-${suffix}@example.test`;
    const token = `auth-race-invitation-${crypto.randomUUID()}`;
    const seed = createDatabase(temporary.url);
    try {
      await seed.db.insert(organizations).values({
        id: organizationId,
        name: "Invite registration race",
        slug: `auth-race-${suffix}`,
      });
      await seed.db.insert(invitations).values({
        id: invitationId,
        organizationId,
        email,
        role: "member",
        tokenHash: hashInvitationToken(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
      });
    } finally {
      await seed.close();
    }

    const mail = createMemoryMailSink();
    const runtime = createTrevvAuthRuntime({
      databaseUrl: temporary.url,
      baseUrl: authOrigin,
      secret: "test-only-auth-secret-with-at-least-32-characters",
      trustedOrigins: [webOrigin],
      registrationMode: "invite_only",
      mailDelivery: mail,
      mailFrom: "no-reply@trevv.test",
    });
    const attempt = () =>
      authRequest(runtime.handler, "/sign-up/email", {
        method: "POST",
        cookie: `trevv.registration_invitation=${encodeURIComponent(token)}`,
        body: {
          name: "Concurrent invited user",
          email,
          password: originalPassword,
          callbackURL: `${webOrigin}/invite/accept?resume=1`,
        },
      });
    try {
      const responses = await Promise.all([attempt(), attempt()]);
      expect(responses.some((response) => response.status === 200)).toBe(true);
      expect(responses.every((response) => response.status < 500)).toBe(true);
      expect(mail.messages()).toHaveLength(1);

      const verify = createDatabase(temporary.url);
      try {
        const matchingUsers = (await verify.db.select().from(authUsers)).filter(
          (user) => user.email === email,
        );
        expect(matchingUsers).toHaveLength(1);
        expect(matchingUsers[0]).toMatchObject({
          registrationInvitationTokenHash: null,
        });
        expect(
          (await verify.db.select().from(registrationInvitationClaims)).filter(
            (claim) => claim.invitationId === invitationId,
          ),
        ).toEqual([
          expect.objectContaining({ authUserId: matchingUsers[0]?.id }),
        ]);
      } finally {
        await verify.close();
      }

      const replay = await attempt();
      expect(replay.status).toBe(403);
      await expect(replay.json()).resolves.toMatchObject({
        code: "REGISTRATION_INVITATION_REQUIRED",
      });
      expect(mail.messages()).toHaveLength(1);
      const replayVerify = createDatabase(temporary.url);
      try {
        expect(
          (
            await replayVerify.db.select().from(registrationInvitationClaims)
          ).filter((claim) => claim.invitationId === invitationId),
        ).toHaveLength(1);
      } finally {
        await replayVerify.close();
      }
    } finally {
      await runtime.close();
    }
  }, 120_000);

  it("reports post-create verification delivery failure truthfully and recovers through resend", async () => {
    const suffix = crypto.randomUUID();
    const organizationId = `org-auth-delivery-failure-${suffix}`;
    const invitationId = `invitation-auth-delivery-failure-${suffix}`;
    const email = `auth-delivery-failure-${suffix}@example.test`;
    const token = `auth-delivery-failure-invitation-${crypto.randomUUID()}`;
    const seed = createDatabase(temporary.url);
    let accountsBefore = 0;
    try {
      await seed.db.insert(organizations).values({
        id: organizationId,
        name: "Invite verification delivery failure",
        slug: `auth-delivery-failure-${suffix}`,
      });
      await seed.db.insert(invitations).values({
        id: invitationId,
        organizationId,
        email,
        role: "member",
        tokenHash: hashInvitationToken(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
      });
      accountsBefore = (await seed.db.select().from(authAccounts)).length;
    } finally {
      await seed.close();
    }

    let deliveryAttempts = 0;
    const failingDelivery: MailDelivery = {
      async deliver() {
        deliveryAttempts += 1;
        throw new Error("Injected verification delivery failure");
      },
    };
    const createRuntime = (mailDelivery: MailDelivery) =>
      createTrevvAuthRuntime({
        databaseUrl: temporary.url,
        baseUrl: authOrigin,
        secret: "test-only-auth-secret-with-at-least-32-characters",
        trustedOrigins: [webOrigin],
        registrationMode: "invite_only",
        mailDelivery,
        mailFrom: "no-reply@trevv.test",
      });
    const attempt = (runtime: ReturnType<typeof createTrevvAuthRuntime>) =>
      authRequest(runtime.handler, "/sign-up/email", {
        method: "POST",
        cookie: `trevv.registration_invitation=${encodeURIComponent(token)}`,
        body: {
          name: "Delivery retry invited user",
          email,
          password: originalPassword,
          callbackURL: `${webOrigin}/invite/accept?resume=1`,
        },
      });

    const failingRuntime = createRuntime(failingDelivery);
    try {
      const failed = await attempt(failingRuntime);
      expect(failed.status).toBe(503);
      await expect(failed.json()).resolves.toEqual({
        code: "REGISTRATION_VERIFICATION_DELIVERY_FAILED",
        message:
          "Your account was created, but the verification email could not be delivered. Request another verification email to continue.",
      });

      const [existingResend, unknownResend] = await Promise.all([
        authRequest(failingRuntime.handler, "/send-verification-email", {
          method: "POST",
          body: {
            email,
            callbackURL: `${webOrigin}/invite/accept?resume=1`,
          },
        }),
        authRequest(failingRuntime.handler, "/send-verification-email", {
          method: "POST",
          body: {
            email: `unknown-${email}`,
            callbackURL: `${webOrigin}/invite/accept?resume=1`,
          },
        }),
      ]);
      expect(existingResend.status).toBe(200);
      expect(unknownResend.status).toBe(200);
      expect(await existingResend.json()).toEqual(await unknownResend.json());
      expect(deliveryAttempts).toBe(2);
    } finally {
      await failingRuntime.close();
    }

    const afterFailure = createDatabase(temporary.url);
    let createdAuthUserId = "";
    try {
      const createdUser = (await afterFailure.db.select().from(authUsers)).find(
        (user) => user.email === email,
      );
      expect(createdUser).toBeDefined();
      createdAuthUserId = createdUser?.id ?? "";
      expect(
        (
          await afterFailure.db.select().from(registrationInvitationClaims)
        ).filter((claim) => claim.invitationId === invitationId),
      ).toEqual([expect.objectContaining({ authUserId: createdAuthUserId })]);
      expect(await afterFailure.db.select().from(authAccounts)).toHaveLength(
        accountsBefore + 1,
      );
      expect(
        (await afterFailure.db.select().from(authVerifications)).filter(
          (verification) => verification.value === createdAuthUserId,
        ),
      ).toHaveLength(0);
    } finally {
      await afterFailure.close();
    }

    const successfulDelivery = createMemoryMailSink();
    const retryRuntime = createRuntime(successfulDelivery);
    try {
      const retried = await attempt(retryRuntime);
      expect(retried.status).toBe(403);
      await expect(retried.json()).resolves.toMatchObject({
        code: "REGISTRATION_INVITATION_REQUIRED",
      });
      expect(successfulDelivery.messages()).toHaveLength(0);

      const resent = await authRequest(
        retryRuntime.handler,
        "/send-verification-email",
        {
          method: "POST",
          body: {
            email,
            callbackURL: `${webOrigin}/invite/accept?resume=1`,
          },
        },
      );
      expect(resent.status).toBe(200);
      expect(successfulDelivery.messages()).toHaveLength(1);
      const verificationUrl = verificationProviderUrl(
        actionUrl(successfulDelivery, "Verify your TREVV email"),
      );
      const verified = await retryRuntime.handler(new Request(verificationUrl));
      expect(verified.status).toBe(302);
      const afterRetry = createDatabase(temporary.url);
      try {
        const retryUser = (await afterRetry.db.select().from(authUsers)).find(
          (user) => user.email === email,
        );
        expect(retryUser?.id).toBe(createdAuthUserId);
        expect(retryUser?.emailVerified).toBe(true);
        expect(
          (
            await afterRetry.db.select().from(registrationInvitationClaims)
          ).filter((claim) => claim.invitationId === invitationId),
        ).toEqual([expect.objectContaining({ authUserId: retryUser?.id })]);
        expect(
          (await afterRetry.db.select().from(authVerifications)).filter(
            (verification) => verification.value === createdAuthUserId,
          ),
        ).toHaveLength(0);
      } finally {
        await afterRetry.close();
      }
    } finally {
      await retryRuntime.close();
    }

    const resetFailureRuntime = createRuntime(failingDelivery);
    const attemptsBeforeReset = deliveryAttempts;
    try {
      const [existingReset, unknownReset] = await Promise.all([
        authRequest(resetFailureRuntime.handler, "/request-password-reset", {
          method: "POST",
          body: {
            email,
            redirectTo: `${webOrigin}/reset-password`,
          },
        }),
        authRequest(resetFailureRuntime.handler, "/request-password-reset", {
          method: "POST",
          body: {
            email: `unknown-${email}`,
            redirectTo: `${webOrigin}/reset-password`,
          },
        }),
      ]);
      expect(existingReset.status).toBe(200);
      expect(unknownReset.status).toBe(200);
      expect(await existingReset.json()).toEqual(await unknownReset.json());
      expect(deliveryAttempts).toBe(attemptsBeforeReset + 1);
    } finally {
      await resetFailureRuntime.close();
    }
  }, 120_000);

  it("preserves the delivery-failure signal across verification-token persistence and cleanup faults", async () => {
    for (const scenario of ["remember", "cleanup"] as const) {
      const suffix = crypto.randomUUID();
      const organizationId = `org-auth-token-${scenario}-${suffix}`;
      const invitationId = `invitation-auth-token-${scenario}-${suffix}`;
      const email = `auth-token-${scenario}-${suffix}@example.test`;
      const token = `auth-token-${scenario}-${crypto.randomUUID()}`;
      const seed = createDatabase(temporary.url);
      try {
        await seed.db.insert(organizations).values({
          id: organizationId,
          name: `Verification token ${scenario} fault`,
          slug: `auth-token-${scenario}-${suffix}`,
        });
        await seed.db.insert(invitations).values({
          id: invitationId,
          organizationId,
          email,
          role: "member",
          tokenHash: hashInvitationToken(token),
          expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
        });
      } finally {
        await seed.close();
      }

      let deliveryCalls = 0;
      const mailDelivery: MailDelivery = {
        async deliver() {
          deliveryCalls += 1;
          if (scenario === "cleanup")
            throw new Error("Injected verification delivery failure");
        },
      };
      const runtime = createTrevvAuthRuntime(
        {
          databaseUrl: temporary.url,
          baseUrl: authOrigin,
          secret: "test-only-auth-secret-with-at-least-32-characters",
          trustedOrigins: [webOrigin],
          registrationMode: "invite_only",
          mailDelivery,
          mailFrom: "no-reply@trevv.test",
        },
        {
          ...(scenario === "remember"
            ? {
                async beforeRememberVerificationToken() {
                  throw new Error(
                    "Injected verification token persistence failure",
                  );
                },
              }
            : {
                async beforeForgetVerificationToken() {
                  throw new Error(
                    "Injected verification token cleanup failure",
                  );
                },
              }),
        },
      );
      try {
        const response = await authRequest(runtime.handler, "/sign-up/email", {
          method: "POST",
          cookie: `trevv.registration_invitation=${encodeURIComponent(token)}`,
          body: {
            name: "Verification token fault user",
            email,
            password: originalPassword,
            callbackURL: `${webOrigin}/invite/accept?resume=1`,
          },
        });
        expect(response.status).toBe(503);
        await expect(response.json()).resolves.toMatchObject({
          code: "REGISTRATION_VERIFICATION_DELIVERY_FAILED",
        });

        const verify = createDatabase(temporary.url);
        try {
          const user = (await verify.db.select().from(authUsers)).find(
            (candidate) => candidate.email === email,
          );
          expect(user).toBeDefined();
          expect(
            (
              await verify.db.select().from(registrationInvitationClaims)
            ).filter((claim) => claim.invitationId === invitationId),
          ).toEqual([expect.objectContaining({ authUserId: user?.id })]);
          expect(
            (await verify.db.select().from(authVerifications)).filter(
              (verification) => verification.value === user?.id,
            ),
          ).toHaveLength(scenario === "cleanup" ? 1 : 0);
        } finally {
          await verify.close();
        }
        expect(deliveryCalls).toBe(scenario === "cleanup" ? 1 : 0);
      } finally {
        await runtime.close();
      }
    }
  }, 120_000);

  it("keeps unknown-account recovery enumeration-safe", async () => {
    const mail = createMemoryMailSink();
    const runtime = createAuthHarness(mail);
    try {
      const response = await authRequest(
        runtime.handler,
        "/request-password-reset",
        {
          method: "POST",
          body: {
            email: "absent@example.test",
            redirectTo: `${webOrigin}/reset-password`,
          },
        },
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ status: true });
      expect(mail.messages()).toHaveLength(0);
    } finally {
      await runtime.close();
    }
  });

  it("provides a private cross-process mail sink for nonproduction browser tests", async () => {
    const directory = await mkdtemp(join(tmpdir(), "trevv-mail-sink-"));
    const filePath = join(directory, "messages.jsonl");
    try {
      const sink = createFileMailSink(filePath);
      await sink.deliver({
        from: "no-reply@trevv.test",
        to: "browser-test@example.test",
        subject: "Browser test message",
        text: "Test-only delivery without a credential.",
      });
      const file = await stat(filePath);
      expect(file.mode & 0o777).toBe(0o600);
      const record = JSON.parse((await readFile(filePath, "utf8")).trim()) as {
        message: { to: string; subject: string };
      };
      expect(record.message).toMatchObject({
        to: "browser-test@example.test",
        subject: "Browser test message",
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

function createAuthHarness(
  mailDelivery: MemoryMailSink,
  lifetimes: {
    emailVerificationTtlSeconds?: number;
    passwordResetTtlSeconds?: number;
  } = {},
) {
  return createTrevvAuthRuntime({
    databaseUrl: temporary.url,
    baseUrl: authOrigin,
    secret: "test-only-auth-secret-with-at-least-32-characters",
    trustedOrigins: [webOrigin],
    registrationMode: "public",
    mailDelivery,
    mailFrom: "no-reply@trevv.test",
    ...lifetimes,
  });
}

async function signIn(
  handler: (request: Request) => Promise<Response>,
  email: string,
  password: string,
) {
  return authRequest(handler, "/sign-in/email", {
    method: "POST",
    body: { email, password },
  });
}

async function getSession(
  handler: (request: Request) => Promise<Response>,
  cookie: string,
): Promise<{
  session: { id: string; token: string; expiresAt: string };
  user: { email: string; emailVerified: boolean };
} | null> {
  const response = await authRequest(handler, "/get-session", { cookie });
  expect(response.status).toBe(200);
  return (await response.json()) as {
    session: { id: string; token: string; expiresAt: string };
    user: { email: string; emailVerified: boolean };
  } | null;
}

async function authRequest(
  handler: (request: Request) => Promise<Response>,
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
    cookie?: string;
    headers?: Record<string, string>;
  } = {},
) {
  const headers = new Headers({ origin: webOrigin, ...options.headers });
  if (options.body !== undefined)
    headers.set("content-type", "application/json");
  if (options.cookie) headers.set("cookie", options.cookie);
  return handler(
    new Request(`${authOrigin}/api/auth${path}`, {
      method: options.method ?? "GET",
      headers,
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    }),
  );
}

function sessionCookie(response: Response): string {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/(?:^|,\s*)(trevv\.session_token=[^;]+)/);
  if (!match?.[1])
    throw new Error("Authentication response did not set a session cookie.");
  return match[1];
}

function actionUrl(
  mail: MemoryMailSink,
  subject: string,
  occurrence = 0,
): string {
  const message = mail
    .messages()
    .filter((candidate) => candidate.subject === subject)[occurrence];
  const url = message?.text.match(/https?:\/\/\S+/)?.[0];
  if (!url) throw new Error(`Mail sink did not receive ${subject}.`);
  return url;
}

function tokenFromActionUrl(actionUrl: string): string {
  const token = new URL(actionUrl).pathname.split("/").at(-1);
  if (!token) throw new Error("Mail action URL did not contain a token.");
  return token;
}

function verificationProviderUrl(deliveryUrl: string): string {
  const delivery = new URL(deliveryUrl);
  const token = delivery.searchParams.get("token");
  const returnTo = delivery.searchParams.get("next") ?? "/onboarding";
  if (!token) throw new Error("Verification delivery URL had no token.");
  const query = new URLSearchParams({
    token,
    callbackURL: new URL(returnTo, webOrigin).toString(),
  });
  return `${authOrigin}/api/auth/verify-email?${query}`;
}
