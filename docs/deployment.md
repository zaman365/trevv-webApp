# Deployment

## Recommended EU topology

- Web/PWA: a Node-compatible Next.js host in an EU region
- API and Worker: separate long-running Node 22.23.2+ services in the same private EU network
- Database: managed PostgreSQL 17 with point-in-time recovery and encrypted connections
- Files: not required for the current alpha because no upload API accepts attachment bytes; add a private S3-compatible EU bucket, scanning, quotas, signed downloads, and lifecycle rules before enabling attachments
- Observability: a reviewed EU-region metrics, structured-log, error-tracking,
  dashboard, and alert-routing stack with enforced redaction and retention. No
  vendor or destination is currently selected or provisioned.

Web, Mobile, and Desktop point to one public HTTPS API. Only the API and private Worker receive database credentials; Web and the client bundles do not. The Worker exposes health/telemetry only on the private service network and is not internet-facing.

## Current deployment truth

The hosted `trevv.de` experience is still the fictional-data, browser-local
technical preview. No qualifying production-shaped or real-data remote staging
system is release evidence, no production/customer database has been migrated,
and no customer data is authorized. A disposable, fictional-data `$0` Render
preview may be provisioned for bounded functional rehearsal; its sleeping
public services and expiring database do not close any managed-staging,
backup/restore, private-networking, availability, or production gate.

The repository now defines a production-shaped local/CI topology in `compose.staging.yaml`:

- standalone production-built Next.js Web;
- two load-balanced Hono API processes;
- PostgreSQL 17 plus a one-shot migration service;
- two workers competing through durable leases;
- a private file mail sink; and
- an Nginx edge with self-signed local TLS plus isolated smoke containers.

This topology deliberately uses self-signed TLS at its local edge, plaintext private service/database links, local database credentials, `NODE_ENV=test` transport allowances, and a file mail sink. It is suitable for repeatable CI validation, not public staging. A real staging environment still requires a trusted TLS edge, managed PostgreSQL with encrypted transport and tested restore, authenticated SMTP on a test domain, secret-manager injection, private service networking, and an external telemetry/alert destination.

Phase 5 adds repository-owned operational foundations: bounded request bodies,
shared PostgreSQL rate-limit windows with keyed client identifiers, sanitized
correlation IDs, redacted structured logs, private API/Worker metrics, explicit
readiness thresholds, CSP reporting, and vendor-neutral Prometheus/Grafana
assets. These are contracts and local evidence, not a running operations
service. No external log or error collector, source-map upload, metrics scraper,
dashboard import, alert route, or on-call destination has been provisioned.

## Build commands

| Service | Build                                    | Start                                          |
| ------- | ---------------------------------------- | ---------------------------------------------- |
| Web     | `pnpm --filter @founderhq/web build`     | `pnpm --filter @founderhq/web start`           |
| API     | `pnpm --filter @founderhq/api build`     | `node apps/api/dist/index.js`                  |
| Worker  | `pnpm --filter @founderhq/worker build`  | `node apps/worker/dist/index.js`               |
| Mobile  | `pnpm --filter @founderhq/mobile build`  | EAS/native pipeline                            |
| Desktop | `pnpm --filter @founderhq/desktop build` | `pnpm --filter @founderhq/desktop tauri build` |

Run `pnpm install --frozen-lockfile`, `pnpm contracts:generate`, and all quality gates before producing artifacts. Set `CSP_MODE` and `HSTS_ENABLED` before the Web build: Next.js compiles both into the artifact, so changing only the running container environment does nothing. Keep CSP in `report-only` until reports are reviewed and the policy passes the browser suite; enable HSTS only on a trusted HTTPS host. Every promotion requires a new artifact with the intended values recorded in its release manifest.

Apply `NODE_ENV=production DATABASE_URL='postgresql://…?sslmode=verify-full' pnpm db:migrate` as a one-off release job before API rollout; the migration entry point rejects an unspecified environment and unverified production database transport. Run `pnpm db:seed` only against a new, disposable fictional-demo database; never seed a pilot, alpha, staging, production, or other real-data database.

The root `pnpm build` validates every workspace through Turborepo. A Sites environment that deliberately launches the root script through npm compiles the same Web/PWA through the official Vinext/Cloudflare adapter and stages its Worker artifact at the repository root. This deployment-only target does not change the normal Next.js development or production build.

CI's `staging-topology` gate builds the production-shaped images, derives each
Web/API/Worker/migration artifact's actual immutable Docker `sha256:` image ID,
injects the service IDs together with
the full Git SHA and one candidate release ID, and proves the running
containers match those IDs and the completed migration container ran the
expected migration image. It then starts the Web/API/PostgreSQL/two-worker/
mail/edge topology, upgrades a populated schema from migration `0008` through
the real Drizzle journal, verifies a second migration pass is a no-op, and
smokes anonymous guarding, trusted local TLS, secure auth cookies, cross-origin
rejection, onboarding, a tenant-scoped Workspace read, both API instances,
both Worker instances, Web-to-API release correlation, atomic Team-to-room
creation, message round-trip, query-free proxy logs, real retention redaction,
expired-lease recovery, exactly-one-worker processing, and authenticated Web
rendering without demo substitution. Web and API both report
`REGISTRATION_MODE=invite_only`; before using the test-only first-owner
bootstrap, the smoke proves that the same sign-up without the bootstrap header
is rejected and creates no auth state. The smoke can create only its first test
owner through a dedicated 32+ character bootstrap header whose secret is
accepted by the API only under `NODE_ENV=test`; no production configuration
accepts that bypass. Invite-only admission is also covered separately by the
PostgreSQL auth integration suite. The local Web document must expose the
build's report-only CSP, no enforcing CSP, and no HSTS, matching the deliberately
self-signed local topology. Failure logs are captured and cleanup failures fail
the gate. This does not provision or deploy remote infrastructure.

A future production-release smoke is a distinct trusted-HTTPS gate. It must
assert the response headers actually contain an enforcing
`Content-Security-Policy`, omit `Content-Security-Policy-Report-Only`, and
contain the reviewed `Strict-Transport-Security` policy. Recording those values
in a manifest or setting runtime variables is not sufficient because both modes
are compiled into the Web artifact. The local topology does not run or satisfy
that production-release smoke.

## Release order

1. Snapshot/verify PostgreSQL and validate backup restore recency.
2. Run migrations with a dedicated migration identity.
3. Deploy API with the shared limiter and trusted-edge contract; verify process liveness separately, `/api/v1/readyz` for PostgreSQL-backed readiness, an authenticated tenant read/write smoke, auth cookie policy, one permission-scoped request, two distinct client-limit identities, and one correlated Web-to-API request.
4. Deploy at least two Worker instances and confirm `/livez`, `/readyz`, queue-age/attempt metrics, handler ownership, lease recovery, and one-worker-only acknowledgement.
5. Build and deploy Web with server-only `API_ORIGIN` set to the private API load balancer, `NEXT_PUBLIC_APP_URL` set to the canonical public HTTPS origin, `DEMO_MODE=false`, and reviewed build-time `CSP_MODE`/`HSTS_ENABLED` values. Better Auth URL and secrets belong to the API, not Web.
6. Run Web smoke, Playwright, axe, tenant/Team/message/outbox smoke, retention, export, and rollback tests.
7. Point Expo/Tauri builds at the same API only after API compatibility is confirmed.

Database changes must be backwards-compatible for one release and Workers may
roll only after mixed-version lease behavior is rehearsed. The current
candidate is a Web/API compatibility boundary: the previous API lacks the new
readiness envelope and invite-only admission guard. It therefore requires the
coordinated blue/green procedure in `docs/ga-release-runbook.md`, with signup
closed at the trusted edge and old Web/API and candidate Web/API kept as aligned
pairs. Do not roll this Web back independently over a candidate API, or a
candidate Web over the previous API. Never roll database state back with
destructive SQL; use the rehearsed application pair or a reviewed forward fix.

Before closed-alpha traffic, connect the private metric endpoints to a selected collector, validate the repository-owned rules, import the dashboard, and route test alerts to named responders. Configure alert thresholds for readiness staleness, oldest ready queue age, failed attempts, dead-letter count, unsupported events, handler-paused events, missing scrape targets, and request-protection failure. Provide a reviewed dead-letter inspection/replay procedure; the worker records these states but the repository does not yet include an operator replay console. Exercise SIGTERM draining and a worker replacement while messages continue to be accepted.

## Required production variables

Use `.env.example` as the implemented catalog. Secrets belong in the provider secret manager. Public client variables may contain URLs/IDs only. Set `DEMO_MODE=false`; do not expose database, request-protection, mail, or future provider credentials to Next.js, Expo, or Vite bundles. The API, Worker, and migration job require a production `DATABASE_URL` with exactly one `sslmode=verify-full`; `sslmode=require` encrypts transport but does not verify the server identity in the pinned driver and is rejected. The runtime trust store must contain the managed database CA. The API also requires a non-placeholder 32+ character `BETTER_AUTH_SECRET`, HTTPS `BETTER_AUTH_URL` and `WEB_ORIGIN`, `MAIL_FROM`, and authenticated TLS SMTP settings. Production requires host-only authentication cookies: leave `AUTH_COOKIE_DOMAIN` unset and route browser authentication through the same-origin Web API boundary. A parent-domain bearer cookie would be exposed to every lower-assurance subdomain. Production refuses the test mail sink.

Set the same `REGISTRATION_MODE` on Web and API. `invite_only` is the intended
live default and validates a matching, unexpired, unrevoked, unconsumed
invitation in PostgreSQL before Better Auth account creation. `closed` also
blocks invited people from creating an account. `public` is confined to
development/test bootstrap flows and production startup rejects it until the
public-release gates are explicitly approved.

Set `RELEASE_ID`, the full `RELEASE_GIT_SHA`, and the actual immutable
`RELEASE_IMAGE_ID` on every packaged Web, API, and Worker process. Each service
has its own image digest/ID; do not substitute an image tag. Production requires
all three values. A test topology can set `RELEASE_METADATA_REQUIRED=true` to
enforce the same rule despite its nonproduction transport allowances. The
public promotion smoke must compare readiness from every API and Worker
instance plus the Web's own and upstream-API metadata with the signed manifest.

The quality workflow's `ci-build-only-*` identity is a deterministic
configuration-validation fixture. That build output is not uploaded or
promotable and its synthetic digest must never be used as a deployment image
identity. The topology job separately binds each runnable service to its actual
Docker image ID before any smoke test.

Production API request protection requires:

- `RATE_LIMIT_BACKEND=postgres` for cross-replica enforcement;
- a non-placeholder 32+ character `RATE_LIMIT_HASH_SECRET`, stored only in the
  secret manager and identical across the active API cohort; and
- `TRUSTED_CLIENT_IP_HEADER` naming an explicit `X-` header that the public edge
  always strips and overwrites. Never trust a caller-supplied forwarding value.

Changing the hash secret changes limiter identities and requires a coordinated
rotation plan. The process-local memory backend is development/test only.
`ERROR_REPORTING_MODE=external` fails closed unless the application is built
with a reporter adapter. No external collector or adapter is provisioned, so
deployed artifacts must keep `ERROR_REPORTING_MODE=disabled` until provider,
privacy, retention, source-map, secret, and failure-isolation reviews pass.

`CSP_MODE` and `HSTS_ENABLED` are Web build-time inputs, not runtime toggles.
Record them with the artifact. Use `report-only`/`false` for local self-signed
staging. A public trusted-HTTPS release may use HSTS only after host and rollback
review, and may use enforced CSP only after violation reports and browser tests
show that required application behavior is covered.

Each Worker additionally requires a unique `WORKER_ID` and explicit `DEMO_MODE=false`. Operational controls include `WORKER_ENABLED`, `WORKER_DISABLED_HANDLERS`, poll/Attention/telemetry intervals, `WORKER_READINESS_MAX_STALENESS_MS`, `WORKER_READINESS_MAX_READY_AGE_MS`, `WORKER_READINESS_MAX_UNSUPPORTED_AGE_MS`, `WORKER_READINESS_MAX_DEAD_LETTERS`, batch size, concurrency, lease duration, maximum attempts, and the private health host/port. Disabling a handler is a kill switch: its owned events remain visible as paused backlog and are not silently acknowledged. A threshold does not replace dead-letter inspection/redrive or incident response. Never expose the Worker health server to the public internet.

Provider OAuth, imports, private object storage, billing, analytics, AI/model
access, and automated external effects remain disabled and have no supported
production environment variables. Do not add credentials speculatively. A
provider may be introduced only after pilot evidence, privacy/subprocessor
review, implementation, isolation tests, and explicit enablement approval.

GitHub Actions intentionally has no production deploy job, and the Web package intentionally has no deploy command. The former Web-only Cloudflare promotion could publish a client without a matching API, worker, database migration, mail service, or rollback cohort. Reintroduce production automation only after remote staging proves the complete topology and one reviewed release manifest can promote database migration, API, workers, Web, SMTP/secret configuration, health checks, synthetic smoke, and rollback together. Production should keep the `trevv.de` custom domain only; `workers_dev` remains explicitly disabled in `apps/web/wrangler.jsonc`.

## Public-beta gate

The repository is currently **no-go for public beta and Phase 6**. The local
compose API and Worker use `NODE_ENV=test`; therefore the topology does not
prove production-mode startup. Remote production-shaped staging, managed
backup/restore, trusted TLS and mail, private networking, external telemetry
and alert routing, source-map/error tracking, dead-letter operations, reviewed
privacy/terms and data-lifecycle drills, and real pilot/pricing evidence remain
unresolved. No provider, storage, billing, AI, production migration, or public
deployment is authorized by this guide.

## Deep links

Web uses HTTPS application routes on the configured host; `trevv.de` is the primary product domain. Mobile registers `trevv://`; desktop registers the Tauri deep-link capability when packaging is enabled. Auth callbacks must include a one-time state/PKCE verifier and return to a specific safe route. Default application entry points open Portfolio; arbitrary external return URLs are never accepted.
