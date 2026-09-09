# TREVV data inventory and subprocessor status

Version: 2026-08-29.1
Legal review: **pending**
DPA and processing-region review: **pending**

This is an engineering inventory for the private-beta foundation. It is not a
reviewed privacy notice, terms document, DPA, or representation that TREVV is
ready to process production customer data.

## Current operating truth

- The publicly hosted fictional-data technical preview uses Cloudflare edge
  infrastructure. Cloudflare is therefore the only infrastructure provider
  evidenced as in use by the current hosted demo. Contract, DPA, residency,
  transfer, and retention review remain pending.
- Managed PostgreSQL, production SMTP, external error tracking, private object
  storage, billing, and product integrations have not been selected or enabled
  for production. Local and production-shaped test adapters do not make their
  vendors subprocessors.
- The preview must not receive real customer content. Its provider integrations,
  billing, file storage, and automated provider revocation remain disabled.
- A submitted privacy request records a review workflow only. It does not mean
  that data was exported, erased, rectified, restricted, or revoked at a
  provider.

## Versioned inventory

The executable catalogue is `privacyDataInventory` in
`packages/db/src/privacy-repositories.ts`. The authenticated privacy endpoint
returns the same version and the tenant's effective retention overrides.

| Category      | Representative records                               | Purpose                                     | Default engineering retention | Default disposition    |
| ------------- | ---------------------------------------------------- | ------------------------------------------- | ----------------------------: | ---------------------- |
| Identity      | Name, email, membership, session references          | Account access, tenant membership, security |                      730 days | Anonymize after review |
| Organization  | Organization profile, Portfolios, Workspace settings | Operate the selected tenant                 |                      730 days | Delete after review    |
| Work          | Work items, decisions, reviews, evidence             | Founder operating workflow and history      |                      730 days | Delete after review    |
| Collaboration | Teams, room membership, messages, reactions          | Authorized work coordination                |                      365 days | Delete after review    |
| Audit         | Security events, mutation journals, request history  | Investigation, proof, and recovery          |                      730 days | Manual review          |
| Operations    | Redacted logs, correlation IDs, delivery attempts    | Secure and operate the service              |                       90 days | Delete                 |
| Integrations  | Connection metadata and webhook hashes               | Reserved; no provider enabled               |                       90 days | Delete                 |
| Billing       | Plan keys, entitlements, billing-event references    | Reserved; live billing disabled             |                    2,555 days | Manual review          |

These are engineering defaults, not a final statutory schedule. A legal hold is
an explicit, versioned organization policy record that every future destructive
privacy processor must enforce; no such processor exists today. These records
do not control the separate per-message expiry workflow. No deletion worker may
infer approval from the passage of time alone.

## Data-subject and organization requests

Durable requests support access, portability, erasure, rectification,
restriction, and objection. They are tenant-scoped, idempotent, versioned, and
journaled with an audit and outbox event in the same transaction. Individual
requests derive the subject from the authenticated user; organization requests
require organization-management authority, and organization erasure requires
owner authority.

Only `submitted`, `under_review`, and cancellation behavior are exposed by the
private-beta foundation. Completion processing is intentionally unavailable
until all of the following are approved and tested:

1. identity re-verification and reviewer authorization;
2. complete export manifest and private, expiring delivery storage;
3. legal-hold and statutory-retention resolution;
4. backup/tombstone behavior and restore drills;
5. provider-specific revocation/deletion adapters and reconciliation;
6. reviewed privacy notice, terms, DPA, subprocessors, and processing regions.

## Superadmin identity and operational records

The separate Superadmin realm adds administrator email, name, optional unverified
contact phone, password hashes, encrypted authenticator material/recovery codes,
passkey public keys and four-hour sessions. These records have no customer
membership mapping. Administrator session IP addresses and browser user agents
are not retained. Operational directories mask customer names/emails by default;
authorised, recently verified operators can reveal an individual contact only
after supplying an audited purpose. No customer task, message or file content is
queried by this realm. No online-presence or behavioural tracking is added.

Superadmin audit history is limited to 180 days, and API maintenance at startup
and hourly while the process is running
deletes older events, expired sessions/verification challenges, and invitations
expired more than 90 days ago. Account records and enrolled factors remain until
the administrator identity is deliberately decommissioned; revocation immediately
disables access and removes sessions without silently deleting audit evidence.
The operator must validate these retention periods, lawful bases and offboarding
procedure for its jurisdiction. Authentication factors and passwords must never
be included in audit reasons. See [the Superadmin design](superadmin-design.md).

A sleeping preview host cannot guarantee wall-clock deletion deadlines. A
production operator must run retention maintenance on an available service or
independent scheduler and monitor its completion.

## Required review before public beta

- Name the controller/operator and privacy contact.
- Review Cloudflare's role, contract, DPA, transfer mechanism, regions, and log
  retention for the exact enabled services.
- Add each selected production database, mail, error-tracking, storage, billing,
  and integration provider only after procurement and configuration evidence.
- Confirm purpose, lawful basis, retention, deletion propagation, breach path,
  DSAR deadlines, and data-location constraints for every category.
- Record an owner and review date for every inventory and subprocessor change.
