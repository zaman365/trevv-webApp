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
- structured redacted API/worker logs, normalized telemetry routes, bounded Prometheus metrics, and request-ID propagation through the same-origin Web/API boundary
- production-fail-closed shared PostgreSQL rate limiting with HMAC-SHA-256 client-key digests, explicit trusted edge headers, request-size limits, and standard retry headers
- Web/API security headers plus sanitized CSP/client-error reporting; CSP supports report-only and enforcing builds, while the current private local topology remains report-only and the production policy still permits inline scripts until Next-compatible nonces or hashes are implemented
- signed/private object-storage design; MIME, size, tenant, and authorization checks are required before an upload is accepted
- application-level encryption boundary for OAuth tokens; secrets and full provider payloads are excluded from logs
- webhook delivery IDs and payload hashes for replay prevention; provider signature verification is mandatory before processing
- durable tenant-scoped privacy request and retention-policy records that truthfully stop at review/cancellation; no export, erasure, provider-revocation, or retention-enforcement processor exists
- dependency audit in CI and least-privilege GitHub Actions permissions

The current privacy ledger is not deletion-safe. Account-level requests require an active selected organization, so a user who loses their final membership cannot use the authenticated route. Direct organization/user/membership foreign keys also mean a physical deletion can be blocked by the ledger or cascade away its proof. Public beta requires a reviewed identity-scoped request path and a pseudonymized, non-cascading evidence design before any destructive processor is enabled. The public privacy and terms pages remain engineering previews pending legal review.

The 2026-09-04 dependency audit reports five advisories: two high and three moderate. Both high findings are `image-size` parser denial-of-service issues (`GHSA-w3rx-r6r6-pgpr`, `GHSA-5p2g-fcmc-qvqq`) for which no patched npm release exists. They are reachable only through the Expo/Metro toolchain under `apps/mobile`, which is outside the Web/PWA release scope. `scripts/audit.mjs` allowlists exactly those two advisory IDs and re-blocks them if the module name or the Expo/Metro-only dependency paths ever change. The three moderate findings (`esbuild` reached through `drizzle-kit`, plus `uuid` and `decode-uri-component` reached through the Expo toolchain) are build-time dependencies below the gate threshold. The gate continues to fail on any other high or critical finding.

## Production hardening checklist

1. Set `DEMO_MODE=false`; reject startup if auth, database, HTTPS origins, verified database TLS (`sslmode=verify-full`, never identity-unverified `sslmode=require`), cookie topology, or authenticated TLS mail configuration is absent.
2. Terminate TLS at the edge and keep API/database/storage in EU regions where offered.
3. Validate edge plus shared PostgreSQL rate limits for auth and API traffic under multiple replicas; add independently scheduled expired-window pruning and provider-specific export/webhook policies before those routes are enabled.
4. Rotate database, auth, mail, storage, and integration credentials; test session and invitation revocation.
5. Configure private object storage, signed URL TTLs, malware scanning, and upload limits.
6. Connect the implemented redacted logs, metrics, dashboards, and rules to a reviewed collector, pager, and error tracker; upload source maps privately and establish immutable audit-log retention. Repository assets alone are not monitoring.
7. Run permission/IDOR, Playwright, axe, dependency audit, and restore-drill gates before release.

## Threats deliberately deferred

The V1 integration adapters expose safe mocks and smart links. Live Drive OAuth/picker plumbing has configuration seams but should not be enabled until token encryption, provider verification, rate limiting, and revocation jobs are deployed together. MFA/passkey/login-alert controls are omitted rather than simulated. Exactly-once mail delivery across the SMTP/transaction boundary still needs provider idempotency or a dedicated mail outbox. See `known-limitations.md`.

Phase 5/public beta remains **NO-GO**: privacy effects and deletion-safe evidence, reviewed legal terms, remote production-mode staging, managed backup/restore, active telemetry/error reporting/source maps, a nonce/hash CSP without `unsafe-inline`, dead-letter redrive, scheduled limiter cleanup, and pilot/pricing approval are unresolved. No provider, AI external action, private-file service, or billing flow is enabled.
