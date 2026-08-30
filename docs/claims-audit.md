# TREVV marketing and product claims audit

Status: **NO-GO for public marketing claims**

Machine-readable source: `release/marketing-claims.json`

Review date: 30 August 2026

## Rule

A source-code feature, local test, schema table, dashboard definition, or
planning recommendation is not by itself a public claim. A claim is approved
only for the exact scope, limitation, evidence, owner role, and review date in
the inventory. Draft or prohibited claims may not appear in marketing, sales,
contracts, status, support, pricing, metadata, manifests, screenshots, or
product success messages.

The inventory currently declares `NO_GO` because several broad claims remain
draft or prohibited and because their underlying GA evidence does not exist.
The validator owns a canonical set of public source files and forbidden-wording
patterns. The mutable inventory must match that reviewed policy exactly, so
removing a file, category, or pattern from the JSON cannot weaken the crawl.
Adding a new public surface or prohibited/draft claim requires updating the
validator policy and its regression tests in the same review.

## Claims that must remain visible

- The hosted experience is a fictional-data technical preview.
- No production provider integration is connected.
- Billing, trials, checkout, invoices, and paid plans are disabled.
- Registration defaults to server-validated `invite_only`; `closed` disables
  even invitee signup, and production rejects `public` registration.
- Privacy and Terms are engineering previews pending qualified review.
- The intended GA client scope is Web/PWA only.
- The intended GA language scope is English only.

These are required disclosures, not negative marketing copy. They prevent a
visitor from inferring durable, external, commercial, legal, native, or
localized capabilities that are absent.

## Claims allowed only in scoped engineering contexts

- Configured `DEMO_MODE=false` founder-loop changes are canonical and
  server-saved.
- Email/password identity flows work in configured live-mode test environments.
- Teams and contextual Messages are durable and permissioned in the live-mode
  topology.

None of these statements means the hosted demo is a production service, that a
managed backup exists, or that public support/availability/security/privacy
promises have been met.

## Claims prohibited until evidence changes

- 99.9% availability or an active production SLO;
- GDPR compliance, certification, independent security, or penetration-test
  completion;
- end-to-end encrypted Messages;
- autonomous AI that runs the company or performs external actions;
- offline private data or queued private writes;
- public registration, no-card trial, Founder plan, or Startup plan availability;
- sub-two-second Portfolio performance at production reference volume;
- complete export, account deletion, retention enforcement, or provider
  revocation;
- absence of every production-critical demo fallback.

The phrases “Everything you run. One clear view.” and “founder operating
system” were removed from public metadata, the PWA manifest, and authentication
copy. They remain only as unapproved governance drafts and require a
supported-scope qualifier, usability evidence, and retained-customer validation
before any future public use.

## Review workflow

1. Locate the exact claim in `release/marketing-claims.json`.
2. Attach immutable implementation, operating, customer, legal, or independent
   review evidence appropriate to that claim.
3. Narrow the scope and document limitations; never widen a test result into a
   product-wide promise.
4. Assign an accountable owner role and future review date.
5. Mark public use only when status is `approved_scoped` or
   `required_disclosure`.
6. Update UI/metadata/docs and the inventory in the same reviewed change.
7. Run:

   ```bash
   node scripts/phase6-claims.mjs validate
   node scripts/phase6-claims.mjs authorize
   ```

The second command must continue to fail until every blocking claim is approved
or removed from release scope and the inventory decision is explicitly changed
through review.

## Audit boundaries

- The inventory records known product and marketing claims; it is not legal
  advice or a substitute for a complete pre-release content crawl.
- Public pricing and competitor comparisons must be revalidated at publication
  time.
- Status and availability claims must derive from external measurement, not an
  application process reporting itself healthy.
- Security and compliance language requires independent/qualified review where
  applicable.
- Customer retention, time saved, activation, and reference claims require
  retained source evidence and consent; planning targets cannot be presented as
  outcomes.
