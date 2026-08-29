# Architecture

> **Implemented live foundation, not current deployed topology.** The hosted technical preview still serves the Web demonstration with fictional seed/browser-local product state. Live Web account provisioning, tenant authorization, and the founder golden loop connect end to end in local/CI production-mode tests, and the PostgreSQL worker is implemented for durable internal processing. The worker, object storage, and production Web/API/database/mail topology are not deployed end to end.

## Target topology

TREVV is one platform with purpose-built clients:

```text
Web (Next.js) ─┐
Mobile (Expo) ─┼─ typed API client ─ Hono /api/v1 ─ domain services ─ repositories ─ PostgreSQL
Desktop (Tauri)┘                            └──── outbox ─ worker
```

The Hono service owns transport, Better Auth composition, authorization calls, validation, and its versioned contract. It receives either a per-instance fictional demo adapter or a live PostgreSQL adapter; live mode never falls back to fixtures. The live resolver maps the verified auth identity to one application user, resolves the server-owned active organization, and derives role plus Portfolio/Workspace scopes from current membership rows on every request. Repositories require identity or organization/user/request scope. Rate limits and production webhook adapters remain unimplemented. `packages/core` owns deterministic rules, `packages/api-contract` owns Zod/OpenAPI transport shapes, and `packages/db` owns additive migrations, repositories, transactions, canonical capture-to-WorkItem identity, evidence/history snapshots, audit/outbox writes, versions, idempotency, and worker leases. No client imports server-only packages.

## Authentication

Better Auth is composed into the live API runtime. Credentials, verification/recovery tokens, and sessions remain in its tables; TREVV owns the one-to-one application-user mapping, organization selection, onboarding graph, memberships, and invitation lifecycle. The client never submits a role, accessible Workspace list, or authorization tenant. Selecting an organization is a server command that first verifies current membership.

The live Next.js Web uses a same-origin `/api/**` boundary so session cookies remain first-party. Its proxy rejects obviously anonymous `/app/**` requests, while every leaf route independently resolves the authoritative server session before rendering. Workspace routes additionally resolve the slug through the permission-scoped API and return the same 404 for unknown and inaccessible resources. One-time invite/reset tokens are normalized into short-lived HttpOnly, path-scoped cookies before Client Components render them. Native bearer sessions remain future work.

## Invalidation and background work

In-scope live mutations commit their aggregate, immutable WorkItem history/evidence, audit row, and outbox event in the same PostgreSQL transaction. `apps/worker` leases only its declared Attention-trigger event types with bounded `FOR UPDATE SKIP LOCKED` batches; unsupported events stay pending for their owning handler instead of being acknowledged. The worker persists attempts, recovers expired leases, retries with backoff, dead-letters terminal failures, atomically acknowledges effects, and keeps polling after a sweep-level infrastructure failure. It recomputes tenant-scoped Attention deterministically from WorkItems, decisions, approvals, Waiting, and stale Workspace updates, then creates deduplicated internal notifications. A durable least-recently-computed organization cursor keeps time-based sweeps bounded and fair.

Polling is the current invalidation strategy for live Web state. Provider delivery, production scheduling/supervision, worker telemetry, push fan-out, and Server-Sent Events remain unimplemented.

## Offline and concurrency

The API exposes canonical server writes, 24-hour expiring idempotency records with atomic key reclamation, numeric versions, strong quoted ETags, and compare-and-swap conflicts. The hosted Web product demo still applies browser-local optimistic changes. In local/CI live mode, the founder golden loop consumes server versions and preserves the captured Inbox identifier when work becomes a WorkItem; transitions, rationale, evidence, Waiting outcomes, and weekly snapshots survive API-process and browser restart. Organization/user-scoped browser storage holds only recoverable drafts and their retry metadata, never canonical business records. Broader product-screen adoption, realtime invalidation, and collaborative merge UX remain future work.

## Deployment

The target deployment independently promotes Web, API, and worker, with PostgreSQL and private object storage in an EU region. The current production workflow deploys only the fictional-data Web preview. The worker needs a separately supervised production process, database access, monitoring, and dead-letter runbooks before the live topology can be described as deployed. Mobile/desktop hosting, the full runtime, and verified deep-link behavior must also pass their release gates.
