# TREVV

TREVV is a commercial, portfolio-first operating system for people responsible for several businesses, brands, clients, products, departments, ventures, or initiatives. It brings execution, decisions, waiting dependencies, evidence, and management memory together—and shows where attention matters.

> **Current release status: technical preview.** The hosted Web experience still uses fictional sample data, and its changes stay in the current browser. A production-mode identity and tenant boundary plus the founder golden loop now run against PostgreSQL in local/CI validation, with a durable internal worker for outbox processing and Attention recomputation. That live topology has not been deployed as a customer service. Do not enter real credentials, confidential information, or customer data in the hosted preview. See [known limitations](docs/known-limitations.md).

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
- versioned Hono API contract, explicit demo/live data planes, tenant-scoped PostgreSQL repositories, real Better Auth email/password flows, transactional onboarding and invitations, server-derived organization selection, route guards, session revocation, a persistent founder loop with evidence/history, a leased outbox/Attention worker, typed client, permission policy, transactional audit/outbox records, sample browser exports, and safe integration mocks
- Expo mobile companion shell and Tauri desktop shell consuming the same hosted API contract

## Prerequisites

- Node.js 22+
- pnpm 11.22.0 (`corepack enable` is sufficient)
- PostgreSQL 17, or Docker/Podman Compose for the included local service
- Rust stable only when packaging the Tauri desktop shell
- Xcode/Android Studio only when running native Expo builds

## Local setup

```bash
cp .env.example .env
pnpm install
docker compose up -d postgres
pnpm db:migrate
pnpm db:seed
pnpm contracts:generate
WORKER_ID=trevv-local-worker pnpm dev
```

Open Web at `http://localhost:3000`, API health at `http://localhost:8787/api/v1/health`, and API documentation at `http://localhost:8787/openapi.json`. `DEMO_MODE` must be set explicitly. The example environment uses `DEMO_MODE=true`, fictional data in the `TREVV Demo` organization, and an unrestricted development entitlement set. `DEMO_MODE=false` requires PostgreSQL, Better Auth, canonical Web/API origins, and SMTP (or the private test mail sink). It enables real accounts, onboarding, invitations, sessions, server-derived tenant access, and the server-backed founder golden loop from Workspace selection and capture through assignment, Attention, Waiting/decision/approval resolution, evidence, and weekly review history. Other product surfaces remain preview-only, and the API/worker/database/mail topology is not deployed end to end.

For a focused process, use `pnpm dev:web` or `pnpm dev:api`. Expo runs with `pnpm --filter @founderhq/mobile dev`; the Tauri shell runs with `pnpm --filter @founderhq/desktop tauri dev`.

## Environment

Copy `.env.example`. The variables describe the target runtime; configuring them does not promote a preview capability to production. A future production deployment requires `DATABASE_URL`, a 32+ character `BETTER_AUTH_SECRET`, HTTPS `BETTER_AUTH_URL`/`WEB_ORIGIN`, `API_ORIGIN`, a production SMTP transport, and the public client URLs, plus the release constraints in [the implementation report](docs/implementation-report.md) and [known limitations](docs/known-limitations.md). Google Drive and other providers remain previews with no production OAuth token or synchronization.

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
DATABASE_URL=postgresql://founderhq:founderhq@127.0.0.1:5432/founderhq_live_e2e pnpm db:migrate
LIVE_E2E_DATABASE_URL=postgresql://founderhq:founderhq@127.0.0.1:5432/founderhq_live_e2e pnpm test:e2e:live
pnpm security:audit
```

The CI workflow additionally migrates and seeds a clean PostgreSQL database, regenerates `openapi.json` and fails on drift, builds every application, scans dependencies, runs fictional-demo Chromium critical-path/accessibility tests, and exercises real sign-up, verification, onboarding, two-browser persistence, non-leaking Workspace authorization, invitations, membership removal, session revocation, password recovery, the persistent founder golden loop, pre-acknowledgement timeouts, lost-response recovery, and live-surface AA checks in `DEMO_MODE=false` against PostgreSQL and a private test mail sink. PostgreSQL integration coverage also exercises WorkItem history/evidence, deterministic Attention, API process restart, expiring idempotency, worker event ownership, lease recovery, sweep-level recovery, retry/dead-letter behavior, and atomic outbox processing.

## Repository map

```text
apps/web       complete interactive Next.js Web/PWA demonstration
apps/api       Hono API with explicit fictional-demo and PostgreSQL adapters
apps/worker    PostgreSQL outbox, Attention recomputation, and internal-notification worker
apps/mobile    Expo companion shell
apps/desktop   Tauri + React desktop shell
packages/      contracts, clients, domain, DB, auth, permissions, UI, tokens
docs/          product, architecture, security, operations, release evidence
tests/e2e      Playwright critical paths and axe scans
```

Start with [architecture](docs/architecture.md), [implementation report](docs/implementation-report.md), [performance evidence](docs/performance.md), [deployment](docs/deployment.md), [security](docs/security.md), and [known limitations](docs/known-limitations.md). The generated contract is [openapi.json](openapi.json).
