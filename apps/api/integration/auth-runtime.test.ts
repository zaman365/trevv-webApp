import {
  createFileMailSink,
  createMemoryMailSink,
  createTrevvAuthRuntime,
  type MemoryMailSink,
} from "@founderhq/auth-server";
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
  } = {},
) {
  const headers = new Headers({ origin: webOrigin });
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
