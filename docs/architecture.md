# Architecture

> **Implemented server foundation, not current deployed topology.** The hosted technical preview still serves the Web demonstration with fictional seed/browser-local state. The API can now select an explicit tenant-scoped PostgreSQL adapter, but Web account provisioning, Web-to-API product wiring, the worker, object storage, and the production topology are not connected end to end.

## Target topology

TREVV is one platform with purpose-built clients:

```text
Web (Next.js) ─┐
Mobile (Expo) ─┼─ typed API client ─ Hono /api/v1 ─ domain services ─ repositories ─ PostgreSQL
Desktop (Tauri)┘                            └──── outbox ─ worker
```

The Hono service owns transport, authentication boundaries, authorization calls, validation, and its versioned contract. It now receives either a per-instance fictional demo adapter or a live PostgreSQL adapter; live mode never falls back to fixtures. The live resolver derives organization and Workspace access from persisted membership rows, and repositories require organization/user/request scope. Rate limits and production webhook adapters remain unimplemented. `packages/core` owns deterministic rules, `packages/api-contract` owns Zod/OpenAPI transport shapes, and `packages/db` owns additive migrations, repositories, transactions, audit/outbox writes, versions, and idempotency. No client imports server-only packages.

## Authentication

Better Auth is composed into the live API runtime, and live requests require an authoritative session plus `X-Organization-Id` before membership-derived access is resolved. The current Web sign-in/onboarding preview still does not authenticate, provision the matching `app_users` identity, or guard application routes. Verification/recovery, revocation UX, and platform-secure native bearer sessions remain Phase 2 work.

## Realtime and background work

In-scope live mutations commit audit and outbox rows in the same PostgreSQL transaction. Leasing, scheduling, retries/dead letters, provider delivery, and live Server-Sent Events are not currently connected.

## Offline and concurrency

The API now exposes canonical server writes, durable idempotency, numeric versions, strong quoted ETags, and compare-and-swap conflicts. The current Web demo still applies browser-local optimistic changes and does not consume those conflict/retry semantics. Full collaborative conflict resolution is deferred.

## Deployment

The target deployment independently promotes Web, API, and worker, with PostgreSQL and private object storage in an EU region. The current production workflow deploys only Web. Mobile/desktop hosting, the full runtime, and verified deep-link behavior must pass their release gates before being described as live.
