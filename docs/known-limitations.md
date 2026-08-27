# Known limitations

TREVV V1 is intentionally Web-first. The Web/PWA contains the complete demonstration experience; Expo and Tauri are API-connected foundations, not feature-parity clients.

- The polished Web interactions use deterministic seeded domain data and optimistic local state. API persistence endpoints and the PostgreSQL schema are present, but wiring every screen mutation to the repository layer is pilot hardening work.
- Demo mode is enabled by default. Production must disable it and configure Better Auth, database-backed organization membership, and secure client session hand-off.
- Google Drive exposes configuration seams and a safe demo picker. A production OAuth consent verification, token-encryption key, revocation path, quota policy, and webhook checks are still required.
- The unified Email Inbox is a complete interactive demo using seeded messages and browser-local non-secret account metadata. Live Gmail, Microsoft Graph, Yahoo/AOL OAuth-IMAP, iCloud/Zoho/custom IMAP-SMTP synchronization, encrypted credential storage, provider webhooks, MIME sanitization, attachment persistence, and background reconciliation still require deployment credentials and server infrastructure.
- Figma, GitHub, and Canva are safe metadata/smart-link previews, not deep sync integrations.
- Direct uploads, malware scanning, signed download URLs, email delivery, push notifications, and provider webhooks are foundations only.
- Search uses the API’s permission-filtered demo corpus. Production PostgreSQL full-text/trigram ranking and large-board virtualization need realistic-volume tuning.
- The background worker defines idempotent reminder/outbox job boundaries; a production lease loop, scheduler, dead-letter handling, and telemetry adapter remain to be connected.
- No live production database was available in this workspace, so CI is the authoritative clean PostgreSQL migrate/seed gate.
- Desktop packaging/signing and mobile EAS signing require platform credentials unavailable in source control.
- The 2026-08-24 dependency scan reports no current advisory. CI continues to block any non-allowlisted high or critical finding.

These limits are kept explicit so the pilot cannot confuse a safe product demonstration with production operational readiness.
