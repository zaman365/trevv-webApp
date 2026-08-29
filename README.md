# TREVV

TREVV is a commercial, portfolio-first operating system for people responsible for several businesses, brands, clients, products, departments, ventures, or initiatives. It brings execution, decisions, waiting dependencies, evidence, and management memory together—and shows where attention matters.

> **Current release status: technical preview.** The hosted Web experience still uses fictional sample data, and its changes stay in the current browser. In undeployed `DEMO_MODE=false`, identity, the founder operating loop, Teams, Team rooms, and Messages now use tenant-scoped PostgreSQL with a durable outbox worker and permission-scoped Web invalidation. A production-shaped topology is defined for local/CI validation; it has not been deployed as a customer service. Do not enter real credentials, confidential information, or customer data in the hosted preview. See [known limitations](docs/known-limitations.md).

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
- English/German UI foundations, responsive mobile-browser layouts, dark mode, and installable PWA behavior
- versioned Hono API contract, explicit demo/live data planes, tenant-scoped PostgreSQL repositories, real Better Auth email/password flows, transactional onboarding and invitations, server-derived organization selection, route guards, session revocation, a persistent founder loop with evidence/history, durable Teams and contextual Messages, a leased outbox worker with explicit Attention, collaboration, and reviewed audit-only handlers, typed client, permission policy, transactional audit/outbox records, sample browser exports, and safe integration mocks
- Expo mobile companion shell and Tauri desktop shell consuming the same hosted API contract

## Prerequisites

- Node.js 22+
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
docker compose up -d postgres
pnpm db:migrate
pnpm dev:api
```

```bash
pnpm dev:web
```

```bash
WORKER_ID=trevv-local-worker-1 pnpm --filter @founderhq/worker dev
```

Do not seed a pilot or alpha database. `pnpm db:seed` is restricted to a disposable fictional-demo database. Live mode enables real accounts, onboarding, invitations, sessions, server-derived tenant access, the persistent founder golden loop, and durable collaboration: Teams, synchronized Team rooms, Workspace/private/direct/external conversations, messages, replies, reactions, response state, read checkpoints, retention, and server-scoped invalidation. Feature presets shape the Team experience but never grant data access. Other product surfaces remain preview-only, and the API/worker/database/mail topology is not deployed end to end.

For a focused process, use `pnpm dev:web` or `pnpm dev:api`. Expo runs with `pnpm --filter @founderhq/mobile dev`; the Tauri shell runs with `pnpm --filter @founderhq/desktop tauri dev`.

## Environment

Copy `.env.example`. The variables describe the target runtime; configuring them does not promote a preview capability to production. The Web requires its public HTTPS `NEXT_PUBLIC_APP_URL` plus a server-only `API_ORIGIN` pointing at the private API load balancer; it does not own Better Auth configuration. The API separately requires `DATABASE_URL` (production must use exactly one `sslmode=verify-full` so the certificate and hostname are verified), a 32+ character `BETTER_AUTH_SECRET`, public HTTPS `BETTER_AUTH_URL`/`WEB_ORIGIN`, and a production SMTP transport. Client URLs remain public values. A future deployment must also satisfy the release constraints in [the implementation report](docs/implementation-report.md) and [known limitations](docs/known-limitations.md). Google Drive and other providers remain previews with no production OAuth token or synchronization.

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

The CI workflow additionally migrates and seeds a clean PostgreSQL database, regenerates `openapi.json` and fails on drift, builds every application, scans dependencies, runs fictional-demo Chromium critical-path/accessibility tests, and exercises real sign-up, verification, onboarding, two-browser persistence, non-leaking Workspace authorization, invitations, membership removal, session revocation, password recovery, the persistent founder golden loop, pre-acknowledgement timeouts, lost-response recovery, and live-surface AA checks in `DEMO_MODE=false` against PostgreSQL and a private test mail sink. PostgreSQL integration coverage also exercises WorkItem history/evidence, deterministic Attention, collaboration authorization and durability, API process restart, expiring idempotency, worker event ownership, lease recovery, sweep-level recovery, retry/dead-letter behavior, message-retention redaction, and atomic outbox processing. The worker's exhaustive catalog currently assigns all emitted event types to exactly one explicit Attention, collaboration, or reviewed audit-only handler; catalog tests fail when a producer lacks a reviewed entry. Unknown types remain pending and make worker readiness fail after the configured unsupported-event grace period instead of being silently acknowledged. A separate production-shaped topology gate builds standalone Web, two load-balanced API instances, PostgreSQL 17, two workers, the private mail sink, and a locally trusted TLS edge. Its smoke verifies public/private readiness, TLS identity, secure auth cookies, cross-origin rejection, query-free proxy logging, traffic to both APIs, real message-retention redaction, expired-worker-lease recovery, and a populated previous-release upgrade through the real Drizzle journal with a second no-op pass. It is local/CI validation, not a remote staging deployment, and CI intentionally contains no production deploy job.

## Repository map

```text
apps/web       complete interactive Next.js Web/PWA demonstration
apps/api       Hono API with explicit fictional-demo and PostgreSQL adapters
apps/worker    PostgreSQL outbox with Attention, collaboration, reviewed audit-only, and retention handling
apps/mobile    Expo companion shell
apps/desktop   Tauri + React desktop shell
packages/      contracts, clients, domain, DB, auth, permissions, UI, tokens
docs/          product, architecture, security, operations, release evidence
tests/e2e      Playwright critical paths and axe scans
```

Start with [architecture](docs/architecture.md), [Phase 4 collaboration/runtime boundaries](docs/phase-4-collaboration-runtime.md), [implementation report](docs/implementation-report.md), [performance evidence](docs/performance.md), [deployment](docs/deployment.md), [security](docs/security.md), and [known limitations](docs/known-limitations.md). The generated contract is [openapi.json](openapi.json).
