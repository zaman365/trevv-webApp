# TREVV phased Codex implementation prompts

Use this document to implement the audit safely, one phase at a time.

## How to use this file

1. Start with Phase 0.
2. Copy only one prompt into Codex at a time.
3. Review the result, tests, and commits before starting the next phase.
4. Do not combine phases merely because the earlier phase finished quickly.
5. Do not authorize pushing, merging, migration of production data, or deployment unless you explicitly want that action.

The authoritative specifications are:

- `docs/problem-resolution-audit.md`
- `docs/visual-improvement-audit.md`
- `docs/trevv-release-plan.html`

The prompts below intentionally reference those files instead of duplicating every finding. Codex should read the referenced audit completely before changing code.

---

## Phase 0 — truth, immediate safety, and visual blockers

**Goal:** Make the current hosted demonstration honest and safe while preserving its usefulness. Do not attempt real authentication or persistence in this phase.

```text
Read these files completely before making changes:

- docs/problem-resolution-audit.md
- docs/visual-improvement-audit.md
- docs/known-limitations.md

Implement Phase 0 — Truth and immediate safety only.

Required scope:

1. Resolve P0-07 from the system audit:
   - Stop the service worker from caching authenticated/private `/app/**` documents and `/api/**` responses.
   - Cache only safe immutable assets and a content-free offline fallback.
   - Add regression tests for cache behavior and account/logout safety where possible.

2. Resolve the immediate truthfulness portion of P0-08 and P0-10:
   - Create a maintainable capability/status model for demo-only, preview, unavailable, and live behavior.
   - Clearly identify the current product as a fictional-data technical preview.
   - Do not present simulated actions as sent, published, imported, securely connected, revoked, billed, or persisted.
   - Hide, disable, or accurately relabel unsupported production actions.
   - Align README and implementation-status documentation with known-limitations.md.

3. Fix VIS-001:
   - Correct onboarding radio/checkbox styling so choice controls never inherit text-field dimensions.
   - Verify onboarding steps 1, 3, and 4 with keyboard focus, desktop, mobile, and 200% zoom.
   - Add focused visual/browser regression coverage.

4. Fix VIS-002:
   - Make the sidebar navigation the flexible scrollable middle region.
   - Keep the header and footer fixed without covering the final navigation item.
   - Test short viewport heights, including 768, 820, 900, and 945 pixels.

5. Replace stale documentation screenshots that still use retired Hub terminology.

Constraints:

- Do not implement real auth, repositories, billing, integrations, Teams APIs, or Messages APIs in this phase.
- Do not delete useful demo functionality unless it cannot be made honest and safe.
- Preserve unrelated user changes.
- Keep all demo data explicitly fictional.
- Use separate logical commits for service-worker safety, truth/capability labeling, and visual fixes.
- Do not push, merge, or deploy.

Required verification:

- Run targeted tests for every changed area.
- Run lint, typecheck, unit tests, build, e2e, accessibility, and the dependency audit.
- Manually inspect onboarding and the short-height sidebar in the browser.
- Run git diff --check and targeted formatting checks.
- Report every unresolved Phase 0 acceptance criterion with evidence.

Phase completion gate:

- No preview action falsely claims a durable, secure, or external effect.
- The service worker cannot return private app/API data from a shared global cache.
- Onboarding controls are legible and keyboard operable.
- Every sidebar item remains reachable at supported viewport heights.
- Documentation and UI agree that this is a non-persistent technical preview.

Stop after Phase 0 and give me:

- the exact files changed;
- tests and results;
- commits created;
- remaining risks or blockers;
- a clear go/no-go recommendation for Phase 1.
```

---

## Phase 1 — persistent data plane and repositories

**Prerequisite:** Phase 0 has passed.

**Goal:** Replace API process-memory storage with durable, tenant-scoped PostgreSQL repositories. This phase establishes server truth; it does not yet migrate every Web screen.

```text
Read docs/problem-resolution-audit.md completely, then review the Phase 0 implementation and current git history.

Implement Phase 1 — Persistent data plane only, centered on P0-04 and the server prerequisites for P0-03.

Required scope:

1. Design and document transaction/repository boundaries for:
   - organizations and application users;
   - memberships and invitations;
   - portfolios and workspaces;
   - boards, work items, assignees, dependencies, comments, and updates;
   - Inbox/captured work;
   - Attention, Waiting, decisions, approvals, reviews, and snapshots;
   - audit events and transactional outbox records.

2. Implement typed PostgreSQL repositories in the appropriate package.
   - Inject repositories/services into the API.
   - Remove process-global Maps from non-demo execution.
   - Keep demo fixtures available only through an explicit demo adapter.

3. Enforce data integrity:
   - Every repository query must require organization scope.
   - Verify board/workspace/organization relationships atomically.
   - Add composite constraints or equivalent checks where independent foreign keys could cross tenants.
   - Preserve non-leaking not-found behavior.

4. Implement durable concurrency and idempotency:
   - Persist versions or ETags and return them consistently through contracts and clients.
   - Persist idempotency keys with tenant, user, method, route, request fingerprint, result, and expiry.
   - Reject same-key/different-request reuse.

5. Make writes atomic with audit/outbox creation where required.

6. Align the API implementation, Zod schemas, typed client, and OpenAPI contract for every route changed in this phase.

7. Add database integration tests for:
   - restart durability;
   - two organizations with overlapping-looking identifiers;
   - cross-workspace board/item rejection;
   - optimistic-concurrency conflicts;
   - safe idempotent replay;
   - transaction rollback;
   - outbox/audit atomicity.

Constraints:

- Do not migrate all Web components from localStorage yet; that belongs to Phase 3.
- Do not implement billing, provider integrations, native parity, or broad automation.
- Do not keep hidden non-demo fallbacks to seeded data after a live repository failure.
- Use backward-compatible migrations and never rewrite an existing migration already applied elsewhere.
- Preserve unrelated user changes.
- Create clean, reviewable commits by repository/contract concern.
- Do not push, merge, migrate production, or deploy.

Required verification:

- Run migrations against a clean PostgreSQL database.
- Test upgrading a populated previous-schema fixture where feasible.
- Run repository/API integration tests in DEMO_MODE=false.
- Run contract generation and verify no unexplained drift.
- Run lint, typecheck, unit tests, build, security audit, and git diff --check.

Phase completion gate:

- Live-mode data survives API restart and multiple API instances.
- No repository request can cross organization scope.
- Versions and idempotency values round-trip through API and client correctly.
- Every in-scope mutation is atomic with required audit/outbox records.
- Demo and live adapters cannot be confused by missing configuration.

Stop after Phase 1 and provide an evidence-based go/no-go recommendation for Phase 2.
```

---

## Phase 2 — authentication, onboarding, and tenant authorization

**Prerequisite:** Phase 1 repositories and data-integrity tests pass.

**Goal:** Make identity, onboarding, invitations, route protection, and authorization real and fail-closed.

```text
Read docs/problem-resolution-audit.md completely and inspect the completed Phase 1 repositories and contracts.

Implement Phase 2 — Identity and tenant boundary only, resolving P0-01, P0-02, and the authentication-dependent parts of P0-11.

Required scope:

1. Implement real Web authentication:
   - sign up, email verification, sign in, sign out, password recovery/reset;
   - secure server session resolution;
   - explicit session revocation;
   - honest validation and failure messages.

2. Protect every `/app/**` route server-side.
   - Anonymous users must not receive private app HTML or data.
   - Preserve a separately labeled fictional demo entry if desired.

3. Map Better Auth identity to the application model:
   - one app user mapping;
   - active organization membership;
   - portfolio/workspace memberships;
   - role and managed scopes loaded from PostgreSQL.

4. Remove demoAccess() from non-demo execution.
   - `/api/v1/session` must return the real current user and selected organization.
   - Never accept roles, tenant IDs, or accessible workspace IDs from the client.

5. Make onboarding transactional and idempotent:
   - app user mapping;
   - organization and owner membership;
   - default portfolio;
   - first workspace and starter board/Blueprint;
   - recoverable onboarding progress.

6. Implement invitations:
   - cryptographically strong token;
   - hashed storage, expiry, revocation, resend, one-time acceptance;
   - membership creation in a transaction;
   - real email delivery through a testable adapter/mail sink.

7. Validate workspace routes:
   - Resolve and authorize the workspace slug before rendering.
   - Unknown or inaccessible resources must return a non-leaking 404.

8. Make production configuration fail closed:
   - DEMO_MODE must be explicitly false in live environments.
   - Validate secrets, HTTPS origins, database transport, canonical URL, and required auth configuration at startup.

9. Add two-user/two-organization tests covering all in-scope reads, writes, search, export, events, invitation, and session behavior.

Constraints:

- Do not implement simulated MFA/passkey controls unless they become fully functional in this phase; otherwise hide them.
- Do not rely on robots.txt as an authorization control.
- Do not place secrets or real credentials in fixtures, logs, commits, or screenshots.
- Preserve demo isolation and unrelated user changes.
- Use separate commits for auth flow, tenant access, onboarding/invitations, and route/config hardening.
- Do not push, merge, migrate production, or deploy.

Required verification:

- E2E in DEMO_MODE=false with PostgreSQL and a test mail sink.
- Wrong credentials fail; verification/reset/invite tokens expire and cannot be replayed.
- Anonymous app access redirects without returning private content.
- Membership removal takes effect on the next authorized request and invalidates relevant caches.
- Two-tenant IDOR suite passes for guessed IDs and slugs.
- Run the complete quality, e2e, accessibility, build, migration, contract, and security suites.

Phase completion gate:

- A real user can create and recover an account, verify, complete onboarding once, sign out/in, and see the same tenant from another browser.
- Every live request derives access from server-side membership.
- Anonymous, removed-member, and cross-tenant requests fail closed.
- Production cannot start in demo mode or with incomplete security configuration.

Stop after Phase 2 and provide an evidence-based go/no-go recommendation for Phase 3.
```

---

## Phase 3 — persistent founder operating loop

**Prerequisites:** Phases 1 and 2 pass.

**Goal:** Replace browser-local product state with one canonical, durable workflow from capture through weekly review.

```text
Read docs/problem-resolution-audit.md and docs/visual-improvement-audit.md completely. Inspect the live repositories, auth, permissions, and contracts from Phases 1-2.

Implement Phase 3 — Founder operating loop only.

The required golden path is:

onboard → create/select Workspace → capture → Inbox/board/My Work → assign/update/block → Attention recomputes → decide/approve or Waiting → resolve with evidence → weekly review → persistent snapshot/change history

Required scope:

1. Migrate the golden-path Web surfaces from seeded/localStorage source-of-truth to the typed API and repositories.
2. Use one canonical WorkItem identity across Quick Capture, Inbox, board, My Work, Attention, Waiting, decisions, approvals, and reviews.
3. Implement optimistic mutations with real server acknowledgement, retry, undo where safe, and version-conflict handling.
4. Implement deterministic Attention recomputation from durable data with source evidence, reason codes, and timestamps.
5. Persist decisions, rationale, evidence, approvals, Waiting state, follow-up history, outcomes, reviews, and snapshots.
6. Implement the internal outbox/worker path required to recompute signals and notifications safely.
7. Replace fixed demo clocks with injected current time and organization timezone on live paths.
8. Implement the VIS-006 shared state model as each surface moves:
   - loading;
   - empty/no-results;
   - pending/saved/failed;
   - retrying;
   - stale/offline;
   - permission loss;
   - validation and rate limit;
   - version conflict;
   - terminal error.
9. Add route/global error and not-found boundaries.
10. Keep last-known data clearly timestamped; never silently substitute seed data in live mode.

Constraints:

- Do not add broad AI autonomy or new product surfaces.
- Do not implement full Teams/Messages unless required for the golden path; that belongs to Phase 4.
- LocalStorage may hold explicitly namespaced UI preferences or recoverable drafts, never canonical business state.
- Preserve unrelated user changes.
- Migrate in vertical slices with a working test at the end of each slice.
- Do not push, merge, migrate production, or deploy.

Required verification:

- Complete golden path in two browser contexts and two users.
- Refresh, sign out/in, second device, API restart, duplicate submission, network timeout, and concurrent edit preserve correctness.
- Fault-injection covers 401/403/404/409/422/429/500 and membership revocation.
- No failed operation shows success or loses a recoverable draft.
- Run full unit, integration, contract, migration, e2e, accessibility, build, and security gates.

Phase completion gate:

- The entire golden path is durable, tenant-safe, observable, and recoverable.
- Attention and review outputs cite canonical records and deterministic reason codes.
- No in-scope business source of truth remains in localStorage or demo fixtures.
- A second authorized user sees changes through reliable invalidation/polling.

Stop after Phase 3 and provide an evidence-based go/no-go recommendation for a real-data private alpha and Phase 4.
```

---

## Phase 4 — Teams, Messages, worker, and production-shaped runtime

**Prerequisite:** The founder golden path passes in production mode.

**Goal:** Make collaboration real and deploy the complete application topology in staging.

```text
Read docs/problem-resolution-audit.md and the Teams/Messages portions of docs/visual-improvement-audit.md completely. Review all completed Phase 1-3 work.

Implement Phase 4 — Collaboration and production-shaped runtime only.

Required scope:

1. Make an explicit decision first:
   - fully implement Teams and Messages for alpha; or
   - remove them from alpha navigation while preserving work safely for a later release.

If implementing them:

2. Add and migrate the canonical collaboration model:
   - teams;
   - team members;
   - capability/preset policy;
   - conversations and participants;
   - explicit team-room relationship;
   - messages, threads, reactions, read checkpoints, and retention fields.

3. Distinguish feature inheritance from data authorization. Never use client capability labels as security policy.
4. Implement typed Team/Message contracts, OpenAPI routes, client methods, repositories, and server authorization.
5. Atomically create/synchronize a Team room when a Team is created or membership changes.
6. Implement invitation and removal behavior, guest isolation, direct-message membership, pagination, idempotent send, and reliable collaborative invalidation/realtime.
7. Implement the worker properly:
   - PostgreSQL leasing with SKIP LOCKED or equivalent;
   - retry/backoff;
   - dead-letter state;
   - idempotent handlers;
   - scheduling and graceful shutdown;
   - queue-age/failure telemetry and kill switches.
8. Implement VIS-003, VIS-007, and VIS-008:
   - collapse Messages context rail at medium widths;
   - preserve a readable thread width;
   - clarify Teams, Rooms, and People;
   - compact Team cards and clarify inherited capabilities.
9. Define and provision production-shaped staging:
   - Web;
   - API;
   - managed PostgreSQL;
   - background worker/scheduler;
   - private object storage if required;
   - secrets and environment validation;
   - telemetry and readiness checks.
10. Extend CI to test DEMO_MODE=false and the deployed topology, including previous-release database upgrades.

Constraints:

- Messages must remain contextual work coordination, not a general Slack replacement.
- Do not imply end-to-end encryption unless it is actually implemented and verified.
- Do not deploy to production; staging provisioning/deployment is allowed only if the current request explicitly authorizes it and credentials are available.
- Preserve unrelated user changes.
- Keep collaboration, worker, visual, and infrastructure commits reviewable.

Required verification:

- Server authorization matrix covers owner/admin/lead/member/guest/viewer, private/team/workspace/direct/external rooms, removed users, and cross-tenant guesses.
- Two browsers exchange messages and membership changes without reload-dependent localStorage events.
- Duplicate message/outbox delivery does not duplicate user-visible effects.
- Worker restart and failure injection prove retry, dead-letter, and recovery behavior.
- Production-shaped staging smoke covers auth, one tenant read/write, Team room, message, outbox processing, and Web rendering.
- Run complete quality, integration, contract, migration, e2e, accessibility, security, and visual gates.

Phase completion gate:

- Teams/Messages are either genuinely persistent and permissioned or absent from release scope.
- Worker effects are idempotent, observable, retryable, and recoverable.
- Staging represents the complete intended runtime, not only the Web demo.
- Production-like CI detects missing route guards, tenant filters, writes, worker processing, or service deployment.

Stop after Phase 4 and provide an evidence-based go/no-go recommendation for closed alpha and Phase 5.
```

---

## Phase 5 — private beta hardening, integrations, privacy, and billing

**Prerequisite:** Closed-alpha gates pass and the core loop shows real usage value.

**Goal:** Add only the external capabilities supported by pilot evidence, then make them secure, observable, reversible, and commercially testable.

```text
Read docs/problem-resolution-audit.md and docs/trevv-release-plan.html completely. Review pilot evidence and the completed Phase 0-4 implementation.

Implement Phase 5 — Private beta hardening only.

Before coding, report which integrations and commercial capabilities are justified by actual pilot evidence. If no evidence exists, implement only the reusable safety/runtime foundations and keep providers disabled.

Required scope:

1. Implement production telemetry and operations:
   - structured redacted logs;
   - cross-service correlation IDs;
   - error tracking and source maps;
   - SLO dashboards and alerts;
   - rate limits and request-size limits;
   - Web/API security headers and CSP rollout;
   - liveness/readiness and outbox-lag/dead-letter health.

2. Implement privacy/data lifecycle:
   - reviewed privacy and terms routes;
   - data inventory and subprocessors;
   - retention policy;
   - organization/user export;
   - deletion and provider revocation;
   - auditable DSAR workflow;
   - noindex/private metadata and correct production canonical URLs.

3. Implement real import/search/files if approved:
   - CSV mapping, validation, dry run, idempotent background job, error report, rollback/archive strategy;
   - spreadsheet-formula neutralization;
   - PostgreSQL permission-filtered full-text/trigram search;
   - tenant-safe private storage, signed TTL downloads, MIME/size checks, malware quarantine, retention/delete.

4. Implement no more than the approved 1-2 initial integrations.
   - OAuth/credentials encrypted at rest;
   - least scopes;
   - webhook signature/replay protection;
   - token refresh/revocation;
   - provider rate-limit/retry/reconciliation;
   - health, reconnect, disconnect, and deletion behavior;
   - explicit approval before external writes.

5. Implement guarded automation/AI:
   - deterministic rules own dates, permissions, thresholds, and evidence;
   - AI may classify, summarize, or draft;
   - cite source records and confidence;
   - require approval for external effects;
   - provide undo, audit, budgets, quotas, per-rule disable, and organization kill switch;
   - measure acceptance, edits, reversals, and cost.

6. Implement billing only after the pricing test is approved:
   - internal plan keys and organization-specific entitlements;
   - provider adapter and hosted checkout/portal;
   - signed idempotent webhooks;
   - trial, grace, dunning, cancellation, downgrade, refund, and read-only behavior;
   - separate deterministic automation and AI usage accounting;
   - no silent overages; export never paywalled;
   - VAT/invoice/Merchant-of-Record responsibilities reviewed appropriately.

7. Complete the remaining alpha/beta visual state work and integration recovery UX.

Constraints:

- Do not implement a broad integration catalog.
- Do not auto-send sensitive content, spend money, publish, delete, change permissions, or make personnel/financial/legal decisions.
- Do not hard-code experimental prices before approval.
- Do not push, merge, enable live billing, migrate production, or deploy without explicit authorization.
- Preserve unrelated user changes.

Required verification:

- Seven-day integration reconciliation soak shows no lost/duplicate events.
- Import fixtures up to 10,000 rows produce deterministic reports and no silent overwrites.
- Search/export/file tests prove tenant isolation.
- Billing clocks/webhook tests cover duplicate, delayed, out-of-order, renewal, failure, cancel, refund, and plan change.
- Automation failure/undo/kill-switch/audit paths pass.
- Security header, rate-limit, CSP, privacy export/delete, backup, and restore drills pass.
- Run complete quality, production-mode integration, e2e, accessibility, security, performance, and visual gates.

Phase completion gate:

- Every external effect is confirmed where needed, idempotent, traceable, recoverable, and disableable.
- Privacy/export/deletion and billing drills pass.
- Pilot evidence supports the implemented integrations and pricing direction.
- No unresolved P0/P1 issue remains for public beta scope.

Stop after Phase 5 and provide an evidence-based go/no-go recommendation for public beta and Phase 6.
```

---

## Phase 6 — public beta and GA readiness

**Prerequisite:** Private-beta retention and reliability targets justify broader access.

**Goal:** Establish measurable production reliability, performance, accessibility, security, support, and recovery evidence.

```text
Read all three planning/audit artifacts completely:

- docs/problem-resolution-audit.md
- docs/visual-improvement-audit.md
- docs/trevv-release-plan.html

Implement Phase 6 — Public beta and GA readiness only.

Required scope:

1. Close every remaining release-scope P0/P1 finding and either close or formally accept/defer every P2/P3 item with owner and date.
2. Implement public signup/trial and the approved Founder/Startup plans only after billing gates pass.
3. Complete cancellation, downgrade, invoices, usage, export, and account deletion UX.
4. Publish reviewed help, onboarding, changelog, status, security, privacy, terms, DPA, and subprocessors information.
5. Complete performance work:
   - route-specific loading/splitting;
   - virtualization/pagination;
   - production RUM;
   - asset/query budgets;
   - reference-volume tests at 100+ Workspaces and 10,000+ items;
   - representative mobile Core Web Vitals.
6. Complete accessibility:
   - fail all unreviewed in-scope WCAG A/AA findings;
   - Chromium and WebKit critical paths;
   - recorded keyboard, VoiceOver/NVDA, 200% zoom, reduced-motion, high-contrast, and touch-target checks.
7. Complete visual-system hardening:
   - Portfolio scope and information-priority hierarchy;
   - responsive Messages/Teams;
   - full loading/error/empty/offline/permission states;
   - current visual regression baselines;
   - pseudolocale and long-content coverage;
   - dark theme and preference persistence.
8. Complete operational evidence:
   - independent security review/penetration test;
   - migration and rollback rehearsal;
   - backup/PITR and restore drill;
   - incident exercise;
   - provider failure/revocation exercise;
   - release manifest and version correlation;
   - support/on-call ownership and response targets.
9. Decide and label native/mobile/desktop and German scope honestly. Web/PWA-only and English-only GA are acceptable if explicitly communicated.
10. Audit every marketing/product claim against actual implementation.

Constraints:

- Do not broaden scope to full CRM, Slack replacement, full email client, accounting, payroll, advanced Gantt, or native parity unless retained paying customers provide clear evidence.
- Do not lower gates simply to meet a date.
- Do not push, merge, migrate production, enable public signup/billing, or deploy without explicit authorization.
- Preserve unrelated user changes.

Required GA evidence:

- No unresolved critical/high security finding.
- 99.9% availability target supported by a measured operating window and staffed response.
- Demonstrated RPO ≤15 minutes and RTO ≤4 hours.
- Representative performance budgets pass.
- Privacy, deletion, export, billing, provider revocation, migration, rollback, restore, and incident drills pass.
- No production-critical demo fallback remains.
- Product metrics meet the agreed release-plan gates, including retained and referenceable paying organizations.

Stop before any production release and present:

- the full go/no-go checklist;
- objective evidence for every gate;
- unresolved accepted risks and owners;
- exact migration/deployment/rollback plan;
- commits and CI results;
- a request for explicit production authorization.
```

---

## Final verification prompt — audit closure

Use this after all intended phases are implemented. This prompt is for verification and reporting, not new feature work.

```text
Perform a fresh, read-only release audit of the current repository and deployed/staging system against:

- docs/problem-resolution-audit.md
- docs/visual-improvement-audit.md
- docs/trevv-release-plan.html

Do not assume a finding is resolved because a commit message says so. Verify behavior from source, tests, database constraints, generated contracts, runtime configuration, browser behavior, and deployed probes.

For every audit ID and release gate, report one of:

- Verified resolved — with direct evidence;
- Partially resolved — with exact remaining work;
- Not resolved;
- Explicitly deferred — with owner, release, and accepted risk;
- No longer applicable — with justification.

Re-run the complete quality, production-mode integration, migration, contract, e2e, accessibility, security, performance, visual, backup/restore, and deployment smoke gates that are available.

Specifically verify:

- real auth and route protection;
- session-to-membership tenant authorization;
- two-tenant IDOR resistance;
- cross-device/restart persistence;
- service-worker/logout privacy;
- Teams/Messages permissions and persistence if in release scope;
- worker retry/idempotency/dead-letter behavior;
- integration reconciliation and revocation;
- billing/entitlement lifecycle if paid;
- privacy/export/delete/retention;
- headers, rate limits, observability, alerting, restore, migration, and rollback;
- visual P0/P1 closure and recorded manual accessibility evidence;
- truthful documentation and marketing claims.

Do not modify, commit, push, merge, or deploy anything. Finish with a strict release recommendation:

- No-go;
- Internal alpha only;
- Closed alpha;
- Private beta;
- Public beta;
- GA-ready.

List the exact reasons and the smallest remaining sequence required to reach the next classification.
```

---

## Optional commit, push, and deploy prompt

Use this only after a phase has passed review and you want Codex to publish it.

```text
Review the completed phase and its acceptance evidence before changing Git or production state.

1. Confirm the working tree contains only the intended reviewed changes.
2. Run the complete relevant verification suite again from the final tree.
3. Create clean conventional commits grouped by logical concern; do not rewrite unrelated history.
4. Push the explicitly named branch only.
5. Wait for every required CI gate and report the exact results.
6. Do not merge unless I explicitly authorize merging in this request.
7. Do not deploy unless I explicitly authorize production deployment in this request.
8. If deployment is authorized, deploy only from the approved branch/commit, run the full smoke plan, report the version, and keep the tested rollback command ready.

Stop immediately if the tree contains unexpected changes, a required gate fails, migration safety is uncertain, secrets are missing, or the deployed artifact would not match the reviewed commit.
```

## Recommended starting point

Copy **Phase 0** first. Do not begin Phase 1 until Phase 0 has been reviewed and its completion gate passes.
