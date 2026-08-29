# Production-shaped local staging

This topology runs built Web, API, and worker artifacts with `DEMO_MODE=false`:

- one standalone Next.js Web process;
- two load-balanced API processes;
- two independently leased background workers;
- PostgreSQL 17 with a persistent local volume;
- a private file-backed test mail sink;
- an Nginx TLS edge proxy on `https://127.0.0.1:8443`.

API `/api/v1/readyz` performs the PostgreSQL dependency check. Web readiness
calls that endpoint through its locally trusted, server-only HTTPS upstream, and edge
readiness calls the Web readiness endpoint, without a circular boot dependency.
Worker readiness requires a recent successful sweep and queue
telemetry rather than process liveness alone.

The worker exposes internal-only `/livez`, `/readyz`, and JSON `/metrics`
endpoints. `WORKER_ENABLED=false` is the global processing kill switch;
`WORKER_DISABLED_HANDLERS=attention,collaboration` can pause an individual
handler family. Metrics and structured logs contain queue counts, age, handler
names, and error codes, never event payloads.

Run it with Docker Compose:

```sh
docker compose -f compose.staging.yaml --profile smoke build
docker compose -f compose.staging.yaml --profile smoke up --wait --wait-timeout 180 -d proxy worker-1 worker-2
docker compose -f compose.staging.yaml cp proxy:/etc/trevv-local-tls/ca.crt /tmp/trevv-staging-ca.crt
curl --fail --cacert /tmp/trevv-staging-ca.crt https://127.0.0.1:8443/readyz
docker compose -f compose.staging.yaml --profile smoke run --rm upgrade-smoke
docker compose -f compose.staging.yaml --profile smoke run --rm smoke
docker compose -f compose.staging.yaml --profile smoke down --volumes --remove-orphans
```

The topology smoke creates a disposable fictional account and tenant, verifies a Team room and durable message, confirms API-created outbox state, proves the private router reaches both API processes, and proves only one of two workers acknowledges each event. It also validates the local CA/TLS identity, Secure/HTTP-only/SameSite session cookies, cross-origin mutation rejection, real retention redaction, expired-lease recovery, query-free edge logging, and authenticated Web rendering. The upgrade smoke creates and destroys only the explicitly named `trevv_*_upgrade` database, upgrades through the real Drizzle migration journal, verifies a second migration pass is a no-op, and fails loudly if cleanup cannot remove its resources. CI also injects a failure after the previous-release fixture is populated and verifies that the isolated database was still removed.

Nginx access logs record the normalized `$uri`, never request arguments,
cookies, authorization headers, or referrers. CI sends a known query sentinel and
fails if the value appears in captured proxy logs.

This is a local and CI topology, not a remote staging deployment. Its TLS
certificate is generated in an isolated local volume and trusted only inside the
topology, so a browser will show a local certificate warning. It also uses a
non-production mail sink. A real staging environment must terminate publicly
trusted TLS at its edge, require `sslmode=verify-full` to managed PostgreSQL with its CA in the runtime trust store, use a real
test-domain SMTP provider, inject secrets through the platform, and keep the
API, workers, and database on private networks. Object storage is omitted
because the current release scope does not require attachment upload APIs.
