# Deployment

## Recommended EU topology

- Web/PWA: a Node-compatible Next.js host in an EU region
- API and Worker: separate long-running Node 22 services in the same private EU network
- Database: managed PostgreSQL 17 with point-in-time recovery and encrypted connections
- Files: not required for the current alpha because no upload API accepts attachment bytes; add a private S3-compatible EU bucket, scanning, quotas, signed downloads, and lifecycle rules before enabling attachments
- Observability: EU-project Sentry/log destination with payload redaction

Web, Mobile, and Desktop point to one public HTTPS API. Only the API and private Worker receive database credentials; Web and the client bundles do not. The Worker exposes health/telemetry only on the private service network and is not internet-facing.

## Current deployment truth

The hosted `trevv.de` experience is still the fictional-data, browser-local technical preview. The live `DEMO_MODE=false` Web/API/PostgreSQL/worker/mail system, including persistent Teams and Messages, has not been deployed remotely. No production or remote-staging database was migrated and no customer data was used.

The repository now defines a production-shaped local/CI topology in `compose.staging.yaml`:

- standalone production-built Next.js Web;
- two load-balanced Hono API processes;
- PostgreSQL 17 plus a one-shot migration service;
- two workers competing through durable leases;
- a private file mail sink; and
- an Nginx edge with self-signed local TLS plus isolated smoke containers.

This topology deliberately uses self-signed TLS at its local edge, plaintext private service/database links, local database credentials, `NODE_ENV=test` transport allowances, and a file mail sink. It is suitable for repeatable CI validation, not public staging. A real staging environment still requires a trusted TLS edge, managed PostgreSQL with encrypted transport and tested restore, authenticated SMTP on a test domain, secret-manager injection, private service networking, and an external telemetry/alert destination.

## Build commands

| Service | Build                                    | Start                                          |
| ------- | ---------------------------------------- | ---------------------------------------------- |
| Web     | `pnpm --filter @founderhq/web build`     | `pnpm --filter @founderhq/web start`           |
| API     | `pnpm --filter @founderhq/api build`     | `node apps/api/dist/index.js`                  |
| Worker  | `pnpm --filter @founderhq/worker build`  | `node apps/worker/dist/index.js`               |
| Mobile  | `pnpm --filter @founderhq/mobile build`  | EAS/native pipeline                            |
| Desktop | `pnpm --filter @founderhq/desktop build` | `pnpm --filter @founderhq/desktop tauri build` |

Run `pnpm install --frozen-lockfile`, `pnpm contracts:generate`, and all quality gates before producing artifacts. Apply `NODE_ENV=production DATABASE_URL='postgresql://…?sslmode=verify-full' pnpm db:migrate` as a one-off release job before API rollout; the migration entry point rejects an unspecified environment and unverified production database transport. Run `pnpm db:seed` only against a new, disposable fictional-demo database; never seed a pilot, alpha, staging, production, or other real-data database.

The root `pnpm build` validates every workspace through Turborepo. A Sites environment that deliberately launches the root script through npm compiles the same Web/PWA through the official Vinext/Cloudflare adapter and stages its Worker artifact at the repository root. This deployment-only target does not change the normal Next.js development or production build.

CI's `staging-topology` gate builds the production-shaped images, starts the Web/API/PostgreSQL/two-worker/mail/edge topology, upgrades a populated schema from migration `0008` through the real Drizzle journal, verifies a second migration pass is a no-op, and smokes anonymous guarding, trusted local TLS, secure auth cookies, cross-origin rejection, onboarding, a tenant-scoped Workspace read, both API instances, atomic Team-to-room creation, message round-trip, query-free proxy logs, real retention redaction, expired-lease recovery, exactly-one-worker processing, and authenticated Web rendering without demo substitution. Failure logs are captured and cleanup failures fail the gate. This does not provision or deploy remote infrastructure.

## Release order

1. Snapshot/verify PostgreSQL and validate backup restore recency.
2. Run migrations with a dedicated migration identity.
3. Deploy API; verify process liveness separately, `/api/v1/readyz` for PostgreSQL-backed readiness, an authenticated tenant read/write smoke, auth cookie policy, and one permission-scoped request.
4. Deploy at least two Worker instances and confirm `/livez`, `/readyz`, queue-age/attempt metrics, handler ownership, lease recovery, and one-worker-only acknowledgement.
5. Deploy Web with server-only `API_ORIGIN` set to the private API load balancer, `NEXT_PUBLIC_APP_URL` set to the canonical public HTTPS origin, and `DEMO_MODE=false`. Better Auth URL and secrets belong to the API, not Web.
6. Run Web smoke, Playwright, axe, tenant/Team/message/outbox smoke, retention, export, and rollback tests.
7. Point Expo/Tauri builds at the same API only after API compatibility is confirmed.

Use rolling API/Worker deploys. Database changes must be backwards-compatible for one release. Roll Web back independently; never roll database state back by applying destructive SQL. Create a forward fix instead.

Before closed-alpha traffic, configure alert thresholds for readiness staleness, oldest ready queue age, failed attempts, dead-letter count, unsupported events, and handler-paused events. Provide a reviewed dead-letter inspection/replay procedure; the worker records these states but the repository does not yet include an operator replay console. Exercise SIGTERM draining and a worker replacement while messages continue to be accepted.

## Required production variables

Use `.env.example` as the catalog. Secrets belong in the provider secret manager. Public client variables may contain URLs/IDs only. Set `DEMO_MODE=false`; do not expose database or integration credentials to Next.js, Expo, or Vite bundles. The API, Worker, and migration job require a production `DATABASE_URL` with exactly one `sslmode=verify-full`; `sslmode=require` encrypts transport but does not verify the server identity in the pinned driver and is rejected. The runtime trust store must contain the managed database CA. The API also requires a non-placeholder 32+ character `BETTER_AUTH_SECRET`, HTTPS `BETTER_AUTH_URL` and `WEB_ORIGIN`, `MAIL_FROM`, authenticated TLS SMTP settings, and `AUTH_COOKIE_DOMAIN` when the Web and auth hosts differ. Production refuses the test mail sink.

Each Worker additionally requires a unique `WORKER_ID` and explicit `DEMO_MODE=false`. Operational controls include `WORKER_ENABLED`, `WORKER_DISABLED_HANDLERS`, poll/Attention/telemetry intervals, readiness staleness, batch size, concurrency, lease duration, maximum attempts, and the private health host/port. Disabling a handler is a kill switch: its owned events remain visible as paused backlog and are not silently acknowledged. Never expose the Worker health server to the public internet.

GitHub Actions intentionally has no production deploy job, and the Web package intentionally has no deploy command. The former Web-only Cloudflare promotion could publish a client without a matching API, worker, database migration, mail service, or rollback cohort. Reintroduce production automation only after remote staging proves the complete topology and one reviewed release manifest can promote database migration, API, workers, Web, SMTP/secret configuration, health checks, synthetic smoke, and rollback together. Production should keep the `trevv.de` custom domain only; `workers_dev` remains explicitly disabled in `apps/web/wrangler.jsonc`.

## Deep links

Web uses HTTPS application routes on the configured host; `trevv.de` is the primary product domain. Mobile registers `trevv://`; desktop registers the Tauri deep-link capability when packaging is enabled. Auth callbacks must include a one-time state/PKCE verifier and return to a specific safe route. Default application entry points open Portfolio; arbitrary external return URLs are never accepted.
