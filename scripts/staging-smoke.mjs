import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { connect as connectTls } from "node:tls";
import { pathToFileURL } from "node:url";

const origin = requiredUrl("STAGING_ORIGIN");
const publicOrigin = requiredUrl("STAGING_PUBLIC_ORIGIN");
const internalProxyOrigin = requiredUrl("STAGING_INTERNAL_PROXY_ORIGIN");
const databaseUrl = required("DATABASE_URL");
const mailSinkFile = required("MAIL_SINK_FILE");
const registrationBootstrapSecret = required(
  "TEST_REGISTRATION_BOOTSTRAP_SECRET",
);
const expectedRelease = {
  releaseId: required("EXPECTED_RELEASE_ID"),
  gitSha: required("EXPECTED_RELEASE_GIT_SHA").toLowerCase(),
  apiImageId: required("EXPECTED_API_IMAGE_ID").toLowerCase(),
  workerImageId: required("EXPECTED_WORKER_IMAGE_ID").toLowerCase(),
  webImageId: required("EXPECTED_WEB_IMAGE_ID").toLowerCase(),
  migrateImageId: required("EXPECTED_MIGRATE_IMAGE_ID").toLowerCase(),
};
validateExpectedRelease(expectedRelease);
const apiOrigins = serviceOrigins("STAGING_API_ORIGINS", [
  "http://api-1:8787",
  "http://api-2:8787",
]);
const workerOrigins = serviceOrigins("STAGING_WORKER_ORIGINS", [
  "http://worker-1:9090",
  "http://worker-2:9090",
]);
const suffix = crypto.randomUUID().slice(0, 8);
const email = `topology-${suffix}@example.test`;
const password = "Topology-smoke-password-1";
const cookieJar = new Map();
const queryLogSentinel = "TREVV_QUERY_SENTINEL_MUST_NOT_APPEAR";

const requireFromDatabasePackage = createRequire(
  new URL("../packages/db/package.json", import.meta.url),
);
const postgresEntry = requireFromDatabasePackage.resolve("postgres");
const { default: postgres } = await import(pathToFileURL(postgresEntry).href);
const database = postgres(databaseUrl, { max: 1, prepare: false });

try {
  await verifyTlsBoundary();
  await verifyServiceHealth();
  await verifyTwoApiRouting();
  await emitQueryLogSentinel();
  await verifyAnonymousBoundary();
  await verifyHeaderlessRegistrationRejected();
  await signUpAndVerify();
  await signIn();
  await verifyAuthProxyBoundary();
  await verifyCrossOriginBoundary();

  const onboarding = await apiJson("/api/v1/onboarding");
  assertStatus(onboarding, 200, "load onboarding");
  const completion = await apiJson("/api/v1/onboarding/complete", {
    method: "POST",
    headers: { "idempotency-key": crypto.randomUUID() },
    body: {
      step: 5,
      organizationName: `Topology ${suffix}`,
      organizationSlug: `topology-${suffix}`,
      workspaceName: `Operations ${suffix}`,
      workspaceSlug: `operations-${suffix}`,
      workspaceType: "business",
      workspaceColor: "#315c75",
      blueprintKey: "blank",
    },
  });
  assertStatus(completion, 201, "complete onboarding");

  const session = await apiJson("/api/v1/session");
  assertStatus(session, 200, "resolve the authenticated tenant");
  const organizationId = stringField(session.body, "organizationId");
  const userId = stringField(objectField(session.body, "user"), "id");
  const workspaceId = stringField(completion.body, "workspaceId");

  const workspaces = await apiJson("/api/v1/workspaces");
  assertStatus(workspaces, 200, "read tenant workspaces");
  if (
    !Array.isArray(workspaces.body) ||
    !workspaces.body.some(
      (workspace) => isRecord(workspace) && workspace.id === workspaceId,
    )
  )
    throw new Error("The completed tenant workspace was not readable.");

  const team = await apiJson(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/teams`,
    {
      method: "POST",
      headers: { "idempotency-key": crypto.randomUUID() },
      body: {
        workspaceId,
        name: `Technology ${suffix}`,
        purpose: "Topology verification",
        preset: "technology",
        featureCapabilities: ["work", "messages", "decisions"],
        memberIds: [userId],
        leadUserId: userId,
      },
    },
  );
  assertStatus(team, 201, "create a Team and its room");
  const teamId = stringField(team.body, "id");
  const room = objectField(team.body, "room");
  const conversationId = stringField(room, "conversationId");

  const message = await apiJson(
    `/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: "POST",
      headers: { "idempotency-key": crypto.randomUUID() },
      body: {
        clientMessageId: crypto.randomUUID(),
        body: `Production-shaped topology message ${suffix}`,
        intent: "message",
        metadata: { smoke: true },
      },
    },
  );
  assertStatus(message, 201, "send a Team-room message");
  const messageId = stringField(message.body, "id");

  const messages = await apiJson(
    `/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`,
  );
  assertStatus(messages, 200, "read the Team-room message");
  const messageRows = objectField(messages.body, "data", true);
  if (
    !Array.isArray(messageRows) ||
    !messageRows.some(
      (candidate) => isRecord(candidate) && candidate.id === messageId,
    )
  )
    throw new Error("The durable Team-room message was not returned.");

  await verifyOutboxAndWorkers({
    organizationId,
    userId,
    teamId,
    messageId,
  });
  await verifyRetentionEffect({ organizationId, conversationId, messageId });
  await verifyWorkerLeaseRecovery({ organizationId, userId });
  await verifyNoUnsupportedBacklog(new Date());
  await verifyAuthenticatedWebRendering();

  process.stdout.write(
    `${JSON.stringify({
      status: "ok",
      checks: [
        "auth",
        "invite-only-registration",
        "headerless-signup-rejection",
        "trusted-tls",
        "report-only-csp",
        "hsts-disabled",
        "secure-cookie",
        "auth-response-boundary",
        "cross-origin-rejection",
        "two-api-routing",
        "query-free-log-sentinel",
        "tenant-read-write",
        "team-room",
        "message",
        "outbox",
        "worker-event-catalog",
        "two-workers",
        "release-correlation",
        "retention-effect",
        "expired-lease-recovery",
        "web-rendering",
      ],
      teamId,
    })}\n`,
  );
} finally {
  await database.end();
}

async function verifyTlsBoundary() {
  if (origin.protocol !== "https:" || publicOrigin.protocol !== "https:")
    throw new Error("The staging edge and public origin must both use HTTPS.");
  await new Promise((resolve, reject) => {
    const socket = connectTls({
      host: origin.hostname,
      port: Number(origin.port || 443),
      servername: origin.hostname,
      rejectUnauthorized: true,
    });
    socket.setTimeout(5_000);
    socket.once("secureConnect", () => {
      const protocol = socket.getProtocol();
      const certificate = socket.getPeerCertificate();
      if (
        !socket.authorized ||
        !new Set(["TLSv1.2", "TLSv1.3"]).has(protocol) ||
        !certificate.subjectaltname?.includes("DNS:proxy")
      ) {
        socket.destroy();
        reject(new Error("The local staging TLS identity was not trusted."));
        return;
      }
      socket.end();
      resolve();
    });
    socket.once("timeout", () =>
      socket.destroy(new Error("The staging TLS handshake timed out.")),
    );
    socket.once("error", reject);
  });
}

async function verifyServiceHealth() {
  for (const serviceOrigin of [origin, ...apiOrigins]) {
    const response = await fetch(new URL("/api/v1/readyz", serviceOrigin), {
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(
        `API readiness failed at ${serviceOrigin.host} with HTTP ${response.status}.`,
      );
    const body = await response.json();
    if (
      !isRecord(body) ||
      body.status !== "ready" ||
      body.mode !== "live" ||
      body.registrationMode !== "invite_only" ||
      body.database !== "ready"
    )
      throw new Error(
        `API ${serviceOrigin.host} does not have a ready live data plane.`,
      );
    verifyReleaseMetadata(
      body.release,
      expectedRelease.apiImageId,
      `API ${serviceOrigin.host}`,
    );
  }
  const webResponse = await fetch(new URL("/api/web/readyz", origin), {
    cache: "no-store",
  });
  const webBody = await webResponse.json();
  if (
    !webResponse.ok ||
    !isRecord(webBody) ||
    webBody.status !== "ready" ||
    webBody.mode !== "live" ||
    webBody.registrationMode !== "invite_only" ||
    webBody.api !== "ready"
  )
    throw new Error("The standalone Web runtime is not dependency-ready.");
  verifyReleaseMetadata(webBody.release, expectedRelease.webImageId, "Web");
  verifyReleaseMetadata(
    webBody.apiRelease,
    expectedRelease.apiImageId,
    "Web upstream API",
  );

  const edgeResponse = await fetch(new URL("/readyz", internalProxyOrigin), {
    cache: "no-store",
  });
  if (!edgeResponse.ok)
    throw new Error("The edge does not report complete topology readiness.");

  for (const workerOrigin of workerOrigins) {
    const response = await fetch(new URL("/readyz", workerOrigin), {
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(
        `Worker readiness failed at ${workerOrigin} with HTTP ${response.status}.`,
      );
    const body = await response.json();
    if (!isRecord(body) || body.status !== "ready")
      throw new Error(`Worker ${workerOrigin} returned invalid readiness.`);
    verifyReleaseMetadata(
      body.release,
      expectedRelease.workerImageId,
      `Worker ${workerOrigin}`,
    );
  }
}

async function verifyTwoApiRouting() {
  const upstreams = new Set();
  for (let attempt = 0; attempt < 12 && upstreams.size < 2; attempt += 1) {
    const response = await fetch(
      new URL("/topology/api-readiness", internalProxyOrigin),
      { cache: "no-store" },
    );
    const body = await response.json();
    const upstream = response.headers.get("x-trevv-staging-api-upstream");
    if (
      !response.ok ||
      !isRecord(body) ||
      body.status !== "ready" ||
      body.registrationMode !== "invite_only" ||
      body.database !== "ready" ||
      !upstream
    )
      throw new Error("The private API router returned an invalid response.");
    verifyReleaseMetadata(
      body.release,
      expectedRelease.apiImageId,
      `routed API ${upstream}`,
    );
    upstreams.add(upstream);
  }
  if (upstreams.size !== 2)
    throw new Error("The private API router did not reach both API instances.");
}

function validateExpectedRelease(value) {
  if (!/^[a-z0-9][a-z0-9._+-]{7,127}$/u.test(value.releaseId))
    throw new Error("EXPECTED_RELEASE_ID is not a valid immutable release ID.");
  if (!/^[a-f0-9]{40}$/u.test(value.gitSha))
    throw new Error("EXPECTED_RELEASE_GIT_SHA must be a full Git SHA.");
  for (const [name, imageId] of [
    ["EXPECTED_API_IMAGE_ID", value.apiImageId],
    ["EXPECTED_WORKER_IMAGE_ID", value.workerImageId],
    ["EXPECTED_WEB_IMAGE_ID", value.webImageId],
    ["EXPECTED_MIGRATE_IMAGE_ID", value.migrateImageId],
  ])
    if (!/^sha256:[a-f0-9]{64}$/u.test(imageId))
      throw new Error(`${name} must be Docker's immutable sha256 image ID.`);
}

function verifyReleaseMetadata(value, expectedImageId, label) {
  if (
    !isRecord(value) ||
    value.releaseId !== expectedRelease.releaseId ||
    value.gitSha !== expectedRelease.gitSha ||
    value.imageId !== expectedImageId
  )
    throw new Error(
      `${label} does not report the candidate artifact identity.`,
    );
}

async function emitQueryLogSentinel() {
  const url = new URL("/topology/log-sentinel", internalProxyOrigin);
  url.searchParams.set("sensitive", queryLogSentinel);
  const response = await fetch(url, { cache: "no-store" });
  if (response.status !== 204)
    throw new Error("The query-log sentinel endpoint did not respond.");
}

async function verifyAnonymousBoundary() {
  const publicPage = await fetch(new URL("/sign-in", origin), {
    redirect: "manual",
  });
  if (!publicPage.ok || !(await publicPage.text()).includes("TREVV"))
    throw new Error("The built Web sign-in page did not render.");
  const reportOnlyPolicy = publicPage.headers.get(
    "content-security-policy-report-only",
  );
  if (
    !reportOnlyPolicy?.includes("default-src 'self'") ||
    !reportOnlyPolicy.includes("report-uri /api/web/csp-report")
  )
    throw new Error(
      "The local staging Web document did not return the expected report-only CSP.",
    );
  if (publicPage.headers.has("content-security-policy"))
    throw new Error(
      "The local staging Web document unexpectedly returned an enforcing CSP.",
    );
  if (publicPage.headers.has("strict-transport-security"))
    throw new Error(
      "The self-signed local staging Web document unexpectedly enabled HSTS.",
    );

  const privatePage = await fetch(new URL("/app/portfolio", origin), {
    redirect: "manual",
  });
  if (privatePage.status < 300 || privatePage.status >= 400)
    throw new Error("Anonymous private Web access did not redirect.");
  if (!privatePage.headers.get("location")?.includes("/sign-in"))
    throw new Error(
      "Anonymous private Web access did not redirect to sign-in.",
    );
  if ((await privatePage.text()).includes("Northstar Apparel"))
    throw new Error("Anonymous private Web access leaked fictional app data.");
}

async function verifyHeaderlessRegistrationRejected() {
  if (cookieJar.size !== 0)
    throw new Error(
      "The headerless registration check must run before an authenticated session exists.",
    );
  const response = await apiJson("/api/auth/sign-up/email", {
    method: "POST",
    body: {
      name: "Rejected Topology Owner",
      email,
      password,
      callbackURL: new URL("/onboarding", publicOrigin).toString(),
    },
    authenticated: false,
  });
  if (
    response.status !== 403 ||
    apiErrorCode(response.body) !== "REGISTRATION_INVITATION_REQUIRED"
  )
    throw new Error(
      "Invite-only staging accepted a headerless first-owner sign-up.",
    );
  if (response.headers.has("set-cookie") || cookieJar.size !== 0)
    throw new Error(
      "Rejected headerless registration unexpectedly created authentication state.",
    );
}

async function signUpAndVerify() {
  const signup = await apiJson("/api/auth/sign-up/email", {
    method: "POST",
    headers: {
      "x-trevv-test-registration-bootstrap": registrationBootstrapSecret,
    },
    body: {
      name: "Topology Owner",
      email,
      password,
      callbackURL: new URL("/onboarding", publicOrigin).toString(),
    },
    authenticated: false,
  });
  assertStatus(signup, 200, "create an account");
  const action = await waitForMailAction(email, "Verify your TREVV email");
  const actionUrl = new URL(action);
  const boundary = await fetch(
    new URL(`${actionUrl.pathname}${actionUrl.search}`, origin),
    {
      redirect: "manual",
      headers: { origin: publicOrigin.origin },
    },
  );
  rememberCookies(boundary.headers);
  if (boundary.status < 300 || boundary.status >= 400)
    throw new Error(
      `The Web boundary did not normalize email verification (HTTP ${boundary.status}).`,
    );
  const verification = await apiJson("/api/web/verify-email", {
    method: "POST",
    body: { returnTo: "/onboarding" },
  });
  assertStatus(verification, 200, "verify the email address");
}

async function signIn() {
  const response = await apiJson("/api/auth/sign-in/email", {
    method: "POST",
    body: { email, password, rememberMe: false },
    authenticated: false,
  });
  assertStatus(response, 200, "sign in");
  if (cookieJar.size === 0)
    throw new Error("Sign-in returned no session cookie.");
  const sessionCookie = setCookieValues(response.headers).find((value) =>
    /(?:^|-)trevv\.session_token=/u.test(value),
  );
  if (
    !sessionCookie ||
    !/;\s*HttpOnly(?:;|$)/iu.test(sessionCookie) ||
    !/;\s*Secure(?:;|$)/iu.test(sessionCookie) ||
    !/;\s*SameSite=Lax(?:;|$)/iu.test(sessionCookie)
  )
    throw new Error(
      "The public HTTPS sign-in boundary did not set a Secure, HTTP-only, SameSite=Lax session cookie.",
    );
}

async function verifyCrossOriginBoundary() {
  const attackerOrigin = "https://attacker.example.test";
  const read = await fetch(new URL("/api/v1/health", origin), {
    headers: { origin: attackerOrigin },
    cache: "no-store",
  });
  if (
    read.headers.get("access-control-allow-origin") === attackerOrigin ||
    read.headers.get("access-control-allow-origin") === "*"
  )
    throw new Error("The API made a response readable to an untrusted origin.");

  const mutation = await fetch(
    new URL("/api/v1/session/organization", origin),
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        cookie: cookieHeader(),
        origin: attackerOrigin,
      },
      body: JSON.stringify({ organizationId: crypto.randomUUID() }),
      cache: "no-store",
    },
  );
  const body = await mutation.json().catch(() => null);
  if (
    mutation.status !== 403 ||
    apiErrorCode(body) !== "invalid_request_origin"
  )
    throw new Error("A cross-origin cookie mutation was not rejected.");
}

async function verifyAuthProxyBoundary() {
  const response = await apiJson("/api/auth/list-sessions");
  if (response.status !== 404 || apiErrorCode(response.body) !== "not_found")
    throw new Error(
      "The public edge exposed a Better Auth operation outside the Web allowlist.",
    );
  if (JSON.stringify(response.body).toLowerCase().includes("token"))
    throw new Error("The denied auth response exposed session token data.");
}

async function verifyOutboxAndWorkers({
  organizationId,
  userId,
  teamId,
  messageId,
}) {
  const collaborationEvents = await database`
    select id, event_type
    from outbox_events
    where organization_id = ${organizationId}
      and (
        (event_type = 'team.created' and aggregate_id = ${teamId})
        or (event_type = 'message.sent' and aggregate_id = ${messageId})
      )
    order by event_type
  `;
  if (
    collaborationEvents.length !== 2 ||
    !collaborationEvents.some(
      ({ event_type }) => event_type === "team.created",
    ) ||
    !collaborationEvents.some(({ event_type }) => event_type === "message.sent")
  )
    throw new Error(
      "Team/message persistence did not atomically create both collaboration outbox events.",
    );
  for (const event of collaborationEvents)
    await verifyProcessedExactlyOnce(
      event.id,
      `actual ${event.event_type} collaboration event`,
    );

  const eventId = crypto.randomUUID();
  await database`
    insert into outbox_events (
      id, organization_id, event_type, aggregate_type, aggregate_id,
      actor_id, request_id, correlation_id, dedup_key, payload,
      available_at, created_at
    ) values (
      ${eventId}, ${organizationId}, 'item.updated', 'work_item',
      ${`topology-item-${eventId}`}, ${userId}, ${`topology-${eventId}`},
      ${`topology-${eventId}`}, ${`topology:${eventId}`}, ${database.json({ smoke: true })},
      now(), now()
    )
  `;

  await verifyProcessedExactlyOnce(eventId, "injected Attention event");
}

async function verifyRetentionEffect({
  organizationId,
  conversationId,
  messageId,
}) {
  const [retentionEvent] = await database`
    select id
    from outbox_events
    where organization_id = ${organizationId}
      and event_type = 'message.retention_due'
      and aggregate_type = 'message'
      and aggregate_id = ${messageId}
  `;
  if (!retentionEvent?.id)
    throw new Error(
      "Message creation did not schedule durable retention work.",
    );

  await database.begin(async (transaction) => {
    const [acceleratedMessage] = await transaction`
      update conversation_messages
      set expires_at = created_at + interval '1 millisecond'
      where organization_id = ${organizationId} and id = ${messageId}
      returning expires_at <= now() as retention_due
    `;
    if (!acceleratedMessage?.retention_due)
      throw new Error(
        "Could not accelerate message retention while preserving the expiry invariant.",
      );
    await transaction`
      update outbox_events
      set available_at = now()
      where organization_id = ${organizationId} and id = ${retentionEvent.id}
    `;
  });

  await verifyProcessedExactlyOnce(
    retentionEvent.id,
    "message retention event",
  );
  const redacted = await poll(async () => {
    const [row] = await database`
      select body, metadata, redacted_at, version
      from conversation_messages
      where organization_id = ${organizationId} and id = ${messageId}
    `;
    return row?.redacted_at ? row : null;
  }, 20_000);
  if (
    !redacted ||
    redacted.body !== "[Message expired]" ||
    !isRecord(redacted.metadata) ||
    Object.keys(redacted.metadata).length !== 0 ||
    redacted.version < 2
  )
    throw new Error("The retention worker did not redact message content.");

  const messages = await apiJson(
    `/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`,
  );
  assertStatus(messages, 200, "read the retained Team-room message");
  const rows = objectField(messages.body, "data", true);
  const visible = rows.find(
    (candidate) => isRecord(candidate) && candidate.id === messageId,
  );
  if (!visible || visible.body !== "[Message expired]")
    throw new Error("The API did not expose the durable retention result.");
}

async function verifyWorkerLeaseRecovery({ organizationId, userId }) {
  const eventId = crypto.randomUUID();
  const leaseToken = crypto.randomUUID();
  await database.begin(async (transaction) => {
    await transaction`
      insert into outbox_events (
        id, organization_id, event_type, aggregate_type, aggregate_id,
        actor_id, request_id, correlation_id, dedup_key, payload,
        attempts, available_at, locked_at, locked_by, lease_token,
        lease_expires_at, created_at
      ) values (
        ${eventId}, ${organizationId}, 'item.updated', 'work_item',
        ${`topology-recovery-item-${eventId}`}, ${userId},
        ${`topology-recovery-${eventId}`}, ${`topology-recovery-${eventId}`},
        ${`topology:recovery:${eventId}`}, ${transaction.json({ smoke: true })},
        1, now() - interval '2 minutes', now() - interval '2 minutes',
        'staging-crashed-worker', ${leaseToken}, now() - interval '1 minute',
        now() - interval '2 minutes'
      )
    `;
    await transaction`
      insert into outbox_attempts (
        id, organization_id, event_id, attempt, worker_id, lease_token,
        status, started_at
      ) values (
        ${crypto.randomUUID()}, ${organizationId}, ${eventId}, 1,
        'staging-crashed-worker', ${leaseToken}, 'leased',
        now() - interval '2 minutes'
      )
    `;
  });

  const recovered = await poll(async () => {
    const [row] = await database`
      select processed_at, processed_by, attempts
      from outbox_events
      where id = ${eventId}
    `;
    return row?.processed_at ? row : null;
  }, 20_000);
  if (
    !recovered ||
    recovered.attempts !== 2 ||
    !new Set(["staging-worker-1", "staging-worker-2"]).has(
      recovered.processed_by,
    )
  )
    throw new Error("The workers did not recover an expired lease safely.");

  const attempts = await database`
    select attempt, status, error_code
    from outbox_attempts
    where event_id = ${eventId}
    order by attempt
  `;
  if (
    attempts.length !== 2 ||
    attempts[0]?.status !== "failed" ||
    attempts[0]?.error_code !== "lease_expired" ||
    attempts[1]?.status !== "succeeded"
  )
    throw new Error("Expired-lease recovery did not retain truthful attempts.");
}

async function verifyProcessedExactlyOnce(eventId, label) {
  const processed = await poll(async () => {
    const [row] = await database`
      select processed_at, processed_by, attempts
      from outbox_events
      where id = ${eventId}
    `;
    return row?.processed_at ? row : null;
  }, 20_000);
  if (!processed) throw new Error(`Neither worker processed the ${label}.`);
  if (
    !new Set(["staging-worker-1", "staging-worker-2"]).has(
      processed.processed_by,
    )
  )
    throw new Error(`The ${label} was not acknowledged by a staging worker.`);
  if (processed.attempts !== 1)
    throw new Error(`The ${label} was claimed more than once.`);

  const [attempts] = await database`
    select count(*)::int as count
    from outbox_attempts
    where event_id = ${eventId} and status = 'succeeded'
  `;
  if (attempts?.count !== 1)
    throw new Error(
      `The processed ${label} lacks one durable success attempt.`,
    );
}

async function verifyNoUnsupportedBacklog(observedAfter) {
  for (const workerOrigin of workerOrigins) {
    const snapshot = await poll(async () => {
      const response = await fetch(new URL("/metrics", workerOrigin), {
        cache: "no-store",
      });
      if (!response.ok) return null;
      const body = await response.json();
      if (
        !isRecord(body) ||
        !isRecord(body.queue) ||
        typeof body.queue.observedAt !== "string" ||
        Date.parse(body.queue.observedAt) < observedAfter.getTime()
      )
        return null;
      return body;
    }, 20_000);
    if (!snapshot)
      throw new Error(
        `Worker telemetry at ${workerOrigin} did not refresh after the smoke mutations.`,
      );
    if (
      snapshot.queue.unsupported !== 0 ||
      snapshot.queue.oldestUnsupportedAgeMs !== null
    )
      throw new Error(
        `Worker ${workerOrigin} reported an unexpected unsupported outbox backlog.`,
      );
  }
}

async function verifyAuthenticatedWebRendering() {
  const response = await fetch(new URL("/app/portfolio", origin), {
    redirect: "manual",
    headers: { cookie: cookieHeader() },
  });
  const body = await response.text();
  if (!response.ok || !body.includes("<html"))
    throw new Error(
      `Authenticated built Web rendering failed with HTTP ${response.status}.`,
    );
  if (body.includes("Northstar Apparel"))
    throw new Error("Live Web rendering silently substituted fictional data.");
}

async function apiJson(
  path,
  { method = "GET", headers = {}, body, authenticated = true } = {},
) {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("accept", "application/json");
  if (body !== undefined)
    requestHeaders.set("content-type", "application/json");
  if (method !== "GET" && method !== "HEAD")
    requestHeaders.set("origin", publicOrigin.origin);
  if (authenticated && cookieJar.size > 0)
    requestHeaders.set("cookie", cookieHeader());
  const response = await fetch(new URL(path, origin), {
    method,
    headers: requestHeaders,
    redirect: "manual",
    cache: "no-store",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  rememberCookies(response.headers);
  return {
    status: response.status,
    headers: response.headers,
    body: await response.json().catch(() => null),
  };
}

function rememberCookies(headers) {
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

function cookieHeader() {
  return [...cookieJar.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

async function waitForMailAction(recipient, subject) {
  const action = await poll(async () => {
    let source = "";
    try {
      source = await readFile(mailSinkFile, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw error;
    }
    const records = source
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const record = records
      .toReversed()
      .find(
        (candidate) =>
          candidate?.message?.to === recipient &&
          candidate?.message?.subject === subject,
      );
    return record?.message?.text?.match(/https?:\/\/\S+/u)?.[0] ?? null;
  }, 20_000);
  if (!action)
    throw new Error(`The test mail sink did not receive ${subject}.`);
  return action;
}

async function poll(callback, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await callback();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
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

function objectField(value, name, allowArray = false) {
  if (!isRecord(value) || !(name in value))
    throw new Error(`Expected response field ${name}.`);
  const field = value[name];
  if (allowArray && Array.isArray(field)) return field;
  if (!isRecord(field))
    throw new Error(`Expected object response field ${name}.`);
  return field;
}

function stringField(value, name) {
  if (!isRecord(value) || typeof value[name] !== "string" || !value[name])
    throw new Error(`Expected string response field ${name}.`);
  return value[name];
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function requiredUrl(name) {
  const value = new URL(required(name));
  if (!new Set(["http:", "https:"]).has(value.protocol))
    throw new Error(`${name} must be an HTTP(S) URL.`);
  return value;
}

function serviceOrigins(name, fallbacks) {
  const configured = process.env[name]?.trim();
  const values = configured
    ? configured.split(",").map((value) => value.trim())
    : fallbacks;
  if (values.length !== 2 || values.some((value) => !value))
    throw new Error(`${name} must contain exactly two comma-separated URLs.`);
  return values.map((value) => {
    const origin = new URL(value);
    if (!new Set(["http:", "https:"]).has(origin.protocol))
      throw new Error(`${name} entries must be HTTP(S) URLs.`);
    return origin;
  });
}
