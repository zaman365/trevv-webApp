# Architecture

## Topology

TREVV is one platform with purpose-built clients:

```text
Web (Next.js) ─┐
Mobile (Expo) ─┼─ typed API client ─ Hono /api/v1 ─ domain services ─ repositories ─ PostgreSQL
Desktop (Tauri)┘                            └──── outbox ─ worker
```

The Hono service owns transport, authentication boundaries, authorization calls, validation, rate limits, and webhook endpoints. `packages/core` owns deterministic attention, entitlement, Blueprint diff, opportunity, pressure, and portfolio-rollup rules. `packages/api-contract` is the single Zod contract source. `packages/db` owns the additive Drizzle schema and repositories. No client imports server-only packages.

## Authentication

Better Auth is configured once in `packages/auth-server`. Web uses secure same-site HTTP-only cookies. Mobile and desktop use the same hosted identity and API session endpoints, with tokens stored through a client-neutral session contract and platform-secure storage adapters. Development demo mode is explicitly isolated from production configuration.

## Realtime and background work

Mutations emit transactionally stored outbox events. The worker leases events idempotently and handles notifications, reminders, deterministic Attention refreshes, review cadence, update staleness, import/export jobs, and provider synchronization. Server-Sent Events refresh activity and notification surfaces; event types remain transport-neutral.

## Offline and concurrency

Clients cache safe reads, apply optimistic board mutations, and surface retry/failed-sync state. Mutations use updated-at/version checks; risky mutations accept idempotency keys. Full collaborative conflict resolution is deferred.

## Deployment

Web, API, and worker are independently deployable. API and worker share PostgreSQL and private object storage. Mobile and desktop point to the hosted HTTPS API. Preferred production data regions are in the EU. New deep links use `trevv://` plus verified `https://trevv.de` links; the legacy scheme remains a compatibility alias during migration.
