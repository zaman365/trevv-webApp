# Security model

## Trust boundaries

The API is the authorization boundary. Clients never import database code and never calculate domain permissions. Every protected query must include `organization_id` and, for scoped roles, an accessible Hub identifier. Public identifiers are opaque strings; possession of an identifier is never sufficient authorization.

Better Auth owns credential hashing, HTTP-only session cookies, CSRF/origin checks, session expiry, and email/password flows. Production disables `DEMO_MODE`, requires a strong secret, uses HTTPS and secure cookies, and only trusts the configured Web origin. Mobile and desktop store session material through platform-secure storage adapters and use deep links only to complete an already initiated authentication flow.

## Controls

- centralized role/action/resource policy with explicit Owner, Admin, Hub Lead, Member, Guest, and Viewer tests
- request validation with Zod; consistent non-leaking error envelopes and request IDs
- optimistic concurrency through `If-Match` versions and idempotency keys for retryable creates
- signed/private object-storage design; MIME, size, tenant, and authorization checks are required before an upload is accepted
- application-level encryption boundary for OAuth tokens; secrets and full provider payloads are excluded from logs
- webhook delivery IDs and payload hashes for replay prevention; provider signature verification is mandatory before processing
- organization export and soft-delete/archive fields; destructive organization deletion is an auditable background job
- dependency audit in CI and least-privilege GitHub Actions permissions

The audit gate fails on every high/critical advisory except two exact `image-size` advisories currently confined to Expo/Metro tooling (`GHSA-w3rx-r6r6-pgpr`, `GHSA-5p2g-fcmc-qvqq`). On 2026-08-24 the registry declared `>=2.0.3` patched but had not published that version. `scripts/audit.mjs` verifies both advisory identity and the Expo/Metro-only dependency path; any changed path or additional high finding fails CI. Remove the exception as soon as Expo/Metro resolves to a patched release.

## Production hardening checklist

1. Set `DEMO_MODE=false`; reject startup if auth, database, or encryption configuration is absent.
2. Terminate TLS at the edge and keep API/database/storage in EU regions where offered.
3. Apply edge rate limits to auth, invitation, search, export, and webhook endpoints.
4. Rotate database, auth, storage, and integration credentials; test session revocation.
5. Configure private object storage, signed URL TTLs, malware scanning, and upload limits.
6. Enable structured log redaction, Sentry source maps, alerting, and immutable audit-log retention.
7. Run permission/IDOR, Playwright, axe, dependency audit, and restore-drill gates before release.

## Threats deliberately deferred

The V1 integration adapters expose safe mocks and smart links. Live Drive OAuth/picker plumbing has configuration seams but should not be enabled until token encryption, provider verification, rate limiting, and revocation jobs are deployed together. See `known-limitations.md`.
