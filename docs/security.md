# Security model

## Trust boundaries

The API is the authorization boundary. Clients never import database code and never calculate domain permissions. Every protected query must include `organization_id` and, for scoped roles, an accessible Workspace identifier. Public identifiers are opaque strings; possession of an identifier is never sufficient authorization.

Better Auth owns credential hashing, HTTP-only session cookies, session expiry, one-time email verification, password recovery/reset, and session revocation. The live Web sends auth/API traffic through a same-origin boundary; Better Auth validates trusted callback origins, and live cookie-authenticated mutations require either the exact configured Web `Origin` or, when browser privacy policy omits it, the browser-controlled `Sec-Fetch-Site: same-origin` signal. A conflicting `Origin` always fails. Production disables `DEMO_MODE`, requires a strong secret, uses HTTPS and secure cookies, and fails startup when the database, canonical origins, mail transport, or cookie topology is unsafe. Native session storage/deep-link support remains future work.

## Controls

- centralized role/action/resource policy with explicit Owner, Admin, Workspace Lead, Member, Guest, and Viewer tests
- one-to-one Better Auth/application-user mapping; server-owned active organization selection; membership, Portfolio, Workspace, and managed scopes reloaded from PostgreSQL on every request
- server-side `/app/**` protection and non-leaking Workspace-slug authorization; a cookie-shaped string in the browser proxy is only an early filter, never the authorization decision
- SHA-256-only invitation-token storage, normalized email binding, expiry/revocation/resend rotation, one-time acceptance, and atomic membership/audit/outbox creation
- request validation with Zod; consistent non-leaking error envelopes and request IDs
- optimistic concurrency through `If-Match` versions and idempotency keys for retryable creates
- signed/private object-storage design; MIME, size, tenant, and authorization checks are required before an upload is accepted
- application-level encryption boundary for OAuth tokens; secrets and full provider payloads are excluded from logs
- webhook delivery IDs and payload hashes for replay prevention; provider signature verification is mandatory before processing
- organization export and soft-delete/archive fields; destructive organization deletion is an auditable background job
- dependency audit in CI and least-privilege GitHub Actions permissions

The audit gate fails on every high/critical advisory except two exact `image-size` advisories currently confined to Expo/Metro tooling (`GHSA-w3rx-r6r6-pgpr`, `GHSA-5p2g-fcmc-qvqq`). On 2026-08-24 the registry declared `>=2.0.3` patched but had not published that version. `scripts/audit.mjs` verifies both advisory identity and the Expo/Metro-only dependency path; any changed path or additional high finding fails CI. Remove the exception as soon as Expo/Metro resolves to a patched release.

## Production hardening checklist

1. Set `DEMO_MODE=false`; reject startup if auth, database, HTTPS origins, verified database TLS (`sslmode=verify-full`, never identity-unverified `sslmode=require`), cookie topology, or authenticated TLS mail configuration is absent.
2. Terminate TLS at the edge and keep API/database/storage in EU regions where offered.
3. Apply edge rate limits to auth, invitation, search, export, and webhook endpoints.
4. Rotate database, auth, mail, storage, and integration credentials; test session and invitation revocation.
5. Configure private object storage, signed URL TTLs, malware scanning, and upload limits.
6. Enable structured log redaction, Sentry source maps, alerting, and immutable audit-log retention.
7. Run permission/IDOR, Playwright, axe, dependency audit, and restore-drill gates before release.

## Threats deliberately deferred

The V1 integration adapters expose safe mocks and smart links. Live Drive OAuth/picker plumbing has configuration seams but should not be enabled until token encryption, provider verification, rate limiting, and revocation jobs are deployed together. MFA/passkey/login-alert controls are omitted rather than simulated. Exactly-once mail delivery across the SMTP/transaction boundary still needs provider idempotency or a dedicated mail outbox. See `known-limitations.md`.
