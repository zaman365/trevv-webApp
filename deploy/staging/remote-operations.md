# Remote staging bootstrap and smoke

These procedures are staging-only. They do not authorize production, create a
public-registration path, or replace the release, restore, and rollback gates.
Use the exact reviewed API image and release metadata for the candidate cohort.

They also work against a disposable single-instance `$0` preview. No step in
this file requires paid infrastructure or multiple instances. On a free host,
the smoke wakes and polls the separate public sleeping Worker service before it
writes collaboration data. Treat the result only as functional preview
evidence. A pass proves that the observed API and one warmed Worker completed
this run; it does **not** prove high availability,
multi-instance leasing, durable worker uptime, managed backup/PITR, provider
retention, rollback, incident recovery, or any production-shaped gate. Record
all of those as `not_run`, never `PASS`, until tested on qualifying topology.

## Guarded migration

Before migrations, inspect the actual database identity and set the marker
through the managed PostgreSQL console using the exact staging database name:

```sql
SELECT current_database();
COMMENT ON DATABASE trevv_staging IS 'trevv:environment=staging';
```

The migrate image is staging-only and fail-closed. Put these values in the
mode-0600 operator environment file, not the command line, chat, Git, or logs:

```text
TREV_RUNTIME_ENVIRONMENT=staging
NODE_ENV=production
DATABASE_URL=<verified-external-url-with-exactly-one-sslmode=verify-full>
RELEASE_ID=<release-manifest-release-id>
TREV_STAGING_MIGRATION_CONFIRM=migrate:<actual-database-name>:<release-id>:<release-manifest-migration-head>
```

The confirmation binds the server-read database name to the reviewed release
and the migration head packaged inside the immutable migrate image. A wrong or
unmarked database, production-looking database name, wrong runtime, TLS
downgrade, malformed release, or stale confirmation is rejected before the
migration journal or application schema can be created. Never bypass this by
running `packages/db/dist/migrate.js` directly.

Run the immutable `trevv-migrate@sha256:...` image exactly as documented in
`deploy/render/README.md`. Record a successful `"status":"migrated"` run and a
second `"status":"no_op"` run for the same database and release cohort before
starting the API.

The CA is public certificate material, but both published images run as an
unprivileged user. Keep its parent directory private and set only the reviewed
CA file to mode `0444` or `0644` before the read-only bind mount. Keep every
environment file mode `0600`. Stop if the container cannot read the CA; never
make the environment file or database credentials world-readable.

## Initial owner on an empty staging database

The initial-owner command is not an HTTP endpoint. It runs the existing auth
and transactional onboarding primitives inside a one-off API-image process.
Onboarding creates the organization-owner audit and outbox records. The command
refuses to run unless all of these remain true while a PostgreSQL advisory lock
is held:

- `TREV_RUNTIME_ENVIRONMENT=staging` and `NODE_ENV=production`;
- live mode, invite-only registration, production-safe PostgreSQL TLS, SMTP,
  rate limiting, origins, secrets, and immutable release metadata all validate;
- the actual database name contains a `staging` segment;
- the database has the exact persistent comment
  `trevv:environment=staging`;
- every base table in `public` is empty; and
- the operator confirmation binds the actual database name to the normalized
  owner email.

Configure these one-off secrets in the platform secret store, never in the
command line, chat, Git, or logs:

```text
TREV_RUNTIME_ENVIRONMENT=staging
TREV_BOOTSTRAP_OWNER_NAME=<fictional-staging-owner-name>
TREV_BOOTSTRAP_OWNER_EMAIL=<controlled-staging-mailbox>
TREV_BOOTSTRAP_OWNER_PASSWORD=<unique-secret>
TREV_BOOTSTRAP_ORGANIZATION_NAME=<explicitly-fictional-name>
TREV_BOOTSTRAP_ORGANIZATION_SLUG=<slug>
TREV_BOOTSTRAP_WORKSPACE_NAME=<explicitly-fictional-name>
TREV_BOOTSTRAP_WORKSPACE_SLUG=<slug>
TREV_BOOTSTRAP_WORKSPACE_TYPE=business
TREV_BOOTSTRAP_WORKSPACE_COLOR=#315c75
TREV_BOOTSTRAP_BLUEPRINT_KEY=blank
TREV_STAGING_BOOTSTRAP_CONFIRM=bootstrap:<actual-database-name>:<normalized-owner-email>
```

Run the bootstrap once from the exact approved API image with a mode-0600 local
environment file containing the same runtime variables as the deployed API plus
the bootstrap values above. Mount the reviewed database CA read-only. The
published cohort is `linux/amd64`, so the platform must be explicit on this
arm64 operator host:

```sh
docker run --rm \
  --platform linux/amd64 \
  --env-file /secure/trevv-render-bootstrap.env \
  -e NODE_EXTRA_CA_CERTS=/run/trevv/db-ca.pem \
  --mount type=bind,src=/secure/render-db-ca.pem,dst=/run/trevv/db-ca.pem,readonly \
  --entrypoint node \
  ghcr.io/<owner>/trevv-api@sha256:<approved-api-digest> \
  apps/api/dist/staging-bootstrap.js
```

Before adding any database credential, preflight both approved images with the
digest-pinned `node --version` commands in `deploy/render/README.md` and verify
amd64 emulation. Never run bootstrap through a temporary mutable Render service.

Success prints only non-secret resource IDs and release identity. It never
prints the password or verification token. A partial failure may leave an auth
record, after which the empty-database guard deliberately blocks retry. For the
first staging baseline, discard and recreate that empty staging database; do
not delete selected rows to bypass the guard.

## Public trusted-TLS smoke

Run the smoke from an approved runner using the public staging origin. It does
not use a database connection, private endpoint, file mail sink, or test
registration header. The `$0` Worker is necessarily a separate public sleeping
Web service; its origin must use trusted HTTPS, contain no credentials, and
differ from the Web origin. The smoke wakes `/readyz` and verifies the Worker's
full Git SHA and immutable image ID before any collaboration write. It then
verifies release correlation, security headers,
anonymous route protection, invite-only admission, a real owner sign-in,
Workspace access, atomic Team/room creation, message write/read, public
operations-status outbox drain, authenticated SMTP submission recorded as sent,
invitation revocation, and sign-out invalidation. "Sent" proves only that SMTP
submission was accepted; it does not prove recipient-inbox delivery. The Team
and message remain as clearly labeled fictional records containing the emitted
`runId`; the invitation is revoked.

```sh
REMOTE_STAGING_ORIGIN=https://trevv-free-preview-web-zaman365.onrender.com \
REMOTE_STAGING_WORKER_ORIGIN=https://trevv-free-preview-worker-zaman365.onrender.com \
REMOTE_STAGING_CONFIRM='smoke:trevv-free-preview-web-zaman365.onrender.com:<release-id>' \
REMOTE_STAGING_OWNER_EMAIL=<controlled-staging-mailbox> \
REMOTE_STAGING_OWNER_PASSWORD=<secret-from-approved-store> \
REMOTE_STAGING_INVITEE_EMAIL_TEMPLATE='trevv-smoke+{run}@<controlled-test-domain>' \
REMOTE_STAGING_EXPECT_CSP=report-only \
REMOTE_STAGING_EXPECT_HSTS=false \
EXPECTED_RELEASE_ID=<release-id> \
EXPECTED_RELEASE_GIT_SHA=<full-40-character-sha> \
EXPECTED_WEB_IMAGE_ID=sha256:<64-hex> \
EXPECTED_API_IMAGE_ID=sha256:<64-hex> \
EXPECTED_WORKER_IMAGE_ID=sha256:<64-hex> \
pnpm smoke:remote-staging
```

The command refuses loopback/non-HTTPS/credential-bearing origins, a Worker
origin shared with Web, mutable image IDs, disabled TLS certificate verification,
a non-invite-only runtime, an existing worker failure, a Worker that cannot be
warmed, or an outbox that does not drain and advance within the bounded polling
window. A warmed Worker pass applies only to that run and does not establish
durable Worker availability.

## First full-topology manifest

Only the first complete remote-staging cohort may declare genesis, and its ID
must begin with `rehearsal-baseline-`. Genesis explicitly records that no prior
full-topology cohort exists; it cannot contain a previous manifest/release or
migration head, and the production validator always rejects it.

```sh
REHEARSAL_GENESIS=true \
REHEARSAL_RELEASE_ID=rehearsal-baseline-<unique-id> \
REHEARSAL_CREATED_AT=<UTC-ISO-timestamp> \
REHEARSAL_GIT_SHA=<full-40-character-sha> \
TREV_WEB_IMAGE_ID=sha256:<64-hex> \
TREV_API_IMAGE_ID=sha256:<64-hex> \
TREV_WORKER_IMAGE_ID=sha256:<64-hex> \
TREV_MIGRATE_IMAGE_ID=sha256:<64-hex> \
pnpm release:rehearsal-input > /secure/path/baseline-a-input.json

node scripts/phase6-release-manifest.mjs generate \
  --input /secure/path/baseline-a-input.json \
  --output /secure/path/baseline-a-manifest.json
```

The next candidate must use the normal path and reference baseline A by exact
release ID, migration head, immutable manifest bytes, and digest. Never
self-reference or synthesize a predecessor. The checked-in `Publish staging
images` workflow is intentionally restricted to baseline A and requires the
literal dispatch confirmation `create-first-disposable-preview-genesis`; it
must not be reused for the next candidate. Implement and review an
authenticated predecessor-input publication path before any second cohort.
