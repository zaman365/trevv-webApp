# Operations, backup, and recovery

## Service objectives

- API health and error rate: alert on five-minute availability below 99.5% or a sustained 5xx rate above 2%
- background work: alert when the oldest unprocessed outbox event exceeds five minutes
- authentication: alert on a sudden increase in failed sign-ins without recording credentials or raw payloads
- storage/webhooks: track rejected MIME/signature/replay counts separately from server faults

Structured events include service, request ID, organization-safe identifier, action, duration, result, and error code. Redact secrets, cookies, tokens, comment bodies, file contents, and provider payloads.

## Backup policy

- PostgreSQL: managed point-in-time recovery, daily encrypted snapshot, 35-day operational retention, and monthly archive for 12 months where policy allows
- object storage: versioning plus a 30-day noncurrent-object recovery window
- configuration: infrastructure-as-code and secret-manager version history; never database dumps in Git
- audit data: retain according to the organization contract and applicable GDPR purpose limitation

## Restore drill

Quarterly, restore the latest snapshot into an isolated EU-region database, run migrations, compare organization/Workspace/item counts, verify one attachment, authenticate a test identity, load Portfolio, and export the restored organization. Record recovery point and recovery time. Delete the drill environment securely.

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
5. Validate tenant isolation, mutation integrity, auth revocation, and outbox replay safety.
6. Notify affected users and regulators according to the incident policy; document follow-up controls.
