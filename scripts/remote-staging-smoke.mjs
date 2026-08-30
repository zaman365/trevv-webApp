#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const digestPattern = /^sha256:[a-f0-9]{64}$/u;
const gitShaPattern = /^[a-f0-9]{40}$/u;
const requestTimeoutMs = 15_000;
const publicWakeTimeoutMs = 180_000;
const workerWakeTimeoutMs = 180_000;
const workerWakePollMs = 1_000;
const collaborationOutboxDrainTimeoutMs = 90_000;
const approvedPreviewOrigin =
  "https://trevv-free-preview-web-zaman365.onrender.com";
const approvedPreviewApiOrigin =
  "https://trevv-free-preview-api-zaman365.onrender.com";
const approvedPreviewWorkerOrigin =
  "https://trevv-free-preview-worker-zaman365.onrender.com";

export function readRemoteStagingSmokeConfiguration(environment = process.env) {
  if (environment.NODE_TLS_REJECT_UNAUTHORIZED?.trim() === "0")
    throw new Error(
      "Remote staging smoke refuses to run with TLS certificate verification disabled.",
    );
  const origin = publicHttpsOrigin(
    required(environment, "REMOTE_STAGING_ORIGIN"),
    "REMOTE_STAGING_ORIGIN",
  );
  const workerOrigin = publicHttpsOrigin(
    required(environment, "REMOTE_STAGING_WORKER_ORIGIN"),
    "REMOTE_STAGING_WORKER_ORIGIN",
  );
  if (workerOrigin.origin === origin.origin)
    throw new Error(
      "REMOTE_STAGING_WORKER_ORIGIN must be distinct from REMOTE_STAGING_ORIGIN.",
    );
  if (origin.origin !== approvedPreviewOrigin)
    throw new Error(
      `REMOTE_STAGING_ORIGIN must equal the approved disposable preview origin ${approvedPreviewOrigin}.`,
    );
  if (workerOrigin.origin !== approvedPreviewWorkerOrigin)
    throw new Error(
      `REMOTE_STAGING_WORKER_ORIGIN must equal the approved disposable preview origin ${approvedPreviewWorkerOrigin}.`,
    );
  const invitationTemplate = required(
    environment,
    "REMOTE_STAGING_INVITEE_EMAIL_TEMPLATE",
  ).toLowerCase();
  if (
    !invitationTemplate.includes("{run}") ||
    invitationTemplate.indexOf("{run}") !==
      invitationTemplate.lastIndexOf("{run}")
  )
    throw new Error(
      "REMOTE_STAGING_INVITEE_EMAIL_TEMPLATE must contain exactly one {run} placeholder.",
    );
  const expectedCsp = required(environment, "REMOTE_STAGING_EXPECT_CSP");
  if (expectedCsp !== "report-only" && expectedCsp !== "enforce")
    throw new Error(
      "REMOTE_STAGING_EXPECT_CSP must be report-only or enforce.",
    );
  const expectedHsts = strictBoolean(environment, "REMOTE_STAGING_EXPECT_HSTS");
  const expectedRelease = {
    releaseId: required(environment, "EXPECTED_RELEASE_ID"),
    gitSha: required(environment, "EXPECTED_RELEASE_GIT_SHA").toLowerCase(),
    webImageId: required(environment, "EXPECTED_WEB_IMAGE_ID").toLowerCase(),
    apiImageId: required(environment, "EXPECTED_API_IMAGE_ID").toLowerCase(),
    workerImageId: required(
      environment,
      "EXPECTED_WORKER_IMAGE_ID",
    ).toLowerCase(),
  };
  validateExpectedRelease(expectedRelease);
  if (
    !/^rehearsal-(?:baseline-)?[a-z0-9][a-z0-9._+-]{0,110}$/u.test(
      expectedRelease.releaseId,
    )
  )
    throw new Error(
      "EXPECTED_RELEASE_ID must identify a rehearsal-only release.",
    );
  const confirmation = required(environment, "REMOTE_STAGING_CONFIRM");
  const expectedConfirmation = `smoke:${origin.hostname}:${expectedRelease.releaseId}`;
  if (confirmation !== expectedConfirmation)
    throw new Error(
      "REMOTE_STAGING_CONFIRM must bind the approved preview host and rehearsal release ID.",
    );
  return {
    origin,
    workerOrigin,
    ownerEmail: normalizedEmail(
      required(environment, "REMOTE_STAGING_OWNER_EMAIL"),
      "REMOTE_STAGING_OWNER_EMAIL",
    ),
    ownerPassword: requiredSecret(environment, "REMOTE_STAGING_OWNER_PASSWORD"),
    invitationTemplate,
    expectedCsp,
    expectedHsts,
    expectedRelease,
  };
}

export function inviteeEmailForRun(template, runId) {
  if (!/^[a-z0-9]{8,32}$/u.test(runId))
    throw new Error("Remote smoke run ID is invalid.");
  return normalizedEmail(
    template.replace("{run}", runId),
    "REMOTE_STAGING_INVITEE_EMAIL_TEMPLATE",
  );
}

export async function runRemoteStagingSmoke(configuration) {
  const runId = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
  const inviteeEmail = inviteeEmailForRun(
    configuration.invitationTemplate,
    runId,
  );
  const cookieJar = new Map();

  await verifyPublicBoundary(configuration);
  await wakeAndVerifyPublicWorker(configuration);
  await verifyAnonymousBoundary(configuration.origin);
  await verifyClientIpSpoofResistance(configuration, inviteeEmail);
  await verifyInviteOnlyAdmission(configuration, inviteeEmail, cookieJar);
  await signIn(configuration, cookieJar);

  const session = await apiJson(configuration, cookieJar, "/api/v1/session");
  assertStatus(session, 200, "resolve the staging owner session");
  if (
    !isRecord(session.body) ||
    !isRecord(session.body.user) ||
    session.body.user.role !== "owner" ||
    typeof session.body.organizationId !== "string"
  )
    throw new Error("The remote smoke identity is not an active owner.");

  const workspaces = await apiJson(
    configuration,
    cookieJar,
    "/api/v1/workspaces",
  );
  assertStatus(workspaces, 200, "read the staging tenant");
  if (!Array.isArray(workspaces.body) || workspaces.body.length === 0)
    throw new Error("The bootstrapped staging tenant has no Workspace.");
  const workspace = workspaces.body.find(
    (candidate) => isRecord(candidate) && typeof candidate.id === "string",
  );
  if (!isRecord(workspace) || typeof workspace.id !== "string")
    throw new Error("The staging tenant returned no usable Workspace ID.");

  const collaboration = await verifyCollaborationWorkerPath(
    configuration,
    cookieJar,
    {
      runId,
      workspaceId: workspace.id,
      userId: session.body.user.id,
    },
  );

  const created = await apiJson(
    configuration,
    cookieJar,
    "/api/v1/invitations",
    {
      method: "POST",
      headers: { "idempotency-key": crypto.randomUUID() },
      body: { email: inviteeEmail, role: "viewer" },
    },
  );
  assertStatus(
    created,
    201,
    "submit an authenticated staging invitation to SMTP",
  );
  if (
    !isRecord(created.body) ||
    typeof created.body.id !== "string" ||
    typeof created.body.version !== "number" ||
    created.body.status !== "pending" ||
    created.body.deliveryStatus !== "sent"
  )
    throw new Error(
      "The authenticated SMTP invitation submission was not durably recorded as sent.",
    );
  const invitationId = created.body.id;

  const listed = await apiJson(configuration, cookieJar, "/api/v1/invitations");
  assertStatus(listed, 200, "read the submitted staging invitation");
  if (
    !Array.isArray(listed.body) ||
    !listed.body.some(
      (candidate) =>
        isRecord(candidate) &&
        candidate.id === invitationId &&
        candidate.deliveryStatus === "sent",
    )
  )
    throw new Error("The submitted staging invitation was not readable.");

  const revoked = await apiJson(
    configuration,
    cookieJar,
    `/api/v1/invitations/${encodeURIComponent(invitationId)}`,
    {
      method: "DELETE",
      headers: {
        "idempotency-key": crypto.randomUUID(),
        "if-match": `"${created.body.version}"`,
      },
    },
  );
  assertStatus(revoked, 200, "revoke the staging smoke invitation");
  if (!isRecord(revoked.body) || revoked.body.status !== "revoked")
    throw new Error("The staging smoke invitation was not revoked.");

  const signOut = await apiJson(configuration, cookieJar, "/api/web/sign-out", {
    method: "POST",
    body: {},
  });
  assertStatus(signOut, 200, "sign out the staging owner");
  const afterSignOut = await apiJson(
    configuration,
    cookieJar,
    "/api/v1/session",
  );
  if (afterSignOut.status !== 401)
    throw new Error(
      "The staging owner session remained usable after sign-out.",
    );

  return {
    status: "ok",
    environment: "remote-staging",
    releaseId: configuration.expectedRelease.releaseId,
    checks: [
      "trusted-public-tls",
      "release-correlation",
      "live-readiness",
      "api-public-metrics-disabled",
      "public-worker-wake-readiness",
      "security-headers",
      "anonymous-private-route-guard",
      "caller-client-ip-spoof-resistance",
      "invite-only-headerless-rejection",
      "real-owner-sign-in",
      "tenant-read",
      "team-room-atomic-create",
      "durable-message-write-read",
      "public-worker-outbox-drain",
      "authenticated-smtp-invitation-submitted",
      "invitation-revocation",
      "session-sign-out",
    ],
    teamId: collaboration.teamId,
    messageId: collaboration.messageId,
    invitationId,
    runId,
  };
}

async function wakeAndVerifyPublicWorker(configuration) {
  const deadline = Date.now() + workerWakeTimeoutMs;
  let lastStatus = "no response";
  while (Date.now() < deadline) {
    let response;
    try {
      response = await remoteFetch(
        new URL("/readyz", configuration.workerOrigin),
        { cache: "no-store" },
      );
    } catch (error) {
      lastStatus =
        error instanceof Error ? error.message : "unknown request failure";
      await new Promise((resolve) => setTimeout(resolve, workerWakePollMs));
      continue;
    }
    lastStatus = `HTTP ${response.status}`;
    const body = await response.json().catch(() => null);
    if (isRecord(body) && isRecord(body.release))
      verifyReleaseMetadata(
        body.release,
        configuration.expectedRelease,
        configuration.expectedRelease.workerImageId,
        "Worker",
      );
    if (
      response.ok &&
      isRecord(body) &&
      body.status === "ready" &&
      body.service === "trevv-worker" &&
      isRecord(body.release) &&
      body.enabled === true &&
      body.stopping === false
    )
      return;
    await new Promise((resolve) => setTimeout(resolve, workerWakePollMs));
  }
  throw new Error(
    `The public free-preview Worker did not become ready within ${workerWakeTimeoutMs / 1_000} seconds (${lastStatus}).`,
  );
}

async function verifyCollaborationWorkerPath(
  configuration,
  cookieJar,
  { runId, workspaceId, userId },
) {
  const beforeResponse = await apiJson(
    configuration,
    cookieJar,
    "/api/v1/operations/status",
  );
  assertStatus(
    beforeResponse,
    200,
    "capture pre-write background-operation status",
  );
  const before = operationStatus(beforeResponse.body, "pre-write");
  if (before.failedCount !== 0)
    throw new Error(
      "Remote staging already had failed background operations before the collaboration smoke write.",
    );
  const workerBefore = await readWorkerQueueSnapshot(
    configuration,
    "pre-write",
  );
  assertIsolatedCollaborationBaseline(before, workerBefore);
  const expectedPendingOutbox = before.pendingOutbox + 1;

  const createdTeam = await apiJson(
    configuration,
    cookieJar,
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/teams`,
    {
      method: "POST",
      headers: { "idempotency-key": crypto.randomUUID() },
      body: {
        workspaceId,
        name: `Fictional smoke Team ${runId}`,
        purpose: `Fictional remote-staging collaboration verification run ${runId}.`,
        preset: "technology",
        featureCapabilities: ["work", "messages", "decisions"],
        memberIds: [userId],
        leadUserId: userId,
      },
    },
  );
  assertStatus(createdTeam, 201, "create a Team and its Team room atomically");
  if (
    !isRecord(createdTeam.body) ||
    typeof createdTeam.body.id !== "string" ||
    !isRecord(createdTeam.body.room) ||
    typeof createdTeam.body.room.conversationId !== "string"
  )
    throw new Error("Team creation did not return its canonical Team room.");
  const teamId = createdTeam.body.id;
  const conversationId = createdTeam.body.room.conversationId;

  const sentMessage = await apiJson(
    configuration,
    cookieJar,
    `/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: "POST",
      headers: { "idempotency-key": crypto.randomUUID() },
      body: {
        clientMessageId: crypto.randomUUID(),
        body: `Fictional remote-staging smoke message for run ${runId}.`,
        intent: "message",
        metadata: {
          classification: "fictional-staging-smoke",
          smokeRunId: runId,
        },
      },
    },
  );
  assertStatus(sentMessage, 201, "send a durable Team-room message");
  if (!isRecord(sentMessage.body) || typeof sentMessage.body.id !== "string")
    throw new Error("The Team-room message did not return a durable ID.");
  const messageId = sentMessage.body.id;

  const messages = await apiJson(
    configuration,
    cookieJar,
    `/api/v1/conversations/${encodeURIComponent(conversationId)}/messages?limit=50`,
  );
  assertStatus(messages, 200, "read the durable Team-room message");
  if (
    !isRecord(messages.body) ||
    !Array.isArray(messages.body.data) ||
    !messages.body.data.some(
      (candidate) =>
        isRecord(candidate) &&
        candidate.id === messageId &&
        candidate.metadata?.smokeRunId === runId,
    )
  )
    throw new Error("The durable Team-room message could not be read back.");

  let statusPollCount = 0;
  let lastObservedStatus = null;
  let workerPollCount = 0;
  let lastObservedWorker = null;
  const drained = await poll(async () => {
    const response = await apiJson(
      configuration,
      cookieJar,
      "/api/v1/operations/status",
    );
    assertStatus(response, 200, "poll background-operation status");
    const current = operationStatus(response.body, "post-write");
    statusPollCount += 1;
    lastObservedStatus = current;
    const workerCurrent = await readWorkerQueueSnapshot(
      configuration,
      "post-write",
    );
    workerPollCount += 1;
    lastObservedWorker = workerCurrent;
    assertNoTerminalCollaborationDrift(
      before,
      workerBefore,
      current,
      workerCurrent,
    );
    return collaborationWorkerProgressMatches(
      before,
      workerBefore,
      current,
      workerCurrent,
    )
      ? { current, workerCurrent }
      : null;
  }, collaborationOutboxDrainTimeoutMs);
  if (!drained)
    throw new Error(
      `The collaboration immediate outbox events did not reach the exact isolated API and Worker deltas within ${collaborationOutboxDrainTimeoutMs / 1_000} seconds (${outboxDrainDiagnostic(before, workerBefore, expectedPendingOutbox, lastObservedStatus, lastObservedWorker, statusPollCount, workerPollCount)}).`,
    );

  return { teamId, messageId };
}

async function readWorkerQueueSnapshot(configuration, phase) {
  const response = await remoteFetch(
    new URL("/metrics.json", configuration.workerOrigin),
    { cache: "no-store" },
  );
  if (response.status !== 200)
    throw new Error(
      `Could not capture ${phase} Worker queue status: HTTP ${response.status}.`,
    );
  const body = await response.json().catch(() => null);
  return workerQueueStatus(body, configuration.expectedRelease, phase);
}

async function verifyPublicBoundary(configuration) {
  let lastStatus = "no response";
  const body = await poll(async () => {
    let readiness;
    try {
      readiness = await remoteFetch(
        new URL("/api/web/readyz", configuration.origin),
        { cache: "no-store" },
      );
    } catch (error) {
      lastStatus =
        error instanceof Error ? error.message : "unknown request failure";
      return null;
    }
    lastStatus = `HTTP ${readiness.status}`;
    const candidate = await readiness.json().catch(() => null);
    if (
      !readiness.ok ||
      !isRecord(candidate) ||
      candidate.status !== "ready" ||
      candidate.mode !== "live" ||
      candidate.registrationMode !== "invite_only" ||
      candidate.api !== "ready"
    )
      return null;
    return candidate;
  }, publicWakeTimeoutMs);
  if (!body)
    throw new Error(
      `Remote Web/API did not become live and invite-only within ${publicWakeTimeoutMs / 1_000} seconds (${lastStatus}).`,
    );
  verifyReleaseMetadata(
    body.release,
    configuration.expectedRelease,
    configuration.expectedRelease.webImageId,
    "Web",
  );
  verifyReleaseMetadata(
    body.apiRelease,
    configuration.expectedRelease,
    configuration.expectedRelease.apiImageId,
    "API",
  );

  const apiMetrics = await remoteFetch(
    new URL("/internal/metrics", approvedPreviewApiOrigin),
    { cache: "no-store" },
  );
  if (apiMetrics.status !== 404)
    throw new Error(
      "The disposable preview API exposes its internal metrics endpoint publicly.",
    );
  const apiLiveness = await remoteFetch(
    new URL("/internal/livez", approvedPreviewApiOrigin),
    { cache: "no-store" },
  );
  const apiLivenessBody = await apiLiveness.json().catch(() => null);
  if (
    !apiLiveness.ok ||
    !isRecord(apiLivenessBody) ||
    apiLivenessBody.status !== "ok" ||
    apiLivenessBody.service !== "trevv-api" ||
    Object.keys(apiLivenessBody).sort().join(",") !== "service,status"
  )
    throw new Error("The public API liveness response is not content-free.");

  const page = await remoteFetch(new URL("/sign-in", configuration.origin), {
    cache: "no-store",
  });
  if (!page.ok || !(await page.text()).includes("TREVV"))
    throw new Error("The public trusted-TLS sign-in surface did not render.");
  const enforcing = page.headers.get("content-security-policy");
  const reportOnly = page.headers.get("content-security-policy-report-only");
  if (
    configuration.expectedCsp === "enforce"
      ? !enforcing || reportOnly
      : !reportOnly || enforcing
  )
    throw new Error(
      `The public Web CSP does not match ${configuration.expectedCsp}.`,
    );
  const hsts = page.headers.get("strict-transport-security");
  if (configuration.expectedHsts ? !hsts : hsts)
    throw new Error("The public Web HSTS mode does not match the smoke input.");
}

async function verifyAnonymousBoundary(origin) {
  const response = await remoteFetch(new URL("/app/portfolio", origin), {
    cache: "no-store",
    redirect: "manual",
  });
  if (
    response.status < 300 ||
    response.status >= 400 ||
    !response.headers.get("location")?.includes("/sign-in")
  )
    throw new Error("Anonymous remote app access did not redirect to sign-in.");
  if ((await response.text()).includes("Northstar Apparel"))
    throw new Error("Anonymous remote app access leaked demo data.");
}

async function verifyClientIpSpoofResistance(configuration, inviteeEmail) {
  const response = await remoteFetch(
    new URL("/api/auth/sign-up/email", approvedPreviewApiOrigin),
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        origin: configuration.origin.origin,
        "cf-connecting-ip": "not-a-valid-ip",
        "x-forwarded-for": "also-not-a-valid-ip",
      },
      redirect: "manual",
      cache: "no-store",
      body: JSON.stringify({
        name: "Rejected trusted-edge smoke registration",
        email: inviteeEmail,
        password: `Rejected-trusted-edge-smoke-${crypto.randomUUID()}`,
        callbackURL: new URL("/onboarding", configuration.origin).toString(),
      }),
    },
  );
  await assertClientIpSpoofProbeResponse(response);
}

export async function assertClientIpSpoofProbeResponse(response) {
  const contentType = response.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  const responseText = await response.text();
  let body = null;
  if (contentType === "application/json")
    try {
      body = JSON.parse(responseText);
    } catch {
      body = null;
    }

  const apiRejected =
    response.status === 403 &&
    contentType === "application/json" &&
    apiErrorCode(body) === "REGISTRATION_INVITATION_REQUIRED";
  const cloudflareRay = response.headers.get("cf-ray")?.trim() ?? "";
  const cloudflareRayMatch = /^([0-9a-f]{16,32})(?:-[a-z0-9]{3,8})?$/iu.exec(
    cloudflareRay,
  );
  const cloudflareResponse =
    response.status === 403 &&
    response.headers.get("server")?.trim().toLowerCase() === "cloudflare" &&
    cloudflareRayMatch !== null;
  const edgeTextRejected =
    cloudflareResponse &&
    contentType === "text/plain" &&
    responseText.trim() === "error code: 1000";
  const edgeJsonRejected =
    cloudflareResponse &&
    contentType === "application/json" &&
    body?.status === 403 &&
    body?.error_code === 1000 &&
    body?.error_name === "dns_loop" &&
    body?.cloudflare_error === true &&
    body?.retryable === false &&
    typeof body?.ray_id === "string" &&
    body.ray_id.toLowerCase() === cloudflareRayMatch[1].toLowerCase();
  if (!apiRejected && !edgeTextRejected && !edgeJsonRejected)
    throw new Error(
      "The preview edge and API did not safely handle caller-supplied client IP headers.",
    );
  if (setCookieValues(response.headers).length > 0)
    throw new Error(
      "The client-IP spoof-resistance probe created auth cookies.",
    );
}

async function verifyInviteOnlyAdmission(
  configuration,
  inviteeEmail,
  cookieJar,
) {
  const response = await apiJson(
    configuration,
    cookieJar,
    "/api/auth/sign-up/email",
    {
      method: "POST",
      body: {
        name: "Rejected remote smoke registration",
        email: inviteeEmail,
        password: `Rejected-remote-smoke-${crypto.randomUUID()}`,
        callbackURL: new URL("/onboarding", configuration.origin).toString(),
      },
      authenticated: false,
    },
  );
  if (
    response.status !== 403 ||
    apiErrorCode(response.body) !== "REGISTRATION_INVITATION_REQUIRED"
  )
    throw new Error("Headerless remote staging registration was not rejected.");
  if (cookieJar.size > 0)
    throw new Error("Rejected remote registration created auth cookies.");
}

async function signIn(configuration, cookieJar) {
  const response = await apiJson(
    configuration,
    cookieJar,
    "/api/auth/sign-in/email",
    {
      method: "POST",
      body: {
        email: configuration.ownerEmail,
        password: configuration.ownerPassword,
        rememberMe: false,
      },
      authenticated: false,
    },
  );
  assertStatus(response, 200, "sign in the bootstrapped staging owner");
  const sessionCookie = setCookieValues(response.headers).find((value) =>
    /(?:^|-)trevv\.session_token=/u.test(value),
  );
  assertHostOnlySessionCookie(sessionCookie);
}

export function assertHostOnlySessionCookie(sessionCookie) {
  if (!sessionCookie || !/(?:^|-)trevv\.session_token=/u.test(sessionCookie))
    throw new Error("Remote sign-in did not set the TREVV session cookie.");
  if (/;\s*Domain=/iu.test(sessionCookie))
    throw new Error(
      "Remote sign-in set a parent-domain session cookie instead of a host-only cookie.",
    );
  if (
    !/;\s*Path=\/(?:;|$)/iu.test(sessionCookie) ||
    !/;\s*HttpOnly(?:;|$)/iu.test(sessionCookie) ||
    !/;\s*Secure(?:;|$)/iu.test(sessionCookie) ||
    !/;\s*SameSite=Lax(?:;|$)/iu.test(sessionCookie)
  )
    throw new Error(
      "Remote sign-in did not set a host-only Path=/, Secure, HTTP-only, SameSite=Lax cookie.",
    );
}

async function apiJson(
  configuration,
  cookieJar,
  path,
  { method = "GET", headers = {}, body, authenticated = true } = {},
) {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("accept", "application/json");
  if (body !== undefined)
    requestHeaders.set("content-type", "application/json");
  if (method !== "GET" && method !== "HEAD")
    requestHeaders.set("origin", configuration.origin.origin);
  if (authenticated && cookieJar.size > 0)
    requestHeaders.set("cookie", cookieHeader(cookieJar));
  const response = await remoteFetch(new URL(path, configuration.origin), {
    method,
    headers: requestHeaders,
    redirect: "manual",
    cache: "no-store",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  rememberCookies(cookieJar, response.headers);
  return {
    status: response.status,
    headers: response.headers,
    body: await response.json().catch(() => null),
  };
}

function rememberCookies(cookieJar, headers) {
  for (const header of setCookieValues(headers)) {
    const pair = header.split(";", 1)[0];
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    if (value) cookieJar.set(name, value);
    else cookieJar.delete(name);
  }
}

function setCookieValues(headers) {
  return typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : [headers.get("set-cookie")].filter(Boolean);
}

function cookieHeader(cookieJar) {
  return [...cookieJar.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function validateExpectedRelease(value) {
  if (!/^[a-z0-9][a-z0-9._+-]{7,127}$/u.test(value.releaseId))
    throw new Error("EXPECTED_RELEASE_ID is invalid.");
  if (!gitShaPattern.test(value.gitSha))
    throw new Error("EXPECTED_RELEASE_GIT_SHA must be a full Git SHA.");
  for (const [name, imageId] of [
    ["EXPECTED_WEB_IMAGE_ID", value.webImageId],
    ["EXPECTED_API_IMAGE_ID", value.apiImageId],
    ["EXPECTED_WORKER_IMAGE_ID", value.workerImageId],
  ])
    if (!digestPattern.test(imageId))
      throw new Error(`${name} must be an immutable sha256 image ID.`);
}

function verifyReleaseMetadata(value, expected, imageId, label) {
  if (
    !isRecord(value) ||
    value.releaseId !== expected.releaseId ||
    value.gitSha !== expected.gitSha ||
    value.imageId !== imageId
  )
    throw new Error(`${label} does not report the expected release identity.`);
}

function assertStatus(response, expected, operation) {
  if (response.status !== expected)
    throw new Error(
      `Could not ${operation}: HTTP ${response.status} (${apiErrorCode(response.body)}).`,
    );
}

function apiErrorCode(value) {
  if (!isRecord(value)) return "unexpected_response";
  if (isRecord(value.error) && typeof value.error.code === "string")
    return value.error.code;
  if (typeof value.code === "string") return value.code;
  if (typeof value.error === "string") return value.error;
  return "unexpected_response";
}

function operationStatus(value, phase) {
  if (
    !isRecord(value) ||
    !Number.isInteger(value.pendingOutbox) ||
    value.pendingOutbox < 0 ||
    !Number.isInteger(value.failedCount) ||
    value.failedCount < 0
  )
    throw new Error(
      `Remote staging returned invalid ${phase} operation status.`,
    );
  let lastProcessedAtMs = null;
  if (value.lastProcessedAt !== undefined) {
    lastProcessedAtMs = Date.parse(value.lastProcessedAt);
    if (!Number.isFinite(lastProcessedAtMs))
      throw new Error(
        `Remote staging returned invalid ${phase} lastProcessedAt.`,
      );
  }
  return {
    pendingOutbox: value.pendingOutbox,
    failedCount: value.failedCount,
    lastProcessedAtMs,
  };
}

function workerQueueStatus(value, expectedRelease, phase) {
  if (
    !isRecord(value) ||
    (value.status !== "ready" && value.status !== "not_ready") ||
    value.service !== "trevv-worker" ||
    typeof value.enabled !== "boolean" ||
    typeof value.stopping !== "boolean" ||
    !isRecord(value.release) ||
    !isRecord(value.queue) ||
    !isRecord(value.queue.attempts)
  )
    throw new Error(`Remote staging returned invalid ${phase} Worker status.`);
  verifyReleaseMetadata(
    value.release,
    expectedRelease,
    expectedRelease.workerImageId,
    "Worker",
  );
  const queueFields = [
    "ready",
    "delayed",
    "leased",
    "deadLettered",
    "paused",
    "unsupported",
  ];
  const attemptFields = ["leased", "succeeded", "failed", "deadLettered"];
  for (const field of queueFields)
    assertNonNegativeInteger(value.queue[field], `${phase} Worker queue`);
  for (const field of attemptFields)
    assertNonNegativeInteger(
      value.queue.attempts[field],
      `${phase} Worker attempts`,
    );
  const lastSuccessfulSweepAtMs = requiredTimestamp(
    value.lastSuccessfulSweepAt,
    `${phase} Worker lastSuccessfulSweepAt`,
  );
  const observedAtMs = requiredTimestamp(
    value.queue.observedAt,
    `${phase} Worker queue observedAt`,
  );
  const lastFailedSweepAtMs = optionalTimestamp(
    value.lastFailedSweepAt,
    `${phase} Worker lastFailedSweepAt`,
  );
  return {
    status: value.status,
    enabled: value.enabled,
    stopping: value.stopping,
    lastSuccessfulSweepAtMs,
    lastFailedSweepAtMs,
    observedAtMs,
    queue: {
      ready: value.queue.ready,
      delayed: value.queue.delayed,
      leased: value.queue.leased,
      deadLettered: value.queue.deadLettered,
      paused: value.queue.paused,
      unsupported: value.queue.unsupported,
    },
    attempts: {
      leased: value.queue.attempts.leased,
      succeeded: value.queue.attempts.succeeded,
      failed: value.queue.attempts.failed,
      deadLettered: value.queue.attempts.deadLettered,
    },
  };
}

function assertIsolatedCollaborationBaseline(operations, worker) {
  const isolated =
    operations.failedCount === 0 &&
    operations.pendingOutbox === worker.queue.delayed &&
    worker.status === "ready" &&
    worker.enabled === true &&
    worker.stopping === false &&
    worker.queue.ready === 0 &&
    worker.queue.leased === 0 &&
    worker.queue.paused === 0 &&
    worker.queue.unsupported === 0 &&
    worker.queue.deadLettered === 0 &&
    worker.attempts.leased === 0;
  if (!isolated)
    throw new Error(
      `Remote staging did not have an isolated collaboration baseline (${workerBaselineDiagnostic(operations, worker)}).`,
    );
}

export function collaborationWorkerProgressMatches(
  before,
  workerBefore,
  current,
  workerCurrent,
) {
  const processedAdvanced =
    current.lastProcessedAtMs !== null &&
    (before.lastProcessedAtMs === null ||
      current.lastProcessedAtMs > before.lastProcessedAtMs);
  return (
    current.pendingOutbox === before.pendingOutbox + 1 &&
    current.failedCount === 0 &&
    processedAdvanced &&
    workerCurrent.status === "ready" &&
    workerCurrent.enabled === true &&
    workerCurrent.stopping === false &&
    workerCurrent.queue.delayed === workerBefore.queue.delayed + 1 &&
    workerCurrent.queue.ready === 0 &&
    workerCurrent.queue.leased === 0 &&
    workerCurrent.queue.paused === 0 &&
    workerCurrent.queue.unsupported === 0 &&
    workerCurrent.queue.deadLettered === 0 &&
    workerCurrent.attempts.leased === workerBefore.attempts.leased &&
    workerCurrent.attempts.succeeded === workerBefore.attempts.succeeded + 2 &&
    workerCurrent.attempts.failed === workerBefore.attempts.failed &&
    workerCurrent.attempts.deadLettered ===
      workerBefore.attempts.deadLettered &&
    workerCurrent.lastFailedSweepAtMs === workerBefore.lastFailedSweepAtMs &&
    workerCurrent.lastSuccessfulSweepAtMs >
      workerBefore.lastSuccessfulSweepAtMs &&
    workerCurrent.observedAtMs > workerBefore.observedAtMs
  );
}

function assertNoTerminalCollaborationDrift(
  before,
  workerBefore,
  current,
  workerCurrent,
) {
  const failureDrift =
    current.failedCount !== 0 ||
    workerCurrent.queue.paused !== 0 ||
    workerCurrent.queue.unsupported !== 0 ||
    workerCurrent.queue.deadLettered !== 0 ||
    workerCurrent.attempts.failed !== workerBefore.attempts.failed ||
    workerCurrent.attempts.deadLettered !==
      workerBefore.attempts.deadLettered ||
    workerCurrent.lastFailedSweepAtMs !== workerBefore.lastFailedSweepAtMs;
  const concurrencyOvershoot =
    current.pendingOutbox > before.pendingOutbox + 3 ||
    workerCurrent.queue.delayed > workerBefore.queue.delayed + 1 ||
    workerCurrent.queue.ready + workerCurrent.queue.leased > 2 ||
    workerCurrent.attempts.leased > workerBefore.attempts.leased + 2 ||
    workerCurrent.attempts.succeeded > workerBefore.attempts.succeeded + 2;
  if (failureDrift || concurrencyOvershoot)
    throw new Error(
      `The isolated collaboration smoke observed failure or concurrent queue drift (${outboxDrainDiagnostic(before, workerBefore, before.pendingOutbox + 1, current, workerCurrent, 1, 1)}).`,
    );
}

function assertNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`Remote staging returned invalid ${label}.`);
}

function requiredTimestamp(value, label) {
  if (typeof value !== "string")
    throw new Error(`Remote staging returned invalid ${label}.`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed))
    throw new Error(`Remote staging returned invalid ${label}.`);
  return parsed;
}

function optionalTimestamp(value, label) {
  if (value === null) return null;
  return requiredTimestamp(value, label);
}

function workerBaselineDiagnostic(operations, worker) {
  return [
    `apiPending=${operations.pendingOutbox}`,
    `workerDelayed=${worker.queue.delayed}`,
    `ready=${worker.queue.ready}`,
    `leased=${worker.queue.leased}`,
    `paused=${worker.queue.paused}`,
    `unsupported=${worker.queue.unsupported}`,
    `deadLettered=${worker.queue.deadLettered}`,
    `leasedAttempts=${worker.attempts.leased}`,
    `workerStatus=${worker.status}`,
  ].join(", ");
}

function outboxDrainDiagnostic(
  before,
  workerBefore,
  expectedPendingOutbox,
  current,
  workerCurrent,
  statusPollCount,
  workerPollCount,
) {
  if (!current || !workerCurrent)
    return [
      `statusPolls=${statusPollCount}`,
      `workerPolls=${workerPollCount}`,
      `baselinePendingOutbox=${before.pendingOutbox}`,
      `expectedPendingOutbox=${expectedPendingOutbox}`,
      "status=unobserved",
    ].join(", ");
  const lastProcessedAt =
    current.lastProcessedAtMs === null
      ? "missing"
      : before.lastProcessedAtMs !== null &&
          current.lastProcessedAtMs <= before.lastProcessedAtMs
        ? "not_advanced"
        : "advanced";
  return [
    `statusPolls=${statusPollCount}`,
    `workerPolls=${workerPollCount}`,
    `baselinePendingOutbox=${before.pendingOutbox}`,
    `expectedPendingOutbox=${expectedPendingOutbox}`,
    `observedPendingOutbox=${current.pendingOutbox}`,
    `failedCount=${current.failedCount}`,
    `lastProcessedAt=${lastProcessedAt}`,
    `baselineDelayed=${workerBefore.queue.delayed}`,
    `observedDelayed=${workerCurrent.queue.delayed}`,
    `ready=${workerCurrent.queue.ready}`,
    `leased=${workerCurrent.queue.leased}`,
    `paused=${workerCurrent.queue.paused}`,
    `unsupported=${workerCurrent.queue.unsupported}`,
    `deadLettered=${workerCurrent.queue.deadLettered}`,
    `succeededDelta=${workerCurrent.attempts.succeeded - workerBefore.attempts.succeeded}`,
    `failedAttemptDelta=${workerCurrent.attempts.failed - workerBefore.attempts.failed}`,
    `deadAttemptDelta=${workerCurrent.attempts.deadLettered - workerBefore.attempts.deadLettered}`,
    `lastSuccessfulSweep=${advancedLabel(workerBefore.lastSuccessfulSweepAtMs, workerCurrent.lastSuccessfulSweepAtMs)}`,
    `observedAt=${advancedLabel(workerBefore.observedAtMs, workerCurrent.observedAtMs)}`,
  ].join(", ");
}

function advancedLabel(before, current) {
  return current > before ? "advanced" : "not_advanced";
}

async function poll(callback, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await callback();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return null;
}

function normalizedEmail(value, label) {
  const normalized = value.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/u.test(normalized) || normalized.length > 320)
    throw new Error(`${label} must resolve to a valid email address.`);
  return normalized;
}

function publicHttpsOrigin(value, label) {
  const origin = new URL(value);
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw new Error(
      `${label} must be a public HTTPS origin without credentials or a path.`,
    );
  if (
    origin.hostname === "localhost" ||
    origin.hostname === "127.0.0.1" ||
    origin.hostname === "::1" ||
    origin.hostname === "[::1]"
  )
    throw new Error(`${label} cannot be a loopback host.`);
  return origin;
}

function remoteFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
}

function strictBoolean(environment, name) {
  const value = required(environment, name);
  if (value !== "true" && value !== "false")
    throw new Error(`${name} must be true or false.`);
  return value === "true";
}

function required(environment, name) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function requiredSecret(environment, name) {
  const value = environment[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function main() {
  const result = await runRemoteStagingSmoke(
    readRemoteStagingSmokeConfiguration(),
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        status: "failed",
        operation: "remote-staging-smoke",
        error:
          error instanceof Error ? error.message : "Unknown smoke failure.",
      })}\n`,
    );
    process.exitCode = 1;
  });
