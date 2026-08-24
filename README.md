# TREVV

TREVV is a commercial, portfolio-first operating system for people responsible for several businesses, brands, clients, products, departments, ventures, or initiatives. It brings execution, decisions, waiting dependencies, evidence, and management memory together—and shows where attention matters.

## What ships

- Organization → Portfolio → Hub tenancy with automatic default-Portfolio migration
- deterministic Attention Engine, Waiting Center, personalized Home, and Change Radar
- review rituals, lightweight historical snapshots, and Decision consequence reviews
- Insights and opportunity discovery with promotion provenance
- managed Blueprints with safe diffs, selected application, local overrides, and detach
- stakeholder-safe Hub views, import presets/dry runs, cross-Hub dependencies, and workload evidence
- pricing-agnostic subscription and entitlement architecture with unrestricted development mode
- polished Hub Overview, board table/Kanban, inline editing, and item side panel
- My Work, actionable Inbox, informational Notifications, Decision Center, Approval Center, search, integrations, commercial onboarding, sign-in, and sign-up
- English/German UI foundations, responsive mobile-browser layouts, dark mode, and installable PWA behavior
- versioned Hono API, Better Auth, PostgreSQL/Drizzle schema, background worker, typed client, permission policy, events/outbox, CSV/JSON export, and safe integration mocks
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
pnpm dev
```

Open Web at `http://localhost:3000`, API health at `http://localhost:8787/api/v1/health`, and API documentation at `http://localhost:8787/openapi.json`. Demo mode is on unless `DEMO_MODE=false`; it uses fictional public data in the `TREVV Demo` organization and an unrestricted development entitlement set.

For a focused process, use `pnpm dev:web` or `pnpm dev:api`. Expo runs with `pnpm --filter @founderhq/mobile dev`; the Tauri shell runs with `pnpm --filter @founderhq/desktop tauri dev`.

## Environment

Copy `.env.example`. At minimum, production requires `DATABASE_URL`, a 32+ character `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `WEB_ORIGIN`, and the three public API base URLs. Use a random 32-byte encryption key for stored OAuth credentials. Google Drive is optional; when unset, the integrations screen clearly uses demo mode.

Never commit `.env` files. Public Web, Expo, and Vite variables are intentionally non-secret.

## Quality gates

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm test:a11y
pnpm security:audit
```

The CI workflow additionally migrates and seeds a clean PostgreSQL database, regenerates `openapi.json` and fails on drift, builds every application, scans dependencies, and runs Chromium critical-path/accessibility tests.

## Repository map

```text
apps/web       complete Next.js Web/PWA
apps/api       Hono HTTP API and Better Auth endpoint
apps/worker    outbox/reminder worker foundation
apps/mobile    Expo companion shell
apps/desktop   Tauri + React desktop shell
packages/      contracts, clients, domain, DB, auth, permissions, UI, tokens
docs/          product, architecture, security, operations, release evidence
tests/e2e      Playwright critical paths and axe scans
```

Start with [architecture](docs/architecture.md), [implementation report](docs/implementation-report.md), [performance evidence](docs/performance.md), [deployment](docs/deployment.md), [security](docs/security.md), and [known limitations](docs/known-limitations.md). The generated contract is [openapi.json](openapi.json).
