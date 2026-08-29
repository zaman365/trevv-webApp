import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../../..");

describe("repository-owned observability assets", () => {
  it("defines actionable API and outbox alerts without payload labels", () => {
    const rules = readFileSync(
      resolve(repositoryRoot, "deploy/observability/prometheus-rules.yaml"),
      "utf8",
    );
    for (const alert of [
      "TrevvApiAvailabilityBelowSlo",
      "TrevvApiErrorRateHigh",
      "TrevvRateLimitStoreUnavailable",
      "TrevvApiTargetMissing",
      "TrevvWorkerNotReady",
      "TrevvWorkerTargetMissing",
      "TrevvOutboxLagHigh",
      "TrevvDeadLetterPresent",
      "TrevvPausedOutboxBacklogPresent",
    ])
      expect(rules).toContain(`alert: ${alert}`);
    expect(rules).toContain('up{job="trevv-api"}');
    expect(rules).toContain('up{job="trevv-worker"}');
    expect(rules).not.toMatch(/organization|workspace|user_id|message_text/iu);
  });

  it("ships a parseable dashboard tied to exported metric names", () => {
    const dashboard = JSON.parse(
      readFileSync(
        resolve(repositoryRoot, "deploy/observability/grafana-dashboard.json"),
        "utf8",
      ),
    ) as { panels?: Array<{ targets?: Array<{ expr?: string }> }> };
    expect(dashboard.panels?.length).toBeGreaterThanOrEqual(6);
    const expressions = JSON.stringify(dashboard.panels);
    expect(expressions).toContain("trevv_api_http_requests_total");
    expect(expressions).toContain("trevv_worker_queue_events");
    expect(expressions).toContain("trevv_worker_ready");
    expect(expressions).toContain("max by (state)");
    expect(expressions).not.toContain("sum by (state)");
  });

  it("keeps edge logs pseudonymous and preserves sanitized Web-to-API identity", () => {
    const nginx = readFileSync(
      resolve(repositoryRoot, "deploy/staging/nginx.conf"),
      "utf8",
    );
    const compose = readFileSync(
      resolve(repositoryRoot, "compose.staging.yaml"),
      "utf8",
    );
    const routeMap = nginx.match(
      /map \$uri \$trevv_route_family \{(?<body>[\s\S]*?)\n  \}/u,
    )?.groups?.body;
    const accessLog = nginx.match(/log_format trevv_bounded(?<body>[\s\S]*?);/u)
      ?.groups?.body;
    expect(routeMap).toBeDefined();
    expect(accessLog).toContain("$trevv_route_family");
    expect(accessLog).not.toMatch(/\$(?:uri|request_uri|remote_addr)/u);
    expect(
      routeFamily(routeMap!, "/app/workspaces/secret-customer/messages"),
    ).toBe("/app/:route");
    expect(routeFamily(routeMap!, "/api/v1/privacy/requests/private-id")).toBe(
      "/api/v1/:route",
    );
    expect(routeFamily(routeMap!, "/not-classified/secret-resource")).toBe(
      "/other",
    );
    expect(nginx).toContain("listen 8444 ssl");
    expect(nginx).toContain("X-Request-ID $http_x_request_id");
    expect(nginx).toContain("X-Trevv-Client-IP $http_x_trevv_client_ip");
    expect(nginx).toContain("add_header X-Request-ID $request_id always");
    expect(nginx).toContain('"code":"payload_too_large"');
    expect(nginx).toContain('"code":"rate_limited"');
    const publicAuthLocation = nginx.match(
      /location \^~ \/api\/auth\/ \{(?<body>[\s\S]*?)\n    \}/u,
    )?.groups?.body;
    expect(publicAuthLocation).toContain("proxy_pass http://trevv_web");
    expect(publicAuthLocation).not.toContain("proxy_pass http://trevv_api");
    expect(compose).toContain("API_ORIGIN: https://proxy:8444");
  });
});

function routeFamily(mapBody: string, uri: string): string {
  let fallback = "/other";
  for (const sourceLine of mapBody.split("\n")) {
    const line = sourceLine.trim().replace(/;$/u, "");
    if (!line) continue;
    const separator = line.lastIndexOf(" ");
    if (separator < 0) continue;
    const matcher = line.slice(0, separator);
    const family = line.slice(separator + 1);
    expect(family).not.toContain("$");
    if (matcher === "default") {
      fallback = family;
      continue;
    }
    if (matcher.startsWith("=") && uri === matcher.slice(1)) return family;
    if (matcher.startsWith("~") && new RegExp(matcher.slice(1), "u").test(uri))
      return family;
  }
  return fallback;
}
