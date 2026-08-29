# TREVV persistent data-plane contract

**Status:** Phase 1 implementation specification  
**Source:** `docs/problem-resolution-audit.md`, especially P0-03, P0-04, and the phased resolution sequence  
**Phase window:** Weeks 1-4  
**Exit gate:** API data survives restarts and horizontal instances, and every successful mutation commits its domain change, audit record, and outbox event atomically.

## 1. Purpose and phase boundary

Phase 1 replaces process-local API Maps with an organization-scoped PostgreSQL data plane. It creates the durable repository and transaction foundation that later phases will use.

Phase 1 does **not** connect the Web application to live data, implement real sign-in, expose invitations publicly, deliver background work, add Teams or Messages, or claim production readiness. Those remain later-phase work.

The implementation must preserve these boundaries:

- **Phase 1:** schema integrity, tenant-scoped repositories, durable transactions, versions, idempotency, audit/outbox writes, live API adapters, and PostgreSQL integration tests.
- **Phase 2:** safe Better Auth identity provisioning, application route guards, onboarding, invitation acceptance, verification/recovery, and session revocation. Phase 1 already resolves an existing identity to membership-derived repository and access scopes.
- **Phase 3:** Web-to-API migration, optimistic UI and conflicts, Attention recomputation, Waiting workflows, weekly review UI, outbox worker consumption, notifications, and cross-browser invalidation.
- **Phase 4+:** Teams, Messages, external delivery, integrations, uploads, billing, production topology, and provider side effects.

No Phase 1 route may silently fall back to fixtures or in-memory state when PostgreSQL fails.

## 2. Non-negotiable invariants

1. Every business query is scoped to exactly one `organizationId` before it reaches SQL.
2. A caller cannot supply or override its own tenant, role, accessible Portfolio IDs, or accessible Workspace IDs.
3. ID-addressed repository reads and writes combine resource ID and organization ID in the same SQL statement; the injected application service applies the resolved Workspace access policy before returning or mutating the result.
4. Missing and inaccessible resources return the same non-leaking `resource_not_found` response.
5. Redundant `organization_id` columns are protected by composite foreign keys; they are not trusted labels.
6. Every durable mutation runs inside one database transaction.
7. Every successful business mutation writes an append-only audit record and at least one outbox event in that same transaction.
8. Retryable creates and commands use a durable idempotency record. Process memory is never part of correctness.
9. Mutable aggregate roots expose a version and use an atomic compare-and-swap update.
10. Demo and live repositories are selected explicitly once at startup. There is no request-time fallback between them.
11. Repositories accept validated domain values, not raw request bodies, cookies, headers, or arbitrary filter objects.
12. The API, not a client, supplies actor, tenant, timestamps, request ID, audit metadata, and event metadata.

## 3. Package and dependency shape

Use one composition root and keep SQL out of route handlers.

```text
apps/api route
  -> transport validation
  -> application command/query service
  -> RepositorySet.forTenant(scope)
  -> transaction coordinator
  -> Drizzle/PostgreSQL
                 ├─ domain rows
                 ├─ audit_logs
                 ├─ activity_events when user-visible
                 ├─ outbox_events
                 └─ idempotency_records
```

Conceptual ownership map:

```text
packages/db/src/
  repositories/
    tenant-scope.ts
    errors.ts
    organization-repository.ts
    membership-repository.ts
    portfolio-repository.ts
    workspace-repository.ts
    board-repository.ts
    work-item-repository.ts
    inbox-repository.ts
    attention-repository.ts
    waiting-repository.ts
    review-repository.ts
    audit-repository.ts
    outbox-repository.ts
    idempotency-repository.ts
  transactions/
    command-executor.ts
    organization-commands.ts
    membership-commands.ts
    work-commands.ts
    operating-loop-commands.ts
  live-services.ts
  demo-services.ts
```

Phase 1 keeps these owners together in `packages/db/src/repositories.ts` so the
transaction and scope rules can be reviewed as one unit. Splitting them into the
conceptual modules above is a maintainability refactor, not a Phase 1 gate.

Rules:

- Export a repository factory and transaction executor from `packages/db`; API transport modules never import the schema or issue SQL directly.
- A repository is created with a `TenantScope`; individual methods do not accept an optional organization ID.
- Repository methods may accept an existing transaction handle. They must not start hidden nested transactions.
- Application services own transaction boundaries. Repositories own SQL and row mapping. `packages/core` remains deterministic and database-free.
- Add an import-boundary lint rule or dependency test that prevents API route modules from importing `schema.ts` or the Drizzle handle directly.

## 4. Mandatory `TenantScope`

`TenantScope` is a server-only, immutable, branded value. Repository scope contains mandatory tenant/actor/request identity; membership-derived resource access remains an application-service policy so the database and permission boundaries stay independently testable. A representative contract is:

```ts
declare const tenantScopeBrand: unique symbol;

export type TenantScope = Readonly<{
  organizationId: string;
  actorUserId: string;
  requestId: string;
  ipHash?: string;
  [tenantScopeBrand]: true;
}>;
```

Construction rules:

- Only the server composition/access layer may construct the branded value.
- During Phase 1, production-mode integration tests construct it through a test fixture resolver backed by real membership rows.
- The live access resolver produces repository scope and a separate `AccessContext` from `app_users`, organization membership, Portfolio membership, and Workspace membership. Phase 2 adds safe identity provisioning and the complete session lifecycle.
- HTTP input may select an already-authorized active organization, but it cannot define the role or accessible resource sets.
- A background job uses a separate, organization-specific `SystemTenantScope` containing `organizationId`, job ID, causation ID, and a named system actor. There is no unscoped “system can access everything” context.
- Organization creation and invitation acceptance happen before an ordinary membership scope exists. Their narrowly branded `ProvisioningScope` and `InvitationAcceptanceScope` are Phase 2 work; Phase 1 must not expose public bypasses for them.

Physical `app_users` rows are global, but product reads are not. `UserRepository.listMembers(scope)` and `getMember(scope, userId)` must join through a membership in `scope.organizationId`. A general API-visible `getUserByEmail` or unscoped user list is forbidden.

## 5. Non-leaking lookup and authorization semantics

For an ID-addressed resource, never load globally. The repository query always uses the tenant predicate; the application layer then applies the previously resolved access set before a response or command can proceed:

```sql
select ...
from work_items
where id = :item_id
  and organization_id = :organization_id
  and deleted_at is null;
```

Behavior:

- Unknown ID, another organization's ID, inaccessible Workspace, archived/deleted resource, and inaccessible parent all map to HTTP 404 with the same public message and error code.
- A 403 is allowed only when the caller is already authorized to know the resource exists but lacks the requested action. It must not reveal hidden parent or membership details.
- A scope mismatch may return 422 only after both supplied resources are independently visible to the caller. Otherwise return the generic 404.
- List, search, count, cursor, and event read models are filtered through membership-derived accessible Workspace IDs before totals or responses are produced. Sensitive exports remain unavailable until their audit policy is complete.
- Unique-constraint and foreign-key errors are never returned verbatim. Map them after a scoped validation query to a stable API error.
- Soft-deleted rows are excluded by default. Explicit restore/admin methods must be separate repository methods with their own permission and audit actions.

## 6. Composite tenant integrity

An application predicate is necessary but insufficient. The database must reject cross-organization and cross-Workspace relationships.

### Required parent keys and child references

| Parent or relationship            | Required integrity                                                                                                                |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Organization-owned aggregate      | Unique key on `(organization_id, id)` wherever a child carries both values                                                        |
| Portfolio → Workspace             | Composite FK from `(organization_id, portfolio_id)` to Portfolio `(organization_id, id)`                                          |
| Workspace → Board                 | Composite FK from `(organization_id, workspace_id)` to Workspace `(organization_id, id)`                                          |
| Board → group/status/item         | Board/group/status references include `organization_id`; an item board reference also includes `workspace_id`                     |
| Work item → Board                 | Composite FK `(organization_id, workspace_id, board_id)` to the matching Board tuple                                              |
| Work item → parent                | Parent item must have the same organization and Workspace                                                                         |
| Assignee/comment/update actor     | User must be an active organization member; assignability must also satisfy Workspace policy in the command transaction           |
| Item dependency                   | Both endpoint items must be in the same organization. Cross-Workspace dependency edges are intentional and must remain supported  |
| Portfolio/Workspace membership    | The Portfolio or Workspace and user membership must resolve inside the same organization                                          |
| Attention/Waiting/snapshot/review | Portfolio and optional Workspace references must match their stored organization; a Workspace must belong to the stored Portfolio |
| Decision outcome                  | The referenced item must be a visible `decision` item in the same organization/Portfolio                                          |
| Inbox conversion                  | `converted_item_id`, when present, must point to an item in the same organization and authorized target Workspace                 |
| Audit/outbox/idempotency          | Each row carries a required organization ID; actor/result references cannot cross that organization                               |

The existing schema contains some composite keys and version/idempotency foundations. Phase 1 must inventory every foreign key and close all remaining gaps before declaring the gate complete. A plain foreign key to a globally unique `id` does not prove the redundant tenant column is correct.

Do not model `item_dependencies` with one shared `workspace_id` that both endpoints must match. Enforce `(organization_id, item_id)` and `(organization_id, depends_on_item_id)` against organization-scoped item keys independently. A same-organization dependency may connect two Workspaces when the actor can access both. This does not relax work-item integrity: every item must still reference a Board belonging to that item's own Workspace through the composite Workspace/Board foreign key.

### Migration order for production-scale tables

1. Add composite unique keys and new nullable tenant/reference columns without removing old constraints.
2. Backfill in bounded batches using joins to canonical parents.
3. Run orphan and tenant-mismatch queries; abort on any mismatch.
4. Add composite foreign keys as `NOT VALID`, validate them separately, then make required columns non-null.
5. Switch repositories to the composite relationships.
6. Remove redundant unsafe constraints only in a later contract migration.

Migration `0005` is a pre-production additive migration over fixture-scale data,
so it validates the new constraints in the migration transaction after explicit
backfill/reconciliation queries. Before applying the same pattern to a large
customer table, use the staged `NOT VALID`/separate-validation sequence above.
All migrations must pass both a clean install and an upgrade from the last
released schema. Never repair mismatched tenant data by silently changing its
organization.

Migration `0005` keeps the previous insert shapes operational during an expand/roll-forward window: database triggers derive the new decision `workspace_id` from its already-scoped item and supply collision-safe legacy request/deduplication values for old outbox writers. The populated-`0004` upgrade test inserts both old shapes after upgrading and proves that the new constraints still hold. Those compatibility triggers can be removed only in a later contract migration after every previous writer is retired.

## 7. Repository ownership and transaction boundaries

### 7.1 Organizations and users

Repositories:

- `OrganizationRepository`: get/update the scoped organization; no unscoped list.
- `UserDirectoryRepository`: list/get users only through active organization membership.
- `OrganizationProvisioningRepository`: internal building block only; public orchestration is deferred to Phase 2.

Commands:

- `updateOrganization`: compare version, update safe fields, write audit/outbox.
- `provisionOrganization`: later Phase 2 transaction creates the application user mapping, organization, owner membership, default Portfolio, first Workspace, default Board, onboarding checkpoint, audit/outbox, and idempotency receipt. Phase 1 prepares and tests this transaction but does not expose it from simulated sign-up.

Never merge users solely by client-provided email. Phase 2 must map a verified Better Auth identity to one application user.

### 7.2 Memberships and invitations

Repositories:

- `MembershipRepository`: list/get/add/change role/revoke within the scoped organization.
- `InvitationRepository`: create, get by hash through the narrow acceptance flow, accept, expire, and revoke.

Phase 1 repository rules:

- Creating an invitation stores only a strong token hash, normalized email, role, inviter, expiry, audit, and an outbox request. It does not send email inside the transaction.
- Role changes and revocation emit a membership-change audit/outbox event. Session invalidation and grant-lifecycle orchestration are Phase 2.
- Replays cannot create duplicate membership rows or invitations.

Phase 2 must add the public invitation-acceptance transaction: verify the token
hash and identity email, lock the invitation, create/update membership, mark the
invitation accepted, synchronize grants, prevent removal of the last owner, and
invalidate affected sessions atomically. Phase 1 deliberately exposes no
pre-membership acceptance scope or public invitation endpoint.

### 7.3 Portfolios and Workspaces

Repositories:

- `PortfolioRepository`: accessible list, scoped detail, create/update/archive, default selection.
- `WorkspaceRepository`: accessible list/detail, create/update/archive, roll-up inputs.

Transaction rules:

- Workspace creation resolves the Portfolio through the same `TenantScope`; it never accepts an unrelated `portfolioId` after authorization of only the Workspace payload.
- Exactly one default Portfolio per organization is enforced with a partial unique index or a serialized transaction.
- Slugs are unique in their documented scope and are normalized server-side.
- Archiving is a state transition. Physical deletion is not a normal product command.
- Workspace lead and member IDs are resolved through active tenant membership before assignment.
- Any change that affects roll-ups writes an outbox event describing the affected Portfolio and Workspace IDs.

### 7.4 Boards, items, assignees, dependencies, comments, and updates

Repositories:

- `BoardRepository`: Board, groups, statuses, saved view inputs.
- `WorkItemRepository`: items plus typed status/priority/dates and version.
- `AssignmentRepository`: assignees validated against organization and Workspace access.
- `DependencyRepository`: acyclic dependency operations inside the allowed scope.
- `CommentRepository`: comments, mentions, and reactions.
- `WorkspaceUpdateRepository`: durable updates and metric inputs.

The public Phase 1 work-item aggregate contains the item plus assignees and
validated decision/approval state. Its create/update commands bump the parent
version once and atomically write audit/outbox records.

Implemented Phase 1 command boundaries:

- `createWorkItem`: resolve authorized Workspace and Board tuple; insert item/assignees/fields; audit/outbox/idempotency.
- `updateWorkItem`: atomic version check; update item and requested children; audit/outbox.
- `setAssignees`: validate every user before replacing the set; never partially apply.
- `publishWorkspaceUpdate`: insert the durable update and its audit/outbox records atomically; Phase 3 projection workers may derive roll-ups from it.

Before Boards, dependencies, comments, or move-item commands become public in
Phase 3, their application services must add default Board groups/statuses,
source/target authorization, dependency endpoint locks and cycle detection,
aggregate-version bumps for dependency/comment changes, and mention validation.
Phase 1 provides tenant-scoped durable repository seams for these rows but does
not claim those future commands are ready for client use.

An item `boardId`, `workspaceId`, `organizationId`, creator, assignee, status ID, group ID, or parent ID is never trusted independently. Each is resolved through one scoped relationship query.

### 7.5 Inbox and captured work

`InboxRepository` owns each user's action queue. Queries always include organization and user predicates; an administrator does not automatically receive access to another person's Inbox.

Quick Capture uses Inbox as the durable intake boundary:

- `captureWork` inserts an Inbox row with source, original text, capture state, actor, and version; then writes audit/outbox/idempotency.
- `convertCaptureToItem` locks the Inbox row, creates the scoped item, stores an explicit `converted_item_id` and processed timestamp, marks the Inbox entry done, then writes audit/outbox in one transaction.
- `dismiss`, `complete`, and `snooze` use optimistic versions.

If the current `resource` JSON is retained for presentation metadata, it cannot be the only referential link. Add typed source/state/version/conversion columns and a composite tenant-safe item reference. AI classification and automatic routing are Phase 3+; Phase 1 stores the original capture without fabricating an external or automated result.

### 7.6 Attention and Waiting

Repositories:

- `AttentionRepository`: scoped active list plus versioned resolve, dismiss, and snooze actions.
- `WaitingRepository`: scoped active list plus versioned resolve, nudge-request, and reschedule actions.

Rules:

- User actions are durable and versioned.
- Active uniqueness is enforced for the documented entity/type scope.
- An Attention signal's Portfolio and optional Workspace must match its organization.
- A Waiting state must resolve its entity, Portfolio, Workspace, and follow-up owner in one tenant.
- `resolve`, `dismiss`, `snooze`, and `reschedule` use compare-and-swap and write audit/outbox.
- A “nudge” in Phase 1 records only an internal requested/draft action. It must not claim email or Slack delivery.
- Deterministic Attention upsert/recomputation, Waiting creation workflows, and worker delivery are Phase 3. Until then, API responses must not claim `attentionRefreshed: true` unless recomputation completed transactionally.

### 7.7 Decisions, approvals, reviews, and snapshots

Decisions and approvals remain typed work items, but lifecycle state must be represented by validated, queryable columns or typed tables rather than an unchecked JSON convention.

Phase 1 repository commands:

- `updateDecisionState` and `recordOutcome`: type-check and version the decision item, and persist a tenant/Portfolio/Workspace-constrained outcome through separate audited transactions.
- `updateApprovalState`: lock and type-check the approval item, compare its version, store the new validated state, bump version, and write audit/outbox.
- `publishWeeklyReview`: validate Workspace/Portfolio, then append an immutable Workspace update and snapshot with audit/outbox in one idempotent transaction. It deliberately does not overwrite the Workspace aggregate, so concurrent reviews cannot silently lose a Workspace update.

Phase 3 must add reviewer assignment/authority, transition-policy enforcement,
review-ritual advancement, optional decision/request creation, and any derived
Workspace projection update before those richer workflows are exposed.

Snapshots and decision outcomes are append-only corrections-by-supersession unless a documented privacy workflow requires deletion. A weekly-review response names the durable IDs it committed; it does not return generated IDs for rows that do not exist.

### 7.8 Audit, activity, and outbox

These tables have different purposes:

- `audit_logs`: security and accountability record; append-only, permission-restricted, payload allowlisted.
- `activity_events`: product-visible activity feed; only when the event is safe to display.
- `outbox_events`: durable instruction for asynchronous consumers; never a claim that an external effect succeeded.

Every successful mutation writes `audit_logs` and `outbox_events` in the same transaction as the business rows. It may also write `activity_events`. There is no direct queue publish, webhook, email, or notification call inside the transaction.

Outbox records require:

- event ID and schema version;
- organization ID, event type, aggregate type, and aggregate ID;
- actor ID when applicable;
- request/correlation ID; derived worker events add a distinct causation ID when the Phase 3 consumer exists;
- deterministic deduplication key;
- redacted payload containing identifiers and changed-field metadata, not secrets or full private bodies;
- attempt count, available time, lock time, processed time, and creation time. Lease ownership, terminal state, and dead-letter metadata are added with the Phase 3 consumer rather than fabricated before a worker exists.

Add a unique tenant-scoped deduplication constraint. Phase 1 proves the row commits and survives restart. Leasing, retries, dead letters, notifications, SSE invalidation, and provider delivery remain Phase 3/4.

## 8. Optimistic version and ETag contract

The Phase 1 API gate requires an integer `version` and ETag on every aggregate exposed for mutation in this phase: work item, Attention signal, and Waiting state. Before any later mutation route is exposed, its aggregate root—such as organization, Portfolio, Workspace, Board, Inbox item, review ritual, decision, or approval—must first gain the same version contract. Repository seams may be prepared without prematurely claiming those future routes are version-safe.

Contract:

- Every detail response and mutable list representation includes `version`.
- A detail or mutation response emits the version as one strong, quoted numeric ETag, for example `ETag: "3"`. Clients send that exact representation as `If-Match: "3"`; all three Phase 1 resources use the same parser and formatter.
- `PATCH`, state-transition, and destructive commands require `If-Match`. Missing precondition returns `428 precondition_required`.
- SQL performs `UPDATE ... WHERE id = ? AND organization_id = ? AND version = ?`, increments the version, and returns the row.
- If no row updates, a second scoped existence query distinguishes a non-leaking 404 from an authorized `409 version_conflict`.
- A conflict returns the current version/ETag and a stable error code, never another tenant's representation.
- Child-set changes such as assignees, dependencies, or custom fields increment the aggregate root once.
- Deletes/archives are version-checked.

The API contract and typed client must preserve the version from list/create/update responses. A response parser that drops `version` fails the Phase 1 gate.

## 9. Durable idempotency

Idempotency applies to retryable creates and commands, including Board/item/capture/comment creation, weekly review, invitation creation, decision/approval transitions, and later external-action requests.

Required persisted fields:

- record ID;
- organization ID and actor user ID;
- client idempotency key;
- normalized HTTP method and route template, not the raw URL;
- SHA-256 fingerprint of the validated canonical request and relevant semantic headers;
- state: `pending` or `completed`;
- response status and a safe replay body or result type/result ID;
- creation, completion/update, and expiry timestamps.

Use a unique key on `(organization_id, actor_user_id, idempotency_key)`. Method, route, and fingerprint are comparison fields, not parts that allow the same actor's key to create a second operation.

Execution algorithm:

1. Validate transport input and authorize the target scope.
2. Canonicalize the validated command and calculate its fingerprint.
3. Begin the database transaction and insert a `pending` idempotency row.
4. On unique conflict, lock and inspect the existing tenant-scoped row.
5. If method, route, or fingerprint differs, return `409 idempotency_conflict` without executing.
6. If the matching record is completed, replay the stored status/body or reconstruct from its result reference, with an `Idempotency-Replayed` response header. Expiry marks cleanup eligibility; it does not make request-time key reuse safe.
7. A concurrent matching insert waits on PostgreSQL's unique-key transaction lock, then replays the committed result; an unexpectedly persistent incomplete record fails closed as a repository service error and never runs the command twice.
8. For a newly acquired key, execute the mutation, audit, and outbox writes; store the durable result and mark the record completed before commit.
9. A database rollback removes the pending record and every partial effect. A lost HTTP response after commit is safely replayed.

Keys are scoped by organization and actor. Reuse in a different organization or by another actor neither conflicts nor reveals the first actor's record. Within one organization/actor scope, key reuse with a different route, method, or payload is always a conflict. Default cleanup eligibility is at least 24 hours; high-risk/import-style commands may require longer. The Phase 1 request path deliberately never deletes or reuses an expired record. A later bounded cleanup job may remove it only after the stored result and related outbox work no longer need replay protection.

Do not persist raw credentials, cookies, tokens, uploaded bodies, or unnecessary personal content in fingerprints or replay payloads.

## 10. Atomic command executor

All mutations use one shared executor with the shape below:

```ts
executeCommand(
  { scope, commandName, idempotency, expectedVersion },
  async (transaction, repositories) => {
    const result = await repositories.workItems.update(...);
    await repositories.audit.append(...);
    await repositories.outbox.enqueue(...);
    return result;
  },
);
```

The executor owns:

- transaction begin/commit/rollback;
- database clock and generated IDs;
- idempotency acquisition/completion;
- expected-version handling;
- audit metadata and request correlation;
- transaction-scoped repository construction;
- stable mapping of domain/database errors.

Test-only fault injection must be able to throw after the business write, after audit, and after outbox. Every case must leave either all intended rows or none.

## 11. API route-to-data-plane map

### Existing routes

| Route                           | Phase 1 live implementation                                                                              | Later-phase boundary                                 |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `GET /api/v1/health`            | Process liveness; live startup validates required database/auth configuration                            | Database readiness/topology health is Phase 4        |
| `GET /api/v1/session`           | Better Auth identity plus an existing scoped application-user membership; no fabricated live user        | Identity provisioning and lifecycle are Phase 2      |
| `GET /api/v1/portfolios`        | `PortfolioRepository.listAccessible(scope)`                                                              | Web consumption is Phase 3                           |
| `GET /api/v1/portfolio`         | Scoped Portfolio read model over Workspaces/items/Attention inputs with one database `asOf` time         | Cache invalidation is Phase 3                        |
| `GET/PATCH /api/v1/attention`   | `AttentionRepository`; PATCH requires ETag/version and atomic audit/outbox                               | Recompute worker is Phase 3                          |
| `GET/PATCH /api/v1/waiting`     | `WaitingRepository`; PATCH is a durable internal state change only                                       | External nudges are Phase 4+                         |
| `GET /api/v1/change-radar`      | Scoped activity/checkpoint query                                                                         | Realtime refresh is Phase 3                          |
| `GET /api/v1/management-memory` | Scoped snapshots, review rituals, and decision outcomes                                                  | Web migration is Phase 3                             |
| `POST /api/v1/reviews/weekly`   | Idempotently appends a durable update/snapshot plus audit/outbox; it does not overwrite Workspace fields | Derived projection/recomputation is Phase 3          |
| `GET /api/v1/insights`          | Either a scoped live repository or unavailable in live mode; never fixture fallback                      | Generation/ranking may be later                      |
| `GET /api/v1/blueprints`        | Either a scoped live repository or unavailable in live mode                                              | Blueprint rollout is outside the minimum golden path |
| `GET /api/v1/team/pressure`     | Explicitly unavailable in live mode; never calculated from fixture Workspaces/items                      | Scoped pressure projection is Phase 3                |
| `GET /api/v1/entitlements`      | Keep explicit development/demo entitlements out of live mode                                             | Billing enforcement is Phase 5                       |
| `POST /api/v1/import/preview`   | Pure validation may remain, but no persistence/success claim                                             | Real import is Phase 5                               |
| `GET /api/v1/workspaces`        | Membership-filtered `WorkspaceRepository` read model                                                     | Web consumption is Phase 3                           |
| `GET /api/v1/workspaces/:slug`  | Scoped Workspace/read-model lookup; unknown and inaccessible slugs are identical                         | Web consumption is Phase 3                           |
| `GET /api/v1/items`             | Deterministic pagination across accessible Workspaces                                                    | Query cache/keyset tuning is Phase 3                 |
| `POST /api/v1/items`            | `createWorkItem` transaction with composite Board/Workspace validation and idempotency                   | Web mutation migration is Phase 3                    |
| `PATCH /api/v1/items/:id`       | `updateWorkItem` with `If-Match`, returned version/ETag, audit/outbox                                    | Conflict UI is Phase 3                               |
| `GET /api/v1/search`            | Hide/unavailable in live mode unless backed by permission-filtered SQL                                   | Ranked production search is Phase 5                  |
| Organization/Board exports      | Hide/unavailable until every included repository is scoped and export is audited                         | DSAR/export hardening is Phase 5                     |
| `GET /api/v1/events`            | Do not imply durable realtime; a static `ready` event is not a data plane                                | Outbox-to-SSE invalidation is Phase 3                |

### Repository seams prepared now but exposed later

| Future surface         | Phase 1 seam                                          | Public route/UI phase                  |
| ---------------------- | ----------------------------------------------------- | -------------------------------------- |
| Organizations/users    | Scoped organization and member directory repositories | Phase 2                                |
| Membership/invitations | Durable commands and tests                            | Phase 2                                |
| Boards/groups/statuses | Repository and transactions                           | Phase 3                                |
| Inbox/Quick Capture    | Capture, list, snooze, complete, convert commands     | Phase 3                                |
| Comments/updates       | Repository and mutation transactions                  | Phase 3                                |
| Decisions/approvals    | Typed lifecycle commands                              | Phase 3                                |
| Teams/Messages         | None in this document                                 | Phase 4 after schema/API/policy design |

Any current handler that cannot use the mapped live repository must return an explicit unavailable/capability response in live mode. It must not read `demo*` arrays or process-local Maps.

## 12. Explicit demo/live selection

Mode is parsed once at the application composition root and must be one of the two explicit values:

```text
DEMO_MODE=true | false
```

Rules:

- Missing, empty, or unknown values abort startup.
- `true` creates the explicit per-application fixture adapter. It is allowed on the hosted technical preview only while the release/capability mode visibly identifies fictional, non-persistent data.
- `false` requires database, Better Auth, and Web-origin configuration, creates the live repository set, and uses the real clock. Migration compatibility is enforced by the release migration gate rather than silently selecting another adapter.
- A live database error returns a visible service error; it never switches to demo data.
- The adapter is selected once during startup and injected into the app factory. A request cannot choose it.
- Tests run explicit demo and PostgreSQL-backed live suites. Live mutation correctness never depends on `org-demo`, `user-owner`, fixture arrays, process-local Maps, or a fixed demo clock.
- Closed alpha and later environments must use `DEMO_MODE=false`; deployment policy must reject any live release that selects the demo adapter.

## 13. Integration and isolation test matrix

Phase 1 requires PostgreSQL tests, not repository mocks, for correctness gates.

### Database and migration

- Clean migrate, seed only in explicit demo/test, then exercise every repository.
- Upgrade from the last released migration with representative rows.
- Validate every composite FK, unique index, check constraint, version default, and outbox/idempotency index.
- Run tenant-mismatch inserts directly and prove PostgreSQL rejects them.
- Prove a work item cannot reference a Board from another Workspace, while a dependency between two accessible Workspaces in the same organization succeeds.
- Prove a dependency whose endpoint items belong to different organizations is rejected.

### Tenant isolation

- Create two organizations with users, Portfolios, Workspaces, Boards, and similarly shaped records.
- Cover every Phase 1 mapped live route and representative high-risk repository families with IDs from another organization and an inaccessible Workspace. Expand this to every future public method when that surface is introduced.
- Assert identical non-leaking errors and no count/cursor/timing detail in the public contract.
- Verify users are discoverable only through membership in the scoped organization.

### Transaction atomicity

- Inject a failure inside the shared command transaction and assert domain, audit, outbox, and idempotency rows roll back together.
- Phase 1 covers public WorkItem commands and representative Portfolio/Inbox/operating-loop commands. Phase 2/3 must add command-specific fault points when invitation acceptance, assignment, reviewer, and approval workflows become public.

### Concurrency and idempotency

- Run two updates with one version: exactly one commits and one receives `version_conflict`.
- Run the same idempotent command concurrently against two API instances: one effect, one audit record, one logical outbox event, replayed result.
- Same actor/key + same command replays; same actor/key + different route, method, or body conflicts.
- The same key used by another actor or organization is isolated and does not disclose or replay the first actor's result.
- Restart the API between request and replay and get the same durable result.
- Expiry cleanup is not implemented in Phase 1; request paths never reuse or delete an expired record. A later cleanup worker must prove it cannot race pending operations or unprocessed outbox rows.

### Multi-instance durability

- Write through API instance A, read through instance B, restart both, and read the same row/version.
- Remove all process-local Maps from live mutation paths and test module order independence.
- Prove no live route reads fixture arrays when the database is unavailable.

### Query behavior

- Use stable deterministic pagination with explicit cursor validation; tune keyset ordering before production scale.
- Test archive/delete filtering, accessible totals, and cursor scope binding.
- Add representative query-plan assertions before production-volume rollout; Phase 1 functional tests use deterministic fixture volumes and do not claim production query tuning.

## 14. Implementation order

1. Add `TenantScope`, scoped repository factory, error types, database clock/ID providers, and import-boundary enforcement.
2. Inventory and migrate composite tenant constraints; add missing aggregate versions and idempotency/outbox metadata.
3. Implement audit, outbox, and idempotency repositories plus the atomic command executor.
4. Implement organization/member, Portfolio, Workspace, Board, and work-item repositories.
5. Implement Inbox/capture, comments/updates, Attention, Waiting, decisions/approvals, reviews, and snapshots.
6. Replace each eligible live API Map/fixture path with an injected application query or command; unsupported live routes fail explicitly.
7. Add clean/upgrade migration tests, two-tenant repository tests, transaction fault tests, idempotency concurrency tests, and two-instance restart tests.
8. Update the API contract/client so all mutable resources retain `version`, ETag, idempotency, and stable error semantics.
9. Run the full quality, migration, API integration, build, browser-demo, accessibility, and dependency gates. The browser remains demo-backed until Phase 3.

## 15. Phase 1 exit checklist

- [x] No live API mutation depends on a process-local Map.
- [x] Every live repository requires a branded `TenantScope` or a narrowly defined pre-membership scope reserved for Phase 2.
- [x] Every business SQL statement includes organization scope, and every mapped API result/mutation applies resolved resource access.
- [x] Composite database constraints reject cross-tenant and cross-Workspace references.
- [x] Data survives API restart and reads consistently across two instances.
- [x] Work-item, Attention, and Waiting mutation responses preserve version/ETag and enforce `If-Match`; tests prevent exposing another mutable aggregate before it implements the same contract.
- [x] Durable idempotency safely replays matching requests and rejects mismatched reuse.
- [x] Every in-scope live mutation atomically writes its required domain, audit, and outbox rows.
- [x] Transaction fault coverage proves partial domain/audit/outbox/idempotency effects leave no rows.
- [x] Demo/live selection is explicit, startup-validated, and has no fallback.
- [x] Unsupported live routes return an honest unavailable response rather than fixtures.
- [x] Clean and previous-release migration paths pass on PostgreSQL.
- [x] Two-organization isolation tests cover the shared live access resolver and representative high-risk repository families.
- [x] API contracts, client parsers, and tests retain version/ETag/idempotency semantics.

Acceptance evidence is executable rather than aspirational: 24 PostgreSQL repository integration cases cover clean/upgrade migration, restart and multi-instance reads, tenant and aggregate isolation, archive filtering, lifecycle integrity, optimistic concurrency, durable replay, concurrent idempotency, rollback, and audit/outbox atomicity. Three PostgreSQL-backed HTTP/client cases cover live identity/access resolution, complete paged reads, non-leaking failures, empty-Portfolio access, cross-organization rejection, restart durability, ETags, and idempotency round trips. The package/API suites additionally enforce repository import boundaries, explicit adapter selection, canonical validation/errors, and contract semantics.

## 16. Explicit Phase 3 deferrals

The following are **not** reasons to extend Phase 1 or declare it incomplete:

- replacing Web seed/localStorage reads and writes;
- shared client query caching and optimistic rollback;
- browser conflict, stale, retry, and offline UI;
- cross-browser invalidation, SSE, and realtime presence;
- worker leasing, retries, dead letters, and Attention recomputation;
- notification delivery and external nudges;
- AI capture classification or automatic assignment;
- public Board defaults/move commands, dependency-cycle UI, comment/mention workflows, and reviewer-authority workflows;
- Teams, Messages, integration sync, files, imports, billing, mobile, or desktop parity.

However, Phase 1 must provide the durable repository, version, audit, idempotency, and outbox seams those later workflows require. Phase 3 must not need to bypass or redesign the tenant boundary to connect the founder operating loop.
