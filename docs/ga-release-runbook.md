# GA migration, deployment, rollback, and recovery runbook

Status: **design only — never exercised against production**

This runbook defines the exact decision order. Provider-specific deployment and
backup commands cannot be truthfully supplied until infrastructure is selected;
the approved command transcript, provider identifiers, and immutable output
must be attached to the change ticket before authorization.

## Hard stops

Do not begin a production change when any of the following is true:

- `phase6-readiness authorize` or `phase6-claims authorize` exits non-zero;
- the candidate Git worktree contains tracked changes or untracked build inputs;
- the manifest is missing or does not match all four promoted image digests;
- authorization is `not_authorized`;
- any evidence URI/digest has not been independently retrieved and verified as
  completed `PASS` evidence for the same release ID;
- the completed authorization record is absent, does not bind the exact
  manifest/scope digests, or has any required confirmation left false;
- the previous release manifest or images cannot be retrieved by digest;
- the latest managed recovery point is older than 15 minutes;
- the isolated restore drill did not meet RPO/RTO and reconciliation targets;
- a migration is destructive, rewrites an applied migration, or is not
  compatible with the immediately previous API and worker;
- the release controller cannot atomically close registration across every
  previous and candidate API instance, or cannot prove that headerless signup
  is rejected while registration is closed;
- the immediate previous and candidate Web/API pairs have not passed an actual
  cross-version readiness rehearsal; this candidate is a compatibility
  boundary and must not be deployed as a mixed Web/API cohort;
- any critical/high security finding is open;
- an incident commander, operations lead, security lead, communications owner,
  and rollback operator are not named for the window;
- privacy, billing, provider, support, or legal scope in the manifest differs
  from the reviewed evidence.

## Immutable inputs

Before the change window, record:

1. current and candidate release IDs;
2. full Git SHA;
3. Web, API, Worker, and migration image digests;
4. current and candidate migration heads;
5. OpenAPI SHA-256;
6. Node and pnpm versions;
7. build-time CSP/HSTS and runtime demo/registration/rate-limit/error-reporting
   modes; registration must be `invite_only` or deliberately `closed`, never
   `public`, for the current release;
8. previous release manifest digest;
9. links to CI, deployment rehearsal, migration, rollback rehearsal, restore,
   incident, security, availability, performance, accessibility, privacy,
   billing, provider-scope, support, legal, product-metrics, and claims
   evidence, each bound to its content SHA-256;
10. explicit production approver, timestamp, change ticket, and the SHA-256 of
    the canonical release scope: release ID, Git SHA, service images, migration
    and contract state, runtimes, security modes, previous release, and every
    evidence URI/content digest. Mutable authorization fields and manifest
    integrity are excluded from that scope digest.

Every packaged Web, API, and Worker process must receive `RELEASE_ID`,
`RELEASE_GIT_SHA`, and `RELEASE_IMAGE_ID` from the deployment controller. The
release ID uses the manifest's canonical lowercase 8-128 character policy
(`^[a-z0-9][a-z0-9._+-]{7,127}$`). The Git value is the full 40-character
commit SHA. The image value is the actual
immutable OCI digest or, for the local Docker topology, Docker's immutable
`sha256:` image ID obtained after the image is built; a tag is never accepted.
Production configuration rejects missing, partial, abbreviated, or malformed
metadata. `RELEASE_METADATA_REQUIRED=true` applies the same fail-closed rule to
production-shaped test transports.

API readiness reports its packaged identity. Worker liveness, readiness, and
startup logs report the Worker identity. Web readiness reports both the Web
identity and the identity returned by its current API upstream. The immediate
previous API does not expose the candidate readiness schema and does not
enforce invite-only registration. This release is therefore a coordinated
blue/green compatibility boundary: an old Web must stay paired with an old API,
a candidate Web must stay paired with a candidate API, and signup stays closed
at the trusted edge until no old API can receive it. The candidate
topology/final promotion smoke must compare every instance with the manifest
and prove that the completed cohort has the expected release ID, Git SHA, and
service-specific image digest.

Copy `release/release-manifest-input.template.json` to a change-specific path
outside the repository, replace every placeholder, and generate once:

```bash
node scripts/phase6-release-manifest.mjs generate \
  --input /approved/change/manifest-input.json \
  --output /approved/change/release-manifest.json
```

Generation uses exclusive creation and refuses both an unfilled template and a
Git worktree containing tracked changes or untracked build inputs. Store the
manifest and its printed digest in immutable release evidence. Do not regenerate
the same release ID after an artifact changes; mint a new candidate.

Manifest declarations are not self-verifying. Production validation must be
embedded in a release controller that supplies a trusted evidence verifier. It
must retrieve every immutable evidence object, hash its actual bytes, parse a
completed `PASS` record, and confirm that record's `releaseId`. The repository
CLI intentionally has no network/storage verifier and therefore cannot return
`AUTHORIZED` on its own.

A generic `PASS` object is rejected. Every record must declare schema version 1
and the exact `evidenceKind`, originate from that kind's registered template in
`release/evidence/`, and satisfy the kind-specific completion policy. Depending
on the gate, this includes exact all-true checks, empty failure/finding lists,
non-empty immutable artifacts, availability/RPO/RTO/Core Web Vitals limits,
zero critical/high security findings, legal sign-off, and approved
product-metrics thresholds.

Candidate-specific evidence is also bound to the manifest's Git SHA, image
digests, migration heads, OpenAPI digest, and security/runtime modes. Deployment
and rollback records use the canonical `artifactIdentityDigest` for these
inputs; the final manifest digest cannot be embedded in an evidence record whose
own content digest is part of that manifest without creating a circular hash.
Availability and retention percentages must reconcile with their recorded
minutes and cohort counts, and drill/review timestamps must be complete and
ordered. Claims-review evidence must bind the canonical digest of the exact
claims inventory evaluated for the release. Independent-security evidence must
bind the report URI and digest; the release verifier must retrieve and hash the
report bytes too. Any accepted medium/low finding must have a separately hashed,
owned, date-bound acceptance record whose review date has not expired.

After the candidate manifest is final, complete
`release/evidence/release-authorization.template.json`. The external
authorization verifier must independently hash that record and confirm its
schema version 1, explicit `template: false`, release ID, manifest integrity
digest, derived scope digest, approver identity, timestamp, change ticket, and
every boolean confirmation. A template, a URI, or a syntactically valid SHA
supplied in the manifest is never sufficient.

The deployment and rollback links must be completed records derived from
`release/evidence/deployment-rehearsal.template.json` and
`release/evidence/rollback-rehearsal.template.json`, not the templates
themselves.

## Stage 1 — pre-migration protection

1. Confirm no unrelated incident or maintenance is active.
2. Freeze schema-changing merges and record database write volume/outbox lag.
3. Ask the managed PostgreSQL control plane for the latest verified recovery
   point and record its provider identifier and timestamp.
4. Require recovery-point age ≤15 minutes. Create an on-demand snapshot if the
   provider cannot guarantee that age.
5. Restore that point into a new isolated database using a new endpoint. Never
   restore over production.
6. Run current migrations against the isolated restore with the dedicated
   migration identity and verified TLS.
7. Reconcile organization, membership, Workspace, WorkItem, history/evidence,
   message, audit, and outbox counts; include attachment manifests only when
   files are enabled.
8. Authenticate a test identity, load Portfolio, perform one tenant-scoped
   write, process its outbox event once, and verify an organization export.
9. Record measured RPO and RTO in
   `release/evidence/restore-drill.template.json`. Any failed check is a hard
   stop.

## Stage 2 — immediate-previous-release compatibility rehearsal

Use the exact previous manifest images—not a source approximation or an old
migration fixture.

1. Restore the populated previous-release fixture/database into isolated
   staging.
2. Start the previous API and workers by manifest digest; pass their full smoke.
3. Apply the candidate additive migrations once with the candidate migration
   image and dedicated identity.
4. Re-run migration and prove it is a no-op.
5. While the schema is at the candidate head, prove the previous API can perform
   all release-scope reads and writes and the previous worker can lease/process
   its known events.
6. Put the rehearsal edge into registration-closed mode and prove that a
   headerless signup request is rejected against every previous and candidate
   API instance. The previous API cannot enforce invite-only admission itself.
7. Start the candidate API and worker against the migrated schema and repeat
   tenant, auth, workflow, collaboration, queue, and privacy-scope smoke.
8. Start the actual previous Web against the previous API and the candidate Web
   against the candidate API. Prove both paired readiness paths. Also prove that
   each cross-version Web/API pairing fails readiness and cannot be admitted to
   a mixed traffic cohort.
9. With old API instances excluded from signup traffic, reopen `invite_only`
   only for candidate instances and prove headerless/wrong/expired/used
   invitations fail while one valid invitation succeeds exactly once.
10. Inject a migration failure before commit and prove no partial schema/data
    effect remains.
11. Record image digests, query/check output, start/end times, and failures in
    `release/evidence/migration-rehearsal.template.json`.

Do not introduce a down migration. If the previous application cannot run on
the candidate schema, the release is not rolling-rollback compatible and must
be redesigned before production.

## Stage 3 — production migration

1. Reconfirm the recovery point and that no new hard stop appeared.
2. Put provider deliveries and destructive/background handlers in their
   reviewed disabled state. Internal idempotent handlers may remain active only
   if the migration evidence explicitly covers them.
3. Run the candidate migration image once with `NODE_ENV=production`,
   `DEMO_MODE=false`, a dedicated least-privilege migration identity, verified
   database TLS, and the manifest migration head.
4. Capture start/end timestamps, migration output, database endpoint identity,
   migration identity, before/after journal head, and no-op verification.
5. Abort application promotion on any mismatch. Preserve evidence and follow
   the forward-fix path; never edit the journal or run ad hoc destructive SQL.

## Stage 4 — application deployment

This candidate requires a coordinated blue/green Web/API cutover. Do not mix
old and candidate API instances behind one Web cohort. Promote the exact
manifest digests in this order:

1. **Close signup globally:** at the trusted edge/release controller, reject
   every signup request before it reaches any API. Prove rejection against each
   old and candidate route with no trusted test header. Keep sign-in, recovery,
   and existing authenticated traffic available.
2. **Green API pool:** deploy every candidate API instance off public traffic.
   Verify liveness, database-backed readiness, release identity, auth cookie
   policy, tenant read/write, rate-limit identity, request correlation, and an
   audit/outbox row on each instance. Do not preserve an old instance inside
   this green pool.
3. **Worker canary:** deploy one candidate worker with externally acting or
   unreviewed handlers disabled. Verify release ID, lease ownership, queue age,
   retry/dead-letter metrics, graceful drain, and exactly-one acknowledgement.
4. **Worker cohort:** replace remaining workers one at a time. Verify mixed
   previous/candidate ownership before removing the last previous worker.
5. **Green Web pool:** deploy the manifest Web digest off public traffic with
   the recorded canonical URL, the green private API origin, enforcing CSP,
   reviewed HSTS, `DEMO_MODE=false`, and `REGISTRATION_MODE=invite_only`.
   Verify every green Web reports only a green API release identity. A
   cross-version readiness result is a hard stop.
6. **Paired traffic cutover:** route traffic only to aligned old-Web/old-API or
   green-Web/green-API pairs. Shift 1% → 10% → 25% → 50% → 100% to the green
   pair with a documented observation period and explicit operator approval at
   every step. Keep signup closed throughout this shift.
7. **Invite-only reopen:** after the old pair receives zero traffic and every
   old API is removed from signup routing, reopen signup only through the green
   pair. Prove headerless, wrong-email, expired, revoked, and replayed
   invitations fail and one valid invitation creates one account/claim.
8. **Public smoke:** anonymous guard, sign-in/recovery, tenant read/write,
   founder loop, Teams/Message, privacy scope, export/delete/billing/provider
   paths only when the manifest says they are enabled, CSP/error reporting,
   accessibility critical path, and status/support links.

Any error-budget burn, readiness failure, tenant leak, data mismatch, auth
regression, queue growth, or unsupported event stops progression.

The public smoke in step 6 must run against the trusted-HTTPS release host and
inspect the delivered Web document, not only configuration or manifest values.
It must find an enforcing `Content-Security-Policy`, no
`Content-Security-Policy-Report-Only`, and the reviewed
`Strict-Transport-Security` policy. The self-signed local topology deliberately
asserts the opposite build (`report-only` CSP and no HSTS) and is not evidence
that this production smoke has run.

The provider-specific command and resulting deployment revision/digest belong
in the change ticket. A generic command in this repository is not evidence that
the selected host promoted the expected artifact.

## Rollback and forward-fix decision tree

### Web-only defect

1. Stop traffic progression.
2. Restore the previous Web and immediately previous API as their rehearsed,
   aligned pair by manifest digest; a previous Web/candidate API pairing is not
   accepted for this compatibility-boundary release.
3. Keep registration globally closed because the previous API cannot enforce
   invite-only admission.
4. Leave workers and database unchanged only where the rehearsal proved that
   exact pair compatible.
5. Re-run anonymous/authenticated smoke and paired readiness before routing
   traffic.

### API or worker defect with proven schema compatibility

1. Disable the smallest affected capability or worker handler.
2. Drain candidate processes; do not terminate an active bounded pass.
3. For an API rollback, restore the previous API together with its matching
   previous Web by manifest digest and close registration globally before the
   route change. A candidate Web must not be paired with the previous API. For
   a worker-only rollback, restore only the rehearsed previous Worker image.
4. Keep the migrated database because the rehearsal proved previous binaries
   compatible with it.
5. Reconcile affected writes, audit/outbox states, idempotency results, and
   queue leases before resuming traffic.

### API or worker defect without proven compatibility

This condition should have blocked deployment. If encountered, do not guess:

1. stop traffic progression and disable affected writes/handlers;
2. keep read-only unaffected paths available only when tenant safety is proven;
3. preserve logs, audit, manifest, and database evidence;
4. ship a reviewed forward-fix image through the candidate pipeline;
5. do not down-migrate or run ad hoc schema changes.

### Suspected tenant leak, destructive corruption, or unreconcilable writes

1. Declare an incident and freeze affected writes immediately.
2. Revoke exposed sessions/credentials and disable relevant capabilities.
3. Preserve the original database for forensic work.
4. Determine the last safe recovery point and quantify expected data loss.
5. Require incident-commander, data-owner, security, and production-authorizer
   approval before PITR.
6. Restore to a new database, never over the original.
7. Apply only reviewed migrations, reconcile tenant counts and external effects,
   replay only proven idempotent events, and validate auth/export.
8. Switch application configuration to the verified replacement during a write
   freeze, then reopen gradually.

PITR is disaster recovery, not a routine deployment rollback. Its measured RPO
and RTO must be reported; neither target can be inferred from provider settings.

## Incident and customer communication

Use `release/evidence/incident-exercise.template.json`. Every release window
must name an incident commander, operations lead, security lead, customer
communications owner, and scribe. Record detection, acknowledgement,
containment, recovery, and closure times. A staffed pager and public status
destination must be tested before GA; repository alert rules alone do not count.

## Completion and evidence retention

After 100% traffic:

1. verify all services report the candidate release ID and exact image digest;
2. verify migration head, OpenAPI digest, CSP/HSTS/registration modes, queue
   health, privacy/billing/provider scope, and public claims match the manifest;
3. retain the manifest, authorization, command transcript, dashboards, queries,
   smoke results, and incident notes immutably;
4. schedule the next risk/claim review dates;
5. close the change only after the observation window passes.

Production release still requires a new, explicit authorization. Nothing in
this runbook or its templates grants it.
