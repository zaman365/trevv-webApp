# Render $0 disposable preview

This directory describes the largest truthful TREVV preview that currently
fits Render's Free compute plans. It is configuration only: nothing here
creates resources, changes DNS, stores credentials, or authorizes spending.

The preview contains exactly:

- one Free public Web service at `alpha.trevv.de` (with its Render subdomain
  retained only during the bounded first-cutover transition);
- one Free public API web service at
  `trevv-free-preview-api-zaman365.onrender.com`;
- one Free public web service running the Worker health process at
  `trevv-free-preview-worker-zaman365.onrender.com`; and
- one Free PostgreSQL 17 database in Frankfurt.

Every resource in the materialized Blueprint must say `plan: free`. There are
no private services, Render background workers, cron jobs, one-off jobs,
persistent disks, scaled replicas, protected environments, or auxiliary TLS
edge. The Worker image runs as a web service only to support bounded preview
smoke; that does not turn it into a supported always-on Worker topology.

## Classification and hard limits

This is an **internal, disposable, fictional-data preview**. It is not
production-shaped staging, closed-alpha evidence, a backup rehearsal target,
or a Phase 4/5/6/GA gate. Never put customer, pilot, production, or otherwise
irreplaceable data in it.

Current Render Free limitations materially affect TREVV:

- each web service has one 0.1 CPU/512 MB instance and spins down after 15
  idle minutes; a cold start takes about one minute;
- the workspace receives 750 aggregate Free web-service hours per month, so
  three continuously active services cannot remain available all month;
- a Free service can be restarted or suspended and has an ephemeral local
  filesystem;
- Free web services cannot scale, receive private-network traffic, run one-off
  jobs, provide shell access, or provide a Free background-worker/private-
  service plan;
- the Free database is one instance, 1 GB, expires after 30 days, and is
  deleted after the documented grace period unless upgraded;
- Free PostgreSQL has no Render backup, PITR, managed logical export, managed
  connection pool, HA, retention guarantee, or recovery SLA; and
- outbound SMTP ports 25, 465, and 587 are blocked on Free web services.

The Worker process is deployed as the third public web service, but Render
spins it down after 15 minutes without inbound HTTP/WebSocket traffic even
while it polls PostgreSQL. A bounded smoke may wake `/readyz`, wait for its
exact release metadata and readiness, then create asynchronous work. Outside
that window, outbox processing, scheduled Attention sweeps, notifications, and
retries can pause indefinitely. Do not keep it awake with artificial probes.
This proves only one awake preview run, not availability, scheduling, lease
recovery, durability, or production Worker behavior.

The Worker's `onrender.com` origin and `/livez`, `/readyz`, `/metrics`, and
`/metrics.json` endpoints are public because Free services cannot receive
private traffic. They expose queue, failure, handler, Worker, and release state
without authentication. They are intended to exclude payloads, but this public
telemetry remains an accepted preview-only risk. Inbound probes can also wake
the service and consume shared Free hours. This is never private-telemetry or
security evidence, and the topology must never hold real user data.

The API is publicly reachable through Render's managed TLS and is not private.
Its `/internal/metrics` endpoint is disabled in production and the remote smoke
requires a 404. `/internal/livez` remains public with only the exact service and
status fields; a probe can still wake the API and consume Free hours. This is
liveness-only preview behavior, not private-metrics or availability evidence.
Render supervises the Web process through the content-free, process-local
`/api/web/livez` endpoint so a sleeping API or database cannot keep the Web on
Render's wake-up interstitial. Dependency-aware admission remains separate at
`/api/web/readyz`; release smoke and routing decisions must continue to require
that endpoint. The public liveness endpoint can wake the Free Web service and
therefore consumes shared Free hours, but exposes only fixed service/status
fields and never tenant, release, configuration, API, or database state.
The Web is exposed only at the single reviewed custom domain
`https://alpha.trevv.de`; its retired Render subdomain is disabled. A stale
parent-domain `trevv.session_token` can therefore reach the alpha host, which
is why the isolated `trevv_alpha` namespace below is a hard runtime and smoke
gate rather than an optional convention. API and Worker remain on their exact
Render origins.
[Render documents](https://render.com/articles/host-pocketbase-on-render) that
its Cloudflare edge overwrites `CF-Connecting-IP` with one validated client
address, so the preview configures that header as its trusted limiter identity.
`X-Forwarded-For` is intentionally not trusted because Cloudflare appends to a
caller-supplied chain, which makes its leftmost value spoofable. The Web proxy
strips every caller-supplied network-identity header before making its
independent outbound request. As a result, API calls through Web intentionally
share the Web service's egress identity and rate-limit bucket in this preview.
This is safe but not representative per-client rate-limit evidence. The
bounded preview smoke sends invalid caller-supplied `CF-Connecting-IP` and
`X-Forwarded-For` values directly to the API. It accepts only the normal JSON
invite-only rejection or Cloudflare's exact fail-closed `403` signature with a
valid `CF-Ray`, `Server: cloudflare`, and no auth cookie. Cloudflare currently
returns either plain text `error code: 1000` or structured JSON that identifies
error 1000 as `dns_loop`, marks it non-retryable and Cloudflare-originated, and
binds its `ray_id` to the `CF-Ray` hex prefix. These Cloudflare responses prove
the spoof was rejected before the API, not that the header was overwritten.
Every accepted result proves the deployed edge/API combination did not bypass
invite-only admission for that request; it does not independently prove
continuous edge enforcement or representative per-client rate-limit behavior.

`AUTH_COOKIE_DOMAIN` is deliberately absent. Authentication responses pass
through the same-origin Web API boundary, so the browser stores a host-only
cookie for the Web origin and the Web forwards it server-side to API. The API
and Web both require `AUTH_COOKIE_PREFIX=trevv_alpha` for
`https://alpha.trevv.de`; this isolates alpha from stale `trevv.session_token`
cookies that may have been issued by an earlier parent-domain deployment. The
smoke rejects any session cookie carrying a `Domain` attribute and verifies the
isolated `__Secure-trevv_alpha.session_token` namespace.

## $0 is an account-level gate too

`plan: free` prevents this Blueprint from selecting billable compute, but a
repository file cannot enforce Render workspace billing. Before any sync, the
human owner must verify in Render that:

1. no paid resource, add-on, protected-environment feature, or extra domain is
   selected;
2. API and Worker use only their included Render subdomains, while Web uses
   only the reviewed `alpha.trevv.de` custom domain;
3. the workspace has no payment method that can incur overage, or has an
   effective $0 spend limit; and
4. current Free hours, bandwidth, and build/pipeline allowances are available.

Render currently includes two custom domains with a Hobby workspace, and this
topology consumes exactly one at $0. That is an account-state fact, not a
guarantee made by this repository: abort if the Dashboard presents an upgrade,
paid certificate, billable add-on, or any charge for `alpha.trevv.de`.

If Render cannot guarantee suspension instead of billing for the selected
account configuration, do not provision. Usage exhaustion, suspension, cold
starts, and database expiry are expected preview outcomes, not incidents.

## Immutable artifacts

The approved release manifest remains the source of four independent digests:
Web, API, Worker, and Migrate. The Blueprint deploys the Web, API, and Worker
digests. It records the Migrate digest in a comment so the reviewed cohort
remains visible, but it does not create a Render resource from it.

The source repository and these four GHCR packages are public. Make each new
package public after its first successful scan and before Blueprint sync; the
template intentionally contains no registry credential. If a package cannot
be read anonymously, stop instead of creating a broad or long-lived GitHub PAT
for this disposable preview.

Migrate stays distinct from API. Since Free services cannot run Render one-off
jobs, an operator runs the exact `trevv-migrate@sha256:...` image from a local
Docker host before enabling the API. There is no auxiliary edge image to
publish or record.

The first disposable-preview publication remains the only staging genesis.
The checked-in `Publish staging images` workflow now publishes successors only;
it cannot declare another baseline. Dispatch requires the currently deployed
publication's GitHub artifact ID, artifact-ZIP SHA-256, exact manifest-file
SHA-256, and a confirmation that explicitly binds those deployed manifest bytes
to the candidate Git SHA. The workflow does not assume the latest successful
publication was deployed. It authenticates the selected artifact and successful
workflow run, verifies both GitHub provenance bundles, requires the predecessor
commit to be an ancestor, and compares the selected release ID, Git SHA, and
Web/API/Worker image IDs with the three fixed public Render readiness endpoints,
without following redirects.
It also confirms that all four predecessor image digests remain anonymously
retrievable for rollback. It then generates a normal `rehearsal-candidate-*`
manifest whose `previousRelease` names and hashes those exact bytes. The raw
manifest-file digest includes its trailing newline and is distinct from the
manifest's internal `integrity.payloadSha256`.

The readiness identity is service-reported configuration; it is not independent
proof of Render's active OCI digest. Before dispatch, an operator must also use
authenticated Render state to compare each service's current image reference
with the selected manifest. Stop on any mismatch.

This successor publisher is intentionally same-migration-head-and-tree-only.
The candidate migration journal head and the recursive Git tree for
`packages/db/migrations` must both equal the selected deployed publication.
Those comparisons authenticate publication compatibility only; they do not
inspect or attest the live PostgreSQL migration journal. The guarded migration
rehearsal remains separate and must prove the database state before cutover. Any
future migration change requires a new reviewed path with explicit
deployed-database evidence.

## Database transport and migration

TREVV production runtime requires exactly one `sslmode=verify-full`. Render's
private database URL does not provide that contract, so `DATABASE_URL` is a
`sync: false` secret containing the Free database's **external** hostname and
exactly one `sslmode=verify-full`; `DATABASE_CA_CERT_B64` contains its reviewed
PEM CA chain. The API decodes that public CA into its ephemeral `/tmp` before
starting. Never use `sslmode=require`, disable certificate verification, or put
the database URL in Git.

The database Blueprint begins with `ipAllowList: []`. After resource creation,
allow only the current Render Frankfurt outbound CIDRs plus the migration
operator's temporary `/32`. These are shared egress ranges, not dedicated IPs.
Remove the operator `/32` immediately after migration or `pg_dump`.

Before any migration, use the managed PostgreSQL console to verify the actual
database name and apply the persistent staging marker:

```sql
SELECT current_database();
COMMENT ON DATABASE trevv_staging IS 'trevv:environment=staging';
```

The migration image now has a staging-only entrypoint. It refuses to run unless
`TREV_RUNTIME_ENVIRONMENT=staging`, `NODE_ENV=production`, the production TLS
contract, a manifest-compatible `RELEASE_ID`, the server-read database name and
comment, and an exact confirmation all agree. The confirmation is:

```text
TREV_STAGING_MIGRATION_CONFIRM=migrate:<actual-database-name>:<release-id>:<manifest-migration-head>
```

The migration head comes from the reviewed release manifest and must equal the
head packaged into the migrate image. Do not guess it or reuse a confirmation
from another database or release. For a new empty preview database, use a
mode-0600 local environment file and a read-only CA mount. Replace only the
placeholders locally; never paste values into chat or shell history:

The CA certificate is public material, but the unprivileged container user
must be able to read the mounted file. Keep the surrounding directory private
and make only the reviewed CA file mode `0444` or `0644`; stop if the container
cannot read it. Never relax the permissions of the environment file.

```sh
docker run --rm \
  --platform linux/amd64 \
  --env-file /secure/trevv-render-migrate.env \
  -e NODE_EXTRA_CA_CERTS=/run/trevv/db-ca.pem \
  --mount type=bind,src=/secure/render-db-ca.pem,dst=/run/trevv/db-ca.pem,readonly \
  ghcr.io/<owner>/trevv-migrate@sha256:<approved-migrate-digest>
```

The published cohort is intentionally `linux/amd64`. On an arm64 operator
host, verify emulation before supplying database credentials, then preflight
the exact images by digest:

```sh
docker run --rm --platform linux/amd64 \
  --entrypoint node \
  ghcr.io/<owner>/trevv-migrate@sha256:<approved-migrate-digest> --version
docker run --rm --platform linux/amd64 \
  --entrypoint node \
  ghcr.io/<owner>/trevv-api@sha256:<approved-api-digest> --version
```

Stop if either command cannot execute as `x86_64`; do not substitute a mutable
tag or rebuild an operator-only image locally.

The environment file contains `TREV_RUNTIME_ENVIRONMENT=staging`,
`NODE_ENV=production`, the verified `DATABASE_URL`, `RELEASE_ID`, and
`TREV_STAGING_MIGRATION_CONFIRM`. The entrypoint reads the actual database name
and persistent comment before Drizzle can create its journal or execute DDL,
and serializes guarded runs with a PostgreSQL advisory lock. On an empty
genesis database, require a `"status":"migrated"` first run followed by
`"status":"no_op"`. On a successor whose deployed predecessor already has the
same authenticated migration head and tree, require `"status":"no_op"` on both
runs with zero applied migrations and a stable migration count; a reported
`"status":"migrated"` is then a stop condition. Capture the image digest and
migration head before configuring/redeploying the API. Any
identity, marker, cohort, TLS, or confirmation failure is a stop condition; do
not fall back to the generic `packages/db/dist/migrate.js` entrypoint. For an
existing disposable preview, take a local `pg_dump` and prove a local restore
before migration; this is user-managed safety, not Render backup/PITR evidence.

## SMTP and public origins

Production-mode API startup requires authenticated TLS mail. This preview uses
Resend's Free sending tier on the dedicated `mail.trevv.de` domain with
authenticated STARTTLS at `smtp.resend.com:2587`; that alternate port avoids
Render Free's blocked ports 25, 465, and 587. The public sender is
`preview@mail.trevv.de`, the username is `resend`, and only `SMTP_PASSWORD`
remains a platform secret. This smoke proves accepted SMTP submission, not
recipient-inbox delivery. If the verified domain, Free allowance, or alternate
port becomes unavailable, the preview is blocked; do not weaken runtime
validation or use the test file sink.

Keep API and Worker on their exact checked-in `onrender.com` origins. Web is
built for `https://alpha.trevv.de`, its exact public API origin, and the
manifest's CSP/HSTS modes because those Next.js values are compiled into the
artifact. `AUTH_COOKIE_PREFIX` is intentionally runtime-only rather than a
Docker build input; API and Web must both resolve it to `trevv_alpha` before
either service is admitted. The Web Render subdomain is enabled only during
the bounded first-cutover transition and disabled after the transition smoke.

The Web image does not set `NODE_EXTRA_CA_CERTS`. Local Compose injects
`/etc/trevv-local-tls/ca.crt` only into the Web container that mounts the
self-signed local CA. Render Web uses Render-managed public TLS and must not be
configured with that nonexistent local path.

## Materialize and validate

The checked-in template contains unresolved tokens so an accidental sync
cannot deploy mutable tags. Run `Publish staging images` only from the exact
`trevv-foundation` branch commit after CI succeeds. Supply the currently
deployed predecessor artifact ID and its GitHub-reported ZIP digest, hash the
downloaded predecessor `staging-release-manifest.json` without rewriting it,
and enter the literal confirmation
`publish-successor-from-deployed:<candidate-sha>:<previous-manifest-sha256>`.
Stop if the artifact has expired, the public readiness identities do not match,
authenticated Render state does not match those identities, the migration head
or tree changed, or any value cannot be recovered from the authenticated
deployed publication. After the successor workflow succeeds, download these
four inputs from its new `staging-image-digests-*` artifact:

- `staging-release-manifest.json`;
- `staging-release-manifest.provenance.bundle.json`;
- `staging-image-digests.json`; and
- `staging-image-digests.provenance.bundle.json`.

Do not reconstruct either file by hand. The materializer validates the complete
release manifest and integrity digest, requires
`authorization.status=not_authorized`, structurally binds the publication's
source, build settings, and four image digests to that manifest, and calls
`gh attestation verify` against both downloaded local bundles. It authenticates
the release manifest itself before trusting its migration head, cohort, release
identity, contracts, or image digests. Its verification policy is fixed to
repository `zaman365/trevv-webApp`, signer workflow
`zaman365/trevv-webApp/.github/workflows/publish-staging-images.yml`, source ref
`refs/heads/trevv-foundation`, the manifest Git SHA, and GitHub-hosted runners.
There is no operator flag that weakens this policy.

Run the materializer only from a clean checkout whose `HEAD` is the manifest's
attested full Git SHA, with all downloaded evidence and output files outside
the repository. The command checks both `HEAD` and tracked, staged, and
untracked worktree state before trusting the checked-in tool or template.

The CLI refuses every alternate `--template` path; only the checked-in
`deploy/render/render.staging.template.yaml` can be materialized. After
provenance succeeds, it parses the rendered YAML and allows only the three
named Free image-backed web services and one named Free PostgreSQL 17 database.
It rejects extra resources, paid plans, mutable images,
private/background/cron/job types, disks, scaling, deploy hooks, registry
credentials, duplicate YAML keys, and unresolved tokens. It also pins the
complete shared/API/Worker/Web environment contract and the exact API/Worker
startup commands, including `DEMO_MODE=false`, invite-only registration,
host-only cookies, exact Render origins, PostgreSQL rate limiting, Resend port
2587, and the release CSP/HSTS values. The GHCR packages must be public; do not
create a Render registry credential or GitHub PAT for this preview.
Create a new mode-0600 file from the reviewed inputs:

```sh
node deploy/render/materialize-staging-blueprint.mjs \
  --manifest /secure/path/release-manifest.json \
  --manifest-provenance-bundle /secure/path/staging-release-manifest.provenance.bundle.json \
  --image-digests /secure/path/staging-image-digests.json \
  --provenance-bundle /secure/path/staging-image-digests.provenance.bundle.json \
  --registry-owner zaman365 \
  --output /tmp/trevv-render-free-preview.yaml
```

Validate before any human provisions resources:

```sh
node --test deploy/render/materialize-staging-blueprint.test.mjs
render blueprints validate /tmp/trevv-render-free-preview.yaml
pnpm exec prettier --check deploy/render/render.staging.template.yaml \
  deploy/render/README.md
```

The script enforces exactly three `type: web` services and one database, every
plan `free`, approved `@sha256:` images, and no `preDeployCommand`. Human review
must still confirm every secret is `sync: false` or generated and the rendered
environment values match the reviewed preview.

The materialized mode-0600 file is validation evidence and the exact manual
provisioning checklist; it is **not** directly deployable by Render. A Render
Blueprint can only sync a YAML file committed to a linked Git repository, and
`render blueprints validate` validates without creating resources. Do not link
the placeholder template and do not create an unreviewed generated config
commit merely to make Blueprint sync possible. Provision this disposable
preview manually in the Render Dashboard from the validated file:

1. Create exactly one PostgreSQL resource named
   `trevv-free-preview-postgres-zaman365`: Frankfurt, Free, PostgreSQL 17,
   database and user `trevv_staging`, with the external IP allowlist empty.
2. Create exactly three public image-backed Web Services named
   `trevv-free-preview-api-zaman365`,
   `trevv-free-preview-worker-zaman365`, and
   `trevv-free-preview-web-zaman365`: Frankfurt, Free, one instance, automatic
   deploys off. API and Worker retain their Render subdomains. Web may retain
   its Render subdomain only during the bounded custom-domain transition below;
   its final state has exactly `alpha.trevv.de` and the Render subdomain
   disabled.
3. Copy each exact `ghcr.io/zaman365/trevv-<service>@sha256:<digest>` image,
   health path, API/Worker command, and environment entry from the materialized
   file. Secret values remain in Render only. Do not add registry credentials;
   the approved GHCR packages must be anonymously readable.
   - Create the `trevv-free-preview-runtime` environment group with the five
     exact non-secret values in the materialized file and attach it to all
     three services.
   - Dashboard entry cannot reproduce the template's Worker `fromService`
     references. Enter `DATABASE_URL` and `DATABASE_CA_CERT_B64` as secrets on
     API, then enter the exact same two values as secrets on Worker from the
     same approved secret-store records. Do not attach either database secret
     to Web. Compare local SHA-256 fingerprints of the source values before
     and after each paste without printing or storing the values; any mismatch
     is a stop condition.
   - Generate `BETTER_AUTH_SECRET` and `RATE_LIMIT_HASH_SECRET` once as
     independent high-entropy API-only secrets. They are not shared with
     Worker or Web. `SMTP_PASSWORD` is the domain-scoped, sending-only Resend
     key and remains API-only.
4. Reject the review if the Dashboard proposes any paid plan, trial, private or
   background service, cron/job, persistent disk, scaling, custom domain other
   than the one included `alpha.trevv.de`, deploy hook, additional resource, or
   mutable image tag.
5. Before clicking the final Create/Deploy control, compare the Dashboard
   summary field-by-field with the materialized file and capture the resource
   IDs, exact image digests, and Free plan labels in the rehearsal evidence.

Manual provisioning is intentionally operator-controlled. The release manifest
and attested digest bundle authenticate the values; the Dashboard review is the
last guard against creating a different or billable topology.

The materialized Blueprint describes the final post-cutover state and therefore
requires the Web Render subdomain to be disabled. During the first cutover,
use it as the reviewed source for image and environment values but record the
single temporary deviation: keep the existing Web Render subdomain enabled
until the `transition` smoke passes. Do not apply or declare the materialized
final state until the subsequent `enforced` smoke proves retirement.

## Alpha custom-domain cutover and rollback

Render custom-domain verification and Cloudflare DNS cannot be made atomic.
Keep the existing Web Render subdomain enabled until all of these steps finish:

1. preserve the authenticated predecessor manifest and all four predecessor
   image digests; confirm they remain anonymously retrievable;
2. attach only `alpha.trevv.de` to the Render Web service and confirm the
   Dashboard still reports $0 before accepting it;
3. create only a DNS-only (gray-cloud) Cloudflare CNAME named `alpha` targeting
   the exact Render Web hostname; remove any conflicting `alpha` AAAA record
   and do not change the apex or `www` records. Keep it DNS-only through
   verification and this preview unless a separately reviewed proxy cutover
   updates the edge assumptions and smoke;
4. wait for Render to report the domain verified and its managed certificate
   active, then verify authoritative DNS and HTTPS at `alpha.trevv.de`;
5. deploy the candidate API and Web as one compatibility cohort, with API
   `WEB_ORIGIN=https://alpha.trevv.de`, both services
   `AUTH_COOKIE_PREFIX=trevv_alpha`, and no `AUTH_COOKIE_DOMAIN` anywhere;
6. run the complete remote smoke with
   `REMOTE_STAGING_RETIREMENT_MODE=transition`; require `/api/web/livez`,
   dependency-aware `/api/web/readyz`, invite-only sign-in, host-only
   `__Secure-trevv_alpha.session_token`, rejection of a stale
   `trevv.session_token`, authenticated tenant read, and a ready rollback
   fallback through the still-enabled Render Web subdomain;
7. disable the Web Render subdomain; and
8. run the complete remote smoke again with
   `REMOTE_STAGING_RETIREMENT_MODE=enforced`, which must prove the retired
   origin returns exact 404s and the candidate remains healthy through
   `alpha.trevv.de`.

Any failed gate stops the cutover. For rollback, first re-enable and verify the
Web Render subdomain. Then withdraw the `alpha.trevv.de` Cloudflare record and
detach the Render custom domain so cached or stale alpha traffic fails closed.
Restore the authenticated predecessor Web/API/Worker image cohort together,
restore the predecessor Web/API origins and `AUTH_COOKIE_PREFIX=trevv`, keep
`AUTH_COOKIE_DOMAIN` unset, and run the predecessor smoke on the Render origin.
Never roll back database state; this path is allowed only while the
same-migration-head predecessor rule holds. Record each Dashboard and DNS
change so the forward and rollback cohorts remain attributable.

## Safe bootstrap and smoke

1. Verify the $0 account gates above and review the materialized resource list.
2. Create only the Free database, keep its external allowlist empty, and record
   its 30-day expiry date.
3. Add the narrow temporary allowlist, run the exact Migrate image twice, and
   remove the operator IP.
4. Configure the exact API runtime secrets and the Resend sending-only key in
   a mode-0600 local bootstrap environment, then run the initial-owner
   bootstrap once from the exact approved API image as specified in
   `deploy/staging/remote-operations.md`. Require its success before deploying
   any service; never expose the owner password or verification token.
5. Configure the same approved runtime values in Render. Deploy API, Worker,
   then Web from their exact approved digests: API and Worker remain on their
   checked-in Render origins, while Web completes the bounded
   `alpha.trevv.de` cutover above.
6. Wake the Worker's public `/readyz`, wait for its exact release identity and
   readiness, then run the bounded write/outbox checks before it can sleep.
   Run no other writer concurrently: the smoke deliberately requires the exact
   isolated API/Worker deltas documented in
   `deploy/staging/remote-operations.md`. Observable extra activity fails the
   gate; the aggregate metrics are not event-correlated proof under concurrent
   writes.
7. Probe cold start, database readiness, invite-only auth, authenticated SMTP
   submission recorded as sent plus revocation, host-only secure cookies, one
   authenticated tenant read, release metadata, Web-to-API correlation, and
   absence of demo fallback. A submitted message does not prove recipient-
   inbox delivery. The client-IP spoof probe covers only one deployed request;
   this bounded smoke does not prove cross-tenant isolation, continuous edge
   enforcement, or representative rate-limit behavior. The CI suites remain
   the available evidence for those properties.
8. Verify the UI explains that asynchronous behavior can pause and that all
   data is fictional and disposable.
9. Record how to delete all four resources before database expiry. Do not
   report backup, restore, rollback, HA, durable-Worker, or production-topology
   gates as passed.

Render Free supports only the two most recent application deploy rollbacks and
offers no database rollback. Migrations remain additive/forward-only; an app
rollback cannot undo schema or recover lost data. The smallest path from this
preview to production-shaped staging is paid PostgreSQL with PITR, private API,
two API instances, two Workers, managed migration jobs, telemetry/alerts, and a
tested restore/rollback cohort.

Official Render references:

- <https://render.com/docs/free>
- <https://render.com/docs/compute-plans>
- <https://render.com/docs/blueprint-spec>
- <https://render.com/docs/custom-domains>
- <https://render.com/docs/configure-cloudflare-dns>
- <https://render.com/docs/postgresql-creating-connecting>
- <https://render.com/docs/postgresql-backups>
- <https://render.com/docs/outbound-ip-addresses>
- <https://render.com/docs/deploying-an-image>
