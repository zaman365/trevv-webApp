# Known limitations

TREVV is currently a fictional-data technical preview. It is intentionally Web-first: the Web/PWA contains the complete interactive demonstration, while Expo and Tauri are foundations rather than feature-parity clients. Do not use real credentials, confidential information, customer data, or the preview as evidence that an external action occurred.

- The polished Web interactions use deterministic seeded domain data and browser-local state. Tenant-scoped PostgreSQL repositories and a live API adapter now exist and are integration-tested, but the principal Web screens are not connected to them yet.
- Demo/live API mode must be selected explicitly. The hosted preview and example environment use fictional demo mode. Web sign-in, sign-up, and onboarding do not authenticate or provision an application user; they only open the fictional sample experience. Live mode assumes a Better Auth user ID already maps to an `app_users` membership, which Phase 2 must provision safely.
- Google Drive exposes configuration seams and a safe demo picker. A production OAuth consent verification, token-encryption key, revocation path, quota policy, and webhook checks are still required.
- The unified Email Inbox is a complete interactive demo using seeded messages and browser-local non-secret account metadata. Live Gmail, Microsoft Graph, Yahoo/AOL OAuth-IMAP, iCloud/Zoho/custom IMAP-SMTP synchronization, encrypted credential storage, provider webhooks, MIME sanitization, attachment persistence, and background reconciliation still require deployment credentials and server infrastructure.
- Teams, invitations, inherited features, Messages, reviews, Workspace updates, Waiting follow-ups, security/session settings, and notification state are browser-local previews. They grant no access, deliver nothing, and do not update another user or device.
- Import is a fictional dry-run walkthrough and creates no records. Browser-generated downloads contain sample/local data and are not complete permission-checked organization exports.
- Figma, GitHub, and Canva are safe metadata/smart-link previews, not deep sync integrations.
- Direct uploads, malware scanning, signed download URLs, email delivery, push notifications, and provider webhooks are foundations only.
- Web search filters the fictional browser/demo corpus and does not enforce a server tenant boundary. The live API search is organization- and membership-scoped, but production PostgreSQL full-text/trigram ranking and realistic-volume tuning still require implementation.
- The background worker defines idempotent reminder/outbox job boundaries; a production lease loop, scheduler, dead-letter handling, and telemetry adapter remain to be connected.
- PostgreSQL 17 clean migration, populated-schema upgrade, restart, multi-tenant, concurrency, idempotency, rollback, and audit/outbox tests pass locally. No production database was accessed or migrated, and the live API topology is not deployed.
- Desktop packaging/signing and mobile EAS signing require platform credentials unavailable in source control.
- The 2026-08-29 dependency scan reports no current advisory. CI continues to block any non-allowlisted high or critical finding.

These limits are kept explicit so the pilot cannot confuse a safe product demonstration with production operational readiness.

The maintainable UI source of truth is `apps/web/lib/product-capabilities.ts`. Promote a capability to `live` only in the same change that adds its authoritative server operation, authorization, durable storage, failure handling, production-mode test, and matching documentation.
