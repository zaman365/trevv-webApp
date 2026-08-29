import { describe, expect, it } from "vitest";
import {
  safeReturnPath,
  validateProductionWebConfiguration,
  webRuntimeMode,
} from "./web-runtime-config";

const secureProduction = {
  NODE_ENV: "production",
  DEMO_MODE: "false",
  NEXT_PUBLIC_APP_URL: "https://trevv.test",
  API_ORIGIN: "https://api.trevv.test",
  BETTER_AUTH_URL: "https://api.trevv.test/api/auth",
};

describe("Web runtime configuration", () => {
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

  it("requires secure, path-free canonical and API-aligned auth URLs", () => {
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
        NEXT_PUBLIC_APP_URL: "https://trevv.test/app",
      }),
    ).toThrow(/without a path/);
    expect(() =>
      validateProductionWebConfiguration({
        ...secureProduction,
        BETTER_AUTH_URL: "https://auth.trevv.test/api/auth",
      }),
    ).toThrow(/API_ORIGIN/);
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
