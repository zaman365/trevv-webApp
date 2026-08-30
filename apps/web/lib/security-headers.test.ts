import { describe, expect, it } from "vitest";
import {
  cspMode,
  hstsEnabled,
  sanitizedCspReport,
  webRequestId,
  webSecurityHeaders,
  webTelemetryPath,
  writeStructuredWebLog,
} from "./security-headers";

describe("Web security headers", () => {
  it("defaults to a report-only CSP and supports explicit promotion", () => {
    expect(cspMode({ NODE_ENV: "production" })).toBe("report-only");
    expect(cspMode({ CSP_MODE: "enforce" })).toBe("enforce");
    expect(() => cspMode({ CSP_MODE: "disabled" })).toThrow(/CSP_MODE/);
    expect(hstsEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(hstsEnabled({ HSTS_ENABLED: "true" })).toBe(true);
    expect(hstsEnabled({ HSTS_ENABLED: "false" })).toBe(false);
    expect(() => hstsEnabled({ HSTS_ENABLED: "sometimes" })).toThrow(
      /HSTS_ENABLED/,
    );

    const reportOnly = Object.fromEntries(
      webSecurityHeaders({ NODE_ENV: "production" }).map(({ key, value }) => [
        key,
        value,
      ]),
    );
    expect(reportOnly["Content-Security-Policy-Report-Only"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(reportOnly["Content-Security-Policy-Report-Only"]).toContain(
      "report-uri /api/web/csp-report",
    );
    expect(reportOnly["Permissions-Policy"]).toContain("payment=()");
    expect(reportOnly["Strict-Transport-Security"]).toBeUndefined();

    const enforced = Object.fromEntries(
      webSecurityHeaders({
        NODE_ENV: "production",
        CSP_MODE: "enforce",
        HSTS_ENABLED: "true",
      }).map(({ key, value }) => [key, value]),
    );
    expect(enforced["Content-Security-Policy"]).toBeTruthy();
    expect(enforced["Content-Security-Policy-Report-Only"]).toBeUndefined();
    expect(enforced["Strict-Transport-Security"]).toContain(
      "includeSubDomains",
    );

    const localStaging = Object.fromEntries(
      webSecurityHeaders({
        NODE_ENV: "production",
        HSTS_ENABLED: "false",
      }).map(({ key, value }) => [key, value]),
    );
    expect(localStaging["Strict-Transport-Security"]).toBeUndefined();
    const development = Object.fromEntries(
      webSecurityHeaders({ NODE_ENV: "development" }).map(({ key, value }) => [
        key,
        value,
      ]),
    );
    expect(development["Content-Security-Policy-Report-Only"]).not.toContain(
      "upgrade-insecure-requests",
    );
  });

  it("retains only bounded directives and origins from browser reports", () => {
    expect(
      sanitizedCspReport({
        "csp-report": {
          "effective-directive": "script-src-elem",
          "violated-directive": "script-src 'self'",
          "document-uri": "https://trevv.test/app/private?token=secret",
          "blocked-uri": "https://cdn.example.test/script.js?user=secret",
          "source-file": "https://trevv.test/app/private?email=secret",
          sample: "private page content",
        },
      }),
    ).toEqual({
      effectiveDirective: "script-src-elem",
      violatedDirective: "script-src 'self'",
      documentOrigin: "https://trevv.test",
      blockedOrigin: "https://cdn.example.test",
    });
  });

  it("bounds Web correlation IDs and redacts route identifiers", () => {
    expect(webRequestId("request-trace-123", () => "generated-safe")).toBe(
      "request-trace-123",
    );
    expect(webRequestId("unsafe\nvalue", () => "generated-safe")).toBe(
      "generated-safe",
    );
    expect(webTelemetryPath("/app/workspaces/customer-slug/messages")).toBe(
      "/app/workspaces/:workspace/:view",
    );
    expect(webTelemetryPath("/api/web/csp-report")).toBe("/api/web/csp-report");
    expect(webTelemetryPath("/api/web/vitals")).toBe("/api/web/vitals");
    expect(webTelemetryPath("/private-token/path")).toBe("/:unmatched");
    expect(webTelemetryPath("/api/web/private-token")).toBe(
      "/api/web/:unmatched",
    );
  });

  it("never lets a log sink failure replace Web behavior", () => {
    expect(() =>
      writeStructuredWebLog({ event: "test" }, () => {
        throw new Error("collector unavailable");
      }),
    ).not.toThrow();
  });
});
