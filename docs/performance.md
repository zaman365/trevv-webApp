# Performance evidence

Web build evidence was refreshed on 2026-08-30 from a production-mode local
build of the current working tree on Apple Silicon (`RELEASE_ID=local-phase6-build`,
base Git SHA `6db98e24361d6ae078ecd735a0abf9a1abe51cee`). The dirty working tree and
synthetic image ID mean this is not an immutable release candidate. These
numbers are directional engineering evidence, not production SLO measurements
or Ubuntu CI evidence.

## API measurement status

Earlier warm-demo request timings and contract-size numbers were retired because
they do not describe the current live API or generated OpenAPI contract. Before
release, recapture cold and warm API latency, payload, query-plan, and
throughput evidence from the exact manifest images against the reference-volume
PostgreSQL fixture. Persistence indexes cover tenant, Workspace, item, status,
assignee, due-date, activity, notification, outbox, and idempotency lookup
paths; the release evidence must still prove the resulting query plans.

## Build evidence

- The route-aware budget tool passed against the current Next.js output.
- Initial gzip JavaScript measured 154,110 bytes for sign-in, 244,473 bytes for Portfolio, and 244,865-254,601 bytes across the measured Workspace routes.
- Initial gzip CSS measured 65,936 bytes on every measured route; the largest initial gzip asset was 66,160 bytes.
- Every measured app route proved at least one selected dynamic import. The configured JavaScript limits are route-specific (175-300 kB), rather than the retired blanket 100 kB claim.
- The critical route set is a code-level invariant independent of the editable budget JSON. Deleting a route budget or omitting a selected dynamic import from any declared `/app/**` route fails the gate.
- The single public image measured 590,377 bytes and remained within its configured budget.

## Release interpretation

The local route/asset budget passes, but the current app shell is not below 100 kB gzip and no such claim is approved. A production deployment must still collect representative mobile Core Web Vitals, cold-start latency, database query plans, and large-workspace traces before making a latency or responsiveness claim. The production performance gate must retain immutable mobile RUM/Lighthouse evidence and `EXPLAIN ANALYZE` results for tenant-filtered queries at 100+ Workspaces and 10,000+ items.
