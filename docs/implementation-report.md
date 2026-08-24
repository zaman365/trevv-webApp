# TREVV implementation report

## Delivered

TREVV is implemented as a pnpm/Turborepo TypeScript monorepo. The Next.js Web/PWA is the complete product surface, supported by a versioned Hono API, Better Auth, PostgreSQL/Drizzle persistence, a typed cross-platform client, a permission policy, an outbox/attention/review worker, an Expo mobile companion, and a Tauri desktop shell.

The deterministic fictional demo exercises multi-Portfolio roll-ups, explainable Attention actions, Waiting follow-ups, Change Radar filtering, review snapshots, Decision outcomes, Insights, opportunity provenance, Blueprint diffs, stakeholder exposure, import dry runs, cross-Hub pressure, Hub navigation, boards, My Work, Inbox, decisions, approvals, search, integrations, authentication, and commercial onboarding.

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
- 22 Playwright critical-path checks across desktop and mobile viewports
- 24 axe accessibility checks with no serious or critical findings across onboarding, Home, Portfolio, Attention, Waiting, Hub, Board, stakeholder view, Decisions, Blueprints, and the item panel
- API contract coverage for health, Portfolio, Attention, Waiting, commercial memory, and the 23-path OpenAPI document
- dependency audit with no reported advisory

## Release constraints

The local environment did not provide PostgreSQL or a container runtime, so the clean migration-and-seed gate is encoded in CI with a PostgreSQL 17 service rather than executed locally. The mobile and desktop projects are source/build foundations; signed store packages require platform credentials. Real Google Drive synchronization, production email delivery, push fan-out, and observability backends require deployment credentials. See [known limitations](known-limitations.md) and the [1.1 backlog](release-1.1-backlog.md).
