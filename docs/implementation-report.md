# FounderHQ implementation report

## Delivered

FounderHQ V1 is implemented as a pnpm/Turborepo TypeScript monorepo. The Next.js Web/PWA is the complete product surface, supported by a versioned Hono API, Better Auth, PostgreSQL/Drizzle persistence, a typed cross-platform client, a permission policy, an outbox worker, an Expo mobile companion, and a Tauri desktop shell.

The deterministic demo includes nine Hubs and exercises portfolio roll-ups, Hub navigation, table and Kanban boards, drag-and-drop foundations, bulk selection, item detail editing, My Work, Inbox, decisions, approvals, search, templates, integrations, authentication, and onboarding. English/German foundations, light/dark themes, responsive layouts, offline-first demo fallback, PWA metadata, and a generated social preview are included.

## Notable decisions

- Portfolio and Hub aggregates are calculated in the domain package and exposed once through the shared API contract so every client receives identical semantics.
- Web, Expo, and Tauri consume `@founderhq/api-client`; the Web falls back to deterministic seed data when demo mode is enabled and the API is unavailable.
- Permissions are centralized in a tested policy instead of duplicated in UI code.
- Write routes include idempotency and optimistic-version conflict behavior; side effects are represented through the events/outbox foundation.
- Google Drive is isolated behind a provider interface and remains an explicit mock until credentials are supplied.
- The V1 Web/PWA is intentionally complete while Expo and Tauri are companion shells, matching the prioritization in the build brief.
- The production Web build explicitly uses Next.js's Webpack compiler to avoid Turbopack's local CSS-worker port binding in restricted CI/sandbox environments.

## Validation completed

- ESLint across 18 workspaces
- TypeScript type-check across 18 workspaces
- unit and package tests across domain, permissions, database, integrations, API, Web, and worker packages
- production build across all 18 workspaces
- 8 Playwright critical-path checks across desktop and mobile viewports
- 12 axe accessibility checks with no serious or critical findings across sign-in, Portfolio, Hub, Board, Decisions, and the item panel
- live API smoke checks for health, portfolio, and the 11-path OpenAPI document
- dependency audit with no unhandled high or critical advisory

## Release constraints

The local environment did not provide PostgreSQL or a container runtime, so the clean migration-and-seed gate is encoded in CI with a PostgreSQL 17 service rather than executed locally. The mobile and desktop projects are source/build foundations; signed store packages require platform credentials. Real Google Drive synchronization, production email delivery, push fan-out, and observability backends require deployment credentials. See [known limitations](known-limitations.md) and the [1.1 backlog](release-1.1-backlog.md).
