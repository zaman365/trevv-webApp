# TREVV Superadmin

## Product design

A separate `/superadmin` entrance and identity realm, outside the workspace
shell. The visual direction is a quiet operations desk: dark ink navigation,
white working surfaces, blue actions, compact readable tables, and clear
permission and security status. No link is added to ordinary tenant navigation.
The existing `/app/system/admin` console remains available to its existing owner.

The first screen shows organisation, account, invitation and session totals.
Navigation contains Overview, Organisations, People, Invitations, Administrators,
Audit and Security. Lists use server pagination; empty, loading, denied and
delivery-failure states are explicit. Forms collect only the fields needed for
the action. Organisation creation invites its first owner without making the
platform administrator a tenant member. Existing invitation acceptance,
verification and tenant permissions continue to apply.

## Identity and access

- Separate administrator users, credentials, sessions, verification records,
  second factors and passkeys. A TREVV session or tenant role cannot grant access.
- Initial owner invitation: `zaman.ase365@gmail.com`. This is a reserved invitation,
  not an email comparison that elevates an ordinary account. Activation requires
  possession of a short-lived, single-use emailed invitation and factor setup.
- Password plus authenticator verification, recovery codes, and passkeys with
  user verification. An optional contact phone number is explicitly unverified;
  it cannot authenticate or recover the account without a separately provisioned
  verification service.
- Owner can invite additional owners, operators and auditors and revoke access.
  Operators manage organisations and invitations; auditors can inspect operational
  summaries and audit history. Only owners administer platform identities.
  The final active owner cannot be revoked or demoted.
- Short-lived, host-only administrator cookies; database-backed checks on every
  request, no cookie-cached permissions, and explicit recent authentication for
  sensitive changes. Revocation also removes all administrator sessions.
- Public self-registration, customer impersonation, arbitrary tenant data
  browsing and blanket content export are not added.

## Privacy and accountability

Monitoring means account and organisation administration, not surveillance.
No messages, tasks, files, passwords, tokens, session IP addresses, browser
fingerprints or page-level behaviour are returned by the administration API.
Session totals mean unexpired sessions, not people currently online. Contact
details are masked by default; an authorised operator must give a reason to
reveal an individual account's contact details, and the server audits that read.
Actions record actor, action, target identifier, time and a bounded reason,
without recording invitation secrets, authentication secrets or customer content.
Audit records have a defined retention period and a maintenance procedure.
Cleanup runs on API startup and hourly while running. A sleeping preview host
needs an independent scheduled maintenance service before it can promise a
wall-clock deletion deadline.

These controls implement data minimisation, purpose limitation, access control
and accountability. They do not certify compliance with every jurisdiction.
TREVV must separately establish its lawful bases, privacy notice, controller and
processor obligations, retention decisions, data-subject request procedure,
international transfer safeguards and any required impact assessment before
processing customer data. Existing privacy-request capabilities remain intact.

Sources checked 2026-09-09:

- [GDPR, especially Articles 5, 25 and 32](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679)
- [EDPB basic principles](https://www.edpb.europa.eu/topics/key-gdpr-concepts/basic-principles_en)
- [EDPB privacy by design and default](https://www.edpb.europa.eu/topics/ai-and-technology/privacy-by-design-and-by-default_en)
- [Better Auth two-factor authentication](https://better-auth.com/docs/plugins/2fa)
- [Better Auth custom authentication tables](https://better-auth.com/docs/concepts/database)

## Validation and release

Verify database admission and concurrency, tenant/admin cookie isolation,
mandatory factor setup, revoked access, last-owner protection, organisation-owner
invitation acceptance, masking, audit recording, CSRF and rate limits. Run the
existing account/platform regression suites and compile Web, API and database
packages. Deploy compatible API and Web artifacts with the additive database
migration before enabling the initial invitation. The owner must enroll their
own factors; no password or recovery secret is generated into this document.

## Operator activation

1. Apply the additive `0022_smooth_virginia_dare.sql` migration, including its
   atomic invitation-admission and final-owner protection triggers.
2. Deploy API and Web from the same validated release. Use the existing
   PostgreSQL/API/Cloudflare topology. A Web-only publish is insufficient.
3. Set API `SUPERADMIN_ENABLED=true` and set a fresh random
   `SUPERADMIN_AUTH_SECRET` of at least 32 characters, distinct from the customer
   `BETTER_AUTH_SECRET`. Keep it in the service secret manager, never in Web vars.
   The first `WEB_ORIGIN` is the sole administrator origin and passkey relying
   party. For production access it must be `https://trevv.de`.
   Alpha uses the same release and redirects its Superadmin pages to this
   canonical address; ordinary alpha customer sessions remain host-only.
4. Run the API artifact's `superadmin:bootstrap` command. It sends an invitation
   only to `zaman.ase365@gmail.com` and never prints the activation token. It
   refuses once an administrator exists. A failed initial delivery may be
   retried before activation; the previous invitation is revoked atomically.
5. The owner opens the email, chooses a separate administrator password, signs
   in at `/superadmin/sign-in`, scans the authenticator QR code and saves the
   recovery codes. The console remains inaccessible until a factor is verified.
   Passkeys and the optional contact phone are configured in My security.
6. Verify audit retention maintenance and mail-delivery reporting. Administrators
   should use the invitation controls for subsequent grants. Operator/auditor
   assignments never confer customer workspace membership.

Roll back by disabling the new API realm and restoring the prior compatible Web
and API artifacts. Keep the additive tables and migration history; do not delete
the administrator identities, audit evidence or any customer data as rollback.
The predecessor owner console and customer authentication remain independent.

## Organisation profiles and operational follow-up

Each organisation row opens `/superadmin/organizations/:id`. The original
creation, owner invitation, directories and predecessor admin remain available.
The profile shows member, owner and workspace totals, pending invitations and
delivery failures, language, time zone, creation date and stable organisation ID.
Business metadata includes legal name, website, industry, country/region and city.
Operators can record an onboarding/established/needs-review stage, support priority
and next review date. These are follow-up metadata; they do not suspend accounts,
change tenant roles or represent a billing entitlement. Review dates use UTC.

Up to twelve business contacts can be maintained, with primary, billing,
technical, security or other responsibilities. A database uniqueness constraint
allows only one primary contact per organisation. Each contact has a name, job
title, email and optional international phone number. The creation form can save
the first owner's contact details alongside the existing invitation. Adding or
editing a business contact alone sends no email and confers no membership or
administrator access. Existing tenant account details are not copied implicitly.

Profiles and contacts use two additive private tables from migration
`0023_bored_jackal`; tenant snapshots and normal customer APIs never include them.
Contact names, email addresses, phone numbers and job titles remain masked in
all routine reads. Revealing one contact requires an operator/owner, verification
within ten minutes and a purpose recorded before disclosure. The browser clears
revealed details and unsaved edits after one minute, on closing the dialog or
when leaving its tab. Auditors cannot reveal or mutate contacts. Contact removal
physically removes its saved details; audit retains the action and purpose, not a
copy of those details. Existing audit retention and governance requirements apply.

Profile and contact updates require the version the operator read. Stale updates
or removals return a conflict instead of overwriting later changes. Organisation
row locks serialize contact capacity checks; database constraints protect primary
contact uniqueness. The website permits HTTP(S) only, dates and international
phone numbers are validated, and all mutation schemas reject unknown fields.

The overview links directly to organisations missing contacts or owners, reviews
due, failed pending invitations and unverified accounts. Each directory provides
server-side filters before pagination. People and invitations can be scoped to an
organisation; people search still matches account IDs only. Invitation rows expose
expiry, send attempts and last-sent time. Administrator rows show passkey/session
totals and enrollment; the security screen shows session expiry and verification
freshness. Retained sign-in timestamps come from existing session records and are
not a complete login history or an online-presence indicator. The audit directory
can separate changes, protected contact access and summary views, and links
organisation actions back to the profile.

Regression coverage exercises the real administrator authentication and database:
masked reads, owner/operator boundaries, auditor denial, stale MFA, optimistic
concurrency, contact capacity and primary uniqueness, organisation isolation,
contact removal, filter correctness, preserved first-owner invitation acceptance,
proxy cookie separation and alpha redirects for the nested routes.
