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

## Responsiveness repair — 2026-09-05

The shared live record context now excludes the timestamp that changes on every
successful poll. Clock labels subscribe independently. Workspace summaries still
re-evaluate time-sensitive signals on each authoritative refresh and reuse equal
results, so unchanged polls do not notify all workspace consumers. Full-snapshot
hooks remain available for callers that need both records and the latest clock.
Five-second permission polling, focus refresh, retry behavior, stale notices,
mutation acknowledgement, and server-side tenant-boundary checks remain intact.

Collaboration event bursts are collected for at most 32 ms (or until the SSE
checkpoint) and invalidate each matching active query once, including thread
feeds. Background refresh retains each query's existing data. Changing workspace,
conversation, or thread never reuses an unrelated entity's placeholder data.
Conversation opening positions the timeline before paint; new-message scrolling
respects reduced motion and leaves a member reading earlier messages in place.
Conversation-rail resizing commits at most once per animation frame.

The Attention ranker now deduplicates active signals in a single pass and computes
scores once per unique signal. It preserves the first active duplicate and stable
ordering on ties. Shared date formatting uses a bounded cache of formatter
configuration, never user data. Browser-local workspace, portfolio and capture
stores ignore unrelated storage events and retain in-memory creation when storage
writes are blocked.

Local synthetic checks on Apple Silicon with Node 22.19.0 measured:

| Check                                                        |                                      Before |  After |
| ------------------------------------------------------------ | ------------------------------------------: | -----: |
| Rank 10,000 signals (7,500 unique)                           |                                    116.6 ms | 2.9 ms |
| Format 5,000 dates                                           |                                    117.0 ms | 5.0 ms |
| Record/workspace consumer commits over three unchanged polls | Timestamp previously changed shared context |  0 / 0 |

The timing measurements are medians of seven warmed iterations. They measure
specific code paths, not end-to-end latency or production Core Web Vitals.
`pnpm test:performance` runs the actual React providers in Chromium with synthetic
intercepted API responses. It verifies unchanged-poll render counts, draft
preservation, changed records, access revocation and recovery, scoped conversation
switching, and browser-storage behavior. CI runs it alongside the existing workflow
gates. The production build and original route/asset budgets remain required.

Deployment cold starts and real database/network latency are outside these local
measurements. The documented sleeping preview services still require deployed
measurements before claiming consistently fast end-to-end navigation.

The existing Chromium workflow suite passed all 27 tests. The selected mobile
Chromium checks passed all eight tests, and WebKit passed seven of eight. WebKit's
cold fictional-workspace creation was interrupted by Next development Fast Refresh
reloading the previous page after compiling its POST route. The identical failure
was reproduced in an isolated archive of the unchanged `29ddc01` source; it is not
introduced by this repair and is not evidence about the production build.

The Worker build also revealed that Vinext was inheriting the Node deployment's
`output: "standalone"` and trying to package a Cloudflare WASM module as a Node
runtime dependency. Both Worker configurations now reuse all shared settings
without requesting Node packaging; the Next build still emits its original
standalone server. The Sites Worker build passes. Run the two build targets
sequentially because their framework type generators share `.next/types`.

## Page-navigation repair (2026-09-05)

The Worker adapter re-executes dynamic layouts during RSC page navigation. The
layout previously downloaded the whole organization snapshot on every switch,
including every page of work items, despite the browser retaining its query cache.
Navigation now retains that cache and skips only the redundant server seed. Cold
RSC entry has explicit loading, failure, retry, and access-loss states. Changing
the signed-in user or organization creates a fresh query provider. Normal HTML
loads still receive the complete initial snapshot.

Workspace leaf pages now check the authoritative accessible-workspace list rather
than requesting an unused full workspace detail and item-history rollup. The
existing detail-returning access helper remains available with its default
behavior. Session checks, per-page authorization, true 404 responses, and the
five-second access refresh are preserved. Navigation links show pending feedback
while the current page remains interactive; no root Suspense/loading boundary was
introduced.

The production Worker was exercised locally against an isolated fixture API.
An authorized document fetched session plus the five snapshot resources. A page
switch fetched only session and the accessible-workspace list; it requested no
item pages or workspace detail. Inaccessible workspaces returned HTTP 404 for both
HTML and RSC requests. Both runtimes hide Flight headers from layout code; the
proxy normalizes its navigation marker from RSC or the adapter's explicit
`text/x-component` Accept type and overwrites any incoming marker.

A separate retry defect amplified transient backend failures. Vinext request
memoization could replay the original 503 for all eight retries (55 seconds of
backoff), and awaiting cancellation of its retained response-stream branch could
stall before any retry. Retries now bypass request memoization using an abort
signal and cancel discarded bodies without waiting for the retained branch.
An isolated check using the installed Vinext runtime and a fake 503-then-200
upstream now makes two upstream calls with one 1-second scheduled delay, including
responses with bodies. Delays were recorded without sleeping; this is a recovery
behavior check, not a production latency measurement. Mutations remain single
attempt, and caller cancellation is preserved.

Regression coverage includes retained records/drafts without a new server seed,
fresh data after identity changes, cold-load retry, normalized navigation headers,
workspace denial/revocation, complete detail compatibility, and immediate link
feedback during an intentionally delayed navigation. Production backend and
network latency still contribute to end-to-end page-switch time.

## Avoiding unusable navigation prefetches (2026-09-05)

The production Worker client classified visible app links as eligible for full
automatic RSC prefetching, while authenticated dynamic responses had a zero-second
cache lifetime. Those completed prefetches could not serve the later navigation.
The compiled `73bcff9` client made ten unsolicited page requests in a 1.5-second
observation window on a fictional workspace. Each competed for backend identity
and workspace reads before any click.

App links now share a policy that avoids automatic private-page RSC requests.
Pointer hover and keyboard focus warm only the destination's static loader and
experience modules, including the correct live or demo implementation. Module
promises are bounded by a fixed module-key set, shared across workspace slugs,
and failed warmups can retry. Public links retain their prefetch settings and
all links retain their existing markup, destinations and event handlers. The
navigation bar retains its pending indicator.

Workspace route checks also start session and accessible-workspace reads in
parallel. Session redirects and errors take precedence without waiting for a
slow workspace response. Workspace failures are observed immediately and mapped
through the existing 401/403/404 handling after session validation. No session or
authorization cache lifetime has been extended. Complete initial snapshots,
five-second polling, route modes and all existing destinations remain available.

`pnpm test:worker-navigation` builds the production Worker client and exercises
the real adapter against a fictional loopback API. Its local server configuration
uses test mode solely to permit the HTTP fixture; the browser bundle is compiled
for production. The same observation window now produces zero unsolicited RSC
requests. Hover/focus produces no RSC request, clicks and repeat visits each make
one fresh navigation request, Calendar data finishes loading, and both document
and RSC workspace denials retain HTTP 404. CI runs this alongside the existing
Next browser and responsiveness gates. These request counts are an isolated
regression measurement, not a production latency guarantee.
