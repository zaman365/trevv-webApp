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

The smoke also sends invalid caller-supplied `CF-Connecting-IP` and
`X-Forwarded-For` values directly to the fixed API origin. It requires the
normal invite-only `403 REGISTRATION_INVITATION_REQUIRED` response and no auth
cookie. This proves that the deployed edge/API combination neither became
unavailable nor bypassed invite-only admission for that spoof attempt. It does
not independently prove the configured trusted-header name, continuous edge
enforcement, or representative per-client rate limiting.

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

## Successor publication and release lineage

The first complete remote-staging cohort is the only genesis. The checked-in
`Publish staging images` workflow now refuses to create another baseline and
publishes only a successor of the cohort whose readiness identity matches the
selected publication and whose Render image state the operator separately
verified.

Before dispatch, retain the currently deployed publication ZIP without
extracting or rewriting it and record all three identities:

1. the GitHub artifact ID;
2. GitHub's `sha256:` digest of the exact artifact ZIP; and
3. the `sha256:` digest of the exact
   `staging-release-manifest.json` file bytes, including its trailing newline.

The third value is not the manifest's internal
`integrity.payloadSha256`. Hash the downloaded file itself. The workflow uses
the artifact ID to authenticate the successful predecessor workflow run and
requires the supplied ZIP digest, exact five-file inventory, both GitHub
provenance bundles, a structurally valid non-production manifest, matching
image evidence, and Git ancestry. It does not equate the latest successful
publication with the deployed cohort. The fixed public Web, API, and Worker
readiness endpoints must all report the selected manifest's release ID, Git
SHA, and service image IDs without a redirect. These values are service-reported
runtime configuration, not independent proof of Render's active OCI digest.
Before dispatch, compare the current image reference for each service with the
manifest through authenticated Render state and stop on any mismatch.

This publisher accepts only a candidate with the same checked-in migration
journal head and the same recursive `packages/db/migrations` Git tree as the
deployed publication. It emits no claim about the live database journal; the
guarded migration rehearsal is separate evidence. Stop and design a reviewed
deployed-database evidence path before publishing a candidate that changes any
migration file or metadata.

After the candidate is the exact successful `trevv-foundation` CI head,
dispatch with:

```sh
candidate_sha=<full-40-character-candidate-sha>
previous_artifact_id=<deployed-predecessor-artifact-id>
previous_artifact_sha256=sha256:<artifact-zip-64-hex>
previous_manifest_sha256=sha256:<manifest-file-64-hex>

gh workflow run publish-staging-images.yml \
  --ref trevv-foundation \
  -f source_sha="$candidate_sha" \
  -f public_origin=https://trevv-free-preview-web-zaman365.onrender.com \
  -f csp_mode=report-only \
  -f hsts_enabled=false \
  -f previous_artifact_id="$previous_artifact_id" \
  -f previous_artifact_sha256="$previous_artifact_sha256" \
  -f previous_manifest_sha256="$previous_manifest_sha256" \
  -f successor_confirmation="publish-successor-from-deployed:${candidate_sha}:${previous_manifest_sha256}"
```

The resulting release ID begins with `rehearsal-candidate-`. Its
`previousRelease.releaseId`, raw manifest digest, and
`database.previousReleaseMigrationHead` are derived from the authenticated
predecessor instead of dispatch text. Never self-reference, synthesize a
predecessor, select a publication whose readiness identity is not currently
deployed, or regenerate a release ID.
