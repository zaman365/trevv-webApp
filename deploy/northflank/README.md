# Northflank Sandbox deployment

This deployment option preserves the existing API, background worker, database,
Cloudflare frontend, authentication, and Superadmin implementations. The Render
and isolated staging deployment options remain available.

## Resource layout

Use a Northflank **free project in Developer Sandbox**. The deployment uses:

| Resource | Configuration |
| --- | --- |
| `trevv-api` | API image pinned by digest; one `nf-compute-20` instance; HTTP port 8787 |
| `trevv-worker` | Worker image pinned by digest; one `nf-compute-20` instance; private port 9090 |
| `trevv-postgres` | PostgreSQL 17; `nf-compute-20`; one replica; 6 GB; private networking and TLS |
| `trevv-migrate` | Manual migration job; pinned migration image; no schedule; no automatic image-change runs |
| Web | Cloudflare Workers for `trevv.de` and `alpha.trevv.de` |

The selected Sandbox plan allows two services, two jobs, and one addon. Do not
upgrade the project, add paid storage, or enable paid features without the
owner's explicit spending authorization. A billing threshold is not a spend cap.
Check the actual selected plans and the [current provider pricing](https://northflank.com/pricing)
before creating resources. These small shared resources do not provide HA or a
production availability guarantee.

## Database and runtime settings

Link only the regular-user `POSTGRES_URI` into a runtime secret group. Its default
alias is `NF_TREVV_POSTGRES_POSTGRES_URI`. The startup configuration changes its
`sslmode` to exactly `verify-full`; never disable certificate verification. The
Northflank PostgreSQL certificate was successfully verified with the container's
standard trust store. Do not carry the former Render database CA into this setup.

Keep existing application and Superadmin signing secrets, the cookie prefix,
PostgreSQL rate-limit secret, SMTP credentials, registration policy, all enabled
worker handlers, and operating limits. Store credentials only in the appropriate
service's private runtime settings, never in this repository or frontend assets.
Set `NODE_ENV=production`, `DEMO_MODE=false`, and the verified release identity.
Keep `AUTH_COOKIE_DOMAIN` unset. The API trusts both HTTPS frontend origins and
continues to issue host-only cookies through each frontend's same-origin proxy.

Configure the worker with `WORKER_HEALTH_HOST=0.0.0.0`,
`WORKER_HEALTH_PORT=9090`, and a readiness probe at `/readyz`. Before its normal
entrypoint, initialize `DATABASE_URL` from the linked URI with verified TLS.
Retain the image's normal entrypoint and signal handling.

## Northflank API ingress adapter

Northflank's Sandbox excludes port IP policies and Basic Auth. Its managed HTTP
load balancer appends the connecting peer to `X-Forwarded-For`, while incoming
`CF-Connecting-IP` and `X-Real-IP` values can survive unchanged. Copying the
Render header-trust configuration directly would therefore permit spoofing.

`api-entry.mjs` composes the existing API with a Northflank-specific ingress
adapter. It trusts only the final address appended by Northflank. For a verified
Cloudflare peer, it uses Cloudflare's client address; for other peers, it uses
Northflank's observed source address and ignores caller-supplied client-IP
headers. It replaces all forwarded IP metadata before invoking the existing
application. Only the existing GET/HEAD health endpoints accept requests without
ingress metadata, for container probes. Authentication, authorization, body
limits, routes, cookies, streaming, metrics policy, and rate limiting still run
through the existing application.

Set `TRUSTED_CLIENT_IP_HEADER=cf-connecting-ip` on both Cloudflare frontends as
well. Browser API proxying, server-rendered customer requests, and administrator
session checks must preserve that edge-provided identity. Cloudflare replaces
the incoming header before the Worker runs. Leave this setting unset on a web
deployment without a trusted edge that sanitizes it; ordinary caller-supplied
forwarding headers remain stripped by default.

Use this adapter **only behind Northflank's managed HTTP ingress** and keep
`TRUSTED_CLIENT_IP_HEADER=cf-connecting-ip`. Keep the upstream URL as the
Northflank-generated `code.run` origin: Cloudflare documents different header
semantics for same-zone and cross-zone Worker subrequests. Refresh the included
Cloudflare IP ranges when reviewing deployment configuration. Recheck the
provider's appended-hop behavior before using this adapter on another provider
or changing the ingress topology.

The image's application source identity and the adapter's deployment-config
digest are separate evidence. The startup command can import the reviewed
module as a base64 JavaScript data URL and call `startNorthflankApi()`, retaining
the container's `dumb-init` entrypoint. Record the exact module SHA-256 and command
with the release evidence. Do not label a locally added adapter as code already
included in an earlier attested container image.

Run `node --test deploy/northflank/api-entry.test.mjs`. Also verify live requests
with forged forwarding headers before admitting the API, and confirm both
frontends preserve individual client identities. References:
[Northflank networking](https://northflank.com/docs/v1/application/network/networking-on-northflank),
[Cloudflare request headers](https://developers.cloudflare.com/fundamentals/reference/http-headers/),
[Cloudflare IP ranges](https://www.cloudflare.com/ips/).

## Recovery and release verification

If the original provider is inaccessible, obtain explicit acceptance of the
backup's recovery time and possible later data loss before restoring it. Preserve
the original backup and source. Verify table fingerprints before migration,
apply the existing guarded migration, verify a second pass is a no-op, and check
that preexisting records have not changed before starting application workloads.

Give only the migration job temporary access to the database-owner connection.
After the migration, preserve the ordinary application's required table and
sequence permissions and unlink the owner credential. Do not give the API or
worker database-owner credentials. A recovery job tied to an exact backup is
not a reusable live-data checksum check after background processing resumes.

Verify each published container's source, digest, security checks, and provenance.
A failed Render predecessor-publication check remains failed; it is not proof of
a successful Northflank release. Keep separate recovery evidence and complete
Northflank runtime, login, Superadmin, persistence, worker, and public-site checks
before declaring deployment complete.

Build each frontend for its canonical origin. Its runtime settings must use the
new API origin and matching application release identity. Preserve all frontend
assets, bindings, custom domains, authentication settings, and existing security
headers. Save the predecessor Cloudflare version and DNS state before cutover.
Do not send either frontend to a probe, blank API, or unfinished migration.

Retain the source and verified backup until recovery and cutover are validated.
Do not switch back to a stale database after new writes without an explicit data
reconciliation decision. Revoke temporary deployment access and remove any
temporary network probes when finished.
