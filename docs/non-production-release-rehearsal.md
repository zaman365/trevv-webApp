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

The authoritative production procedure and evidence requirements remain in `docs/ga-release-runbook.md`; this document only makes the non-production execution path concrete.
