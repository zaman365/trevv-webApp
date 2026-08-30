import {
  createMemoryMailSink,
  createTrevvAuthRuntime,
} from "@founderhq/auth-server";
import { describe, expect, it, vi } from "vitest";
import { createApiApp, createUnavailableLiveDependencies } from "./app.js";

describe("registration admission", () => {
  it("blocks direct API sign-up before the authentication handler when registration is closed", async () => {
    const authHandler = vi.fn(async () => Response.json({ ok: true }));
    const app = createApiApp({
      mode: "live",
      ...createUnavailableLiveDependencies(),
      registrationMode: "closed",
      authHandler,
    });

    const response = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Closed Registration",
        email: "closed@example.test",
        password: "test-only-password",
      }),
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "registration_closed",
        message: "Account registration is not currently open.",
      },
    });
    expect(authHandler).not.toHaveBeenCalled();
  });

  it("forwards sign-up only when a non-production runtime explicitly enables public registration", async () => {
    const authHandler = vi.fn(async () =>
      Response.json({ accepted: true }, { status: 201 }),
    );
    const app = createApiApp({
      mode: "live",
      ...createUnavailableLiveDependencies(),
      registrationMode: "public",
      authHandler,
    });

    const response = await app.request("/api/auth/sign-up/email", {
      method: "POST",
    });

    expect(response.status).toBe(201);
    expect(authHandler).toHaveBeenCalledOnce();
  });

  it("delegates invite-only admission to the database-aware auth runtime", async () => {
    const authHandler = vi.fn(async () =>
      Response.json(
        {
          code: "REGISTRATION_INVITATION_REQUIRED",
          message: "A valid, unconsumed invitation for this email is required.",
        },
        { status: 403 },
      ),
    );
    const app = createApiApp({
      mode: "live",
      ...createUnavailableLiveDependencies(),
      registrationMode: "invite_only",
      authHandler,
    });

    const response = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Invited Registration",
        email: "invited@example.test",
        password: "test-only-password",
      }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "REGISTRATION_INVITATION_REQUIRED",
    });
    expect(authHandler).toHaveBeenCalledOnce();
  });

  it("keeps the auth runtime itself closed without consulting PostgreSQL", async () => {
    const mail = createMemoryMailSink();
    const runtime = createTrevvAuthRuntime({
      databaseUrl: "postgresql://unused:unused@127.0.0.1:1/unused",
      baseUrl: "http://auth.trevv.test",
      secret: "test-only-auth-secret-with-at-least-32-characters",
      trustedOrigins: ["http://web.trevv.test"],
      registrationMode: "closed",
      mailDelivery: mail,
      mailFrom: "no-reply@trevv.test",
    });
    try {
      const response = await runtime.handler(
        new Request("http://auth.trevv.test/api/auth/sign-up/email", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: "Direct Request",
            email: "direct@example.test",
            password: "test-only-password",
          }),
        }),
      );

      expect(response.status).toBe(403);
      expect(response.headers.get("cache-control")).toBe(
        "private, no-store, max-age=0",
      );
      await expect(response.json()).resolves.toEqual({
        code: "REGISTRATION_CLOSED",
        message: "Account registration is not currently open.",
      });
      expect(mail.messages()).toHaveLength(0);
    } finally {
      await runtime.close();
    }
  });
});
