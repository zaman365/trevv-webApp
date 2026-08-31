# TREVV

TREVV is an experimental, fictional-data technical preview of a portfolio-oriented Web/PWA concept. It lets evaluators explore how execution, decisions, waiting dependencies, evidence, and shared context could be organized. It is not a commercial service or evidence that a complete founder or company operating system exists.

> **Current release status: experimental fictional-data technical preview—not public beta or GA.** The hosted Web experience uses fictional sample data, and its changes stay in the current browser. In undeployed `DEMO_MODE=false`, identity, the persistent work-management loop, Teams, Team rooms, and Messages use tenant-scoped PostgreSQL with a durable outbox worker and permission-scoped Web invalidation. The repository also contains private-beta safety foundations for request protection, redacted telemetry, security headers, and reviewed data-lifecycle requests. A production-shaped topology is defined only for local/CI validation; it has not been deployed as a customer service, and no external collector, provider, storage, billing, or AI capability is enabled. The intended GA client and locale scope, if every release gate is eventually met, is English-only Web/PWA; German localization and native mobile/desktop releases are out of current GA scope. Do not enter real credentials, confidential information, or customer data in the hosted preview. See [known limitations](docs/known-limitations.md).

The current remote rollout target is a disposable, invite-only `$0` alpha at
`https://alpha.trevv.de`, using only explicitly fictional evaluation data.
Its API and sleeping Worker remain on their existing Render `onrender.com`
origins. This rollout does not change `trevv.de`, enable public registration,
or provide production, public-beta, or GA evidence. The alpha is considered
live only when the cutover smoke evidence for the deployed commit passes.

## What can be explored

- Organization → Portfolio → Workspace tenancy with automatic default-Portfolio migration
- deterministic Attention Engine, Waiting Center, personalized Portfolio roll-ups, and Change Radar
- review rituals, lightweight historical snapshots, and Decision consequence reviews
- Insights and opportunity discovery with promotion provenance
- managed Blueprints with safe diffs, selected application, local overrides, and detach
- stakeholder-safe Workspace views, import presets/dry runs, cross-Workspace dependencies, and workload evidence
- pricing-agnostic subscription and entitlement architecture with unrestricted development mode
- polished Workspace Overview, board table/Kanban, inline editing, and item side panel
- My Work, actionable Inbox, informational Notifications, Decision Center, Approval Center, search, integration previews, and a fictional onboarding walkthrough
- English-only intended GA scope, responsive mobile-browser layouts, dark mode, and installable PWA behavior
- versioned Hono API contract, explicit demo/live data planes, tenant-scoped PostgreSQL repositories, real Better Auth email/password flows, transactional onboarding and invitations, server-derived organization selection, route guards, session revocation, a persistent work-management loop with evidence/history, durable Teams and contextual Messages, a leased outbox worker with explicit Attention, collaboration, and reviewed audit-only handlers, typed client, permission policy, transactional audit/outbox records, sample browser exports, and safe integration mocks
- experimental Expo mobile and Tauri desktop companion shells, both outside the intended GA scope

## Prerequisites

- Node.js 22.23.2+
- pnpm 11.22.0 (`corepack enable` is sufficient)
- PostgreSQL 17, or Docker/Podman Compose for the included local service
- Rust stable only when packaging the Tauri desktop shell
- Xcode/Android Studio only when running native Expo builds

## Local setup

### Fictional technical preview

```bash
cp .env.example .env
pnpm install
pnpm contracts:generate
```

Keep the example's explicit `DEMO_MODE=true`, then start only the fictional demo API and Web processes in separate terminals:

```bash
pnpm dev:api
```

```bash
pnpm dev:web
```

Open Web at `http://localhost:3000`, API health at `http://localhost:8787/api/v1/health`, and API documentation at `http://localhost:8787/openapi.json`. This path uses the labeled `TREVV Demo` fictional data and needs neither PostgreSQL nor the live-only worker. Do not use the root `pnpm dev` command in demo mode: it also launches the worker, which correctly refuses to start unless `DEMO_MODE=false`.

### Live local topology

For the persistent implementation, first set `DEMO_MODE=false` and provide the complete PostgreSQL, Better Auth, canonical Web/API origin, and SMTP or private test-mail configuration. Then migrate a dedicated local database and start API, Web, and one uniquely identified worker in separate terminals:

```bash
docker compose up --build -d postgres
pnpm db:migrate
pnpm dev:api
```

```bash
pnpm dev:web
```

```bash
WORKER_ID=trevv-local-worker-1 pnpm --filter @founderhq/worker dev
```

Do not seed a pilot or alpha database. `pnpm db:seed` is restricted to a disposable fictional-demo database. Live mode enables real accounts, onboarding, invitations, sessions, server-derived tenant access, a persistent work-management loop, and durable collaboration: Teams, synchronized Team rooms, Workspace/private/direct/external conversations, messages, replies, reactions, response state, read checkpoints, retention, and server-scoped invalidation. Feature presets shape the Team experience but never grant data access. Other product surfaces remain preview-only. No customer-facing or qualifying production-shaped API/worker/database/mail topology is deployed; a disposable fictional-data `$0` Render rehearsal may exercise the path end to end without closing production gates. See [the Render preview limits](deploy/render/README.md).

For a focused process, use `pnpm dev:web` or `pnpm dev:api`. Expo runs with `pnpm --filter @founderhq/mobile dev`; the Tauri shell runs with `pnpm --filter @founderhq/desktop tauri dev`.

## Environment

Copy `.env.example`. The variables describe implemented runtime boundaries; configuring them does not promote a preview capability to production. The Web requires its public HTTPS `NEXT_PUBLIC_APP_URL` plus a server-only `API_ORIGIN` pointing at the private API load balancer; it does not own Better Auth configuration. `CSP_MODE` and `HSTS_ENABLED` are Web **build-time** settings because Next.js compiles these headers into the artifact. Local and self-signed builds keep CSP report-only and HSTS off. Promotion to CSP enforcement or HSTS requires a reviewed trusted-HTTPS build and a new artifact.

The API separately requires `DATABASE_URL` (production must use exactly one `sslmode=verify-full` so the certificate and hostname are verified), a 32+ character `BETTER_AUTH_SECRET`, public HTTPS `BETTER_AUTH_URL`/`WEB_ORIGIN`, and a production SMTP transport. Production also requires `RATE_LIMIT_BACKEND=postgres`, a non-placeholder 32+ character `RATE_LIMIT_HASH_SECRET` shared by all API replicas, and `TRUSTED_CLIENT_IP_HEADER` naming a header that the trusted edge strips and overwrites. Development/test may use the process-local memory limiter. `ERROR_REPORTING_MODE=external` is fail-closed and requires a code-installed reporter adapter; no such provider, source-map uploader, log collector, dashboard service, or alert destination is provisioned, so current runnable environments keep it `disabled`.

Worker readiness is controlled independently by the staleness, oldest-ready-work, unsupported-event, and dead-letter thresholds catalogued in `.env.example`. The private health and metrics endpoints are not an operator console: dead-letter inspection/redrive, external scraping, alert routing, and on-call response still need provisioning and drills. Client URLs remain public values. Provider OAuth, private object storage, live import, AI, billing, and analytics variables are intentionally absent because those capabilities are disabled. A future deployment must also satisfy the release constraints in [the implementation report](docs/implementation-report.md), [deployment guide](docs/deployment.md), and [known limitations](docs/known-limitations.md).

Never commit `.env` files. Public Web, Expo, and Vite variables are intentionally non-secret.

## Quality gates

```bash
pnpm lint
pnpm typecheck
pnpm test
TEST_DATABASE_URL=postgresql://founderhq:founderhq@127.0.0.1:5432/postgres pnpm test:integration
pnpm build
pnpm test:e2e
pnpm test:a11y
NODE_ENV=test DATABASE_URL=postgresql://founderhq:founderhq@127.0.0.1:5432/founderhq_live_e2e pnpm db:migrate
LIVE_E2E_DATABASE_URL=postgresql://founderhq:founderhq@127.0.0.1:5432/founderhq_live_e2e pnpm test:e2e:live
pnpm security:audit
```

The CI workflow additionally migrates and seeds a clean PostgreSQL database, regenerates `openapi.json` and fails on drift, builds every application, scans dependencies, runs fictional-demo Chromium critical-path/accessibility tests, and exercises real sign-up, verification, onboarding, two-browser persistence, non-leaking Workspace authorization, invitations, membership removal, session revocation, password recovery, the persistent work-management loop, pre-acknowledgement timeouts, lost-response recovery, and live-surface AA checks in `DEMO_MODE=false` against PostgreSQL and a private test mail sink. PostgreSQL integration coverage also exercises WorkItem history/evidence, deterministic Attention, collaboration authorization and durability, API process restart, expiring idempotency, worker event ownership, lease recovery, sweep-level recovery, retry/dead-letter behavior, message-retention redaction, shared rate-limit state, and atomic outbox processing. The worker's exhaustive catalog currently assigns all emitted event types to exactly one explicit Attention, collaboration, or reviewed audit-only handler; catalog tests fail when a producer lacks a reviewed entry. Unknown types remain pending and make worker readiness fail after the configured unsupported-event grace period instead of being silently acknowledged.

A separate production-shaped topology gate builds standalone production-compiled Web, two load-balanced API instances, PostgreSQL 17, two workers, the private mail sink, and a locally trusted TLS edge. Its API and Worker processes deliberately run with `NODE_ENV=test` to permit the local database transport and file mail sink. The smoke is useful integration evidence, but it is not a production-mode runtime proof or a remote staging deployment. No external telemetry collector, error tracker/source-map upload, imported dashboard, routed alert, managed backup restore, or production deploy job is exercised. Until those controls and the privacy/legal and pilot-evidence gates pass, TREVV is **no-go for public beta and Phase 6**.

## Repository map

```text
apps/web       interactive experimental Next.js Web/PWA demonstration
apps/api       Hono API with explicit fictional-demo and PostgreSQL adapters
apps/worker    PostgreSQL outbox with Attention, collaboration, reviewed audit-only, and retention handling
apps/mobile    Expo companion shell
apps/desktop   Tauri + React desktop shell
packages/      contracts, clients, domain, DB, auth, permissions, UI, tokens
docs/          product, architecture, security, operations, release evidence
tests/e2e      Playwright critical paths and axe scans
```

Start with [architecture](docs/architecture.md), [Phase 4 collaboration/runtime boundaries](docs/phase-4-collaboration-runtime.md), [implementation report](docs/implementation-report.md), [performance evidence](docs/performance.md), [deployment](docs/deployment.md), [security](docs/security.md), and [known limitations](docs/known-limitations.md). The generated contract is [openapi.json](openapi.json).
