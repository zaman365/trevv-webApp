# Architecture

> **Implemented identity/server foundation, not current deployed topology.** The hosted technical preview still serves the Web demonstration with fictional seed/browser-local product state. Live Web account provisioning and tenant authorization now connect end to end in local/CI production-mode tests, but principal Web product screens, the worker, object storage, and the production API/database/mail topology are not deployed end to end.

## Target topology

TREVV is one platform with purpose-built clients:

```text
Web (Next.js) ─┐
Mobile (Expo) ─┼─ typed API client ─ Hono /api/v1 ─ domain services ─ repositories ─ PostgreSQL
Desktop (Tauri)┘                            └──── outbox ─ worker
```

The Hono service owns transport, Better Auth composition, authorization calls, validation, and its versioned contract. It receives either a per-instance fictional demo adapter or a live PostgreSQL adapter; live mode never falls back to fixtures. The live resolver maps the verified auth identity to one application user, resolves the server-owned active organization, and derives role plus Portfolio/Workspace scopes from current membership rows on every request. Repositories require identity or organization/user/request scope. Rate limits and production webhook adapters remain unimplemented. `packages/core` owns deterministic rules, `packages/api-contract` owns Zod/OpenAPI transport shapes, and `packages/db` owns additive migrations, repositories, transactions, audit/outbox writes, versions, and idempotency. No client imports server-only packages.

## Authentication

Better Auth is composed into the live API runtime. Credentials, verification/recovery tokens, and sessions remain in its tables; TREVV owns the one-to-one application-user mapping, organization selection, onboarding graph, memberships, and invitation lifecycle. The client never submits a role, accessible Workspace list, or authorization tenant. Selecting an organization is a server command that first verifies current membership.

The live Next.js Web uses a same-origin `/api/**` boundary so session cookies remain first-party. Its proxy rejects obviously anonymous `/app/**` requests, while every leaf route independently resolves the authoritative server session before rendering. Workspace routes additionally resolve the slug through the permission-scoped API and return the same 404 for unknown and inaccessible resources. One-time invite/reset tokens are normalized into short-lived HttpOnly, path-scoped cookies before Client Components render them. Native bearer sessions remain future work.

## Realtime and background work

In-scope live mutations commit audit and outbox rows in the same PostgreSQL transaction. Leasing, scheduling, retries/dead letters, provider delivery, and live Server-Sent Events are not currently connected.

## Offline and concurrency

The API exposes canonical server writes, durable idempotency, numeric versions, strong quoted ETags, and compare-and-swap conflicts. The current Web product demo still applies browser-local optimistic changes and does not consume most conflict/retry semantics. Live onboarding and invitation administration do use persisted versions, `If-Match`, and idempotency metadata. Full product-screen adoption and collaborative conflict resolution are Phase 3.

## Deployment

The target deployment independently promotes Web, API, and worker, with PostgreSQL and private object storage in an EU region. The current production workflow deploys only Web. Mobile/desktop hosting, the full runtime, and verified deep-link behavior must pass their release gates before being described as live.
