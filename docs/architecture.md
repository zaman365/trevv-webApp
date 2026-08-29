# Architecture

> **Implemented live foundation, not current deployed topology.** The hosted technical preview still serves the Web demonstration with fictional seed/browser-local product state. Live Web account provisioning, tenant authorization, the founder golden loop, Teams, and contextual Messages connect end to end in undeployed local/CI production-mode paths. The production-shaped Web/API/database/worker/mail topology is not deployed remotely. Object storage is intentionally absent because the alpha accepts message metadata, not attachment bytes.

## Target topology

TREVV is one platform with purpose-built clients:

```text
Web (Next.js) ─┐
Mobile (Expo) ─┼─ typed API client ─ Hono /api/v1 ─ domain services ─ repositories ─ PostgreSQL
Desktop (Tauri)┘                            └──── outbox ─ worker
```

The Hono service owns transport, Better Auth composition, authorization calls, validation, and its versioned contract. It receives either a per-instance fictional demo adapter or a live PostgreSQL adapter; live mode never falls back to fixtures. The live resolver maps the verified auth identity to one application user, resolves the server-owned active organization, and derives role plus Portfolio/Workspace scopes from current membership rows on every request. Repositories require identity or organization/user/request scope. Rate limits and production webhook adapters remain unimplemented. `packages/core` owns deterministic rules, `packages/api-contract` owns Zod/OpenAPI transport shapes, and `packages/db` owns additive migrations, repositories, transactions, canonical capture-to-WorkItem identity, collaboration, evidence/history snapshots, audit/outbox writes, versions, idempotency, retention, and worker leases. No client imports server-only packages.

## Authentication

Better Auth is composed into the live API runtime. Credentials, verification/recovery tokens, and sessions remain in its tables; TREVV owns the one-to-one application-user mapping, organization selection, onboarding graph, memberships, and invitation lifecycle. The client never submits a role, accessible Workspace list, or authorization tenant. Selecting an organization is a server command that first verifies current membership.

The live Next.js Web uses a same-origin `/api/**` boundary so session cookies remain first-party. Its proxy rejects obviously anonymous `/app/**` requests, while every leaf route independently resolves the authoritative server session before rendering. Workspace routes additionally resolve the slug through the permission-scoped API and return the same 404 for unknown and inaccessible resources. One-time invite/reset tokens are normalized into short-lived HttpOnly, path-scoped cookies before Client Components render them. Native bearer sessions remain future work.

## Collaboration and authorization

The closed-alpha decision is to ship persistent Teams and contextual Messages. A Team belongs to one organization, Portfolio, and Workspace and has explicit members, lead roles, a preset, and feature-capability labels. Creating a Team atomically creates its private Team conversation; membership changes atomically synchronize conversation participation. Workspace rooms, private rooms, direct conversations, and guest-scoped external rooms share one message model with ordered sequences, threads, reactions, response ownership/state, read checkpoints, and retention timestamps.

Feature inheritance and data authorization are intentionally separate. Team presets can shape visible work, messaging, decision, approval, resource, and reporting tools; they never grant a row or route. Server authorization derives from current organization role, accessible/managed Workspace scope, active Team membership, conversation kind/visibility, active participation, ownership, and response ownership. Private, Team, direct, and external message content remains participant-only even for organization owners and administrators. Viewers are read-only, guests are explicitly scoped, and inaccessible resources use non-leaking not-found responses.

Collaboration writes use optimistic versions/ETags and durable idempotency. Aggregate state, participant changes, redacted audit metadata, outbox events, and permission-filtered collaboration events commit atomically. Message bodies are excluded from audit/outbox/event journals. Collaboration events expire after seven days and support cursor-based invalidation; they are not a permanent message history.

## Invalidation and background work

In-scope live mutations commit their aggregate, audit row, and outbox event in the same PostgreSQL transaction; founder-loop mutations additionally commit immutable WorkItem history/evidence, and collaboration mutations commit a permission-filtered invalidation event. `apps/worker` has three explicit handlers with non-overlapping ownership: Attention recomputes deterministic signals, collaboration applies or acknowledges collaboration effects including retention, and reviewed audit-only acknowledges events whose originating transaction is already the complete durable effect. Audit-only is an enumerated disposition, not a catch-all.

An exhaustive catalog currently assigns all 50 outbox event types emitted by repository producers to exactly one of those handlers and records the reviewed effect and reason. A source-coverage test fails when a producer emits an event without a catalog entry. The worker leases only active cataloged event types with bounded `FOR UPDATE SKIP LOCKED` batches; unknown or handler-paused events remain pending instead of being acknowledged. Unknown events are reported as unsupported, and `/readyz` fails when the oldest unknown event reaches the configurable `WORKER_READINESS_MAX_UNSUPPORTED_AGE_MS` threshold (five minutes by default; a shorter threshold is used in topology smoke). Lease tokens protect acknowledgements, every attempt is persisted, expired leases recover, failures retry with bounded jittered exponential backoff, terminal failures dead-letter, and the loop survives sweep-level infrastructure errors.

Attention processing remains deterministic and fair through a durable least-recently-computed organization cursor. Collaboration processing acknowledges Team/conversation/message invalidations and enforces scheduled message retention by replacing an expired body with `[Message expired]`, clearing its metadata, and retaining record/audit identity. Handler kill switches, graceful SIGINT/SIGTERM shutdown, queue counts/age/attempt telemetry, and content-free `/livez`, `/readyz`, and `/metrics` endpoints are implemented. External telemetry export, alerts, dead-letter replay operations, provider delivery, and production supervision remain unimplemented.

The live Web consumes finite, permission-filtered Server-Sent Event batches through its same-origin proxy, records the numeric checkpoint in memory, reconnects with `after`, and invalidates typed React Query caches. Bounded authoritative polling continues in parallel and remains the correctness fallback. This supports reliable cross-browser refresh without claiming presence, delivery receipts, or a general realtime chat transport.

## Offline and concurrency

The API exposes canonical server writes, 24-hour expiring idempotency records with atomic key reclamation, numeric versions, strong quoted ETags, and compare-and-swap conflicts. The hosted Web product demo still applies browser-local optimistic changes. In local/CI live mode, the founder golden loop and collaboration consume server versions and survive API-process and browser restart. The Messages UI keeps an unconfirmed send visible until server acknowledgement and reuses its durable idempotency/client-message identifiers after a lost response. Organization/user/scope-namespaced browser storage holds only recoverable drafts and retry metadata, never canonical business records or collaborative state.

## Deployment

The target deployment independently promotes Web, API, and worker with managed PostgreSQL in an EU region. Private object storage is not an alpha dependency because no upload API accepts attachment bytes; it becomes mandatory before attachments are enabled. `compose.staging.yaml` models standalone Next Web, two load-balanced API processes, PostgreSQL 17, two workers, a private file mail sink, and an Nginx edge with locally generated TLS. CI is configured to build that topology, verify a populated previous-release database upgrade, and run an authenticated tenant/Team/message/outbox smoke. It is production-shaped validation, not a remote staging deployment: publicly trusted TLS, managed database transport/restore, real secret injection, authenticated mail, private networking, telemetry export, alerts, and operational runbooks remain required.
