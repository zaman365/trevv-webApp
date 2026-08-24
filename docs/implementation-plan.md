# Implementation plan

1. Platform: pnpm/Turborepo structure, configuration, design tokens, contracts, domain types, database schema, permission policies, Hono API, worker, migrations, deterministic demo seed, and CI.
2. Product slice: polished Portfolio, Hub, Board, and item-detail surfaces with realistic shared seed records.
3. Core Web/PWA: authentication/onboarding foundation, full navigation, My Work, Inbox/Quick Capture, Decisions, Approvals, search, updates, resources, templates, settings, responsive behavior, import/export, EN/DE, and installability.
4. Native foundations: Expo and Tauri shells that use the same contracts/client and support hosted session restoration, Portfolio, Hubs, and deep-link/notification abstractions.
5. Hardening: unit/permission/component/E2E coverage, accessibility checks, performance/security/runbook documentation, builds, previews, screenshots, limitations, and release report.

Visual quality is reviewed after the coherent product slice and before deeper backend work. Release 1.1 capabilities remain out of scope until the V1 acceptance path is green.

