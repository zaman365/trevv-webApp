# Identity, onboarding, and invitation persistence boundary

This document records the Phase 2 PostgreSQL boundary. Better Auth owns
credentials, verification records, recovery tokens, and sessions. TREVV owns
the application-user mapping, organization selection, onboarding graph,
memberships, and invitations. A request becomes tenant-authorized only after
both halves resolve successfully on the server.

## Identity resolution

`auth_user_mappings` is a one-to-one bridge from Better Auth `user.id` to
`app_users.id`. Application code must construct an `IdentityScope` only from a
validated Better Auth session. Browser-supplied organization IDs, roles, and
resource grants are never an access context.

`app_user_organization_selections` stores the active organization and has a
composite foreign key to `(memberships.organization_id, memberships.user_id)`.
The resolver also requires that membership to be unarchived and undeleted on
every request. A removed member therefore loses access on the next request even
if an older server session or selection row still exists.

The identity resolver has five explicit outcomes:

- `verification_required`: the Better Auth email is not verified;
- `onboarding_required`: the verified identity has no application-user mapping;
- `organization_selection_required`: more than one active membership exists
  and no valid server-owned selection exists;
- `access_unavailable`: a mapped application user has no active membership;
- `active`: application user, selected organization, membership, Portfolio and
  Workspace access, and managed scopes were all loaded from PostgreSQL.

If exactly one active membership exists, the resolver can safely repair a
missing selection. Selecting another organization is a server command that
first verifies the target membership; it is not an authorization override.

The Web normalizes invitation, verification, and reset tokens into short-lived
HttpOnly cookies scoped to their single server action before Client Components
render. Cookie-authenticated mutations bind CSRF validation to the configured
canonical Web origin; when a same-origin privacy policy omits `Origin`, only the
browser-controlled `Sec-Fetch-Site: same-origin` signal is accepted. Conflicting
signals and requests without either signal fail closed.

## Transactional onboarding

`onboarding_progress` is keyed by Better Auth user ID. It stores only the typed,
non-secret onboarding draft: numeric step, organization and Workspace names and
slugs, Workspace type/color, and the selected Blueprint key. The first write is
version 1; the absence of a row is version 0. Later draft writes use optimistic
version checks.

Completion requires a verified identity and a durable idempotency key. One
transaction locks the Better Auth identity and progress row, then creates:

1. the application-user mapping;
2. organization and owner membership;
3. default Portfolio and owner Portfolio grant;
4. first private Workspace and owner Workspace grant;
5. starter Board;
6. Blueprint definition and immutable version;
7. Blueprint instance linking the Board and Workspace;
8. active-organization selection;
9. onboarding completion checkpoint;
10. correlated audit and transactional-outbox records.

Locale (`en`), timezone (`Europe/Berlin`), private visibility, and the Workspace
icon are server-derived defaults rather than trusted client fields. Every
Blueprint choice, including `blank`, creates minimal Board and Blueprint
provenance so the resulting tenant graph has one consistent shape.

The progress row stores the completion request fingerprint and all returned
resource IDs. Repeating the same key and request returns the original IDs;
another key or payload cannot provision a second tenant. Any database failure
rolls back the mapping and complete tenant graph while preserving a draft saved
before the completion attempt.

## Invitation lifecycle

`REGISTRATION_MODE` has three server-enforced values. `invite_only` is the
live default: Better Auth account creation proceeds only when the request has a
short-lived HttpOnly invitation capability whose SHA-256 digest, normalized
email, expiry, revocation, deletion, and acceptance state are validated in
PostgreSQL. `closed` disables all new account creation, including for invited
people. `public` is available only to development/test bootstrap flows and is
rejected by production startup until the public-release gates are explicitly
approved. Client flags, roles, tenant identifiers, and capability labels never
select or bypass the mode.

Invite-only admission is not a check-then-create decision. Better Auth injects
the exact invitation digest into a server-only transient user field, and the
auth-user insert trigger locks the invitation and creates a unique durable
registration claim inside the same PostgreSQL transaction. A concurrent claim,
revocation, deletion, acceptance, or expiry aborts and rolls back auth-user
creation. The transient digest is cleared before commit, acceptance is bound to
the claimed auth identity, and deleting that auth account leaves a tombstoned
claim rather than making the one-time invitation reusable. The header-based
first-owner bootstrap omits this claim and exists only in the validated test
topology.

Credential-link failure rolls the entire Better Auth transaction back. Better
Auth deliberately contains verification-delivery exceptions, so a mail failure
commits the account and invitation claim and attempts to remove the unusable
verification marker. A cleanup fault cannot suppress the request-local failure
signal; any retained marker remains undisclosed and expires independently. The
response explicitly says that the account exists and delivery failed; the Web
flow then opens the verification screen, where resend issues a fresh token.
Resend and password-recovery responses stay identical for existing and unknown
addresses and never claim that external mail was sent. Delivery still runs
while the sign-up transaction and invitation row lock are open. At the current
invite-only volume that is an accepted operational tradeoff, and lock duration
must be monitored before registration volume grows.

Raw invitation tokens are generated outside the repository with at least 256
bits of entropy. Only a SHA-256 digest enters PostgreSQL. Projections, audit
records, outbox events, error messages, and delivery metadata never contain the
raw token or its digest.

An invitation is organization-scoped and versioned. Its supported transitions
are:

```text
pending delivery -> sent | failed
pending/sent/failed -> resend (new digest, new expiry, pending delivery)
pending/sent/failed -> revoked
pending/sent/failed -> accepted once
```

Resend rotates the digest, immediately invalidating every previous token.
Acceptance locks the row and requires all of these conditions:

- the digest exists;
- the invitation is not expired, revoked, deleted, or previously accepted;
- the current Better Auth email is verified;
- the verified email matches the normalized invited email.

The public failure is intentionally non-leaking for all invalid-token states.
Successful acceptance maps or creates exactly one application user, creates or
reactivates the organization membership, marks the invitation accepted by that
user, selects the organization, and writes audit/outbox records in one
transaction. Replaying the token fails.

Invitation email is delivered through the shared mail adapter after the token
row commits. The originating create/resend idempotency record remains pending
through that external delivery window. The delivery transaction atomically
records `sent` or `failed`, stores the final replay body, and completes the
idempotency record. A concurrent duplicate therefore receives a retryable
in-progress response instead of replaying stale `pending` state. A delivery
failure can be recovered through resend without inventing a successful
delivery claim. Case-insensitive active-email uniqueness prevents concurrent
duplicate active invitations in one organization. SMTP remains external to the
database transaction; eliminating a duplicate across the narrow “provider
accepted, finalization failed” window requires provider idempotency or a future
mail-outbox worker.

## Membership removal

Removing a member archives the organization membership and its Portfolio and
Workspace grants, deletes the active selection for that organization, and
emits one `membership.revoked` audit/outbox event in the same transaction. The
outbox event is the cache-invalidation seam. Re-enabling an organization
membership does not silently restore old resource grants; they must be granted
again deliberately. The existing last-owner transaction guard remains in
force.

## Migration compatibility

Migration `0006_wet_spirit.sql` is additive. It does not rewrite Phase 1. It
adds the identity/onboarding tables and invitation lifecycle fields, tenant
composite constraints for Blueprint provenance, and the Better Auth 1.7
`account.issuer` column.

Existing credential accounts are backfilled to `local:credential`; legacy
OAuth providers use `local:oauth:<percent-encoded-provider-id>`. The column is
made non-null only after backfill, then protected by the Better Auth issuer and
account-ID unique index. The invitation token-format constraint is installed
`NOT VALID`: it protects every new or changed row without making an upgrade
fail solely because an older deployment stored a legacy-format digest.

Migration `0007_normalized_app_user_email.sql` adds active, case-insensitive
uniqueness for application-user email addresses. Its preflight aborts before
creating the index if populated legacy data contains a collision; it never
guesses which tenant identity to keep or rewrites user ownership. The
repository independently returns `identity_access_unavailable` when it sees an
ambiguous pre-migration match, so identity claiming remains fail-closed while
an operator resolves the data conflict.

PostgreSQL integration coverage proves clean migration, populated `0005` and
`0006` upgrades, normalized-email collision rejection, restart recovery,
optimistic draft updates, idempotent and concurrent onboarding, full rollback,
token rotation/expiry/revocation/email matching, one-time acceptance,
case-insensitive duplicate rejection, tenant grant removal, and audit/outbox
atomicity.
