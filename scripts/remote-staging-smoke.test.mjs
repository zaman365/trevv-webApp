import assert from "node:assert/strict";
import test from "node:test";
import {
  assertClientIpSpoofProbeResponse,
  assertHostOnlySessionCookie,
  inviteeEmailForRun,
  readRemoteStagingSmokeConfiguration,
  runRemoteStagingSmoke,
} from "./remote-staging-smoke.mjs";

const environment = {
  REMOTE_STAGING_ORIGIN: "https://trevv-free-preview-web-zaman365.onrender.com",
  REMOTE_STAGING_WORKER_ORIGIN:
    "https://trevv-free-preview-worker-zaman365.onrender.com",
  REMOTE_STAGING_OWNER_EMAIL: "Owner@Staging.Trevv.Test",
  REMOTE_STAGING_OWNER_PASSWORD: " fixture secret with spaces ",
  REMOTE_STAGING_INVITEE_EMAIL_TEMPLATE: "trevv-smoke+{run}@staging.trevv.test",
  REMOTE_STAGING_EXPECT_CSP: "report-only",
  REMOTE_STAGING_EXPECT_HSTS: "false",
  EXPECTED_RELEASE_ID: "rehearsal-baseline-2026.08.30.1",
  EXPECTED_RELEASE_GIT_SHA: "a".repeat(40),
  EXPECTED_WEB_IMAGE_ID: `sha256:${"b".repeat(64)}`,
  EXPECTED_API_IMAGE_ID: `sha256:${"c".repeat(64)}`,
  EXPECTED_WORKER_IMAGE_ID: `sha256:${"d".repeat(64)}`,
  REMOTE_STAGING_CONFIRM:
    "smoke:trevv-free-preview-web-zaman365.onrender.com:rehearsal-baseline-2026.08.30.1",
};

test("remote smoke configuration requires public TLS and immutable artifacts", () => {
  const parsed = readRemoteStagingSmokeConfiguration(environment);
  assert.equal(
    parsed.origin.origin,
    "https://trevv-free-preview-web-zaman365.onrender.com",
  );
  assert.equal(
    parsed.workerOrigin.origin,
    "https://trevv-free-preview-worker-zaman365.onrender.com",
  );
  assert.equal(parsed.ownerEmail, "owner@staging.trevv.test");
  assert.equal(parsed.ownerPassword, environment.REMOTE_STAGING_OWNER_PASSWORD);
  assert.equal(parsed.expectedHsts, false);
  assert.equal(parsed.expectedRelease.gitSha, "a".repeat(40));
});

test("remote smoke rejects loopback, non-TLS, mutable images, and ambiguous headers", () => {
  for (const origin of [
    "http://trevv-free-preview-web-zaman365.onrender.com",
    "https://127.0.0.1",
    "https://trevv-free-preview-web-zaman365.onrender.com/path",
  ])
    assert.throws(
      () =>
        readRemoteStagingSmokeConfiguration({
          ...environment,
          REMOTE_STAGING_ORIGIN: origin,
        }),
      /REMOTE_STAGING_ORIGIN/u,
    );
  assert.throws(
    () =>
      readRemoteStagingSmokeConfiguration({
        ...environment,
        EXPECTED_API_IMAGE_ID: "latest",
      }),
    /immutable sha256/u,
  );
  assert.throws(
    () =>
      readRemoteStagingSmokeConfiguration({
        ...environment,
        EXPECTED_WORKER_IMAGE_ID: "latest",
      }),
    /immutable sha256/u,
  );
  for (const workerOrigin of [
    environment.REMOTE_STAGING_ORIGIN,
    "https://127.0.0.1",
    "https://user:password@trevv-free-preview-worker-zaman365.onrender.com",
  ])
    assert.throws(
      () =>
        readRemoteStagingSmokeConfiguration({
          ...environment,
          REMOTE_STAGING_WORKER_ORIGIN: workerOrigin,
        }),
      /REMOTE_STAGING_WORKER_ORIGIN/u,
    );
  assert.throws(
    () =>
      readRemoteStagingSmokeConfiguration({
        ...environment,
        REMOTE_STAGING_EXPECT_HSTS: "maybe",
      }),
    /must be true or false/u,
  );
  assert.throws(
    () =>
      readRemoteStagingSmokeConfiguration({
        ...environment,
        NODE_TLS_REJECT_UNAUTHORIZED: "0",
      }),
    /certificate verification disabled/u,
  );
  assert.throws(
    () =>
      readRemoteStagingSmokeConfiguration({
        ...environment,
        EXPECTED_RELEASE_ID: "release-2026.08.30.1",
        REMOTE_STAGING_CONFIRM:
          "smoke:trevv-free-preview-web-zaman365.onrender.com:release-2026.08.30.1",
      }),
    /rehearsal-only/u,
  );
  assert.throws(
    () =>
      readRemoteStagingSmokeConfiguration({
        ...environment,
        REMOTE_STAGING_CONFIRM: "smoke:wrong-host:wrong-release",
      }),
    /must bind/u,
  );
});

test("invitee template produces a unique valid address and requires one placeholder", () => {
  assert.equal(
    inviteeEmailForRun(
      "trevv-smoke+{run}@staging.trevv.test",
      "0123456789abcdef",
    ),
    "trevv-smoke+0123456789abcdef@staging.trevv.test",
  );
  for (const template of [
    "fixed@staging.trevv.test",
    "{run}+{run}@staging.trevv.test",
  ])
    assert.throws(
      () =>
        readRemoteStagingSmokeConfiguration({
          ...environment,
          REMOTE_STAGING_INVITEE_EMAIL_TEMPLATE: template,
        }),
      /exactly one \{run\}/u,
    );
});

test("session-cookie verification rejects parent-domain and weak cookies", () => {
  assert.doesNotThrow(() =>
    assertHostOnlySessionCookie(
      "__Secure-trevv.session_token=fixture; Path=/; HttpOnly; Secure; SameSite=Lax",
    ),
  );
  assert.throws(
    () =>
      assertHostOnlySessionCookie(
        "__Secure-trevv.session_token=fixture; Domain=trevv.de; Path=/; HttpOnly; Secure; SameSite=Lax",
      ),
    /parent-domain/u,
  );
  assert.throws(
    () =>
      assertHostOnlySessionCookie(
        "__Secure-trevv.session_token=fixture; Path=/; HttpOnly; SameSite=Lax",
      ),
    /host-only Path/u,
  );
});

test("client-IP spoof probe fails on unavailability, bypass, or cookies", async () => {
  await assert.rejects(
    assertClientIpSpoofProbeResponse(
      json({ code: "operations_unavailable" }, { status: 503 }),
    ),
    /safely handle/u,
  );
  await assert.rejects(
    assertClientIpSpoofProbeResponse(
      json({ code: "registration_open" }, { status: 403 }),
    ),
    /safely handle/u,
  );
  await assert.rejects(
    assertClientIpSpoofProbeResponse(
      json(
        { code: "REGISTRATION_INVITATION_REQUIRED" },
        {
          status: 403,
          headers: {
            "set-cookie":
              "__Secure-trevv.session_token=unexpected; Path=/; HttpOnly; Secure; SameSite=Lax",
          },
        },
      ),
    ),
    /created auth cookies/u,
  );
});

test("remote smoke proves public auth, collaboration, worker drain, and authenticated invitation submission", async (context) => {
  const requests = [];
  let operationReads = 0;
  let webReadinessReads = 0;
  let workerReadinessReads = 0;
  let smokeRunId;
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    const method = options.method ?? "GET";
    const headers = new Headers(options.headers);
    const body = options.body ? JSON.parse(options.body) : undefined;
    requests.push({ url, method, headers, body });

    if (url.pathname === "/api/web/readyz") {
      webReadinessReads += 1;
      if (webReadinessReads === 1)
        return json({ status: "not_ready" }, { status: 503 });
      return json({
        status: "ready",
        mode: "live",
        registrationMode: "invite_only",
        api: "ready",
        release: {
          releaseId: environment.EXPECTED_RELEASE_ID,
          gitSha: environment.EXPECTED_RELEASE_GIT_SHA,
          imageId: environment.EXPECTED_WEB_IMAGE_ID,
        },
        apiRelease: {
          releaseId: environment.EXPECTED_RELEASE_ID,
          gitSha: environment.EXPECTED_RELEASE_GIT_SHA,
          imageId: environment.EXPECTED_API_IMAGE_ID,
        },
      });
    }
    if (
      url.origin === environment.REMOTE_STAGING_WORKER_ORIGIN &&
      url.pathname === "/readyz"
    ) {
      workerReadinessReads += 1;
      return json(
        {
          status: workerReadinessReads === 1 ? "not_ready" : "ready",
          service: "trevv-worker",
          enabled: true,
          stopping: false,
          release: {
            releaseId: environment.EXPECTED_RELEASE_ID,
            gitSha: environment.EXPECTED_RELEASE_GIT_SHA,
            imageId: environment.EXPECTED_WORKER_IMAGE_ID,
          },
        },
        workerReadinessReads === 1 ? { status: 503 } : {},
      );
    }
    if (url.pathname === "/internal/metrics")
      return json({ error: { code: "not_found" } }, { status: 404 });
    if (url.pathname === "/internal/livez")
      return json({ status: "ok", service: "trevv-api" });
    if (url.pathname === "/sign-in")
      return new Response("<html>TREVV</html>", {
        headers: {
          "content-security-policy-report-only": "default-src 'self'",
        },
      });
    if (url.pathname === "/app/portfolio")
      return new Response("", {
        status: 307,
        headers: { location: "/sign-in" },
      });
    if (url.pathname === "/api/auth/sign-up/email")
      return json(
        { code: "REGISTRATION_INVITATION_REQUIRED" },
        { status: 403 },
      );
    if (url.pathname === "/api/auth/sign-in/email")
      return json(
        { ok: true },
        {
          headers: {
            "set-cookie":
              "__Secure-trevv.session_token=fixture; Path=/; HttpOnly; Secure; SameSite=Lax",
          },
        },
      );
    if (url.pathname === "/api/v1/session" && method === "GET") {
      if (
        requests.some((request) => request.url.pathname === "/api/web/sign-out")
      )
        return json({ code: "unauthenticated" }, { status: 401 });
      return json({
        user: { id: "user-owner", role: "owner" },
        organizationId: "organization-staging",
      });
    }
    if (url.pathname === "/api/v1/workspaces")
      return json([{ id: "workspace-staging" }]);
    if (url.pathname === "/api/v1/operations/status") {
      operationReads += 1;
      return operationReads === 1
        ? json({
            pendingOutbox: 0,
            failedCount: 0,
            lastProcessedAt: "2026-08-30T12:00:00.000Z",
          })
        : json({
            pendingOutbox: 0,
            failedCount: 0,
            lastProcessedAt: "2026-08-30T12:00:01.000Z",
          });
    }
    if (
      url.pathname === "/api/v1/workspaces/workspace-staging/teams" &&
      method === "POST"
    ) {
      smokeRunId = body.name.replace("Fictional smoke Team ", "");
      return json(
        {
          id: "team-smoke",
          room: { conversationId: "conversation-smoke" },
        },
        { status: 201 },
      );
    }
    if (
      url.pathname === "/api/v1/conversations/conversation-smoke/messages" &&
      method === "POST"
    )
      return json({ id: "message-smoke" }, { status: 201 });
    if (
      url.pathname === "/api/v1/conversations/conversation-smoke/messages" &&
      method === "GET"
    )
      return json({
        data: [
          {
            id: "message-smoke",
            metadata: { smokeRunId },
          },
        ],
        nextCursor: null,
      });
    if (url.pathname === "/api/v1/invitations" && method === "POST")
      return json(
        {
          id: "invitation-smoke",
          version: 1,
          status: "pending",
          deliveryStatus: "sent",
        },
        { status: 201 },
      );
    if (url.pathname === "/api/v1/invitations" && method === "GET")
      return json([{ id: "invitation-smoke", deliveryStatus: "sent" }]);
    if (
      url.pathname === "/api/v1/invitations/invitation-smoke" &&
      method === "DELETE"
    )
      return json({ id: "invitation-smoke", status: "revoked" });
    if (url.pathname === "/api/web/sign-out" && method === "POST")
      return json({ ok: true });
    throw new Error(`Unexpected remote smoke request: ${method} ${url}`);
  };

  const result = await runRemoteStagingSmoke(
    readRemoteStagingSmokeConfiguration(environment),
  );
  assert.equal(result.status, "ok");
  assert.equal(result.teamId, "team-smoke");
  assert.equal(result.messageId, "message-smoke");
  assert.equal(result.runId, smokeRunId);
  assert.ok(result.checks.includes("public-worker-outbox-drain"));
  assert.ok(result.checks.includes("public-worker-wake-readiness"));
  assert.ok(result.checks.includes("api-public-metrics-disabled"));
  assert.ok(result.checks.includes("caller-client-ip-spoof-resistance"));
  assert.equal(webReadinessReads, 2);
  assert.equal(workerReadinessReads, 2);
  assert.equal(operationReads, 2);
  assert.ok(
    requests.every(
      ({ url, headers }) =>
        url.protocol === "https:" &&
        !headers.has("x-trevv-test-registration-bootstrap"),
    ),
  );
  const trustedEdgeProbe = requests.find(
    ({ url, method, headers }) =>
      url.origin === "https://trevv-free-preview-api-zaman365.onrender.com" &&
      url.pathname === "/api/auth/sign-up/email" &&
      method === "POST" &&
      headers.get("cf-connecting-ip") === "not-a-valid-ip",
  );
  assert.ok(trustedEdgeProbe);
  assert.equal(
    trustedEdgeProbe.headers.get("x-forwarded-for"),
    "also-not-a-valid-ip",
  );
  const messageWrite = requests.find(
    ({ url, method }) =>
      method === "POST" && url.pathname.endsWith("/messages"),
  );
  const workerWake = requests.findIndex(
    ({ url }) =>
      url.origin === environment.REMOTE_STAGING_WORKER_ORIGIN &&
      url.pathname === "/readyz",
  );
  const teamWrite = requests.findIndex(
    ({ url, method }) => method === "POST" && url.pathname.endsWith("/teams"),
  );
  assert.ok(workerWake >= 0 && workerWake < teamWrite);
  assert.equal(messageWrite.body.metadata.smokeRunId, result.runId);
});

function json(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}
