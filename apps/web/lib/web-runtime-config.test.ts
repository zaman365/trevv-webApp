import { describe, expect, it } from "vitest";
import {
  safeReturnPath,
  validateProductionWebConfiguration,
  webAuthCookiePrefix,
  webReleaseMetadata,
  webRegistrationMode,
  webRuntimeMode,
  webSessionCookieNames,
} from "./web-runtime-config";

const secureProduction = {
  NODE_ENV: "production",
  DEMO_MODE: "false",
  NEXT_PUBLIC_APP_URL: "https://trevv.test",
  API_ORIGIN: "https://api.service.internal",
  CSP_MODE: "report-only",
  HSTS_ENABLED: "false",
};

describe("Web runtime configuration", () => {
  it("requires complete release identity only for a production artifact", () => {
    expect(webReleaseMetadata({ NODE_ENV: "test" })).toBeNull();
    expect(() => webReleaseMetadata({ NODE_ENV: "production" })).toThrow(
      /required for this runtime/,
    );
    expect(
      webReleaseMetadata({
        NODE_ENV: "production",
        RELEASE_ID: "release-2026.08.30.1",
        RELEASE_GIT_SHA: "a".repeat(40),
        RELEASE_IMAGE_ID: `sha256:${"b".repeat(64)}`,
      }),
    ).toMatchObject({ releaseId: "release-2026.08.30.1" });
  });

  it("allows demo mode only when it is explicit and never in production", () => {
    expect(webRuntimeMode({ NODE_ENV: "development", DEMO_MODE: "true" })).toBe(
      "demo",
    );
    expect(
      webRuntimeMode({ NODE_ENV: "development", DEMO_MODE: "false" }),
    ).toBe("live");
    expect(() =>
      webRuntimeMode({ NODE_ENV: "production", DEMO_MODE: "true" }),
    ).toThrow(/explicitly false/);
    expect(() => webRuntimeMode({ NODE_ENV: "production" })).toThrow(
      /explicitly false/,
    );
    expect(() => webRuntimeMode({ NODE_ENV: "development" })).toThrow(
      /explicitly set/,
    );
    expect(() =>
      webRuntimeMode({ NODE_ENV: "test", DEMO_MODE: "preview" }),
    ).toThrow(/explicitly set/);
  });

  it("defaults to invite-only, allows an explicit close, and rejects public production registration", () => {
    expect(webRegistrationMode({ NODE_ENV: "development" })).toBe(
      "invite_only",
    );
    expect(
      webRegistrationMode({
        NODE_ENV: "test",
        REGISTRATION_MODE: "closed",
      }),
    ).toBe("closed");
    expect(
      webRegistrationMode({
        NODE_ENV: "test",
        REGISTRATION_MODE: "public",
      }),
    ).toBe("public");
    expect(
      webRegistrationMode({
        NODE_ENV: "test",
        REGISTRATION_MODE: "invite_only",
      }),
    ).toBe("invite_only");
    expect(() =>
      webRegistrationMode({
        NODE_ENV: "production",
        REGISTRATION_MODE: "public",
      }),
    ).toThrow(/must be closed or invite_only/);
  });

  it("requires a secure public URL and a path-free private API upstream", () => {
    expect(() =>
      validateProductionWebConfiguration(secureProduction),
    ).not.toThrow();
    expect(() =>
      validateProductionWebConfiguration({
        ...secureProduction,
        NEXT_PUBLIC_APP_URL: "http://trevv.test",
      }),
    ).toThrow(/HTTPS/);
    expect(() =>
      validateProductionWebConfiguration({
        ...secureProduction,
        CSP_MODE: undefined,
      }),
    ).toThrow(/CSP_MODE is required/);
    expect(() =>
      validateProductionWebConfiguration({
        ...secureProduction,
        HSTS_ENABLED: undefined,
      }),
    ).toThrow(/HSTS_ENABLED is required/);
    expect(() =>
      validateProductionWebConfiguration({
        ...secureProduction,
        CSP_MODE: "disabled",
      }),
    ).toThrow(/CSP_MODE must be/);
    expect(() =>
      validateProductionWebConfiguration({
        ...secureProduction,
        HSTS_ENABLED: "sometimes",
      }),
    ).toThrow(/HSTS_ENABLED must be/);
    expect(() =>
      validateProductionWebConfiguration({
        ...secureProduction,
        NEXT_PUBLIC_APP_URL: "https://trevv.test/app",
      }),
    ).toThrow(/without a path/);
    expect(() =>
      validateProductionWebConfiguration({
        ...secureProduction,
        API_ORIGIN: "https://api.service.internal/api/v1",
      }),
    ).toThrow(/without a path/);
    expect(() =>
      validateProductionWebConfiguration({
        ...secureProduction,
        API_ORIGIN: "https://user:password@api.service.internal",
      }),
    ).toThrow(/credentials/);
    expect(() =>
      validateProductionWebConfiguration({
        ...secureProduction,
        API_ORIGIN: "http://api.service.internal:8787",
      }),
    ).toThrow(/HTTPS/);
  });

  it("does not make the Web runtime depend on the API-owned auth base URL", () => {
    expect(() =>
      validateProductionWebConfiguration({
        ...secureProduction,
        BETTER_AUTH_URL: "https://unrelated.example.test/api/auth",
      }),
    ).not.toThrow();
  });

  it("uses an isolated, explicit session-cookie namespace only on alpha", () => {
    expect(webAuthCookiePrefix(secureProduction)).toBe("trevv");
    expect(webSessionCookieNames(secureProduction)).toEqual([
      "trevv.session_token",
      "__Secure-trevv.session_token",
    ]);

    const alphaProduction = {
      ...secureProduction,
      NEXT_PUBLIC_APP_URL: "https://alpha.trevv.de",
      AUTH_COOKIE_PREFIX: "trevv_alpha",
    };
    expect(webAuthCookiePrefix(alphaProduction)).toBe("trevv_alpha");
    expect(webSessionCookieNames(alphaProduction)).toEqual([
      "trevv_alpha.session_token",
      "__Secure-trevv_alpha.session_token",
    ]);
    expect(() =>
      validateProductionWebConfiguration({
        ...alphaProduction,
        AUTH_COOKIE_PREFIX: undefined,
      }),
    ).toThrow(/must explicitly equal trevv_alpha/u);
    expect(() =>
      validateProductionWebConfiguration({
        ...alphaProduction,
        AUTH_COOKIE_PREFIX: "trevv",
      }),
    ).toThrow(/must explicitly equal trevv_alpha/u);
    expect(() =>
      validateProductionWebConfiguration({
        ...secureProduction,
        AUTH_COOKIE_PREFIX: "trevv_alpha",
      }),
    ).toThrow(/reserved for https:\/\/alpha\.trevv\.de/u);
    expect(() =>
      validateProductionWebConfiguration({
        ...secureProduction,
        AUTH_COOKIE_PREFIX: "trevv-alpha",
      }),
    ).toThrow(/must be trevv or trevv_alpha/u);
  });

  it("accepts only internal auth return destinations", () => {
    expect(safeReturnPath("/app/workspaces/example?tab=one#today")).toBe(
      "/app/workspaces/example?tab=one#today",
    );
    expect(safeReturnPath("/invite/accept?resume=1")).toBe(
      "/invite/accept?resume=1",
    );
    expect(safeReturnPath("/select-organization?next=%2Fapp%2Fportfolio")).toBe(
      "/select-organization?next=%2Fapp%2Fportfolio",
    );
    expect(safeReturnPath("https://attacker.test/app/portfolio")).toBe(
      "/app/portfolio",
    );
    expect(safeReturnPath("//attacker.test/app/portfolio")).toBe(
      "/app/portfolio",
    );
    expect(safeReturnPath("/sign-in")).toBe("/app/portfolio");
  });
});
