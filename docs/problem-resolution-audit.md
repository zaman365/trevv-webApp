# TREVV system problem-resolution audit

## Audit record

| Field                           | Value                                                                                                                                                                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audit date                      | 2026-08-29 (Europe/Berlin)                                                                                                                                                                                                        |
| Audited commit                  | `89e7ade` (`main`, tracking `origin/main`)                                                                                                                                                                                        |
| Working tree before this report | Clean                                                                                                                                                                                                                             |
| Method                          | Static, evidence-backed review of the monorepo, product routes, clients, API, contracts, schema, workers, tests, CI, deployment configuration, and operating documentation                                                        |
| Current verdict                 | **Pre-alpha / production-shaped demo.** The interface, domain model, schema, and test foundations are substantial, but the deployed system is not ready for real customer data, multi-user collaboration, or paid production use. |

This is a code and configuration audit, not a penetration test, load test, live infrastructure review, or legal opinion. A green browser suite proves that the deterministic demonstration works; it does not prove tenant isolation, durable persistence, background delivery, billing correctness, or recovery in the deployed environment.

## Executive verdict

TREVV has a credible product core: explainable Attention signals, portfolio roll-ups, Waiting, decisions, approvals, reviews, and cross-workspace pressure are modeled as deterministic domain behavior. It also has useful foundations in Zod/OpenAPI contracts, Drizzle schema, centralized permissions, idempotency, optimistic version checks, accessibility tests, and CI database migration checks.

The blocking issue is architectural truthfulness. The Web experience mostly reads seeded data and writes browser-local state, while the API mostly reads the same demo corpus and stores mutations in process memory. The sign-in and onboarding screens do not authenticate or provision anything. The application route is not guarded. The API validates a Better Auth session only when demo mode is disabled, but still grants the hard-coded demo owner and organization. Production CI deploys only the Web Worker, not the API, background worker, PostgreSQL, or object storage described by the architecture documents.

Consequently, `https://trevv.de` may be a deployed production URL, but the product behind it is a hosted demonstration. Until the P0 release gate in this report passes, it must not be described as a secure, persistent, multi-tenant production service.

### Companion production probe

A live probe on the audit date corroborated the source review: anonymous requests to `/app/portfolio` and workspace Settings returned 200; `/api/v1/health`, `/privacy`, `/terms`, `/.well-known/security.txt`, and `/sitemap.xml` returned 404; and multiple valid module names under an unknown workspace slug returned 200. These are observations of the audited deployment, not durable guarantees. The source explains them: the root redirects directly into the app (`apps/web/app/page.tsx:1-4`), the app layout has no auth check (`apps/web/app/app/layout.tsx:9-21`), deployment contains only Web (`.github/workflows/ci.yml:135-144`), and the dynamic module route validates `view` but not `workspaceSlug` (`apps/web/app/app/workspaces/[workspaceSlug]/[view]/page.tsx:18-61`).

## Validation and strengths worth preserving

These are not release waivers; they are foundations to retain while replacing the demo runtime.

- The CI quality job provisions PostgreSQL 17, verifies the generated OpenAPI document, migrates and seeds a clean database, then runs lint, typecheck, tests, build, and a dependency audit (`.github/workflows/ci.yml:11-56`). Browser and accessibility suites are independent gates (`.github/workflows/ci.yml:58-102`).
- The API already applies Hono secure headers and a credentialed, configured-origin CORS policy, and propagates request IDs (`apps/api/src/app.ts:64-83`).
- The permissions package centralizes organization/workspace role checks and deliberately returns a non-revealing permission error (`packages/permissions/src/index.ts:1-35`, `packages/permissions/src/index.ts:44-105`).
- Item creation has an idempotency-key seam, and item updates have an `If-Match` version-conflict seam (`apps/api/src/app.ts:565-653`; contract documentation at `packages/api-contract/src/openapi.ts:194-260`).
- The database schema already covers organizations, memberships, invitations, portfolios, workspaces, and workspace members (`packages/db/src/schema.ts:130-306`), as well as billing foundations (`packages/db/src/schema.ts:791-911`) and messaging foundations (`packages/db/src/schema.ts:1380-1543`).
- The typed API client validates successful and error responses, carries credentials, and preserves request IDs in errors (`packages/api-client/src/index.ts:18-73`).
- Known limitations are unusually candid: the repo says the polished Web uses seeded data/local state, demo mode is the default, integrations are mock/foundations, search is a demo corpus, and the worker is not connected (`docs/known-limitations.md:3-14`). This document should become the source of truth over more optimistic claims elsewhere.
- Web deployment has Cloudflare logs and traces enabled (`apps/web/wrangler.jsonc:9-18`). That is useful, but currently covers only the deployed Web surface.

## Priority model and dependency rule

- **P0 — release blocker:** can expose customer data, falsely represent persistence/security, prevent real tenant use, or make recovery impossible. All P0 items must be complete before a closed alpha accepts real customer data.
- **P1 — private/public beta blocker:** required for dependable automation, integrations, billing, operations, and support at pilot scale.
- **P2 — GA quality or deliberate scope decision:** product completeness, native clients, full localization, and refinements that may be deferred if the product clearly says so.

The dependency order is strict:

1. truthful demo/production separation;
2. repositories and durable transactions;
3. authentication, membership, and tenant authorization;
4. Web-to-API migration of the founder operating loop;
5. transactional outbox and worker;
6. Teams/Messages and external side effects;
7. production runtime and production-like CI;
8. integrations, billing, compliance, and scale hardening;
9. native-client expansion and full localization.

Do not connect integrations, enable payments, or market collaborative security before steps 1-7 are complete.

---

## P0 findings — must be resolved before closed alpha

### P0-01 — Sign-in, sign-up, and onboarding are visual simulations

**Evidence**

- Both authentication modes render a form whose action is simply `/app/portfolio`; the inputs have no names or authentication submission handler, and the demo button links to the same route (`apps/web/components/auth-experience.tsx:87-149`).
- Onboarding only updates the local `step` and `managing` state. Its organization/workspace/blueprint/invite/import controls are uncontrolled UI, and the final action is a link to Portfolio (`apps/web/components/auth-experience.tsx:162-216`, `apps/web/components/auth-experience.tsx:218-410`).
- Better Auth exists server-side, but email verification is explicitly disabled (`packages/auth-server/src/index.ts:11-23`).

**Impact**

The UI can imply that a password was checked and an organization, workspace, privacy setting, or invitation was created when none of those actions occurred. A visitor can enter `/app` without an account. This is a trust and security blocker and makes activation metrics meaningless.

**Root cause**

The product shell was built against a deterministic demo before the identity/provisioning workflow was connected to the Web client and database.

**How to fix**

1. Create a deliberate, separately branded demo entry that never accepts or suggests real credentials.
2. Wire sign-up/sign-in/sign-out, verification, reset, and session revocation to Better Auth using secure same-site HTTP-only cookies.
3. Make onboarding a server transaction that creates or resumes: `app_user` mapping, organization, owner membership, default portfolio, first workspace, board/blueprint instance, and an auditable onboarding checkpoint.
4. Store form progress safely server-side or in short-lived draft state; handle retries idempotently.
5. Enable email verification before invitations or external collaboration. Do not ship two-factor/session-security toggles until they control real auth state.

**Acceptance test / definition of done**

- A new user verifies an email, signs in, completes onboarding once, refreshes, and sees the same provisioned organization from a second browser.
- Wrong credentials fail; an anonymous request to `/app/portfolio` redirects to sign-in; sign-out invalidates the server session.
- Replaying the final onboarding request creates no duplicate organization, portfolio, workspace, board, or membership.
- E2E tests assert database rows and session cookies, not only heading changes.

**Depends on:** P0-02 and P0-04. Blocks every real-user release.

### P0-02 — Application routes are unguarded, and authenticated sessions are not mapped to tenant membership

**Evidence**

- The `/app` layout only reads a workspace-selection cookie and renders its children; it performs no authentication or membership check (`apps/web/app/app/layout.tsx:9-21`).
- The repository has no Web middleware/proxy auth gate; the application route tree contains direct app pages but no auth error/loading boundary (`apps/web/app/app/layout.tsx`, route inventory under `apps/web/app/app/`).
- With `DEMO_MODE=false`, API middleware checks only that Better Auth returned a user and then always installs `demoAccess()` (`apps/api/src/app.ts:98-117`).
- `/api/v1/session` always returns `user-owner` and `org-demo` (`apps/api/src/app.ts:128-139`).
- The product schema already distinguishes auth identities, application users, organization memberships, portfolio membership, and workspace membership (`packages/db/src/schema.ts:143-237`, `packages/db/src/schema.ts:287-306`, `packages/db/src/schema.ts:1545-1563`), but no runtime mapping uses them.

**Impact**

Authentication is not authorization. Any authenticated identity would receive the demo owner's access context, and no live request derives organization/workspace access from database membership. This would become a critical cross-tenant exposure as soon as real records are connected.

**Root cause**

Demo access was left as the only access-context implementation while the schema and policy were built ahead of repositories.

**How to fix**

1. Add a server-only session resolver that maps Better Auth user ID/email to exactly one `app_users` record and its active memberships.
2. Require an explicit active organization context; derive accessible portfolios/workspaces from membership queries on every request.
3. Construct `AccessContext` from those rows. Never accept `organizationId`, role, or accessible workspace IDs from the client.
4. Guard all `/app` routes on the server. Re-check authorization in every API repository query and mutation; keep non-leaking 404 semantics.
5. Add invitation acceptance, membership revocation, organization switching, and session-revocation flows.
6. Make production startup fail closed if `DEMO_MODE` is not exactly `false`, auth/database configuration is incomplete, or a demo seed identifier is referenced.

**Acceptance test / definition of done**

- Matrix tests cover Owner, Admin, Workspace Lead, Member, Guest, and Viewer against every protected resource/action.
- Two organizations in separate browser contexts cannot list, search, export, subscribe to events for, or mutate each other's guessed IDs.
- Revoking membership takes effect on the next API request and active stream reconnect.
- Production-mode tests contain no `org-demo`, `user-owner`, or `demoAccess()` path.

**Depends on:** P0-04. Blocks P0-01, P0-03, P0-06, and production data.

### P0-03 — Web business data is seeded or browser-local instead of canonical server state

**Evidence**

- All shared workspace scope is derived from `demoItems`, `demoWaitingStates`, and `demoDependencies`; the clock is fixed to 2026-08-24 with a comment to replace it only when data becomes live (`apps/web/lib/attention.ts:1-22`, `apps/web/lib/attention.ts:139-193`).
- Workspace creation writes generated records to localStorage (`apps/web/lib/custom-workspaces.ts:22-97`, `apps/web/lib/custom-workspaces.ts:117-134`).
- Quick Capture writes localStorage (`apps/web/lib/captured-work.ts:23-44`, `apps/web/lib/captured-work.ts:64-72`).
- Boards initialize from seed records, read/write localStorage, and mutate React state (`apps/web/components/board-experience.tsx:209-331`).
- Messages and conversations initialize from seed arrays and persist to localStorage (`apps/web/components/messaging-workspace.tsx:133-209`).
- The repository's own limitation statement confirms that Web interactions use seeded domain data and optimistic local state (`docs/known-limitations.md:3-6`).

**Impact**

Data is device/browser-specific, can disappear, can diverge across tabs and users, is not permission controlled, and does not update the API's portfolio/Attention calculations. The interface can report successful work that collaborators and other devices will never see.

**Root cause**

Components own both presentation and business state. The typed client is present in Web dependencies but product screens were not migrated onto a query/mutation data layer.

**How to fix**

1. Define one canonical resource graph and repository contract for portfolios, workspaces, boards, items, inbox, decisions, approvals, waiting states, reviews, teams, and messages.
2. Migrate read paths to server-fetched, permission-filtered data through `@founderhq/api-client` and a shared query cache.
3. Migrate writes one vertical slice at a time. Optimistic state may improve latency, but the server response remains canonical and failed writes must roll back visibly.
4. Keep localStorage only for harmless preferences, non-sensitive drafts, and an explicitly designed offline cache. Namespace it per authenticated user/organization and clear it on sign-out.
5. Replace fixed demo time with injected current time on live paths; keep deterministic clocks only in tests/demo fixtures.
6. Remove silent fallback from live mode. An API outage must show a stale/offline state, not plausible seeded customer data.

**Acceptance test / definition of done**

- A create/update/delete made in browser A appears in browser B and mobile after invalidation, survives API restart, and changes the derived Portfolio/Attention result.
- A failed mutation restores the previous UI and provides retry/details; a `409` opens a conflict-resolution flow.
- Production builds contain no writable business localStorage keys such as `trevv:custom-workspaces`, `trevv:captured-work`, `trevv:board:*`, `trevv:messages`, or `trevv:workspace-teams:*`.
- Live data is never replaced by demo fixtures when a request fails.

**Depends on:** P0-04 and P0-02. Blocks all collaborative workflows.

### P0-04 — API mutations are process-memory operations; repositories are absent

**Evidence**

- API startup creates a fixed demo clock and process-local `Map` stores for items, idempotency keys, Attention, and Waiting (`apps/api/src/app.ts:42-62`).
- Item create/update writes those Maps (`apps/api/src/app.ts:565-653`). Restarting the process loses changes and idempotency history.
- Portfolio/workspace/search endpoints read the demo corpus (`apps/api/src/app.ts:142-193`, `apps/api/src/app.ts:496-524`, `apps/api/src/app.ts:655-675`).
- Weekly review returns generated update/snapshot IDs and `attentionRefreshed: true` without writing a repository or outbox record (`apps/api/src/app.ts:361-410`).
- `packages/db` exports only a database constructor and schema; it has no repository implementation (`packages/db/src/index.ts:1-10`). This conflicts with the repository topology described at `docs/architecture.md:8-13`.
- Item create authorizes only the supplied `workspaceId` and then accepts `boardId` without proving that the board belongs to that workspace (`apps/api/src/app.ts:565-603`). The schema gives work items independent workspace and board foreign keys but no composite tenant/workspace integrity constraint (`packages/db/src/schema.ts:308-338`, `packages/db/src/schema.ts:381-426`).
- Idempotency keys are global, process-local, and payload-blind (`apps/api/src/app.ts:45-49`, `apps/api/src/app.ts:580-603`). A reused key with different input returns the first item rather than reporting misuse.
- The API returns an item `version`, but `workItemSchema` does not include it (`packages/api-contract/src/index.ts:109-125`), and the client parses create/update responses through that unversioned schema (`packages/api-client/src/index.ts:120-142`). A client therefore cannot reliably retain the value required for its next `If-Match` update.

**Impact**

There is no durable source of truth, transactional authorization boundary, multi-instance consistency, or recoverable audit history. A rolling deploy or crash loses mutations. Idempotency does not work across processes.

**Root cause**

Schema and API transport were implemented as foundations, while real repositories and transaction orchestration were deferred.

**How to fix**

1. Implement typed repository modules in `packages/db` with mandatory `organizationId` and access scope on every query.
2. Use database transactions for aggregate writes and insert an outbox event in the same transaction.
3. Persist idempotency keys with request fingerprint, result reference, tenant, and expiry; persist version columns for optimistic concurrency.
4. Resolve `boardId` through the authorized organization/workspace instead of trusting two independent client IDs; add database constraints or transaction checks that prevent cross-workspace relationships.
5. Define one versioned work-item response/ETag contract and use it in list/create/update client methods. Reject an idempotency-key replay whose tenant, route, method, or request hash differs.
6. Convert endpoints from demo adapters to injected live repositories. Keep a separate explicit demo adapter for fixture mode.
7. Implement migration-safe timestamps, soft-delete/archive policy, audit events, pagination, and consistent error mapping.
8. Add integration tests against clean PostgreSQL and restart tests against a second API process.

**Acceptance test / definition of done**

- API restart and horizontal-instance tests preserve records, versions, idempotency results, reviews, waiting actions, and Attention state.
- Every repository query is organization scoped; automated SQL/IDOR tests fail if the predicate is omitted.
- Mutations and their outbox rows commit or roll back together.
- Web golden-path tests run with `DEMO_MODE=false` and assert database state.
- A board from another workspace/organization is rejected; version survives every client parse; same-key/same-payload replays safely, while same-key/different-payload returns a conflict.

**Depends on:** none; this is the foundational engineering work.

### P0-05 — Production deploys the Web demonstration, not the documented system

**Evidence**

- The documented topology requires separate Web, API, Worker, PostgreSQL, and private object storage (`docs/deployment.md:3-11`) and gives a database → API → Worker → Web release order (`docs/deployment.md:27-37`).
- The actual deploy job only runs `pnpm --filter @founderhq/web deploy:cloudflare` and checks one Portfolio URL (`.github/workflows/ci.yml:104-149`).
- The only checked-in production route/config is the Web Cloudflare Worker and domain (`apps/web/wrangler.jsonc:1-18`).
- The audit-date production probe found `https://trevv.de/api/v1/health` returning 404, consistent with the missing API deployment.

**Impact**

Production cannot support durable API reads/writes, background work, attachments, provider callbacks, or recovery. A `200` response from Portfolio is not an end-to-end production health check.

**Root cause**

Deployment automation was added around the only deployable hosted artifact before the runtime topology existed.

**How to fix**

1. Provision managed EU PostgreSQL with PITR, private object storage, API runtime, worker runtime/scheduler, secret manager, and observability destinations as infrastructure-as-code.
2. Add a dedicated migration job with a least-privilege identity and backward-compatible expand/migrate/contract discipline.
3. Deploy and health-check API, then worker/outbox, then Web, as the existing deployment document specifies.
4. Add runtime configuration validation and a release manifest tying Web/API/worker/schema versions together.
5. Add end-to-end smoke probes for auth, a permission-scoped read, a durable mutation, worker consumption, export, and rollback—not just anonymous HTML.

**Acceptance test / definition of done**

- A production-like staging deployment provisions all required services from code and passes the full smoke path with `DEMO_MODE=false`.
- A migration, API, worker, or auth smoke failure prevents Web promotion.
- A restore drill authenticates a test user, loads Portfolio, verifies one attachment, and exports the restored organization as required by `docs/operations.md:19-21`.
- Production has a documented, exercised rollback/forward-fix procedure and no seed operation in the normal release path.

**Depends on:** P0-04 and P0-02. Blocks real customer data.

### P0-06 — Teams and Messages have incompatible client, contract, schema, and permission models

**Evidence**

- Web defines team capabilities, membership, and inheritance and stores the snapshot in localStorage (`apps/web/lib/teams.ts:1-110`, `apps/web/lib/teams.ts:185-223`).
- Web conversations can carry `teamId`, and team rooms are synchronized locally (`apps/web/lib/messaging-data.ts:16-44`; `apps/web/components/messaging-workspace.tsx:177-230`).
- The database has workspace members and conversations/participants/messages, but no team table, team-member table, team-capability policy relation, or `team_id` on conversations (`packages/db/src/schema.ts:287-306`, `packages/db/src/schema.ts:1380-1494`).
- Contract schemas define conversations/messages but no team ID on `conversationSchema` (`packages/api-contract/src/index.ts:236-332`). The OpenAPI path list ends without any team, conversation, or message endpoints (`packages/api-contract/src/openapi.ts:25-326`), and the typed client exposes none (`packages/api-client/src/index.ts:75-143`).
- The centralized policy has no `team`, `conversation`, or `message` resource and no team capability semantics (`packages/permissions/src/index.ts:1-21`, `packages/permissions/src/index.ts:44-90`).

**Impact**

The UI says team members inherit features and can enter private/guest rooms, but nothing enforces this server-side. Connecting the current UI to shared data would risk unauthorized message/resource access and inconsistent membership.

**Root cause**

Teams were added as a client feature after the initial workspace-level schema and policy, without an end-to-end domain migration.

**How to fix**

1. Decide whether a team capability is an authorization grant, a feature preset, or both. Do not conflate navigation visibility with data access.
2. Add tenant-scoped `teams`, `team_members`, and, if required, capability/role tables plus `conversations.team_id` and constraints that team/workspace/organization agree.
3. Extend contracts, OpenAPI, client, repositories, and policy for team CRUD, membership, conversation list/create, message pagination/send/edit/reaction/read state, and room membership.
4. Create/update/delete a team and its default room atomically. Membership changes must update room participants consistently and audit the change.
5. Enforce private, organization, and guest-scoped visibility in repository queries and realtime subscriptions.
6. Decide whether Messages belongs in alpha. If not, hide it together with Teams; do not ship a local-only collaboration illusion.

**Acceptance test / definition of done**

- Creating a team creates exactly one durable room; retrying does not duplicate it.
- Adding/removing a member changes authorized room access immediately and is visible on another device.
- A non-participant cannot list, fetch, search, stream, or guess messages; a guest sees only explicitly shared guest-scoped rooms.
- Team capability changes have audited, server-enforced effects and cannot escalate the editor's own privileges.
- Concurrent messages retain deterministic order and idempotent client IDs.

**Depends on:** P0-02, P0-04, and P1-01. Blocks real Teams/Messages.

### P0-07 — The service worker can cache private documents and API responses across sessions

**Evidence**

- The shell precaches `/app/portfolio` (`apps/web/public/sw.js:1-9`).
- Every same-origin navigation and matching `/api/v1/` GET is eligible for caching; every successful response is stored by its request key (`apps/web/public/sw.js:25-49`).
- On network failure, it returns the cached request or the cached Portfolio document (`apps/web/public/sw.js:51-55`).
- There is no check for authentication, `Cache-Control: private/no-store`, user or organization identity, logout purge, or response `Vary` policy.

**Impact**

On a shared device, a later user or signed-out session could receive cached authenticated HTML/API data from a previous session. Cached data can also look current when access was revoked. This becomes a direct confidentiality problem once live customer data is connected.

**Root cause**

An application-shell caching strategy was applied to authenticated routes and API reads without a per-user encrypted/offline data design.

**How to fix**

1. Immediately stop precaching authenticated app routes and stop caching `/api/v1/*` responses in the generic Cache API.
2. Cache only fingerprinted static assets and a public offline shell. Honor `Cache-Control` and never cache `no-store`, auth, export, search, message, or user-specific responses.
3. If offline private reads are later required, use an explicit per-user/tenant IndexedDB store, encrypted where appropriate, with TTL/version metadata, logout/revocation purge, and clear stale labeling.
4. Implement offline mutation queues only after conflict semantics and idempotency are complete.

**Acceptance test / definition of done**

- After user A signs out and the device is offline, user B or an anonymous visitor cannot retrieve any A HTML/API content from service-worker caches.
- DevTools/cache tests show only static assets and a public offline shell in Cache Storage.
- Revocation/logout messages purge all scoped offline records and waiting service workers.
- Automated tests cover online, offline, expired, revoked, and cross-user scenarios.

**Depends on:** none for the immediate safe fix; private offline support depends on P0-02/P0-03.

### P0-08 — Demonstration actions can falsely claim real external or durable effects

**Evidence**

- Waiting can offer Email/Slack channels, but submission only changes local state, and the dialog says it does not contact anyone (`apps/web/components/management-experience.tsx:231-248`, `apps/web/components/management-experience.tsx:269-372`).
- Import shows a hard-coded file, 184 rows, and a local “Import complete” state that claims 179 records were created (`apps/web/components/management-experience.tsx:1504-1535`, `apps/web/components/management-experience.tsx:1574-1681`).
- Settings exports are generated in the browser for the demo, despite production-oriented copy (`apps/web/components/settings-experience.tsx:1531-1599`).
- Email settings explicitly save account labels only (`apps/web/components/email-inbox-workflow.tsx:1296-1303`).
- Security/integration settings are browser state, while controls use terms such as two-step verification, sessions, “Set up,” and “Manage” (`apps/web/components/settings-experience.tsx:1058-1160`; local settings persistence at `apps/web/components/settings-experience.tsx:389-425`, `apps/web/components/settings-experience.tsx:499-546`).

**Impact**

Users may rely on a notification that was never sent, believe records were imported, believe security controls are active, or believe a provider/account is connected. This is a product-safety and trust blocker even before confidential data is stored.

**Root cause**

The demonstration was made highly interactive without a global capability mode or consistent copy rules for simulated actions.

**How to fix**

1. Add a server-delivered capability manifest for `demo`, `staging`, and `live` modes.
2. In demo mode, add a persistent “sample data / changes stay in this browser” banner and use verbs such as “Preview,” “Draft,” and “Simulate.”
3. In live mode, hide or disable any control without a real server implementation. Never show success until the authoritative operation succeeds.
4. Add structured success/error receipts containing a server request ID for durable or external actions.
5. Maintain a feature-status table in source and tests so unsupported controls cannot regress into production.

**Acceptance test / definition of done**

- Automated copy/capability tests verify that no live UI exposes simulated sign-in, invite, send, import, export, connect, revoke, publish, security, billing, upload, or automation success.
- Demo screenshots and every destructive/external action clearly state its scope before confirmation.
- Support can trace each live external action from UI receipt to audit/outbox/provider result.

**Depends on:** none for hiding/labeling; enabling each feature depends on its corresponding live implementation.

### P0-09 — CI does not exercise the real production mode or full deployed topology

**Evidence**

- The quality job sets `DEMO_MODE: "true"` (`.github/workflows/ci.yml:27-32`).
- PostgreSQL is migrated/seeded, but the browser jobs do not declare PostgreSQL, API, Better Auth, or production-mode environment; they run the demo-facing browser suites (`.github/workflows/ci.yml:58-102`).
- Deployment only checks that `/app/portfolio` returns HTTP 200 (`.github/workflows/ci.yml:135-144`).
- Contract generation verifies a hand-maintained document but not route conformance: the implemented weekly-review route exists at `apps/api/src/app.ts:361-410` and is absent from the complete OpenAPI path map at `packages/api-contract/src/openapi.ts:25-326`. The item patch body is also documented only as an empty object while runtime accepts named fields (`packages/api-contract/src/openapi.ts:236-260`; `packages/api-contract/src/index.ts:342-351`).

**Impact**

CI can stay green while real auth, membership, repositories, API/worker deployment, migrations, side effects, or tenant isolation are broken. The current gates validate the demonstration, not the intended architecture.

**Root cause**

Tests were optimized around the deterministic Web experience before the production data plane existed.

**How to fix**

1. Keep fast unit/demo suites, but add a production-mode integration job with PostgreSQL, API, worker, auth mail sink, object-storage emulator, and Web configured with `DEMO_MODE=false`.
2. Test two users/two tenants, invite acceptance, the founder golden path, restart persistence, outbox retry, permission-filtered search/export/events, upload controls, and conflict handling.
3. Add migration tests from the last released schema, not only a clean database.
4. Add a staging promotion gate and post-deploy synthetic checks across Web/API/worker/database.
5. Generate or conformance-test OpenAPI from the routing/validation source. Fail when a runtime route/method is missing, request/response schemas differ, or an advertised endpoint lacks a client method.

**Acceptance test / definition of done**

- A deliberate removal of an organization predicate, route guard, repository write, outbox insert, or API deployment makes CI fail.
- The release pipeline tests both clean install and previous-release upgrade.
- The production smoke creates a uniquely tagged record, observes worker processing, then removes/archives it through an auditable cleanup path.

**Depends on:** P0-02 through P0-06 and P1-01.

### P0-10 — Documentation overstates implementation and obscures release status

**Evidence**

- The implementation report calls the Web the complete product surface “supported by” API, persistence, worker, mobile, and desktop (`docs/implementation-report.md:3-7`) and says Web, Expo, and Tauri consume the client (`docs/implementation-report.md:9-16`). In source, Web product screens are demo/local, and desktop falls back to seed data (`apps/desktop/src/desktop-app.tsx:20-38`).
- Architecture says the API owns rate limits/webhooks and `packages/db` owns repositories (`docs/architecture.md:8-21`), while no repository implementation exists (`packages/db/src/index.ts:1-10`), no rate limiter is installed in the API middleware shown at `apps/api/src/app.ts:64-83`, and integrations reject/discard provider behavior (`packages/integrations/src/index.ts:61-68`).
- `docs/known-limitations.md:3-14` gives the more accurate state.

**Impact**

Engineering, stakeholders, and users can make unsafe release decisions because “implemented,” “complete,” “production,” “foundation,” and “demo” are used inconsistently.

**Root cause**

Architecture-intent documents and implementation-status documents were not separated or updated as the code evolved.

**How to fix**

1. Mark architecture diagrams explicitly as **target architecture** until deployed.
2. Replace the implementation report with a generated or reviewed capability matrix: UI present, demo interactive, API contract, repository, deployed, permission tested, production ready.
3. Make `known-limitations.md` and this audit release-gate inputs; update them in the same pull request that changes a capability status.
4. Remove “complete” and “live” claims unless backed by an end-to-end production-mode test.

**Acceptance test / definition of done**

- Every advertised capability maps to a live endpoint/repository/deployment/test, or is labeled demo/planned.
- A release checklist requires product and engineering sign-off on the capability matrix.
- README, implementation report, architecture, deployment, and UI language agree on the release stage.

**Depends on:** none. The first truth pass should happen immediately.

### P0-11 — Public route, indexing, and metadata behavior is not release-safe

**Evidence**

- The audit-date production probe found anonymous Portfolio and Settings routes returning 200, unknown workspace slugs returning 200 for several valid module names, and no privacy, terms, security contact, sitemap, or API health endpoint.
- The dynamic workspace-module route validates only the module name and passes the unchecked slug into a component (`apps/web/app/app/workspaces/[workspaceSlug]/[view]/page.tsx:18-61`). The shared chrome then falls back to the current/first accessible demo context if the slug is not found (`apps/web/components/workspace-frame.tsx:188-225`).
- There is no `robots.ts`, `sitemap.ts`, or `.well-known/security.txt` route in `apps/web/app/`, so the hosted private application has no checked-in no-index policy or security contact.
- Social metadata falls back to `http://localhost:3000` when `NEXT_PUBLIC_APP_URL` is missing (`apps/web/app/layout.tsx:12-40`). The root layout also imports all app metadata globally, including authenticated routes.

**Impact**

Private/sample application URLs can be indexed, invalid resources can look valid, monitoring receives misleading 200s, legal/security contact pages are absent, and production social links can point to localhost. These are both trust problems and symptoms of missing fail-closed production configuration.

**Root cause**

The public demo shell and future authenticated product share one route/metadata policy, while runtime configuration and resource existence are not validated at the server boundary.

**How to fix**

Guard `/app`; resolve and authorize the workspace before rendering any module; return a real 404 for unknown slugs/views. Add public privacy/terms/security-contact routes, a deliberate sitemap for public pages only, and `noindex, nofollow` for authenticated/sample application pages. Require the canonical production URL at build/startup and separate public marketing metadata from private app metadata. Add an API health probe only where the API is actually deployed.

**Acceptance test / definition of done**

- Anonymous app requests redirect to sign-in; unknown workspace/module combinations return 404 without demo fallback.
- Search-engine directives exclude `/app`, auth, onboarding, demo, and private content; the sitemap lists only approved public URLs.
- Canonical/Open Graph/Twitter URLs use `https://trevv.de` in production and the build fails if the canonical URL is missing or non-HTTPS.
- Privacy, terms, and `/.well-known/security.txt` return reviewed content; synthetic probes distinguish Web, API, and authenticated health.

**Depends on:** P0-01, P0-02, and P0-05.

---

## P1 findings — required before private/public beta

### P1-01 — Worker and outbox behavior are comments and zero-result stubs

**Evidence**

- Reminder, outbox, Attention, and review sweeps always return `processed: 0`; production behavior exists only as comments (`apps/worker/src/index.ts:11-54`).
- The executable invokes all four once and exits; it has no scheduler, leases, retry policy, heartbeat, or dead-letter loop (`apps/worker/src/index.ts:57-67`).
- The limitations document explicitly says lease loop, scheduler, dead-letter handling, and telemetry remain unconnected (`docs/known-limitations.md:12`).

**Impact**

No reminder, notification, integration delivery, import/export job, review cadence, or recomputation can be relied on. API mutations cannot safely perform external side effects inline.

**Root cause**

Job boundaries and outbox schema were defined before a deployed worker adapter.

**How to fix**

Implement transactional outbox leasing with `FOR UPDATE SKIP LOCKED`, bounded batches, attempt records, exponential backoff/jitter, idempotent handlers, poison-message quarantine, dead-letter replay, graceful shutdown, heartbeats, and per-tenant/provider throttling. Separate schedules from handler code and make time injectable. Record external provider IDs before acknowledgment.

**Acceptance test / definition of done**

- Two workers cannot process one event twice concurrently; a crash after provider success does not duplicate the external action on retry.
- Poison events dead-letter after policy limits and can be inspected/replayed without editing the database manually.
- Oldest-outbox age, attempts, failures, duration, and throughput are observable and alert against the five-minute objective (`docs/operations.md:3-10`).

**Depends on:** P0-04 and P0-05.

### P1-02 — Integrations, uploads, imports, and search are foundations or simulations

**Evidence**

- Integration code parses safe HTTPS smart links, while the disconnected provider throws on connect and always rejects webhook verification (`packages/integrations/src/index.ts:29-68`).
- Known limitations list missing token encryption/revocation/webhooks, direct uploads, malware scanning, signed URLs, email delivery, push, and production search (`docs/known-limitations.md:7-12`).
- Attachment tables store keys and metadata, but no live storage adapter/API is exposed (`packages/db/src/schema.ts:1518-1543`).
- API search is a lowercase substring scan of demo workspaces/current in-memory items (`apps/api/src/app.ts:655-675`).
- Import UI is hard-coded simulation (`apps/web/components/management-experience.tsx:1504-1681`).
- CSV helpers escape quotes but do not neutralize spreadsheet-formula prefixes such as `=`, `+`, `-`, or `@` (`apps/api/src/app.ts:741-760`, `apps/api/src/app.ts:827-829`; browser export helper at `apps/web/components/settings-experience.tsx:478-489`). Titles, assignees, names, and email fields are user-controlled, so opening an export in a spreadsheet can execute a formula.

**Impact**

Provider controls cannot safely be enabled; file content is neither isolated nor scanned; large tenants cannot search effectively; migrations from existing tools are not real.

**Root cause**

UI/configuration seams were built ahead of credentialed server adapters, storage infrastructure, and background reconciliation.

**How to fix**

1. Choose one or two beta integrations based on the founder operating loop; leave all others hidden.
2. Implement OAuth state/PKCE, encrypted refresh-token storage, least scopes, revocation, signed webhook verification, replay protection, quotas, reconciliation, and health UI.
3. Implement private EU object storage with tenant-prefixed opaque keys, MIME/size/content checks, malware quarantine, signed short-lived downloads, delete/retention jobs, and authorization at issue/download time.
4. Build import as a durable background job: upload, parse, map, dry-run report, explicit confirmation, idempotent writes, partial-failure report, and safe retry/rollback policy.
5. Implement PostgreSQL FTS/trigram indexes and snippets with the authorization predicate inside the query; benchmark realistic tenant volume.
6. Centralize CSV generation and neutralize formula-leading cells while preserving a documented raw-data export option in a safer format such as JSON.

**Acceptance test / definition of done**

- Invalid OAuth state/signature/replay/tenant ID is rejected; disconnect revokes and deletes/rotates stored credentials.
- Cross-tenant attachment keys never authorize a download; infected/oversize/spoofed MIME uploads remain quarantined.
- A 10,000-row import can dry-run, retry without duplicates, report every rejected row, and never overwrite existing records silently.
- Search returns no unauthorized result/snippet and meets the agreed p95 at 100 workspaces/10,000 items.
- Security fixtures beginning with formula-control characters remain inert when CSV exports are opened in Excel, Numbers, and Google Sheets.

**Depends on:** P0-02, P0-04, P1-01, and P0-05.

### P1-03 — Billing exists only as schema and unrestricted development entitlements

**Evidence**

- Entitlement keys and evaluation logic exist, but the active development set is unlimited (`packages/core/src/commercial.ts:17-80`).
- Plans, subscriptions, entitlements, usage counters, and billing event tables exist (`packages/db/src/schema.ts:791-911`).
- There is no billing provider adapter, checkout/customer portal, webhook route, plan UI, invoice/tax handling, or production entitlement hydration in the OpenAPI/client path list (`packages/api-contract/src/openapi.ts:25-326`; `packages/api-client/src/index.ts:75-143`).

**Impact**

TREVV cannot charge, enforce limits consistently, recover from webhook replay, or give a customer a reliable downgrade/cancellation path. Enabling payments now would create financial and access-control risk.

**Root cause**

Commercial domain/schema design preceded pricing validation and provider integration.

**How to fix**

Select and validate a pricing model before building. Add a provider abstraction, hosted checkout, customer portal, tax/VAT handling, trial lifecycle, signed/idempotent webhook ingestion, durable event processing, usage aggregation, entitlement cache invalidation, grace periods, and admin support tooling. Make the database the entitlement source of truth; never trust client plan claims. Define downgrade/archive behavior that never destroys data, and keep export/security available on every plan.

**Acceptance test / definition of done**

- Sandbox tests cover subscribe, trial end, payment failure/recovery, upgrade, downgrade, cancel, refund, duplicate/out-of-order webhooks, and provider outage.
- Entitlements agree across Web/API/worker and cannot be bypassed with direct API calls.
- Downgrade never silently deletes data; the customer can export before and after cancellation.

**Depends on:** P0-02, P0-04, P1-01, legal readiness in P1-04.

### P1-04 — Legal, privacy, GDPR, retention, and deletion are policies on paper, not product workflows

**Evidence**

- Operations documentation proposes retention and GDPR purpose limitation (`docs/operations.md:12-17`) and an incident notification process (`docs/operations.md:34-41`).
- Security documentation describes export and auditable background deletion as a control (`docs/security.md:9-18`).
- The Web app route inventory contains no privacy, terms, consent, data-subject request, or account/organization deletion page (`apps/web/app/`).
- Current Web exports are browser-generated demo files (`apps/web/components/settings-experience.tsx:1531-1599`), and the API organization export returns demo data (`apps/api/src/app.ts:677-715`).

**Impact**

There is no enforceable basis/notice/processor record, retention implementation, data-subject workflow, deletion verification, or complete portable export. EU production use and paid accounts would carry avoidable compliance and contractual risk.

**Root cause**

Operational intent was documented before ownership, legal review, and durable data flows existed.

**How to fix**

1. Obtain qualified legal review for privacy notice, terms, DPA/subprocessors, lawful bases, cookie/telemetry consent, age/eligibility, and deletion/retention policy.
2. Inventory every personal-data category, processor, region, retention period, and deletion propagation path.
3. Build verified account/org export and staged deletion jobs with cooling-off, authorization, audit receipt, backup expiration rules, provider revocation, and legal-hold exceptions.
4. Add consent/preferences only where required; do not use dark patterns or bundle optional marketing consent.
5. Create a breach/DSAR runbook with owners and deadlines, and exercise it in staging.

**Acceptance test / definition of done**

- A test organization export includes every canonical record and attachment manifest and can be opened independently.
- A deletion drill removes/anonymizes records from primary DB, object storage, search indexes, queues, and providers within policy, while backup expiry is documented.
- Privacy/terms/DPA links are versioned and reachable before sign-up; consent version/time/source are recorded when legally required.

**Depends on:** P0-04/P0-05 and P1-02/P1-03.

### P1-05 — Telemetry, rate limits, and Web security policy are incomplete

**Evidence**

- API has secure headers, CORS, and request IDs (`apps/api/src/app.ts:64-83`) but the shown middleware has no rate limiter. The architecture nevertheless says the API owns rate limits (`docs/architecture.md:13`).
- API unhandled errors log only level, request ID, and message to `console.error` (`apps/api/src/app.ts:776-789`).
- Web Cloudflare logs/traces are configured (`apps/web/wrangler.jsonc:9-18`), while production hardening still calls for edge rate limits, log redaction, Sentry, alerting, and immutable audit retention (`docs/security.md:22-30`).
- `apps/web/next.config.ts:1-13` contains no explicit Web CSP, HSTS, Referrer-Policy, Permissions-Policy, or frame policy configuration.

**Impact**

Auth, invite, search, export, and webhook abuse is not controlled in application configuration. API/worker failures cannot be correlated to user-visible receipts or alerted reliably. Browser policy may depend on platform defaults rather than a tested application policy.

**Root cause**

Some edge observability and API middleware exist, but the cross-service operational/security layer has not been implemented.

**How to fix**

Add per-IP and per-account/tenant rate limits with stricter auth/invite/export/webhook budgets; standard `Retry-After` envelopes; structured redacted logs; metrics/traces across request→transaction→outbox→provider; error reporting with source maps; immutable product audit events; actionable alerts; and tested Web headers/CSP. Define correlation IDs and tenant-safe identifiers. Add health, readiness, and dependency checks separately.

**Acceptance test / definition of done**

- Abuse tests get deterministic 429 responses without blocking unrelated tenants; webhook provider retry behavior remains safe.
- One synthetic founder action is traceable across Web, API, database/outbox, worker, and provider using a request/correlation ID without logging secrets or content.
- Header tests verify CSP/HSTS/frame/referrer/permissions policies on production routes; report-only CSP is promoted only after violations are resolved.
- Alerts fire in a controlled API 5xx, auth-failure spike, stuck-outbox, and webhook-rejection exercise.

**Depends on:** P0-05 and P1-01.

### P1-06 — Web error, offline, stale-data, and conflict UX is not implemented end to end

**Evidence**

- The API/client define request-aware errors and a `409` version conflict (`packages/api-client/src/index.ts:18-73`; `packages/api-contract/src/openapi.ts:236-260`).
- Web product screens do not use the API client, and the app route tree has no route-level `error.tsx`, `loading.tsx`, or `not-found.tsx` boundaries under `apps/web/app/app/`.
- Service-worker fallback silently serves cached Portfolio for failed navigations (`apps/web/public/sw.js:51-55`).
- Mobile has a basic offline/retry screen (`apps/mobile/app/index.tsx:21-47`); desktop explicitly falls back to demo workspaces on API failure (`apps/desktop/src/desktop-app.tsx:20-38`, `apps/desktop/src/desktop-app.tsx:105-109`).

**Impact**

Users cannot distinguish success, queued, stale, failed, conflicted, or demo-fallback states. Silent local/demo fallback risks decisions based on incorrect data and hides outages.

**Root cause**

Optimistic demo interactions were implemented before a shared async state/error model.

**How to fix**

Create a cross-client state contract for loading, empty, stale, offline-read, queued-write, retrying, permission loss, validation, rate limit, version conflict, and terminal failure. Add Web route/component error boundaries and recovery actions. Keep last-known data visibly timestamped; never substitute seed data in live mode. For conflicts, present current server value and local draft with reload/reapply/cancel choices. Make idempotency and queue status visible for external actions.

**Acceptance test / definition of done**

- Fault-injection tests cover offline before/after submit, timeout, 401/403/404/409/422/429/500, API restart, duplicate retry, and membership revocation.
- No failed operation displays a success toast or loses the user's draft.
- Stale/offline data is labeled with its last refresh and can be cleared; live mode never renders demo fixtures as fallback.

**Depends on:** P0-03/P0-04 and P0-07.

### P1-07 — Operational recovery and production release controls are documented but not evidenced as exercised

**Evidence**

- Operations specify availability/outbox objectives, backups, restore drills, and incident response (`docs/operations.md:3-41`).
- Deployment specifies migration/release ordering and rollback expectations (`docs/deployment.md:23-37`).
- The CI deploy job has only a Web rollback note and 200 check (`.github/workflows/ci.yml:104-149`); it does not record a DB restore drill, API/worker rollout, or full release manifest.

**Impact**

A written runbook can be incorrect or incomplete. Without exercises and evidence, the team does not know actual RPO/RTO or whether a bad migration, provider event, or tenant leak can be contained.

**Root cause**

Operational documentation was created ahead of infrastructure and release automation.

**How to fix**

Assign owners and automate evidence capture for backup recency, quarterly restore, migration rehearsal, dependency failover, secret rotation, incident response, and forward-fix/rollback exercises. Create environment protection and a human go/no-go checklist for data-affecting releases.

**Acceptance test / definition of done**

- A dated restore report records RPO/RTO, row/count reconciliation, auth, one attachment, Portfolio load, and export.
- The previous release can be upgraded in staging and the current release can be rolled back/forward-fixed without destructive SQL.
- On-call receives and resolves a staged API, worker, database, and provider alert using the runbook.

**Depends on:** P0-05, P1-01, and P1-05.

---

## P2 findings — GA quality or explicit scope decisions

### P2-01 — Mobile and desktop are companion shells, not product-parity clients

**Evidence**

- Mobile provides a read-only Portfolio query and workspace overview (`apps/mobile/app/index.tsx:17-137`; `apps/mobile/app/workspaces/[slug].tsx:14-68`).
- Desktop provides one Portfolio view and substitutes demo workspaces when the API fails (`apps/desktop/src/desktop-app.tsx:8-38`, `apps/desktop/src/desktop-app.tsx:39-162`).
- The backlog itself lists My Work, Inbox, Quick Capture, comments, approvals, push, offline queue/conflicts, desktop shortcuts, vault, updates, and signing as future work (`docs/release-1.1-backlog.md:10-11`).

**Impact**

Marketing or support language suggesting cross-platform parity would be false. Native clients also add auth storage, deep-link, push, offline, signing, and release-security burden before the Web loop is proven.

**Root cause**

Native shells were scaffolded to prove shared contracts before a validated native job-to-be-done.

**How to fix**

Keep native apps explicitly labeled companion/preview and do not publish them to stores until a narrow use case is validated. Prioritize responsive PWA Quick Capture/Attention first. If native proceeds, implement secure auth, deep-link validation, no demo fallback in live mode, push authorization/preferences, offline/conflict semantics, signing, updates, crash reporting, and store compliance.

**Acceptance test / definition of done**

- Release notes and listings match actual capabilities.
- Native auth/session revocation, tenant isolation, deep links, offline behavior, push privacy, upgrade compatibility, and signed builds pass platform testing.

**Depends on:** all P0 data/auth/runtime work and P1-06.

### P2-02 — Localization is partial, non-persistent, and contradicted by hard-coded English

**Evidence**

- The locale/theme context starts in English/light and toggles only in React state (`apps/web/lib/workspace-context.tsx:69-80`, `apps/web/lib/workspace-context.tsx:132-143`).
- The translation package covers a limited shell/Portfolio dictionary (`packages/i18n/src/index.ts:1-180`).
- Major experiences directly use English product copy or hard-coded strings; for example the board selects `productCopy.en.board` (`apps/web/components/board-experience.tsx:218`) and onboarding selects `productCopy.en.auth` (`apps/web/components/auth-experience.tsx:162-165`).

**Impact**

The language switch can produce mixed-language screens and resets, which is more confusing than an honest English-only beta. Dates, errors, email, accessibility labels, and server messages are not consistently localized.

**Root cause**

An i18n shell was added before complete message extraction, locale routing/persistence, and translation QA.

**How to fix**

For alpha/beta, either remove/label the German switch and ship English only, or complete extraction across Web/API emails/errors. Persist locale on the user profile/cookie, use locale-aware date/number/plural formatting, define fallback behavior, and add pseudolocale/missing-key tests plus native parity only where supported.

**Acceptance test / definition of done**

- A locale crawl reports no mixed hard-coded strings, missing keys, clipped labels, or untranslated validation/error states across supported routes.
- Locale survives refresh, sign-in, and another device and is honored in emails/notifications.

**Depends on:** P0-01/P0-03. Not a closed-alpha blocker if English-only scope is explicit.

### P2-03 — Scope breadth can dilute the founder operating loop

**Evidence**

- The original product boundary says no messaging/chat and no full offline mode (`docs/product-spec.md:20-22`), while current routes include Messages, Teams, Email, integrations, imports, blueprints, and many settings surfaces.
- The release backlog adds broad integrations, Gantt/formulas, native parity, search, import, and enterprise discovery (`docs/release-1.1-backlog.md:5-14`).

**Impact**

Trying to make every surface production-ready simultaneously will delay the differentiating workflow: capture a commitment, know what needs attention, decide/approve, follow Waiting, and preserve management memory.

**Root cause**

The demonstration optimizes for breadth and vision communication, while release engineering requires a narrow vertical slice.

**How to fix**

Define the alpha founder golden path and hide all nonessential modules. Treat Messages as contextual work rooms rather than general chat, Email as an ingestion source rather than a full client, and native apps as companions. Promote a feature only when it has durable storage, authorization, errors, telemetry, recovery, and an end-to-end test.

**Acceptance test / definition of done**

- An alpha capability matrix names no more than the agreed vertical slice and assigns an owner/metric to each workflow.
- Pilot users can complete onboarding → capture → assign → Attention → decision/waiting → weekly review without unsupported branches.

**Depends on:** product decision; apply before implementation planning.

### P2-04 — Performance has no enforced budget or realistic-volume evidence

**Evidence**

- The root layout imports both global stylesheets for every route (`apps/web/app/layout.tsx:3-8`). `apps/web/app/workspace.css` is more than 15,000 lines and roughly 330 KB before delivery optimization.
- Several client components are 1,000–2,000 lines, while the performance document explicitly defers validation with 100 Workspaces and 10,000 work items (`docs/performance.md:20-25`).
- CI has no Lighthouse, Core Web Vitals, JavaScript/CSS budget, route-size budget, query-plan, or realistic-volume load gate (`.github/workflows/ci.yml:11-102`).

**Impact**

Demo data can hide slow initial loads, long tasks, layout instability, memory growth, unbounded queries, and unusable large boards/messages. Performance regressions can reach production while all current gates remain green.

**Root cause**

The app was optimized for rapid experience coverage and deterministic fixtures before route splitting, virtualization, production RUM, and representative data volumes existed.

**How to fix**

Split route-specific CSS and heavy client modules, dynamically load secondary experiences, virtualize long tables/boards/conversations, paginate server queries, and add indexes only from measured plans. Define per-route asset, Core Web Vital, API-latency, database-query, and memory budgets. Seed a repeatable 100-Workspace/10,000-item organization and run browser plus API load tests in CI/staging; add production RUM segmented by route/device.

**Acceptance test / definition of done**

- The agreed p75 Core Web Vital targets pass on representative mobile and desktop devices, and Portfolio p95 stays below the documented 2-second target at reference volume.
- A pull request that exceeds an agreed route/asset/query budget fails with an attributable report.
- Large tables, message histories, and search do not render or transfer unbounded datasets.

**Depends on:** P0-03/P0-04 for meaningful server measurements. Required before GA.

### P2-05 — Automated accessibility coverage is narrower than the release claim

**Evidence**

- The accessibility suite excludes moderate/minor findings and fails only serious/critical results (`tests/e2e/accessibility.spec.ts:11-29`).
- Playwright runs Chromium and emulated mobile Chromium, not WebKit or Firefox (`playwright.config.ts:18-21`).
- The repository has a manual keyboard/screen-reader/zoom checklist, but no recorded release evidence for VoiceOver/NVDA, 200% zoom, forced colors, or reduced motion (`docs/accessibility.md:7-17`).

**Impact**

A green accessibility job can coexist with valid WCAG A/AA defects, browser-specific focus problems, clipped zoom layouts, or unusable assistive-technology flows. The current onboarding radio cascade demonstrates why semantic automation alone is insufficient.

**Root cause**

The automated gate was intentionally scoped to high-severity axe findings while manual and cross-browser evidence remained a future release activity.

**How to fix**

Fail all in-scope A/AA violations unless a reviewed, expiring allowlist documents impact and remediation. Add WebKit to critical paths. Record manual keyboard, VoiceOver and NVDA, 200% zoom, reduced-motion, high-contrast/forced-colors, and touch-target checks for every release-scope route. Add visual regression coverage for onboarding controls, short-height navigation, drawers, tables, and dialogs.

**Acceptance test / definition of done**

- No unreviewed WCAG A/AA violation exists in release scope, and the dated manual matrix is attached to the release evidence.
- Keyboard focus, announcements, zoom/reflow, and reduced-motion behavior pass in at least the supported Chromium/WebKit combinations.

**Depends on:** release-scope decision and the live-data states in P1-06. Required before public beta/GA.

## P3 engineering-hygiene backlog

These issues do not supersede P0/P1 product safety, but they should be scheduled instead of disappearing behind a green demo pipeline.

| Finding                                                  | Evidence / risk                                                                                                                      | Resolution and gate                                                                                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Repository formatting is not a CI gate                   | `pnpm format:check` currently reports six pre-existing committed/generated files, while CI does not run the command                  | Normalize source/generated formatting deliberately, then add `format:check` without reformatting unrelated code in feature PRs                               |
| The renamed long-lived branch is outside push CI filters | `.github/workflows/ci.yml:3-6` matches `main`, `feat/**`, and `codex/**`, not `trevv-foundation`                                     | Prefer protected PRs into `main`, or add the exact maintained branch pattern and required checks                                                             |
| Dependency declarations use moving versions              | The audit found many `"latest"` entries despite a frozen lockfile; updates can become accidental and support ranges are undocumented | Pin supported ranges, use Renovate/Dependabot, and rehearse lockfile upgrades with the full suite                                                            |
| GitHub Actions use moving major tags                     | `actions/checkout@v4`, `actions/setup-node@v4`, and similar tags can change upstream                                                 | Pin actions to reviewed commit SHAs and update through a controlled dependency process                                                                       |
| Coverage and client tests are incomplete                 | No enforced coverage threshold; mobile/desktop can pass with no substantive tests; Web unit tests run primarily in Node              | Add risk-based coverage thresholds, component tests for state/error behavior, and real native/client smoke tests before those clients receive release labels |
| API tests share mutable module state                     | Process-global API Maps can make tests order-dependent and mask reset/restart behavior                                               | Replace Maps with injected repositories; isolate database fixtures/transactions and randomize/repeat test order                                              |
| Internal naming remains `founderhq`                      | Package scopes, database seed names, and native aliases still use the old internal name                                              | Defer until runtime safety is complete, then migrate before publishing an SDK, deep-link scheme, or public developer documentation                           |

The P3 gate is simple: every item must either be complete or have an owner, milestone, and explicit accepted risk before GA.

---

## Features that must be hidden or explicitly labeled until real

| Surface/action                                                  | Current safe treatment                                                                        | May be enabled as “live” only when                                                                     |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Sign-in/sign-up/onboarding                                      | Separate “Explore sample workspace” from authentication; never accept a real password in demo | Better Auth, verification/recovery, route guard, provisioning transaction, and tenant tests pass       |
| Workspace/portfolio/board/My Work/Quick Capture edits           | Banner: “Sample data; changes stay in this browser,” or disable writes                        | Server repositories are canonical, cross-device persistence and conflicts pass                         |
| Teams, inherited capabilities, invitations, private/guest rooms | Hide from real-account alpha or label interactive demo                                        | Team schema/API/policy and message participation/IDOR tests pass                                       |
| Messages and direct conversations                               | Hide or demo-only; do not imply delivery/read status                                          | Durable message API, membership, realtime, idempotency, moderation/retention, and notifications pass   |
| Waiting Email/Slack nudge                                       | “Draft/preview follow-up”; no “send” language                                                 | Provider delivery, confirmation, outbox, retry, audit, and reconciliation pass                         |
| Email accounts/inbox                                            | Demo mailbox banner; never claim a provider connection                                        | OAuth/credential encryption, sync/reconciliation, sanitization, attachment safety, and revocation pass |
| Integration “Set up/Manage” controls                            | Hide unavailable providers; label smart-link preview accurately                               | Live adapter, token security, webhook/replay checks, health, quotas, and disconnect pass               |
| Import                                                          | “Preview sample import” only; do not claim rows were created                                  | Real upload/parser/mapping/dry-run/job/report/idempotency tests pass                                   |
| File upload/download                                            | Hide direct uploads                                                                           | Private storage, authorization, signed TTL, MIME/size validation, malware scan, retention/delete pass  |
| Security toggles/session revocation                             | Hide simulated controls                                                                       | They read/write actual auth state and revocation is verified                                           |
| Audit log and organization export                               | Label demo/browser-generated                                                                  | Complete server audit/export, permission, retention, and DSAR tests pass                               |
| Billing/plans/usage limits                                      | Do not accept payment or advertise enforceable limits                                         | Provider/webhooks/entitlements/downgrade/refund/tax/legal flows pass                                   |
| Notifications, realtime, automations                            | Label preview/local; no delivery guarantees                                                   | Worker/outbox, preferences, retries, audit, telemetry, and kill switch pass                            |
| Offline/PWA                                                     | “Cached demo shell”; no promise of offline private data                                       | P0-07 private-cache design and P1-06 queued/conflict UX pass                                           |
| Mobile/desktop                                                  | “Companion foundation/preview”                                                                | Store-signed builds and the advertised native workflows pass                                           |
| German                                                          | English-only beta or “partial preview”                                                        | Full extraction, persistence, locale formatting, and localization QA pass                              |

## Phased resolution sequence

### Phase 0 — Truth and immediate safety (days 1-5)

1. Fix P0-07: stop caching authenticated documents/API reads.
2. Implement P0-08 capability flags, demo banner, and hidden/disabled unsupported controls.
3. Correct P0-10 documentation and create the capability matrix.
4. Freeze new surface-area work and agree the alpha golden path.

**Exit:** no visitor can confuse a simulated operation with a durable, secure, or externally delivered one.

### Phase 1 — Persistent data plane (weeks 1-4)

1. Implement P0-04 repositories, tenant-scoped query primitives, versions, idempotency records, transactions, and outbox writes.
2. Build production-mode API integration tests against PostgreSQL.
3. Migrate the minimum canonical resources required by the golden path.

**Exit:** API data survives restart/horizontal instances and every mutation has an atomic outbox/audit record.

### Phase 2 — Identity and tenant boundary (weeks 3-5)

1. Complete P0-02 session→user→membership mapping and route guards.
2. Complete P0-01 real sign-up, verification, onboarding, invite, recovery, and revocation.
3. Run two-user/two-tenant IDOR tests against every query, export, search, and event route.

**Exit:** unauthenticated and cross-tenant access fails closed; onboarding creates one durable tenant atomically.

### Phase 3 — Founder operating loop (weeks 4-8)

1. Execute P0-03 Web migration in vertical slices: workspace/board/item/capture, Attention, decision/approval, Waiting, and weekly review/snapshot.
2. Implement P1-06 error/stale/offline/conflict UX while each slice moves.
3. Implement P1-01 worker/outbox for recomputation and internal notifications.

**Exit:** onboarding → capture → assign → Attention → resolve/decide/wait → weekly review works across two browsers and survives restart.

### Phase 4 — Collaboration and runtime (weeks 7-10)

1. Either implement P0-06 Teams/Messages end to end or remove them from alpha navigation.
2. Implement P0-05 full staging/production topology and P0-09 production-like CI.
3. Implement P1-05 telemetry/rate limits/headers and P1-07 recovery drills.

**Exit:** staging is production-shaped, observable, recoverable, and promoted only after full-system gates.

### Phase 5 — Private beta hardening (weeks 10-18)

1. Implement only the chosen P1-02 integrations, real import, files, and permission-filtered search.
2. Complete P1-04 privacy/GDPR workflows and legal review.
3. Validate pricing, then implement P1-03 billing in sandbox before live payment.
4. Measure activation, four-week retention, Attention resolution, and automation acceptance with 5-20 pilot organizations.

**Exit:** external effects are auditable/recoverable, privacy and billing drills pass, and pilot evidence supports public beta.

### Phase 6 — Public beta to GA

1. Exercise scale, availability, restore, security/IDOR, dependency, accessibility, and incident gates for at least 30 days.
2. Decide P2-01/P2-02 scope explicitly: Web/PWA-only and English-only is acceptable if accurately marketed.
3. Expand native/localization only after the founder loop shows retention.

## Closed-alpha release-blocking gate

Closed alpha may accept real customer data only when **every** item below is true:

- [ ] Production mode fails startup unless demo mode is disabled and auth/database/secrets are valid.
- [ ] Real sign-up, verification, sign-in/out, recovery, route guard, onboarding, invite acceptance, and membership revocation pass.
- [ ] Two-user/two-organization IDOR matrix passes for reads, writes, search, export, events, files, teams, and messages in scope.
- [ ] No business source of truth remains in localStorage; no live error path substitutes demo data.
- [ ] All alpha writes are durable, versioned/idempotent as needed, and atomic with outbox/audit records.
- [ ] The founder golden path works across devices and API restart with visible error/conflict handling.
- [ ] Authenticated documents/API responses are not exposed through shared service-worker caches.
- [ ] Teams/Messages are either fully server-persistent and permissioned or absent from alpha navigation.
- [ ] Simulated integrations, import, exports, security controls, billing, uploads, notifications, and automations are hidden or explicitly demo-labeled.
- [ ] API, worker, PostgreSQL, object storage, and Web are deployed and smoke-tested in a production-shaped staging environment.
- [ ] Production-like CI uses `DEMO_MODE=false`, upgrades the previous schema, and exercises auth/tenant/repository/worker behavior.
- [ ] Rate limits, tested Web/API headers, redacted telemetry, correlation IDs, alerts, and audit retention are active.
- [ ] Backup/PITR is configured and a restore drill verifies auth, Portfolio, one attachment if in scope, and full export.
- [ ] Privacy/terms/DPA/subprocessor and retention/deletion responsibilities have qualified review; export/deletion drills pass for the data in scope.
- [ ] Documentation and UI capability language match the deployed reality.

Any unchecked item is a no-go. Passing lint, unit tests, browser demo tests, accessibility tests, a Web build, or an HTTP 200 probe does not override this gate.

## Recommended ownership split

- **Identity/security:** P0-01, P0-02, P0-07, P1-05.
- **Data/API:** P0-04, canonical resources in P0-03, search/export, migrations.
- **Web product:** P0-03, P0-08, P1-06, capability matrix, golden-path E2E.
- **Collaboration:** P0-06, message delivery/realtime, guest isolation.
- **Platform/operations:** P0-05, P0-09, P1-01, P1-05, P1-07.
- **Integrations/data portability:** P1-02, provider reconciliation, files, import/export.
- **Commercial/legal:** P1-03, P1-04, pricing validation, customer terms.
- **Product scope:** P0-10, P2-01, P2-02, P2-03.

The first milestone is not “more features.” It is making the smallest valuable TREVV loop truthful, durable, permissioned, observable, and recoverable.
