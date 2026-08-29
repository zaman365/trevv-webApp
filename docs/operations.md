# Operations, backup, and recovery

## Service objectives

The API and worker thresholds below are implemented as repository-owned Prometheus rules and dashboard panels. Authentication and storage/webhook signals remain target requirements. None are active SLOs until a collector, pager, ownership rotation, retention policy, and runbook have been provisioned and exercised in a remote environment.

- API health and error rate: alert on five-minute availability below 99.5% or a sustained 5xx rate above 2%
- background work: alert when the oldest available unprocessed outbox event exceeds five minutes, a lease repeatedly expires, retries grow, or any event enters dead-letter state
- authentication target: alert on a sudden increase in failed sign-ins without recording credentials or raw payloads
- storage/webhook target: track rejected MIME/signature/replay counts separately from server faults when those capabilities are enabled

Implemented API events include service, request ID, normalized route, action, duration, result, and error code; worker events add bounded queue/handler context. Secrets, cookies, tokens, tenant content, resource IDs, query strings, and provider payloads are excluded or redacted.

## Implemented operations boundary

- The Web proxy and API validate or generate a bounded request ID and carry it across same-origin calls. API and staging-edge access logs use fixed route families rather than tenant slugs, resource IDs, raw paths, or query strings.
- API and worker logs are structured and content-redacted. API and worker Prometheus endpoints expose bounded request, error, rate-limit, queue-age, attempt, unsupported-event, and dead-letter series. Internal metrics routes are not published by the local edge.
- Production configuration requires a shared PostgreSQL rate-limit store. Client keys are stored only as HMAC-SHA-256 digests, and API requests fail closed when the limiter store is unavailable. Expired rows are pruned opportunistically by live traffic; an independently scheduled pruning job is not implemented.
- Web security headers include HSTS controls, frame/content-type/referrer/permissions policies, and a CSP that supports report-only or enforcing mode. CSP selection happens during the Web build; the private local topology builds report-only. Sanitized CSP and client-error report routes exist, but no external collector, error tracker, or source-map upload is configured.
- `deploy/observability/` contains importable Grafana panels and Prometheus alert rules. They are definitions only: no metrics collector, pager destination, external error-reporting provider, or on-call ownership is provisioned.

## Worker runtime

The PostgreSQL worker is implemented and exercised locally/in CI, but it is not part of the hosted deployment. It provides a bounded run-once API and a graceful polling executable. It leases only event types owned by the explicit Attention, collaboration, and reviewed audit-only handlers; unsupported events remain pending for an owning handler and must not be counted as successfully processed. Outbox-triggered recomputation is immediate, collaboration handlers apply their reviewed internal effects, and a separate fair sweep handles time-based Attention changes. Live collaboration also exposes permission-filtered finite Server-Sent Event batches; bounded authoritative polling remains the correctness fallback.

Required production input:

- `DATABASE_URL`: least-privilege PostgreSQL connection; production requires exactly one `sslmode=verify-full` and a runtime trust store containing the managed database CA so both certificate and hostname are verified
- `WORKER_ID`: stable instance identifier, 3–128 URL-safe characters

Optional bounded controls:

- `WORKER_POLL_INTERVAL_MS`: outbox poll interval, default `1000`
- `WORKER_ATTENTION_SWEEP_INTERVAL_MS`: full time-based Attention sweep interval, default `60000`
- `WORKER_BATCH_SIZE`: events leased per pass, default `25`
- `WORKER_LEASE_MS`: lease duration, default `30000`
- `WORKER_MAX_ATTEMPTS`: terminal attempt count, default `8`

After building, run the executable with `pnpm --filter @founderhq/worker start`. Readiness combines a recent successful sweep with queue telemetry and fails on stale ready work, dead letters above the configured limit, or aged unsupported events. A transient lease or sweep failure emits a structured failure event and retries after the bounded poll interval without declaring readiness prematurely. `SIGINT`/`SIGTERM` stop new polling, allow the bounded pass to finish, close PostgreSQL, and emit `event: "stopped"`. The worker performs database-internal Attention, collaboration, retention-redaction, notification, and audit-acknowledgement effects only. It must not be configured or described as an email, push, webhook, privacy-effect, or provider-delivery worker.

Before production activation, add a supervised deployment, resource limits, structured-log and metrics collection, active per-handler alerts, an operator dead-letter inspection/redrive/quarantine procedure, and a tested rolling-shutdown policy. Repository dashboards and rules do not prove that any collector or pager is active. A ready response proves database access, recent telemetry, and queue conditions at one moment; it is not a substitute for ongoing health monitoring.

## Cache invalidation

Live founder-loop screens reconcile by bounded polling and authoritative refetch. Collaboration additionally uses permission-filtered finite Server-Sent Event batches with cursor reconnects, but correctness and membership revocation do not depend on an uninterrupted stream. Membership removal is enforced on the next server request; no client-supplied tenant or cached role is authoritative. Operate polling intervals conservatively and retain `ETag`/version conflict handling.

## Privacy operations boundary

Live-mode privacy requests and retention overrides are durable, tenant-scoped, versioned, idempotent, and journaled atomically. A request in `submitted` or `under_review` is a workflow record only. No worker exports, erases, rectifies, restricts, revokes provider data, or enforces the configured retention disposition.

Do not accept real-data beta traffic until account-level requests remain reachable after the final organization membership is removed and lifecycle evidence survives physical user/organization deletion through an approved pseudonymized ledger. Legal review, reviewer authorization, private export delivery, legal-hold resolution, provider reconciliation, backup/tombstone rules, and effect-specific rollback drills are also required.

## Target backup policy — not provisioned

The following is the intended policy, not evidence that a managed database, object store, snapshot schedule, archive, or restore path exists:

- PostgreSQL: managed point-in-time recovery, daily encrypted snapshot, 35-day operational retention, and monthly archive for 12 months where policy allows
- object storage: versioning plus a 30-day noncurrent-object recovery window
- configuration: infrastructure-as-code and secret-manager version history; never database dumps in Git
- audit data: retain according to the organization contract and applicable GDPR purpose limitation

## Target restore drill — not yet passed

Quarterly, restore the latest snapshot into an isolated EU-region database, run migrations, compare organization/Workspace/item/history/outbox counts, verify one attachment, authenticate a test identity, load Portfolio, inspect one historical evidence chain and weekly snapshot, and export the restored organization. Run one worker pass against an isolated queue and verify atomic acknowledgement without contacting an external provider. Record recovery point and recovery time. Delete the drill environment securely.

Example operator flow:

```bash
createdb founderhq_restore
pg_restore --clean --if-exists --no-owner --dbname founderhq_restore backup.dump
NODE_ENV=production DATABASE_URL='postgresql://…/founderhq_restore?sslmode=verify-full' pnpm db:migrate
```

Do not run `--clean` against production and never seed a restored real-data database. A restore swaps a verified replacement database through deployment configuration after writes are paused and a final recovery point is captured.

## Release gate

Phase 5 and public beta are **NO-GO**. The local topology still runs API, migration, and worker containers with `NODE_ENV=test`, uses self-signed TLS/test credentials, and builds CSP in report-only mode. No remote production deployment, managed backup/restore drill, active telemetry collector/pager/error tracker/source-map pipeline, dead-letter redrive, independent rate-limit pruning schedule, or privacy-effect processor has been demonstrated.

## Incident runbook

1. Identify affected organizations/routes without exposing tenant content.
2. Disable the smallest unsafe capability (integration, webhook, mutation class, or rollout).
3. Preserve logs/audit evidence and rotate affected secrets.
4. Restore service with a forward fix or verified replacement database.
5. Validate tenant isolation, mutation/history integrity, auth revocation, lease recovery, Attention recomputation, and outbox replay safety.
6. Notify affected users and regulators according to the incident policy; document follow-up controls.
