# Phase 5 private-beta foundations

Status: reusable safety/runtime foundations implemented locally; public beta
and Phase 6 remain no-go
Evidence review date: 29 August 2026

## Evidence decision

The repository contains product recommendations, example prices, market
benchmarks, and proposed pilot metrics. It does not contain retained pilot
usage, interview records, an approved provider decision, willingness-to-pay
results, or a signed pricing decision.

| Capability                                                 | Evidence decision                                        | Runtime decision                                                                      |
| ---------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Calendar, GitHub, Slack, Drive, email, or another provider | No provider is supported by recorded pilot evidence      | No OAuth, credential, webhook, sync, or provider write is enabled                     |
| CSV import                                                 | No real-data import need or migration cohort is approved | The fictional dry-run remains a demo; no live records are created                     |
| Private files                                              | No approved attachment/file workflow exists              | No upload endpoint or object-storage adapter is enabled                               |
| AI or automated external action                            | No acceptance, reversal, cost, or safety evidence exists | No model call or automated external effect is enabled                                 |
| Paid plans                                                 | Proposed prices are experiments, not an approval         | No price, checkout, payment provider, webhook, or subscription enforcement is enabled |

PostgreSQL tenant-scoped search already supports the founder operating loop.
It is not represented here as a newly approved provider capability; production
full-text/trigram ranking and realistic-volume tuning remain future work.

## Safety rules established in this phase

- Evidence-gated capabilities fail closed until a non-empty evidence record
  bound to the exact capability/provider, named approver, valid approval time,
  runtime configuration, and explicit organization enablement all exist.
- An exhaustive operation catalogue derives each feature and external-effect
  class. Callers cannot relabel a write as effect-free, and approvals cannot be
  replayed across operations.
- Provider writes, sending, publishing, spending, external deletion, and
  permission changes additionally require the organization kill switch to be
  open, an explicit current-user approval, an audit reference, and an
  idempotency key.
- Automation/AI has an explicit bounded usage budget. AI is restricted to
  classification, summarization, and drafting with canonical source IDs and a
  bounded confidence value. Deterministic code retains authority over dates,
  permissions, thresholds, and evidence.
- Personnel, financial, legal, and permission decisions are never delegated to
  an automated suggestion.
- The private-beta foundation entitlement set contains no price and enables no
  billing, private storage, provider, AI, or external-automation entitlement.
- Unconfigured provider adapters fail disconnect requests instead of claiming
  that a credential was revoked.
- CSV output neutralizes spreadsheet-formula prefixes before quoting values.

## Runtime and operator contract

- Production API replicas require `RATE_LIMIT_BACKEND=postgres`, the same
  secret-manager supplied `RATE_LIMIT_HASH_SECRET`, and an explicit
  `TRUSTED_CLIENT_IP_HEADER` that a trusted edge strips and overwrites. The
  process-local memory limiter remains development/test only.
- `ERROR_REPORTING_MODE=external` is fail-closed unless a reporter adapter is
  installed in the application. No external collector, error tracker, source
  map uploader, or retention policy for such a provider has been selected, so
  current runnable environments keep the mode `disabled`.
- `CSP_MODE` and `HSTS_ENABLED` are Web build-time inputs. Local/self-signed
  staging builds use `report-only` and `false`; a runtime environment change
  cannot promote an already-built artifact.
- Worker readiness evaluates sweep staleness, oldest ready work, unsupported
  event age, and dead-letter count through
  `WORKER_READINESS_MAX_STALENESS_MS`,
  `WORKER_READINESS_MAX_READY_AGE_MS`,
  `WORKER_READINESS_MAX_UNSUPPORTED_AGE_MS`, and
  `WORKER_READINESS_MAX_DEAD_LETTERS`.
- Private API/Worker metrics, redacted structured events, Prometheus rules, and
  a Grafana dashboard are repository-owned artifacts only. Scraping, external
  log/error collection, dashboard import, alert routing, named on-call
  ownership, and source-map upload are not provisioned.
- Provider OAuth, live import, private object storage, analytics, billing,
  AI/model access, and automated external effects remain disabled. No provider
  credential or experimental price is part of the runtime contract.

The local production-shaped compose topology builds the Web as a production
artifact, but its API and Worker deliberately use `NODE_ENV=test` to permit the
local PostgreSQL transport and private file mail sink. It therefore validates
service interaction, not production-mode startup or a remote staging system.

## Release boundary

This work does not satisfy the Phase 5 prerequisite by itself. The following
public-beta blockers remain:

- remote production-shaped staging with trusted TLS, private networking,
  production-mode API/Worker startup, managed PostgreSQL, authenticated mail,
  and controlled secret injection;
- an exercised backup/restore and rollback procedure;
- provisioned metrics/log/error collection, source maps, dashboard import,
  missing-target and service alerts, routed test pages, and named responders;
- reviewed dead-letter inspection/redrive and incident procedures;
- a nonce/hash CSP that removes `unsafe-inline` before enforcing the policy;
- approved privacy/terms, subprocessors and retention decisions, plus completed
  export, deletion, provider-revocation, DSAR, and backup-lifecycle drills;
- real pilot-value evidence for any provider, file, import, automation/AI, or
  commercial capability; and
- an approved pricing test before any plan price, checkout, payment webhook,
  entitlement enforcement, or billing-clock test exists.

Provider reconciliation soak tests and billing webhook-clock tests are not
applicable until a provider or pricing experiment is explicitly approved and
implemented. Their absence is a scope decision, not passing evidence.

No production deployment, production migration, provider connection, payment
activation, or external automated action is authorized by this document.

**Recommendation: NO-GO for public beta and Phase 6.** Reassess only after the
blockers above have objective remote evidence and no unresolved P0/P1 issue
remains in the intended release scope.
