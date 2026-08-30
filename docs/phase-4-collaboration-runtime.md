# Phase 4 collaboration and runtime boundaries

## Release decision and status

**Decision:** closed alpha includes fully persistent Teams and contextual Messages. They remain in live-mode navigation instead of being hidden for a later release.

That decision applies to the `DEMO_MODE=false` implementation, not to the current hosted release. Three distinct states must not be conflated:

| Surface                           | Current state                                  | Data boundary                                                  |
| --------------------------------- | ---------------------------------------------- | -------------------------------------------------------------- |
| Hosted `trevv.de` preview         | Fictional-data technical preview               | Seeded/browser-local; no real collaboration effect             |
| Live-mode implementation          | Implemented; final local integrated gates pass | Better Auth + tenant-scoped PostgreSQL + worker                |
| Remote staging/production service | Not deployed                                   | No remote credentials, database migration, or customer traffic |

Do not describe Teams or Messages as **Live** in release copy until the complete remote topology is deployed and its release gates pass. The repository's capability vocabulary reserves **Live** for deployed, authorized, durable, recoverable behavior.

## Collaboration domain

A Team is scoped to one organization, Portfolio, and Workspace. It stores a name, purpose, preset, feature-capability labels, members, and Team leads. Creating a Team atomically creates exactly one private Team room. Adding, removing, or changing a Team member atomically updates Team membership and the room participant record.

Conversations support four kinds:

- **Workspace:** organization-visible or private coordination within one Workspace.
- **Team:** the private room owned by one Team; participants follow active Team membership.
- **Direct:** one private conversation between exactly two participants.
- **External:** guest-scoped coordination with explicit guest participation.

Messages have a stable server sequence and client-message identifier. The durable model includes replies, message intent, request/decision response owner and state, optional linked-record metadata, reactions, per-user read checkpoints, version, and retention timestamp. Pagination uses opaque cursors. The current UI deliberately omits editing, archive, pin, turn-to-work, delivery receipts, presence, and attachment controls.

## Feature inheritance is not authorization

Team presets and capability labels describe relevant product defaults such as work, messages, decisions, approvals, resources, and reporting. They never grant database or API access and are not inputs to the collaboration authorization policy.

The server derives access from the authenticated application user and current database state:

- active organization membership and role;
- accessible and managed Workspace scope;
- active Team membership and Team-lead status;
- conversation kind and visibility;
- active conversation participation and ownership; and
- message sender or response-owner status for the relevant update.

| Resource/action                                 | Effective boundary                                                                                  |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Read a Team                                     | Active internal Workspace access; guests cannot read internal Teams and viewers remain read-only    |
| Create a Team                                   | Organization owner/admin or managed Workspace lead                                                  |
| Manage Team profile/members                     | Organization owner/admin, managed Workspace lead, or that Team's lead                               |
| Read an organization-visible Workspace room     | Current Workspace access; guests require active participation                                       |
| Read private, Team, direct, or external content | Active participation; Team rooms additionally require active Team membership                        |
| Send/react/mark read                            | Authorized participant; viewers are read-only                                                       |
| Manage room participants                        | Workspace manager or room owner; never for Team/direct rooms through generic participant management |
| Resolve a request/decision message              | Workspace manager, room owner, message sender, or assigned response owner                           |

Owners and administrators do not receive implicit private-message access. Removed members and cross-tenant or inaccessible-Workspace guesses return the same non-leaking not-found response as an unknown resource. Client-side role checks only reduce misleading controls; the server remains authoritative for every operation.

## Transactions, concurrency, and privacy

Collaboration repositories require organization and user request scope. Independent organization/Portfolio/Workspace/conversation identifiers are checked together, and composite database relationships prevent cross-tenant joins that happen to use similar identifiers.

Every relevant mutation uses durable idempotency. Team, conversation, and message updates use optimistic versions/ETags where concurrent edits matter. Aggregate changes, Team-room synchronization, participant updates, audit metadata, outbox records, and collaboration invalidation records commit together. A failed transaction cannot leave a Team without its room or grant room access without the matching Team membership.

Audit, outbox, and invalidation payloads contain identifiers and change metadata, never message bodies. Permission-filtered collaboration events expire after seven days. They exist to invalidate current views, not to replace durable message history.

Migration `0009_cooing_lady_deathstrike.sql` establishes an operator-only quarantine for legacy collaboration records that must be bounded or normalized before the new constraints can be applied. It preserves the original scoped record and reason while canonical titles, purposes, message bodies, links, response fields, participant values, and reaction sets are made contract-safe. Cross-scope records and non-Team rooms above the 250-participant limit fail the migration atomically instead of silently changing access.

Migration `0014_legacy_collaboration_upgrade_safety.sql` adds the corresponding boundary for pre-Phase-4 message metadata that does not satisfy the bounded API contract. It copies the original value, byte length, reason, and tenant/conversation identifiers into `conversation_message_metadata_quarantine`, linked to the canonical message by a scoped foreign key. It replaces application-visible metadata with a `legacyMetadataQuarantined` marker plus a SHA-256 fingerprint and advances the message version, so unsafe legacy content cannot leak through normal reads.

Application APIs and repositories must never read or expose either quarantine table. There is no automatic rehydration, UI recovery, export, or product-facing recovery handler for quarantined values. Recovery is an operator-only procedure: an authorized operator must review and sanitize the original value into the current bounded contract, preserve tenant scope and audit evidence, and apply an explicit controlled repair before recovered content can return to a canonical record. Message-scoped quarantine is deleted atomically when message retention expires; non-message records remain unavailable to product users pending reviewed remediation.

The Web can retain only an organization/user/conversation-scoped recoverable draft and its idempotency/client-message identifiers. It never stores canonical Team, conversation, participant, message, reaction, or checkpoint state in browser storage. A send remains visibly pending until server acknowledgement; a lost response reuses the same identifiers and recovers the original result instead of duplicating the message.

## Cross-browser invalidation

The authenticated `GET /api/v1/events` endpoint returns a finite Server-Sent Event batch filtered by Workspace and current conversation access. Each event has a numeric cursor; the terminal checkpoint tells the client where to reconnect. The same-origin Next.js proxy streams the response and propagates a browser disconnect to the API request.

React Query invalidates Team, conversation-summary, conversation-detail, and message-page keys according to event type. Bounded polling continues every few seconds and remains authoritative if an event batch is interrupted, delayed, expired, or missed. This design provides reliable second-browser refresh without claiming a permanent socket, presence, typing indicators, or provider delivery.

## Worker ownership and retention

The Worker registry rejects duplicate event ownership. Its default handlers are:

- **Attention:** organization/membership scope, Portfolio/Workspace lifecycle, WorkItem/dependency, decision outcome, Waiting, Workspace update, invitation acceptance, and weekly-review events that require deterministic Attention recomputation.
- **Collaboration:** Team, participant, conversation, message, response, reaction, read-checkpoint, and `message.retention_due` events.
- **Reviewed audit-only:** explicitly cataloged events whose originating transaction already contains the complete durable effect and which require no additional Phase 4 projection.

The exhaustive worker catalog currently maps all 50 event types emitted by repository producers to exactly one handler, effect, and reviewed reason. Source-coverage tests fail when a new producer is not added to the catalog, and the audit-only handler never accepts an unknown type.

Workers claim only active owned event types through bounded PostgreSQL `FOR UPDATE SKIP LOCKED` leases. A lease token protects processing and acknowledgement across multiple instances. Each attempt is persisted. Expired leases recover; failures use bounded jittered exponential backoff; terminal attempts enter a durable dead-letter state; and unknown or kill-switched handler events stay pending rather than being falsely acknowledged.

Most collaboration events currently require only durable acknowledgement because the Web consumes the separately committed collaboration-event stream. `message.retention_due` performs an idempotent database effect: after the configured retention timestamp it replaces the body with `[Message expired]`, clears metadata, increments the version, deletes message-result idempotency snapshots and both message quarantine forms, and retains message/audit identity.

Runtime controls include a global Worker enable switch and per-handler disable list. SIGINT/SIGTERM stop new work and close the health server/database. Structured logs and `/metrics` report ready, delayed, leased, dead-lettered, paused, and unsupported counts; oldest ready/unsupported age; and leased/succeeded/failed/dead-lettered attempts. `/livez` reports process liveness. `/readyz` fails while disabled, handlerless, stale, or stopping, and also fails when the oldest unknown event reaches `WORKER_READINESS_MAX_UNSUPPORTED_AGE_MS` (five minutes by default). The bounded grace period permits a rolling deployment to introduce a catalog entry, while preserving unknown events and failing closed if ownership is not deployed.

The runtime still needs an external telemetry sink, alert thresholds, supervised restart policy, and reviewed dead-letter inspection/replay procedure before remote alpha traffic. The Worker performs no external provider delivery.

## Production-shaped topology

`compose.staging.yaml` builds production artifacts and runs:

```text
Local TLS edge ─┬─ standalone Next.js Web
                └─ load-balanced API 1 / API 2 ─ PostgreSQL 17
                                                  ├─ Worker 1
                                                  └─ Worker 2
Private file mail sink ────────────────────────── API 1 / API 2
```

The smoke path covers the trusted TLS and secure-cookie boundary, cross-origin rejection, anonymous guarding, account verification/sign-in, onboarding, tenant-scoped Workspace access, traffic through both API instances, atomic Team/room creation, durable message round-trip, exactly-once processing by one of two workers, concrete retention redaction, expired-lease recovery, an Attention event, zero unexpected unsupported backlog, query-free edge logging, and authenticated Web rendering without demo fallback. A separate upgrade smoke uses the real Drizzle journal to create a populated previous-release schema through migration `0008`, applies the additive Phase 4 migrations, verifies a second no-op pass, and checks preserved/bounded identity, conversation, message, collaboration, retention, and operator-quarantined legacy data. CI also injects an upgrade failure and proves the isolated database is removed.

This is production-shaped local/CI validation only. It uses a self-signed local TLS edge, local PostgreSQL credentials, a private file mail sink, and test-mode allowances for those transports. A disposable fictional-data `$0` remote preview may be used for bounded functional rehearsal, but its public sleeping services and expiring, backup-free database are not qualifying staging evidence. Before closed alpha, replace those boundaries with publicly trusted TLS, managed PostgreSQL using exactly one `sslmode=verify-full` plus a trusted CA and restore evidence, authenticated test-domain SMTP, secret-manager injection, private networking, external telemetry/alerts, and deployment/rollback drills. API, Worker, and migration startup reject production database URLs that do not verify both certificate and hostname; `sslmode=require` is intentionally insufficient.

Worker readiness is dependency-aware through recent successful queue telemetry. API `/api/v1/readyz` performs a PostgreSQL round trip and fails closed when the live data plane is unavailable. The Web content-free readiness endpoint requires that API result, and the edge readiness route requires the Web result; the authenticated tenant read/write smoke remains a separate behavioral gate.

## Object-storage decision

Object storage is not required for the present collaboration alpha because no API accepts attachment bytes. The message `metadata` object is bounded JSON metadata, not a file store, and the Web does not expose attachment controls.

Before attachments become available, provision private regional object storage and implement authorization-bound upload intents, size/type quotas, malware scanning, encryption, retention/deletion, signed downloads, audit records, and tests proving removed users cannot retain access. Until all of that exists, attachment actions remain unavailable rather than simulated.

## Release gate

Phase 4's local quality, migration, contract, security, visual/accessibility, two-browser collaboration, and Worker failure/recovery gates pass. The production-shaped topology is defined and covered by CI, but could not be executed on the implementation host because Docker was unavailable and has not run on a remote final commit. Remote closed alpha therefore remains **no-go** until that gate passes and the managed staging topology and operational requirements above are deployed and verified.
