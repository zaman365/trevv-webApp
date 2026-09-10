import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

afterEach(() => vi.unstubAllEnvs());

describe("Superadmin canonical origin", () => {
  it("directs alpha administrator screens to the passkey origin without sharing cookies", () => {
    vi.stubEnv("DEMO_MODE", "false");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://alpha.trevv.de");
    for (const path of [
      "/superadmin",
      "/superadmin/sign-in",
      "/superadmin/activate",
      "/superadmin/security",
      "/superadmin/organizations/org-123",
      "/superadmin/people?organizationId=org-123&filter=unverified",
    ]) {
      const response = proxy(new NextRequest(`https://alpha.trevv.de${path}`));
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(`https://trevv.de${path}`);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(response.headers.has("set-cookie")).toBe(false);
    }
  });
  it("preserves alpha customer sign-in and workspace guards", () => {
    vi.stubEnv("DEMO_MODE", "false");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://alpha.trevv.de");
    expect(
      proxy(new NextRequest("https://alpha.trevv.de/sign-in")).headers.get(
        "location",
      ),
    ).toBeNull();
    const response = proxy(
      new NextRequest("https://alpha.trevv.de/app/portfolio"),
    );
    expect(new URL(response.headers.get("location")!).origin).toBe(
      "https://alpha.trevv.de",
    );
    expect(new URL(response.headers.get("location")!).pathname).toBe(
      "/sign-in",
    );
  });
  it("keeps production and local Superadmin requests on their own host", () => {
    vi.stubEnv("DEMO_MODE", "false");
    for (const origin of ["https://trevv.de", "http://localhost:3001"]) {
      vi.stubEnv("NEXT_PUBLIC_APP_URL", origin);
      expect(
        proxy(new NextRequest(`${origin}/superadmin/sign-in`)).headers.get(
          "location",
        ),
      ).toBeNull();
    }
  });
});
