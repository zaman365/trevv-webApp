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
