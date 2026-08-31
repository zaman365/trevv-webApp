# Non-production release rehearsal

This workflow is synthetic, local/CI-only evidence. It cannot authorize a production release, replace a restore drill, or satisfy external security, legal, commercial, availability, or support gates. Production remains `NO_GO` until the release manifest's existing fail-closed checks accept separately verified evidence and explicit authorization.

## What is exercised

- `release/fixtures/synthetic-production-v0004.sql` contains two entirely fictional tenants with overlapping tenant-local names and slugs, representative founder-loop records, audit/outbox history, and collaboration data. The SQL refuses any database except `trevv_*_synthetic_rehearsal` at exactly migration 0004.
- `scripts/synthetic-migration-rehearsal.mjs` creates an isolated database, applies 0000-0004, loads the fixture, migrates 0005 through the current journal head, compares pre/post invariants, proves a second pass is a no-op, rejects a cross-tenant dependency, and destroys the database. Cleanup errors fail the run.
- `scripts/staging-upgrade-smoke.mjs` remains the deeper 0009-specific rehearsal. It verifies legacy Team/Message normalization and quarantine, then proves the over-capacity boundary aborts atomically without advancing the migration journal.
- `release/nonproduction-smoke-checklist.template.json` lists the complete candidate checks. A copy starts `NO_GO`; every required check needs an immutable evidence reference before its result can change.

Run both database rehearsals through the existing topology:

```sh
docker compose -f compose.staging.yaml --profile smoke build
docker compose -f compose.staging.yaml --profile smoke up --wait --wait-timeout 180 -d postgres
docker compose -f compose.staging.yaml --profile smoke run --rm foundation-upgrade-smoke
docker compose -f compose.staging.yaml --profile smoke run --rm upgrade-smoke
docker compose -f compose.staging.yaml --profile smoke down --volumes --remove-orphans
```

The CI topology job also injects a failure immediately after each fixture load and verifies the disposable database is absent afterward.

## Non-production manifest input

Generate candidate input only from a prior structurally valid rehearsal manifest and exact image IDs:

```sh
REHEARSAL_RELEASE_ID=rehearsal-REPLACE \
REHEARSAL_CREATED_AT=REPLACE_WITH_UTC_TIMESTAMP \
REHEARSAL_GIT_SHA=REPLACE_WITH_FULL_SHA \
REHEARSAL_PREVIOUS_MIGRATION_HEAD=REPLACE_WITH_PREVIOUS_HEAD \
REHEARSAL_PREVIOUS_RELEASE_ID=rehearsal-REPLACE_PREVIOUS \
REHEARSAL_PREVIOUS_MANIFEST_PATH=REPLACE_WITH_IMMUTABLE_PREVIOUS_MANIFEST \
TREV_WEB_IMAGE_ID=sha256:REPLACE \
TREV_API_IMAGE_ID=sha256:REPLACE \
TREV_WORKER_IMAGE_ID=sha256:REPLACE \
TREV_MIGRATE_IMAGE_ID=sha256:REPLACE \
pnpm release:rehearsal-input > /tmp/trevv-rehearsal-input.json
```

For the remote disposable preview, the checked-in publication workflow obtains
`REHEARSAL_PREVIOUS_MANIFEST_PATH`, release ID, and migration head only from the
authenticated publication that the operator identifies as currently deployed.
Dispatch supplies its GitHub artifact ID, GitHub-reported ZIP digest, and the
SHA-256 of the exact manifest file bytes. Do not substitute
`integrity.payloadSha256`: the lineage digest is over the complete stored file,
including its trailing newline. The explicit confirmation begins with
`publish-successor-from-deployed:`. The workflow does not select the latest
successful publication because a published cohort may never have been deployed.
Instead, it compares the selected release ID, Git SHA, and Web/API/Worker image
IDs with the three fixed public Render readiness endpoints without following
redirects. Those values are service-reported configuration, not independent
proof of Render's active OCI digest; authenticated Render state must separately
confirm each current image reference before dispatch. The workflow also verifies
the successful predecessor run, both provenance bundles, exact artifact
inventory, image/manifest binding, anonymous availability of every predecessor
image digest, and Git ancestry before it creates a successor manifest.

For the invite-only `$0` alpha, the fixed Web readiness origin is
`https://alpha.trevv.de`; API and Worker readiness remain on their existing
`trevv-free-preview-api-zaman365.onrender.com` and
`trevv-free-preview-worker-zaman365.onrender.com` origins. The first transition
accepts the old Web build origin only for release
`rehearsal-candidate-33337660293-1`, Git SHA
`a77a78b83d765a70c12f6cfb35017485c175e32c`, workflow run `33337660293`
attempt `1`, and artifact `9739632252`. Every other predecessor must bind its
Web build to `https://alpha.trevv.de`. This exception authenticates lineage; it
does not promote the disposable fictional-data preview to production, public
beta, or GA evidence.

The publisher separately reports that it has not verified PostgreSQL state. For
this iteration it rejects every migration change: the current checked-in journal
head and recursive `packages/db/migrations` Git tree must equal the deployed
publication. A guarded migration rehearsal must still authenticate the database
journal before cutover. Supporting a future changed migration tree requires
reviewed deployed-database evidence rather than treating publication metadata
as database proof.

The generator deliberately emits report-only CSP, no HSTS, disabled external error reporting, no evidence links, and `not_authorized`. It accepts only a `rehearsal-*` release ID. The normal release-manifest validator therefore accepts its non-production shape while continuing to reject it for production.

## Aligned rollback and forward-fix procedure

Web, API, worker, and migrate are one release cohort. Never roll back just the Web client or mix an API/worker image from another manifest.

| Failure point                             | Required action                                                                                                                   | Database action                                                                                           |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Before migration                          | Stop promotion; keep the previous Web/API/worker cohort                                                                           | None                                                                                                      |
| Migration fails atomically                | Stop promotion; retain previous cohort                                                                                            | No down migration; inspect and ship a reviewed forward fix                                                |
| Migration succeeds, candidate not exposed | Run previous-cohort compatibility smoke against the migrated schema                                                               | Keep schema only if compatibility was pre-proven; otherwise forward-fix                                   |
| Candidate exposed, app regression         | Disable writes if integrity is uncertain, drain candidate workers, then restore the exact previous Web/API/worker cohort together | Keep migrated schema only with direct compatibility evidence                                              |
| Data corruption                           | Declare an incident and stop writes                                                                                               | Use PITR/restore only under an explicit, rehearsed recovery decision; reconcile accepted writes afterward |

For every cohort rollback:

1. Record the release ID, Git SHA, four image IDs, migration head, and incident/change reference.
2. Stop new candidate worker leases and wait for or safely expire existing leases.
3. Prove the exact previous API and worker images can read/write the current schema in an isolated clone.
4. Roll API and worker together, then Web; verify `/readyz` identity for every service.
5. Smoke authentication, tenant isolation, the founder loop, Team room/message delivery, outbox processing, privacy lifecycle, and service-worker logout safety.
6. Reconcile queue age, dead letters, duplicate effects, and writes accepted during the transition.
7. Prefer a reviewed additive forward fix when compatibility is unproven. Never improvise a down migration.

The first alpha-origin rollback has an additional exact boundary: stop writes,
re-enable the Render Web subdomain, withdraw the alpha DNS/custom-domain route
so incompatible traffic fails closed, then restore the predecessor images and
complete release environment. Restore API `WEB_ORIGIN` and Web
`NEXT_PUBLIC_APP_URL` to
`https://trevv-free-preview-web-zaman365.onrender.com`, restore
`AUTH_COOKIE_PREFIX=trevv` on API and Web with no `AUTH_COOKIE_DOMAIN`, and
verify the predecessor there. The full ordered procedure is in
`deploy/staging/remote-operations.md`.

The authoritative production procedure and evidence requirements remain in `docs/ga-release-runbook.md`; this document only makes the non-production execution path concrete.
