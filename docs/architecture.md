# Architecture

> **Target architecture, not current deployed topology.** The hosted technical preview currently serves the Web demonstration with fictional seed/browser-local state. The API, repositories, worker, PostgreSQL, object storage, and tenant-aware authentication described below are the intended production boundary and are not yet connected end to end.

## Target topology

TREVV is one platform with purpose-built clients:

```text
Web (Next.js) ─┐
Mobile (Expo) ─┼─ typed API client ─ Hono /api/v1 ─ domain services ─ repositories ─ PostgreSQL
Desktop (Tauri)┘                            └──── outbox ─ worker
```

In the target runtime, the Hono service owns transport, authentication boundaries, authorization calls, validation, rate limits, and webhook endpoints. Today it is a demo service with process-local mutation state, no rate limiter, and no production webhook adapters. `packages/core` owns deterministic attention, entitlement, Blueprint diff, opportunity, pressure, and portfolio-rollup rules. `packages/api-contract` is the Zod contract source. `packages/db` currently owns the additive Drizzle schema; tenant-scoped repositories remain to be implemented. No client imports server-only packages.

## Authentication

Better Auth is configured in `packages/auth-server`, but the Web sign-in/onboarding preview does not authenticate, provision, or guard application routes. Secure same-site cookies, membership-derived access, revocation, verification/recovery, and platform-secure native session adapters describe the target implementation.

## Realtime and background work

The schema and worker define the intended outbox/job boundaries. Transactional outbox writes, leasing, scheduling, retries/dead letters, provider delivery, and Server-Sent Events are not currently connected.

## Offline and concurrency

The current Web demo applies local optimistic changes and does not implement production retry/failed-sync state. Safe caching, canonical server writes, durable idempotency, and visible conflict handling remain target behavior. Full collaborative conflict resolution is deferred.

## Deployment

The target deployment independently promotes Web, API, and worker, with PostgreSQL and private object storage in an EU region. The current production workflow deploys only Web. Mobile/desktop hosting, the full runtime, and verified deep-link behavior must pass their release gates before being described as live.
