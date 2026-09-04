# Phase 6 public-beta and GA readiness

Status: **NO-GO**

Evidence date: 30 August 2026

Decision source: `release/phase6-readiness.json`

## Decision

TREVV is not authorized for public beta, public registration, billing, or production
release. The repository has strong local live-mode and production-shaped CI
foundations, but the Phase 6 prerequisite has not been met: there is no retained
private-beta cohort evidence, remotely operated production-shaped environment,
measured reliability window, reviewed legal package, independent security
review, or restore/incident exercise.

The current diff configures formatting, route/asset performance budgets,
Chromium/WebKit browser gates, and bounded RUM ingestion. The candidate branch
has since exercised those gates in GitHub Actions, and as of 4 September 2026
every required job passed on the head commit. That is still not completed
operating evidence: a branch run is not retained, signed, or bound to a release
manifest, and it exercises no operated remote environment. Local Chromium,
WebKit, and mobile-Chromium execution is directional engineering evidence only.

The production-shaped topology also now carries one validated candidate
release ID and full Git SHA plus the actual service-specific Docker image IDs
through Web, both APIs, and both Workers. Readiness and Worker startup logs
expose that identity, while CI is configured to compare it with the running
containers and the one-shot migration image. This closes a configuration blind
spot. The workflow does now run remotely, but its output is not retained as
immutable release evidence, so it remains short of production evidence.

The only honest release scope today is the hosted fictional-data technical
preview. The intended eventual GA scope is Web/PWA and English only. Mobile,
desktop, German, integrations, private files, AI/external automation, public
registration, trials, and billing remain excluded until separately approved.
Supported registration modes are `closed`, `invite_only`, and `public`.
`invite_only` is the current live default and requires a matching, valid,
unconsumed server-side invitation before account creation; `closed` also blocks
invitee signup. Production configuration rejects `public`.

This document does not waive a gate. The machine-readable register is
authoritative and deliberately causes the release-authorization command to
fail.

Release manifests also fail closed: declared evidence links are not trusted by
shape, and an authorization scope digest is derived from the canonical release
inputs rather than mutable approval fields. Production validation requires an
external verifier to hash every evidence record, confirm the same release ID,
enforce the registered per-kind template semantics rather than trusting a
top-level `PASS`, and validate a completed authorization record against both the
scope and final manifest digests. Claims evidence must match the current claims
inventory digest; independent-security reports and accepted-risk records must be
retrieved and hashed as nested evidence. Authorization records must explicitly
use schema version 1 and `template: false`. The repository CLI has no such
external verifier, so it cannot authorize production by itself.

## Release-scope findings

| Finding | Status   | Owner role                        | Review      | Release interpretation                                                                  |
| ------- | -------- | --------------------------------- | ----------- | --------------------------------------------------------------------------------------- |
| P0-01   | Closed   | Identity and Security             | 30 Sep 2026 | Live auth/onboarding is local; production permits closed or invite-only admission.      |
| P0-02   | Closed   | Identity and Security             | 30 Sep 2026 | Tenant access is server-derived and tested locally.                                     |
| P0-03   | Closed   | Web Product                       | 30 Sep 2026 | Release-scope live workflows use canonical server state.                                |
| P0-04   | Closed   | Data and API                      | 30 Sep 2026 | Durable repositories, concurrency, idempotency, audit, and outbox are implemented.      |
| P0-05   | Open     | Platform Operations               | 15 Sep 2026 | No complete remote production-shaped environment exists.                                |
| P0-06   | Closed   | Collaboration                     | 30 Sep 2026 | Live Teams/Messages are durable and permissioned locally.                               |
| P0-07   | Closed   | Identity and Security             | 30 Sep 2026 | Private app/API data is excluded from shared service-worker caches.                     |
| P0-08   | Closed   | Web Product                       | 30 Sep 2026 | Unsupported effects are disabled or labeled.                                            |
| P0-09   | Partial  | Platform Operations               | 15 Sep 2026 | Format/performance/multi-browser/topology gates are configured but not remotely run.    |
| P0-10   | Closed   | Product Scope                     | 30 Sep 2026 | Current implementation status is documented honestly.                                   |
| P0-11   | Closed   | Web Product                       | 30 Sep 2026 | Preview indexing, canonical, no-store, and noindex behavior is safe.                    |
| P1-01   | Partial  | Platform Operations               | 15 Sep 2026 | Worker core works; deployment supervision and dead-letter operations are absent.        |
| P1-02   | Partial  | Integrations and Data Portability | 30 Sep 2026 | Search filters before LIMIT and has a local 100/10k harness; other scope is absent.     |
| P1-03   | Open     | Commercial and Legal              | 30 Sep 2026 | Billing and the approved pricing lifecycle do not exist.                                |
| P1-04   | Open     | Commercial and Legal              | 15 Sep 2026 | Legal review and privacy effects/export/deletion are incomplete.                        |
| P1-05   | Partial  | Identity and Security             | 15 Sep 2026 | Local RUM ingestion exists; production collection, paging, source maps, and CSP do not. |
| P1-06   | Partial  | Web Product                       | 30 Sep 2026 | Core state UX exists; every release route/state has not produced evidence.              |
| P1-07   | Open     | Platform Operations               | 15 Sep 2026 | No managed restore, incident, remote migration, or rollback evidence exists.            |
| P2-01   | Accepted | Product Scope                     | 30 Nov 2026 | Web/PWA-only GA; native clients remain non-distributed companion foundations.           |
| P2-02   | Accepted | Product Scope                     | 30 Nov 2026 | English-only GA; German is not advertised.                                              |
| P2-03   | Accepted | Product Scope                     | 31 Oct 2026 | Narrow founder loop plus contextual collaboration; broad adjacent suites are excluded.  |
| P2-04   | Deferred | Web Performance                   | 30 Sep 2026 | Budgets/RUM and 100/10k DB harness exist; measured production/browser proof blocks GA.  |
| P2-05   | Deferred | Accessibility                     | 30 Sep 2026 | Local A/AA multi-browser gates ran; manual and remote evidence still blocks GA.         |
| P3-01   | Closed   | Developer Experience              | 31 Oct 2026 | Formatting is normalized and configured before contracts/builds in CI.                  |
| P3-02   | Closed   | Developer Experience              | 31 Oct 2026 | CI runs for every pushed branch and pull request.                                       |
| P3-03   | Deferred | Developer Experience              | 30 Sep 2026 | Moving dependency declarations remain scheduled.                                        |
| P3-04   | Deferred | Developer Experience              | 15 Sep 2026 | GitHub Actions remain on moving major tags.                                             |
| P3-05   | Deferred | Quality Engineering               | 30 Sep 2026 | Browser matrix is configured; coverage and excluded native release evidence remain.     |
| P3-06   | Closed   | Data and API                      | 31 Oct 2026 | Live API integration tests use isolated PostgreSQL state.                               |
| P3-07   | Accepted | Developer Experience              | 15 Dec 2026 | Internal naming is accepted only while no public SDK/developer platform exists.         |

Exact rationale, evidence paths, target dates, and blocker flags live in the
JSON register. Review dates are expirations, not predicted completion dates.

## Required GA evidence

| Gate                       | Objective requirement                                                   | Current evidence                                                                | Decision   |
| -------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------- |
| Critical/high security     | Independent review and retest show zero open critical/high findings     | Dependency audit and internal tests only                                        | Unverified |
| Availability               | At least 99.9% over the approved measured window with staffed response  | Repository alert definitions; no collector or operating window                  | Unverified |
| Recovery                   | Measured RPO ≤15 minutes and RTO ≤4 hours                               | Target runbook only; no managed backup/PITR restore                             | Unverified |
| Migration and rollback     | Immediate previous release upgrades and remains rollback-compatible     | Local migration journal smoke starts from migration 0008                        | Unverified |
| Privacy/export/deletion    | Tenant-safe effects and drills pass                                     | Durable review requests only; live exports/effects unavailable                  | Failed     |
| Legal                      | Reviewed Privacy, Terms, DPA, subprocessors, regions, responsibilities  | Engineering previews and inventory only                                         | Unverified |
| Billing                    | Approved plans and complete clock/webhook/lifecycle drills pass         | Checkout disabled; no approved price/provider                                   | Not built  |
| Provider revocation        | Every enabled provider passes failure/revocation/reconciliation drills  | No provider approved or enabled                                                 | N/A today  |
| Performance                | Asset/query budgets and representative mobile/reference-volume pass     | Budgets/RUM and local 100/10k DB harness configured; no production measurement  | Unverified |
| Accessibility              | All in-scope A/AA plus WebKit and recorded manual matrix pass           | Local multi-browser A/AA ran; remote and recorded manual evidence are absent    | Unverified |
| Public information         | Reviewed help/status/security/legal/support/changelog package published | No reviewed public package exists                                               | Not built  |
| Support/on-call            | Named staffed ownership and response targets exercised                  | No named rotation, escalation, or support destination                           | Unverified |
| Commercial/product metrics | Release-plan retention and referenceable paying-customer gates pass     | No retained pilot or approved measurement evidence                              | Failed     |
| Demo fallback              | No production-critical demo fallback in release artifacts               | Web live paths are separated; desktop still has a demo fallback and is excluded | Unverified |

An unavailable feature is not required to pass a provider or billing drill,
but it must be absent from release artifacts, navigation, offers, environment
configuration, and public claims. Public registration and commercial GA cannot use
that exception because they explicitly require an approved billing lifecycle.

## Governance commands

Validate register structure without claiming release readiness:

```bash
node scripts/phase6-readiness.mjs validate --as-of 2026-08-30
node scripts/phase6-claims.mjs validate --as-of 2026-08-30
```

The authorization commands must currently exit non-zero and print `NO_GO`:

```bash
node scripts/phase6-readiness.mjs authorize --as-of 2026-08-30
node scripts/phase6-claims.mjs authorize --as-of 2026-08-30
```

Run the focused governance tests:

```bash
node --test scripts/phase6-*.test.mjs
```

## What repository work can proceed safely

1. Keep `REGISTRATION_MODE=invite_only` (or deliberately `closed`) and every commercial/provider capability
   fail-closed.
2. Complete remote infrastructure design and active observability without
   sending real customer traffic.
3. Produce an actual previous-release compatibility rehearsal.
4. Implement and test privacy export/deletion only after legal, identity,
   tombstone, backup, and provider-propagation decisions are approved.
5. Execute and close performance/accessibility evidence, then close dependency
   and visual gates; keep the configured formatting gate required.
6. Use the evidence templates under `release/evidence/`; never replace
   `UNVERIFIED` with `PASS` without an immutable artifact.
7. Update the registers in the same reviewed change as the evidence. A prose
   statement alone does not change authorization.

## Authorization boundary

No production authorization is requested by this implementation. Once every
blocking item is closed, all deferrals remain current and owned, every claim is
approved or excluded, the candidate manifest matches the promoted artifact
digests, and the evidence set is immutable, a human production approver must
create a separate explicit authorization record. See
`docs/ga-release-runbook.md`.
