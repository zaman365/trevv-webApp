# TREVV implementation report

## Current release status

TREVV is a **technical preview with fictional sample data**, implemented as a pnpm/Turborepo TypeScript monorepo. The hosted Next.js Web/PWA is a broad interactive demonstration. It reads deterministic seed data and keeps mutations in React state or browser storage. The hosted experience is not authenticated, durable, shared, tenant-enforced, or suitable for real customer data.

The repository also contains a versioned Hono API with explicit demo/live adapters, real Better Auth email/password flows, tenant-scoped PostgreSQL/Drizzle identity and product repositories, transactional onboarding and invitations, a same-origin Web API boundary, server-side `/app/**` guards, a typed cross-platform client, a centralized permission policy, and a durable PostgreSQL worker. In local/CI `DEMO_MODE=false`, the founder golden loop is server-backed from Workspace selection and capture through assignment/update/blocking, deterministic Attention, Waiting/decision/approval resolution, evidence/history, and weekly review snapshots. Teams and contextual Messages use the same live boundary, with synchronized Team rooms, participant-scoped conversations, durable messages/replies/reactions/read checkpoints/retention, and permission-filtered SSE plus polling invalidation. Phase 5 adds durable reviewed privacy-request/retention foundations, structured redacted API/worker telemetry, correlated request IDs, shared HMAC-keyed PostgreSQL rate limiting, Web/API security headers, report-only/enforcing CSP support, and repository dashboard/alert assets. Expo and Tauri remain companion foundations. None of this is an end-to-end deployed production system.

The deterministic fictional demo exercises multi-Portfolio roll-ups, explainable Attention actions, Waiting follow-up drafts, Change Radar filtering, review previews, Decision outcomes, Insights, opportunity provenance, Blueprint diffs, stakeholder exposure, sample import dry runs, cross-Workspace pressure, Workspace navigation, boards, My Work, Inbox, decisions, approvals, Teams, Messages, search, and integration previews. The explicit closed-alpha decision is to include Teams and Messages with real persistence and permission enforcement, not remove them from alpha navigation. The in-scope implementation and final local integrated release gates pass in the undeployed live-mode code path; this is not a claim that the hosted preview or a remote staging service is live.

## Capability status matrix

The source-of-truth vocabulary is:

- **Live:** authoritative server behavior is deployed, authorized, durable, recoverable, and covered by production-mode tests.
- **Preview:** intended behavior can be explored, but no production side effect or guarantee exists.
- **Demo only:** an interactive fictional/browser-local experience; it must not be used for real data.
- **Unavailable:** the control is disabled or omitted because its safe implementation does not exist.

| Capability                                              | Status      | Current boundary                                                             |
| ------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------- |
| Portfolio, Workspace, boards, Inbox, decisions, reviews | Demo only   | Hosted state is local; live founder loop exists locally/in CI only           |
| Sign-in, sign-up, onboarding provisioning               | Unavailable | Hosted demo accepts none; real live-mode flow exists but is undeployed       |
| Teams and inherited features                            | Demo only   | Hosted state is local; durable authorized live-mode API is undeployed        |
| Organization invitations                                | Unavailable | Hosted demo sends none; live-mode delivery/access is undeployed              |
| Messages                                                | Demo only   | Hosted state is local; durable scoped Messages are undeployed                |
| Stakeholder review                                      | Demo only   | Hosted browser-only preview; no live sharing or external delivery            |
| Waiting follow-ups                                      | Preview     | Durable locally/in CI; no hosted or provider delivery                        |
| Workspace updates and reviews                           | Demo only   | Hosted state is local; durable live-mode snapshots are undeployed            |
| Email                                                   | Demo only   | Fictional mailbox and labels; no provider connection or delivery             |
| Smart links and provider setup                          | Preview     | Metadata/configuration walkthrough; no OAuth, sync, webhook, or write        |
| Import                                                  | Preview     | Fictional mapping/dry-run; creates no record                                 |
| Export and audit activity                               | Demo only   | Local sample download; not a complete server export/audit trail              |
| Sessions and revocation                                 | Unavailable | Hosted demo has none; real live-mode controls are undeployed                 |
| Privacy requests and retention                          | Unavailable | Durable reviewed workflow exists locally; no effect processor/legal approval |
| Telemetry, limits, and security headers                 | Unavailable | Runtime foundations exist locally; no collector/pager/remote proof           |
| MFA, passkeys, two-step verification, login alerts      | Unavailable | Omitted until fully implemented                                              |
| Automations and background delivery                     | Preview     | Durable internal worker locally/in CI; no deployed/provider effect           |
| Secure uploads and private offline data                 | Unavailable | No storage/scanning/signed delivery or private-data cache                    |
| Billing and subscriptions                               | Unavailable | No payment accepted and no production entitlement enforcement                |

No product capability in this matrix is currently promoted to **Live**. `apps/web/lib/product-capabilities.ts` is the matching UI registry and must change in the same pull request as this table.

## Notable decisions

- Portfolio and Workspace aggregates are calculated in the domain package and exposed once through the shared API contract so every client receives identical semantics.
- Expo and Tauri use `@founderhq/api-client`. The hosted Web demonstration uses deterministic seed/browser-local state; the local/CI live founder loop uses the authoritative API/client path, while broader surfaces still await migration.
- Permissions are centralized in a tested policy instead of duplicated in UI code. Team feature presets are absent from authorization inputs: they shape product defaults but never grant data access.
- Demo API writes use isolated per-app fictional adapters. Live API writes use PostgreSQL transactions with durable idempotency, optimistic versions/ETags, audit records, and outbox records; no live repository error falls back to demo data.
- Better Auth owns credentials and sessions. TREVV maps each verified identity once, stores active organization selection server-side, and reloads current membership and managed scopes from PostgreSQL on every authorized request. Clients cannot supply roles or tenant context.
- Onboarding creates the application user, owner membership, default Portfolio, first Workspace, starter Board/Blueprint, audit, and outbox records in one idempotent transaction. Invitations store only a token digest and accept once in a tenant-scoped transaction.
- Inbox conversion preserves the captured identifier as the canonical WorkItem ID. WorkItem transitions, comments, dependencies, Waiting actions, decision/approval rationale, and evidence append immutable, versioned history in the same transaction as audit/outbox state.
- Team creation atomically creates one private Team room. Team membership changes update Team and room participation in the same transaction. Every collaboration mutation is tenant-scoped, idempotent where applicable, versioned where concurrently editable, and atomic with redacted audit/outbox/collaboration-event metadata; message bodies never enter those journals.
- Workspace rooms can be organization-visible; private, Team, direct, and external rooms require current participant scope. Owners and administrators do not bypass private conversation participation. Viewers remain read-only, guests remain explicitly scoped, and removed members fail closed.
- The worker registers explicit, non-overlapping Attention and collaboration handlers. It leases only active owned event types with bounded `SKIP LOCKED` batches, persists every attempt, rejects stale acknowledgements, recovers expired leases, retries with jittered exponential backoff, dead-letters terminal failures, and continues after sweep-level infrastructure errors. Collaboration owns scheduled message-retention redaction; deterministic, timezone-aware Attention creates only deduplicated internal notifications. Per-handler kill switches, graceful shutdown, queue-age/attempt telemetry, and content-free health/readiness endpoints are implemented; external alerts and dead-letter operations are not.
- Reviewed audit-only worker handling explicitly acknowledges events whose originating transaction is already the full durable effect, including privacy request/cancellation and retention-policy records. It does not process privacy effects or provider delivery.
- Live Web collaboration uses permission-filtered finite Server-Sent Event batches with numeric cursor reconnects plus bounded authoritative polling. Interrupted streaming cannot strand another browser on stale state, and the same-origin proxy propagates browser disconnects upstream.
- Privacy requests and retention overrides are durable, tenant-scoped, versioned, idempotent, and atomic with audit/outbox records. They stop at submission/review/cancellation. Account-level DSAR access after a user's final membership is removed, deletion-safe pseudonymized evidence, effect processing, legal approval, private export delivery, and provider reconciliation remain unresolved.
- API/worker logs and Prometheus metrics are structured, redacted, and bounded; request correlation crosses the Web/API boundary. Production configuration requires shared PostgreSQL rate limiting with HMAC client-key digests and fail-closed store behavior. CSP/security headers and sanitized report routes are implemented. Dashboard/rule files are not an active collector, pager, error tracker, or source-map pipeline.
- Provider access is isolated behind an unconfigured adapter. Credentials alone cannot enable Google Drive or another provider: provider-bound pilot approval, all runtime safety controls, and explicit organization enablement are also required.
- The Web/PWA demonstration is intentionally broad while Expo and Tauri are companion foundations.
- The production Web build explicitly uses Next.js's Webpack compiler to avoid Turbopack's local CSS-worker port binding in restricted CI/sandbox environments.

## Validation completed

The list below records the latest completed local Phase 5 verification. It does not satisfy any remote operations, privacy-effect, legal, backup, restore, provider-reconciliation, or billing gate.

- ESLint across 18 workspaces
- TypeScript type-check across 18 workspaces
- unit and package tests across domain, permissions, database, integrations, API, Web, and worker packages
- production build across all 18 workspaces
- 64 Playwright critical-path, capability-truth, and visual-regression checks across desktop and mobile viewports, including the draft legal notices, demo privacy boundary, and deterministic short-height sidebar focus/reachability checks
- 36 axe accessibility checks with no serious or critical findings across authentication, onboarding, legal/privacy routes, Portfolio, Attention, Waiting, Workspace, Board, stakeholder view, Decisions, Blueprints, the item panel, and the light/dark primary-action transition regression
- API contract coverage for health, Portfolio, Attention, Waiting, commercial memory, collaboration, privacy, operations, and the generated OpenAPI document
- PostgreSQL 17 clean and populated-upgrade migrations plus full API-process restart, two-tenant, Board/Workspace integrity, optimistic concurrency, expiring and concurrently reclaimed idempotency, rollback, and audit/outbox atomicity integration coverage
- founder-loop and collaboration integration coverage for canonical capture identity, WorkItem evidence/history, atomic transitions, Waiting resolution, deterministic timezone-aware Attention, weekly snapshots, cross-tenant isolation, Team-room synchronization, conversation visibility and removal, message idempotency/concurrency/retention, worker event ownership, lease recovery, sweep-level recovery, retries/dead letters, stale-ack rollback, and fair bounded sweeps
- production-mode browser coverage for sign-up, one-time verification, wrong credentials, onboarding recovery/completion, two-browser tenant persistence, non-leaking Workspace 404s, invitation acceptance, membership removal, session revocation, password recovery/reset, durable privacy request/cancellation truth, pre-acknowledgement timeout/retry, post-commit response-loss replay, recoverable transition/review drafts, and live-surface AA scans against PostgreSQL and a private mail sink; distinct trusted test clients prove rate-limit buckets do not leak across flows
- dependency audit reporting zero advisories and no allowlisted exceptions
- production-shaped local/CI topology definitions for standalone Web, two API processes, PostgreSQL 17, two workers, a private mail sink, and a self-signed local TLS edge, plus smoke scripts for the authenticated tenant/Team/message/outbox path and a populated previous-schema upgrade. No qualifying production-shaped remote-staging result is part of this implementation evidence; a disposable fictional-data `$0` preview, if provisioned, does not satisfy that gate.

## Release constraints

The hosted deployment currently represents the fictional-data Web demonstration, not the target Web/API/worker/PostgreSQL topology. Repository, live-API, live-browser, golden-loop, collaboration, worker, privacy-foundation, and operations tests cover those boundaries locally and in CI; they do not prove a qualifying managed API/mail/database/worker topology or active production operations. The private topology still sets `NODE_ENV=test` for API, migration, and worker containers, uses self-signed TLS/test credentials, and builds the Web CSP report-only. A disposable fictional-data `$0` remote preview may be used for bounded rehearsal, but it is not production-shaped staging evidence.

Phase 5 and public beta are **NO-GO**. Required evidence still includes remote production-mode staging, managed PostgreSQL backup/restore, authenticated delivery, secret injection/private networking, active log/metrics collection, paging, error tracking and source-map upload, a nonce/hash CSP without `unsafe-inline`, dead-letter redrive, scheduled rate-limit pruning, deployment/rollback drills, reviewed privacy/terms/DPA/subprocessors, an account-level DSAR path after membership loss, a deletion-safe lifecycle ledger, and real export/deletion/provider-revocation processing. Pilot evidence does not currently approve an integration, AI external effect, private-file workflow, or pricing/billing test, so all remain disabled. Teams and Messages no longer require domain implementation for alpha, but they still require deployed-system evidence. Message editing, archive/pin, turn-to-work, binary attachments, production email/push, and broader imports remain outside the current implementation. See [known limitations](known-limitations.md), [Phase 4 collaboration/runtime boundaries](phase-4-collaboration-runtime.md), and the [1.1 backlog](release-1.1-backlog.md).
