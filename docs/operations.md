# Operations, backup, and recovery

## Service objectives

- API health and error rate: alert on five-minute availability below 99.5% or a sustained 5xx rate above 2%
- background work: alert when the oldest available unprocessed outbox event exceeds five minutes, a lease repeatedly expires, retries grow, or any event enters dead-letter state
- authentication: alert on a sudden increase in failed sign-ins without recording credentials or raw payloads
- storage/webhooks: track rejected MIME/signature/replay counts separately from server faults

Structured events include service, request ID, organization-safe identifier, action, duration, result, and error code. Redact secrets, cookies, tokens, comment bodies, file contents, and provider payloads.

## Worker runtime

The PostgreSQL worker is implemented and exercised locally/in CI, but it is not part of the hosted deployment. It provides a bounded run-once API and a graceful polling executable. It leases only the declared Attention-trigger event types; unsupported events remain pending for an owning handler and must not be counted as successfully processed. Outbox-triggered recomputation is immediate; a separate fair sweep handles time-based Attention changes. Polling is also the current live Web invalidation mechanism—there is no realtime push or Server-Sent Events channel yet.

Required production input:

- `DATABASE_URL`: TLS-protected PostgreSQL connection with only the required application privileges
- `WORKER_ID`: stable instance identifier, 3–128 URL-safe characters

Optional bounded controls:

- `WORKER_POLL_INTERVAL_MS`: outbox poll interval, default `1000`
- `WORKER_ATTENTION_SWEEP_INTERVAL_MS`: full time-based Attention sweep interval, default `60000`
- `WORKER_BATCH_SIZE`: events leased per pass, default `25`
- `WORKER_LEASE_MS`: lease duration, default `30000`
- `WORKER_MAX_ATTEMPTS`: terminal attempt count, default `8`

After building, run the executable with `pnpm --filter @founderhq/worker start`. Readiness is a structured `trevv-worker` log with `event: "ready"`; a transient lease or sweep failure emits `event: "sweep_failed"` and retries after the bounded poll interval without declaring readiness prematurely. `SIGINT`/`SIGTERM` stop new polling, allow the bounded pass to finish, close PostgreSQL, and emit `event: "stopped"`. The worker currently performs database-internal Attention recomputation and internal notification creation only. It must not be configured or described as an email, push, webhook, or provider-delivery worker.

Before production activation, add a supervised deployment, resource limits, structured-log collection, per-handler dashboards for supported backlog age/attempts/dead letters plus unsupported pending events, alerts, an operator replay/quarantine procedure, and a tested rolling-shutdown policy. A ready log proves database access and one successful bounded pass; it is not a substitute for ongoing health monitoring.

## Cache invalidation

Live founder-loop screens currently reconcile by bounded polling and authoritative refetch. Membership removal is enforced on the next server request; no client-supplied tenant or cached role is authoritative. Operate polling intervals conservatively, include `ETag`/version handling, and do not claim realtime collaboration until an authenticated push/SSE path and revocation-aware fan-out are implemented.

## Backup policy

- PostgreSQL: managed point-in-time recovery, daily encrypted snapshot, 35-day operational retention, and monthly archive for 12 months where policy allows
- object storage: versioning plus a 30-day noncurrent-object recovery window
- configuration: infrastructure-as-code and secret-manager version history; never database dumps in Git
- audit data: retain according to the organization contract and applicable GDPR purpose limitation

## Restore drill

Quarterly, restore the latest snapshot into an isolated EU-region database, run migrations, compare organization/Workspace/item/history/outbox counts, verify one attachment, authenticate a test identity, load Portfolio, inspect one historical evidence chain and weekly snapshot, and export the restored organization. Run one worker pass against an isolated queue and verify atomic acknowledgement without contacting an external provider. Record recovery point and recovery time. Delete the drill environment securely.

Example operator flow:

```bash
createdb founderhq_restore
pg_restore --clean --if-exists --no-owner --dbname founderhq_restore backup.dump
DATABASE_URL=postgresql://…/founderhq_restore pnpm db:migrate
DATABASE_URL=postgresql://…/founderhq_restore pnpm db:seed
```

Do not run `--clean` against production. A restore swaps a verified replacement database through deployment configuration after writes are paused and a final recovery point is captured.

## Incident runbook

1. Identify affected organizations/routes without exposing tenant content.
2. Disable the smallest unsafe capability (integration, webhook, mutation class, or rollout).
3. Preserve logs/audit evidence and rotate affected secrets.
4. Restore service with a forward fix or verified replacement database.
5. Validate tenant isolation, mutation/history integrity, auth revocation, lease recovery, Attention recomputation, and outbox replay safety.
6. Notify affected users and regulators according to the incident policy; document follow-up controls.
