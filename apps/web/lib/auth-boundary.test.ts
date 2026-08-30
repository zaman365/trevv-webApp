import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "../proxy";

afterEach(() => vi.unstubAllEnvs());

describe("optimistic private-route boundary", () => {
  it("redirects anonymous app requests and preserves only an internal return path", () => {
    vi.stubEnv("DEMO_MODE", "false");
    const response = proxy(
      new NextRequest("https://trevv.test/app/workspaces/example?tab=one"),
    );
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    expect(response.headers.get("location")).toBe(
      "https://trevv.test/sign-in?next=%2Fapp%2Fworkspaces%2Fexample%3Ftab%3Done",
    );
  });

  it("recognizes only the TREVV session cookie marker", () => {
    vi.stubEnv("DEMO_MODE", "false");
    const allowed = proxy(
      new NextRequest("https://trevv.test/app/portfolio", {
        headers: { cookie: "trevv.session_token=opaque" },
      }),
    );
    const legacy = proxy(
      new NextRequest("https://trevv.test/app/portfolio", {
        headers: { cookie: "better-auth.session_token=opaque" },
      }),
    );
    expect(allowed.headers.get("x-middleware-next")).toBe("1");
    expect(legacy.headers.get("location")).toContain("/sign-in?");
  });

  it.each([
    [
      "/invite/accept",
      "trevv.pending_invitation",
      "/api/web/invitations/accept",
    ],
    [
      "/reset-password",
      "trevv.pending_password_reset",
      "/api/web/reset-password",
    ],
    [
      "/verify-email",
      "trevv.pending_email_verification",
      "/api/web/verify-email",
    ],
  ])(
    "normalizes %s tokens out of the URL and into a scoped HTTP-only cookie",
    (path, cookie, cookiePath) => {
      vi.stubEnv("DEMO_MODE", "false");
      const token = "opaque-one-time-token-that-must-not-reach-page-props";
      const response = proxy(
        new NextRequest(`https://trevv.test${path}?token=${token}`),
      );
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(
        `https://trevv.test${path}?resume=1`,
      );
      expect(response.headers.get("location")).not.toContain(token);
      expect(response.headers.get("set-cookie")).toContain(`${cookie}=`);
      expect(response.headers.get("set-cookie")).toContain("HttpOnly");
      expect(response.headers.get("set-cookie")).toContain("Secure");
      expect(response.headers.get("set-cookie")).toContain(
        `Path=${cookiePath}`,
      );
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      if (path === "/invite/accept") {
        expect(response.headers.get("set-cookie")).toContain(
          "trevv.registration_invitation=",
        );
        expect(response.headers.get("set-cookie")).toContain(
          "Path=/api/auth/sign-up/email",
        );
      }
    },
  );

  it("preserves a safe invitation return through verification without retaining the token", () => {
    vi.stubEnv("DEMO_MODE", "false");
    const response = proxy(
      new NextRequest(
        "https://trevv.test/verify-email?token=verification-secret&next=%2Finvite%2Faccept%3Fresume%3D1",
      ),
    );
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/verify-email");
    expect(location.searchParams.get("resume")).toBe("1");
    expect(location.searchParams.get("next")).toBe("/invite/accept?resume=1");
    expect(location.toString()).not.toContain("verification-secret");
  });
});

describe("authoritative app page boundary", () => {
  it("keeps a DAL authorization call in every private leaf page", () => {
    const appDirectory = fileURLToPath(new URL("../app/app", import.meta.url));
    const pages = pageFiles(appDirectory);
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      const source = readFileSync(page, "utf8");
      expect(
        source.includes("requireAppSession") ||
          source.includes("requireWorkspaceAccess"),
        `${page} must authorize in the leaf page`,
      ).toBe(true);
    }
  });
});

function pageFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return pageFiles(path);
    return entry.name === "page.tsx" ? [path] : [];
  });
}
