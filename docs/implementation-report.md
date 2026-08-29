# TREVV implementation report

## Current release status

TREVV is a **technical preview with fictional sample data**, implemented as a pnpm/Turborepo TypeScript monorepo. The hosted Next.js Web/PWA is a broad interactive demonstration. It reads deterministic seed data and keeps mutations in React state or browser storage. The hosted experience is not authenticated, durable, shared, tenant-enforced, or suitable for real customer data.

The repository also contains a versioned Hono API with explicit demo/live adapters, real Better Auth email/password flows, tenant-scoped PostgreSQL/Drizzle identity and product repositories, transactional onboarding and invitations, a same-origin Web API boundary, server-side `/app/**` guards, a typed cross-platform client, a centralized permission policy, and a durable PostgreSQL worker. In local/CI `DEMO_MODE=false`, the founder golden loop is server-backed from Workspace selection and capture through assignment/update/blocking, deterministic Attention, Waiting/decision/approval resolution, evidence/history, and weekly review snapshots. Expo and Tauri remain companion foundations. None of this is an end-to-end deployed production system.

The deterministic fictional demo exercises multi-Portfolio roll-ups, explainable Attention actions, Waiting follow-up drafts, Change Radar filtering, review previews, Decision outcomes, Insights, opportunity provenance, Blueprint diffs, stakeholder exposure, sample import dry runs, cross-Workspace pressure, Workspace navigation, boards, My Work, Inbox, decisions, approvals, search, and integration previews. In undeployed live mode, identity, onboarding, invitations, tenant selection, route protection, session controls, and the founder golden loop are authoritative and durable. Teams, Messages, broader product-screen adoption, provider synchronization/delivery, durable import, production export, advanced security controls, and billing are not live.

## Capability status matrix

The source-of-truth vocabulary is:

- **Live:** authoritative server behavior is deployed, authorized, durable, recoverable, and covered by production-mode tests.
- **Preview:** intended behavior can be explored, but no production side effect or guarantee exists.
- **Demo only:** an interactive fictional/browser-local experience; it must not be used for real data.
- **Unavailable:** the control is disabled or omitted because its safe implementation does not exist.

| Capability                                              | Status      | Current boundary                                                       |
| ------------------------------------------------------- | ----------- | ---------------------------------------------------------------------- |
| Portfolio, Workspace, boards, Inbox, decisions, reviews | Demo only   | Hosted state is local; live founder loop exists locally/in CI only     |
| Sign-in, sign-up, onboarding provisioning               | Unavailable | Hosted demo accepts none; real live-mode flow exists but is undeployed |
| Teams and inherited features                            | Demo only   | Browser-local; grants no access; no live API                           |
| Organization invitations                                | Unavailable | Hosted demo sends none; live-mode delivery/access is undeployed        |
| Messages and stakeholder review                         | Demo only   | Browser-local; delivers and shares nothing; no live API                |
| Waiting follow-ups                                      | Preview     | Durable locally/in CI; no hosted or provider delivery                  |
| Workspace updates and reviews                           | Demo only   | Hosted state is local; durable live-mode snapshots are undeployed      |
| Email                                                   | Demo only   | Fictional mailbox and labels; no provider connection or delivery       |
| Smart links and provider setup                          | Preview     | Metadata/configuration walkthrough; no OAuth, sync, webhook, or write  |
| Import                                                  | Preview     | Fictional mapping/dry-run; creates no record                           |
| Export and audit activity                               | Demo only   | Local sample download; not a complete server export/audit trail        |
| Sessions and revocation                                 | Unavailable | Hosted demo has none; real live-mode controls are undeployed           |
| MFA, passkeys, two-step verification, login alerts      | Unavailable | Omitted until fully implemented                                        |
| Automations and background delivery                     | Preview     | Durable internal worker locally/in CI; no deployed/provider effect     |
| Secure uploads and private offline data                 | Unavailable | No storage/scanning/signed delivery or private-data cache              |
| Billing and subscriptions                               | Unavailable | No payment accepted and no production entitlement enforcement          |

No product capability in this matrix is currently promoted to **Live**. `apps/web/lib/product-capabilities.ts` is the matching UI registry and must change in the same pull request as this table.

## Notable decisions

- Portfolio and Workspace aggregates are calculated in the domain package and exposed once through the shared API contract so every client receives identical semantics.
- Expo and Tauri use `@founderhq/api-client`. The hosted Web demonstration uses deterministic seed/browser-local state; the local/CI live founder loop uses the authoritative API/client path, while broader surfaces still await migration.
- Permissions are centralized in a tested policy instead of duplicated in UI code.
- Demo API writes use isolated per-app fictional adapters. Live API writes use PostgreSQL transactions with durable idempotency, optimistic versions/ETags, audit records, and outbox records; no live repository error falls back to demo data.
- Better Auth owns credentials and sessions. TREVV maps each verified identity once, stores active organization selection server-side, and reloads current membership and managed scopes from PostgreSQL on every authorized request. Clients cannot supply roles or tenant context.
- Onboarding creates the application user, owner membership, default Portfolio, first Workspace, starter Board/Blueprint, audit, and outbox records in one idempotent transaction. Invitations store only a token digest and accept once in a tenant-scoped transaction.
- Inbox conversion preserves the captured identifier as the canonical WorkItem ID. WorkItem transitions, comments, dependencies, Waiting actions, decision/approval rationale, and evidence append immutable, versioned history in the same transaction as audit/outbox state.
- The worker leases only its owned Attention-trigger event types with bounded `SKIP LOCKED` batches, leaving unsupported events pending for their handler. It persists every attempt, rejects stale acknowledgements, recovers expired leases, retries with backoff, dead-letters terminal failures, and continues after sweep-level infrastructure errors. Deterministic, timezone-aware Attention uses stable reason/evidence fingerprints and creates only deduplicated internal notifications. A durable least-recently-computed cursor keeps scheduled sweeps fair; provider effects are deliberately excluded.
- Live Web invalidation currently uses bounded polling and authoritative refetch rather than realtime push.
- Google Drive is isolated behind a provider interface and remains an explicit mock until credentials are supplied.
- The Web/PWA demonstration is intentionally broad while Expo and Tauri are companion foundations.
- The production Web build explicitly uses Next.js's Webpack compiler to avoid Turbopack's local CSS-worker port binding in restricted CI/sandbox environments.

## Validation completed

- ESLint across 18 workspaces
- TypeScript type-check across 18 workspaces
- unit and package tests across domain, permissions, database, integrations, API, Web, and worker packages
- production build across all 18 workspaces
- 62 Playwright critical-path and visual-regression checks across desktop and mobile viewports
- 28 axe accessibility checks with no serious or critical findings across onboarding, Portfolio, Attention, Waiting, Workspace, Board, stakeholder view, Decisions, Blueprints, and the item panel
- API contract coverage for health, Portfolio, Attention, Waiting, commercial memory, and the 49-path/59-operation OpenAPI document
- PostgreSQL 17 clean and populated-upgrade migrations plus full API-process restart, two-tenant, Board/Workspace integrity, optimistic concurrency, expiring and concurrently reclaimed idempotency, rollback, and audit/outbox atomicity integration coverage
- founder-loop integration coverage for canonical capture identity, WorkItem evidence/history, atomic transitions, Waiting resolution, deterministic timezone-aware Attention, weekly snapshots, cross-tenant isolation, worker event ownership, lease recovery, sweep-level recovery, retries/dead letters, stale-ack rollback, and fair bounded sweeps
- production-mode browser coverage for sign-up, one-time verification, wrong credentials, onboarding recovery/completion, two-browser tenant persistence, non-leaking Workspace 404s, invitation acceptance, membership removal, session revocation, password recovery/reset, pre-acknowledgement timeout/retry, post-commit response-loss replay, recoverable transition/review drafts, and live-surface AA scans against PostgreSQL and a private mail sink
- dependency audit with no reported advisory

## Release constraints

The hosted deployment currently represents the fictional-data Web demonstration, not the target Web/API/worker/PostgreSQL topology. Repository, live-API, live-browser, golden-loop, and worker gates prove the identity/tenant/data/processing boundaries locally and in CI; they do not prove a deployed API/mail/database/worker topology, full product-screen adoption, backup recovery, rate limiting, or deployed operations. Production worker supervision, monitoring, alerts, dead-letter handling, and shutdown drills remain release blockers. Mobile and desktop are source/build foundations. Teams, Messages, real provider synchronization, production product email, push fan-out, imports, advanced security controls, billing, and observability require implementation as well as credentials. See [known limitations](known-limitations.md) and the [1.1 backlog](release-1.1-backlog.md).
