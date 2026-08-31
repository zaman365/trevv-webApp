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

The intended invite-only alpha Web origin is exactly
`https://alpha.trevv.de`. The API and Worker remain at
`https://trevv-free-preview-api-zaman365.onrender.com` and
`https://trevv-free-preview-worker-zaman365.onrender.com`; this rollout does not
move or expose them under `trevv.de`. It uses one custom domain included with
the current Render Hobby workspace, introduces no paid resource, and keeps the
current cost at `$0`. All records must remain explicitly fictional, public
registration stays closed, and neither the alpha hostname nor a passing smoke
is production, public-beta, or GA evidence.

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
`deploy/render/README.md`. For an empty genesis database, record a successful
`"status":"migrated"` run and then `"status":"no_op"`. For a successor whose
authenticated predecessor has the same migration head and tree, require two
`"status":"no_op"` runs, zero applied migrations, and a stable migration count;
stop if that successor run reports a migration. Complete the applicable two-run
check for the same database and release cohort before starting the API.

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
`X-Forwarded-For` values directly to the fixed API origin. It accepts only the
normal JSON `403 REGISTRATION_INVITATION_REQUIRED` response or Cloudflare's
exact fail-closed `403` signature with a valid `CF-Ray`, `Server: cloudflare`,
and no auth cookie. The Cloudflare body must be either plain text
`error code: 1000` or structured JSON that identifies error 1000 as `dns_loop`,
marks it non-retryable and Cloudflare-originated, and binds `ray_id` to the
`CF-Ray` hex prefix. A Cloudflare response proves the spoof was rejected before
the API, not that the edge overwrote it. Every accepted result proves the
deployed edge/API combination did not bypass invite-only admission for that
request. It does not establish continuous edge enforcement or representative
per-client rate limiting.

```sh
REMOTE_STAGING_ORIGIN=https://alpha.trevv.de \
REMOTE_STAGING_WORKER_ORIGIN=https://trevv-free-preview-worker-zaman365.onrender.com \
REMOTE_STAGING_CONFIRM='smoke:alpha.trevv.de:<release-id>' \
REMOTE_STAGING_OWNER_EMAIL=<controlled-staging-mailbox> \
REMOTE_STAGING_OWNER_PASSWORD=<secret-from-approved-store> \
REMOTE_STAGING_INVITEE_EMAIL_TEMPLATE='trevv-smoke+{run}@<controlled-test-domain>' \
REMOTE_STAGING_EXPECT_CSP=report-only \
REMOTE_STAGING_EXPECT_HSTS=false \
REMOTE_STAGING_RETIREMENT_MODE=<transition-or-enforced> \
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
warmed, or immediate outbox events that do not drain to the expected
scheduled-retention baseline and advance processing within the bounded polling
window. A warmed Worker pass applies only to that run and does not establish
durable Worker availability.

The collaboration drain window is fixed at 90 seconds for the disposable
Render Free preview. This accommodates several 15-second public-request bounds
and the configured five-second processing and 30-second telemetry cycles
without weakening the gate.
`pendingOutbox` includes delayed work: sending the smoke's one message creates
exactly one `message.retention_due` event whose `availableAt` is the message's
future expiry, so that event must remain pending after the immediate Team and
message events are processed.

Immediately before the writes, the smoke captures both the authenticated
organization operations status and the public Worker `/metrics.json` snapshot.
It proceeds only when this disposable environment is isolated: the API pending
count equals the Worker's global delayed count; ready, leased, paused,
unsupported, dead-lettered, and currently leased-attempt counts are zero; and
the Worker is ready, enabled, and not stopping. After the writes, one observation
must satisfy all of these exact conditions at once:

- API `pendingOutbox` is the baseline plus one, `failedCount` is zero, and
  `lastProcessedAt` advanced;
- successful Worker attempts are the baseline plus two, for the immediate Team
  and message events;
- delayed Worker events are the baseline plus one, for message retention;
- ready, leased, paused, unsupported, dead-lettered, and currently leased
  attempt counts are zero;
- failed/dead-lettered attempt counts and `lastFailedSweepAt` did not change;
  and
- both `lastSuccessfulSweepAt` and the queue `observedAt` advanced.

These global exact deltas are appropriate only for this fictional,
single-operator, single-tenant disposable preview. Do not run another writer or
smoke concurrently. Observable overshoot or drift fails the gate rather than
being ignored or absorbed into a tolerance. Because the metrics are aggregate,
precisely compensating concurrent changes could theoretically mask activity;
the quiet single-writer window is therefore a required precondition. This is
functional evidence for one isolated run, not event-correlation or production
concurrency evidence.

A timeout reports only poll counts, baseline/expected/observed queue counts,
attempt-count deltas, and whether timestamps advanced; it does not print tenant
IDs, record IDs, timestamp values, or content. Do not keep extending or blindly
retrying a failure: stop other writers, then inspect the sanitized Worker
sweep/queue logs and operations-status counts before one quiet rerun.

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

For the first origin transition only, attach `alpha.trevv.de` to the Render Web
service and make its DNS resolve to the currently deployed predecessor before
dispatch. Keep the Render Web `onrender.com` subdomain enabled. The publisher
fetches Web readiness from `https://alpha.trevv.de/api/web/readyz` without
following redirects, while API and Worker readiness stay on their existing
`onrender.com` origins. It accepts the legacy Web build origin only for the one
exact deployed predecessor—release `rehearsal-candidate-33337660293-1`, Git SHA
`a77a78b83d765a70c12f6cfb35017485c175e32c`, workflow run `33337660293`
attempt `1`, artifact `9739632252`. Every other predecessor must have been
built for `https://alpha.trevv.de`.

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
  -f public_origin=https://alpha.trevv.de \
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

## First alpha cutover and exact rollback

Build the candidate with `NEXT_PUBLIC_APP_URL=https://alpha.trevv.de`.
`AUTH_COOKIE_PREFIX` is a runtime-only setting, not image provenance: configure
both Web and API with `AUTH_COOKIE_PREFIX=trevv_alpha`, and configure the API
with `WEB_ORIGIN=https://alpha.trevv.de`; keep
`AUTH_COOKIE_DOMAIN` absent on both services. `BETTER_AUTH_URL`, `API_ORIGIN`,
and the API and Worker public origins remain unchanged. Keep
`trevv-free-preview-web-zaman365.onrender.com` enabled until the alpha smoke has
passed against the exact candidate cohort with
`REMOTE_STAGING_RETIREMENT_MODE=transition`. Then disable that Render Web
subdomain and run the complete smoke again with
`REMOTE_STAGING_RETIREMENT_MODE=enforced`; only the second pass establishes the
final retired-origin state.

If the first alpha cutover must be rolled back, treat Web, API, and Worker as
one cohort and perform all of these steps:

1. Stop candidate writes if integrity is uncertain and drain or safely expire
   candidate Worker leases.
2. Re-enable the Render Web `onrender.com` subdomain and confirm that its TLS
   route reaches the service. Do not run state-changing smoke against the
   candidate through this rollback origin.
3. Withdraw the `alpha.trevv.de` DNS/custom-domain route so incompatible alpha
   traffic fails closed during the cohort restore.
4. Restore the exact predecessor Web, API, and Worker images together with its
   complete release environment (`RELEASE_ID`, `RELEASE_GIT_SHA`, and each
   service's matching immutable `RELEASE_IMAGE_ID`). Restore API `WEB_ORIGIN`
   and Web `NEXT_PUBLIC_APP_URL` to
   `https://trevv-free-preview-web-zaman365.onrender.com`; restore
   `AUTH_COOKIE_PREFIX=trevv` on both services and keep `AUTH_COOKIE_DOMAIN`
   absent. Do not run a down migration.
5. Verify the predecessor readiness identity and authenticated smoke on the
   Render origin, then reconcile accepted writes and outbox state.

Host-only cookies and the distinct alpha cookie prefix deliberately do not
carry sessions across this boundary; evaluators must sign in again after either
cutover or rollback. This procedure is for the disposable fictional-data alpha
only and does not satisfy the production rollback gate.
